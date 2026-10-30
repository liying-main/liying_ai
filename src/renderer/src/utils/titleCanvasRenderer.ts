/** 标题 Canvas 渲染（与字幕共用 720×1280 参考坐标系，scale = min(W/720, H/1280)） */

export const TITLE_REF_W = 720
export const TITLE_REF_H = 1280

export function splitTextByBreakLength(text: string, breakLength: number): string[] {
  if (!text || breakLength <= 0 || text.length < breakLength) return [text]
  const numLines = 2
  const result: string[] = []
  const baseLen = Math.floor(text.length / numLines)
  const remainder = text.length % numLines
  let idx = 0
  for (let i = 0; i < numLines; i++) {
    const lineLen = baseLen + (i < remainder ? 1 : 0)
    result.push(text.slice(idx, idx + lineLen))
    idx += lineLen
  }
  return result
}

function parseColorForCanvas(color: string): string {
  if (!color) return color
  if (color.length === 9 && color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    const a = parseInt(color.slice(7, 9), 16) / 255
    return `rgba(${r},${g},${b},${a.toFixed(3)})`
  }
  return color
}

function calcTextBlockHeight(
  ctx: CanvasRenderingContext2D,
  text: string,
  config: Record<string, any>,
  scale: number
): number {
  const fontSize = (config.fontSize ?? 48) * scale
  const fontWeight = config.fontWeight ?? 400
  const font = config.font || '黑体'
  ctx.font = `${fontWeight} ${fontSize}px "${font}"`
  const breakLen = config.breakLength
  const lines =
    breakLen != null && text.length >= breakLen
      ? splitTextByBreakLength(text, breakLen)
      : [text]
  const lineH = fontSize * 1.2
  const paddingV = (config.bgPaddingV ?? (config.fontSize ?? 48) * 0.5) * scale
  return lines.length * lineH + paddingV * 2
}

function drawScaledTextBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  config: Record<string, any>,
  canvasWidth: number,
  scale: number,
  yOffset: number,
  forceCenterX?: number
): { totalHeight: number } {
  if (!text) return { totalHeight: 0 }
  const fontSize = (config.fontSize ?? 48) * scale
  const fontWeight = config.fontWeight ?? 400
  const font = config.font || '黑体'
  const fontStr = `${fontWeight} ${fontSize}px "${font}"`
  const lineH = fontSize * 1.2
  const breakLen = config.breakLength
  const lines =
    breakLen != null && text.length >= breakLen
      ? splitTextByBreakLength(text, breakLen)
      : [text]
  ctx.font = fontStr
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let maxW = 0
  for (const line of lines) {
    const w = ctx.measureText(line).width
    if (w > maxW) maxW = w
  }
  const textTotalH = lines.length * lineH
  const paddingH = (config.bgPaddingH ?? (config.fontSize ?? 48) * 0.5) * scale
  const paddingV = (config.bgPaddingV ?? (config.fontSize ?? 48) * 0.5) * scale
  const boxW = maxW + paddingH * 2
  const boxH = textTotalH + paddingV * 2
  const alignH = config.alignH || 'center'
  let centerX: number
  if (forceCenterX != null) {
    centerX = forceCenterX
  } else if (alignH === 'left') {
    centerX = canvasWidth * 0.05 + boxW / 2
  } else if (alignH === 'right') {
    centerX = canvasWidth * 0.95 - boxW / 2
  } else {
    centerX = canvasWidth / 2
  }
  const centerY = yOffset + boxH / 2
  const bgColor = config.backgroundColor || 'transparent'
  if (bgColor && bgColor !== 'transparent') {
    ctx.save()
    ctx.fillStyle = parseColorForCanvas(bgColor)
    const bx = centerX - boxW / 2
    const by = centerY - boxH / 2
    const borderRadius = (config.borderRadius ?? 0) * scale
    if (borderRadius > 0) {
      const r = Math.min(borderRadius, boxW / 2, boxH / 2)
      ctx.beginPath()
      ctx.moveTo(bx + r, by)
      ctx.lineTo(bx + boxW - r, by)
      ctx.quadraticCurveTo(bx + boxW, by, bx + boxW, by + r)
      ctx.lineTo(bx + boxW, by + boxH - r)
      ctx.quadraticCurveTo(bx + boxW, by + boxH, bx + boxW - r, by + boxH)
      ctx.lineTo(bx + r, by + boxH)
      ctx.quadraticCurveTo(bx, by + boxH, bx, by + boxH - r)
      ctx.lineTo(bx, by + r)
      ctx.quadraticCurveTo(bx, by, bx + r, by)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.fillRect(bx, by, boxW, boxH)
    }
    ctx.restore()
  }
  const strokeEnabled = config.strokeEnabled !== false && (config.strokeWidth ?? 0) > 0
  const strokeWidth = (config.strokeWidth ?? 2) * scale
  const startY = centerY - textTotalH / 2 + lineH / 2
  for (let i = 0; i < lines.length; i++) {
    const ly = startY + i * lineH
    if (config.shadowEnabled) {
      ctx.shadowColor = config.shadowColor || '#000000'
      ctx.shadowOffsetX = (config.shadowOffsetX ?? 2) * scale
      ctx.shadowOffsetY = (config.shadowOffsetY ?? 2) * scale
      ctx.shadowBlur = (config.shadowBlur ?? 0) * scale
    }
    if (strokeEnabled) {
      ctx.shadowColor = 'transparent'
      ctx.save()
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.lineWidth = strokeWidth * 2
      ctx.strokeStyle = config.strokeColor || '#000000'
      ctx.strokeText(lines[i], centerX, ly)
      ctx.restore()
      if (config.shadowEnabled) {
        ctx.shadowColor = config.shadowColor || '#000000'
        ctx.shadowOffsetX = (config.shadowOffsetX ?? 2) * scale
        ctx.shadowOffsetY = (config.shadowOffsetY ?? 2) * scale
        ctx.shadowBlur = (config.shadowBlur ?? 0) * scale
      }
    }
    ctx.fillStyle = config.color || '#FFFFFF'
    ctx.fillText(lines[i], centerX, ly)
  }
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  return { totalHeight: boxH / scale }
}

export function renderTitleConfigOnCanvas(
  ctx: CanvasRenderingContext2D,
  config: Record<string, any>,
  canvasWidth: number,
  canvasHeight: number
): void {
  const scaleX = canvasWidth / TITLE_REF_W
  const scaleY = canvasHeight / TITLE_REF_H
  const scale = Math.min(scaleX, scaleY)
  const mainConfig = config.mainTitle ?? {}
  const mainText = config.mainTitleText || ''
  if (!mainText) return
  const alignV = mainConfig.alignV || 'top'
  const top = mainConfig.top ?? 100
  let mainY: number
  if (config.customPosY != null) {
    mainY = config.customPosY * scale
  } else if (alignV === 'top') {
    mainY = top * scale
  } else if (alignV === 'bottom') {
    mainY = canvasHeight - top * scale - calcTextBlockHeight(ctx, mainText, mainConfig, scale)
  } else {
    mainY = (canvasHeight - calcTextBlockHeight(ctx, mainText, mainConfig, scale)) / 2
  }
  const forceCenterX =
    config.customPosX != null ? config.customPosX * scaleX : undefined
  ctx.save()
  const result = drawScaledTextBlock(ctx, mainText, mainConfig, canvasWidth, scale, mainY, forceCenterX)
  if (config.hasSubTitle && config.subTitle && config.subTitleText) {
    const subConfig = config.subTitle
    const subGap = subConfig.top ?? 0
    const subY = mainY + result.totalHeight * scale + subGap * scale
    drawScaledTextBlock(ctx, config.subTitleText, subConfig, canvasWidth, scale, subY, forceCenterX)
  }
  ctx.restore()
}

export async function generateCombinedTitleImage(
  styleConfig: Record<string, any>,
  videoWidth = TITLE_REF_W,
  videoHeight = TITLE_REF_H
): Promise<{ dataUrl: string; nativeResolution: boolean }> {
  const scale = Math.min(videoWidth / TITLE_REF_W, videoHeight / TITLE_REF_H)
  const mainFont = styleConfig.mainTitle?.font || '黑体'
  const mainWeight = styleConfig.mainTitle?.fontWeight ?? 400
  const mainSize = Math.round((styleConfig.mainTitle?.fontSize ?? 48) * scale)
  await document.fonts.load(`${mainWeight} ${mainSize}px "${mainFont}"`)
  if (styleConfig.hasSubTitle && styleConfig.subTitle) {
    const subFont = styleConfig.subTitle.font || '黑体'
    const subWeight = styleConfig.subTitle.fontWeight ?? 400
    const subSize = Math.round((styleConfig.subTitle.fontSize ?? 36) * scale)
    await document.fonts.load(`${subWeight} ${subSize}px "${subFont}"`)
  }
  const canvas = document.createElement('canvas')
  canvas.width = videoWidth
  canvas.height = videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建Canvas上下文')
  if (!styleConfig.mainTitleText?.trim()) {
    return { dataUrl: canvas.toDataURL('image/png'), nativeResolution: true }
  }
  renderTitleConfigOnCanvas(
    ctx,
    {
      mainTitle: styleConfig.mainTitle,
      subTitle: styleConfig.subTitle,
      hasSubTitle: styleConfig.hasSubTitle,
      mainTitleText: styleConfig.mainTitleText,
      subTitleText: styleConfig.subTitleText,
      customPosX: styleConfig.customPosX,
      customPosY: styleConfig.customPosY,
    },
    videoWidth,
    videoHeight
  )
  return { dataUrl: canvas.toDataURL('image/png'), nativeResolution: true }
}
