import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import { getUserDataPath } from '../local-server'
import {
  setCancelFlag,
  registerPluginProxyHandlers
} from './ipc-plugin-proxy'

// Plugin loading state
const loadedPlugins = new Map<string, any>()

function getPluginsDir(): string {
  return getUserDataPath('plugins')
}

function checkPluginExists(pluginName: string): { exists: boolean; filePath?: string } {
  const pluginsDir = getPluginsDir()
  const pluginDir = path.join(pluginsDir, pluginName)
  const filePath = path.join(pluginDir, `${pluginName}.js`)
  
  if (fs.existsSync(filePath)) {
    return { exists: true, filePath }
  }
  return { exists: false }
}

async function loadAllPlugins(pluginNames: string[]): Promise<void> {
  for (const name of pluginNames) {
    const { exists, filePath } = checkPluginExists(name)
    if (exists && filePath) {
      try {
        // Dynamic import of plugin
        const plugin = require(filePath)
        loadedPlugins.set(name, plugin)
        console.log(`[Plugin] Loaded: ${name}`)
      } catch (e) {
        console.warn(`[Plugin] Failed to load ${name}:`, e)
      }
    }
  }
}

async function invokePlugin(pluginName: string, methodName: string, args: any[]): Promise<any> {
  const plugin = loadedPlugins.get(pluginName)
  if (!plugin) {
    throw new Error(`Plugin not loaded: ${pluginName}`)
  }
  
  const method = plugin[methodName]
  if (typeof method !== 'function') {
    throw new Error(`Method not found: ${pluginName}.${methodName}`)
  }
  
  return method(...args)
}

export function registerPluginHandlers(): void {
  // Register plugin proxy handlers (TTS, Whisper, Video)
  registerPluginProxyHandlers()
  
  ipcMain.handle('load-all-plugins', async (_, pluginNames: string[]) => {
    try {
      await loadAllPlugins(pluginNames ?? ['transcribe', 'text-to-audio', 'video-generate'])
      return { success: true }
    } catch (e) {
      console.warn('[Plugin] loadAllPlugins failed:', e)
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('download-plugin', async (_, pluginUrl: string, pluginName: string) => {
    return new Promise((resolve) => {
      try {
        const pluginsDir = getPluginsDir()
        const pluginDir = path.join(pluginsDir, pluginName)
        if (!fs.existsSync(pluginDir)) {
          fs.mkdirSync(pluginDir, { recursive: true })
        }
        
        const fileName = `${pluginName}.js`
        const filePath = path.join(pluginDir, fileName)
        const fileStream = fs.createWriteStream(filePath)
        const protocol = pluginUrl.startsWith('https') ? https : http
        
        protocol.get(pluginUrl, (response) => {
          if (response.statusCode !== 200) {
            fileStream.close()
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
            resolve({
              success: false,
              error: `下载失败: HTTP ${response.statusCode}`
            })
            return
          }
          
          response.pipe(fileStream)
          fileStream.on('finish', () => {
            fileStream.close()
            resolve({
              success: true,
              file_path: filePath
            })
          })
          
          fileStream.on('error', (err) => {
            fileStream.close()
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
            resolve({
              success: false,
              error: `下载失败: ${err.message}`
            })
          })
        }).on('error', (err) => {
          fileStream.close()
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
          resolve({
            success: false,
            error: `下载失败: ${err.message}`
          })
        })
      } catch (error: any) {
        resolve({
          success: false,
          error: error.message || '下载插件失败'
        })
      }
    })
  })

  ipcMain.handle('check-plugin-exists', async (_, pluginName: string) => {
    try {
      const { exists, filePath } = checkPluginExists(pluginName)
      return { exists, file_path: filePath }
    } catch (error: any) {
      return { exists: false, error: error.message }
    }
  })

  ipcMain.handle('invoke-plugin', async (_, pluginName: string, methodName: string, args: any[]) => {
    try {
      const result = await invokePlugin(pluginName, methodName, args ?? [])
      return {
        success: true,
        result
      }
    } catch (error: any) {
      console.error(`[Plugin] invoke ${pluginName}.${methodName} failed:`, error)
      return {
        success: false,
        error: error.message
      }
    }
  })

  ipcMain.handle('cancel-plugin-queue', (_, pluginName: string) => {
    setCancelFlag(pluginName)
    return { success: true }
  })
}
