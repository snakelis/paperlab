# Markdown 排版可行性验证结果

日期：2026-11-27。

## 已实现与确认

独立目录：`/mnt/d/web/htdocs/snakelis/wechat-markdown-lab`。
独立 Git 分支：`feat/markdown-feasibility`。
演示地址：`http://localhost:8766`，测试服务端口：18766。

使用用户提供的钱包文章全文验证：6 个二级标题、1 个三级标题、7 个引用块、
含 3 行数据的对照表、8 个有序列表项、5 个自查项均正确渲染。
演示标题单独补充，正文不进行事实修订或文字润色。

浏览器验证确认可完成：编辑 → 主题排版 → 复制公众号富文本 / 导出 HTML。
导出的 HTML 不依赖本编辑器的 CSS 或 JavaScript；保留内联的颜色、字体、
间距、引用和表格样式。Markdown 导入再导出保持正文原样。

## 实际执行的检查

- `pnpm install --frozen-lockfile`：通过，使用已提交锁文件可复现依赖。
- `node --check app.js`、`node --check tests/editor.spec.js`：通过。
- `pnpm test`：最终 **9 项通过**，Chromium 实际执行。
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

## 演示产物

以下均位于被 Git 忽略的 `artifacts/`，本地生成，不需要提交：

- `desktop.png`、`mobile.png`：实际浏览器界面。
- `table.png`：表格所在位置的界面截图。
- `wallet-journal.html`：清爽笔记主题。
- `wallet-editorial.html`：人文杂志主题。
- `wallet-technical.html`：技术专栏主题。

## 隔离与未验证项

没有修改原业务项目或其 V2 目录的文件，没有切换它们的 Git 分支、修改依赖、
连接数据库或 Redis、调用 Agent/Worker 接口、配置钉钉、操作公众号或发表文章。
完成时原项目 `git status --short` 输出为空。

本次仅验证浏览器编辑、排版、导入导出与复制能力。没有验证微信编辑器清洗规则、
data URL 图片转存、公众号最终发表效果、Windows localhost 转发、DOCX 转换或正式插件接入。
尚未实现 AI 文字润色。本原型支持后续评估，不代表原网站全部能力已复刻。
