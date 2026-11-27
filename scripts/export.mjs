import { createServer } from 'node:http';
import { readFile, realpath, stat, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { marked } from 'marked';
import { validateLayout, layoutDefaults, layoutOptions, articleThemes, accentPresets, codeThemes, fontFamilies } from '../layout.js';

const root = fileURLToPath(new URL('../', import.meta.url));
let server;
let browser;
let temporary;
try {
  const { values } = parseArgs({ options: {
    'list-styles': { type: 'boolean' }, input: { type: 'string' }, config: { type: 'string' }, output: { type: 'string' }, title: { type: 'string' },
  } });
  if (values['list-styles']) {
    process.stdout.write(`${JSON.stringify({ ok: true, defaults: layoutDefaults, options: layoutOptions, themes: articleThemes, colors: accentPresets, codeThemes, fonts: fontFamilies })}\n`);
    process.exit(0);
  }
  if (!values.input || !values.output || !/\.docx$/i.test(values.output)) throw new Error('用法：node scripts/export.mjs --input article.md --config layout.json --output article.docx [--title 标题]');
  const input = await realpath(values.input);
  const base = path.dirname(input);
  if ((await stat(input)).size > 2 * 1024 * 1024) throw new Error('Markdown 超过 2 MB');
  const config = validateLayout(values.config ? JSON.parse(await readFile(values.config, 'utf8')) : {});
  const images = {};
  const tokens = marked.lexer(await readFile(input, 'utf8'), { gfm: true });
  await Promise.all(marked.walkTokens(tokens, async (token) => {
    if (token.type !== 'image') return;
    if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(token.href)) return;
    if (/^[a-z][a-z\d+.-]*:|^[/\\]/i.test(token.href)) throw new Error('AI 导出仅支持正文目录内的相对图片路径或内嵌图片');
    const image = await realpath(path.resolve(base, decodeURIComponent(token.href)));
    const relative = path.relative(base, image);
    if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('图片路径不能超出正文所在目录');
    const mime = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp', '.gif': 'gif' }[path.extname(image).toLowerCase()];
    if (!mime || (await stat(image)).size > 5 * 1024 * 1024) throw new Error('图片格式无效或超过 5 MB');
    const id = `local-image:${randomUUID()}`;
    images[id] = `data:image/${mime};base64,${(await readFile(image)).toString('base64')}`;
    token.href = id;
  }));
  const markdown = marked.parser(tokens);
  const allowed = new Set(['index.html', 'app.js', 'layout.js', 'style.css', 'docx-export.js', 'sample.md',
    'node_modules/marked/lib/marked.esm.js', 'node_modules/dompurify/dist/purify.es.mjs',
    'node_modules/docx/dist/index.mjs', 'node_modules/docx/dist/html.mjs', 'node_modules/docx/dist/math.mjs']);
  server = createServer(async (req, res) => {
    try {
      const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
      if (!allowed.has(name)) { res.writeHead(404).end(); return; }
      const mime = name.endsWith('.html') ? 'text/html' : /\.m?js$/.test(name) ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/plain';
      res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` });
      res.end(await readFile(path.join(root, name)));
    } catch { res.writeHead(500).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  // AI 输入不触发外网请求；远程图片和未处理的 HTML 图片会明确导出失败。
  await page.route('**/*', (route) => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
  await page.goto(origin);
  await page.waitForFunction(() => window.paperLabReady === true);
  const title = values.title ?? path.basename(input, path.extname(input));
  await page.evaluate((article) => window.paperLab.load(article), { markdown, title, config, images });
  const bytes = await page.evaluate(async () => {
    const blob = await window.paperLab.exportDocx();
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const output = path.resolve(values.output);
  await mkdir(path.dirname(output), { recursive: true });
  const staging = `${output}.${randomUUID()}.tmp`;
  await writeFile(staging, new Uint8Array(bytes), { flag: 'wx' });
  temporary = staging;
  await rename(temporary, output);
  temporary = undefined;
  process.stdout.write(`${JSON.stringify({ ok: true, output, bytes: bytes.length, config })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exitCode = 1;
} finally {
  if (temporary) await rm(temporary, { force: true });
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}
