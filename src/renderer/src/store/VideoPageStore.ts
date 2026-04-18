// @ts-nocheck
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useSettingsStore } from './SettingsStore'

// Cache for local server base URL
let _localServerBaseUrl: string | null = null
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
  return cfg.voices.map((v: any) => {
    const ext = v.id.startsWith('voice') ? '.wav' : '.mp3'
    return {
      id: v.id,
      name: v.name || v.id,
      path: `${prefix}/voices/${v.id}${ext}`,
      promptText: v.promptText || ''
    }
  })
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
    path: `${prefix}/bgms/${b.id}.mp3`,
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
    return {
      id: v.id,
      name: v.name || v.id,
      path: `${prefix}/videos/${encodedId}.mp4`,
      coverUrl: `${prefix}/videos/${encodedId}.mp4`
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
      setWhisperSegments: (v) => set({ whisperSegments: v }),
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
      setPublishPlatforms: (v) => set({ publishPlatforms: v }),
      setPublishMode: (v) => set({ publishMode: v }),
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
      
      // Resource loaders - disabled, no resources to load
      loadVoices: async () => {},
      loadBgms: async () => {},
      loadVideos: async () => {},
      loadTitleStyles: async () => {},
      loadAssetsFonts: async () => {},
      loadAllResources: async () => {},
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
