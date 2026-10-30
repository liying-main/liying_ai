// @ts-nocheck
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useSettingsStore } from './SettingsStore'

// Cache for local server base URL
let _localServerBaseUrl: string | null = null
let _cloudResourcesPromise: Promise<void> | null = null
const REMOTE_URL_RE = /^https?:\/\//i

function isRemoteUrl(value: unknown): value is string {
  return typeof value === 'string' && REMOTE_URL_RE.test(value)
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0)
}

async function ensureCloudResourcesReady(): Promise<void> {
  if (_cloudResourcesPromise) return _cloudResourcesPromise
  _cloudResourcesPromise = (async () => {
    try {
      const ready = await (window as any).api?.isCloudResourcesReady?.()
      if (ready) return
      const result = await (window as any).api?.ensureCloudResources?.()
      if (result && result.success === false) {
        console.warn('[Resources] Cloud resources unavailable:', result.error)
      }
    } catch (error) {
      console.warn('[Resources] Cloud resources check failed:', error)
    }
  })()
  return _cloudResourcesPromise
}

async function getAssetsBaseUrl(): Promise<string> {
  if (_localServerBaseUrl !== null) return _localServerBaseUrl
  try {
    const url = await (window as any).api?.getLocalServerBaseUrl?.()
    _localServerBaseUrl = url || ''
  } catch {
    _localServerBaseUrl = ''
  }
  return _localServerBaseUrl
}

// Helper to load config from assets - uses IPC in Electron, fetch in dev
async function loadAssetsConfig(path: string) {
  try {
    await ensureCloudResourcesReady()
    // Try local server URL first (works in both dev and production)
    const baseUrl = await getAssetsBaseUrl()
    if (baseUrl) {
      const res = await fetch(`${baseUrl}/assets/${path}`)
      if (res.ok) return await res.json()
    }
    // Fallback to relative path (dev mode with Vite)
    const res = await fetch(`/assets/${path}`)
    if (!res.ok) throw new Error(`Failed to load ${path}`)
    return await res.json()
  } catch (e) {
    console.error(`Failed to load assets config: ${path}`, e)
    return null
  }
}

// Build voices list with paths (matching original main process logic)
async function loadBuiltinVoicesFromAssets() {
  const cfg = await loadAssetsConfig('voices/builtin_voices_config.json')
  if (!cfg?.voices) return []
  const baseUrl = await getAssetsBaseUrl()
  const prefix = baseUrl ? `${baseUrl}/assets` : '/assets'
  const voices = await Promise.all(cfg.voices.map(async (v: any) => {
    const ext = v.id.startsWith('voice') ? '.wav' : '.mp3'
    const configuredPath = firstString(v.path, v.url, v.audioUrl, v.src)
    const voicePath = configuredPath || `${prefix}/voices/${encodeURIComponent(v.id)}${ext}`
    // 公开分发不附带内置录音；仅把实际存在的本地资源显示为可用。
    // 这里不请求第三方音频地址，避免打开工作台时自动联系外部服务。
    if (configuredPath && !configuredPath.startsWith(`${prefix}/`)) return null
    try {
      const response = await fetch(voicePath, { method: 'HEAD' })
      if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/')) return null
    } catch {
      return null
    }
    return {
      id: v.id,
      name: v.name || v.id,
      path: voicePath,
      promptText: v.promptText || ''
    }
  }))
  return voices.filter(Boolean)
}

// Build BGMs list with paths
async function loadBuiltinBgmsFromAssets() {
  const cfg = await loadAssetsConfig('bgms/builtin_bgms_config.json')
  if (!cfg?.bgms) return []
  const baseUrl = await getAssetsBaseUrl()
  const prefix = baseUrl ? `${baseUrl}/assets` : '/assets'
  return cfg.bgms.map((b: any) => ({
    id: b.id,
    name: b.name || b.id,
    path: firstString(b.path, b.url, b.audioUrl, b.src) || `${prefix}/bgms/${b.id}.mp3`,
    category: b.category || ''
  }))
}

// Build videos list with paths and cover URL
async function loadBuiltinVideosFromAssets() {
  const cfg = await loadAssetsConfig('videos/builtin_videos_config.json')
  if (!cfg?.videos) return []
  const baseUrl = await getAssetsBaseUrl()
  const prefix = baseUrl ? `${baseUrl}/assets` : '/assets'
  return cfg.videos.map((v: any) => {
    const encodedId = encodeURIComponent(v.id)
    const videoPath = firstString(v.path, v.url, v.videoUrl, v.src) || `${prefix}/videos/${encodedId}.mp4`
    const coverUrl = firstString(v.coverUrl, v.cover, v.poster)
    return {
      id: v.id,
      name: v.name || v.id,
      path: videoPath,
      coverUrl: coverUrl || videoPath
    }
  })
}


interface VideoPageState {
  // Video paths
  originalVideoPath: string
  generatedVideoPath: string
  titledVideoPath: string
  subtitledVideoPath: string
  bgmedVideoPath: string
  smartCutVideoPath: string
  smartCutBaseVideoPath: string
  finalVideoPath: string
  generatedVideoPreview: string

  // Script content
  originalScript: string
  rewrittenScript: string
  translatedText: string
  sourceLanguage: string
  targetLanguage: string
  preTranslationLanguage: string
  llmModel: string
  llmModels: { value: string; label: string }[]

  // Titles
  mainTitle: string
  subTitle: string
  viralTitle: string
  videoTags: string

  // Audio
  generatedAudioPath: string
  audioDuration: number
  selectedVoiceId: string
  ttsAudioSpeed: number
  ttsEmotion: string
  ttsEmotionWeight: number
  ttsEmotionCustomText: string
  showTranslatedInTextarea: boolean
  flowMode: string

  // Subtitles
  subtitleText: string
  whisperSegments: any[]
  /** 上次 Whisper 对齐时使用的字幕文案；与 subtitleText 不一致时需重新对齐 */
  whisperAlignedSubtitleText: string
  subtitleFont: string
  subtitleFontSize: number
  subtitleFontWeight: number
  subtitleColor: string
  subtitleStrokeColor: string
  subtitleBottomMargin: number
  subtitleEntranceEffect: string
  subtitleEnabled: boolean

  // BGM
  selectedBgmId: string
  bgmEnabled: boolean
  alreadySubtitled: boolean
  alreadyBgmAdded: boolean

  // Effect configs
  titleEffectConfig: any | null
  subtitleEffectConfig: any | null
  bgmEffectConfig: any | null

  // Smart Cut segments
  mixSegments: any[]
  pipSegments: any[]
  bgmSegmentRange: { start: number; end: number } | null
  pipRect: { x: number; y: number; width: number; height: number } | null
  mainVideoRect: { x: number; y: number; width: number; height: number }
  mainVideoBgColor: string
  mainVideoZIndex: number

  // Resources
  builtinVoices: any[]
  uploadedVoices: any[]
  builtinBgms: any[]
  uploadedBgms: any[]
  builtinVideos: any[]
  uploadedVideos: any[]
  selectedVideoMaterialId: string
  builtinTitleStyles: any[]
  titleStyleImageUrls: Record<string, string>
  titleStyleVideoUrls: Record<string, string>
  availableFonts: string[]
  titleSegmentRange: { start: number; end: number } | null
  selectedTitleStyleId: string

  // Publishing
  publishPlatforms: string[]
  publishMode: string
  publishAccountIds: Record<string, string>

  // Processing state
  activeProcessingType: string | null
  processingProgress: number
  autoFlowRunning: boolean
  autoFlowStep: string
  runAutoFlow: (() => void) | null

  // History tracking
  videoHistoryCurrentId: string
  videoHistoryCurrentCreatedAt: number

  // Actions
  setOriginalVideoPath: (v: string) => void
  setGeneratedVideoPath: (v: string) => void
  setOriginalScript: (v: string) => void
  setRewrittenScript: (v: string) => void
  setTranslatedText: (v: string) => void
  setSourceLanguage: (v: string) => void
  setTargetLanguage: (v: string) => void
  setPreTranslationLanguage: (v: string) => void
  setLlmModel: (v: string) => void
  setLlmModels: (v: { value: string; label: string }[]) => void
  setMainTitle: (v: string) => void
  setSubTitle: (v: string) => void
  setViralTitle: (v: string) => void
  setVideoTags: (v: string) => void
  setGeneratedAudioPath: (v: string) => void
  setAudioDuration: (v: number) => void
  setSubtitleText: (v: string) => void
  setWhisperSegments: (v: any[]) => void
  setWhisperAlignedSubtitleText: (v: string) => void
  setSubtitleFont: (v: string) => void
  setSubtitleFontSize: (v: number) => void
  setSubtitleFontWeight: (v: number) => void
  setSubtitleColor: (v: string) => void
  setSubtitleStrokeColor: (v: string) => void
  setSubtitleBottomMargin: (v: number) => void
  setSubtitleEntranceEffect: (v: string) => void
  setSubtitleEnabled: (v: boolean) => void
  setBgmEnabled: (v: boolean) => void
  setGeneratedVideoPreview: (v: string) => void
  setTitledVideoPath: (v: string) => void
  setSubtitledVideoPath: (v: string) => void
  setBgmedVideoPath: (v: string) => void
  setSmartCutVideoPath: (v: string) => void
  setSmartCutBaseVideoPath: (v: string) => void
  setFinalVideoPath: (v: string) => void
  setAlreadySubtitled: (v: boolean) => void
  setAlreadyBgmAdded: (v: boolean) => void
  setSelectedVoiceId: (v: string) => void
  setSelectedBgmId: (v: string) => void
  setTtsAudioSpeed: (v: number) => void
  setTtsEmotion: (v: string) => void
  setTtsEmotionWeight: (v: number) => void
  setTtsEmotionCustomText: (v: string) => void
  setShowTranslatedInTextarea: (v: boolean) => void
  setFlowMode: (v: string) => void
  setTitleEffectConfig: (v: any) => void
  setSubtitleEffectConfig: (v: any) => void
  setBgmEffectConfig: (v: any) => void
  setBuiltinVoices: (v: any[]) => void
  setUploadedVoices: (v: any[]) => void
  setBuiltinBgms: (v: any[]) => void
  setUploadedBgms: (v: any[]) => void
  setUploadedVideos: (v: any[]) => void
  setSelectedVideoMaterialId: (v: string) => void
  setActiveProcessingType: (v: string | null) => void
  setProcessingProgress: (v: number) => void
  setAutoFlowRunning: (v: boolean) => void
  setAutoFlowStep: (v: string) => void
  setRunAutoFlow: (fn: (() => void) | null) => void
  setPublishPlatforms: (v: string[]) => void
  setPublishMode: (v: string) => void
  setPublishAccountId: (platform: string, accountId: string) => void
  setBuiltinVideos: (v: any[]) => void
  setAvailableFonts: (v: string[]) => void
  setBuiltinTitleStyles: (v: any[]) => void
  setTitleStyleImageUrls: (v: Record<string, string>) => void
  setTitleStyleVideoUrls: (v: Record<string, string>) => void
  setTitleSegmentRange: (v: { start: number; end: number } | null) => void
  setSelectedTitleStyleId: (v: string) => void
  setMixSegments: (v: any[]) => void
  setPipSegments: (v: any[]) => void
  setBgmSegmentRange: (v: { start: number; end: number } | null) => void
  setPipRect: (v: { x: number; y: number; width: number; height: number } | null) => void
  setMainVideoRect: (v: { x: number; y: number; width: number; height: number }) => void
  setMainVideoBgColor: (v: string) => void
  setMainVideoZIndex: (v: number) => void
  setVideoHistoryCurrentId: (v: string) => void
  setVideoHistoryCurrentCreatedAt: (v: number) => void
  resetInsertedEffectsState: () => void
  loadVoices: () => Promise<void>
  loadBgms: () => Promise<void>
  loadVideos: () => Promise<void>
  loadTitleStyles: () => Promise<void>
  loadAssetsFonts: () => Promise<void>
  loadAllResources: () => Promise<void>
  resetState: () => void
}

const initialState = {
  originalVideoPath: '',
  generatedVideoPath: '',
  titledVideoPath: '',
  subtitledVideoPath: '',
  bgmedVideoPath: '',
  smartCutVideoPath: '',
  smartCutBaseVideoPath: '',
  finalVideoPath: '',
  generatedVideoPreview: '',
  originalScript: '',
  rewrittenScript: '',
  translatedText: '',
  sourceLanguage: 'zh',
  targetLanguage: 'en',
  preTranslationLanguage: 'zh',
  llmModel: 'DeepSeek',
  llmModels: [{ value: 'DeepSeek', label: 'DeepSeek' }],
  mainTitle: '',
  subTitle: '',
  viralTitle: '',
  videoTags: '',
  generatedAudioPath: '',
  audioDuration: 0,
  selectedVoiceId: useSettingsStore.getState().selectedVoiceId || '',
  ttsAudioSpeed: useSettingsStore.getState().ttsAudioSpeed ?? 1,
  ttsEmotion: useSettingsStore.getState().ttsEmotion || '',
  ttsEmotionWeight: useSettingsStore.getState().ttsEmotionWeight ?? 0.8,
  ttsEmotionCustomText: '',
  showTranslatedInTextarea: false,
  flowMode: 'manual',
  subtitleText: '',
  whisperSegments: [],
  whisperAlignedSubtitleText: '',
  subtitleFont: '黑体',
  subtitleFontSize: 36,
  subtitleFontWeight: 400,
  subtitleColor: '#DE0202',
  subtitleStrokeColor: '#000000',
  subtitleBottomMargin: 240,
  subtitleEntranceEffect: '',
  subtitleEnabled: true,
  selectedBgmId: useSettingsStore.getState().selectedBgmId || '',
  bgmEnabled: true,
  alreadySubtitled: false,
  alreadyBgmAdded: false,
  titleEffectConfig: null,
  subtitleEffectConfig: null,
  bgmEffectConfig: null,
  mixSegments: [],
  pipSegments: [],
  bgmSegmentRange: null,
  pipRect: null,
  mainVideoRect: { x: 0, y: 0, width: 100, height: 100 },
  mainVideoBgColor: '#000000',
  mainVideoZIndex: 0,
  builtinVoices: [],
  uploadedVoices: [],
  builtinBgms: [],
  uploadedBgms: [],
  builtinVideos: [],
  uploadedVideos: [],
  selectedVideoMaterialId: useSettingsStore.getState().selectedVideoMaterialId || '',
  builtinTitleStyles: [],
  titleStyleImageUrls: {},
  titleStyleVideoUrls: {},
  availableFonts: ['黑体'],
  titleSegmentRange: null,
  selectedTitleStyleId: useSettingsStore.getState().selectedTitleStyleId || '',
  publishPlatforms: ['douyin'],
  publishMode: 'manual',
  publishAccountIds: {},
  activeProcessingType: null,
  processingProgress: 0,
  autoFlowRunning: false,
  autoFlowStep: 'idle',
  runAutoFlow: null,
  videoHistoryCurrentId: '',
  videoHistoryCurrentCreatedAt: 0
}

export const useVideoPageStore = create<VideoPageState>()(
  persist(
    (set) => ({
      ...initialState,
      setOriginalVideoPath: (v) => set({ originalVideoPath: v }),
      setGeneratedVideoPath: (v) => set({ generatedVideoPath: v }),
      setOriginalScript: (v) => set({ originalScript: v }),
      setRewrittenScript: (v) => set({ rewrittenScript: v }),
      setTranslatedText: (v) => set({ translatedText: v }),
      setSourceLanguage: (v) => set({ sourceLanguage: v }),
      setTargetLanguage: (v) => set({ targetLanguage: v }),
      setPreTranslationLanguage: (v) => set({ preTranslationLanguage: v }),
      setLlmModel: (v) => set({ llmModel: v }),
      setLlmModels: (v) => set({ llmModels: v }),
      setMainTitle: (v) => set({ mainTitle: v }),
      setSubTitle: (v) => set({ subTitle: v }),
      setViralTitle: (v) => set({ viralTitle: v }),
      setVideoTags: (v) => set({ videoTags: v }),
      setGeneratedAudioPath: (v) => set({ generatedAudioPath: v }),
      setAudioDuration: (v) => set({ audioDuration: v }),
      setSubtitleText: (v) => set({ subtitleText: v }),
      setWhisperSegments: (v) => set({
        whisperSegments: v,
        ...(v.length === 0 ? { whisperAlignedSubtitleText: '' } : {}),
      }),
      setWhisperAlignedSubtitleText: (v) => set({ whisperAlignedSubtitleText: v }),
      setSubtitleFont: (v) => set({ subtitleFont: v }),
      setSubtitleFontSize: (v) => set({ subtitleFontSize: v }),
      setSubtitleFontWeight: (v) => set({ subtitleFontWeight: v }),
      setSubtitleColor: (v) => set({ subtitleColor: v }),
      setSubtitleStrokeColor: (v) => set({ subtitleStrokeColor: v }),
      setSubtitleBottomMargin: (v) => set({ subtitleBottomMargin: v }),
      setSubtitleEntranceEffect: (v) => set({ subtitleEntranceEffect: v }),
      setSubtitleEnabled: (v) => set({ subtitleEnabled: v }),
      setBgmEnabled: (v) => set({ bgmEnabled: v }),
      setGeneratedVideoPreview: (v) => set({ generatedVideoPreview: v }),
      setTitledVideoPath: (v) => set({ titledVideoPath: v }),
      setSubtitledVideoPath: (v) => set({ subtitledVideoPath: v }),
      setBgmedVideoPath: (v) => set({ bgmedVideoPath: v }),
      setSmartCutVideoPath: (v) => set({ smartCutVideoPath: v }),
      setSmartCutBaseVideoPath: (v) => set({ smartCutBaseVideoPath: v }),
      setFinalVideoPath: (v) => set({ finalVideoPath: v }),
      setAlreadySubtitled: (v) => set({ alreadySubtitled: v }),
      setAlreadyBgmAdded: (v) => set({ alreadyBgmAdded: v }),
      setSelectedVoiceId: (v) => { set({ selectedVoiceId: v }); useSettingsStore.getState().setSelectedVoiceId(v) },
      setSelectedBgmId: (v) => { set({ selectedBgmId: v }); useSettingsStore.getState().setSelectedBgmId(v) },
      setTtsAudioSpeed: (v) => { set({ ttsAudioSpeed: v }); useSettingsStore.getState().setTtsAudioSpeed(v) },
      setTtsEmotion: (v) => { set({ ttsEmotion: v }); useSettingsStore.getState().setTtsEmotion(v) },
      setTtsEmotionWeight: (v) => { set({ ttsEmotionWeight: v }); useSettingsStore.getState().setTtsEmotionWeight(v) },
      setTtsEmotionCustomText: (v) => set({ ttsEmotionCustomText: v }),
      setShowTranslatedInTextarea: (v) => set({ showTranslatedInTextarea: v }),
      setFlowMode: (v) => set({ flowMode: v }),
      setTitleEffectConfig: (v) => set({ titleEffectConfig: v }),
      setSubtitleEffectConfig: (v) => set({ subtitleEffectConfig: v }),
      setBgmEffectConfig: (v) => set({ bgmEffectConfig: v }),
      setBuiltinVoices: (v) => set({ builtinVoices: v }),
      setUploadedVoices: (v) => set({ uploadedVoices: v }),
      setBuiltinBgms: (v) => set({ builtinBgms: v }),
      setUploadedBgms: (v) => set({ uploadedBgms: v }),
      setUploadedVideos: (v) => set({ uploadedVideos: v }),
      setSelectedVideoMaterialId: (v) => { set({ selectedVideoMaterialId: v }); useSettingsStore.getState().setSelectedVideoMaterialId(v) },
      setActiveProcessingType: (v) => set({ activeProcessingType: v }),
      setProcessingProgress: (v) => set({ processingProgress: v }),
      setAutoFlowRunning: (v) => set({ autoFlowRunning: v }),
      setAutoFlowStep: (v) => set({ autoFlowStep: v }),
      setRunAutoFlow: (fn) => set({ runAutoFlow: fn }),
      setPublishPlatforms: (v) =>
        set({ publishPlatforms: Array.isArray(v) && v.length > 0 ? v : ['douyin'] }),
      setPublishMode: (v) => set({ publishMode: v || 'manual' }),
      setPublishAccountId: (platform, accountId) =>
        set((state) => ({
          publishAccountIds: { ...state.publishAccountIds, [platform]: accountId },
        })),
      setBuiltinVideos: (v) => set({ builtinVideos: v }),
      setAvailableFonts: (v) => set({ availableFonts: v }),
      setBuiltinTitleStyles: (v) => set({ builtinTitleStyles: v }),
      setTitleStyleImageUrls: (v) => set({ titleStyleImageUrls: v }),
      setTitleStyleVideoUrls: (v) => set({ titleStyleVideoUrls: v }),
      setTitleSegmentRange: (v) => set({ titleSegmentRange: v }),
      setSelectedTitleStyleId: (v) => { set({ selectedTitleStyleId: v }); useSettingsStore.getState().setSelectedTitleStyleId(v) },
      setMixSegments: (v) => set({ mixSegments: v }),
      setPipSegments: (v) => set({ pipSegments: v }),
      setBgmSegmentRange: (v) => set({ bgmSegmentRange: v }),
      setPipRect: (v) => set({ pipRect: v }),
      setMainVideoRect: (v) => set({ mainVideoRect: v }),
      setMainVideoBgColor: (v) => set({ mainVideoBgColor: v }),
      setMainVideoZIndex: (v) => set({ mainVideoZIndex: v }),
      setVideoHistoryCurrentId: (v) => set({ videoHistoryCurrentId: v }),
      setVideoHistoryCurrentCreatedAt: (v) => set({ videoHistoryCurrentCreatedAt: v }),
      resetInsertedEffectsState: () => set({
        titledVideoPath: '',
        subtitledVideoPath: '',
        bgmedVideoPath: '',
        smartCutVideoPath: '',
        finalVideoPath: '',
        titleEffectConfig: null,
        subtitleEffectConfig: null,
        bgmEffectConfig: null,
        selectedTitleStyleId: '',
        titleSegmentRange: null,
      }),
      
      // Resource loaders - load from assets config files with proper paths
      loadVoices: async () => {
        try {
          const [voices, uploadedVoicesConfig] = await Promise.all([
            loadBuiltinVoicesFromAssets(),
            window.api.loadUploadedVoicesConfig?.()
          ])
          set({ builtinVoices: voices, uploadedVoices: uploadedVoicesConfig?.voices ?? [] })
        } catch (e) {
          console.error('Failed to load voices:', e)
          set({ builtinVoices: [], uploadedVoices: [] })
        }
      },
      loadBgms: async () => {
        try {
          const [bgms, uploadedBgmsConfig] = await Promise.all([
            loadBuiltinBgmsFromAssets(),
            window.api.loadUploadedBgmsConfig?.()
          ])
          set({ builtinBgms: bgms, uploadedBgms: uploadedBgmsConfig?.bgms ?? [] })
        } catch (e) {
          console.error('Failed to load BGMs:', e)
          set({ builtinBgms: [], uploadedBgms: [] })
        }
      },
      loadVideos: async () => {
        try {
          const [videos, uploadedVideosConfig] = await Promise.all([
            loadBuiltinVideosFromAssets(),
            window.api.loadUploadedVideosConfig?.()
          ])
          set({ builtinVideos: videos, uploadedVideos: uploadedVideosConfig?.videos ?? [] })
        } catch (e) {
          console.error('Failed to load videos:', e)
          set({ builtinVideos: [], uploadedVideos: [] })
        }
      },
      loadTitleStyles: async () => {
        try {
          const result = await window.api.listBuiltinTitleStyles()
          const styles = Array.isArray(result) ? result : []
          const imageUrls: Record<string, string> = {}
          const videoUrls: Record<string, string> = {}
          
          const resolvePromises = styles.map(async (style) => {
            if (style.previewImage) {
              try {
                const res = await window.api.getLocalFileUrl(style.previewImage)
                if (res.success && res.url) {
                  imageUrls[style.id] = res.url
                } else {
                  console.warn(`[loadTitleStyles] image resolve failed for ${style.id}:`, res.error)
                }
              } catch (err) {
                console.error(`[loadTitleStyles] image error for ${style.id}:`, err)
              }
            }
            if (style.previewVideo) {
              try {
                const res = await window.api.getLocalFileUrl(style.previewVideo)
                if (res.success && res.url) {
                  videoUrls[style.id] = res.url
                } else {
                  console.warn(`[loadTitleStyles] video resolve failed for ${style.id}:`, res.error)
                }
              } catch (err) {
                console.error(`[loadTitleStyles] video error for ${style.id}:`, err)
              }
            }
          })
          await Promise.all(resolvePromises)
          
          set({
            builtinTitleStyles: styles,
            titleStyleImageUrls: imageUrls,
            titleStyleVideoUrls: videoUrls
          })
        } catch (e) {
          console.error('Failed to load title styles:', e)
          set({ builtinTitleStyles: [], titleStyleImageUrls: {}, titleStyleVideoUrls: {} })
        }
      },
      loadAssetsFonts: async () => {
        try {
          const fonts = await window.api.listAssetsFonts()
          if (fonts.length === 0) {
            set({ availableFonts: ['黑体'] })
            return
          }
          
          const loadedFamilies: string[] = ['黑体']
          
          for (const { path, fontFamily } of fonts) {
            try {
              const result = await window.api.getLocalFileUrl(path)
              if (!result.success) {
                console.warn(`Failed to get URL for font ${fontFamily}:`, result.error)
                continue
              }
              
              const font = new FontFace(fontFamily, `url(${result.url})`)
              await font.load()
              document.fonts.add(font)
              
              if (!loadedFamilies.includes(fontFamily)) {
                loadedFamilies.push(fontFamily)
              }
              console.log(`[Fonts] Loaded font: ${fontFamily}`)
            } catch (err) {
              console.warn(`Failed to load font ${fontFamily}:`, err)
            }
          }
          
          set({ availableFonts: loadedFamilies })
          console.log('[Fonts] Available fonts:', loadedFamilies)
        } catch (e) {
          console.error('Failed to load fonts:', e)
          set({ availableFonts: ['黑体'] })
        }
      },
      loadAllResources: async () => {
        const state = useVideoPageStore.getState()
        await Promise.all([
          state.loadVoices(),
          state.loadBgms(),
          state.loadVideos(),
          state.loadTitleStyles(),
          state.loadAssetsFonts()
        ])
      },
      resetState: () => set(initialState)
    }),
    {
      name: 'video-page-store',
      partialize: (state) => ({
        sourceLanguage: state.sourceLanguage,
        targetLanguage: state.targetLanguage,
        subtitleFont: state.subtitleFont,
        subtitleFontSize: state.subtitleFontSize,
        subtitleColor: state.subtitleColor,
        subtitleStrokeColor: state.subtitleStrokeColor,
        subtitleBottomMargin: state.subtitleBottomMargin
      })
    }
  )
)
