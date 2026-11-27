import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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
  await page.locator('#image-file').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO1cAAAAASUVORK5CYII=', 'base64') });
  await expect(page.locator('#preview img')).toHaveAttribute('src', /^data:image\/png;base64,/);
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
