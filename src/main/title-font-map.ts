/**
 * 模板 font 字段（中文）↔ 字体文件 ASCII 文件名。
 * 与 liying-app/utils/titleFonts.js、TitleFontRegistry.java 保持一致。
 */
export const TITLE_FONT_FILE_STEM_TO_FAMILY: Record<string, string> = {
  heiti: '黑体',
  kaiti: '楷体',
  lishu: '隶书',
  hyetht: '汉仪鹅头宋繁体',
  chunfeng: '字体家ai造字春风',
  guoxiang: '国祥手写体',
  sanji: '三极泼墨体',
  shishang: '时尚中黑简体',
  fangzheng: '方正粗谭黑简体',
}

/** 注册/加载字体时使用的 family 别名（去重） */
export function fontFamilyAliases(fileStem: string): string[] {
  const stem = fileStem.trim()
  if (!stem) return []
  const lower = stem.toLowerCase()
  const mapped = TITLE_FONT_FILE_STEM_TO_FAMILY[lower]
  const aliases = mapped ? [stem, mapped] : [stem]
  return [...new Set(aliases)]
}

/** list-assets-fonts / FontFace 应使用的 family（优先中文模板名） */
export function resolveTemplateFontFamily(fileStem: string): string {
  const stem = fileStem.trim()
  if (!stem) return '黑体'
  const mapped = TITLE_FONT_FILE_STEM_TO_FAMILY[stem.toLowerCase()]
  return mapped || stem
}
