import path from 'node:path';
import { realpath, stat, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { layoutOptions, layoutCatalog, validateLayout } from './layout.js';
import { exportArticle } from './scripts/export-core.mjs';

const configSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    ...Object.fromEntries(Object.entries(layoutOptions).map(([key, values]) => [key, { type: 'string', enum: values }])),
    accent: { type: 'string', description: '主题色预设 ID 或 #RRGGBB，预设 ID 见 list_layout_styles。' },
    footnotes: { type: 'boolean' },
  },
};
export const toolDefinitions = [
  {
    name: 'list_layout_styles', description: '列出可用主题、主题色、字体、代码配色、排版参数及默认值；只读，不调用 AI。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'format_article',
    description: '将工作目录内已有的 Markdown 文稿和本地图片排版成 DOCX。先写好 .md 文件，再传入相对于工作目录的 input；图片相对于文稿所在目录。不会上传、审批或发布文章。',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['input'],
      properties: {
        input: { type: 'string', minLength: 1, description: '工作目录内的 .md/.markdown 相对路径，例如 drafts/article.md。' },
        title: { type: 'string', maxLength: 200, description: '文章标题；省略时使用 Markdown 文件名。' },
        config: configSchema,
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
];

class ToolError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const within = (root, target) => {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
function objectOnly(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ToolError('INVALID_ARGUMENT', '工具参数必须是 JSON 对象');
}

export async function createToolRunner(workspace) {
  if (!workspace) throw new Error('必须通过 --workspace 指定插件允许访问的工作目录');
  const root = await realpath(workspace);
  if (!(await stat(root)).isDirectory()) throw new Error('工作目录必须是已存在的文件夹');
  let busy = false;
  return async function callTool(name, args = {}, { signal } = {}) {
    let job;
    try {
      objectOnly(args);
      if (name === 'list_layout_styles') {
        if (Object.keys(args).length) throw new ToolError('INVALID_ARGUMENT', '样式查询不接受额外参数');
        return { ok: true, workspace: root, ...layoutCatalog() };
      }
      if (name !== 'format_article') throw new ToolError('UNKNOWN_TOOL', '未知工具名称');
      if (Object.keys(args).some((key) => !['input', 'title', 'config'].includes(key))) throw new ToolError('INVALID_ARGUMENT', '存在未知工具参数');
      if (typeof args.input !== 'string' || !args.input || !/\.(md|markdown)$/i.test(args.input)) throw new ToolError('INVALID_ARGUMENT', 'input 必须是 .md 或 .markdown 相对路径');
      if (path.isAbsolute(args.input) || /^[a-z]:|\\/i.test(args.input)) throw new ToolError('OUTSIDE_WORKSPACE', 'input 必须使用工作目录内的相对路径');
      if (args.title !== undefined && (typeof args.title !== 'string' || args.title.length > 200)) throw new ToolError('INVALID_ARGUMENT', '标题必须是不超过 200 字符的文本');
      let config;
      try { config = validateLayout(args.config); }
      catch (error) { throw new ToolError('INVALID_ARGUMENT', error.message); }
      const candidate = path.resolve(root, args.input);
      if (!within(root, candidate)) throw new ToolError('OUTSIDE_WORKSPACE', '文稿路径不能超出工作目录');
      const input = await realpath(candidate);
      if (!within(root, input)) throw new ToolError('OUTSIDE_WORKSPACE', '文稿软链接不能指向工作目录外');
      if (!(await stat(input)).isFile()) throw new ToolError('INVALID_ARGUMENT', '文稿必须是普通文件');
      if (busy) throw new ToolError('BUSY', '已有文档正在生成，请完成后再重试');
      signal?.throwIfAborted();
      busy = true;
      try {
        const outputs = path.join(root, '.paperlab-output');
        await mkdir(outputs, { recursive: true, mode: 0o700 });
        if (!within(root, await realpath(outputs))) throw new ToolError('OUTSIDE_WORKSPACE', '输出目录不能指向工作目录外');
        const id = randomUUID();
        job = path.join(outputs, id);
        await mkdir(job, { mode: 0o700 });
        await writeFile(path.join(job, 'layout.json'), `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx' });
        const result = await exportArticle({ input, output: path.join(job, 'article.docx'), title: args.title, config, signal });
        const bytes = await readFile(result.output);
        const artifact = {
          id, path: path.relative(root, result.output).split(path.sep).join('/'), absolutePath: result.output,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
        };
        signal?.throwIfAborted();
        const response = { ok: true, artifact, config: result.config, input: args.input };
        await writeFile(path.join(job, 'manifest.json'), `${JSON.stringify(response, null, 2)}\n`, { flag: 'wx' });
        return response;
      } finally { busy = false; }
    } catch (error) {
      if (job) await rm(job, { recursive: true, force: true });
      return { ok: false, error: {
        code: signal?.aborted ? 'CANCELLED' : error.code === 'ENOENT' ? 'FILE_NOT_FOUND' : error instanceof ToolError ? error.code : 'EXPORT_FAILED',
        message: signal?.aborted ? '调用已取消' : error.code === 'ENOENT' ? '文稿或图片不存在' : error.message,
      } };
    }
  };
}
