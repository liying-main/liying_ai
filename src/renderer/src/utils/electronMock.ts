// Electron API Mock for development/web environment
// This provides fallback implementations when running outside Electron

const mockApi = {
  // Window controls
  minimizeWindow: async () => console.log('[Mock] minimizeWindow'),
  maximizeWindow: async () => console.log('[Mock] maximizeWindow'),
  closeWindow: async () => console.log('[Mock] closeWindow'),
  windowReload: async () => window.location.reload(),
  windowIsMaximized: async () => false,

  // File operations
  selectFile: async (options?: any) => ({ canceled: true, filePaths: [] }),
  selectDirectory: async (options?: any) => ({ canceled: true, filePaths: [] }),
  saveLocalFileAs: async (filePath: string) => ({ success: true, filePath }),
  getAssetsPath: async (relativePath: string) => `/assets/${relativePath}`,
  getUserDataPath: async (subPath?: string) => `/userData/${subPath || ''}`,
  getDeviceNonce: async () => 'mock-device-nonce',
  listUserDataFiles: async () => [],
  deleteUserDataFile: async () => ({ success: true }),
  getLocalFileUrl: async (filePath: string) => ({ success: true, url: filePath }),
  readFileAsBase64: async () => '',
  saveFileFromBase64: async (base64: string, fileName: string, subPath?: string) => 
    ({ success: true, file_path: `/mock/${subPath}/${fileName}` }),

  // Video history
  getVideoGenerateHistory: async () => [],
  setVideoGenerateHistory: async () => {},
  clearVideoGenerateHistory: async () => {},

  // Video processing
  getVideoDuration: async () => 0,
  getVideoDimensions: async () => ({ width: 1920, height: 1080 }),
  extractVideoAudioToWav: async () => ({ success: false, error: '请在Electron环境中使用' }),
  extractVideoAudioForTranscribe: async () => ({ success: false, error: '请在Electron环境中使用' }),
  extractFrameFromVideo: async () => ({ success: false, error: '请在Electron环境中使用' }),
  addSubtitleToVideo: async () => ({ success: false, error: '请在Electron环境中使用' }),
  addSubtitleToVideoCanvas: async () => ({ success: false, error: '请在Electron环境中使用' }),
  addTitleToVideo: async () => ({ success: false, error: '请在Electron环境中使用' }),
  addBgmToVideo: async () => ({ success: false, error: '请在Electron环境中使用' }),
  composeVideoWithMixSegments: async () => ({ success: false, error: '请在Electron环境中使用' }),
  composeVideoWithPipSegments: async () => ({ success: false, error: '请在Electron环境中使用' }),

  // Assets
  listBuiltinVoices: async () => [
    { id: 'voice_1', name: '青春女声', path: '/mock/voices/voice_1.wav' },
    { id: 'voice_2', name: '成熟男声', path: '/mock/voices/voice_2.wav' },
    { id: 'voice_3', name: '甜美女声', path: '/mock/voices/voice_3.wav' },
  ],
  listBuiltinBgms: async () => [
    { id: 'bgm_1', name: '轻松欢快', path: '/mock/bgms/bgm_1.mp3', category: '欢快' },
    { id: 'bgm_2', name: '舒缓抒情', path: '/mock/bgms/bgm_2.mp3', category: '抒情' },
  ],
  listBuiltinVideos: async () => [
    { id: 'video_1', name: '喝茶', path: '/mock/videos/video_1.mp4' },
    { id: 'video_2', name: '风景', path: '/mock/videos/video_2.mp4' },
  ],
  listBuiltinTitleStyles: async () => [],
  listAssetsFonts: async () => [{ name: '黑体', path: '/mock/fonts/heiti.ttf' }],
  loadBuiltinVoicesConfig: async () => ({ items: [] }),
  saveBuiltinVoicesConfig: async () => ({ success: true }),
  loadUploadedVoicesConfig: async () => ({ voices: [] }),
  saveUploadedVoicesConfig: async () => ({ success: true }),
  loadBuiltinBgmsConfig: async () => ({ items: [] }),
  saveBuiltinBgmsConfig: async () => ({ success: true }),
  loadUploadedBgmsConfig: async () => ({ bgms: [] }),
  saveUploadedBgmsConfig: async () => ({ success: true }),
  loadUploadedVideosConfig: async () => ({ videos: [] }),
  saveUploadedVideosConfig: async () => ({ success: true }),

  // Platform publishing
  browserOpenPlatform: async () => {},
  browserNavigate: async () => {},
  browserRunPublishFlow: async () => ({ success: false }),

  // Download operations
  downloadDouyinVideo: async (url: string) => ({ success: false, error: '请在Electron环境中使用' }),
  downloadDouyinUserPosts: async () => ({ success: false, error: '请在Electron环境中使用', posts: [] }),
  downloadAudioFromUrl: async () => ({ success: false, error: '请在Electron环境中使用' }),
  uploadVoiceAndTranscribe: async () => ({ success: false, error: '请在Electron环境中使用' }),

  // Plugin operations
  loadAllPlugins: async () => ({ success: true, plugins: [] }),
  downloadPlugin: async () => ({ success: false }),
  checkPluginExists: async () => ({ exists: false }),
  invokePlugin: async () => null,
  pluginProxyTts2Run: async () => { throw new Error('请在Electron环境中使用TTS功能') },
  pluginProxyVideoJobRun: async () => ({ success: false, error: '请在Electron环境中使用' }),
  pluginProxyWhisperTranscribeRun: async () => { throw new Error('请在Electron环境中使用语音识别') },
  pluginProxyAbandonQueues: async () => ({ success: true }),

  // Event listeners
  onPluginProgress: (callback: (data: any) => void) => () => {},
  onPluginProxyProgress: (callback: (data: any) => void) => () => {},
  onPluginGetTokenRequest: (callback: (requestId: string) => void) => {},
  sendPluginTokenResponse: (requestId: string, token: string) => {},

  // Updates
  updateCheck: async () => null,
  updateDownload: async () => {},
  updateInstall: async () => {},
  onUpdateAvailable: (callback: (info: any) => void) => () => {},
  onUpdateDownloadProgress: (callback: (progress: any) => void) => () => {},
}

// Export mock API - initialization is handled in main.tsx
export default mockApi
