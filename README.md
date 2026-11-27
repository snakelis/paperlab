# PaperLab · 文章排版工坊

独立目录、独立 Git 仓库、独立依赖和 HTTP 端口。用于验证类似 Doocs 微信 Markdown
编辑器的核心编辑排版能力，没有改动或连接 `agent-content-publisher` 及其 V2 项目。
本项目是独立实现的最小原型，不是原网站的完整复制，也不是已经接入生产的插件。

## 运行

获取源码后进入项目目录：

```bash
git clone https://github.com/snakelis/paperlab.git
cd paperlab
```

需要 Node.js 20+、pnpm 和 Python 3。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

浏览器访问 `http://localhost:8766`。Windows 通常也可通过 WSL 的 localhost 转发访问。
必须通过 HTTP 打开，不能直接双击 HTML；运行后无需 CDN 或外部编辑器服务。
服务器监听所有本机网卡，使用结束后在启动终端按 Ctrl+C 停止；这是本地演示服务。

## 本次范围

- 以用户提供的钱包文章全文为默认样稿，正文位于 `sample.md`，不改写内容。
- 单独补充一个可编辑的演示标题；Markdown 导出不改写正文，标题使用文件名承载。
- Markdown 实时编辑预览、9 款文章主题、18 款主题色预设与自定义颜色、字体、字号、行距和预览宽度。
- 8 款代码块配色、可选图注与自动编号、3 款段落样式、排版重置（保留正文与图片）、导出 AI 配置。
- 标题、引用、表格、步骤、列表、强调、图片和代码等基础 Markdown。
- 外部链接可转为文末引用，公众号文章链接保留。
- 导入 Markdown、插入本地图片和表格；图片支持多选、粘贴和拖到正文编辑区。
- 本机插图在正文中只显示简短标记，右侧显示实际图片；图片、文稿和设置一起在本机保存。
- 导出完整 `.docx`：文字、标题、强调、引用、表格、颜色、字号和内嵌图片。
- 复制公众号富文本（`text/html` 与 `text/plain`），导出自带内联样式的 HTML。
- 不可信 Markdown 渲染前经过 DOMPurify；不执行其中的脚本、事件或 iframe。

内容不会主动上传到服务端。浏览器清理站点数据会丢失本机草稿，请下载备份。
Markdown 原文中的远程图片会由浏览器请求对应地址；本地插图随草稿保存。
导出 Markdown 时将本地图片编码内嵌，因此文件可独立携带插图，不依赖本机图片标记。
大图片可能超出浏览器存储配额，此时明确提示保存失败，仍可下载文件。

## 界面与设置

工作台采用暖灰底色与翡翠绿强调色，顶部集中放置导入、保存、Word 导出和公众号复制操作。
标题输入位于 Markdown 编辑面板，右侧提供带图片的实时文章预览。

左侧设置分为「主题与色彩」和「版式与细节」两个标签页：前者包含全部文章主题、
18 款主题色、自定义颜色及代码配色；后者包含字体、字号、行距、段落、图注、预览宽度和外链引用。
可用方向键、Home、End 切换标签；底部保留「重置排版」与「保存 AI 配置」。
桌面端面板独立滚动，平板与手机端改为上下排列。

界面参考 Gemini 提供的设计稿实现，继续使用本地依赖，没有引入其 CDN 或演示转换逻辑。
正文主题与文件导出沿用既有规则；界面装饰不写入导出文章，MCP、JSON 及浏览器 AI 接口不变。

## 图文与 Word 导出

1. 在左侧正文中定位插图位置，点击「插入图片」、粘贴剪贴板中的图片，或拖入图片文件。
2. 右侧直接显示完整图文；继续选择主题、字号、颜色与行距。
3. 点击「导出 Word .docx」。文件在浏览器本机生成，图片真正嵌入 Word 文件。
4. 将 DOCX 导入公众号后台或交给后续发布流程，核对实际导入效果。

单张图片限 5 MB、2400 万像素；支持 PNG、JPEG、WebP、GIF。
为兼容 Word，WebP 和 GIF 插入时转换成静态 PNG，GIF 取首帧，预览与导出使用同一静态图。
导出时按照预览正文宽度缩放嵌入图片，并把基础 CSS 转成 Word 原生段落、文字和表格样式。
文档不是 HTML 改后缀，也不需要 Word 再联网下载图片。

外链图片受浏览器跨域和网络限制；无法读取、图片损坏或转换遗漏时明确阻止导出，
请改用本机图片重新插入。Markdown 直接引用的 GIF 在网页可能动画播放，Word 仅保存首帧。

## AI 自动调用

页面顶部的「AI / MCP 接入」提供完整的安装、客户端配置、工具参数、输出约定和 JSON 调用说明，
示例可直接复制，无需另开仓库文档查步骤；「GitHub ↗」链接到项目源码仓库。
当前是客户端本机启动的 stdio 接入，需要先安装工具，网站地址不是远程 MCP URL。

定位是供 AI 使用的独立排版模块：AI 交付 Markdown、图片和排版配置，工具生成 DOCX。
当前提供独立 MCP stdio 工具与 JSON 调用入口，已用 Codex CLI 真实调用验证；
没有接入现有系统，也不在工具中调用 AI 改写正文。接入步骤和交付约定见 [Muse 接入说明](MUSE-HANDOFF.md)。

安装依赖与 Chromium 后，在本目录执行：

```bash
pnpm exec playwright install chromium
pnpm export --input sample.md --config examples/layout.json --output artifacts/ai-wallet.docx --title "钱包入门"
```

程序调用建议直接使用 Node，避免 pnpm 的提示混入标准输出：

```bash
node scripts/export.mjs --input article.md --config examples/layout.json --output article.docx
```

`--input`、`--output` 必填，输出扩展名必须是 `.docx`。`--config` 可省略以使用默认设置，
`--title` 可省略以使用 Markdown 文件名。当前使用已有 Playwright/Chromium 运行环境，
正式部署时仍需安装它们，不能只复制一个 JavaScript 文件。
命令自动启动随机端口的本机临时服务和无界面浏览器，结束后关闭；不依赖演示页面或 8766 端口。

成功时退出码为 0，标准输出单行 JSON：

```json
{"ok":true,"output":"/absolute/article.docx","bytes":16000,"config":{"theme":"journal"}}
```

这里的 `config` 为简写示例，实际返回全部生效设置。失败时退出码为 1，标准错误输出
`{"ok":false,"error":"具体原因"}`。参数和图像验证通过、文档生成完成后才替换目标文件；
目标存在时成功导出会覆盖它，失败保留原输出。系统调用应传入独立参数数组，并为各任务指定不同输出路径。

图片写作 `![图片说明](images/photo.png "图片标题")`，相对于 Markdown 所在目录解析，
支持子目录及中文文件名。仅允许该目录内实际存在的 PNG/JPEG/WebP/GIF，检查软链接真实路径；
不读取目录外文件。支持正文内嵌 data URL 图片，但原 Markdown 总大小仍限 2 MB。
AI 命令禁用外网请求，请先把远程图片下载为本地文件；图片缺失、损坏或转换失败时不会生成缺图 DOCX。
HTML 写法中的本地图片路径不做文件解析，请使用标准 Markdown 图片语法。

排版参数与网页设置共用校验，未知字段或错误值会报错。所有数值参数使用 JSON 字符串。
可在网页试好样式后点「保存 AI 配置」，交给 AI 重复使用。

| 字段 | 可选值 | 默认值 |
| --- | --- | --- |
| `theme` | `journal` 清爽笔记、`editorial` 人文杂志、`technical` 技术专栏、`minimal` 极简留白、`classic` 经典书刊、`business` 商务报告、`elegant` 雅致手札、`bold` 醒目专栏、`notebook` 阅读手记 | `journal` |
| `font` | `theme` 跟随主题、`sans` 微软雅黑、`serif` 宋体、`kai` 楷体、`fang` 仿宋、`heiti` 黑体、`deng` 等线 | `theme` |
| `fontSize` | `"12"` 至 `"24"`，单位 px | `"16"` |
| `lineHeight` | `"1.5"`、`"1.7"`、`"1.9"`、`"2.1"`、`"2.3"` | `"1.9"` |
| `width` | `"375"`、`"480"`、`"680"`，预览纸张宽度（正文扣除留白） | `"375"` |
| `accent` | 预设 ID（如 `red`、`violet`）或六位十六进制颜色，如 `#087f74` | `#087f74` |
| `codeTheme` | `dark` 深色、`light` 浅色、`warm` 暖色、`github`、`monokai`、`nord`、`dracula`、`solarized` | `dark` |
| `caption` | `none` 不显示、`alt` 图片替代文字、`title` 图片标题 | `none` |
| `captionFormat` | `plain` 简洁说明、`numbered` 自动编号（图 1：说明） | `plain` |
| `paragraphStyle` | `normal` 标准段落、`indent` 首行缩进两字、`compact` 紧凑段落 | `normal` |
| `footnotes` | JSON 布尔值，是否转换外链引用 | `true` |

主题色预设支持：翡翠绿 `jade`、森林绿 `forest`、薄荷绿 `mint`、经典蓝 `blue`、深海蓝 `ocean`、
晴空蓝 `sky`、靛青 `indigo`、罗兰紫 `violet`、葡萄紫 `grape`、中国红 `red`、玫瑰红 `rose`、
樱花粉 `pink`、暖阳橙 `orange`、琥珀金 `amber`、咖啡棕 `brown`、岩石灰 `slate`、
石墨黑 `graphite`、橄榄绿 `olive`。自定义颜色可与任意主题组合，切换主题保留当前颜色。
颜色同时作用于标题、强调、引用和表格的适用区域，实色标题使用白字以便阅读。

AI 可读取带名称、枚举、实际色值和默认参数的完整目录，无需启动浏览器：

```bash
node scripts/export.mjs --list-styles
node scripts/export.mjs --input sample.md --config examples/layout-rich.json --output artifacts/rich-wallet.docx
```

输入的预设色 ID 会归一化为实际十六进制颜色，保存配置及导出成功的 JSON 都返回实际色值。
`examples/layout-rich.json` 演示醒目专栏、罗兰紫、Nord 代码底色、编号图注与段落缩进的组合。
主题是标题边框、对齐、字体、引用框等可导出样式的组合，代码主题为整体配色预设，
没有复制第三方主题文件。段落首行缩进仅作用于正文顶层段落，不缩进图片、图注、引用和表格。
图注编号仅为存在图注文字的图片连续编号。

图注使用真实文字参与预览与导出，选定字段没有文字则不补图注。字体不内嵌，浏览器和 Word
缺少对应字体时会替代；代码块仅提供整体配色，暂不提供逐词语法高亮。
自定义 CSS 和 Mac 代码块装饰暂不开放，优先保证上述参数可转为 Word 基础样式。
浏览器自动化也可等待 `window.paperLabReady` 后使用 `window.paperLab.load({markdown,title,config})`、
`getConfig()` 和 `exportDocx()`（返回 Blob）；CLI 已封装完整调用流程。

## Agent 工具入口

- `node scripts/mcp.mjs --workspace /absolute/workspace`：由 MCP 客户端启动。
- `node scripts/agent.mjs --list-tools`：读取工具定义。
- `node scripts/agent.mjs --workspace /absolute/workspace --request examples/agent-request.json`：JSON 调用。
- 工具为 `list_layout_styles` 和 `format_article`；只读写指定文章工作目录，生成独立 DOCX、配置和文件清单。
- 具体参数、输出、错误码、配置示例和 Muse 交付方式统一维护在 [Muse 接入说明](MUSE-HANDOFF.md)。

## 验证

```bash
pnpm exec playwright install chromium  # 本机尚无匹配浏览器时执行
pnpm test
pnpm run test:agent
# 已配置 Codex CLI 的环境可执行真实调用验证：
pnpm run simulate:codex
```

测试使用独立端口 18766。覆盖样稿结构、排版设置、草稿恢复、Markdown 往返、
独立 HTML 的样式、实际富文本剪贴板、脚本过滤、文件错误与取消、图片嵌入、
剪贴板/存储失败和移动布局。还会解压 DOCX 校验正文、标题、表格、样式、媒体文件，
验证图片刷新恢复、粘贴、拖放、WebP 转换和失效图片拒绝导出。
浏览器截图和 DOCX 样例写入被忽略的 `artifacts/`。
执行结果见 `RESULTS.md`。

## 结论边界与后续衔接

本次不包含 AI 文字润色、DOCX 导入、云图床、公式/图表插件、多文章管理、
账号登录、审批、发布接口或公众号实发。没有新增现有业务系统的生产依赖。

预览和 Word 导出来自同一份图文与排版数据，图片随 DOCX 交付。
但浏览器、Word 与公众号的排版引擎不同，圆角、字体替代、分页、换行和部分 CSS
不保证完全一致。已验证 DOCX 内容和结构，尚未使用 Word/LibreOffice 做视觉渲染比对，
也没有验证公众号导入。不能将基础样式转换成功视为公众号最终像素一致。
使用 HTML 复制时，data URL 图片是否被公众号接收/转存也需要单独验证。

如果后续采用此路径，建议外部 AI 先交付 Markdown 正文与独立图片；排版工具输出
Markdown 原稿、排版参数与含图片的 DOCX 成品，HTML 作为额外输出。
正式接入时再处理后端素材存储、内容版本、审批冻结和 Worker 验收，本次不触碰这些环节。

## 依赖与许可

使用锁定版本的 Marked（MIT）、DOMPurify（MPL-2.0 OR Apache-2.0）和 docx（MIT），
docx 仅在导出 Word 时按需加载；Playwright 仅用于开发验证。
第三方许可原文随 pnpm 安装的包保留。
