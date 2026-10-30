import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { chromium, type APIRequestContext, type Browser, type BrowserContext, type Response } from 'playwright'
import {
  getChromePath,
  getFfmpegPath,
  getFfprobePath,
  prepareMacChromeForLaunch,
  validateMacChromeArch,
} from './platform-paths'

const DOUYIN_REFERER = 'https://www.douyin.com/'
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'

interface MediaCandidate {
  url: string
  totalBytes: number
  isAudio: boolean
}

interface ProbeResult {
  duration: number
  size: number
  hasVideo: boolean
  hasAudio: boolean
}

export interface DouyinBrowserDownloadResult {
  filePath: string
  videoId: string
  size: number
  duration: number
}

function parseContentRangeTotal(value: string | undefined): number {
  const match = String(value || '').match(/\/(\d+)\s*$/)
  return match ? Number(match[1]) : 0
}

function classifyMediaResponse(response: Response): MediaCandidate | null {
  const status = response.status()
  if (status !== 200 && status !== 206) return null

  const headers = response.headers()
  const contentType = String(headers['content-type'] || '').toLowerCase()
  if (!contentType.startsWith('video/') && !contentType.startsWith('audio/')) return null

  const url = response.url()
  const normalizedUrl = url.toLowerCase()
  const totalBytes =
    parseContentRangeTotal(headers['content-range']) || Number(headers['content-length'] || 0)
  const isAudio =
    contentType.startsWith('audio/') ||
    /media-audio|mime_type=audio|audio_mp4|\.m4a(?:\?|$)/i.test(normalizedUrl)

  return { url, totalBytes, isAudio }
}

function pickLargest(candidates: MediaCandidate[], isAudio: boolean): MediaCandidate | undefined {
  return candidates
    .filter((candidate) => candidate.isAudio === isAudio)
    .sort((left, right) => right.totalBytes - left.totalBytes)[0]
}

async function downloadMedia(
  request: APIRequestContext,
  candidate: MediaCandidate,
  destination: string,
): Promise<number> {
  const partialPath = `${destination}.${process.pid}.${Date.now()}.part`
  let offset = 0
  let expectedTotal = candidate.totalBytes

  try {
    for (let part = 0; part < 512; part++) {
      const response = await request.get(candidate.url, {
        headers: {
          Accept: '*/*',
          'Accept-Encoding': 'identity',
          Origin: 'https://www.douyin.com',
          Range: `bytes=${offset}-`,
          Referer: DOUYIN_REFERER,
          'User-Agent': BROWSER_USER_AGENT,
        },
        failOnStatusCode: false,
        timeout: 180000,
      })

      if (response.status() !== 200 && response.status() !== 206) {
        throw new Error(`媒体文件请求返回 HTTP ${response.status()}`)
      }

      const body = await response.body()
      if (body.length === 0) throw new Error('媒体文件响应为空')

      const headers = response.headers()
      const rangeMatch = String(headers['content-range'] || '').match(/bytes\s+(\d+)-(\d+)\/(\d+)/i)
      if (response.status() === 206 && rangeMatch) {
        const rangeStart = Number(rangeMatch[1])
        expectedTotal = Number(rangeMatch[3]) || expectedTotal
        if (rangeStart !== offset) throw new Error('媒体分片范围不连续')
        await fs.promises.appendFile(partialPath, body)
        offset += body.length
        if (expectedTotal > 0 && offset >= expectedTotal) break
        continue
      }

      // A 200 response ignores Range and represents the complete file.
      await fs.promises.writeFile(partialPath, body)
      offset = body.length
      expectedTotal = Number(headers['content-length'] || 0) || offset
      break
    }

    if (!fs.existsSync(partialPath)) throw new Error('媒体文件未写入磁盘')
    const downloadedSize = fs.statSync(partialPath).size
    if (downloadedSize < 64 * 1024) throw new Error('媒体文件过小，可能被抖音拦截')
    if (expectedTotal > 0 && downloadedSize < expectedTotal) {
      throw new Error(`媒体文件不完整（${downloadedSize}/${expectedTotal} 字节）`)
    }

    fs.rmSync(destination, { force: true })
    fs.renameSync(partialPath, destination)
    return downloadedSize
  } finally {
    try { fs.rmSync(partialPath, { force: true }) } catch {}
  }
}

function runNative(
  executable: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { child.kill('SIGKILL') } catch {}
      reject(new Error(`${path.basename(executable)} 执行超时`))
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const result = {
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      }
      if (code === 0) resolve(result)
      else reject(new Error(result.stderr.trim().slice(-800) || `${path.basename(executable)} 退出码 ${code}`))
    })
  })
}

async function probeMedia(filePath: string): Promise<ProbeResult> {
  const ffprobePath = getFfprobePath()
  if (!fs.existsSync(ffprobePath)) throw new Error('FFprobe 未找到')

  const result = await runNative(ffprobePath, [
    '-v', 'error',
    '-show_entries', 'format=duration,size',
    '-show_entries', 'stream=codec_type',
    '-of', 'json',
    filePath,
  ], 30000)
  const parsed = JSON.parse(result.stdout)
  const streams = Array.isArray(parsed?.streams) ? parsed.streams : []
  return {
    duration: Number(parsed?.format?.duration || 0),
    size: Number(parsed?.format?.size || fs.statSync(filePath).size),
    hasVideo: streams.some((stream: any) => stream?.codec_type === 'video'),
    hasAudio: streams.some((stream: any) => stream?.codec_type === 'audio'),
  }
}

async function mergeMedia(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
  const ffmpegPath = getFfmpegPath()
  if (!fs.existsSync(ffmpegPath)) throw new Error('FFmpeg 未找到')

  await runNative(ffmpegPath, [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', videoPath,
    '-i', audioPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ], 10 * 60 * 1000)
}

function extractVideoId(pageUrl: string): string {
  return pageUrl.match(/\/video\/(\d+)/i)?.[1] || `${Date.now()}`
}

export async function downloadDouyinVideoWithBrowser(
  pageUrl: string,
  downloadDir: string,
): Promise<DouyinBrowserDownloadResult> {
  const chromePath = getChromePath()
  if (!fs.existsSync(chromePath)) throw new Error('内置浏览器未找到，请重新安装最新版客户端')
  prepareMacChromeForLaunch(chromePath)
  const archCheck = validateMacChromeArch(chromePath)
  if (!archCheck.ok) throw new Error(archCheck.message)

  fs.mkdirSync(downloadDir, { recursive: true })
  const videoId = extractVideoId(pageUrl)
  const nonce = `${process.pid}-${Date.now()}`
  const videoTemp = path.join(downloadDir, `.douyin-${nonce}-video.mp4`)
  const audioTemp = path.join(downloadDir, `.douyin-${nonce}-audio.mp4`)
  const mergedTemp = path.join(downloadDir, `.douyin-${nonce}-merged.mp4`)
  const outputPath = path.join(downloadDir, `douyin_${videoId}.mp4`)
  let browser: Browser | undefined

  try {
    browser = await chromium.launch({
      executablePath: chromePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--autoplay-policy=no-user-gesture-required',
      ],
    })
    const context: BrowserContext = await browser.newContext({
      userAgent: BROWSER_USER_AGENT,
      viewport: { width: 1280, height: 900 },
    })
    const page = await context.newPage()
    const candidates = new Map<string, MediaCandidate>()
    page.on('response', (response) => {
      try {
        const candidate = classifyMediaResponse(response)
        if (candidate) candidates.set(candidate.url, candidate)
      } catch {}
    })

    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('video', { timeout: 30000 })
    // The Douyin page requests its media streams during initial hydration.
    // Avoid evaluating a function in the page: some packaged Playwright/Electron
    // combinations reject serialized closures even though the browser is healthy.
    await page.waitForTimeout(8000)

    for (let attempt = 0; attempt < 40; attempt++) {
      const values = [...candidates.values()]
      if (pickLargest(values, false) && pickLargest(values, true)) break
      await page.waitForTimeout(500)
    }

    const values = [...candidates.values()]
    const videoCandidate = pickLargest(values, false)
    const audioCandidate = pickLargest(values, true)
    if (!videoCandidate) throw new Error('页面未发现可下载的视频流')

    await downloadMedia(context.request, videoCandidate, videoTemp)
    const videoProbe = await probeMedia(videoTemp)
    if (!videoProbe.hasVideo) throw new Error('捕获的文件不包含视频流')

    if (videoProbe.hasAudio) {
      fs.rmSync(outputPath, { force: true })
      fs.renameSync(videoTemp, outputPath)
    } else {
      if (!audioCandidate) throw new Error('页面未发现可下载的音频流')
      await downloadMedia(context.request, audioCandidate, audioTemp)
      await mergeMedia(videoTemp, audioTemp, mergedTemp)
      fs.rmSync(outputPath, { force: true })
      fs.renameSync(mergedTemp, outputPath)
    }

    const finalProbe = await probeMedia(outputPath)
    if (!finalProbe.hasVideo || !finalProbe.hasAudio || finalProbe.duration <= 0 || finalProbe.size < 128 * 1024) {
      fs.rmSync(outputPath, { force: true })
      throw new Error('下载文件校验失败，音视频流不完整')
    }

    console.log('[download-douyin] browser fallback completed:', {
      videoId,
      size: finalProbe.size,
      duration: finalProbe.duration,
    })
    return {
      filePath: outputPath,
      videoId,
      size: finalProbe.size,
      duration: finalProbe.duration,
    }
  } finally {
    try { await browser?.close() } catch {}
    for (const tempPath of [videoTemp, audioTemp, mergedTemp]) {
      try { fs.rmSync(tempPath, { force: true }) } catch {}
    }
  }
}
