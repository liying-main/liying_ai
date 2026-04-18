import { ipcMain, app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { getMainWindow } from '../index'
import * as fs from 'fs'
import * as path from 'path'
import * as http from 'http'
import * as https from 'https'
import { spawn } from 'child_process'

export function registerUpdaterHandlers(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-checking')
    }
  })

  autoUpdater.on('update-available', (info) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes
      })
    }
  })

  autoUpdater.on('update-not-available', () => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-not-available')
    }
  })

  autoUpdater.on('error', (error) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-error', { message: error.message })
    }
  })

  autoUpdater.on('download-progress', (progress) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-download-progress', {
        percent: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total
      })
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-downloaded', {
        version: info.version,
        releaseDate: info.releaseDate
      })
    }
  })

  ipcMain.handle('update-check', async (_, updateServerUrl?: string) => {
    try {
      if (updateServerUrl) {
        autoUpdater.setFeedURL({ provider: 'generic', url: updateServerUrl })
      }
      const result = await autoUpdater.checkForUpdates()
      return { success: true, updateInfo: result?.updateInfo }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('update-download', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('update-install', async () => {
    try {
      autoUpdater.quitAndInstall(false, true)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Custom download and install (direct HTTP download of installer)
  ipcMain.handle(
    'update-download-and-install',
    async (_, downloadUrl: string, version: string, description: string, _forceUpdate: boolean) => {
      try {
        const mainWindow = getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update-download-start', { version, description })
        }

        const userDataDir = app.getPath('userData')
        const updateDir = path.join(userDataDir, 'updates')
        if (!fs.existsSync(updateDir)) {
          fs.mkdirSync(updateDir, { recursive: true })
        }

        const urlFileName = downloadUrl.split('/').pop() || ''
        const fileName = urlFileName.includes('.') ? urlFileName : `update-${version}.exe`
        const filePath = path.join(updateDir, fileName)

        return new Promise((resolve, reject) => {
          const file = fs.createWriteStream(filePath)
          const protocol = downloadUrl.startsWith('https') ? https : http

          protocol
            .get(downloadUrl, (response) => {
              // Handle redirects
              if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectUrl = response.headers.location
                if (redirectUrl) {
                  file.close()
                  try { fs.unlinkSync(filePath) } catch {}
                  // Create new WriteStream for redirect
                  const newFile = fs.createWriteStream(filePath)
                  const redirectProtocol = redirectUrl.startsWith('https') ? https : http
                  redirectProtocol
                    .get(redirectUrl, (redirectResponse) => {
                      handleDownloadResponse(redirectResponse, newFile, filePath, version, resolve, reject)
                    })
                    .on('error', (err) => reject(err))
                  return
                }
              }
              handleDownloadResponse(response, file, filePath, version, resolve, reject)
            })
            .on('error', (err) => {
              reject(err)
            })
        })
      } catch (error: any) {
        console.error('下载更新失败:', error)
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send('update-error', { message: error.message })
        }
        return { success: false, error: error.message }
      }
    }
  )

  // Manual installer execution
  ipcMain.handle('update-install-manual', async (_, filePath: string) => {
    try {
      spawn(filePath, [], { detached: true, stdio: 'ignore' })
      app.quit()
      return { success: true }
    } catch (error: any) {
      console.error('安装更新失败:', error)
      return { success: false, error: error.message }
    }
  })
}

function handleDownloadResponse(
  response: http.IncomingMessage,
  file: fs.WriteStream,
  filePath: string,
  version: string,
  resolve: (value: any) => void,
  reject: (reason?: any) => void
): void {
  if (response.statusCode !== 200) {
    file.close()
    try { fs.unlinkSync(filePath) } catch {}
    reject(new Error(`下载失败: HTTP ${response.statusCode}`))
    return
  }

  const totalSize = parseInt(response.headers['content-length'] || '0', 10)
  let downloadedSize = 0

  response.on('data', (chunk: Buffer) => {
    downloadedSize += chunk.length
    const percent = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-download-progress', {
        percent,
        transferred: downloadedSize,
        total: totalSize
      })
    }
  })

  response.pipe(file)

  file.on('finish', () => {
    file.close()
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-downloaded', {
        version,
        filePath
      })
    }
    resolve({ success: true, filePath, version })
  })

  file.on('error', (err) => {
    try { fs.unlinkSync(filePath) } catch {}
    reject(err)
  })
}
