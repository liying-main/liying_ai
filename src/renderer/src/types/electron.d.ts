// Electron IPC API Type Definitions
// This file defines the API exposed by preload to renderer process

interface DownloadResult {
  success: boolean
  file_path?: string
  message?: string
  error?: string
}

interface LocalFileUrlResult {
  success: boolean
  url?: string
  error?: string
}

interface SaveFileResult {
  success: boolean
  file_path?: string
  error?: string
}

interface SaveLocalFileAsResult {
  success: boolean
  filePath?: string
  canceled?: boolean
  error?: string
}

interface DouyinPostsResult {
  success: boolean
  posts?: Array<{ desc: string; [key: string]: any }>
  message?: string
  error?: string
}

interface VoiceItem {
  id: string
  name: string
  path: string
  promptText?: string
}

interface BgmItem {
  id: string
  name: string
  path: string
  category?: string
}

interface VideoItem {
  id: string
  name: string
  path: string
  thumbnail?: string
}

interface TitleStyle {
  id: string
  name: string
  previewImage?: string
  previewVideo?: string
}

interface FontItem {
  path: string
  fontFamily: string
  fileName: string
}

interface UploadedConfig<T> {
  items?: T[]
  voices?: T[]
  bgms?: T[]
  videos?: T[]
}

interface TranscribeResult {
  success: boolean
  file_path?: string
  voice_id?: string
  prompt_text?: string
  error?: string
}

interface PluginProgressData {
  pluginName: string
  type: 'queue_waiting' | 'queue_active' | 'queue_done' | 'job_progress'
  progress?: number
  [key: string]: any
}

interface TtsRunParams {
  scriptContent: string
  referenceAudioPath: string
  emotion?: string
  emotionWeight?: number
}

interface WhisperTranscribeParams {
  audioPath: string
}

interface DownloadAudioOptions {
  silenceSeconds?: number
  audioSpeed?: number
}

interface ElectronAPI {
  // Window controls
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  windowReload: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>

  // Debug
  logToMain: (...args: any[]) => Promise<{ success: boolean }>

  // File operations
  selectFile: (options?: any) => Promise<{ canceled: boolean; filePaths: string[] }>
  selectDirectory: (options?: any) => Promise<{ canceled: boolean; filePaths: string[] }>
  saveLocalFileAs: (sourcePath: string) => Promise<SaveLocalFileAsResult>
  getAssetsPath: (relativePath: string) => Promise<string>
  getUserDataPath: (subPath?: string) => Promise<string>
  getDeviceNonce: () => Promise<{ nonce1: string; nonce2: string; nonce3: string; nonce4: string; nonce5: string; nonce6: string }>
  listUserDataFiles: (subPath: string, recursive?: boolean) => Promise<string[]>
  deleteUserDataFile: (filePath: string) => Promise<{ success: boolean }>
  getLocalFileUrl: (filePath: string) => Promise<LocalFileUrlResult>
  readFileAsBase64: (filePath: string) => Promise<string>
  saveFileFromBase64: (base64: string, fileName: string, subPath?: string) => Promise<SaveFileResult>

  // Video history
  getVideoGenerateHistory: () => Promise<any[]>
  setVideoGenerateHistory: (list: any[]) => Promise<void>
  clearVideoGenerateHistory: () => Promise<void>

  // Video processing
  getVideoDuration: (videoPath: string) => Promise<number>
  getVideoDimensions: (videoPath: string) => Promise<{ width: number; height: number }>
  extractVideoAudioToWav: (videoPath: string) => Promise<DownloadResult>
  extractVideoAudioForTranscribe: (videoPath: string) => Promise<DownloadResult>
  extractFrameFromVideo: (videoPath: string) => Promise<DownloadResult>
  addSubtitleToVideo: (videoPath: string, subtitleItems: any[], options?: any) => Promise<DownloadResult>
  addSubtitleToVideoCanvas: (videoPath: string, options?: any) => Promise<DownloadResult>
  addTitleToVideo: (videoPath: string, mainTitleData: any, subTitleData: any, options?: any) => Promise<DownloadResult>
  addBgmToVideo: (videoPath: string, bgmPath: string, volume: number, options?: any) => Promise<DownloadResult>
  composeVideoWithMixSegments: (baseVideoPath: string, totalDuration: number, segments: any[]) => Promise<DownloadResult>
  composeVideoWithPipSegments: (baseVideoPath: string, totalDuration: number, segments: any[], mainVideoScaling?: any) => Promise<DownloadResult>

  // Assets
  listBuiltinVoices: () => Promise<VoiceItem[]>
  listBuiltinBgms: () => Promise<BgmItem[]>
  listBuiltinVideos: () => Promise<VideoItem[]>
  listBuiltinTitleStyles: () => Promise<TitleStyle[]>
  listAssetsFonts: () => Promise<FontItem[]>
  loadBuiltinVoicesConfig: () => Promise<UploadedConfig<VoiceItem>>
  saveBuiltinVoicesConfig: (config: any) => Promise<{ success: boolean }>
  loadUploadedVoicesConfig: () => Promise<UploadedConfig<VoiceItem>>
  saveUploadedVoicesConfig: (config: any) => Promise<{ success: boolean }>
  loadBuiltinBgmsConfig: () => Promise<UploadedConfig<BgmItem>>
  saveBuiltinBgmsConfig: (config: any) => Promise<{ success: boolean }>
  loadUploadedBgmsConfig: () => Promise<UploadedConfig<BgmItem>>
  saveUploadedBgmsConfig: (config: any) => Promise<{ success: boolean }>
  loadUploadedVideosConfig: () => Promise<UploadedConfig<VideoItem>>
  saveUploadedVideosConfig: (config: any) => Promise<{ success: boolean }>

  // Platform publishing
  browserOpenPlatform: (platform: string) => Promise<void>
  browserNavigate: (platform: string, url: string) => Promise<void>
  browserRunPublishFlow: (platform: string, params: any) => Promise<{ success: boolean }>

  // Download operations
  downloadDouyinVideo: (videoUrl: string) => Promise<DownloadResult>
  downloadDouyinUserPosts: (profileUrl: string) => Promise<DouyinPostsResult>
  downloadAudioFromUrl: (audioUrl: string, options?: DownloadAudioOptions) => Promise<DownloadResult>
  uploadVoiceAndTranscribe: (filePath: string, fileName: string) => Promise<TranscribeResult>

  // Plugin operations
  loadAllPlugins: (pluginNames: string[]) => Promise<{ success: boolean; plugins: string[] }>
  downloadPlugin: (pluginUrl: string, pluginName: string) => Promise<{ success: boolean }>
  checkPluginExists: (pluginName: string) => Promise<{ exists: boolean }>
  invokePlugin: (pluginName: string, methodName: string, args: any[]) => Promise<any>
  pluginProxyTts2Run: (params: TtsRunParams) => Promise<string>
  pluginProxyVideoJobRun: (params: any) => Promise<DownloadResult>
  pluginProxyWhisperTranscribeRun: (params: WhisperTranscribeParams) => Promise<string>
  pluginProxyAbandonQueues: () => Promise<{ success: boolean }>

  // Event listeners
  onPluginProgress: (callback: (data: PluginProgressData) => void) => () => void
  onPluginProxyProgress: (callback: (data: PluginProgressData) => void) => () => void
  onPluginGetTokenRequest: (callback: (requestId: string) => void) => void
  sendPluginTokenResponse: (requestId: string, token: string) => void

  // Updates
  updateCheck: (updateServerUrl?: string) => Promise<any>
  updateDownload: () => Promise<void>
  updateInstall: () => Promise<void>
  onUpdateAvailable: (callback: (info: any) => void) => () => void
  onUpdateDownloadProgress: (callback: (progress: any) => void) => () => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export type { ElectronAPI, VoiceItem, BgmItem, VideoItem, PluginProgressData }
