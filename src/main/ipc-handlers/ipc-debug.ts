import { ipcMain } from 'electron'

export function registerDebugHandlers(): void {
  ipcMain.handle('debug-log', async (_event, ...args: any[]) => {
    try {
      console.log('[renderer]', ...args)
    } catch {
      console.log('[renderer] (log failed)')
    }
    return { success: true }
  })
}
