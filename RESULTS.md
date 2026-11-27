# Markdown 排版可行性验证结果

日期：2026-11-27。

## 已实现与确认

独立目录：`/mnt/d/web/htdocs/snakelis/wechat-markdown-lab`。
初版 Git 分支：`feat/markdown-feasibility`；Word 与插图扩展分支：`feat/docx-export`；AI 排版扩展分支：`feat/ai-typesetting`。
演示地址：`http://localhost:8766`，测试服务端口：18766。

使用用户提供的钱包文章全文验证：6 个二级标题、1 个三级标题、7 个引用块、
含 3 行数据的对照表、8 个有序列表项、5 个自查项均正确渲染。
演示标题单独补充，正文不进行事实修订或文字润色。

浏览器验证确认可完成：编辑 / 插图 → 主题排版 → 导出 Word / HTML 或复制公众号富文本。
导出的 HTML 不依赖本编辑器的 CSS 或 JavaScript；保留内联的颜色、字体、
间距、引用和表格样式。Markdown 导入再导出保持正文原样。

## 实际执行的检查

- `pnpm install --frozen-lockfile`：通过，使用已提交锁文件可复现依赖。
- `node --check app.js`、`node --check docx-export.js`、`node --check tests/editor.spec.js`：通过。
- `pnpm test`：初版 9 项通过，Word 与图片扩展后 13 项通过，AI 排版扩展后 **16 项通过**，Chromium 实际执行。
- 新增 `node --check layout.js`、`node --check scripts/export.mjs`：通过。
- `node scripts/export.mjs --input sample.md --config examples/layout.json --output artifacts/ai-wallet.docx`：成功输出 DOCX 与 JSON。
- `git diff --check`：通过。
- 本地 HTTP 检查：首页、脚本、样稿、Marked、DOMPurify 均返回 200。
- 人工查看桌面、手机截图；390 px 手机布局自动检查未发生横向溢出。
- 提交前检查暂存差异格式及文件范围；未纳入依赖目录或浏览器缓存。

初次测试中有两项在异步预览完成前对多个标题使用单元素断言，触发严格匹配错误；
已改为先等待预览标题数量收敛，再检查内容。最终全部通过。

## 浏览器测试覆盖

1. 用户全文与 Markdown 结构。
2. 主题、颜色、字号、行距、宽度与刷新后草稿恢复。
3. Markdown 文件导入导出往返及恢复样稿。
4. HTML 独立打开时的颜色、表格边框和全文。
5. 实际剪贴板含 `text/html` 和 `text/plain`，不含工具界面。
6. 脚本、危险链接、事件、iframe 过滤，以及外链引用转换。
7. 图片本地嵌入、拒绝非法文件、取消导入时保留原文。
8. 存储或剪贴板不可用时明确提示失败。
9. 手机布局与截图。
10. 导出真正的 OOXML DOCX 并解压验证：全文与预览一致（忽略空白）、6 个二级标题、
    4 行表格、选定颜色与字号；没有 HTML altChunk 替代正文。
11. 多图与 WebP 插入、草稿刷新恢复；DOCX 包含两个图片引用及媒体文件，无外链图片；
    图片原始 600×240 分辨率保留，显示尺寸按预览宽度缩放。
12. 失效图片明确阻止 Word 导出，不生成缺图文件。
13. 粘贴、拖放图片进入预览，伪装成 PNG 的文本文件被拒绝。
14. 字体、代码配色、图注刷新后保留；导出配置；重置排版保留正文和图片。
15. AI 命令独立生成 DOCX：相对路径中文图片嵌入、原始分辨率保留，标题、代码、真实图注、
    楷体字体配置、暖色代码背景均在 OOXML 中确认。
16. AI 命令拒绝越界相对路径、指向目录外的软链接、损坏图片、远程图片和无效配置，
    非零退出并保留已有目标文件。

CLI 与 UI 共用 `layout.js` 配置白名单、页面排版逻辑及 DOCX 转换器，没有增加依赖。
AI 调用不触发外网请求，临时服务仅监听 loopback 随机端口，运行结束自动关闭。
自定义 CSS、Mac 装饰和逐词代码高亮暂未实现。

图片在编辑区使用简短标记，避免 base64 占满正文；字数按实际预览文字计算。
Markdown 导出时重新内嵌本机图片，验证没有依赖本机图片标记的残留。

## 演示产物

以下均位于被 Git 忽略的 `artifacts/`，本地生成，不需要提交：

- `desktop.png`、`mobile.png`：实际浏览器界面。
- `table.png`：表格所在位置的界面截图。
- `wallet-journal.html`：清爽笔记主题。
- `wallet-editorial.html`：人文杂志主题。
- `wallet-technical.html`：技术专栏主题。
- `wallet-with-images.docx`：使用钱包全文与两张本机生成示意配图的完整 Word 样例。
- `ai-wallet.docx`：AI 命令生成的钱包全文。
- `ai-with-images.docx`：自动化验证中的标题、图注、代码块、楷体与内嵌图片样例。
- `with-images.png`：包含两张图片的实际预览。

## 隔离与未验证项

没有修改原业务项目或其 V2 目录的文件，没有切换它们的 Git 分支、修改依赖、
连接数据库或 Redis、调用 Agent/Worker 接口、配置钉钉、操作公众号或发表文章。
初版完成时原项目 `git status --short` 输出为空；本轮继续仅在独立原型目录修改。

本次验证浏览器编辑、排版、导入导出、复制和 AI 命令行导出能力。没有验证微信编辑器清洗规则、
data URL 图片转存、公众号最终发表效果、Windows localhost 转发或正式插件接入。
Word 文件结构、文字与嵌入图片已验证，尚未在 Word/LibreOffice 渲染对比，不能承诺
与浏览器或公众号在分页、换行、字体和全部 CSS 上像素一致。
尚未实现 AI 文字润色。本原型支持后续评估，不代表原网站全部能力已复刻。
