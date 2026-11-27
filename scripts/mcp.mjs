import { parseArgs } from 'node:util';
import { createToolRunner, toolDefinitions } from '../agent-tools.js';

// MCP stdio：每行一条 JSON-RPC 消息，stdout 只承载协议内容。
const protocols = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const active = new Map();
const shutdown = () => { for (const controller of active.values()) controller.abort(); };
try {
  const { values } = parseArgs({ options: { workspace: { type: 'string' } } });
  const callTool = await createToolRunner(values.workspace);
  let initialized = false;
  const send = (value) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...value })}\n`);
  const error = (id, code, message) => send({ id, error: { code, message } });
  async function handle(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      error(null, -32600, 'Invalid Request'); return;
    }
    const { id, method, params = {} } = message;
    if (id === undefined) {
      if (method === 'notifications/cancelled') active.get(params?.requestId)?.abort();
      return;
    }
    if (!['string', 'number'].includes(typeof id) || active.has(id)) { error(null, -32600, 'Invalid request id'); return; }
    if (!params || typeof params !== 'object' || Array.isArray(params)) { error(id, -32602, 'Invalid params'); return; }
    if (method === 'initialize') {
      if (typeof params.protocolVersion !== 'string' || !params.clientInfo || !params.capabilities) { error(id, -32602, 'Invalid initialize params'); return; }
      initialized = true;
      send({ id, result: {
        protocolVersion: protocols.includes(params.protocolVersion) ? params.protocolVersion : protocols[0],
        serverInfo: { name: 'paperlab', version: '0.1.0' }, capabilities: { tools: {} },
        instructions: '仅在指定工作目录内排版。先写 Markdown 和本地图片，再调用 format_article。不会上传、审批或发布文章。',
      } });
    } else if (method === 'ping') send({ id, result: {} });
    else if (!initialized) error(id, -32000, 'Initialize first');
    else if (method === 'tools/list') send({ id, result: { tools: toolDefinitions } });
    else if (method === 'tools/call') {
      if (typeof params.name !== 'string') { error(id, -32602, 'Missing tool name'); return; }
      if (!toolDefinitions.some((tool) => tool.name === params.name)) { error(id, -32602, 'Unknown tool'); return; }
      const controller = new AbortController();
      active.set(id, controller);
      try {
        const result = await callTool(params.name, params.arguments, { signal: controller.signal });
        send({ id, result: { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: !result.ok } });
      } catch { error(id, -32603, 'Internal error'); }
      finally { active.delete(id); }
    } else error(id, -32601, 'Method not found');
  }
  let pending = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    pending += chunk;
    if (Buffer.byteLength(pending) > 1024 * 1024) {
      error(null, -32600, 'Message exceeds 1 MB');
      shutdown(); process.stdin.destroy(); process.exitCode = 1; return;
    }
    let index;
    while ((index = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, index).trim();
      pending = pending.slice(index + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); }
      catch { error(null, -32700, 'Parse error'); continue; }
      void handle(message).catch(() => error(message?.id ?? null, -32603, 'Internal error'));
    }
  });
  process.stdin.on('end', shutdown);
  process.on('SIGTERM', () => { shutdown(); process.stdin.destroy(); });
  process.on('SIGINT', () => { shutdown(); process.stdin.destroy(); });
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
  process.exitCode = 1;
}
