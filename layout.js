// UI 和 AI 调用共用的样式目录，颜色在输出配置中统一为十六进制值。
export const articleThemes = {
  journal: ['清爽笔记', '底线标题 · 清晰留白'],
  editorial: ['人文杂志', '衬线阅读 · 侧线标题'],
  technical: ['技术专栏', '色底标题 · 清晰层次'],
  minimal: ['极简留白', '无框标题 · 轻量阅读'],
  classic: ['经典书刊', '宋体正文 · 居中标题'],
  business: ['商务报告', '分隔线条 · 正式稳重'],
  elegant: ['雅致手札', '楷体正文 · 细线引用'],
  bold: ['醒目专栏', '实色标题 · 重点突出'],
  notebook: ['阅读手记', '双线标题 · 柔和底色'],
};
export const accentPresets = {
  jade: ['翡翠绿', '#087f74'], forest: ['森林绿', '#237b4b'], mint: ['薄荷绿', '#167d8d'],
  blue: ['经典蓝', '#2563eb'], ocean: ['深海蓝', '#174d7a'], sky: ['晴空蓝', '#087eae'],
  indigo: ['靛青', '#4f46b8'], violet: ['罗兰紫', '#7952b3'], grape: ['葡萄紫', '#713b77'],
  red: ['中国红', '#bd3038'], rose: ['玫瑰红', '#b23865'], pink: ['樱花粉', '#ad4877'],
  orange: ['暖阳橙', '#b85a18'], amber: ['琥珀金', '#9a6b16'], brown: ['咖啡棕', '#8b623f'],
  slate: ['岩石灰', '#526477'], graphite: ['石墨黑', '#343a40'], olive: ['橄榄绿', '#6c762f'],
};
// 背景、文字和边框均为 Word 可识别的基础颜色，不依赖滤镜或伪元素。
export const codeThemes = {
  dark: ['经典深色', '#20352b', '#e1eee3', '#20352b'],
  light: ['清爽浅色', '#f1f4f7', '#263445', '#d6dee7'],
  warm: ['暖色纸张', '#faf2e5', '#67472a', '#e7d4b7'],
  github: ['GitHub 浅色', '#f6f8fa', '#24292f', '#d0d7de'],
  monokai: ['Monokai', '#272822', '#f8f8f2', '#49483e'],
  nord: ['Nord 冰川', '#2e3440', '#d8dee9', '#4c566a'],
  dracula: ['Dracula', '#282a36', '#f8f8f2', '#6272a4'],
  solarized: ['Solarized 纸色', '#fdf6e3', '#586e75', '#d6c9a4'],
};
export const layoutDefaults = Object.freeze({
  theme: 'journal', accent: '#087f74', fontSize: '16', lineHeight: '1.9',
  width: '375', footnotes: true, font: 'theme', codeTheme: 'dark', caption: 'none',
  captionFormat: 'plain', paragraphStyle: 'normal',
});
export const fontFamilies = {
  sans: '"Microsoft YaHei", sans-serif', serif: 'SimSun, "Songti SC", serif',
  kai: 'KaiTi, STKaiti, serif', fang: 'FangSong, STFangsong, serif',
  heiti: 'SimHei, "Heiti SC", sans-serif', deng: 'DengXian, sans-serif',
};
export const layoutOptions = {
  theme: Object.keys(articleThemes),
  fontSize: Array.from({ length: 13 }, (_, index) => String(index + 12)),
  lineHeight: ['1.5', '1.7', '1.9', '2.1', '2.3'], width: ['375', '480', '680'],
  font: ['theme', ...Object.keys(fontFamilies)],
  codeTheme: Object.keys(codeThemes), caption: ['none', 'alt', 'title'],
  captionFormat: ['plain', 'numbered'], paragraphStyle: ['normal', 'indent', 'compact'],
};
export function validateLayout(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('排版配置必须是对象');
  const result = { ...layoutDefaults };
  for (const [key, original] of Object.entries(input)) {
    if (!Object.hasOwn(layoutDefaults, key)) throw new Error(`未知排版参数：${key}`);
    const value = key === 'accent' && typeof original === 'string' && Object.hasOwn(accentPresets, original) ? accentPresets[original][1] : original;
    const valid = key === 'accent' ? typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
      : key === 'footnotes' ? typeof value === 'boolean' : layoutOptions[key].includes(value);
    if (!valid) throw new Error(`无效排版参数：${key}`);
    result[key] = value;
  }
  return result;
}
export function getLayout(state) {
  return Object.fromEntries(Object.keys(layoutDefaults).map((key) => [key, state[key]]));
}
