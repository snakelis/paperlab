// UI 和 AI 调用共用的排版配置；只接受可稳定导出的设置。
export const layoutDefaults = Object.freeze({
  theme: 'journal', accent: '#087f74', fontSize: '16', lineHeight: '1.9',
  width: '375', footnotes: true, font: 'theme', codeTheme: 'dark', caption: 'none',
});
export const fontFamilies = {
  sans: '"Microsoft YaHei", sans-serif',
  serif: 'SimSun, "Songti SC", serif',
  kai: 'KaiTi, STKaiti, serif',
  fang: 'FangSong, STFangsong, serif',
};
const choices = {
  theme: ['journal', 'editorial', 'technical'],
  fontSize: ['14', '15', '16', '17', '18', '19', '20'],
  lineHeight: ['1.7', '1.9', '2.1'], width: ['375', '480', '680'],
  font: ['theme', ...Object.keys(fontFamilies)],
  codeTheme: ['dark', 'light', 'warm'], caption: ['none', 'alt', 'title'],
};
export function validateLayout(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('排版配置必须是对象');
  const result = { ...layoutDefaults };
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(layoutDefaults, key)) throw new Error(`未知排版参数：${key}`);
    const valid = key === 'accent' ? typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
      : key === 'footnotes' ? typeof value === 'boolean' : choices[key].includes(value);
    if (!valid) throw new Error(`无效排版参数：${key}`);
    result[key] = value;
  }
  return result;
}
export function getLayout(state) {
  return Object.fromEntries(Object.keys(layoutDefaults).map((key) => [key, state[key]]));
}
