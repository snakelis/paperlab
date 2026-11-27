// 使用同一份已净化、已排版的预览 HTML 生成真正的 OOXML 文档，图片嵌入 ZIP 包。
export async function createDocx(html, title, width) {
  const [{ Document, Packer }, { htmlToContent }] = await Promise.all([
    import('docx'), import('./node_modules/docx/dist/html.mjs'),
  ]);
  const container = document.createElement('section');
  container.innerHTML = html;
  for (const image of container.querySelectorAll('img')) {
    const source = image.getAttribute('src');
    const label = image.getAttribute('alt') || '未命名图片';
    try {
      if (!source || !['http:', 'https:', 'data:'].includes(new URL(source, location.href).protocol)) throw new Error();
      const response = await fetch(source, { credentials: 'omit', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      if (blob.size > 5 * 1024 * 1024) throw new Error();
      const bitmap = await createImageBitmap(blob);
      try {
        if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 24000000) throw new Error();
        // Word 不普遍支持 WebP；统一转为 PNG，同时冻结 GIF 当前交付的第一帧。
        const scale = Math.min(1, width / bitmap.width);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        image.src = canvas.toDataURL('image/png');
        const displayWidth = Math.max(1, Math.round(bitmap.width * scale));
        const displayHeight = Math.max(1, Math.round(bitmap.height * scale));
        image.setAttribute('width', displayWidth);
        image.setAttribute('height', displayHeight);
        image.style.width = `${displayWidth}px`;
        image.style.height = `${displayHeight}px`;
      } finally { bitmap.close(); }
    } catch {
      throw new Error(`图片“${label}”无法嵌入 Word，请用“插入图片”选择可读取的本地图片后重试。`);
    }
  }
  for (const element of [container, ...container.querySelectorAll('*')]) {
    const family = element.style.fontFamily;
    if (family) element.style.fontFamily = /SimHei|Heiti/i.test(family) ? '黑体' : /DengXian/i.test(family) ? '等线' : /KaiTi|STKaiti/i.test(family) ? '楷体' : /FangSong|STFangsong/i.test(family) ? '仿宋' : /Georgia|SimSun|Songti/i.test(family)
      ? '宋体' : /Consolas|monospace/i.test(family) ? 'Consolas' : '微软雅黑';
  }
  const warnings = [];
  const children = htmlToContent(container.innerHTML, {
    maxImageWidth: width,
    baseUrl: location.href,
    onWarning: (warning) => warnings.push(warning),
  });
  // 不静默导出丢图或缺少元素的文件，所有转换警告都交给用户处理。
  if (warnings.length) throw new Error(`Word 转换未完成：${warnings.map((warning) => warning.code).join('、')}。请检查文稿内容。`);
  const doc = new Document({
    title,
    creator: '纸间排版实验室',
    styles: { default: { document: { run: { font: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: '微软雅黑' } } } } },
    sections: [{
      // 页内正文宽度跟随当前预览，减少不同宽度造成的换行差异。
      properties: { page: { size: { width: Math.round(width * 15) + 1440, height: 16838 }, margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      children,
    }],
  });
  return Packer.toBlob(doc);
}
