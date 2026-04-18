import { ipcMain, app } from 'electron'
import fs from 'fs'
import path from 'path'
import { getUserDataPath, getLocalFileUrl, getLocalServerBaseUrl } from '../local-server'

export function registerFileHandlers(): void {
  ipcMain.handle('get-local-server-base-url', async () => {
    return getLocalServerBaseUrl()
  })

  ipcMain.handle('get-assets-path', async (_, relativePath: string) => {
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
      // Resolve /assets/ prefixed paths to actual filesystem paths
      let resolvedPath = filePath
      if (filePath.startsWith('/assets/')) {
        const relativePath = filePath.substring('/assets/'.length)
        if (app.isPackaged) {
          resolvedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', relativePath)
        } else {
          resolvedPath = path.join(process.cwd(), 'assets', relativePath)
        }
      }
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
