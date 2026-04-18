import { ipcMain, BrowserWindow, app } from 'electron'
import { spawn, exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import { getUserDataPath } from '../local-server'
import { API_BASE_URL } from '../api-config'
import { needTokenFromMain } from './ipc-plugin-proxy'

function getFfmpegPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'ffmpeg', 'bin', 'ffmpeg.exe')
    : path.join(process.cwd(), 'ffmpeg', 'bin', 'ffmpeg.exe')
}

// API Configuration
const NONCE_INFO_KEY = 'douyin_cookies_info'

// Token cache
let cachedToken: string | null = null

declare const __APP_VERSION__: string
function getClientApiVersion(): string {
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '3.0.1'
}

function appVersionHeaders(): Record<string, string> {
  return { 'X-App-Version': getClientApiVersion() }
}

async function cacheToken(): Promise<string | null> {
  // Token should be provided by renderer process
  return cachedToken
}

export function setDownloadToken(token: string): void {
  cachedToken = token
}

function getDouyinExePath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'douyin', 'downloadDouyinVideo.exe')
    : path.join(process.cwd(), 'douyin', 'downloadDouyinVideo.exe')
}

function getDouyinPackagedExeCwd(): string {
  return getUserDataPath('douyin-packaged-exe')
}

// Parse JSON result from stdout
function parseJsonFromStdout(stdout: string): any {
  // Try to find JSON in stdout
  const lastBraceIndex = stdout.lastIndexOf('{')
  if (lastBraceIndex !== -1) {
    const jsonStr = stdout.substring(lastBraceIndex)
    let braceCount = 0
    let jsonEndIndex = -1
    for (let i = 0; i < jsonStr.length; i++) {
      if (jsonStr[i] === '{') braceCount++
      if (jsonStr[i] === '}') {
        braceCount--
        if (braceCount === 0) {
          jsonEndIndex = i + 1
          break
        }
      }
    }
    if (jsonEndIndex !== -1) {
      try {
        return JSON.parse(jsonStr.substring(0, jsonEndIndex))
      } catch {
        // Continue to next method
      }
    }
  }
  
  // Try line by line
  const lines = stdout.trim().split('\n').filter(line => line.trim())
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line) continue
    try {
      return JSON.parse(line)
    } catch {
      continue
    }
  }
  return null
}

export function registerDownloadHandlers(): void {
  ipcMain.handle('download-video-from-url', async (_, videoUrl: string, fileName: string) => {
    console.log('[download-video] Starting download:', { videoUrl, fileName })
    
    let token: string | null = null
    try {
      token = await needTokenFromMain()
    } catch {
      token = await cacheToken()
    }
    console.log('[download-video] Using token:', token ? 'present' : 'empty')
    
    return new Promise((resolve) => {
      const outputDir = getUserDataPath('videos/generated')
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
      const outputPath = path.join(outputDir, fileName)
      const file = fs.createWriteStream(outputPath)
      const protocol = videoUrl.startsWith('https') ? https : http
      
      const request = protocol.get(videoUrl, {
        headers: { 'Authorization': token || '' }
      }, (response) => {
        console.log('[download-video] Response status:', response.statusCode)
        if (response.statusCode !== 200) {
          file.close()
          try { fs.unlinkSync(outputPath) } catch {}
          resolve({ success: false, error: `HTTP ${response.statusCode}` })
          return
        }
        response.pipe(file)
        file.on('finish', () => {
          file.close()
          console.log('[download-video] Downloaded to:', outputPath)
          resolve({ success: true, file_path: outputPath })
        })
      })
      
      request.on('error', (err) => {
        console.log('[download-video] Request error:', err.message)
        file.close()
        try { fs.unlinkSync(outputPath) } catch {}
        resolve({ success: false, error: err.message })
      })
      
      file.on('error', (err) => {
        console.log('[download-video] File write error:', err.message)
        request.destroy()
        try { fs.unlinkSync(outputPath) } catch {}
        resolve({ success: false, error: err.message })
      })
    })
  })

  ipcMain.handle('download-audio-from-url', async (event, audioUrl: string, options?: any) => {
    console.log('[download-audio] Starting download:', { audioUrl, options })
    
    const silenceSeconds = Math.max(0, Math.min(10, options?.silenceSeconds ?? 1))
    const rawSpeed = options?.audioSpeed
    const audioSpeed = typeof rawSpeed === 'number' && Number.isFinite(rawSpeed) 
      ? Math.min(1.5, Math.max(0.8, rawSpeed)) 
      : 1
    
    const outputDir = getUserDataPath('audio/generated')
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const ffmpegPath = getFfmpegPath()
    
    if (!fs.existsSync(ffmpegPath)) {
      return { success: false, error: 'FFmpeg 未找到' }
    }
    
    const tempWavPath = path.join(outputDir, `audio_temp_${timestamp}.wav`)
    const finalWavPath = path.join(outputDir, `audio_${timestamp}.wav`)
    let spedWavPath: string | undefined
    
    const execFfmpeg = (cmd: string): Promise<void> => new Promise((res, rej) => {
      console.log('Executing ffmpeg:', cmd)
      exec(cmd, { maxBuffer: 50 * 1024 * 1024, encoding: 'utf8' }, (err, _stdout, stderr) => {
        if (err) {
          const stderrTail = (stderr || '').trim().split('\n').slice(-5).join('\n')
          console.error('[ffmpeg] stderr:', stderr)
          rej(new Error(stderrTail || err.message || 'FFmpeg failed'))
        } else res()
      })
    })
    
    try {
      // Download audio file
      const urlParts = audioUrl.split('/')
      const urlFileName = urlParts[urlParts.length - 1].split('?')[0] || `audio_${timestamp}`
      const ext = path.extname(urlFileName) || '.bin'
      const downloadedPath = path.join(outputDir, `audio_downloaded_${timestamp}${ext}`)
      
      let token: string | null = null
      try {
        token = await needTokenFromMain()
      } catch {
        token = await cacheToken()
      }
      console.log('[download-audio] Using token:', token ? 'present' : 'empty')
      const downloadOk = await new Promise<boolean>((resolve) => {
        const urlObj = new URL(audioUrl)
        const client = urlObj.protocol === 'https:' ? https : http
        const fileStream = fs.createWriteStream(downloadedPath)
        
        const request = client.get(audioUrl, {
          headers: { 'Authorization': token || '' }
        }, (response) => {
          console.log('[download-audio] Response status:', response.statusCode)
          if (response.statusCode !== 200) {
            console.log('[download-audio] Non-200 response, headers:', response.headers)
            fileStream.close()
            try { fs.unlinkSync(downloadedPath) } catch {}
            resolve(false)
            return
          }
          response.pipe(fileStream)
          fileStream.on('finish', () => {
            fileStream.close()
            resolve(true)
          })
        })
        
        request.on('error', () => {
          fileStream.close()
          try { fs.unlinkSync(downloadedPath) } catch {}
          resolve(false)
        })
        
        fileStream.on('error', () => {
          request.destroy()
          try { fs.unlinkSync(downloadedPath) } catch {}
          resolve(false)
        })
      })
      
      if (!downloadOk || !fs.existsSync(downloadedPath)) {
        console.log('[download-audio] Download failed, downloadOk:', downloadOk)
        return { success: false, error: '音频下载失败' }
      }
      const dlSize = fs.statSync(downloadedPath).size
      console.log('[download-audio] Downloaded to:', downloadedPath, 'size:', dlSize)
      if (dlSize < 1000) {
        const peek = fs.readFileSync(downloadedPath, 'utf8').slice(0, 200)
        console.error('[download-audio] File too small, content:', peek)
        try { fs.unlinkSync(downloadedPath) } catch {}
        return { success: false, error: `音频下载异常：文件过小(${dlSize}字节)，可能服务端返回了错误` }
      }
      
      // Convert to WAV
      const cmd1 = `"${ffmpegPath}" -i "${downloadedPath.replace(/\\/g, '/')}" -acodec pcm_s16le -ar 44100 -ac 2 -y "${tempWavPath.replace(/\\/g, '/')}"`
      await execFfmpeg(cmd1)
      try { fs.unlinkSync(downloadedPath) } catch {}
      
      if (!fs.existsSync(tempWavPath)) {
        return { success: false, error: '音频转换失败：输出文件未生成' }
      }
      
      let currentWavPath = tempWavPath.replace(/\\/g, '/')
      
      // Apply speed adjustment if needed
      if (Math.abs(audioSpeed - 1) > 0.001) {
        spedWavPath = path.join(outputDir, `audio_temp_sped_${timestamp}.wav`).replace(/\\/g, '/')
        const cmdAtempo = `"${ffmpegPath}" -i "${currentWavPath}" -filter:a "atempo=${audioSpeed}" -acodec pcm_s16le -ar 44100 -ac 2 -y "${spedWavPath}"`
        await execFfmpeg(cmdAtempo)
        try { fs.unlinkSync(tempWavPath) } catch {}
        currentWavPath = spedWavPath
      }
      
      // Add silence at beginning if needed
      if (silenceSeconds > 0) {
        const cmd2 = `"${ffmpegPath}" -f lavfi -t ${silenceSeconds} -i anullsrc=r=44100:cl=stereo -i "${currentWavPath}" -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1[out]" -map "[out]" -acodec pcm_s16le -ar 44100 -ac 2 -y "${finalWavPath.replace(/\\/g, '/')}"`
        await execFfmpeg(cmd2)
        try {
          const p = currentWavPath.replace(/\//g, '\\')
          if (fs.existsSync(p)) fs.unlinkSync(p)
        } catch {}
      } else {
        try {
          fs.renameSync(currentWavPath.replace(/\//g, '\\'), finalWavPath)
        } catch (e) {
          try {
            const p = currentWavPath.replace(/\//g, '\\')
            if (fs.existsSync(p)) fs.unlinkSync(p)
          } catch {}
          return { success: false, error: `保存文件失败: ${e instanceof Error ? e.message : String(e)}` }
        }
      }
      
      if (!fs.existsSync(finalWavPath)) {
        return { success: false, error: '音频处理失败：输出文件未生成' }
      }
      
      return { success: true, file_path: finalWavPath, file_name: `audio_${timestamp}.wav` }
    } catch (error: any) {
      // Cleanup temp files
      try { if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath) } catch {}
      try { if (spedWavPath && fs.existsSync(spedWavPath)) fs.unlinkSync(spedWavPath) } catch {}
      return { success: false, error: error.message || '音频处理失败' }
    }
  })

  ipcMain.handle('download-douyin-video', async (event, videoUrl: string, options?: any) => {
    return new Promise(async (resolve) => {
      try {
        const exePath = getDouyinExePath()
        if (!fs.existsSync(exePath)) {
          resolve({
            success: false,
            message: 'Download program not found',
            error: `File not found: ${exePath}`
          })
          return
        }
        
        const cookiesPath = options?.cookiesPath?.trim() || path.join(getUserDataPath(), 'nonce.txt')
        const downloadDir = options?.downloadDir?.trim() || getUserDataPath('videos/downloaded')
        
        // Get token and fetch cookies
        let token: string | null = null
        try {
          token = await needTokenFromMain()
        } catch {
          token = await cacheToken()
        }

        if (token) {
          try {
            const url = `${API_BASE_URL}/app/base/comm/param?key=${encodeURIComponent(NONCE_INFO_KEY)}`
            console.log('[download-douyin] Fetching cookies from:', url)
            const res = await fetch(url, {
              headers: { ...appVersionHeaders(), Authorization: token }
            })
            const json = await res.json() as { data?: any, code?: number, message?: string }
            console.log('[download-douyin] Cookie fetch response:', json)
            const data = json?.data
            if (data != null) {
              fs.writeFileSync(cookiesPath, typeof data === 'string' ? data : JSON.stringify(data))
              console.log('[download-douyin] Cookies written to:', cookiesPath)
            } else {
              console.warn('[download-douyin] No cookie data found in response')
            }
          } catch (e) {
            console.warn('[download-douyin] Failed to fetch cookies:', e)
          }
        }
        
        if (!fs.existsSync(downloadDir)) {
          fs.mkdirSync(downloadDir, { recursive: true })
        }
        
        const spawnArgs = [videoUrl, '-c', cookiesPath, '-d', downloadDir]
        console.log('Executing download command:', exePath, ...spawnArgs)
        
        const cwd = getDouyinPackagedExeCwd()
        if (!fs.existsSync(cwd)) {
          fs.mkdirSync(cwd, { recursive: true })
        }
        
        const child = spawn(exePath, spawnArgs, {
          cwd,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        })
        
        let stdout = ''
        let stderr = ''
        let resolved = false
        
        const safeResolve = (result: any) => {
          if (!resolved) {
            resolved = true
            resolve(result)
          }
        }
        
        child.stdout?.on('data', (chunk) => {
          stdout += String(chunk)
        })
        
        child.stderr?.on('data', (chunk) => {
          stderr += String(chunk)
        })
        
        child.on('close', (code) => {
          console.log('Download process finished')
          console.log('stdout:', stdout)
          console.log('stderr:', stderr)
          
          const finalResult = parseJsonFromStdout(stdout)
          
          if (code !== 0 && code !== null && !finalResult) {
            safeResolve({
              success: false,
              message: 'Download failed',
              error: stderr || stdout,
              code
            })
            return
          }
          
          if (finalResult) {
            if (finalResult.status === 'success') {
              let absolutePath = finalResult.file_path
              
              // Handle relative paths
              const isAbsolutePath = absolutePath && (
                /^[A-Za-z]:[\\/]/.test(absolutePath) ||
                absolutePath.startsWith('/') ||
                absolutePath.startsWith('\\')
              )
              
              if (absolutePath && !isAbsolutePath) {
                if (absolutePath.startsWith('.')) {
                  absolutePath = path.join(downloadDir, absolutePath.replace(/^\./, '').replace(/\\/g, '/'))
                } else {
                  absolutePath = path.join(downloadDir, absolutePath.replace(/\\/g, '/'))
                }
              }
              
              // Copy to user data if needed
              if (absolutePath && fs.existsSync(absolutePath)) {
                const userDataVideosDir = getUserDataPath('videos/downloaded')
                const fileName = absolutePath.split(/[/\\]/).pop() || `video_${Date.now()}.mp4`
                const targetPath = path.join(userDataVideosDir, fileName)
                
                if (absolutePath !== targetPath && !fs.existsSync(targetPath)) {
                  try {
                    fs.copyFileSync(absolutePath, targetPath)
                    absolutePath = targetPath
                  } catch (copyError) {
                    console.error('copy video to user data dir failed:', copyError)
                  }
                } else if (fs.existsSync(targetPath)) {
                  absolutePath = targetPath
                }
              }
              
              safeResolve({
                success: true,
                message: finalResult.message,
                file_path: absolutePath,
                video_id: finalResult.video_id,
                platform: finalResult.platform,
                with_watermark: finalResult.with_watermark
              })
            } else {
              safeResolve({
                success: false,
                message: finalResult.message || 'Download failed',
                error: stderr || stdout
              })
            }
          } else {
            safeResolve({
              success: false,
              message: '无法解析下载结果，请检查程序输出',
              error: stdout || stderr
            })
          }
        })
        
        child.on('error', (err) => {
          console.error('Download spawn error:', err)
          safeResolve({
            success: false,
            message: '启动下载程序失败',
            error: err.message
          })
        })
      } catch (error: any) {
        console.error('Download video failed:', error)
        resolve({
          success: false,
          message: 'Download video failed',
          error: error instanceof Error ? error.message : String(error)
        })
      }
    })
  })

  ipcMain.handle('download-douyin-user-posts', async (event, profileUrl: string, options?: any) => {
    return new Promise(async (resolve) => {
      try {
        const exePath = getDouyinExePath()
        if (!fs.existsSync(exePath)) {
          resolve({
            success: false,
            message: 'Download program not found',
            error: `File not found: ${exePath}`,
            posts: []
          })
          return
        }
        
        const cookiesPath = options?.cookiesPath?.trim() || path.join(getUserDataPath(), 'nonce.txt')
        const downloadDir = options?.downloadDir?.trim() || getUserDataPath('temp/user_posts')
        
        // Get token and fetch cookies
        let token: string | null = null
        try {
          token = await needTokenFromMain()
        } catch {
          token = await cacheToken()
        }

        if (token) {
          try {
            const url = `${API_BASE_URL}/app/base/comm/param?key=${encodeURIComponent(NONCE_INFO_KEY)}`
            console.log('[download-douyin] Fetching cookies from:', url)
            const res = await fetch(url, {
              headers: { ...appVersionHeaders(), Authorization: token }
            })
            const json = await res.json() as { data?: any, code?: number, message?: string }
            console.log('[download-douyin] Cookie fetch response:', json)
            const data = json?.data
            if (data != null) {
              fs.writeFileSync(cookiesPath, typeof data === 'string' ? data : JSON.stringify(data))
              console.log('[download-douyin] Cookies written to:', cookiesPath)
            } else {
              console.warn('[download-douyin] No cookie data found in response')
            }
          } catch (e) {
            console.warn('[download-douyin] Failed to fetch cookies:', e)
          }
        }
        
        if (!fs.existsSync(downloadDir)) {
          fs.mkdirSync(downloadDir, { recursive: true })
        }
        
        const spawnArgs = [profileUrl, '-c', cookiesPath, '-d', downloadDir, '-m', 'user']
        console.log('Executing download user posts command:', exePath, ...spawnArgs)
        
        const cwd = getDouyinPackagedExeCwd()
        if (!fs.existsSync(cwd)) {
          fs.mkdirSync(cwd, { recursive: true })
        }
        
        const child = spawn(exePath, spawnArgs, {
          cwd,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        })
        
        let stdout = ''
        let stderr = ''
        let resolved = false
        
        const safeResolve = (result: any) => {
          if (!resolved) {
            resolved = true
            resolve(result)
          }
        }
        
        child.stdout?.on('data', (chunk) => {
          stdout += String(chunk)
        })
        
        child.stderr?.on('data', (chunk) => {
          stderr += String(chunk)
        })
        
        child.on('close', (code) => {
          console.log('Download user posts process finished')
          console.log('stdout:', stdout)
          console.log('stderr:', stderr)
          
          const finalResult = parseJsonFromStdout(stdout)
          
          if (finalResult && finalResult.status === 'success' && Array.isArray(finalResult.posts)) {
            // Posts returned directly in stdout
            safeResolve({
              success: true,
              posts: finalResult.posts
            })
          } else if (finalResult && finalResult.status === 'success' && finalResult.file_path) {
            // Posts saved to file - read from file
            try {
              if (fs.existsSync(finalResult.file_path)) {
                const fileContent = fs.readFileSync(finalResult.file_path, 'utf-8')
                const fileData = JSON.parse(fileContent)
                const posts = Array.isArray(fileData) ? fileData : (fileData.posts || fileData.aweme_list || [])
                safeResolve({
                  success: true,
                  posts: posts
                })
              } else {
                safeResolve({
                  success: false,
                  message: '结果文件不存在',
                  error: `File not found: ${finalResult.file_path}`,
                  posts: []
                })
              }
            } catch (e: any) {
              console.error('Failed to read posts file:', e)
              safeResolve({
                success: false,
                message: '读取结果文件失败',
                error: e.message,
                posts: []
              })
            }
          } else if (finalResult && finalResult.status === 'error') {
            safeResolve({
              success: false,
              message: finalResult.message || '获取用户作品失败',
              error: stderr || stdout,
              posts: []
            })
          } else {
            safeResolve({
              success: false,
              message: '无法解析结果',
              error: stdout || stderr,
              posts: []
            })
          }
        })
        
        child.on('error', (err) => {
          console.error('Download user posts spawn error:', err)
          safeResolve({
            success: false,
            message: '启动程序失败',
            error: err.message,
            posts: []
          })
        })
      } catch (error: any) {
        console.error('Download user posts failed:', error)
        resolve({
          success: false,
          message: 'Download user posts failed',
          error: error instanceof Error ? error.message : String(error),
          posts: []
        })
      }
    })
  })

  ipcMain.handle('upload-voice-and-transcribe', async (event, filePath: string, fileName: string) => {
    try {
      const outputDir = getUserDataPath('voices/uploaded')
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
      
      const voiceId = `uploaded_${Date.now()}`
      const ext = path.extname(fileName) || '.wav'
      const newFileName = `${voiceId}${ext}`
      const newFilePath = path.join(outputDir, newFileName)
      
      // Copy file to voices directory
      fs.copyFileSync(filePath, newFilePath)
      
      // Load and update config
      const configPath = path.join(getUserDataPath(), 'uploaded_voices_config.json')
      let config = { voices: [] as any[] }
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      }
      
      const voiceEntry = {
        id: voiceId,
        name: fileName.replace(/\.[^.]+$/, ''),
        path: newFilePath,
        promptText: ''
      }
      config.voices.push(voiceEntry)
      
      const configDir = path.dirname(configPath)
      if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })
      if (!Array.isArray(config.voices)) config.voices = []
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
      
      return { success: true, file_path: newFilePath, voice_id: voiceId }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('publish-douyin-video', async (_, params: any) => {
    // TODO: Implement via browser automation
    return { success: false, error: '发布功能需要配置' }
  })
}
