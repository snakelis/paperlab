import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { createToolRunner } from '../agent-tools.js';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'paperlab-agent-'));
  await mkdir(path.join(directory, 'images'));
  await copyFile(new URL('./fixtures/image.png', import.meta.url), path.join(directory, 'images/photo.png'));
  await writeFile(path.join(directory, 'article.md'), '## 钱包入门\n\n钱包里是**钥匙**。\n\n![本地图片](images/photo.png "钥匙说明")');
  return directory;
}
function mcp(workspace) {
  const child = spawn(process.execPath, ['scripts/mcp.mjs', '--workspace', workspace], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  let id = 0;
  const pending = new Map();
  const unsolicited = [];
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  createInterface({ input: child.stdout }).on('line', (line) => {
    const message = JSON.parse(line);
    const resolve = pending.get(message.id);
    if (resolve) { pending.delete(message.id); resolve(message); } else unsolicited.push(message);
  });
  child.on('exit', () => { for (const resolve of pending.values()) resolve({ error: { message: stderr || 'server exited' } }); pending.clear(); });
  return {
    child, unsolicited,
    request(method, params = {}) {
      const requestId = ++id;
      const result = new Promise((resolve) => pending.set(requestId, resolve));
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })}\n`);
      result.requestId = requestId;
      return result;
    },
    notify(method, params = {}) { child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`); },
    async close() { if (child.exitCode !== null) return; const closed = new Promise((resolve) => child.once('exit', resolve)); child.stdin.end(); await closed; assert.equal(stderr, ''); },
  };
}

test('独立 Agent 工具：生成含图 DOCX、结果校验与失败清理', { timeout: 90000 }, async () => {
  const directory = await fixture();
  try {
    const call = await createToolRunner(directory);
    const catalog = await call('list_layout_styles');
    assert.equal(Object.keys(catalog.colors).length, 18);
    const result = await call('format_article', { input: 'article.md', title: 'Agent 样稿', config: { theme: 'bold', accent: 'violet', caption: 'title', captionFormat: 'numbered' } });
    assert.equal(result.ok, true, JSON.stringify(result));
    const bytes = await readFile(result.artifact.absolutePath);
    assert.equal(result.artifact.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(result.artifact.bytes, bytes.length);
    assert.equal(result.config.accent, '#7952b3');
    const { stdout } = await exec('python3', ['-c', `
import sys,json,zipfile,xml.etree.ElementTree as E
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
 text=''.join(n.text or '' for n in E.fromstring(z.read('word/document.xml')).findall('.//w:t',ns))
 print(json.dumps({'text':text,'images':len([n for n in z.namelist() if n.startswith('word/media/') and not n.endswith('/')])},ensure_ascii=False))
`, result.artifact.absolutePath]);
    const doc = JSON.parse(stdout);
    assert.match(doc.text, /图 1：钥匙说明/);
    assert.equal(doc.images, 1);
    const manifest = JSON.parse(await readFile(path.join(path.dirname(result.artifact.absolutePath), 'manifest.json'), 'utf8'));
    assert.deepEqual(manifest, result);
    await writeFile(path.join(directory, 'bad.md'), '![坏图](images/missing.png)');
    const failed = await call('format_article', { input: 'bad.md' });
    assert.equal(failed.ok, false);
    assert.deepEqual(await readdir(path.join(directory, '.paperlab-output')), [result.artifact.id]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('工具边界：拒绝越界、软链接、任意输出、非法配置及取消请求', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'paperlab-boundary-'));
  const directory = path.join(parent, 'workspace');
  await mkdir(directory);
  try {
    await writeFile(path.join(parent, 'outside.md'), '外部内容');
    await symlink(path.join(parent, 'outside.md'), path.join(directory, 'link.md'));
    const call = await createToolRunner(directory);
    for (const input of ['../outside.md', path.join(parent, 'outside.md'), 'link.md']) {
      assert.equal((await call('format_article', { input })).error.code, 'OUTSIDE_WORKSPACE');
    }
    assert.equal((await call('format_article', { input: 'a.md', output: 'outside.docx' })).error.code, 'INVALID_ARGUMENT');
    assert.equal((await call('format_article', { input: 'a.md', config: { theme: 'unknown' } })).error.code, 'INVALID_ARGUMENT');
    assert.equal((await call('format_article', { input: 'missing.md' })).error.code, 'FILE_NOT_FOUND');
    assert.equal((await call('unknown')).error.code, 'UNKNOWN_TOOL');
    assert.equal((await call('list_layout_styles', [])).error.code, 'INVALID_ARGUMENT');
    await writeFile(path.join(directory, 'a.md'), '正文');
    const controller = new AbortController(); controller.abort();
    assert.equal((await call('format_article', { input: 'a.md' }, { signal: controller.signal })).error.code, 'CANCELLED');
    await symlink(parent, path.join(directory, '.paperlab-output'));
    assert.equal((await call('format_article', { input: 'a.md' })).error.code, 'OUTSIDE_WORKSPACE');
    assert.deepEqual((await readdir(parent)).sort(), ['outside.md', 'workspace']);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('JSON 调用入口支持 stdin 与文件请求，失败返回非零退出码', async () => {
  const directory = await fixture();
  try {
    const { stdout } = await exec(process.execPath, ['scripts/agent.mjs', '--list-tools'], { cwd: root });
    assert.deepEqual(JSON.parse(stdout).tools.map((tool) => tool.name), ['list_layout_styles', 'format_article']);
    const request = path.join(directory, 'request.json');
    await writeFile(request, JSON.stringify({ name: 'list_layout_styles', arguments: {} }));
    const fileCall = await exec(process.execPath, ['scripts/agent.mjs', '--workspace', directory, '--request', request], { cwd: root });
    assert.equal(JSON.parse(fileCall.stdout).ok, true);
    const child = spawn(process.execPath, ['scripts/agent.mjs', '--workspace', directory], { cwd: root });
    let output = ''; child.stdout.on('data', (chunk) => { output += chunk; });
    const closed = new Promise((resolve) => child.on('close', resolve));
    child.stdin.end(JSON.stringify({ name: 'list_layout_styles', arguments: {} }));
    assert.equal(await closed, 0);
    assert.equal(JSON.parse(output).ok, true);
    await writeFile(request, JSON.stringify({ name: 'format_article', arguments: { input: '../outside.md' } }));
    await assert.rejects(exec(process.execPath, ['scripts/agent.mjs', '--workspace', directory, '--request', request], { cwd: root }), (error) => error.code === 1 && JSON.parse(error.stdout).error.code === 'OUTSIDE_WORKSPACE');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('MCP 握手、发现、错误响应及真实 tools/call 导出', { timeout: 90000 }, async () => {
  const directory = await fixture();
  const client = mcp(directory);
  try {
    assert.equal((await client.request('tools/list')).error.code, -32000);
    const handshake = await client.request('initialize', { protocolVersion: '2025-11-25', clientInfo: { name: 'paperlab-test', version: '1.0' }, capabilities: {} });
    assert.equal(handshake.result.protocolVersion, '2025-11-25');
    client.notify('notifications/initialized');
    const list = await client.request('tools/list');
    assert.equal(list.result.tools.length, 2);
    const bad = await client.request('tools/call', { name: 'format_article', arguments: { input: '../outside.md' } });
    assert.equal(bad.result.isError, true);
    assert.equal(bad.result.structuredContent.error.code, 'OUTSIDE_WORKSPACE');
    const first = client.request('tools/call', { name: 'format_article', arguments: { input: 'article.md', config: { caption: 'alt' } } });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const second = await client.request('tools/call', { name: 'format_article', arguments: { input: 'article.md' } });
    assert.equal(second.result.structuredContent.error.code, 'BUSY');
    const good = await first;
    assert.equal(good.result.isError, false, JSON.stringify(good));
    assert.equal(good.result.structuredContent.ok, true);
    assert.equal(JSON.parse(good.result.content[0].text).artifact.sha256, good.result.structuredContent.artifact.sha256);
    const cancelled = client.request('tools/call', { name: 'format_article', arguments: { input: 'article.md' } });
    await new Promise((resolve) => setTimeout(resolve, 200));
    client.notify('notifications/cancelled', { requestId: cancelled.requestId, reason: '测试取消' });
    const cancelledResult = await cancelled;
    assert.equal(cancelledResult.result.structuredContent.error.code, 'CANCELLED');
    assert.deepEqual(await readdir(path.join(directory, '.paperlab-output')), [good.result.structuredContent.artifact.id]);
    const malformed = new Promise((resolve) => {
      const timer = setInterval(() => { if (client.unsolicited.length) { clearInterval(timer); resolve(client.unsolicited.shift()); } }, 10);
    });
    client.child.stdin.write('invalid json\n');
    assert.equal((await malformed).error.code, -32700);
    assert.equal((await client.request('missing')).error.code, -32601);
    assert.equal((await client.request('ping')).jsonrpc, '2.0');
  } finally { await client.close(); await rm(directory, { recursive: true, force: true }); }
});
