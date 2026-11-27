import { readFile, stat } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createToolRunner, toolDefinitions } from '../agent-tools.js';

try {
  const { values } = parseArgs({ options: {
    workspace: { type: 'string' }, request: { type: 'string' }, 'list-tools': { type: 'boolean' },
  } });
  let result;
  if (values['list-tools']) result = { ok: true, tools: toolDefinitions };
  else {
    let raw = '';
    if (values.request) {
      if ((await stat(values.request)).size > 1024 * 1024) throw new Error('请求超过 1 MB');
      raw = await readFile(values.request, 'utf8');
    } else {
      process.stdin.setEncoding('utf8');
      for await (const chunk of process.stdin) {
        raw += chunk.toString('utf8');
        if (Buffer.byteLength(raw) > 1024 * 1024) throw new Error('请求超过 1 MB');
      }
    }
    const request = JSON.parse(raw);
    if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some((key) => !['name', 'arguments'].includes(key))) throw new Error('请求格式为 {"name":"工具名","arguments":{}}');
    const callTool = await createToolRunner(values.workspace);
    result = await callTool(request.name, request.arguments);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: { code: 'INVALID_REQUEST', message: error.message } })}\n`);
  process.exitCode = 1;
}
