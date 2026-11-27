import { marked } from './node_modules/marked/lib/marked.esm.js';
import DOMPurify from './node_modules/dompurify/dist/purify.es.mjs';

import { layoutDefaults, fontFamilies, articleThemes, accentPresets, codeThemes, validateLayout, getLayout } from './layout.js';

const $ = (id) => document.getElementById(id);
const editor = $('editor');
const preview = $('preview');
const title = $('title');
// 保留原存储键，迁移项目目录与名称后仍可恢复已有浏览器草稿。
const STORAGE_KEY = 'wechat-markdown-lab:draft:v1';
// 标签页只切换设置面板，不改变文章配置与 Agent 接口。
const settingsTabs = [...document.querySelectorAll('.settings-tabs [role="tab"]')];
function selectSettingsTab(selected) {
  for (const tab of settingsTabs) {
    const active = tab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    tab.classList.toggle('active', active);
    const panel = $(tab.getAttribute('aria-controls'));
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  }
}
for (const [index, tab] of settingsTabs.entries()) {
  tab.addEventListener('click', () => selectSettingsTab(tab));
  tab.addEventListener('keydown', (event) => {
    let next;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      next = settingsTabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + settingsTabs.length) % settingsTabs.length];
    } else if (event.key === 'Home') next = settingsTabs[0];
    else if (event.key === 'End') next = settingsTabs.at(-1);
    if (!next) return;
    event.preventDefault();
    selectSettingsTab(next);
    next.focus();
  });
}

const connectionGuide = $('mcp-guide');
$('mcp-guide-button').addEventListener('click', () => {
  $('connection-copy-status').textContent = '';
  connectionGuide.showModal();
});
$('mcp-guide-close').addEventListener('click', () => connectionGuide.close());
for (const button of connectionGuide.querySelectorAll('[data-copy-target]')) {
  button.addEventListener('click', async () => {
    const status = $('connection-copy-status');
    button.disabled = true;
    try {
      await navigator.clipboard.writeText($(button.dataset.copyTarget).textContent);
      status.textContent = '已复制，可粘贴到终端或 AI 客户端。';
      status.dataset.error = 'false';
    } catch {
      status.textContent = '无法自动复制，请选中下方示例文本手动复制。';
      status.dataset.error = 'true';
    } finally { button.disabled = false; }
  });
}

const MAX_TEXT = 2 * 1024 * 1024;
const defaults = {
  title: '钱包里没有币：地址、私钥和助记词到底是什么关系',
  markdown: '', ...layoutDefaults, images: {},
};
let state = { ...defaults };
let renderTimer;
let toastTimer;

// Markdown 图片和 HTML 图片均在净化过程中解析本地素材，随后继续执行 URI 安全校验。
DOMPurify.addHook('uponSanitizeAttribute', (node, attribute) => {
  if (node.tagName === 'IMG' && attribute.attrName === 'src' && Object.hasOwn(state.images, attribute.attrValue)) {
    attribute.attrValue = state.images[attribute.attrValue];
  }
});

// 控件和 AI 样式目录来自同一份定义，避免新增选项只在界面中生效。
for (const [id, [name, description]] of Object.entries(articleThemes)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-card';
  button.dataset.theme = id;
  const swatch = document.createElement('span');
  swatch.className = `swatch ${id}`;
  swatch.textContent = 'Aa';
  const label = document.createElement('b');
  label.textContent = name;
  const hint = document.createElement('small');
  hint.textContent = description;
  button.append(swatch, label, hint);
  document.querySelector('.theme-options').append(button);
}
for (const [id, [name, color]] of Object.entries(accentPresets)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'accent-chip';
  button.dataset.accent = id;
  button.style.setProperty('--chip-color', color);
  button.setAttribute('aria-label', `${name} ${color}`);
  button.title = `${name} ${color}`;
  const dot = document.createElement('span');
  dot.setAttribute('aria-hidden', 'true');
  button.append(dot, document.createTextNode(name));
  button.addEventListener('click', () => {
    state.accent = color;
    syncAccent();
    render();
  });
  $('accent-presets').append(button);
}
for (const [id, [name]] of Object.entries(codeThemes)) $('codeTheme').add(new Option(name, id));

function syncAccent() {
  $('accent').value = state.accent;
  $('accent-value').textContent = state.accent.toUpperCase();
  const preset = Object.values(accentPresets).find(([, color]) => color.toLowerCase() === state.accent.toLowerCase());
  $('accent-name').textContent = preset ? preset[0] : '自定义';
  document.querySelectorAll('[data-accent]').forEach((button) => {
    button.setAttribute('aria-pressed', String(accentPresets[button.dataset.accent][1].toLowerCase() === state.accent.toLowerCase()));
  });
}

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
      ...Object.fromEntries(Object.entries(layoutDefaults).map(([key, fallback]) => {
        try { return [key, validateLayout({ [key]: saved[key] })[key]]; }
        catch { return [key, fallback]; }
      })),
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
  let captionNumber = 0;
  for (const image of preview.querySelectorAll('img')) {
    const text = state.caption === 'alt' ? image.alt : state.caption === 'title' ? image.title : '';
    if (text) {
      const caption = document.createElement('span');
      caption.className = 'image-caption';
      caption.textContent = state.captionFormat === 'numbered' ? `图 ${++captionNumber}：${text}` : text;
      image.after(caption);
    }
  }
  preview.dataset.codeTheme = state.codeTheme;
  preview.dataset.paragraphStyle = state.paragraphStyle;
  const [, codeBackground, codeText, codeBorder] = codeThemes[state.codeTheme];
  for (const [key, value] of Object.entries({ 'code-bg': codeBackground, 'code-text': codeText, 'code-border': codeBorder })) {
    preview.style.setProperty(`--${key}`, value);
  }
  const tint = (amount) => `rgb(${state.accent.slice(1).match(/../g).map((hex) => Math.round(parseInt(hex, 16) * (1 - amount) + 255 * amount)).join(', ')})`;
  preview.style.setProperty('--accent-soft', tint(.94));
  preview.style.setProperty('--accent-border', tint(.72));
  preview.style.fontFamily = fontFamilies[state.font] || '';
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
  syncAccent();
  $('font-size').value = state.fontSize;
  $('font-size-value').textContent = `${state.fontSize} px`;
  $('line-height').value = state.lineHeight;
  $('preview-width').value = state.width;
  $('footnotes').checked = state.footnotes;
  for (const field of ['font', 'codeTheme', 'caption', 'captionFormat', 'paragraphStyle']) $(field).value = state[field];
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
  state.theme = button.dataset.theme;
  state.markdown = editor.value;
  state.title = title.value;
  syncControls();
}));

for (const [id, field] of [['accent', 'accent'], ['font-size', 'fontSize'], ['line-height', 'lineHeight'], ['preview-width', 'width'], ['footnotes', 'footnotes'], ['font', 'font'], ['codeTheme', 'codeTheme'], ['caption', 'caption'], ['captionFormat', 'captionFormat'], ['paragraphStyle', 'paragraphStyle']]) {
  $(id).addEventListener('input', () => {
    state[field] = id === 'footnotes' ? $(id).checked : $(id).value;
    syncAccent();
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

$('reset-layout').addEventListener('click', () => {
  state = { ...state, ...layoutDefaults, markdown: editor.value, title: title.value };
  syncControls();
  notify('已重置排版，正文与图片已保留。');
});
$('download-config').addEventListener('click', () => {
  download(JSON.stringify(getLayout(state), null, 2), 'json', 'application/json');
});

// 受控的浏览器调用入口，CLI 与交互界面复用相同的预览和 DOCX 转换。
window.paperLab = Object.freeze({
  load({ markdown, title: documentTitle = '', config = {}, images = {} }) {
    if (typeof markdown !== 'string' || new TextEncoder().encode(markdown).length > MAX_TEXT) throw new Error('Markdown 必须是不超过 2 MB 的文本');
    if (typeof documentTitle !== 'string' || documentTitle.length > 200) throw new Error('标题必须是不超过 200 字符的文本');
    const layout = validateLayout(config);
    if (!images || typeof images !== 'object' || Array.isArray(images)) throw new Error('图片必须是对象');
    for (const [id, data] of Object.entries(images)) {
      if (!/^local-image:[\da-f-]+$/i.test(id) || typeof data !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(data) || data.length > 7 * 1024 * 1024) throw new Error('图片参数无效');
    }
    state = { ...defaults, ...layout, markdown, title: documentTitle, images: { ...images } };
    syncControls();
    return getLayout(state);
  },
  getConfig: () => getLayout(state),
  async exportDocx() {
    const html = inlineHTML();
    const { createDocx } = await import('./docx-export.js');
    return createDocx(html, title.value, preview.clientWidth);
  },
});

window.addEventListener('pagehide', save);
const saved = readSaved();
if (saved) { state = saved; syncControls(); window.paperLabReady = true; }
else {
  loadSample().catch(() => {
    syncControls();
    notify('示例文章加载失败，可自行粘贴 Markdown。请通过本地 HTTP 服务打开页面。', true);
  }).finally(() => { window.paperLabReady = true; });
}
