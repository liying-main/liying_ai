import { ipcMain, app } from 'electron'
import fs from 'fs'
import path from 'path'
import { getUserDataPath, getLocalFileUrl, getLocalServerBaseUrl } from '../local-server'
import { getCloudResourcesDir } from '../resource-manager'
import {
  ensureSmartcutPreviewVideo,
  resolveSmartcutMediaPath,
} from '../smartcut-preview-video'

function resolveAssetFilePath(relativePath: string): string {
  const relativeAssetPath = relativePath.substring('/assets/'.length)
  const cloudPath = path.join(getCloudResourcesDir(), relativeAssetPath)
  if (fs.existsSync(cloudPath)) return cloudPath

  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', relativeAssetPath)
  }

  const candidates = [
    path.join(process.cwd(), 'assets', relativeAssetPath),
    path.join(process.cwd(), 'app', 'assets', relativeAssetPath),
    path.join(process.cwd(), 'src', 'assets', relativeAssetPath),
    path.join(__dirname, '..', '..', '..', 'assets', relativeAssetPath)
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0]
}

function safeFileName(fileName: string): string {
  const parsed = path.parse(fileName || 'file')
  const name = parsed.name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 80) || 'file'
  const ext = parsed.ext.replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
  return `${name}${ext}`
}

function cleanupMisroutedReferenceVideo(originalName: string): string[] {
  const configPath = path.join(getUserDataPath(), 'uploaded_videos_config.json')
  if (!fs.existsSync(configPath)) return []

  const targetName = path.basename(originalName || '', path.extname(originalName || '')).trim()
  if (!targetName) return []

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8') || '{"videos":[]}')
    const videos = Array.isArray(config.videos) ? config.videos : []
    const removed: any[] = []
    const kept = videos.filter((item: any) => {
      const itemName = String(item?.name || '').trim()
      const shouldRemove = itemName === targetName
      if (shouldRemove) removed.push(item)
      return !shouldRemove
    })

    if (removed.length === 0) return []

    fs.writeFileSync(configPath, JSON.stringify({ ...config, videos: kept }, null, 2), 'utf-8')
    const uploadedDir = path.resolve(getUserDataPath('uploaded_videos'))
    for (const item of removed) {
      const filePath = typeof item?.path === 'string' ? path.resolve(item.path) : ''
      if (filePath.startsWith(uploadedDir + path.sep) && fs.existsSync(filePath)) {
        fs.rmSync(filePath, { force: true })
      }
    }
    return removed.map((item) => item.id).filter(Boolean)
  } catch (error) {
    console.warn('[ReferenceVideo] cleanup misrouted uploaded video failed:', error)
    return []
  }
}

function tryResolveExistingFilePath(filePath: string): string {
  return resolveSmartcutMediaPath(filePath)
}

export function registerFileHandlers(): void {
  ipcMain.handle('get-local-server-base-url', async () => {
    return getLocalServerBaseUrl()
  })

  ipcMain.handle('get-assets-path', async (_, relativePath: string) => {
    const cloudPath = path.join(getCloudResourcesDir(), relativePath)
    if (fs.existsSync(cloudPath)) return cloudPath

    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', relativePath)
    }
    return path.join(process.cwd(), 'assets', relativePath)
  })

  ipcMain.handle('get-user-data-path', async (_, subPath?: string) => {
    return getUserDataPath(subPath ?? '')
  })

  ipcMain.handle('list-user-data-files', async (_, subPath: string, recursive = false) => {
    try {
      const dirPath = getUserDataPath(subPath)
      if (!fs.existsSync(dirPath)) return []
      
      if (recursive) {
        return collectFilesRecursive(dirPath)
      }
      
      const files = fs.readdirSync(dirPath, { withFileTypes: true })
      return files
        .filter(f => f.isFile())
        .map(f => {
          const fp = path.join(dirPath, f.name)
          const st = fs.statSync(fp)
          return { name: f.name, path: fp, size: st.size, mtime: st.mtime }
        })
    } catch (error) {
      console.error('list user data files failed:', error)
      return []
    }
  })

  ipcMain.handle('delete-user-data-file', async (_, filePath: string) => {
    try {
      const appDataDir = getUserDataPath()
      const normalizedFilePath = path.resolve(filePath)
      const normalizedAppDataDir = path.resolve(appDataDir)
      
      if (!normalizedFilePath.startsWith(normalizedAppDataDir + path.sep)) {
        return { success: false, error: '只能删除用户数据目录下的文件' }
      }
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        return { success: true }
      }
      return { success: false, error: 'File not found' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('get-local-file-url', async (_, filePath: string) => {
    try {
      if (/^https?:\/\//i.test(filePath)) {
        return { success: true, url: filePath }
      }
      // Resolve /assets/ prefixed paths to actual filesystem paths
      let resolvedPath = filePath
      if (filePath.startsWith('/assets/')) {
        resolvedPath = resolveAssetFilePath(filePath)
      }
      resolvedPath = tryResolveExistingFilePath(resolvedPath)
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File not found: ${resolvedPath}`)
      }
      const url = getLocalFileUrl(resolvedPath)
      if (url) {
        return { success: true, url }
      }
      throw new Error(`File must be in app-data2 or assets directory`)
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('get-smartcut-preview-url', async (_, filePath: string) => {
    try {
      if (/^https?:\/\//i.test(filePath)) {
        return { success: true, url: filePath }
      }
      let resolvedPath = filePath
      if (filePath.startsWith('/assets/')) {
        resolvedPath = resolveAssetFilePath(filePath)
      }
      resolvedPath = await ensureSmartcutPreviewVideo(
        tryResolveExistingFilePath(resolvedPath),
      )
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File not found: ${resolvedPath}`)
      }
      const url = getLocalFileUrl(resolvedPath)
      if (url) {
        return { success: true, url, resolvedPath }
      }
      throw new Error(`File must be in app-data2 or assets directory`)
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('ensure-smartcut-preview-video', async (_, filePath: string) => {
    try {
      const resolvedPath = await ensureSmartcutPreviewVideo(
        tryResolveExistingFilePath(filePath),
      )
      if (!fs.existsSync(resolvedPath)) {
        return { success: false, error: '视频文件不存在' }
      }
      return { success: true, file_path: resolvedPath.replace(/\\/g, '/') }
    } catch (error: any) {
      return { success: false, error: error.message || '混剪素材转码失败' }
    }
  })

  ipcMain.handle('read-file-as-base64', async (_, filePath: string) => {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }
    const buffer = fs.readFileSync(filePath)
    const base64 = buffer.toString('base64')
    const ext = path.extname(filePath).toLowerCase()
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream'
    const fileName = path.basename(filePath)
    return { base64, mimeType, fileName }
  })

  ipcMain.handle('save-file-from-base64', async (_, base64Data: string, fileName: string, subPath = '') => {
    try {
      const targetDir = getUserDataPath(subPath)
      const filePath = path.join(targetDir, fileName)
      const buffer = Buffer.from(base64Data, 'base64')
      fs.writeFileSync(filePath, buffer)
      return { success: true, file_path: filePath.replace(/\\/g, '/') }
    } catch (error: any) {
      return { success: false, error: error.message || 'save failed' }
    }
  })

  ipcMain.handle('copy-local-file-to-user-data', async (_, sourcePath: string, originalName: string, subPath = 'temp/reference-videos') => {
    try {
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        return { success: false, error: 'Source file not found' }
      }

      const targetDir = getUserDataPath(subPath)
      const fileName = safeFileName(originalName || path.basename(sourcePath))
      const ext = path.extname(fileName) || path.extname(sourcePath)
      const baseName = path.basename(fileName, path.extname(fileName))
      const destPath = path.join(targetDir, `${Date.now()}_${baseName}${ext}`)
      fs.copyFileSync(sourcePath, destPath)
      const removedVideoIds = subPath === 'temp/reference-videos'
        ? cleanupMisroutedReferenceVideo(originalName || fileName)
        : []
      return { success: true, file_path: destPath.replace(/\\/g, '/'), removed_video_ids: removedVideoIds }
    } catch (error: any) {
      return { success: false, error: error.message || 'copy failed' }
    }
  })
}

function collectFilesRecursive(dirPath: string): any[] {
  const result: any[] = []
  if (!fs.existsSync(dirPath)) return result
  
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isFile()) {
      try {
        const stats = fs.statSync(fullPath)
        result.push({ name: entry.name, path: fullPath, size: stats.size, mtime: stats.mtime })
      } catch {}
    } else if (entry.isDirectory()) {
      result.push(...collectFilesRecursive(fullPath))
    }
  }
  return result
}

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac'
}

// Video generate history handlers
const VIDEO_HISTORY_FILE = 'video_generate_history.json'

function getVideoHistoryPath(): string {
  return path.join(getUserDataPath(''), VIDEO_HISTORY_FILE)
}

export function registerVideoHistoryHandlers(): void {
  ipcMain.handle('get-video-generate-history', async () => {
    try {
      const historyPath = getVideoHistoryPath()
      if (!fs.existsSync(historyPath)) {
        return []
      }
      const data = fs.readFileSync(historyPath, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      console.error('Failed to read video history:', error)
      return []
    }
  })

  ipcMain.handle('set-video-generate-history', async (_, list: any[]) => {
    try {
      const historyPath = getVideoHistoryPath()
      fs.writeFileSync(historyPath, JSON.stringify(list, null, 2), 'utf-8')
      return { success: true }
    } catch (error: any) {
      console.error('Failed to save video history:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('clear-video-generate-history', async () => {
    try {
      const historyPath = getVideoHistoryPath()
      if (fs.existsSync(historyPath)) {
        fs.unlinkSync(historyPath)
      }
      return { success: true }
    } catch (error: any) {
      console.error('Failed to clear video history:', error)
      return { success: false, error: error.message }
    }
  })
}
