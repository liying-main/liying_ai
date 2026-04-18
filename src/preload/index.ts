import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  windowReload: () => ipcRenderer.invoke('window-reload'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // System info
  getSystemArch: () => {
    const a = process.arch
    if (a === 'ia32') return 'x86'
    if (a === 'x64') return 'x64'
    if (a === 'arm64') return 'arm64'
    return a
  },

  // Debug
  logToMain: (...args: any[]) => ipcRenderer.invoke('debug-log', ...args),

  // File operations
  selectFile: (options?: any) => ipcRenderer.invoke('select-file', options),
  selectDirectory: (options?: any) => ipcRenderer.invoke('select-directory', options),
  saveLocalFileAs: (sourcePath: string) => ipcRenderer.invoke('save-local-file-as', sourcePath),
  getLocalServerBaseUrl: () => ipcRenderer.invoke('get-local-server-base-url'),
  getAssetsPath: (relativePath: string) => ipcRenderer.invoke('get-assets-path', relativePath),
  getUserDataPath: (subPath?: string) => ipcRenderer.invoke('get-user-data-path', subPath),
  getDeviceNonce: () => ipcRenderer.invoke('get-device-nonce'),
  listUserDataFiles: (subPath: string, recursive?: boolean) => ipcRenderer.invoke('list-user-data-files', subPath, recursive),
  deleteUserDataFile: (filePath: string) => ipcRenderer.invoke('delete-user-data-file', filePath),
  getLocalFileUrl: (filePath: string) => ipcRenderer.invoke('get-local-file-url', filePath),
  readFileAsBase64: (filePath: string) => ipcRenderer.invoke('read-file-as-base64', filePath),
  saveFileFromBase64: (base64Data: string, fileName: string, subPath?: string) => ipcRenderer.invoke('save-file-from-base64', base64Data, fileName, subPath),

  // Video history
  getVideoGenerateHistory: () => ipcRenderer.invoke('get-video-generate-history'),
  setVideoGenerateHistory: (list: any[]) => ipcRenderer.invoke('set-video-generate-history', list),
  clearVideoGenerateHistory: () => ipcRenderer.invoke('clear-video-generate-history'),

  // Video processing
  getVideoDuration: (videoPath: string) => ipcRenderer.invoke('get-video-duration', videoPath),
  getVideoDimensions: (videoPath: string) => ipcRenderer.invoke('get-video-dimensions', videoPath),
  extractVideoAudioToWav: (videoPath: string) => ipcRenderer.invoke('extract-video-audio-to-wav', videoPath),
  extractVideoAudioForTranscribe: (videoPath: string) => ipcRenderer.invoke('extract-video-audio-for-transcribe', videoPath),
  extractFrameFromVideo: (videoPath: string) => ipcRenderer.invoke('extract-frame-from-video', videoPath),
  prepareStillImageBase64ForLlm: (imagePath: string) => ipcRenderer.invoke('prepare-still-image-base64-for-llm', imagePath),
  addSubtitleToVideo: (videoPath: string, subtitleItems: any[], options?: any) => ipcRenderer.invoke('add-subtitle-to-video', videoPath, subtitleItems, options),
  addSubtitleToVideoCanvas: (videoPath: string, options?: any) => ipcRenderer.invoke('add-subtitle-to-video-canvas', videoPath, options),
  addTitleToVideo: (videoPath: string, mainTitleData: any, subTitleData: any, options?: any) => ipcRenderer.invoke('add-title-to-video', videoPath, mainTitleData, subTitleData, options),
  addBgmToVideo: (videoPath: string, bgmPath: string, volume: number, options?: any) => ipcRenderer.invoke('add-bgm-to-video', videoPath, bgmPath, volume, options),
  composeVideoWithMixSegments: (baseVideoPath: string, totalDuration: number, segments: any[]) => ipcRenderer.invoke('compose-video-with-mix-segments', baseVideoPath, totalDuration, segments),
  composeVideoWithPipSegments: (baseVideoPath: string, totalDuration: number, segments: any[], mainVideoScaling?: any) => ipcRenderer.invoke('compose-video-with-pip-segments', baseVideoPath, totalDuration, segments, mainVideoScaling),

  // Assets
  listBuiltinVoices: () => ipcRenderer.invoke('list-builtin-voices'),
  listBuiltinBgms: () => ipcRenderer.invoke('list-builtin-bgms'),
  listBuiltinVideos: () => ipcRenderer.invoke('list-builtin-videos'),
  listBuiltinTitleStyles: () => ipcRenderer.invoke('list-builtin-title-styles'),
  listAssetsFonts: () => ipcRenderer.invoke('list-assets-fonts'),
  loadBuiltinVoicesConfig: () => ipcRenderer.invoke('load-builtin-voices-config'),
  saveBuiltinVoicesConfig: (config: any) => ipcRenderer.invoke('save-builtin-voices-config', config),
  loadUploadedVoicesConfig: () => ipcRenderer.invoke('load-uploaded-voices-config'),
  saveUploadedVoicesConfig: (config: any) => ipcRenderer.invoke('save-uploaded-voices-config', config),
  loadBuiltinBgmsConfig: () => ipcRenderer.invoke('load-builtin-bgms-config'),
  saveBuiltinBgmsConfig: (config: any) => ipcRenderer.invoke('save-builtin-bgms-config', config),
  loadUploadedBgmsConfig: () => ipcRenderer.invoke('load-uploaded-bgms-config'),
  saveUploadedBgmsConfig: (config: any) => ipcRenderer.invoke('save-uploaded-bgms-config', config),

  // Mix/PIP Resources (智能精剪素材)
  loadMixResourcesConfig: () => ipcRenderer.invoke('load-mix-resources-config'),
  saveMixResourcesConfig: (config: any) => ipcRenderer.invoke('save-mix-resources-config', config),
  loadPipResourcesConfig: () => ipcRenderer.invoke('load-pip-resources-config'),
  savePipResourcesConfig: (config: any) => ipcRenderer.invoke('save-pip-resources-config', config),
  uploadVideoMaterial: (sourcePath: string, originalName: string) => ipcRenderer.invoke('upload-video-material', sourcePath, originalName),
  uploadBgmMaterial: (sourcePath: string, originalName: string, category?: string) => ipcRenderer.invoke('upload-bgm-material', sourcePath, originalName, category),

  // Platform publishing
  browserOpenPlatform: (platform: string) => ipcRenderer.invoke('browser-open-platform', platform),
  browserNavigate: (platform: string, url: string) => ipcRenderer.invoke('browser-navigate', platform, url),
  browserRunPublishFlow: (platform: string, params: any) => ipcRenderer.invoke('browser-run-publish-flow', platform, params),

  // Download operations
  downloadDouyinVideo: (videoUrl: string) => ipcRenderer.invoke('download-douyin-video', videoUrl),
  downloadDouyinUserPosts: (profileUrl: string) => ipcRenderer.invoke('download-douyin-user-posts', profileUrl),
  downloadAudioFromUrl: (audioUrl: string, options?: any) => ipcRenderer.invoke('download-audio-from-url', audioUrl, options),
  downloadVideoFromUrl: (videoUrl: string, fileName: string) => ipcRenderer.invoke('download-video-from-url', videoUrl, fileName),
  uploadVoiceAndTranscribe: (filePath: string, fileName: string) => ipcRenderer.invoke('upload-voice-and-transcribe', filePath, fileName),
  loadUploadedVideosConfig: () => ipcRenderer.invoke('load-uploaded-videos-config'),
  saveUploadedVideosConfig: (config: any) => ipcRenderer.invoke('save-uploaded-videos-config', config),

  // Plugins
  loadAllPlugins: (pluginNames: string[]) => ipcRenderer.invoke('load-all-plugins', pluginNames),
  downloadPlugin: (pluginUrl: string, pluginName: string) => ipcRenderer.invoke('download-plugin', pluginUrl, pluginName),
  checkPluginExists: (pluginName: string) => ipcRenderer.invoke('check-plugin-exists', pluginName),
  invokePlugin: (pluginName: string, methodName: string, args: any[]) => ipcRenderer.invoke('invoke-plugin', pluginName, methodName, args),
  pluginProxyTts2Run: (params: any) => ipcRenderer.invoke('plugin-proxy-tts2-run', params),
  pluginProxyVideoJobRun: (params: any) => ipcRenderer.invoke('plugin-proxy-video-job-run', params),
  pluginProxyWhisperTranscribeRun: (params: any) => ipcRenderer.invoke('plugin-proxy-whisper-transcribe-run', params),
  pluginProxyAbandonQueues: () => ipcRenderer.invoke('plugin-proxy-abandon-queues'),
  onPluginProgress: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('plugin-progress', handler)
    return () => ipcRenderer.removeListener('plugin-progress', handler)
  },
  onPluginProxyProgress: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('plugin-proxy-progress', handler)
    return () => ipcRenderer.removeListener('plugin-proxy-progress', handler)
  },
  onPluginGetTokenRequest: (callback: (requestId: string) => void) => {
    const handler = (_: any, requestId: string) => callback(requestId)
    ipcRenderer.on('plugin-get-token-request', handler)
    return () => ipcRenderer.removeListener('plugin-get-token-request', handler)
  },
  sendPluginTokenResponse: (requestId: string, token: string) => ipcRenderer.send('plugin-token-response', requestId, token),
  
  // Whisper align run
  pluginProxyWhisperAlignRun: (params: any) => ipcRenderer.invoke('plugin-proxy-whisper-align-run', params),

  // Custom title themes
  saveCustomTitleTheme: (themeData: any) => ipcRenderer.invoke('save-custom-title-theme', themeData),
  deleteCustomTitleTheme: (themeId: string) => ipcRenderer.invoke('delete-custom-title-theme', themeId),
  listCustomTitleThemes: () => ipcRenderer.invoke('list-custom-title-themes'),

  // Cache management
  getCacheInfo: () => ipcRenderer.invoke('get-cache-info'),
  clearCache: () => ipcRenderer.invoke('clear-cache'),

  // Updates
  updateCheck: (updateServerUrl?: string) => ipcRenderer.invoke('update-check', updateServerUrl),
  updateDownload: () => ipcRenderer.invoke('update-download'),
  updateInstall: () => ipcRenderer.invoke('update-install'),
  updateDownloadAndInstall: (downloadUrl: string, version: string, description: string, forceUpdate: boolean) =>
    ipcRenderer.invoke('update-download-and-install', downloadUrl, version, description, forceUpdate),
  updateInstallManual: (filePath: string) =>
    ipcRenderer.invoke('update-install-manual', filePath),
  onUpdateAvailable: (callback: (info: any) => void) => {
    const handler = (_: any, info: any) => callback(info)
    ipcRenderer.on('update-available', handler)
    return () => ipcRenderer.removeListener('update-available', handler)
  },
  onUpdateDownloadProgress: (callback: (progress: any) => void) => {
    const handler = (_: any, progress: any) => callback(progress)
    ipcRenderer.on('update-download-progress', handler)
    return () => ipcRenderer.removeListener('update-download-progress', handler)
  },
  onUpdateDownloadStart: (callback: (info: any) => void) => {
    const handler = (_: any, info: any) => callback(info)
    ipcRenderer.on('update-download-start', handler)
    return () => ipcRenderer.removeListener('update-download-start', handler)
  },
  onUpdateDownloaded: (callback: (info: any) => void) => {
    const handler = (_: any, info: any) => callback(info)
    ipcRenderer.on('update-downloaded', handler)
    return () => ipcRenderer.removeListener('update-downloaded', handler)
  },
  onUpdateError: (callback: (error: any) => void) => {
    const handler = (_: any, error: any) => callback(error)
    ipcRenderer.on('update-error', handler)
    return () => ipcRenderer.removeListener('update-error', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
}

export type Api = typeof api
