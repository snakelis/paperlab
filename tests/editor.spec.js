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
 print(json.dumps({'text':''.join(t.text or '' for t in root.findall('.//w:t',ns)), 'colors':[n.get(val) for n in root.findall('.//w:color',ns)], 'sizes':[n.get(val) for n in root.findall('.//w:sz',ns)], 'headings':[n.get(val) for n in root.findall('.//w:pStyle',ns)], 'tables':len(root.findall('.//w:tbl',ns)), 'rows':len(root.findall('.//w:tr',ns)), 'images':len(root.findall('.//a:blip',ns)), 'media':media, 'mediaDimensions':[list(struct.unpack('>II',z.read(n)[16:24])) for n in media if n.endswith('.png')], 'externalImages':[n.get('Target') for n in rel if n.get('Type','').endswith('/image') and n.get('TargetMode')=='External'], 'fonts':[n.attrib for n in root.findall('.//w:rFonts',ns)], 'fills':[n.get('{'+ns['w']+'}fill') for n in root.findall('.//w:shd',ns)], 'altChunk':len(root.findall('.//w:altChunk',ns))},ensure_ascii=False))
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
  await page.locator('#font-size').fill('18');
  await page.locator('#accent').fill('#713b77');
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
  await page.locator('#font').selectOption('kai');
  await page.locator('#codeTheme').selectOption('warm');
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
    await writeFile(path.join(directory, 'layout.json'), JSON.stringify({ font: 'kai', codeTheme: 'warm', caption: 'title', width: '480' }));
    const output = path.join(directory, 'result.docx');
    const { stdout } = await promisify(execFile)(process.execPath, ['scripts/export.mjs', '--input', path.join(directory, 'article.md'), '--config', path.join(directory, 'layout.json'), '--output', output, '--title', 'AI 样稿']);
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, output, config: { font: 'kai' } });
    const doc = inspectDocx(output);
    expect(doc.text).toContain('AI 样稿');
    expect(doc.text).toContain('图片标题');
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
