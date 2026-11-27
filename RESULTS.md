# Markdown 排版可行性验证结果

日期：2026-11-27。

## Gemini 界面改版验证

2026-11-27：参考用户提供的 `paperlab.html` 调整界面，采用紧凑顶栏、暖灰底色、
翡翠绿强调色、分组设置标签与独立编辑/预览面板。保留全部主题、颜色、字体和代码配色。
标签页补充 ARIA 关联、焦点管理、方向键和 Home/End 支持；手机端上下排列并支持设置面板滚动。
参考文件中的外部 CDN、示例正文和演示导出实现未替换项目现有功能。

实际执行：

- `node --check app.js`、`node --check tests/editor.spec.js`、`git diff --check`：通过。
- `pnpm test`：**21 项通过**，包含既有导入、复制、图文预览、DOCX/HTML/Markdown 导出、
  AI 命令行、恶意内容过滤，以及新增的标签页键盘交互和响应式检查。
- `pnpm run test:agent`：**4 项通过**，包含 MCP 实际调用、JSON stdin/文件请求、
  含图 DOCX、哈希/清单、边界拒绝、BUSY、取消与失败清理。
- 在相同 1920 × 1080 视口下对比改版前后 9 款主题 × 3 档宽度的正文关键计算样式，
  字体、颜色、字号、行距、宽度、间距、边框等共 **27 组，无差异**。
- 检查 1920、1440、1024、768、390、320 px 宽度下设置切换与导出按钮，未出现页面横向溢出。
- 检查 720、900、1080 px 桌面高度下的底部操作可见性，并人工查看桌面、设置与手机截图。

测试日志、对比数据和截图保存在被忽略的 `artifacts/`；未新增依赖，主系统未改动。
本轮通过协议客户端实际调用验证 AI 工具，未重新运行 Codex 模型模拟，未验证 Muse 客户端、
Word 视觉渲染或公众号导入效果，也未部署线上站点。

## PaperLab 仓库迁移验证

2026-11-27：完整项目目录迁移到 `/mnt/d/web/htdocs/snakelis/paperlab`，保留 Git 历史、
本地依赖和演示产物，统一包名、界面名称、DOCX 作者信息与 MCP 示例路径。
浏览器草稿继续使用原存储键，避免已有草稿丢失。

迁移后重新执行 `pnpm install --frozen-lockfile`、`pnpm test`（19 项）、
`pnpm run test:agent`（4 项）、修改脚本的 `node --check` 和 `git diff --check`，均通过。
本轮未重新运行付费模型的 Codex 模拟，未验证 Muse 或公众号导入；未修改主系统。
Git 仓库只交付源码、测试、文档和锁文件，依赖目录与本地运行产物继续忽略。

## 已实现与确认

独立目录：`/mnt/d/web/htdocs/snakelis/paperlab`。
初版 Git 分支：`feat/markdown-feasibility`；Word 与插图扩展分支：`feat/docx-export`；AI 排版扩展分支：`feat/ai-typesetting`；样式扩充分支：`feat/richer-export-styles`；独立 AI 工具分支：`feat/standalone-agent-tools`。
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
- `pnpm test`：初版 9 项通过，Word 与图片扩展后 13 项通过，AI 排版扩展后 16 项通过，样式扩充后 **19 项通过**，Chromium 实际执行。
- 新增模块、MCP 服务、JSON 入口、Codex 模拟脚本及 Agent 测试均运行 `node --check`：通过。
- `pnpm run test:agent`：4 项 Node 集成测试通过，含真实 MCP tools/call 和取消清理。
- `pnpm run simulate:codex`：本机 Codex CLI 0.170.0 真实调用 MCP 成功；不是只发送固定 JSON 的测试客户端。
- `node scripts/export.mjs --input sample.md --config examples/layout.json --output artifacts/ai-wallet.docx`：成功输出 DOCX 与 JSON。
- `node scripts/export.mjs --list-styles`：成功返回完整样式目录。
- 使用 `examples/layout-rich.json` 导出 `artifacts/rich-wallet.docx`：成功，预设颜色归一化为实际色值。
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
17. 9 款文章主题、18 款可点选主题色、8 款代码配色均出现在界面；验证全部主题色切换、
    自定义颜色、切换主题保留颜色、刷新恢复和重置。检查侧栏主题列表保持可见高度。
18. 遍历 18 组配置，覆盖全部 9 款文章主题、18 款颜色和 8 款代码配色，实际导出并解压 DOCX，
    验证正文、颜色、代码底色、表格、12/24 px 字号、黑体/等线字体和非零首行缩进。
    AI 图文用例同时确认编号图注与命名颜色生效。
19. AI 样式发现命令返回完整目录；验证颜色 ID 归一化以及无效主题、颜色、字号、图注格式被拒绝。

CLI 与 UI 共用 `layout.js` 配置白名单、页面排版逻辑及 DOCX 转换器，没有增加依赖。
AI 调用不触发外网请求，临时服务仅监听 loopback 随机端口，运行结束自动关闭。
文章主题现有 9 款、主题色 18 款、代码配色 8 款；字体有 6 种明确选择及跟随主题，
字号 12–24 px、5 档行距、3 种段落样式、2 种图注格式。自定义 CSS、Mac 装饰和逐词代码高亮暂未实现。

图片在编辑区使用简短标记，避免 base64 占满正文；字数按实际预览文字计算。
Markdown 导出时重新内嵌本机图片，验证没有依赖本机图片标记的残留。

## 独立 AI 工具接入验证

仅在插件内增加接入层，没有注册到业务系统，也没有调用业务 API。
工具定义及执行在 `agent-tools.js`，MCP stdio 在 `scripts/mcp.mjs`，
单请求 JSON 入口在 `scripts/agent.mjs`。原命令行和工具层共用 `scripts/export-core.mjs`，
仍复用网页预览的排版和 DOCX 转换，没有复制第二套渲染逻辑。

新增 4 项 Node 集成测试覆盖：

1. 真实生成含本地图片和编号图注的 DOCX，核验文件 SHA-256、字节数、颜色配置和清单，坏图失败后清理任务目录。
2. 拒绝越界 Markdown、外部软链接、任意输出参数、错误配置和指向目录外的输出目录；取消调用不留下成品。
3. 工具定义发现、JSON 文件请求、stdin 请求及失败非零退出码。
4. MCP 初始化、工具发现、真实格式化、BUSY、未知方法、坏 JSON、调用取消及取消后目录清理。

实际 Codex 模拟使用独立 `artifacts/codex-simulation-1795769036975/` 工作区，
临时挂载 `paperlab` MCP 服务。Codex 先成功调用 `list_layout_styles`，
再成功调用 `format_article`，生成钱包全文与一张测试配图的 DOCX。
选用醒目专栏、罗兰紫、18 px、Nord 配色、编号图注、段落缩进。
实际输出 17,583 字节，SHA-256 为：

```text
517e00cd8618bc390ede9e697e1ef81afd8f15561a481a236fea3123c0f01f34
```

独立解压核验 ZIP 完整、一张内嵌图片、一张表格、文章尾部和编号图注均存在。
Codex 返回的文件路径和 SHA-256 与实际文件一致。
复制的便捷样例为 `artifacts/codex-wallet.docx`，验证报告为 `artifacts/codex-report.json`；
模拟目录中保留 JSONL 工具调用事件、最终回复与运行报告。
测试图片只用于证明图片嵌入，不能作为文章正式配图。

交给 Muse 的接入说明集中在 [MUSE-HANDOFF.md](MUSE-HANDOFF.md)，
同时提供 MCP 配置和 JSON 请求示例。尚未在 Muse 客户端实际配置或调用。

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
- `codex-wallet.docx`、`codex-report.json`：真实 Codex MCP 调用的 DOCX 与校验报告。
- `rich-wallet.docx`：醒目专栏、罗兰紫与首行缩进的钱包文章。
- `rich-styles.png`：扩充后的主题卡片和 18 色预设界面。
- `with-images.png`：包含两张图片的实际预览。

## 隔离与未验证项

没有修改原业务项目或其 V2 目录的文件，没有切换它们的 Git 分支、修改依赖、
连接数据库或 Redis、调用 Agent/Worker 接口、配置钉钉、操作公众号或发表文章。
初版完成时原项目 `git status --short` 输出为空；本轮继续仅在独立原型目录修改。

本次验证浏览器编辑、排版、导入导出、复制、AI 命令行和 MCP 调用能力。没有验证微信编辑器清洗规则、
data URL 图片转存、公众号最终发表效果、Windows localhost 转发或正式插件接入。
Word 文件结构、文字与嵌入图片已验证，尚未在 Word/LibreOffice 渲染对比，不能承诺
与浏览器或公众号在分页、换行、字体和全部 CSS 上像素一致。
尚未实现 AI 文字润色。本原型支持后续评估，不代表原网站全部能力已复刻。
