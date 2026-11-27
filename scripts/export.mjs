import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { exportArticle } from './export-core.mjs';
import { layoutCatalog } from '../layout.js';

try {
  const { values } = parseArgs({ options: {
    'list-styles': { type: 'boolean' }, input: { type: 'string' }, config: { type: 'string' }, output: { type: 'string' }, title: { type: 'string' },
  } });
  if (values['list-styles']) {
    process.stdout.write(`${JSON.stringify({ ok: true, ...layoutCatalog() })}\n`);
  } else {
    if (!values.input || !values.output || !/\.docx$/i.test(values.output)) throw new Error('用法：node scripts/export.mjs --input article.md --config layout.json --output article.docx [--title 标题]');
    const config = values.config ? JSON.parse(await readFile(values.config, 'utf8')) : {};
    const result = await exportArticle({ input: values.input, output: values.output, title: values.title, config });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exitCode = 1;
}
