# Muse 接入独立排版插件

## 交付范围

本插件给 AI 提供标准 MCP stdio 工具，以及一次一请求的 JSON 命令行入口。
全部代码、测试和演示均在 `wechat-markdown-lab` 独立目录。
当前没有修改、连接或注册到发布系统，没有调用业务 API、上传、审批或发表文章。

已使用本机 Codex CLI 真实连接本插件，依次调用 `list_layout_styles` 和 `format_article`，
生成含本地图片的 DOCX；文件大小、SHA-256 和 OOXML 内容均已核验。详情见 [验证结果](RESULTS.md)。
Muse 客户端尚未实际验证；接入方可根据其运行环境选用下面任一入口。

## 安装与运行条件

在插件目录执行：

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

需要 Node.js 20+；本轮实际验证使用 WSL / Node.js 22、Chromium。完整安装依赖，
不要使用 `--prod` 排除当前放在开发依赖中的 Playwright：独立 AI 导出会用到它。
本轮没有增加依赖，也未修改现有业务系统的生产依赖。

接入方指定一个独立文章工作目录；目录需要已存在，只放允许 Agent 使用的稿件和图片，
不要将系统根目录或含凭据的配置目录设为工作目录。示例结构：

```text
article-workspace/
  wallet.md
  images/
    wallet.png
```

Markdown 图片写作 `![图片说明](images/wallet.png "图注文字")`。
图片必须实际位于 Markdown 所在目录或其子目录，不能引用父目录、外部软链接、网络图片。
单篇 Markdown 不超过 2 MB，图片限制见 [README](README.md)。

## 入口一：MCP stdio

服务启动命令：

```bash
node /absolute/path/to/wechat-markdown-lab/scripts/mcp.mjs --workspace /absolute/path/to/article-workspace
```

由 MCP 客户端启动并保持 stdin/stdout 连接，不需要手动启动网页、不需要固定 HTTP 端口。
stdout 仅输出换行分隔的 JSON-RPC 协议消息，stderr 用于启动错误。
支持协议版本 `2025-11-25`、`2025-06-18`、`2025-03-26`、`2024-11-05` 的基本工具调用，
包括 initialize、ping、tools/list、tools/call 和调用取消；未声明资源或提示词能力。
导出时只启动临时 loopback 服务，浏览器请求被限制在该服务，结束后关闭。

[通用 MCP 配置示例](examples/mcp.config.example.json) 提供 `command` / `args`。
示例路径需要替换。该 JSON 是常见 MCP 客户端结构，Muse 配置位置与外层字段以其客户端为准；
Node 和工作目录必须位于客户端启动服务所在的同一环境，不能混用 Windows 与 WSL 路径。

### 工具：list_layout_styles

参数为 `{}`，返回主题、颜色、字体、代码配色、排版参数的完整目录和默认值。
应先查询目录，再选择受支持的配置。UI、MCP 和 CLI 共用配置校验。

### 工具：format_article

参数示例：

```json
{
  "input": "wallet.md",
  "title": "钱包入门",
  "config": {
    "theme": "bold",
    "accent": "violet",
    "caption": "title",
    "captionFormat": "numbered",
    "paragraphStyle": "indent"
  }
}
```

`input` 必填，使用工作目录内已有 Markdown 的相对路径。
`title` 可省略，默认取文件名；`config` 可省略，默认排版参数见工具目录和 README。
数值排版参数使用字符串，例如 `"fontSize":"18"`。
不接受模型指定输出路径、执行命令、URL 或未知字段。

成功返回 `ok:true`，包含：

- `artifact.id`：本次生成的独立文件标识。
- `artifact.path`：相对于工作目录的 `.paperlab-output/<id>/article.docx`。
- `artifact.absolutePath`：同一运行主机上可读取的绝对路径。
- `artifact.mimeType`、`bytes`、`sha256`：文件类型、实际字节数和 SHA-256。
- `config`：实际生效的完整配置，命名颜色已转换为十六进制颜色。
- `input`：调用方指定的文稿相对路径。

对应输出目录同时保存 `layout.json` 和 `manifest.json`。
每次成功调用生成新 ID；当前没有按内容去重，相同稿件重复调用会保留多个版本。
插件仅负责产出文件，`artifact.id` 不是业务系统的素材 ID，绝对路径也不是公网下载地址。
后续接入时由调用方将实际文件交给系统，不能直接把这个 ID 当作系统资产。

失败返回 `ok:false` 和 `error.code/message`；MCP 同时返回 `isError:true`。
成功/失败结果均有 `structuredContent`，文本 `content` 里也包含同一份 JSON。
常见错误码为 `INVALID_ARGUMENT`、`OUTSIDE_WORKSPACE`、`FILE_NOT_FOUND`、`EXPORT_FAILED`、
`CANCELLED`、`BUSY`、`UNKNOWN_TOOL`（未知 MCP 工具名使用 JSON-RPC 参数错误）。
失败任务会清理其输出目录，已有成功产物保留。单个 MCP 进程同一时刻只运行一次导出，
遇到 `BUSY` 请等待前次调用完成再试，不能把错误结果当成成品。

## 入口二：JSON 命令行

如果 Muse 侧暂不使用 MCP，可以通过受控进程调用使用同一工具定义和实现。
程序调用使用参数数组，不拼接 shell 命令，不让模型提供可执行文件路径。

```bash
node scripts/agent.mjs --list-tools
node scripts/agent.mjs --workspace /absolute/path/to/article-workspace --request examples/agent-request.json
```

请求文件格式见 [调用示例](examples/agent-request.json)，顶层为 `name` 和 `arguments`。
省略 `--request` 时从 stdin 读取一个 JSON 对象，适合程序直接传入；请求限 1 MB。
stdout 输出单行结果 JSON，成功退出码 0，失败退出码 1。
无需将正文或凭据写进命令行，也不需要注册到当前业务系统。

Node 程序也可导入插件根目录 `agent-tools.js`，先 `await createToolRunner(workspace)`，
再调用返回的函数；`toolDefinitions` 提供同一份工具名和 JSON Schema。

## 建议给 Muse 的调用指令

> 在独立工作目录写好 Markdown 与图片。先调用 list_layout_styles 查询支持的排版参数，
> 再调用 format_article 生成 DOCX。检查 ok=true、文件大小和 SHA-256，保留实际配置。
> 失败时报告 error，不伪造文件路径，不用另外的转换器绕过错误。
> 本阶段只生成本地文档，不调用发布系统，不上传、不审批、不发表。

## 复现 Codex 验证

本机已安装并配置 Codex CLI 时，在插件目录执行：

```bash
pnpm run test:agent
pnpm test
pnpm run simulate:codex
```

最后一个命令会真实启动一次 Codex，使用现有本机身份和模型配置，产生正常的模型调用消耗。
它用命令行临时配置挂载本插件，保留用户现有 Codex 配置，不新增全局 MCP 配置或持久信任设置。
模拟工作区位于 `artifacts/codex-simulation-<timestamp>/`，包含样稿、测试配图、请求提示、
Codex JSONL 事件、最终回复和 `report.json`。脚本只把两次实际 MCP 调用成功且文件哈希一致视为成功。
测试配图用于验证图片嵌入，不能当成正式文章配图。
这些运行产物均被 Git 忽略；把插件交给 Muse 时请交付 Git 源码及锁文件，
在目标环境重新安装依赖；如需展示样例，另行附上本地 DOCX 和报告即可。

未验证 Muse 客户端的实际配置与调用、Word/公众号视觉渲染或正式系统接入。
插件可以排版内容，不负责事实核查、AI 改写和文章发布。
