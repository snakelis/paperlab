import { articleThemes, accentPresets, codeThemes, validateLayout } from '../layout.js';
import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile, execFileSync } from 'node:child_process';

async function imageFile(page, name = '配图.png', color = '#087f74', mimeType = 'image/png') {
  const data = await page.evaluate(({ color, mimeType }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#edf4ef';
    ctx.fillRect(0, 0, 600, 240);
    ctx.fillStyle = color;
    ctx.fillRect(30, 30, 540, 180);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('币在链上，钥匙在你手里', 80, 105);
    ctx.font = '20px sans-serif';
    ctx.fillText('区块链账本  →  地址  ←  私钥 / 助记词', 80, 150);
    return canvas.toDataURL(mimeType).split(',')[1];
  }, { color, mimeType });
  return { name, mimeType, buffer: Buffer.from(data, 'base64') };
}

function inspectDocx(path) {
  return JSON.parse(execFileSync('python3', ['-c', `
import json,sys,struct,zipfile,xml.etree.ElementTree as E
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','r':'http://schemas.openxmlformats.org/package/2006/relationships'}
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 root=E.fromstring(z.read('word/document.xml'))
 rel=E.fromstring(z.read('word/_rels/document.xml.rels'))
 val='{'+ns['w']+'}val'
 media=[n for n in z.namelist() if n.startswith('word/media/') and not n.endswith('/')]
 print(json.dumps({'text':''.join(t.text or '' for t in root.findall('.//w:t',ns)), 'colors':[n.get(val) for n in root.findall('.//w:color',ns)], 'sizes':[n.get(val) for n in root.findall('.//w:sz',ns)], 'headings':[n.get(val) for n in root.findall('.//w:pStyle',ns)], 'tables':len(root.findall('.//w:tbl',ns)), 'rows':len(root.findall('.//w:tr',ns)), 'images':len(root.findall('.//a:blip',ns)), 'media':media, 'mediaDimensions':[list(struct.unpack('>II',z.read(n)[16:24])) for n in media if n.endswith('.png')], 'externalImages':[n.get('Target') for n in rel if n.get('Type','').endswith('/image') and n.get('TargetMode')=='External'], 'indents':[n.attrib for n in root.findall('.//w:ind',ns)], 'fonts':[n.attrib for n in root.findall('.//w:rFonts',ns)], 'fills':[n.get('{'+ns['w']+'}fill') for n in root.findall('.//w:shd',ns)], 'altChunk':len(root.findall('.//w:altChunk',ns))},ensure_ascii=False))
`, path], { encoding: 'utf8' }));
}

async function loaded(page) {
  await page.goto('/');
  await expect(page.locator('#preview h2')).toHaveCount(6);
}

test('用户全文保留，标题、引用、表格、步骤和自查清单正确渲染', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await loaded(page);
  const sample = await readFile(new URL('../sample.md', import.meta.url), 'utf8');
  await expect(page.locator('#editor')).toHaveValue(sample);
  await expect(page.locator('#preview h1')).toHaveCount(1);
  await expect(page.locator('#preview h3')).toHaveText('看完先做一次自查');
  await expect(page.locator('#preview table tbody tr')).toHaveCount(3);
  await expect(page.locator('#preview ol li')).toHaveCount(8);
  await expect(page.locator('#preview ul li')).toHaveCount(5);
  await expect(page.locator('#preview blockquote')).toHaveCount(7);
  expect(errors).toEqual([]);
});

test('主题、字号、颜色、行间距和草稿刷新后保留', async ({ page }) => {
  await loaded(page);
  await page.locator('[data-theme="editorial"].theme-card').click();
  await page.getByRole('tab', { name: '版式与细节' }).click();
  await page.locator('#font-size').fill('18');
  await page.getByRole('tab', { name: '主题与色彩' }).click();
  await page.locator('#accent').fill('#713b77');
  await page.getByRole('tab', { name: '版式与细节' }).click();
  await page.locator('#line-height').selectOption('2.1');
  await page.locator('#preview-width').selectOption('480');
  await page.locator('#title').fill('我的排版样稿');
  await page.locator('#editor').fill('## 修改后的正文\n\n**强调内容**');
  await expect(page.locator('#preview h2')).toHaveCount(1);
  await expect(page.locator('#preview h2')).toHaveText('修改后的正文');
  await page.reload();
  await expect(page.locator('#preview')).toHaveAttribute('data-theme', 'editorial');
  await expect(page.locator('#preview')).toHaveCSS('font-size', '18px');
  await expect(page.locator('#preview h2')).toHaveCSS('color', 'rgb(113, 59, 119)');
  await expect(page.locator('#preview')).toHaveCSS('line-height', '37.8px');
  await expect(page.locator('#title')).toHaveValue('我的排版样稿');
  await expect(page.locator('#preview-size')).toHaveText('480 px');
});

test('Markdown 导入导出正文往返一致，恢复示例先确认', async ({ page }) => {
  await loaded(page);
  page.on('dialog', (dialog) => dialog.accept());
  const markdown = '## 导入测试\n\n| 名称 | 内容 |\n| --- | --- |\n| 钱包 | 钥匙 |\n';
  await page.locator('#import-file').setInputFiles({ name: '自定义文稿.md', mimeType: 'text/markdown', buffer: Buffer.from(markdown) });
  await expect(page.locator('#preview h2')).toHaveText('导入测试');
  await expect(page.locator('#title')).toHaveValue('自定义文稿');
  const waiting = page.waitForEvent('download');
  await page.locator('#download-markdown').click();
  const download = await waiting;
  expect(download.suggestedFilename()).toBe('自定义文稿.md');
  expect(await readFile(await download.path(), 'utf8')).toBe(markdown);
  await page.locator('#sample-button').click();
  await expect(page.locator('#preview h2')).toHaveCount(6);
});

test('HTML 带内联样式，离开编辑器后颜色、表格和全文仍可阅读', async ({ page, context }) => {
  await loaded(page);
  await page.locator('[data-theme="technical"].theme-card').click();
  await page.locator('#accent').fill('#426da8');
  const waiting = page.waitForEvent('download');
  await page.locator('#download-html').click();
  const download = await waiting;
  const html = await readFile(await download.path(), 'utf8');
  expect(html).not.toMatch(/<script|<link|class=|id="preview"|var\(--|--accent/);
  expect(html).toContain('color: rgb(66, 109, 168)');
  const standalone = await context.newPage();
  await standalone.setContent(html);
  await expect(standalone.locator('h2')).toHaveCount(6);
  await expect(standalone.locator('h2').first()).toHaveCSS('color', 'rgb(66, 109, 168)');
  await expect(standalone.locator('table')).toHaveCSS('width', '680px');
  await expect(standalone.locator('td').first()).toHaveCSS('border-top-width', '1px');
  await expect(standalone.locator('body')).toContainText('最后收个尾');
  await standalone.close();
});

test('公众号复制实际写入 HTML 与纯文本两种剪贴板格式', async ({ page }) => {
  await loaded(page);
  await page.locator('#copy').click();
  await expect(page.locator('#status')).toContainText('已复制排版后的文章');
  const contents = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const item = items[0];
    return {
      types: item.types,
      html: await (await item.getType('text/html')).text(),
      text: await (await item.getType('text/plain')).text(),
    };
  });
  expect(contents.types).toEqual(expect.arrayContaining(['text/html', 'text/plain']));
  expect(contents.html).toContain('border-collapse: collapse');
  expect(contents.html).not.toContain('class="article"');
  expect(contents.text).toContain('钱包里没有币');
  expect(contents.text).not.toContain('排版设置');
});

test('不可信 Markdown 的脚本、事件、危险链接和嵌入页面被过滤', async ({ page }) => {
  await loaded(page);
  await page.route('**/invalid-image', (route) => route.fulfill({ status: 404, body: '' }));
  await page.locator('#editor').fill('## 安全文稿\n\n<script>window.injected=1</script>\n<img src="/invalid-image" onerror="window.injected=2">\n<a href="javascript:window.injected=3">危险链接</a>\n<iframe srcdoc="<script>parent.injected=4</script>"></iframe>\n<style>body{display:none}</style>\n\n[安全参考](https://example.com/reference)');
  await expect(page.locator('#preview h2')).toHaveCount(1);
  await expect(page.locator('#preview h2')).toHaveText('安全文稿');
  expect(await page.locator('#preview script, #preview iframe, #preview style, #preview [onerror], #preview [href^="javascript:"]').count()).toBe(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  await expect(page.locator('.references')).toContainText('https://example.com/reference');
  await page.getByRole('tab', { name: '版式与细节' }).click();
  await page.locator('#footnotes').uncheck();
  await expect(page.locator('#preview a[href="https://example.com/reference"]')).toHaveAttribute('rel', 'noopener noreferrer');
});

test('图片可本地嵌入，非法文件和覆盖取消不改变正文', async ({ page }) => {
  await loaded(page);
  const original = await page.locator('#editor').inputValue();
  await page.locator('#import-file').setInputFiles({ name: 'wrong.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('wrong format') });
  await expect(page.locator('#status')).toContainText('请导入');
  await expect(page.locator('#editor')).toHaveValue(original);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#import-file').setInputFiles({ name: 'new.md', mimeType: 'text/markdown', buffer: Buffer.from('替代正文') });
  await expect(page.locator('#editor')).toHaveValue(original);
  await page.locator('#image-file').setInputFiles(await imageFile(page));
  await expect(page.locator('#preview img')).toHaveAttribute('src', /^data:image\/png;base64,/);
});

test('完整样稿导出真正 DOCX，文字、颜色、字号、标题和表格均在文档内', async ({ page }) => {
  await loaded(page);
  await page.locator('#accent').fill('#713b77');
  await page.getByRole('tab', { name: '版式与细节' }).click();
  await page.locator('#font-size').fill('18');
  const previewText = await page.locator('#preview').innerText();
  const waiting = page.waitForEvent('download');
  await page.locator('#download-docx').click();
  const download = await waiting;
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
  const doc = inspectDocx(await download.path());
  expect(doc.text.replace(/\s/g, '')).toBe(previewText.replace(/\s/g, ''));
  expect(doc.headings.filter((style) => style === 'Heading2')).toHaveLength(6);
  expect(doc.tables).toBe(1);
  expect(doc.rows).toBe(4);
  expect(doc.colors.map((color) => color.toUpperCase())).toContain('713B77');
  expect(doc.sizes).toContain('27');
  expect(doc.altChunk).toBe(0);
  await expect(page.locator('#status')).toContainText('Word 已导出');
});

test('多张图片与 WebP 可预览，DOCX 嵌入图像而非外链', async ({ page }) => {
  await loaded(page);
  await page.locator('#editor').evaluate((element) => { element.setSelectionRange(0, 0); });
  await page.locator('#image-file').setInputFiles([
    await imageFile(page, '第一张.png'),
    await imageFile(page, '第二张.webp', '#426da8', 'image/webp'),
  ]);
  await expect(page.locator('#preview img')).toHaveCount(2);
  expect(await page.locator('#editor').inputValue()).not.toContain('base64,');
  const source = await page.locator('#editor').inputValue();
  await page.locator('#editor').fill(source.replace(/!\[[^\]]*\]\(local-image:[\da-f-]+\)/gi, ''));
  await expect(page.locator('#preview img')).toHaveCount(0);
  await page.locator('#editor').fill(source);
  await expect(page.locator('#preview img')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('#preview img')).toHaveCount(2);
  await expect(page.locator('#preview img').nth(1)).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect.poll(() => page.locator('#preview img').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  const waiting = page.waitForEvent('download');
  await page.locator('#download-docx').click();
  const download = await waiting;
  const doc = inspectDocx(await download.path());
  expect(doc.images).toBe(2);
  expect(doc.media).toHaveLength(2);
  expect(doc.mediaDimensions).toEqual([[600, 240], [600, 240]]);
  expect(doc.externalImages).toEqual([]);
  expect(doc.text).toContain('最后收个尾');
  await download.saveAs('artifacts/wallet-with-images.docx');
  await page.locator('#preview img').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/with-images.png', fullPage: true });
  const markdownWaiting = page.waitForEvent('download');
  await page.locator('#download-markdown').click();
  const markdownFile = await markdownWaiting;
  const portable = await readFile(await markdownFile.path(), 'utf8');
  expect(portable).toContain('data:image/png;base64,');
  expect(portable).not.toContain('local-image:');
});

test('预览中的失效远程图片阻止 Word 导出，不静默漏图', async ({ page }) => {
  await loaded(page);
  await page.route('**/missing-photo.png', (route) => route.fulfill({ status: 404, body: '' }));
  await page.locator('#editor').fill('## 图片测试\n\n![不可读取的配图](/missing-photo.png)');
  await expect(page.locator('#preview img')).toHaveCount(1);
  const downloads = [];
  page.on('download', (download) => downloads.push(download));
  await page.locator('#download-docx').click();
  await expect(page.locator('#status')).toContainText('无法嵌入 Word');
  await expect(page.locator('#download-docx')).toBeEnabled();
  expect(downloads).toHaveLength(0);
});

test('粘贴及拖放图片也进入正文和预览，伪装图片被拒绝', async ({ page }) => {
  await loaded(page);
  const image = await imageFile(page);
  const data = image.buffer.toString('base64');
  for (const type of ['paste', 'drop']) {
    await page.locator('#editor').evaluate((editor, { type, data }) => {
      const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], '粘贴图片.png', { type: 'image/png' }));
      const event = type === 'paste'
        ? new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true })
        : new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true });
      editor.dispatchEvent(event);
    }, { type, data });
    await expect(page.locator('#preview img')).toHaveCount(type === 'paste' ? 1 : 2);
  }
  await page.locator('#image-file').setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(page.locator('#status')).toContainText('图片无法读取');
  await expect(page.locator('#preview img')).toHaveCount(2);
});

test('剪贴板或本机存储不可用时明确提示，不伪报成功', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new Error('storage full'); };
    Object.defineProperty(navigator.clipboard, 'write', { value: async () => { throw new Error('permission denied'); } });
  });
  await loaded(page);
  await expect(page.locator('#save-state')).toContainText('保存失败');
  await page.locator('#copy').click();
  await expect(page.locator('#status')).toContainText('未允许复制');
  await expect(page.locator('#copy')).toBeEnabled();
});

test('手机布局没有横向溢出，截图保留实际排版', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loaded(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('#copy')).toBeVisible();
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'artifacts/desktop.png', fullPage: true });
});


test('新增排版设置持久化、导出配置和重置保留图文', async ({ page }) => {
  await loaded(page);
  await page.locator('#image-file').setInputFiles(await imageFile(page));
  await expect(page.locator('#preview img')).toHaveCount(1);
  await page.locator('#codeTheme').selectOption('warm');
  await page.getByRole('tab', { name: '版式与细节' }).click();
  await page.locator('#font').selectOption('kai');
  await page.locator('#caption').selectOption('alt');
  await expect(page.locator('.image-caption')).toHaveText('配图.png');
  await page.reload();
  await expect(page.locator('#font')).toHaveValue('kai');
  await expect(page.locator('#codeTheme')).toHaveValue('warm');
  await expect(page.locator('.image-caption')).toHaveText('配图.png');
  const waiting = page.waitForEvent('download');
  await page.locator('#download-config').click();
  const config = JSON.parse(await readFile(await (await waiting).path(), 'utf8'));
  expect(config).toMatchObject({ font: 'kai', caption: 'alt', codeTheme: 'warm' });
  const source = await page.locator('#editor').inputValue();
  await page.locator('#reset-layout').click();
  await expect(page.locator('#editor')).toHaveValue(source);
  await expect(page.locator('#preview img')).toHaveCount(1);
  await expect(page.locator('.image-caption')).toHaveCount(0);
  await expect(page.locator('#font')).toHaveValue('theme');
});

test('AI 命令使用同一配置导出字体、代码配色、图注与本地图片', async ({ page }) => {
  await loaded(page);
  const directory = await mkdtemp(path.join(tmpdir(), 'paper-lab-'));
  try {
    const image = await imageFile(page);
    await writeFile(path.join(directory, '配图.png'), image.buffer);
    await writeFile(path.join(directory, 'article.md'), '## 自动排版\n\n![图片说明](配图.png "图片标题")\n\n```js\nconst answer = 42;\n```');
    await writeFile(path.join(directory, 'layout.json'), JSON.stringify({ theme: 'bold', accent: 'violet', font: 'kai', codeTheme: 'warm', caption: 'title', captionFormat: 'numbered', paragraphStyle: 'indent', width: '480' }));
    const output = path.join(directory, 'result.docx');
    const { stdout } = await promisify(execFile)(process.execPath, ['scripts/export.mjs', '--input', path.join(directory, 'article.md'), '--config', path.join(directory, 'layout.json'), '--output', output, '--title', 'AI 样稿']);
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, output, config: { font: 'kai', accent: '#7952b3', theme: 'bold' } });
    const doc = inspectDocx(output);
    expect(doc.text).toContain('AI 样稿');
    expect(doc.text).toContain('图 1：图片标题');
    expect(doc.text).toContain('const answer = 42;');
    expect(doc.images).toBe(1);
    expect(doc.mediaDimensions).toEqual([[600, 240]]);
    expect(JSON.stringify(doc.fonts)).toContain('楷体');
    expect(doc.fills.map((fill) => fill.toUpperCase())).toContain('FAF2E5');
    await mkdir('artifacts', { recursive: true });
    await writeFile('artifacts/ai-with-images.docx', await readFile(output));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('AI 拒绝无效配置、越界图片、软链接和坏图，失败保留原输出', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'paper-errors-'));
  try {
    const base = path.join(directory, 'article');
    await mkdir(base);
    const input = path.join(base, 'article.md');
    const output = path.join(directory, 'result.docx');
    await writeFile(output, '已有文件');
    await writeFile(path.join(directory, 'outside.png'), 'secret');
    await symlink(path.join(directory, 'outside.png'), path.join(base, 'link.png'));
    await writeFile(path.join(base, 'broken.png'), 'broken');
    for (const source of ['../outside.png', 'link.png', 'broken.png', 'https://example.com/private.png']) {
      await writeFile(input, `![配图](${source})`);
      await expect(promisify(execFile)(process.execPath, ['scripts/export.mjs', '--input', input, '--output', output])).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('"ok":false') });
      expect(await readFile(output, 'utf8')).toBe('已有文件');
    }
    await writeFile(input, '正文');
    for (const config of [{ unknown: true }, { font: 'missing' }, { footnotes: 'true' }]) {
      const configFile = path.join(directory, 'config.json');
      await writeFile(configFile, JSON.stringify(config));
      await expect(promisify(execFile)(process.execPath, ['scripts/export.mjs', '--input', input, '--config', configFile, '--output', output])).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('排版参数') });
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test('18 款主题色可点选，自定义、主题切换与刷新不丢失选择', async ({ page }) => {
  await loaded(page);
  await expect(page.locator('.theme-card')).toHaveCount(9);
  await expect(page.locator('.theme-options')).toBeVisible();
  await expect(page.locator('.accent-chip')).toHaveCount(18);
  await expect(page.locator('#codeTheme option')).toHaveCount(8);
  for (const [id, [name, color]] of Object.entries(accentPresets)) {
    await page.locator(`[data-accent="${id}"]`).click();
    await expect(page.locator('#accent-name')).toHaveText(name);
    await expect(page.locator('#accent')).toHaveValue(color);
    await expect(page.locator(`[data-accent="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.paperLab.getConfig().accent)).toBe(color);
  }
  await page.locator('[data-theme="bold"].theme-card').click();
  await expect(page.locator('#accent-name')).toHaveText('橄榄绿');
  await page.locator('#accent').fill('#123456');
  await expect(page.locator('#accent-name')).toHaveText('自定义');
  await expect(page.locator('.accent-chip[aria-pressed="true"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#preview')).toHaveAttribute('data-theme', 'bold');
  await expect(page.locator('#accent')).toHaveValue('#123456');
  await page.locator('#reset-layout').click();
  await expect(page.locator('[data-accent="jade"]')).toHaveAttribute('aria-pressed', 'true');
});

test('新增主题与所有预设色、代码配色实际写入 DOCX，段落缩进可导出', async ({ page }) => {
  await loaded(page);
  const themes = Object.keys(articleThemes);
  const codes = Object.keys(codeThemes);
  const colors = Object.entries(accentPresets);
  for (let index = 0; index < colors.length; index++) {
    const [id, [, color]] = colors[index];
    const theme = themes[index % themes.length];
    const codeTheme = codes[index % codes.length];
    const config = { theme, accent: id, codeTheme, font: index % 2 ? 'heiti' : 'deng', fontSize: index % 2 ? '12' : '24', paragraphStyle: 'indent' };
    await page.evaluate((config) => window.paperLab.load({ markdown: '## 排版标题\n\n正文与**强调**。\n\n> 引用内容\n\n```js\nconst n = 1;\n```\n\n| 名称 | 内容 |\n| --- | --- |\n| 样式 | 导出 |', title: '主题验证', config }), config);
    await expect(page.locator('#preview > p').first()).toHaveCSS('text-indent', index % 2 ? '24px' : '48px');
    const waiting = page.waitForEvent('download');
    await page.locator('#download-docx').click();
    const doc = inspectDocx(await (await waiting).path());
    expect(doc.text).toContain('正文与强调');
    expect(doc.colors.map((value) => value.toUpperCase())).toContain(color.slice(1).toUpperCase());
    expect(doc.fills.map((value) => value.toUpperCase())).toContain(codeThemes[codeTheme][1].slice(1).toUpperCase());
    expect(doc.tables).toBe(1);
    expect(doc.sizes).toContain(index % 2 ? '18' : '36');
    expect(JSON.stringify(doc.fonts)).toContain(index % 2 ? '黑体' : '等线');
    expect(doc.indents.some((attributes) => Object.entries(attributes).some(([key, value]) => key.endsWith('}firstLine') && Number(value) > 0))).toBe(true);
  }
});

test('AI 可以发现完整样式目录，预设色归一化并拒绝错误选项', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ['scripts/export.mjs', '--list-styles']);
  const catalog = JSON.parse(stdout);
  expect(Object.keys(catalog.themes)).toHaveLength(9);
  expect(Object.keys(catalog.colors)).toHaveLength(18);
  expect(Object.keys(catalog.codeThemes)).toHaveLength(8);
  expect(validateLayout({ accent: 'red', theme: 'classic', paragraphStyle: 'compact' }).accent).toBe('#bd3038');
  for (const config of [{ accent: 'missing' }, { theme: 'missing' }, { fontSize: '25' }, { captionFormat: 'missing' }]) {
    expect(() => validateLayout(config)).toThrow('无效排版参数');
  }
});


test('设置标签支持键盘切换，隐藏面板不影响配置和含图导出', async ({ page }) => {
  await loaded(page);
  const styleTab = page.getByRole('tab', { name: '主题与色彩' });
  const layoutTab = page.getByRole('tab', { name: '版式与细节' });
  await expect(styleTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: '主题与色彩' })).toBeVisible();
  await expect(page.locator('#panel-layout')).toBeHidden();
  const config = await page.evaluate(() => window.paperLab.getConfig());
  await styleTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(layoutTab).toBeFocused();
  await expect(layoutTab).toHaveAttribute('aria-selected', 'true');
  await expect(styleTab).toHaveAttribute('tabindex', '-1');
  await expect(page.locator('#panel-style')).toBeHidden();
  await page.locator('#font').selectOption('deng');
  await page.locator('#caption').selectOption('alt');
  await page.locator('#image-file').setInputFiles(await imageFile(page));
  await expect(page.locator('#preview .image-caption')).toHaveText('配图.png');
  await layoutTab.focus();
  await page.keyboard.press('Home');
  await expect(styleTab).toBeFocused();
  expect(await page.evaluate(() => window.paperLab.getConfig())).toEqual({ ...config, font: 'deng', caption: 'alt' });
  const waiting = page.waitForEvent('download');
  await page.locator('#download-docx').click();
  const doc = inspectDocx(await (await waiting).path());
  expect(doc.images).toBe(1);
  expect(doc.text).toContain('配图.png');
  expect(JSON.stringify(doc.fonts)).toContain('等线');
  expect(doc.text).not.toMatch(/本地渲染|主题与色彩|— END —/);
  await styleTab.focus();
  await page.keyboard.press('End');
  await expect(layoutTab).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(styleTab).toBeFocused();
});

test('新版工作台在桌面、平板和手机保留全部设置与导出操作', async ({ page }) => {
  await loaded(page);
  for (const width of [1920, 1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `宽度 ${width} 无页面横向溢出`).toBe(true);
    await page.getByRole('tab', { name: '主题与色彩' }).click();
    await page.locator('[data-theme="notebook"].theme-card').click();
    await page.locator('[data-accent="olive"]').click();
    await page.getByRole('tab', { name: '版式与细节' }).click();
    await page.locator('#font').selectOption('deng');
    await page.locator('#preview-width').selectOption('680');
    await expect(page.locator('#preview')).toHaveAttribute('data-theme', 'notebook');
    await expect(page.locator('#preview-size')).toHaveText('680 px');
    await expect(page.locator('#download-docx')).toBeVisible();
    await expect(page.locator('#download-config')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `宽度 ${width} 切换后无页面横向溢出`).toBe(true);
  }
});

test('页面提供完整 MCP 指引和 GitHub 入口，示例可复制且关闭后恢复焦点', async ({ page }) => {
  await loaded(page);
  const entry = page.getByRole('button', { name: 'AI / MCP 接入' });
  const repository = page.getByRole('link', { name: 'GitHub 仓库（新窗口）' });
  await expect(repository).toHaveAttribute('href', 'https://github.com/snakelis/paperlab');
  await expect(repository).toHaveAttribute('rel', 'noopener noreferrer');
  const original = await page.locator('#editor').inputValue();
  await entry.click();
  const dialog = page.getByRole('dialog', { name: 'AI / MCP 接入' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('当前网页地址不是远程 MCP 服务地址');
  await expect(dialog).toContainText('list_layout_styles');
  await expect(dialog).toContainText('format_article');
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: '复制 MCP 配置', exact: true }).click();
  await expect(dialog.locator('#connection-copy-status')).toContainText('已复制');
  const config = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(config.mcpServers.paperlab).toEqual({ command: 'node', args: ['/absolute/path/to/paperlab/scripts/mcp.mjs', '--workspace', '/absolute/path/to/article-workspace'] });
  const args = JSON.parse(await page.locator('#guide-tool-arguments').textContent());
  expect(validateLayout(args.config)).toMatchObject({ theme: 'bold', fontSize: '18', accent: '#7952b3' });
  await dialog.getByText('不使用 MCP？通过 JSON 命令行调用', { exact: true }).click();
  await dialog.getByRole('button', { name: '复制 JSON 请求', exact: true }).click();
  const request = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(request).toMatchObject({ name: 'format_article', arguments: { input: 'wallet.md' } });
  expect(() => validateLayout(request.arguments.config)).not.toThrow();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(entry).toBeFocused();
  await expect(page.locator('#editor')).toHaveValue(original);
  const waiting = page.waitForEvent('download');
  await page.locator('#download-html').click();
  const html = await readFile(await (await waiting).path(), 'utf8');
  expect(html).not.toMatch(/mcpServers|复制 MCP 配置|接入方式：本机 stdio/);
  await entry.click();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(dialog).not.toBeVisible();
});

test('MCP 指引在手机端可阅读，复制受限时明确提示且不误报成功', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await loaded(page);
  await page.getByRole('button', { name: 'AI / MCP 接入' }).click();
  const dialog = page.getByRole('dialog', { name: 'AI / MCP 接入' });
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
  await dialog.getByRole('button', { name: '复制 MCP 配置', exact: true }).click();
  await expect(dialog.locator('#connection-copy-status')).toHaveText('无法自动复制，请选中下方示例文本手动复制。');
  await expect(dialog.locator('#connection-copy-status')).toHaveAttribute('data-error', 'true');
  await expect(dialog.getByRole('button', { name: '复制 MCP 配置', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeInViewport();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
