// @ts-nocheck
/* eslint-disable */
import { useCallback } from 'react'
import { useVideoPageStore } from '../store/VideoPageStore'
import { useToast } from './useToast'

const DEFAULT_BGM_CARD_VOICE_VOLUME = 2
const DEFAULT_BGM_CARD_MUSIC_VOLUME = 0.6

// Split text by break length into multiple lines
function splitTextByBreakLength(text: string, breakLength: number): string[] {
  if (!text || breakLength <= 0 || text.length < breakLength) {
    return [text]
  }
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

// Parse hex color with alpha (e.g. #000000dd) for canvas fillStyle
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

// Fill rounded rectangle at (x, y, w, h) with borderRadius
function fillRoundedRectAt(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (r <= 0) {
    ctx.fillRect(x, y, w, h)
    return
  }
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
}

// Draw a title text block on canvas with full alignment support (matches VideoGenerateCard.tsx drawTitleBlockOnCanvas)
function drawTitleBlockOnCanvas(ctx: CanvasRenderingContext2D, text: string, config: any, canvasWidth: number, yOffset: number): { boxHeight: number; totalHeight: number } {
  if (!text) return { boxHeight: 0, totalHeight: 0 }
  const fontSize = config.fontSize || 48
  const font = config.font || '黑体'
  const fontWeight = config.fontWeight ?? 400
  const color = config.color || '#FFFFFF'
  const strokeEnabled = config.strokeEnabled !== false && (config.strokeWidth ?? 0) > 0
  const strokeColor = config.strokeColor || '#000000'
  const strokeWidth = config.strokeWidth ?? 2
  const bgColor = config.backgroundColor || 'transparent'
  const borderRadius = config.borderRadius ?? 0
  const bgPaddingH = config.bgPaddingH ?? fontSize * 0.5
  const bgPaddingV = config.bgPaddingV ?? fontSize * 0.5
  const shadowEnabled = config.shadowEnabled || false
  const shadowColor = config.shadowColor || '#000000'
  const shadowOffsetX = config.shadowOffsetX ?? 2
  const shadowOffsetY = config.shadowOffsetY ?? 2
  const shadowBlur = config.shadowBlur ?? 0
  const alignH = config.alignH || 'center'
  const lineHeight = fontSize * 1.2
  const breakLength = config.breakLength
  const lines = breakLength != null && text.length >= breakLength
    ? splitTextByBreakLength(text, breakLength)
    : [text]
  ctx.font = `${fontWeight} ${fontSize}px "${font}"`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let maxW = 0
  for (const line of lines) {
    const w = ctx.measureText(line).width
    if (w > maxW) maxW = w
  }
  const textTotalHeight = lines.length * lineHeight
  const boxWidth = maxW + bgPaddingH * 2
  const boxHeight = textTotalHeight + bgPaddingV * 2
  let centerX: number
  if (alignH === 'left') {
    centerX = canvasWidth * 0.05 + boxWidth / 2
  } else if (alignH === 'right') {
    centerX = canvasWidth * 0.95 - boxWidth / 2
  } else {
    centerX = canvasWidth / 2
  }
  const centerY = yOffset + boxHeight / 2
  const hasBg = bgColor && bgColor !== 'transparent'
  if (hasBg) {
    ctx.save()
    ctx.fillStyle = parseColorForCanvas(bgColor)
    fillRoundedRectAt(ctx, centerX - boxWidth / 2, centerY - boxHeight / 2, boxWidth, boxHeight, borderRadius)
    ctx.restore()
  }
  const startY = centerY - textTotalHeight / 2 + lineHeight / 2
  for (let i = 0; i < lines.length; i++) {
    const ly = startY + i * lineHeight
    if (shadowEnabled) {
      ctx.shadowColor = shadowColor
      ctx.shadowOffsetX = shadowOffsetX
      ctx.shadowOffsetY = shadowOffsetY
      ctx.shadowBlur = shadowBlur
    }
    if (strokeEnabled) {
      ctx.shadowColor = 'transparent'
      ctx.save()
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.lineWidth = strokeWidth * 2
      ctx.strokeStyle = strokeColor
      ctx.strokeText(lines[i], centerX, ly)
      ctx.restore()
      if (shadowEnabled) {
        ctx.shadowColor = shadowColor
        ctx.shadowOffsetX = shadowOffsetX
        ctx.shadowOffsetY = shadowOffsetY
        ctx.shadowBlur = shadowBlur
      }
    }
    ctx.fillStyle = color
    ctx.fillText(lines[i], centerX, ly)
  }
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  return { boxHeight, totalHeight: boxHeight }
}

// Generate a combined 720x1280 title image with proper alignment (matches VideoGenerateCard.tsx)
async function generateCombinedTitleImage(styleConfig: any): Promise<{ dataUrl: string }> {
  const mainFont = styleConfig.mainTitle.font || '黑体'
  const mainWeight = styleConfig.mainTitle.fontWeight ?? 400
  const mainSize = styleConfig.mainTitle.fontSize ?? 48
  await document.fonts.load(`${mainWeight} ${mainSize}px "${mainFont}"`)
  if (styleConfig.hasSubTitle && styleConfig.subTitle) {
    const subFont = styleConfig.subTitle.font || '黑体'
    const subWeight = styleConfig.subTitle.fontWeight ?? 400
    const subSize = styleConfig.subTitle.fontSize ?? 36
    await document.fonts.load(`${subWeight} ${subSize}px "${subFont}"`)
  }
  const canvas = document.createElement('canvas')
  canvas.width = 720
  canvas.height = 1280
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建Canvas上下文')
  const mainConfig = styleConfig.mainTitle
  const mainText = styleConfig.mainTitleText || ''
  if (!mainText) return { dataUrl: canvas.toDataURL('image/png') }
  const alignV = mainConfig.alignV || 'top'
  const top = mainConfig.top ?? 100
  function calcMainHeight() {
    const fs = mainConfig.fontSize || 48
    const fw = mainConfig.fontWeight ?? 400
    const fn = mainConfig.font || '黑体'
    ctx!.font = `${fw} ${fs}px "${fn}"`
    const bl = mainConfig.breakLength
    const ls = bl != null && mainText.length >= bl
      ? splitTextByBreakLength(mainText, bl) : [mainText]
    const lh = fs * 1.2
    const pv = mainConfig.bgPaddingV ?? fs * 0.5
    return ls.length * lh + pv * 2
  }
  let mainY: number
  if (alignV === 'top') {
    mainY = top
  } else if (alignV === 'bottom') {
    mainY = 1280 - top - calcMainHeight()
  } else {
    mainY = (1280 - calcMainHeight()) / 2
  }
  ctx.save()
  const result = drawTitleBlockOnCanvas(ctx, mainText, mainConfig, 720, mainY)
  if (styleConfig.hasSubTitle && styleConfig.subTitle && styleConfig.subTitleText) {
    const subConfig = styleConfig.subTitle
    const subGap = subConfig.top ?? 0
    const subY = mainY + result.totalHeight + subGap
    drawTitleBlockOnCanvas(ctx, styleConfig.subTitleText, subConfig, 720, subY)
  }
  ctx.restore()
  return { dataUrl: canvas.toDataURL('image/png') }
}

// Compute line segments from whisper data
function computeLineSegmentsFromWhisper(whisperSegments: any[], fullText: string, audioDuration: number) {
  const text = fullText.trim()
  if (!text) return []
  // If audioDuration is 0/missing, try to derive from whisper segments
  let effectiveDuration = audioDuration
  if ((!effectiveDuration || effectiveDuration <= 0) && whisperSegments?.length > 0) {
    effectiveDuration = Math.max(...whisperSegments.map(s => s.end ?? 0))
  }
  if (!effectiveDuration || effectiveDuration <= 0) return []
  
  const sentences = text.split(/\n/).map(s => s.trim()).filter(s => s.length > 0)
  if (sentences.length === 0) return []
  
  const durationPerSentence = effectiveDuration / sentences.length
  const wordsWithOffset: any[] = []
  let charIdx = 0
  
  for (const seg of whisperSegments) {
    if (seg.words?.length) {
      for (const w of seg.words) {
        const len = (w.word ?? '').length
        wordsWithOffset.push({
          word: w.word,
          start: w.start,
          end: w.end,
          charStart: charIdx,
          charEnd: charIdx + len,
        })
        charIdx += len
      }
    } else {
      const segText = (seg.text ?? '').trim()
      const len = segText.length
      if (len > 0) {
        wordsWithOffset.push({
          word: segText,
          start: seg.start,
          end: seg.end,
          charStart: charIdx,
          charEnd: charIdx + len,
        })
        charIdx += len
      }
    }
  }
  
  const whisperFullText = wordsWithOffset.map(w => w.word).join('')
  
  const getTimeRangeForCharRange = (charStart: number, charEnd: number) => {
    const overlapping = wordsWithOffset.filter(w => w.charEnd > charStart && w.charStart < charEnd)
    if (overlapping.length === 0) return null
    return {
      start: Math.min(...overlapping.map(w => w.start)),
      end: Math.max(...overlapping.map(w => w.end)),
    }
  }
  
  const normToRaw = (normIdx: number, normText: string) => {
    let n = 0
    for (const w of wordsWithOffset) {
      const wNorm = w.word.replace(/\s/g, '').length
      if (n + wNorm > normIdx) return w.charStart + (normIdx - n)
      n += wNorm
    }
    return normText.length
  }
  
  const sentNormLengths = sentences.map(s => s.replace(/\s/g, '').length)
  const totalSentNorm = sentNormLengths.reduce((a, b) => a + b, 0) || 1
  const whisperNormText = whisperFullText.replace(/\s/g, '')
  const whisperNormLen = whisperNormText.length
  
  const startTimes: number[] = []
  const endTimes: number[] = []
  
  for (let i = 0; i < sentences.length; i++) {
    let startTime: number
    let endTime: number
    
    if (whisperSegments.length > 0 && wordsWithOffset.length > 0 && whisperFullText.length > 0 && whisperNormLen > 0) {
      const prevNorm = sentNormLengths.slice(0, i).reduce((a, b) => a + b, 0)
      const sentNormLen = sentNormLengths[i]
      const ratioStart = prevNorm / totalSentNorm
      const ratioEnd = (prevNorm + sentNormLen) / totalSentNorm
      const normStart = Math.min(Math.floor(ratioStart * whisperNormLen), whisperNormLen - 1)
      const normEnd = Math.min(Math.ceil(ratioEnd * whisperNormLen), whisperNormLen)
      const charStart = normToRaw(normStart, whisperNormText)
      const charEnd = normToRaw(normEnd, whisperNormText)
      const range = getTimeRangeForCharRange(charStart, charEnd)
      
      if (range) {
        startTime = range.start
        endTime = range.end
      } else {
        const fallback = getTimeRangeForCharRange(charStart, charStart + 1)
        startTime = fallback?.start ?? i * durationPerSentence
        endTime = fallback ? Math.min(fallback.end + 0.5, effectiveDuration) : Math.min((i + 1) * durationPerSentence, effectiveDuration)
      }
    } else if (whisperSegments.length > 0) {
      const base = whisperSegments[whisperSegments.length - 1].end
      const extra = i - whisperSegments.length
      const totalExtra = Math.max(1, sentences.length - whisperSegments.length)
      const extraDuration = Math.max(0, effectiveDuration - base) / totalExtra
      startTime = i < whisperSegments.length ? whisperSegments[i].start : base + extra * extraDuration
      endTime = i < whisperSegments.length ? whisperSegments[i].end : base + (extra + 1) * extraDuration
    } else {
      startTime = i * durationPerSentence
      endTime = Math.min((i + 1) * durationPerSentence, effectiveDuration)
    }
    
    startTimes.push(startTime)
    endTimes.push(endTime)
  }
  
  // Ensure no overlap
  for (let i = 0; i < sentences.length - 1; i++) {
    if (endTimes[i] >= startTimes[i + 1]) {
      const mid = (endTimes[i] + startTimes[i + 1]) / 2
      endTimes[i] = mid - 0.01
      startTimes[i + 1] = mid + 0.01
    }
  }
  
  return sentences.map((text, i) => ({
    text,
    start: startTimes[i],
    end: endTimes[i],
  }))
}

// Fetch whisper segments from cloud
async function fetchWhisperSegmentsFromCloud(audioPath: string, subtitle: string) {
  return (window as any).api.pluginProxyWhisperAlignRun({ audioPath, subtitle })
}

export function useApplyAllEffects() {
  const showToast = useToast()
  
  return useCallback(
    async (triggeredBy?: string, skip?: { title?: boolean; subtitle?: boolean; bgm?: boolean }) => {
      const store = useVideoPageStore.getState() as any
      const {
        originalVideoPath,
        generatedVideoPath,
        smartCutVideoPath,
        uploadedBgms,
        builtinBgms,
        subtitleEnabled,
        bgmEnabled,
        whisperSegments,
        generatedAudioPath,
        audioDuration,
        previewVideoRef,
        titleEffectConfig,
        subtitleEffectConfig,
        bgmEffectConfig,
        titleSegmentRange,
        setWhisperSegments,
      } = store

      const baseVideoPath = smartCutVideoPath || originalVideoPath || generatedVideoPath
      
      if (!baseVideoPath) {
        showToast?.('请先生成视频或选择视频文件', 'info')
        return
      }

      const hasTitle = !skip?.title && !!titleEffectConfig?.style && !!titleEffectConfig?.mainTitleText
      const skipSubtitle = skip ? skip.subtitle : !subtitleEnabled
      const hasAudioDuration = !!audioDuration && audioDuration > 0
      const hasWhisperFallback = !!whisperSegments?.length && whisperSegments.some(s => s.end > 0)
      const hasAudioPathFallback = !!generatedAudioPath
      const hasSubtitle = !skipSubtitle && !!subtitleEffectConfig?.text?.trim() && (hasAudioDuration || hasWhisperFallback || hasAudioPathFallback)
      const skipBgm = skip ? skip.bgm : !bgmEnabled
      const hasBgm = !skipBgm && !!bgmEffectConfig?.selectedBgmId


      if (!hasSubtitle && !hasTitle && !hasBgm) {
        const base = smartCutVideoPath || originalVideoPath || generatedVideoPath
        if (base) {
          try {
            const result = await (window as any).api?.getLocalFileUrl?.(base)
            if (!result?.success) throw new Error(result?.error || '无法播放')
            store.setFinalVideoPath?.(base)
            if (previewVideoRef?.current) previewVideoRef.current.load()
          } catch (e) {
            console.error('Failed to load video:', e)
          }
        }
        return
      }

      store.setActiveProcessingType?.(triggeredBy)
      store.setProcessingProgress?.(0)

      try {
        let currentVideoPath = baseVideoPath
        
        // Process title
        if (hasTitle && titleEffectConfig) {
          const currentTitleStyle = titleEffectConfig.style
          const mainTitleText = titleEffectConfig.mainTitleText
          const subTitleText = currentTitleStyle.hasSubTitle ? (titleEffectConfig.subTitleText ?? '') : undefined
          
          store.setProcessingProgress?.(10)
          
          const combinedResult = await generateCombinedTitleImage({
            mainTitle: currentTitleStyle.mainTitle || {
              font: '黑体',
              fontSize: 48,
              fontWeight: 400,
              color: '#FFFFFF',
              strokeColor: '#000000',
              top: 100,
              borderRadius: 0,
              backgroundColor: 'transparent',
            },
            subTitle: currentTitleStyle.subTitle,
            hasSubTitle: currentTitleStyle.hasSubTitle || false,
            mainTitleText,
            subTitleText,
          })
          
          store.setProcessingProgress?.(30)
          
          const rangeOk = titleSegmentRange != null &&
            typeof titleSegmentRange.start === 'number' &&
            typeof titleSegmentRange.end === 'number' &&
            titleSegmentRange.start < titleSegmentRange.end
          
          const titleResult = await (window as any).api.addTitleToVideo(
            baseVideoPath,
            combinedResult.dataUrl,
            undefined,
            {
              hasSubTitle: currentTitleStyle.hasSubTitle || false,
              mainTitle: currentTitleStyle.mainTitle,
              subTitle: currentTitleStyle.subTitle,
              combinedImage: true,
              ...(rangeOk ? { startTime: titleSegmentRange.start, endTime: titleSegmentRange.end } : {}),
            }
          )
          
          if (!titleResult.success || !titleResult.file_path) {
            throw new Error(titleResult.error || '添加标题失败')
          }
          
          currentVideoPath = titleResult.file_path
          store.setTitledVideoPath?.(titleResult.file_path)
          store.setProcessingProgress?.(40)
        }
        
        // Process subtitle
        if (hasSubtitle) {
          const subCfg = subtitleEffectConfig
          if (!subCfg) throw new Error('字幕配置缺失')
          
          store.setProcessingProgress?.(50)
          const subtitleInputPath = currentVideoPath
          
          let effectiveWhisperSegments = whisperSegments
          if (!effectiveWhisperSegments?.length && generatedAudioPath && subCfg.text?.trim()) {
            try {
              store.setProcessingProgress?.(52)
              const fetchPromise = fetchWhisperSegmentsFromCloud(generatedAudioPath, subCfg.text.trim())
              const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Whisper fetch timeout')), 15000))
              const segments = await Promise.race([fetchPromise, timeoutPromise]) as any[]
              if (segments?.length) {
                effectiveWhisperSegments = segments
                setWhisperSegments?.(segments)
              }
            } catch (err) {
              console.log('剩辑流程补齐 Whisper 字幕时间戳失败(将使用均匀分配):', err)
            }
          }
          
          const lineSegments = computeLineSegmentsFromWhisper(effectiveWhisperSegments || [], subCfg.text, audioDuration)
          
          if (lineSegments.length > 0) {
            store.setProcessingProgress?.(55)
            store.setAlreadySubtitled?.(true)
            
            const subtitleResult = await (window as any).api.addSubtitleToVideoCanvas(
              subtitleInputPath,
              {
                lineSegments: lineSegments.map(s => {
                  const breakLen = subCfg.breakLength ?? 0
                  let t = s.text
                  if (breakLen > 0 && t.length >= breakLen) {
                    t = splitTextByBreakLength(t, breakLen).join('\n')
                  }
                  return { text: t, start: s.start, end: s.end }
                }),
                style: {
                  font: subCfg.font,
                  fontSize: subCfg.fontSize,
                  fontWeight: subCfg.fontWeight,
                  color: subCfg.color,
                  strokeEnabled: subCfg.strokeEnabled,
                  strokeWidth: subCfg.strokeWidth,
                  strokeColor: subCfg.strokeColor,
                  shadowEnabled: subCfg.shadowEnabled,
                  shadowColor: subCfg.shadowColor,
                  shadowOffsetX: subCfg.shadowOffsetX,
                  shadowOffsetY: subCfg.shadowOffsetY,
                  shadowBlur: subCfg.shadowBlur,
                  bgEnabled: subCfg.bgEnabled,
                  bgColor: subCfg.bgColor,
                  bgOpacity: subCfg.bgOpacity,
                  bgBorderRadius: subCfg.bgBorderRadius,
                  bgPaddingH: subCfg.bgPaddingH,
                  bgPaddingV: subCfg.bgPaddingV,
                },
                alignment: subCfg.alignment,
                posX: subCfg.posX ?? null,
                posY: subCfg.posY ?? null,
                bottomMargin: subCfg.bottomMargin,
                entranceEffect: subCfg.entranceEffect ?? 'none',
              }
            )
            
            if (!subtitleResult.success || !subtitleResult.file_path) {
              throw new Error(subtitleResult.error || '添加字幕失败')
            }
            
            currentVideoPath = subtitleResult.file_path
            store.setSubtitledVideoPath?.(subtitleResult.file_path)
            store.setProcessingProgress?.(80)
          }
        }
        
        // Process BGM
        if (hasBgm) {
          store.setAlreadyBgmAdded?.(true)
          const bCfg = bgmEffectConfig
          if (!bCfg) throw new Error('BGM配置缺失')
          
          store.setProcessingProgress?.(85)
          const bgmInputPath = currentVideoPath
          const allBgms = [...(uploadedBgms || []), ...(builtinBgms || [])]
          const selectedBgmItem = allBgms.find(b => b.id === bCfg.selectedBgmId)
          
          if (selectedBgmItem) {
            const voiceVol = typeof bCfg.voiceVolume === 'number' && Number.isFinite(bCfg.voiceVolume)
              ? bCfg.voiceVolume
              : DEFAULT_BGM_CARD_VOICE_VOLUME
            
            const bgmResult = await (window as any).api.addBgmToVideo(
              bgmInputPath,
              selectedBgmItem.path,
              bCfg.volume,
              { voiceVolume: voiceVol }
            )
            
            if (!bgmResult.success || !bgmResult.file_path) {
              throw new Error(bgmResult.error || '添加BGM失败')
            }
            
            currentVideoPath = bgmResult.file_path
            store.setBgmedVideoPath?.(bgmResult.file_path)
          }
          
          store.setProcessingProgress?.(90)
        }
        
        store.setProcessingProgress?.(95)
        const result = await (window as any).api.getLocalFileUrl(currentVideoPath)
        if (!result.success) throw new Error(result.error || '无法播放')
        
        store.setFinalVideoPath?.(currentVideoPath)
        store.setProcessingProgress?.(100)
        
        if (previewVideoRef?.current) previewVideoRef.current.load()
        showToast?.('效果已应用成功！', 'success')
      } catch (error) {
        const err = error as Error
        console.error('应用效果失败:', err)
        showToast?.(`应用效果失败: ${err.message || '未知错误'}`, 'error')
      } finally {
        store.setActiveProcessingType?.(null)
        store.setProcessingProgress?.(0)
      }
    },
    [showToast]
  )
}
