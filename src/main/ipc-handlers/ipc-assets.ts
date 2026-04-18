import { ipcMain, app } from 'electron'
import fs from 'fs'
import path from 'path'
import { getUserDataPath } from '../local-server'

function resolveAssetPath(segment: string, filename: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', segment, filename)
  }
  // Dev mode: check multiple possible locations
  const candidates = [
    path.join(process.cwd(), 'assets', segment, filename),
    path.join(process.cwd(), 'app', 'assets', segment, filename),
    path.join(process.cwd(), 'src', 'assets', segment, filename),
    path.join(__dirname, '..', '..', '..', 'assets', segment, filename)
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[0]
}

function resolveAssetDir(segment: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', segment)
  }
  // Dev mode: check multiple possible locations
  const candidates = [
    path.join(process.cwd(), 'assets', segment),
    path.join(process.cwd(), 'app', 'assets', segment),
    path.join(process.cwd(), 'src', 'assets', segment),
    path.join(__dirname, '..', '..', '..', 'assets', segment)
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[0]
}

function loadJsonSafe(filePath: string, defaultValue: any): any {
  try {
    if (!fs.existsSync(filePath)) return defaultValue
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) || defaultValue
  } catch {
    return defaultValue
  }
}

export function registerAssetsHandlers(): void {
  // Voices
  ipcMain.handle('list-builtin-voices', async () => {
    const configPath = resolveAssetPath('voices', 'builtin_voices_config.json')
    if (!fs.existsSync(configPath)) return []
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw || '[]')
  })

  ipcMain.handle('load-builtin-voices-config', async () => {
    const configPath = resolveAssetPath('voices', 'builtin_voices_config.json')
    if (!fs.existsSync(configPath)) return { items: [] }
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw || '{"items":[]}')
  })

  ipcMain.handle('load-uploaded-voices-config', async () => {
    const configPath = path.join(getUserDataPath(), 'uploaded_voices_config.json')
    if (!fs.existsSync(configPath)) return { voices: [] }
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw || '{"voices":[]}')
  })

  ipcMain.handle('save-uploaded-voices-config', async (_, config: any) => {
    const configPath = path.join(getUserDataPath(), 'uploaded_voices_config.json')
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    return { success: true }
  })

  // BGMs
  ipcMain.handle('list-builtin-bgms', async () => {
    const configPath = resolveAssetPath('bgms', 'builtin_bgms_config.json')
    if (!fs.existsSync(configPath)) return []
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw || '[]')
  })

  ipcMain.handle('load-builtin-bgms-config', async () => {
    const configPath = resolveAssetPath('bgms', 'builtin_bgms_config.json')
    if (!fs.existsSync(configPath)) return { items: [] }
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw || '{"items":[]}')
  })

  ipcMain.handle('load-uploaded-bgms-config', async () => {
    const configPath = path.join(getUserDataPath(), 'uploaded_bgms_config.json')
    if (!fs.existsSync(configPath)) return { bgms: [] }
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw || '{"bgms":[]}')
  })

  ipcMain.handle('save-uploaded-bgms-config', async (_, config: any) => {
    const configPath = path.join(getUserDataPath(), 'uploaded_bgms_config.json')
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    return { success: true }
  })

  // Videos
  ipcMain.handle('list-builtin-videos', async () => {
    const configPath = resolveAssetPath('videos', 'builtin_videos_config.json')
    if (!fs.existsSync(configPath)) return []
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw || '[]')
  })

  ipcMain.handle('load-builtin-videos-config', async () => {
    const configPath = resolveAssetPath('videos', 'builtin_videos_config.json')
    if (!fs.existsSync(configPath)) return { items: [] }
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw || '{"items":[]}')
  })

  ipcMain.handle('load-uploaded-videos-config', async () => {
    const configPath = path.join(getUserDataPath(), 'uploaded_videos_config.json')
    if (!fs.existsSync(configPath)) return { videos: [] }
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw || '{"videos":[]}')
  })

  ipcMain.handle('save-uploaded-videos-config', async (_, config: any) => {
    const configPath = path.join(getUserDataPath(), 'uploaded_videos_config.json')
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    return { success: true }
  })

  // Title Styles
  ipcMain.handle('list-builtin-title-styles', async () => {
    try {
      const titleStylesDir = resolveAssetDir('title-styles')
      if (!fs.existsSync(titleStylesDir)) {
        return []
      }
      const configPath = resolveAssetPath('title-styles', 'builtin_title_styles_config.json')
      const builtinConfig = loadJsonSafe(configPath, { styles: [] })
      const styles: any[] = []
      
      // Iterate from config to preserve order and include all styles
      for (const savedStyle of builtinConfig.styles) {
        if (!savedStyle?.id) continue
        
        // Check preview image exists (try multiple extensions)
        let previewImageWebPath: string | undefined
        const imgFile = savedStyle.previewImage
        if (imgFile) {
          const imgPath = path.join(titleStylesDir, imgFile)
          if (fs.existsSync(imgPath)) {
            previewImageWebPath = `/assets/title-styles/${imgFile}`
          }
        }
        // Fallback: check for common extensions
        if (!previewImageWebPath) {
          for (const ext of ['.png', '.jpg', '.jpeg']) {
            const candidate = path.join(titleStylesDir, savedStyle.id + ext)
            if (fs.existsSync(candidate)) {
              previewImageWebPath = `/assets/title-styles/${savedStyle.id}${ext}`
              break
            }
          }
        }
        
        // Check preview video exists
        let previewVideoWebPath: string | undefined
        if (savedStyle.previewVideo) {
          const videoPath = path.join(resolveAssetDir('videos'), savedStyle.previewVideo)
          if (fs.existsSync(videoPath)) {
            previewVideoWebPath = `/assets/videos/${savedStyle.previewVideo}`
          }
        }
        
        const styleObj: any = {
          id: savedStyle.id,
          name: savedStyle.name || savedStyle.id,
          previewTitle: savedStyle.previewTitle,
          previewSubtitle: savedStyle.previewSubtitle,
          previewCaptions: savedStyle.previewCaptions,
          hasSubTitle: savedStyle.hasSubTitle || false,
          mainTitle: savedStyle.mainTitle || {
            font: 'Arial',
            fontSize: 48,
            fontWeight: 400,
            color: '#FFFFFF',
            strokeColor: '#000000',
            top: 100,
            borderRadius: 10,
            backgroundColor: 'transparent'
          },
          subTitle: savedStyle.subTitle || (savedStyle.hasSubTitle ? {
            font: 'Arial',
            fontSize: 36,
            fontWeight: 400,
            color: '#FFFFFF',
            strokeColor: '#000000',
            top: 50,
            borderRadius: 10,
            backgroundColor: 'transparent'
          } : undefined),
          subtitleEffect: savedStyle.subtitleEffect
        }
        // Only add previewImage if file exists
        if (previewImageWebPath) {
          styleObj.previewImage = previewImageWebPath
        }
        // Only add previewVideo if file exists
        if (previewVideoWebPath) {
          styleObj.previewVideo = previewVideoWebPath
        }
        styles.push(styleObj)
      }
      return styles
    } catch (error) {
      console.error('Failed to list builtin title styles:', error)
      return []
    }
  })

  ipcMain.handle('load-builtin-title-styles-config', async () => {
    const configPath = resolveAssetPath('title-styles', 'builtin_title_styles_config.json')
    if (!fs.existsSync(configPath)) return { items: [] }
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw || '{"items":[]}')
  })

  // Save custom title theme
  ipcMain.handle('save-custom-title-theme', async (_, themeData: any) => {
    try {
      const configPath = path.join(getUserDataPath(), 'custom_title_themes.json')
      const config = loadJsonSafe(configPath, { themes: [] })
      config.themes = config.themes || []
      const themeId = `custom_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
      const theme = {
        ...themeData,
        id: themeId,
        isCustom: true,
        createdAt: Date.now()
      }
      config.themes.push(theme)
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
      return { success: true, theme }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Delete custom title theme
  ipcMain.handle('delete-custom-title-theme', async (_, themeId: string) => {
    try {
      const configPath = path.join(getUserDataPath(), 'custom_title_themes.json')
      const config = loadJsonSafe(configPath, { themes: [] })
      config.themes = (config.themes || []).filter((t: any) => t.id !== themeId)
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // List custom title themes
  ipcMain.handle('list-custom-title-themes', async () => {
    try {
      const configPath = path.join(getUserDataPath(), 'custom_title_themes.json')
      const config = loadJsonSafe(configPath, { themes: [] })
      return config.themes || []
    } catch {
      return []
    }
  })

  // Fonts
  ipcMain.handle('list-assets-fonts', async () => {
    const fontsDir = resolveAssetDir('fonts')
    
    if (!fs.existsSync(fontsDir)) return []
    
    const FONT_EXTS = ['.ttf', '.otf', '.woff', '.woff2', '.ttc']
    const files = fs.readdirSync(fontsDir)
    const fonts: Array<{ path: string; fontFamily: string; fileName: string }> = []
    for (const file of files) {
      const ext = path.extname(file).toLowerCase()
      if (FONT_EXTS.includes(ext)) {
        const filePath = path.join(fontsDir, file)
        const fontFamily = path.basename(file, ext)
        fonts.push({ path: filePath, fontFamily, fileName: file })
      }
    }
    return fonts
  })

  // Mix Resources (智能精剪混剪素材)
  ipcMain.handle('load-mix-resources-config', async () => {
    const configPath = path.join(getUserDataPath(), 'mix_resources_config.json')
    if (!fs.existsSync(configPath)) return { items: [] }
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw || '{"items":[]}')
  })

  ipcMain.handle('save-mix-resources-config', async (_, config: any) => {
    const configPath = path.join(getUserDataPath(), 'mix_resources_config.json')
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    return { success: true }
  })

  // PIP Resources (智能精剪画中画素材)
  ipcMain.handle('load-pip-resources-config', async () => {
    const configPath = path.join(getUserDataPath(), 'pip_resources_config.json')
    if (!fs.existsSync(configPath)) return { items: [] }
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw || '{"items":[]}')
  })

  ipcMain.handle('save-pip-resources-config', async (_, config: any) => {
    const configPath = path.join(getUserDataPath(), 'pip_resources_config.json')
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    return { success: true }
  })

  // Upload video material (上传视频素材)
  ipcMain.handle('upload-video-material', async (_, sourcePath: string, originalName: string) => {
    try {
      const videosDir = path.join(getUserDataPath(), 'uploaded_videos')
      if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true })
      
      const videoId = `video_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
      const ext = path.extname(originalName) || '.mp4'
      const destPath = path.join(videosDir, `${videoId}${ext}`)
      
      fs.copyFileSync(sourcePath, destPath)
      
      // Update config - use name without extension for consistency
      const configPath = path.join(getUserDataPath(), 'uploaded_videos_config.json')
      const config = loadJsonSafe(configPath, { videos: [] })
      config.videos = config.videos || []
      const nameWithoutExt = path.basename(originalName, path.extname(originalName))
      config.videos.push({
        id: videoId,
        name: nameWithoutExt,
        path: destPath,
        uploadedAt: Date.now()
      })
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
      
      return { success: true, file_path: destPath, video_id: videoId }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Upload BGM material (上传BGM素材)
  ipcMain.handle('upload-bgm-material', async (_, sourcePath: string, originalName: string, category?: string) => {
    try {
      const bgmsDir = path.join(getUserDataPath(), 'uploaded_bgms')
      if (!fs.existsSync(bgmsDir)) fs.mkdirSync(bgmsDir, { recursive: true })
      
      const bgmId = `bgm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
      const ext = path.extname(originalName) || '.mp3'
      const destPath = path.join(bgmsDir, `${bgmId}${ext}`)
      
      fs.copyFileSync(sourcePath, destPath)
      
      // Update config
      const configPath = path.join(getUserDataPath(), 'uploaded_bgms_config.json')
      const config = loadJsonSafe(configPath, { bgms: [] })
      config.bgms = config.bgms || []
      config.bgms.push({
        id: bgmId,
        name: originalName,
        path: destPath,
        category: category || '推荐',
        uploadedAt: Date.now()
      })
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
      
      return { success: true, file_path: destPath, bgm_id: bgmId }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}
