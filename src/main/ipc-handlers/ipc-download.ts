import { ipcMain, BrowserWindow, app } from 'electron'
import { spawn, exec } from 'child_process'
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import iconv from 'iconv-lite'
import { getUserDataPath } from '../local-server'
import { API_BASE_URL } from '../api-config'
import { needTokenFromMain } from './ipc-plugin-proxy'
import { getFfmpegPath, getDouyinExePath, resolveDouyinExePath, DOUYIN_DOWNLOADER_MISSING_MESSAGE } from '../platform-paths'
import { downloadDouyinVideoWithBrowser } from '../douyin-browser-downloader'
import {
  extractUrlFromText,
  isDouyinProfileUrl,
  buildDouyinProfileUrl,
  extractSecUidFromInfoResult,
  formatDouyinUserPostsError,
  normalizeDouyinUrlForDownloader,
} from '../douyin-url-helpers'

// API Configuration
const NONCE_INFO_KEY = 'douyin_cookies_info'

// Token cache
let cachedToken: string | null = null

declare const __APP_VERSION__: string
function getClientApiVersion(): string {
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '3.2.4'
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

function collectSpawnOutput(stream: NodeJS.ReadableStream | null, chunks: Buffer[]): void {
  stream?.on('data', (chunk: Buffer | string) => {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk)
  })
}

function decodeSpawnOutput(chunks: Buffer[]): string {
  if (chunks.length === 0) return ''
  const buffer = Buffer.concat(chunks)
  if (process.platform !== 'win32') {
    return buffer.toString('utf8')
  }
  const utf8Text = buffer.toString('utf8')
  const gbkText = iconv.decode(buffer, 'gbk')
  if (parseJsonFromStdout(utf8Text)) return utf8Text
  if (parseJsonFromStdout(gbkText)) return gbkText
  // The downloader emits UTF-8 even on Windows. Prefer the candidate that
  // preserves Chinese text instead of treating valid UTF-8 as GBK mojibake.
  const cjkScore = (value: string) => (value.match(/[\u3400-\u9fff]/g) || []).length
  if (cjkScore(utf8Text) > cjkScore(gbkText)) return utf8Text
  if (cjkScore(gbkText) > cjkScore(utf8Text)) return gbkText
  if (!utf8Text.includes('\uFFFD')) return utf8Text
  return gbkText
}

function resolveDownloadedFilePath(
  rawPath: string | undefined,
  downloadDir: string,
  expectedFileName?: string
): string | undefined {
  const candidates: string[] = []
  const addCandidate = (candidate?: string) => {
    if (!candidate) return
    const normalized = path.resolve(candidate)
    if (!candidates.includes(normalized)) {
      candidates.push(normalized)
    }
  }

  if (rawPath) {
    addCandidate(rawPath)
    const fileName = path.basename(rawPath.replace(/\\/g, '/'))
    if (fileName && fileName !== '.' && fileName !== '..') {
      addCandidate(path.join(downloadDir, fileName))
    }
  }
  if (expectedFileName) {
    addCandidate(path.join(downloadDir, expectedFileName))
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  if (expectedFileName?.toLowerCase().endsWith('.mp4')) {
    try {
      const recentMp4 = fs.readdirSync(downloadDir)
        .filter((name) => name.toLowerCase().endsWith('.mp4'))
        .map((name) => {
          const filePath = path.join(downloadDir, name)
          return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs }
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]

      if (recentMp4 && Date.now() - recentMp4.mtimeMs < 5 * 60 * 1000) {
        return recentMp4.filePath
      }
    } catch (error) {
      console.warn('[download] failed to scan download dir:', error)
    }
  }

  return rawPath
}

function getDouyinSpawnEnv(kind: 'video' | 'posts' = 'video'): NodeJS.ProcessEnv {
  return {
    ...process.env,
    // Keep downloader diagnostics readable on Windows for both video and user modes.
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
  }
}

function summarizeDouyinDownloadError(text: string): string {
  const compact = String(text || '').replace(/\s+/g, ' ').trim()
  const status = compact.match(/HTTP\s*[^\d\r\n]{0,32}(\d{3})/i)
  if (status) {
    return `抖音接口返回 HTTP ${status[1]}，请重新复制链接或稍后重试`
  }
  if (/cookie file is empty/i.test(compact)) {
    return '抖音下载需要有效 Cookie，请先在客户端打开抖音并重试'
  }
  return compact.slice(-360) || '抖音下载器未返回具体错误'
}

function shouldUseDouyinBrowserFallback(run: {
  code: number | null
  stdout: string
  stderr: string
  result: any | null
}): boolean {
  const text = [run.stdout, run.stderr, run.result?.message, run.result?.error]
    .filter(Boolean)
    .join(' ')
  return /(?:HTTP\s*[^\d\r\n]{0,32})?403\b|forbidden|failed to get cookies|无法启动浏览器|(?:chrome|edge).*驱动.*(?:不存在|缺失)/i.test(text)
}

function stripUnsupportedText(text: unknown): string {
  if (typeof text !== 'string') return ''
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '')
    .replace(/\uFEFF/g, '')
    .trim()
}

function sanitizeDouyinPosts(posts: any[]): any[] {
  if (!Array.isArray(posts)) return []
  return posts.map((post) => {
    if (!post || typeof post !== 'object') return post
    const desc = stripUnsupportedText(
      post.desc || post.description || post.title || post.text || post.caption || post.content || ''
    )
    return {
      ...post,
      desc,
      title: stripUnsupportedText(post.title || desc),
      description: stripUnsupportedText(post.description || desc),
    }
  })
}

function getUserPostsDownloadDir(profileUrl: string): string {
  const dirKey = createHash('sha256').update(profileUrl.trim().toLowerCase()).digest('hex').slice(0, 16)
  return getUserDataPath(`temp/user_posts/${dirKey}`)
}

function loadPostsFromJsonFile(filePath: string): any[] | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    const posts = Array.isArray(fileData)
      ? fileData
      : (fileData.posts || fileData.aweme_list || null)
    if (!Array.isArray(posts) || posts.length === 0) return null
    return sanitizeDouyinPosts(posts)
  } catch (error) {
    console.warn('[download-douyin] failed to read posts file:', filePath, error)
    return null
  }
}

function loadRecentPostsFromDownloadDir(downloadDir: string): any[] | null {
  try {
    if (!fs.existsSync(downloadDir)) return null
    const jsonFiles = fs.readdirSync(downloadDir)
      .filter((name) => name.toLowerCase().endsWith('.json'))
      .map((name) => ({
        filePath: path.join(downloadDir, name),
        mtimeMs: fs.statSync(path.join(downloadDir, name)).mtimeMs,
      }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs)

    for (const file of jsonFiles) {
      if (Date.now() - file.mtimeMs > 5 * 60 * 1000) continue
      const posts = loadPostsFromJsonFile(file.filePath)
      if (posts) return posts
    }
  } catch (error) {
    console.warn('[download-douyin] failed to scan posts dir:', error)
  }
  return null
}

function resolveDouyinUserPostsResult(
  finalResult: any,
  stdout: string,
  stderr: string,
  downloadDir: string,
  inputUrl?: string
): { success: boolean; posts?: any[]; message?: string; error?: string } {
  if (finalResult?.status === 'success' && Array.isArray(finalResult.posts)) {
    return { success: true, posts: sanitizeDouyinPosts(finalResult.posts) }
  }

  if (finalResult?.status === 'success' && finalResult.file_path) {
    const postsFilePath = resolveDownloadedFilePath(finalResult.file_path, downloadDir)
    const posts = postsFilePath ? loadPostsFromJsonFile(postsFilePath) : null
    if (posts) return { success: true, posts }
  }

  const fallbackPosts = loadRecentPostsFromDownloadDir(downloadDir)
  if (fallbackPosts) {
    console.warn('[download-douyin] recovered posts from download dir after stdout failure')
    return { success: true, posts: fallbackPosts }
  }

  if (finalResult?.status === 'error') {
    const rawMessage = finalResult.message || '获取用户作品失败'
    return {
      success: false,
      message: inputUrl ? formatDouyinUserPostsError(rawMessage, inputUrl) : rawMessage,
      error: stderr || stdout,
    }
  }

  return {
    success: false,
    message: inputUrl
      ? formatDouyinUserPostsError('无法解析结果', inputUrl)
      : '无法解析结果',
    error: stderr || stdout,
  }
}

async function ensureDouyinCookiesFile(cookiesPath: string): Promise<void> {
  let token: string | null = null
  try {
    token = await needTokenFromMain()
  } catch {
    token = await cacheToken()
  }
  if (!token) return

  try {
    const url = `${API_BASE_URL}/app/base/comm/param?key=${encodeURIComponent(NONCE_INFO_KEY)}`
    const res = await fetch(url, {
      headers: { ...appVersionHeaders(), Authorization: token },
    })
    const json = (await res.json()) as { data?: unknown; code?: number; message?: string }
    const data = json?.data
    if (data != null) {
      fs.writeFileSync(cookiesPath, typeof data === 'string' ? data : JSON.stringify(data))
    }
  } catch (e) {
    console.warn('[download-douyin] Failed to fetch cookies:', e)
  }
}

function runDouyinDownloader(
  exePath: string,
  spawnArgs: string[],
  kind: 'video' | 'posts',
  timeoutMs = 180000
): Promise<{ code: number | null; stdout: string; stderr: string; result: any | null }> {
  return new Promise((resolve, reject) => {
    const cwd = getDouyinPackagedExeCwd()
    if (!fs.existsSync(cwd)) {
      fs.mkdirSync(cwd, { recursive: true })
    }

    const child = spawn(exePath, spawnArgs, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: getDouyinSpawnEnv(kind === 'posts' ? 'posts' : 'video'),
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        child.kill('SIGKILL')
      } catch {}
      reject(new Error('抖音下载器执行超时'))
    }, timeoutMs)

    collectSpawnOutput(child.stdout, stdoutChunks)
    collectSpawnOutput(child.stderr, stderrChunks)

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const stdout = decodeSpawnOutput(stdoutChunks)
      const stderr = decodeSpawnOutput(stderrChunks)
      resolve({
        code,
        stdout,
        stderr,
        result: parseJsonFromStdout(stdout),
      })
    })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
  })
}

function isDouyinShareShortUrl(inputUrl: string): boolean {
  try {
    const parsed = new URL(inputUrl)
    const host = parsed.hostname.toLowerCase()
    return (
      host === 'v.douyin.com' ||
      host.endsWith('.v.douyin.com') ||
      host === 'iesdouyin.com' ||
      host.endsWith('.iesdouyin.com')
    )
  } catch {
    return /v\.douyin\.com|iesdouyin\.com/i.test(inputUrl)
  }
}

async function resolveDouyinShareRedirectUrl(inputUrl: string): Promise<string | null> {
  if (!isDouyinShareShortUrl(inputUrl)) return null
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  }

  for (const method of ['HEAD', 'GET'] as const) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12000)
    try {
      const response = await fetch(inputUrl, {
        method,
        redirect: 'follow',
        headers,
        signal: controller.signal,
      })
      const finalUrl = response.url ? normalizeDouyinUrlForDownloader(response.url) : ''
      if (finalUrl && finalUrl !== inputUrl) return finalUrl
    } catch (error) {
      console.warn(`[download-douyin] failed to resolve share redirect with ${method}:`, error)
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

async function resolveDouyinProfileUrl(
  inputUrl: string,
  exePath: string,
  cookiesPath: string,
  workDir: string
): Promise<
  | { ok: true; profileUrl: string; resolvedFrom: 'direct' | 'share' | 'video' }
  | { ok: false; message: string }
> {
  let url = normalizeDouyinUrlForDownloader(inputUrl)
  if (!url) {
    return { ok: false, message: '主页链接不能为空' }
  }

  const redirectedUrl = await resolveDouyinShareRedirectUrl(url)
  if (redirectedUrl) {
    console.log('[download-douyin] resolved share redirect:', redirectedUrl)
    url = redirectedUrl
  }

  if (isDouyinProfileUrl(url)) {
    return { ok: true, profileUrl: url, resolvedFrom: redirectedUrl ? 'share' : 'direct' }
  }

  const infoDir = path.join(workDir, '_profile_resolve')
  if (!fs.existsSync(infoDir)) {
    fs.mkdirSync(infoDir, { recursive: true })
  }

  console.log('[download-douyin] resolving profile from video/short link:', url)
  const infoArgs = [url, '-c', cookiesPath, '-d', infoDir, '-m', 'info']
  try {
    const infoRun = await runDouyinDownloader(exePath, infoArgs, 'posts', 120000)
    if (infoRun.result?.status === 'success') {
      const secUid = extractSecUidFromInfoResult(infoRun.result)
      if (secUid) {
        const profileUrl = buildDouyinProfileUrl(secUid)
        console.log('[download-douyin] resolved profile url:', profileUrl)
        return { ok: true, profileUrl, resolvedFrom: 'video' }
      }
    }
    const rawMessage =
      infoRun.result?.message || infoRun.stderr || infoRun.stdout || '无法从链接识别博主主页'
    return { ok: false, message: formatDouyinUserPostsError(rawMessage, url) }
  } catch (error: any) {
    const rawMessage = error instanceof Error ? error.message : String(error)
    return { ok: false, message: formatDouyinUserPostsError(rawMessage, url) }
  }
}

export function registerDownloadHandlers(): void {
  // 特性检测：抖音下载器在当前平台是否可用 (Mac arm64/x64 需要二进制存在)
  // 前端可据此隐藏抖音下载入口，避免点了报错
  ipcMain.handle('douyin-downloader-available', async () => {
    const { exePath } = resolveDouyinExePath()
    return {
      available: Boolean(exePath),
      platform: process.platform,
      arch: process.arch,
      expectedPath: exePath || getDouyinExePath()
    }
  })

  ipcMain.handle('download-video-from-url', async (event, videoUrl: string, fileName: string) => {
    console.log('[download-video] Starting download:', { videoUrl, fileName })

    let token: string | null = null
    try {
      token = await needTokenFromMain()
    } catch {
      token = await cacheToken()
    }
    console.log('[download-video] Using token:', token ? 'present' : 'empty')

    const outputDir = getUserDataPath('videos/generated')
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
    const outputPath = path.join(outputDir, fileName)

    const sender = event.sender
    const emitProgress = (data: {
      phase: 'start' | 'progress' | 'done' | 'retry' | 'error'
      loaded?: number
      total?: number
      percent?: number
      speedBps?: number
      attempt?: number
      error?: string
    }) => {
      try {
        if (sender && !sender.isDestroyed()) {
          sender.send('video-download-progress', data)
        }
      } catch {}
    }

    const attemptDownload = (attempt: number): Promise<{ success: boolean; file_path?: string; error?: string }> =>
      new Promise((resolve) => {
        const file = fs.createWriteStream(outputPath)
        const protocol = videoUrl.startsWith('https') ? https : http

        let loaded = 0
        let total = 0
        let lastEmitTs = 0
        let lastEmitLoaded = 0
        const startTs = Date.now()
        emitProgress({ phase: 'start', attempt })

        const request = protocol.get(videoUrl, {
          headers: { 'Authorization': token || '' }
        }, (response) => {
          console.log('[download-video] Response status:', response.statusCode, 'attempt:', attempt)
          if (response.statusCode !== 200) {
            file.close()
            try { fs.unlinkSync(outputPath) } catch {}
            resolve({ success: false, error: `HTTP ${response.statusCode}` })
            return
          }

          const contentLength = parseInt(response.headers['content-length'] || '0', 10)
          if (contentLength > 0) total = contentLength

          response.on('data', (chunk: Buffer) => {
            loaded += chunk.length
            const now = Date.now()
            // Throttle progress events to ~5/s
            if (now - lastEmitTs >= 200 || (total > 0 && loaded >= total)) {
              const elapsedMs = now - (lastEmitTs || startTs)
              const bytesDelta = loaded - lastEmitLoaded
              const speedBps = elapsedMs > 0 ? Math.round((bytesDelta * 1000) / elapsedMs) : 0
              const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0
              emitProgress({ phase: 'progress', loaded, total, percent, speedBps, attempt })
              lastEmitTs = now
              lastEmitLoaded = loaded
            }
          })

          response.pipe(file)
          file.on('finish', () => {
            file.close()
            console.log('[download-video] Downloaded to:', outputPath, 'bytes:', loaded)
            emitProgress({ phase: 'done', loaded, total: total || loaded, percent: 100, attempt })
            resolve({ success: true, file_path: outputPath })
          })
        })

        request.on('error', (err) => {
          console.log('[download-video] Request error:', err.message, 'attempt:', attempt)
          file.close()
          try { fs.unlinkSync(outputPath) } catch {}
          resolve({ success: false, error: err.message })
        })

        file.on('error', (err) => {
          console.log('[download-video] File write error:', err.message, 'attempt:', attempt)
          request.destroy()
          try { fs.unlinkSync(outputPath) } catch {}
          resolve({ success: false, error: err.message })
        })
      })

    const MAX_ATTEMPTS = 2
    let lastError: string | undefined
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const result = await attemptDownload(attempt)
      if (result.success) return result
      lastError = result.error
      if (attempt < MAX_ATTEMPTS) {
        console.log('[download-video] Retrying after failure:', result.error)
        emitProgress({ phase: 'retry', attempt, error: result.error })
        await new Promise((r) => setTimeout(r, 1000))
      }
    }
    emitProgress({ phase: 'error', error: lastError })
    return { success: false, error: lastError }
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
          if (fs.existsSync(currentWavPath)) fs.unlinkSync(currentWavPath)
        } catch {}
      } else {
        try {
          fs.renameSync(currentWavPath, finalWavPath)
        } catch (e) {
          try {
            if (fs.existsSync(currentWavPath)) fs.unlinkSync(currentWavPath)
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

  ipcMain.handle('download-douyin-video', async (_event, videoUrl: string, options?: any) => {
    try {
      const { exePath, searched } = resolveDouyinExePath()
      if (!exePath) {
        return {
          success: false,
          message: DOUYIN_DOWNLOADER_MISSING_MESSAGE,
          error: `File not found. Searched: ${searched.join('; ')}`
        }
      }

      const cookiesPath = options?.cookiesPath?.trim() || path.join(getUserDataPath(), 'nonce.txt')
      const downloadDir = options?.downloadDir?.trim() || getUserDataPath('videos/downloaded')
      await ensureDouyinCookiesFile(cookiesPath)

      let url = normalizeDouyinUrlForDownloader(videoUrl)
      if (!url) {
        return { success: false, message: '请粘贴有效的抖音视频链接', error: 'empty url' }
      }
      const redirectedUrl = await resolveDouyinShareRedirectUrl(url)
      if (redirectedUrl) {
        console.log('[download-douyin] resolved share redirect:', redirectedUrl)
        url = redirectedUrl
      }

      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true })
      }

      const spawnArgs = [url, '-c', cookiesPath, '-d', downloadDir]
      console.log('Executing download command:', exePath, ...spawnArgs)

      const run = await runDouyinDownloader(exePath, spawnArgs, 'video', 120000)
      const stdout = run.stdout
      const stderr = run.stderr
      const finalResult = run.result
      console.log('Download process finished:', {
        code: run.code,
        status: finalResult?.status || 'unparsed',
      })

      if (shouldUseDouyinBrowserFallback(run)) {
        console.warn('[download-douyin] legacy downloader returned 403; using browser fallback')
        try {
          const fallback = await downloadDouyinVideoWithBrowser(url, downloadDir)
          return {
            success: true,
            message: '视频下载成功',
            file_path: fallback.filePath,
            video_id: fallback.videoId,
            platform: 'douyin',
            with_watermark: false,
            browser_fallback: true,
            size: fallback.size,
            duration: fallback.duration,
          }
        } catch (fallbackError) {
          const fallbackMessage = fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError)
          console.error('[download-douyin] browser fallback failed:', fallbackMessage)
          return {
            success: false,
            message: `抖音接口返回 HTTP 403，浏览器下载失败：${fallbackMessage}`,
            error: fallbackMessage,
            code: run.code,
          }
        }
      }

      if (run.code !== 0 && run.code !== null && !finalResult) {
        return {
          success: false,
          message: summarizeDouyinDownloadError(stderr || stdout),
          error: summarizeDouyinDownloadError(stderr || stdout),
          code: run.code
        }
      }

      if (!finalResult) {
        return {
          success: false,
          message: '无法解析下载结果，请检查程序输出',
          error: summarizeDouyinDownloadError(stdout || stderr)
        }
      }

      if (finalResult.status !== 'success') {
        return {
          success: false,
          message: finalResult.message || summarizeDouyinDownloadError(stderr || stdout),
          error: summarizeDouyinDownloadError(stderr || stdout)
        }
      }

      let absolutePath = finalResult.file_path
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

      absolutePath = resolveDownloadedFilePath(
        absolutePath,
        downloadDir,
        finalResult.video_id ? `douyin_${finalResult.video_id}.mp4` : undefined
      )

      if (!absolutePath || !fs.existsSync(absolutePath)) {
        return {
          success: false,
          message: '视频已下载但无法定位文件，请重试',
          error: summarizeDouyinDownloadError(stderr || stdout)
        }
      }

      return {
        success: true,
        message: finalResult.message,
        file_path: absolutePath,
        video_id: finalResult.video_id,
        platform: finalResult.platform,
        with_watermark: finalResult.with_watermark
      }
    } catch (error: any) {
      console.error('Download video failed:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Download video failed',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('download-douyin-user-posts', async (event, profileUrl: string, options?: any) => {
    try {
      const normalizedProfileUrl = normalizeDouyinUrlForDownloader(profileUrl)
      const { exePath, searched } = resolveDouyinExePath()
      if (!exePath) {
        return {
          success: false,
          message: DOUYIN_DOWNLOADER_MISSING_MESSAGE,
          error: `File not found. Searched: ${searched.join('; ')}`,
          posts: [],
        }
      }

      const cookiesPath = options?.cookiesPath?.trim() || path.join(getUserDataPath(), 'nonce.txt')
      await ensureDouyinCookiesFile(cookiesPath)

      const resolveWorkDir = getUserDataPath('temp/profile-resolve')
      if (!fs.existsSync(resolveWorkDir)) {
        fs.mkdirSync(resolveWorkDir, { recursive: true })
      }

      const profileResolve = await resolveDouyinProfileUrl(
        normalizedProfileUrl || profileUrl,
        exePath,
        cookiesPath,
        resolveWorkDir
      )
      if (!profileResolve.ok) {
        return {
          success: false,
          message: profileResolve.message,
          error: profileResolve.message,
          posts: [],
        }
      }

      const effectiveProfileUrl = profileResolve.profileUrl
      const downloadDir =
        options?.downloadDir?.trim() || getUserPostsDownloadDir(effectiveProfileUrl)
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true })
      }

      const spawnArgs = [effectiveProfileUrl, '-c', cookiesPath, '-d', downloadDir, '-m', 'user']
      console.log('[download-douyin] user posts command:', exePath, ...spawnArgs)

      const run = await runDouyinDownloader(exePath, spawnArgs, 'posts')
      console.log('[download-douyin] user posts finished, stdout:', run.stdout)
      if (run.stderr) console.log('[download-douyin] user posts stderr:', run.stderr)

      const resolvedPosts = resolveDouyinUserPostsResult(
        run.result,
        run.stdout,
        run.stderr,
        downloadDir,
        profileUrl
      )

      return {
        ...resolvedPosts,
        posts: resolvedPosts.posts || [],
        resolvedProfileUrl:
          profileResolve.resolvedFrom === 'video' || profileResolve.resolvedFrom === 'share'
            ? effectiveProfileUrl
            : undefined,
        resolvedFrom: profileResolve.resolvedFrom,
      }
    } catch (error: any) {
      console.error('Download user posts failed:', error)
      const message = formatDouyinUserPostsError(
        error instanceof Error ? error.message : String(error),
        profileUrl
      )
      return {
        success: false,
        message,
        error: message,
        posts: [],
      }
    }
  })

  ipcMain.handle('upload-voice-and-transcribe', async (event, filePath: string, fileName: string) => {
    try {
      const outputDir = getUserDataPath('voices/uploaded')
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
      
      const voiceId = `uploaded_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
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
