// @ts-nocheck
/* eslint-disable */
import { useEffect } from 'react'
import { useVideoPageStore } from '../store/VideoPageStore'
import { useToast } from '../hooks/useToast'
import { useApplyAllEffects } from '../hooks/useApplyAllEffects'
import { templateService, llmService } from '../api'

const TTS_EMOTION_CUSTOM_VALUE = 'custom'
const DEFAULT_BGM_CARD_VOICE_VOLUME = 2
const DEFAULT_BGM_CARD_MUSIC_VOLUME = 0.6

const LANG_NAME_MAP: Record<string, string> = {
  zh: '中文',
  en: '英语',
  ja: '日语',
  ko: '韩语',
  es: '西班牙语',
  fr: '法语',
  de: '德语',
  pt: '葡萄牙语',
  ru: '俄语',
  ar: '阿拉伯语'
}

const getLanguageName = (code: string) => LANG_NAME_MAP[code] || code

function splitSubtitleByLanguage(text: string, lang: string): string {
  if (!text) return ''
  const isCJK = ['zh', 'ja', 'ko'].includes(lang)
  if (isCJK) {
    return text
      .replace(/[。！？；，：、]/g, '\n')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n')
  }
  return text
    .replace(/[.!?,;:]+\s*/g, '\n')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n')
}

function resolveTtsEmotionForPlugin(emotion: string, customText: string): string | null {
  if (!emotion) return null
  if (emotion === TTS_EMOTION_CUSTOM_VALUE) {
    const trimmed = (customText || '').trim().slice(0, 8)
    return trimmed || null
  }
  return emotion
}

function isUserCancelledPluginError(e: any): boolean {
  if (!e) return false
  const msg = e?.message || String(e)
  return (
    msg.includes('用户取消') ||
    msg.includes('user cancel') ||
    msg.includes('cancelled') ||
    msg.includes('abandoned')
  )
}

async function ensureAudioDuration(audioPath: string): Promise<number> {
  try {
    const audio = new Audio()
    const urlResult = await (window as any).api.getLocalFileUrl(audioPath)
    if (!urlResult.success) return 0
    audio.src = urlResult.url
    return new Promise((resolve) => {
      audio.onloadedmetadata = () => resolve(audio.duration || 0)
      audio.onerror = () => resolve(0)
      setTimeout(() => resolve(0), 5000)
    })
  } catch {
    return 0
  }
}

async function ensureMinDuration(startTime: number, minMs: number) {
  const elapsed = Date.now() - startTime
  if (elapsed < minMs) {
    await new Promise((r) => setTimeout(r, minMs - elapsed))
  }
}

async function fetchWhisperSegmentsFromCloud(audioPath: string, subtitle: string) {
  return (window as any).api.pluginProxyWhisperAlignRun({ audioPath, subtitle })
}

async function ensureWhisperSegmentsIfNeeded() {
  const s = useVideoPageStore.getState()
  if (s.whisperSegments?.length) return
  if (!s.generatedAudioPath || !s.subtitleText?.trim()) return
  try {
    const segments = await fetchWhisperSegmentsFromCloud(
      s.generatedAudioPath,
      s.subtitleText.trim()
    )
    useVideoPageStore.getState().setWhisperSegments(segments?.length ? segments : [])
  } catch (err) {
    console.log('ensureWhisperSegmentsIfNeeded failed:', err)
  }
}

function pickScriptForAutoFlow(state: any): { text: string; language: string } {
  const translated = (state.showTranslatedInTextarea && state.translatedText) || ''
  const rewritten = state.rewrittenScript?.trim() || ''
  const original = state.originalScript?.trim() || ''
  if (translated.trim()) return { text: translated.trim(), language: state.sourceLanguage }
  if (rewritten) return { text: rewritten, language: state.sourceLanguage }
  return { text: original, language: state.sourceLanguage }
}

export function AutoFlowBinder() {
  const showToast = useToast()
  const applyAllEffects = useApplyAllEffects()

  useEffect(() => {
    useVideoPageStore.getState().setRunAutoFlow(async () => {
      const store = useVideoPageStore.getState()
      if (store.autoFlowRunning) return

      const setStep = (step: string) => {
        useVideoPageStore.getState().setAutoFlowStep(step)
      }

      try {
        useVideoPageStore.getState().setAutoFlowRunning(true)

        // Step 1: Generate Audio
        setStep('audio')
        {
          const s = useVideoPageStore.getState()
          const { text: scriptContent, language: scriptLanguage } = pickScriptForAutoFlow(s)
          if (!scriptContent) throw new Error('音频生成失败：没有可用文案')

          const allVoices = [...(s.uploadedVoices || []), ...(s.builtinVoices || [])]
          if (allVoices.length === 0) throw new Error('音频生成失败：未找到任何音色')

          const voice = s.selectedVoiceId
            ? allVoices.find((v) => v.id === s.selectedVoiceId) ?? allVoices[0]
            : allVoices[0]

          const emotionPayload = resolveTtsEmotionForPlugin(
            s.ttsEmotion,
            s.ttsEmotionCustomText ?? ''
          )
          if (s.ttsEmotion === TTS_EMOTION_CUSTOM_VALUE && !emotionPayload) {
            throw new Error('音频生成失败：请填写情绪描述（最多8个字）')
          }

          const emotionWeight = Math.min(1, Math.max(0.1, Number(s.ttsEmotionWeight || 1)))
          const ttsSpeed = Math.min(2.0, Math.max(0.5, Number(s.ttsAudioSpeed ?? 1)))

          const audioUrl = await (window as any).api.pluginProxyTts2Run({
            referenceAudioPath: voice.path,
            scriptContent,
            emotion: emotionPayload,
            emotionWeight
          })

          const downloadResult = await (window as any).api.downloadAudioFromUrl(audioUrl, {
            silenceSeconds: 1,
            audioSpeed: ttsSpeed
          })

          if (!downloadResult.success || !downloadResult.file_path) {
            throw new Error(downloadResult.error || '下载音频失败')
          }

          useVideoPageStore.getState().setWhisperSegments([])
          useVideoPageStore.getState().setGeneratedAudioPath(downloadResult.file_path)
          useVideoPageStore
            .getState()
            .setSubtitleText(splitSubtitleByLanguage(scriptContent, scriptLanguage))

          const duration = await ensureAudioDuration(downloadResult.file_path)
          useVideoPageStore.getState().setAudioDuration(duration)

          // Generate title in parallel
          try {
            const s2 = useVideoPageStore.getState()
            if (scriptContent) {
              const langName = getLanguageName(s2.sourceLanguage)
              const { systemPrompt, userPrompts } = await templateService.getParsedTemplate(
                'title',
                { langName, scriptContent }
              )
              const messages = [
                { role: 'system' as const, content: systemPrompt },
                ...userPrompts.map((p) => ({ role: 'user' as const, content: p }))
              ]
              const data = await llmService.completion(s2.llmModel || 'DeepSeek', messages, {
                temperature: 0.8,
                max_tokens: 500
              })
              const content = (data?.data || data)?.choices?.[0]?.message?.content
              if (content) {
                const parsed = (() => {
                  try {
                    return JSON.parse(content.trim())
                  } catch {
                    return null
                  }
                })()
                const mTitle =
                  parsed?.mainTitle || content.match(/"mainTitle"\s*:\s*"([^"]+)"/)?.[1]
                const sTitle =
                  parsed?.subTitle || content.match(/"subTitle"\s*:\s*"([^"]+)"/)?.[1]
                if (mTitle) useVideoPageStore.getState().setMainTitle(mTitle)
                if (sTitle) useVideoPageStore.getState().setSubTitle(sTitle)
              }
            }
          } catch (e) {
            console.log('Auto generate title failed:', e)
          }
        }

        // Step 2: Generate Video
        setStep('video')
        {
          const s = useVideoPageStore.getState()
          if (!s.generatedAudioPath) throw new Error('视频生成失败：请先生成音频')

          const allVideos = [...(s.uploadedVideos || []), ...(s.builtinVideos || [])]
          if (allVideos.length === 0) throw new Error('视频生成失败：未找到任何视频素材')

          const selectedVideo = s.selectedVideoMaterialId
            ? allVideos.find((v) => v.id === s.selectedVideoMaterialId) ?? allVideos[0]
            : allVideos[0]

          // Get whisper segments
          try {
            const stateForWhisper = useVideoPageStore.getState()
            const subtitleSeed = (
              stateForWhisper.subtitleText ||
              pickScriptForAutoFlow(stateForWhisper).text ||
              ''
            ).trim()
            if (subtitleSeed) {
              const segments = await fetchWhisperSegmentsFromCloud(
                stateForWhisper.generatedAudioPath,
                subtitleSeed
              )
              console.log('Whisper 云端字词时间戳识别结果:', segments)
              useVideoPageStore.getState().setWhisperSegments(segments ?? [])
            } else {
              useVideoPageStore.getState().setWhisperSegments([])
            }
          } catch (err) {
            console.log('Whisper 云端字词时间戳识别失败，将使用均分时间:', err)
            useVideoPageStore.getState().setWhisperSegments([])
          }

          const videoUrl = await (window as any).api.pluginProxyVideoJobRun({
            audioPath: s.generatedAudioPath,
            videoPath: selectedVideo.path
          })

          const urlParts = String(videoUrl || '').split('/')
          const urlFileName = urlParts[urlParts.length - 1]?.split('?')[0]
          const fileName = urlFileName?.endsWith('.mp4')
            ? urlFileName
            : `generated_video_${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`

          const downloadResult = await (window as any).api.downloadVideoFromUrl(videoUrl, fileName)
          if (!downloadResult.success || !downloadResult.file_path) {
            throw new Error(downloadResult.error || '下载视频失败')
          }

          useVideoPageStore.getState().setGeneratedVideoPath(downloadResult.file_path)
          useVideoPageStore.getState().setFinalVideoPath(downloadResult.file_path)
          useVideoPageStore.getState().setOriginalVideoPath(downloadResult.file_path)
          useVideoPageStore.getState().resetInsertedEffectsState()

          const preview = await (window as any).api.getLocalFileUrl(downloadResult.file_path)
          if (preview.success) {
            useVideoPageStore.getState().setGeneratedVideoPreview(preview.url || '')
          }
        }

        // Step 3: Insert Title
        setStep('insertTitle')
        {
          const s = useVideoPageStore.getState()
          const styles = s.builtinTitleStyles || []
          if (styles.length > 0 && s.selectedTitleStyleId) {
            const pickedStyle =
              styles.find((x) => x.id === s.selectedTitleStyleId) ?? styles[0]
            const mainTitleText = (s.mainTitle || s.viralTitle || '').trim()
            if (mainTitleText) {
              useVideoPageStore.getState().setTitleEffectConfig({
                style: pickedStyle,
                mainTitleText,
                subTitleText: s.subTitle || ''
              })
              await applyAllEffects('title', { subtitle: true, bgm: true })
              const out = useVideoPageStore.getState().finalVideoPath
              if (out) useVideoPageStore.getState().setOriginalVideoPath(out)
            }
          }
        }

        // Step 4: Add Subtitle
        setStep('subtitle')
        {
          const subtitleStepStart = Date.now()
          const s = useVideoPageStore.getState()
          if (!s.subtitleText.trim()) {
            const { text: scriptContent, language: scriptLang } = pickScriptForAutoFlow(s)
            useVideoPageStore
              .getState()
              .setSubtitleText(splitSubtitleByLanguage(scriptContent, scriptLang))
          }

          useVideoPageStore.getState().setSubtitleEnabled(true)
          useVideoPageStore.getState().setSubtitleEffectConfig({
            text: useVideoPageStore.getState().subtitleText,
            font: s.subtitleFont || '黑体',
            fontSize: s.subtitleFontSize || 36,
            fontWeight: s.subtitleFontWeight || 400,
            color: s.subtitleColor || '#DE0202',
            strokeColor: s.subtitleStrokeColor || '#000000',
            bottomMargin: typeof s.subtitleBottomMargin === 'number' ? s.subtitleBottomMargin : 240
          })

          await ensureWhisperSegmentsIfNeeded()
          await applyAllEffects('subtitle', { title: true, bgm: true })
          await ensureMinDuration(subtitleStepStart, 5000)

          const out = useVideoPageStore.getState().finalVideoPath
          if (out) useVideoPageStore.getState().setOriginalVideoPath(out)
        }

        // Step 5: Add BGM
        setStep('bgm')
        {
          const bgmStepStart = Date.now()
          const s = useVideoPageStore.getState()
          const allBgms = [...(s.uploadedBgms || []), ...(s.builtinBgms || [])]
          if (allBgms.length === 0) throw new Error('插入BGM失败：未找到任何背景音乐')

          const picked = s.selectedBgmId
            ? allBgms.find((b) => b.id === s.selectedBgmId) ?? allBgms[0]
            : allBgms[0]

          useVideoPageStore.getState().setBgmEnabled(true)
          useVideoPageStore.getState().setBgmEffectConfig({
            selectedBgmId: picked.id,
            volume: DEFAULT_BGM_CARD_MUSIC_VOLUME,
            voiceVolume: DEFAULT_BGM_CARD_VOICE_VOLUME
          })

          await applyAllEffects('bgm', { title: true, subtitle: true })
          await ensureMinDuration(bgmStepStart, 5000)

          const out = useVideoPageStore.getState().finalVideoPath
          if (out) useVideoPageStore.getState().setOriginalVideoPath(out)
        }

        // Step 6: Publish
        setStep('publish')
        {
          // Generate viral title and tags if not present
          try {
            const sp = useVideoPageStore.getState()
            if (!(sp.viralTitle || '').trim() || !(sp.videoTags || '').trim()) {
              const { text: scriptContent } = pickScriptForAutoFlow(sp)
              if (scriptContent) {
                const langName = getLanguageName(sp.sourceLanguage)
                const { systemPrompt, userPrompts } = await templateService.getParsedTemplate(
                  'viral_title',
                  { langName, scriptContent }
                )
                const messages = [
                  { role: 'system' as const, content: systemPrompt },
                  ...userPrompts.map((p) => ({ role: 'user' as const, content: p }))
                ]
                const data = await llmService.completion(sp.llmModel || 'DeepSeek', messages, {
                  temperature: 0.8,
                  max_tokens: 500
                })
                const content = (data?.data || data)?.choices?.[0]?.message?.content
                if (content) {
                  const parsed = (() => {
                    try {
                      return JSON.parse(content.trim())
                    } catch {
                      return null
                    }
                  })()
                  const vTitle =
                    parsed?.viralTitle || content.match(/"viralTitle"\s*:\s*"([^"]+)"/)?.[1]
                  const vTags =
                    parsed?.videoTags || content.match(/"videoTags"\s*:\s*"([^"]+)"/)?.[1]
                  if (vTitle) useVideoPageStore.getState().setViralTitle(vTitle)
                  if (vTags) useVideoPageStore.getState().setVideoTags(vTags)
                }
              }
            }
          } catch (e) {
            console.log('Generate viral title failed:', e)
          }

          const s = useVideoPageStore.getState()
          const videoPath = s.finalVideoPath || s.generatedVideoPath || s.originalVideoPath
          if (!videoPath) throw new Error('发布失败：未找到可发布的视频')
          if (!s.viralTitle.trim()) throw new Error('发布失败：爆款标题为空')
          if (!s.videoTags.trim()) throw new Error('发布失败：视频标签为空')
          if (!s.publishPlatforms.length) {
            throw new Error('发布失败：请先选择至少一个发布平台')
          }

          const payload = {
            videoPath,
            title: s.viralTitle.trim(),
            description: s.videoTags.trim()
          }

          const results = await Promise.allSettled(
            s.publishPlatforms.map(async (platform) => ({
              platform,
              result: await (window as any).api.browserRunPublishFlow(platform, payload)
            }))
          )

          for (const r of results) {
            if (r.status === 'fulfilled') {
              const { platform, result } = r.value
              if (result?.success && result?.message) showToast(result.message, 'success')
              else if (result?.message) showToast(result.message, 'info')
              else if (result?.success) showToast(`已启动发布：${platform}`, 'success')
              else showToast(`发布失败：${platform}`, 'error')
            } else {
              showToast(
                `发布失败：${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
                'error'
              )
            }
          }
        }

        setStep('done')
        showToast('一键处理完成', 'success')
      } catch (e) {
        if (isUserCancelledPluginError(e)) {
          showToast('已取消', 'success')
          useVideoPageStore.getState().setAutoFlowStep('idle')
        } else {
          const msg = e instanceof Error ? e.message : String(e)
          useVideoPageStore.getState().setAutoFlowStep('error')
          showToast(msg, 'error')
        }
      } finally {
        useVideoPageStore.getState().setAutoFlowRunning(false)
      }
    })

    return () => {
      useVideoPageStore.getState().setRunAutoFlow(null)
    }
  }, [applyAllEffects, showToast])

  return null
}
