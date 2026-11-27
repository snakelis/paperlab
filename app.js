import { marked } from './node_modules/marked/lib/marked.esm.js';
import DOMPurify from './node_modules/dompurify/dist/purify.es.mjs';

const $ = (id) => document.getElementById(id);
const editor = $('editor');
const preview = $('preview');
const title = $('title');
const STORAGE_KEY = 'wechat-markdown-lab:draft:v1';
const MAX_TEXT = 2 * 1024 * 1024;
const defaults = {
  title: '钱包里没有币：地址、私钥和助记词到底是什么关系',
  markdown: '', theme: 'journal', accent: '#087f74', fontSize: '16',
  lineHeight: '1.9', width: '375', footnotes: true, images: {},
};
let state = { ...defaults };
let renderTimer;
let toastTimer;

function notify(message, error = false) {
  const status = $('status');
  status.textContent = message;
  status.dataset.error = String(error);
  status.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { status.hidden = true; }, 5000);
}

function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved.markdown !== 'string' || saved.markdown.length > MAX_TEXT) return null;
    return {
      title: typeof saved.title === 'string' ? saved.title.slice(0, 200) : defaults.title,
      markdown: saved.markdown,
      theme: ['journal', 'editorial', 'technical'].includes(saved.theme) ? saved.theme : defaults.theme,
      accent: /^#[0-9a-f]{6}$/i.test(saved.accent) ? saved.accent : defaults.accent,
      fontSize: ['14', '15', '16', '17', '18', '19', '20'].includes(saved.fontSize) ? saved.fontSize : defaults.fontSize,
      lineHeight: ['1.7', '1.9', '2.1'].includes(saved.lineHeight) ? saved.lineHeight : defaults.lineHeight,
      width: ['375', '480', '680'].includes(saved.width) ? saved.width : defaults.width,
      footnotes: typeof saved.footnotes === 'boolean' ? saved.footnotes : defaults.footnotes,
      images: Object.fromEntries(Object.entries(saved.images || {}).filter(([id, data]) =>
        /^local-image:[\da-f-]+$/i.test(id) && typeof data === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(data))),
    };
  } catch {
    notify('无法读取本机草稿，可继续编辑并下载备份。', true);
    return null;
  }
}

function save() {
  state.markdown = editor.value;
  state.title = title.value;
  const images = Object.fromEntries(Object.entries(state.images).filter(([id]) => editor.value.includes(id)));
  try {
    // 内存保留图片以便编辑撤销；落盘只保存当前文稿实际引用的图片。
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, images }));
    $('save-state').textContent = '已保存到本机';
  } catch {
    $('save-state').textContent = '本机保存失败，请下载备份';
  }
}

function render() {
  clearTimeout(renderTimer);
  const tokens = marked.lexer(editor.value, { gfm: true });
  marked.walkTokens(tokens, (token) => {
    if (token.type === 'image' && Object.hasOwn(state.images, token.href)) token.href = state.images[token.href];
  });
  const safeHTML = DOMPurify.sanitize(marked.parser(tokens), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'input', 'form', 'button', 'iframe', 'video', 'audio'],
    FORBID_ATTR: ['style', 'class', 'id', 'name'],
  });
  preview.innerHTML = safeHTML;
  if (title.value.trim()) {
    const heading = document.createElement('h1');
    heading.textContent = title.value;
    preview.prepend(heading);
  }

  const references = [];
  for (const link of preview.querySelectorAll('a')) {
    const href = link.getAttribute('href') || '';
    if (state.footnotes && /^https?:\/\//i.test(href) && !/^https?:\/\/mp\.weixin\.qq\.com(?:\/|$)/i.test(href)) {
      const number = references.push({ text: link.textContent, href });
      const marker = document.createElement('sup');
      marker.textContent = `[${number}]`;
      link.replaceWith(...link.childNodes, marker);
    } else {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  }
  if (references.length) {
    const section = document.createElement('section');
    section.className = 'references';
    const heading = document.createElement('p');
    heading.textContent = '参考链接';
    section.append(heading);
    references.forEach(({ text, href }, index) => {
      const item = document.createElement('p');
      item.textContent = `[${index + 1}] ${text}：${href}`;
      section.append(item);
    });
    preview.append(section);
  }
  preview.dataset.theme = state.theme;
  preview.style.setProperty('--accent', state.accent);
  preview.style.fontSize = `${state.fontSize}px`;
  preview.style.lineHeight = state.lineHeight;
  document.querySelector('.paper').style.width = `${state.width}px`;
  $('preview-size').textContent = `${state.width} px`;
  const count = [...preview.textContent.replace(/\s/g, '')].length;
  $('word-count').textContent = `${count.toLocaleString('zh-CN')} 字符 · 约 ${Math.max(1, Math.ceil(count / 400))} 分钟阅读`;
  save();
}

function syncControls() {
  title.value = state.title;
  editor.value = state.markdown;
  $('accent').value = state.accent;
  $('accent-value').textContent = state.accent.toUpperCase();
  $('font-size').value = state.fontSize;
  $('font-size-value').textContent = `${state.fontSize} px`;
  $('line-height').value = state.lineHeight;
  $('preview-width').value = state.width;
  $('footnotes').checked = state.footnotes;
  document.querySelectorAll('[data-theme].theme-card').forEach((button) => {
    const active = button.dataset.theme === state.theme;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  render();
}

// shortcut: 标准 Markdown + 公众号基础 HTML，不处理公式、Mermaid 和语法高亮；需要时再单独验证。
const inlineProperties = [
  'display', 'color', 'background-color', 'font-family', 'font-size', 'font-style', 'font-weight',
  'line-height', 'letter-spacing', 'text-align', 'text-decoration', 'text-indent',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius',
  'border-collapse', 'border-spacing', 'list-style-type', 'list-style-position',
  'white-space', 'overflow-wrap', 'word-break', 'vertical-align',
];

function inlineHTML() {
  render();
  const copy = preview.cloneNode(true);
  const sourceNodes = [preview, ...preview.querySelectorAll('*')];
  const targetNodes = [copy, ...copy.querySelectorAll('*')];
  sourceNodes.forEach((source, index) => {
    const target = targetNodes[index];
    const computed = getComputedStyle(source);
    target.removeAttribute('style');
    target.removeAttribute('class');
    target.removeAttribute('id');
    target.removeAttribute('data-theme');
    inlineProperties.forEach((property) => {
      target.style.setProperty(property, computed.getPropertyValue(property));
    });
    if (['TABLE', 'IMG'].includes(source.tagName)) {
      target.style.width = source.tagName === 'TABLE' ? '100%' : 'auto';
      target.style.maxWidth = '100%';
    }
    if (source.tagName === 'TABLE') target.style.tableLayout = 'fixed';
    if (source.tagName === 'IMG') target.style.height = 'auto';
  });
  // 公众号正文使用 section 容器；不携带编辑器界面或预览外框。
  const section = document.createElement('section');
  section.setAttribute('style', copy.getAttribute('style'));
  section.append(...copy.childNodes);
  return section.outerHTML;
}

function download(content, extension, mime, documentTitle = title.value) {
  const fileName = (documentTitle.trim() || '未命名文章').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 100);
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function insert(text) {
  editor.setRangeText(text, editor.selectionStart, editor.selectionEnd, 'end');
  editor.focus();
  render();
}

async function loadSample() {
  const response = await fetch('./sample.md');
  if (!response.ok) throw new Error('示例文章加载失败');
  state = { ...defaults, markdown: await response.text() };
  syncControls();
}

editor.addEventListener('input', () => {
  $('save-state').textContent = '编辑中…';
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 160);
});
title.addEventListener('input', render);
document.querySelectorAll('.theme-card').forEach((button) => button.addEventListener('click', () => {
  const themeDefaults = { journal: '#087f74', editorial: '#9b6c36', technical: '#426da8' };
  state.theme = button.dataset.theme;
  state.accent = themeDefaults[state.theme];
  state.markdown = editor.value;
  state.title = title.value;
  syncControls();
}));

for (const [id, field] of [['accent', 'accent'], ['font-size', 'fontSize'], ['line-height', 'lineHeight'], ['preview-width', 'width'], ['footnotes', 'footnotes']]) {
  $(id).addEventListener('input', () => {
    state[field] = id === 'footnotes' ? $(id).checked : $(id).value;
    $('accent-value').textContent = state.accent.toUpperCase();
    $('font-size-value').textContent = `${state.fontSize} px`;
    render();
  });
}

$('import-button').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (!/\.(md|markdown)$/i.test(file.name) || file.size > MAX_TEXT) {
    notify('请导入不超过 2 MB 的 .md 或 .markdown 文件。', true);
    return;
  }
  if (editor.value.trim() && !confirm('导入会替换当前正文。未另存的内容将被覆盖，是否继续？')) return;
  try {
    editor.value = await file.text();
    title.value = file.name.replace(/\.(md|markdown)$/i, '').slice(0, 200);
    render();
    notify('Markdown 已导入，可继续编辑和排版。');
  } catch { notify('文件读取失败，当前文稿保持不变。', true); }
});
$('image-button').addEventListener('click', () => $('image-file').click());
async function insertImages(files) {
  for (const file of files) {
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      notify('请选择不超过 5 MB 的 PNG、JPEG、WebP 或 GIF 图片。', true);
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      let data;
      try {
        if (bitmap.width * bitmap.height > 24000000) throw new Error();
        if (['image/webp', 'image/gif'].includes(file.type)) {
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext('2d').drawImage(bitmap, 0, 0);
          data = canvas.toDataURL('image/png');
        } else {
          data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        }
      } finally { bitmap.close(); }
      const label = file.name.replace(/[\[\]<>\r\n]/g, '_');
      const id = `local-image:${crypto.randomUUID()}`;
      state.images = { ...state.images, [id]: data };
      insert(`\n\n![${label}](${id})\n\n`);
    } catch {
      notify('图片无法读取或超过 2400 万像素，请使用有效图片重试。', true);
      return;
    }
  }
  notify('图片已放入正文并预览，导出 Word 时会一同嵌入；动图使用静态首帧。');
}
$('image-file').addEventListener('change', (event) => {
  const files = [...event.target.files];
  event.target.value = '';
  if (files.length) insertImages(files);
});
editor.addEventListener('paste', (event) => {
  const files = [...event.clipboardData.files].filter((file) => file.type.startsWith('image/'));
  if (files.length) { event.preventDefault(); insertImages(files); }
});
editor.addEventListener('dragover', (event) => {
  if (event.dataTransfer.types.includes('Files')) event.preventDefault();
});
editor.addEventListener('drop', (event) => {
  const files = [...event.dataTransfer.files].filter((file) => file.type.startsWith('image/'));
  if (files.length) { event.preventDefault(); insertImages(files); }
});
$('table-button').addEventListener('click', () => insert('\n\n| 项目 | 说明 |\n| --- | --- |\n| 内容 | 内容 |\n\n'));
$('sample-button').addEventListener('click', async () => {
  if (!confirm('恢复示例会替换当前文稿和排版设置，是否继续？')) return;
  try { await loadSample(); notify('已恢复你的钱包文章示例。'); }
  catch { notify('示例文章加载失败，当前文稿保持不变。', true); }
});
$('download-markdown').addEventListener('click', () => {
  render();
  // 正文原样导出；标题使用文件名承载，避免重复插入标题。
  const portable = editor.value.replace(/local-image:[\da-f-]+/gi, (id) => state.images[id] || id);
  download(portable, 'md', 'text/markdown;charset=utf-8');
  notify('Markdown 已导出；本机插图已内嵌，可随文稿一起保存。');
});
$('download-html').addEventListener('click', () => {
  const safeTitle = document.createElement('span');
  safeTitle.textContent = title.value;
  const html = `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeTitle.innerHTML}</title></head><body style="margin:0;padding:24px;max-width:680px;margin-left:auto;margin-right:auto;background:#fff">${inlineHTML()}</body></html>`;
  download(html, 'html', 'text/html;charset=utf-8');
  notify('HTML 已导出：含内联样式，无需编辑器和外部 CSS。');
});
$('download-docx').addEventListener('click', async () => {
  const button = $('download-docx');
  const html = inlineHTML();
  const documentTitle = title.value;
  const width = preview.clientWidth;
  button.disabled = true;
  button.textContent = '正在生成 Word…';
  try {
    const { createDocx } = await import('./docx-export.js');
    const blob = await createDocx(html, documentTitle, width);
    download(blob, 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', documentTitle);
    notify('Word 已导出：正文、基础样式和图片均已写入文档。');
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Word 导出失败，请重试。', true);
  } finally {
    button.disabled = false;
    button.textContent = '导出 Word .docx';
  }
});
$('copy').addEventListener('click', async () => {
  const button = $('copy');
  const html = inlineHTML();
  const text = preview.innerText;
  button.disabled = true;
  try {
    if (window.isSecureContext && navigator.clipboard?.write && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })]);
    } else {
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;left:-99999px;top:0';
      container.innerHTML = html;
      document.body.append(container);
      const selection = window.getSelection();
      const ranges = Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange());
      try {
        const range = document.createRange();
        range.selectNodeContents(container);
        selection.removeAllRanges();
        selection.addRange(range);
        if (!document.execCommand('copy')) throw new Error('clipboard denied');
      } finally {
        selection.removeAllRanges();
        ranges.forEach((range) => selection.addRange(range));
        container.remove();
      }
    }
    notify('已复制排版后的文章，可到公众号编辑器粘贴。');
  } catch {
    notify('浏览器未允许复制。请使用 localhost 打开，或先导出 HTML。', true);
  } finally { button.disabled = false; }
});

window.addEventListener('pagehide', save);
const saved = readSaved();
if (saved) { state = saved; syncControls(); }
else {
  loadSample().catch(() => {
    syncControls();
    notify('示例文章加载失败，可自行粘贴 Markdown。请通过本地 HTTP 服务打开页面。', true);
  });
}
