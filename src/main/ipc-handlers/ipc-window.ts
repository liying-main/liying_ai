import { ipcMain, BrowserWindow, dialog } from 'electron'
import fs from 'fs'
import path from 'path'

export function registerWindowHandlers(): void {
  ipcMain.handle('window-minimize', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) window.minimize()
  })

  ipcMain.handle('window-maximize', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) {
      if (window.isMaximized()) {
        window.unmaximize()
      } else {
        window.maximize()
      }
    }
  })

  ipcMain.handle('window-close', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) window.close()
  })

  ipcMain.handle('window-reload', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) window.webContents.reload()
  })

  ipcMain.handle('window-is-maximized', () => {
    const window = BrowserWindow.getFocusedWindow()
    return window ? window.isMaximized() : false
  })

  ipcMain.handle('select-file', async (_, options?: { title?: string; filters?: Electron.FileFilter[] }) => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) return null
    
    const result = await dialog.showOpenDialog(window, {
      title: options?.title || '选择文件',
      filters: options?.filters || [
        { name: '视频文件', extensions: ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('select-directory', async (_, options?: { title?: string }) => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) return null
    
    const result = await dialog.showOpenDialog(window, {
      title: options?.title || '选择文件夹',
      properties: ['openDirectory']
    })
    
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('save-local-file-as', async (_, sourcePath: string) => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) return { success: false, error: '无窗口', canceled: false }
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return { success: false, error: '源文件不存在', canceled: false }
    }
    
    const defaultName = path.basename(sourcePath)
    const result = await dialog.showSaveDialog(window, {
      title: '保存视频',
      defaultPath: defaultName,
      filters: [
        { name: '视频文件', extensions: ['mp4'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    
    if (result.canceled || !result.filePath) {
      return { success: true, canceled: true }
    }
    
    try {
      fs.copyFileSync(sourcePath, result.filePath)
      return { success: true, canceled: false, filePath: result.filePath }
    } catch (err: any) {
      return { success: false, error: err?.message ?? '复制失败', canceled: false }
    }
  })
}
