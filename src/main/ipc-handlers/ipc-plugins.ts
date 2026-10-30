import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import { getUserDataPath } from '../local-server'
import {
  setCancelFlag,
  registerPluginProxyHandlers,
  needTokenFromMain,
} from './ipc-plugin-proxy'

declare const __APP_VERSION__: string

function getClientApiVersion(): string {
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '3.2.4'
}

function safePluginName(pluginName: string): string {
  const normalized = String(pluginName || '').trim()
  if (!normalized || normalized !== path.basename(normalized) || !/^[a-zA-Z0-9._-]+$/.test(normalized)) {
    throw new Error('插件名称无效')
  }
  return normalized
}

function formatDownloadError(statusCode: number, body: Buffer): string {
  const text = body.toString('utf8').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim()
  if (!text) return `下载失败: HTTP ${statusCode}`
  try {
    const parsed = JSON.parse(text)
    const message = parsed?.message || parsed?.msg || parsed?.error || parsed?.detail
    if (message) return `下载失败: HTTP ${statusCode}，${String(message).slice(0, 240)}`
  } catch {
    // Some gateways return plain text or HTML instead of JSON.
  }
  return `下载失败: HTTP ${statusCode}，${text.replace(/\s+/g, ' ').slice(0, 240)}`
}

function downloadPluginFile(
  pluginUrl: string,
  destination: string,
  token: string | null,
  redirectCount = 0,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let parsedUrl: URL
    try {
      parsedUrl = new URL(pluginUrl)
    } catch {
      reject(new Error('插件下载地址无效'))
      return
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      reject(new Error('插件下载地址协议不受支持'))
      return
    }
    if (redirectCount > 5) {
      reject(new Error('插件下载重定向次数过多'))
      return
    }

    const client = parsedUrl.protocol === 'https:' ? https : http
    const request = client.get(parsedUrl, {
      headers: {
        Accept: 'application/javascript, text/javascript, application/octet-stream, */*',
        'User-Agent': 'liying-ai/3.2.4',
        'X-App-Version': getClientApiVersion(),
        ...(token ? { Authorization: token } : {}),
      },
    }, (response) => {
      const status = response.statusCode || 0
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume()
        const nextUrl = new URL(response.headers.location, parsedUrl).toString()
        const nextParsedUrl = new URL(nextUrl)
        const nextToken = nextParsedUrl.origin === parsedUrl.origin ? token : null
        downloadPluginFile(nextUrl, destination, nextToken, redirectCount + 1).then(resolve, reject)
        return
      }
      if (status < 200 || status >= 300) {
        const chunks: Buffer[] = []
        let size = 0
        response.on('data', (chunk: Buffer) => {
          if (size >= 4096) return
          const part = chunk.subarray(0, 4096 - size)
          chunks.push(part)
          size += part.length
        })
        response.on('end', () => reject(new Error(formatDownloadError(status, Buffer.concat(chunks)))))
        return
      }

      const tempPath = `${destination}.${process.pid}.${Date.now()}.tmp`
      const fileStream = fs.createWriteStream(tempPath, { flags: 'wx' })
      response.pipe(fileStream)
      fileStream.on('finish', () => {
        fileStream.close(() => {
          try {
            fs.renameSync(tempPath, destination)
            resolve()
          } catch (error) {
            try { fs.unlinkSync(tempPath) } catch {}
            reject(error)
          }
        })
      })
      fileStream.on('error', (error) => {
        response.destroy()
        try { fs.unlinkSync(tempPath) } catch {}
        reject(error)
      })
      response.on('error', (error) => {
        fileStream.destroy()
        try { fs.unlinkSync(tempPath) } catch {}
        reject(error)
      })
    })
    request.on('error', reject)
  })
}

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
    try {
      const safeName = safePluginName(pluginName)
      const pluginsDir = getPluginsDir()
      const pluginDir = path.join(pluginsDir, safeName)
      fs.mkdirSync(pluginDir, { recursive: true })
      const filePath = path.join(pluginDir, `${safeName}.js`)

      let token: string | null = null
      try {
        token = await needTokenFromMain()
      } catch {
        // Public plugin endpoints do not require a token.
      }
      await downloadPluginFile(pluginUrl, filePath, token)
      return { success: true, file_path: filePath }
    } catch (error: any) {
      console.error('[Plugin] download failed:', error?.message || error)
      return { success: false, error: error?.message || '下载插件失败' }
    }
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
