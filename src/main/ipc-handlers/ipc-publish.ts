import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { getUserDataPath } from '../local-server'

const ACCOUNTS_FILE = 'publish-accounts.json'
const TASKS_FILE = 'publish-tasks.json'

function sanitizeProfileDirName(value: string): string {
  return (String(value || '').trim() || 'default').replace(/[/\\:*?"<>|]/g, '_')
}

function getPublishAccountProfileDir(accountId: string): string {
  return getUserDataPath(`publish-browser-profiles/${sanitizeProfileDirName(accountId)}`)
}

function readJsonArray(fileName: string): any[] {
  const filePath = path.join(getUserDataPath(''), fileName)
  if (!fs.existsSync(filePath)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8') || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeJsonArray(fileName: string, list: any[]) {
  const filePath = path.join(getUserDataPath(''), fileName)
  fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf-8')
}

export function registerPublishHandlers(): void {
  ipcMain.handle('get-publish-accounts', async () => readJsonArray(ACCOUNTS_FILE))

  ipcMain.handle('save-publish-accounts', async (_, list: any[]) => {
    try {
      writeJsonArray(ACCOUNTS_FILE, Array.isArray(list) ? list : [])
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('get-publish-tasks', async () => readJsonArray(TASKS_FILE))

  ipcMain.handle('save-publish-tasks', async (_, list: any[]) => {
    try {
      writeJsonArray(TASKS_FILE, Array.isArray(list) ? list : [])
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('ensure-publish-profile-dir', async (_, accountId: string) => {
    try {
      const dir = getPublishAccountProfileDir(accountId)
      fs.mkdirSync(dir, { recursive: true })
      return { success: true, userDataDir: dir }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}
