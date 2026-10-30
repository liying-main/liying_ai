// @ts-nocheck
/* eslint-disable */
import { useCallback } from 'react'
import { useVideoPageStore } from '../store/VideoPageStore'
import { useToast } from './useToast'
import { ensureWhisperSegmentsIfNeeded } from '../pages/Video/VideoSharedComponents'
import { generateCombinedTitleImage } from '../utils/titleCanvasRenderer'

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

// Generate a combined title image (delegates to titleCanvasRenderer — same scale as subtitle)
async function _generateCombinedTitleImageForVideo(
  styleConfig: any,
  videoPath: string
): Promise<{ dataUrl: string; nativeResolution: boolean }> {
  let videoWidth = 720
  let videoHeight = 1280
  try {
    const dims = await (window as any).api?.getVideoDimensions?.(videoPath)
    if (dims?.width && dims?.height) {
      videoWidth = dims.width
      videoHeight = dims.height
    }
  } catch (err) {
    console.warn('[applyAllEffects] getVideoDimensions failed, using 720x1280:', err)
  }
  return generateCombinedTitleImage(styleConfig, videoWidth, videoHeight)
}

// Strip punctuation for alignment character counting
const _ALIGN_PUNCT_RE_TS = /[\s，。！？；：、…—.!?;:,\uff0c\uff01\uff1f\uff1a\uff1b\u3001\u2026\u2014"''\"\u201c\u201d\u2018\u2019]/g
function _stripPunctCountTs(s: string): number {
  return Math.max(s.replace(_ALIGN_PUNCT_RE_TS, '').length, 1)
}
function _postProcessAlignedTs(out: { text: string; start: number; end: number }[], audioEnd: number) {
  if (!out.length) return out
  const LINGER = 1.5
  for (let i = 0; i < out.length - 1; i++) {
    const g = out[i + 1].start - out[i].end
    if (g > 0 && g <= LINGER) out[i].end = out[i + 1].start
    else if (g > LINGER) out[i].end = out[i].end + LINGER
  }
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i].end > out[i + 1].start) out[i + 1].start = out[i].end
  }
  if (audioEnd > 0 && out[out.length - 1].end < audioEnd) {
    out[out.length - 1].end = audioEnd
  }
  return out
}

// Compute line segments from whisper data using segment-boundary snapping
function computeLineSegmentsFromWhisper(whisperSegments: any[], fullText: string, audioDuration: number) {
  const text = fullText.trim()
  if (!text) return []
  let effectiveDuration = audioDuration
  if ((!effectiveDuration || effectiveDuration <= 0) && whisperSegments?.length > 0) {
    effectiveDuration = Math.max(...whisperSegments.map(s => s.end ?? 0))
  }
  if (!effectiveDuration || effectiveDuration <= 0) return []
  
  const sentences = text.split(/\n/).map(s => s.trim()).filter(s => s.length > 0)
  if (sentences.length === 0) return []

  // Parse ASR segments
  const segs: { text: string; start: number; end: number; chars: number }[] = []
  for (const seg of (whisperSegments || [])) {
    const t = (seg.text ?? '').trim()
    const st = typeof seg.start === 'number' ? seg.start : 0
    let en = typeof seg.end === 'number' ? seg.end : st
    if (en < st) en = st
    segs.push({ text: t, start: st, end: en, chars: _stripPunctCountTs(t) })
  }

  if (segs.length === 0) {
    const per = effectiveDuration / sentences.length
    return sentences.map((s, i) => ({ text: s, start: i * per, end: (i + 1) * per }))
  }

  const audioEnd = segs[segs.length - 1].end

  // Fast path: 1:1 mapping (backend already post-processed timestamps)
  if (segs.length === sentences.length) {
    return segs.map((sg, i) => ({ text: sentences[i], start: sg.start, end: sg.end }))
  }

  // General case: per-segment interpolation (monotonic ordering guaranteed)
  let totalUnits = 0
  const timeline = segs.map(sg => {
    const item = { su: totalUnits, eu: totalUnits + sg.chars, st: sg.start, et: sg.end }
    totalUnits += sg.chars
    return item
  })

  function unitToTime(unit: number): number {
    if (unit <= 0) return timeline[0].st
    if (unit >= totalUnits) return timeline[timeline.length - 1].et
    for (const item of timeline) {
      if (unit < item.eu) {
        const span = Math.max(item.eu - item.su, 1)
        const frac = (unit - item.su) / span
        return item.st + frac * (item.et - item.st)
      }
      if (unit === item.eu) return item.et
    }
    return timeline[timeline.length - 1].et
  }

  const subUnits = sentences.map(s => _stripPunctCountTs(s))
  const subTotal = subUnits.reduce((a, b) => a + b, 0)

  if (subTotal === 0 || totalUnits === 0) {
    const per = effectiveDuration / sentences.length
    return sentences.map((s, i) => ({ text: s, start: i * per, end: (i + 1) * per }))
  }

  const out: { text: string; start: number; end: number }[] = []
  let cursor = 0
  for (let idx = 0; idx < sentences.length; idx++) {
    const startPos = cursor / subTotal * totalUnits
    cursor += subUnits[idx]
    const endPos = cursor / subTotal * totalUnits
    let st = unitToTime(startPos)
    let et = unitToTime(endPos)
    if (et <= st) et = st + 0.01
    out.push({ text: sentences[idx], start: st, end: et })
  }

  return out
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
        smartCutBaseVideoPath,
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

      const baseVideoPath = smartCutBaseVideoPath || originalVideoPath || generatedVideoPath
      
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

      console.log('[applyAllEffects] hasTitle:', hasTitle, 'hasSubtitle:', hasSubtitle, 'hasBgm:', hasBgm,
        'skipBgm:', skipBgm, 'bgmEnabled:', bgmEnabled, 'bgmEffectConfig:', bgmEffectConfig,
        'subtitleEffectConfig?.text:', !!subtitleEffectConfig?.text,
        'audioDuration:', audioDuration, 'hasWhisperFallback:', hasWhisperFallback, 'hasAudioPathFallback:', hasAudioPathFallback)

      if (!hasSubtitle && !hasTitle && !hasBgm) {
        const base = smartCutBaseVideoPath || originalVideoPath || generatedVideoPath
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
        showToast?.('没有可应用的效果（请检查字幕/标题/BGM配置）', 'info')
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
          
          const combinedResult = await _generateCombinedTitleImageForVideo({
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
            customPosX: titleEffectConfig.customPosX ?? null,
            customPosY: titleEffectConfig.customPosY ?? null,
          }, baseVideoPath)
          
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
              nativeResolution: combinedResult.nativeResolution,
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
          const subtitleAlignText = (subCfg.text ?? '').trim()

          await ensureWhisperSegmentsIfNeeded({ subtitleText: subtitleAlignText })
          let effectiveWhisperSegments = useVideoPageStore.getState().whisperSegments
          if (!effectiveWhisperSegments?.length && generatedAudioPath && subtitleAlignText) {
            try {
              store.setProcessingProgress?.(52)
              const fetchPromise = fetchWhisperSegmentsFromCloud(generatedAudioPath, subtitleAlignText)
              const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Whisper fetch timeout')), 15000))
              const segments = await Promise.race([fetchPromise, timeoutPromise]) as any[]
              if (segments?.length) {
                effectiveWhisperSegments = segments
                setWhisperSegments?.(segments)
                useVideoPageStore.getState().setWhisperAlignedSubtitleText(subtitleAlignText)
              }
            } catch (err) {
              console.log('剩辑流程补齐 Whisper 字幕时间戳失败(将使用均匀分配):', err)
            }
          }
          
          const subtitleText = subCfg.text
          const lineCount = subtitleText?.split(/\n/).map(s => s.trim()).filter(s => s.length > 0).length ?? 0
          console.log('[applyAllEffects subtitle] whisperSegments:', effectiveWhisperSegments?.length,
            'subtitleLines:', lineCount, 'audioDuration:', audioDuration,
            'countMatch:', effectiveWhisperSegments?.length === lineCount)
          if (effectiveWhisperSegments?.length) {
            console.log('[applyAllEffects subtitle] first whisper seg:', JSON.stringify(effectiveWhisperSegments[0]))
            console.log('[applyAllEffects subtitle] last whisper seg:', JSON.stringify(effectiveWhisperSegments[effectiveWhisperSegments.length - 1]))
          }
          const lineSegments = computeLineSegmentsFromWhisper(effectiveWhisperSegments || [], subtitleText, audioDuration)
          console.log('[applyAllEffects subtitle] computed lineSegments:', lineSegments.length,
            lineSegments.length > 0 ? `first: ${lineSegments[0].start.toFixed(2)}-${lineSegments[0].end.toFixed(2)}` : '',
            lineSegments.length > 1 ? `last: ${lineSegments[lineSegments.length-1].start.toFixed(2)}-${lineSegments[lineSegments.length-1].end.toFixed(2)}` : '')
          
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
