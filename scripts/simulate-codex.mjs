import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const workspace = path.join(root, 'artifacts', `codex-simulation-${Date.now()}`);
await mkdir(path.join(workspace, 'images'), { recursive: true });
await copyFile(path.join(root, 'tests/fixtures/image.png'), path.join(workspace, 'images/test.png'));
await writeFile(path.join(workspace, 'wallet.md'), `${await readFile(path.join(root, 'sample.md'), 'utf8')}\n\n![插图嵌入测试](images/test.png "本地测试配图，非正式文章配图")\n`);
const schema = {
  type: 'object', additionalProperties: false,
  properties: { ok: { type: 'boolean' }, path: { type: 'string' }, sha256: { type: 'string' } },
  required: ['ok', 'path', 'sha256'],
};
await writeFile(path.join(workspace, 'response.schema.json'), JSON.stringify(schema));
const prompt = `本次仅模拟调用独立排版插件。工作目录是 ${workspace}，已有 wallet.md 和 images/test.png。禁止访问、连接或修改任何业务系统，禁止上传、审批或发布；不要读取凭据或配置，不修改插件代码，不使用 shell 来绕过 MCP。
请通过 paperlab MCP 工具完成以下工作：先调用 list_layout_styles 查看支持的样式，再调用 format_article，input 为 wallet.md，标题为“钱包入门 · Codex 插件调用验证”，config 使用 theme=bold、accent=violet、font=sans、fontSize="18"、width="480"、codeTheme=nord、caption=title、captionFormat=numbered、paragraphStyle=indent。
工具出错应如实返回失败。成功后只按指定 JSON schema 返回 ok=true、工具结果中的 artifact.absolutePath 和 artifact.sha256。`;
await writeFile(path.join(workspace, 'prompt.txt'), prompt);
const args = ['exec', '--ephemeral', '--json', '--color', 'never', '--sandbox', 'workspace-write', '-C', workspace,
  '-c', 'approval_policy="never"',
  '-c', `projects.${JSON.stringify(root.replace(/\/$/, ''))}.trust_level="trusted"`,
  '-c', `projects.${JSON.stringify(workspace)}.trust_level="trusted"`,
  '-c', `mcp_servers.paperlab.command=${JSON.stringify(process.execPath)}`,
  '-c', `mcp_servers.paperlab.args=${JSON.stringify([path.join(root, 'scripts/mcp.mjs'), '--workspace', workspace])}`,
  '--output-schema', path.join(workspace, 'response.schema.json'), '-o', path.join(workspace, 'codex-result.json'), '-'];
const child = spawn('codex', args, { cwd: workspace, stdio: ['pipe', 'pipe', 'pipe'] });
let events = '';
let stderr = '';
child.stdout.on('data', (chunk) => { events += chunk; });
child.stderr.on('data', (chunk) => { stderr += chunk; });
const timeout = setTimeout(() => child.kill('SIGTERM'), 240000);
child.stdin.end(prompt);
let report;
try {
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  await writeFile(path.join(workspace, 'codex-events.jsonl'), events);
  await writeFile(path.join(workspace, 'codex-stderr.log'), stderr);
  const parsed = events.split('\n').filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  const calls = parsed.filter((event) => event.type === 'item.completed' && event.item?.type === 'mcp_tool_call')
    .map((event) => ({ server: event.item.server, tool: event.item.tool, status: event.item.status, result: event.item.result }));
  if (code !== 0) throw new Error(`Codex CLI 退出码 ${code}，详细日志保存在模拟目录`);
  const result = JSON.parse(await readFile(path.join(workspace, 'codex-result.json'), 'utf8'));
  const relative = path.relative(workspace, result.path);
  if (!result.ok || path.isAbsolute(relative) || relative.startsWith('..')) throw new Error('Codex 未返回工作目录内的成功产物');
  const bytes = await readFile(result.path);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== result.sha256) throw new Error('Codex 返回的文件哈希不匹配');
  if (!['list_layout_styles', 'format_article'].every((tool) => calls.some((call) => call.server === 'paperlab' && call.tool === tool && call.status === 'completed'))) throw new Error('日志未包含两次成功的 MCP 工具调用');
  report = { ok: true, client: 'Codex CLI', workspace, calls: calls.map(({ server, tool, status }) => ({ server, tool, status })), artifact: { path: result.path, bytes: bytes.length, sha256: hash } };
} catch (error) {
  report = { ok: false, client: 'Codex CLI', workspace, error: error.message };
  process.exitCode = 1;
} finally { clearTimeout(timeout); }
await writeFile(path.join(workspace, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report)}\n`);
