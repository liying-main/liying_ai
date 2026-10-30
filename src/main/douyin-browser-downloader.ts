import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { type APIRequestContext, type Page, type Response } from 'playwright'
import { getFfmpegPath, getFfprobePath } from './platform-paths'
import { DOUYIN_BROWSER_CLOSED_MESSAGE, withDouyinBrowser } from './douyin-browser-session'
import { parsePageJson, validateDouyinUrl, videoIdFromDouyinUrl } from './douyin-post-parser'

const DOUYIN_REFERER = 'https://www.douyin.com/'
const LOGIN_AND_MEDIA_WAIT_MS = 120000
const LOGIN_HINT_SCRIPT = `
  document.addEventListener('DOMContentLoaded', () => {
    const hint = document.createElement('div');
    hint.textContent = '请在此窗口完成抖音登录/验证并播放目标视频，完成后会自动继续（最多等待 120 秒）';
    hint.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:10px 16px;background:#172554;color:white;font:14px sans-serif;text-align:center;z-index:2147483647;pointer-events:none';
    document.body?.appendChild(hint);
  }, { once: true });
`
const MEDIA_METADATA_SCRIPT = `(() => {
  const values = [];
  for (const node of document.querySelectorAll('script#RENDER_DATA, script#__NEXT_DATA__, script#SIGI_STATE, script[type="application/json"]')) {
    const value = node.textContent || '';
    if (value.length && value.length <= 3000000 && values.length < 8) values.push(value);
  }
  for (const key of ['_ROUTER_DATA', '__INITIAL_STATE__', 'SIGI_STATE']) {
    try {
      const value = JSON.stringify(window[key]);
      if (value && value.length <= 3000000 && values.length < 12) values.push(value);
    } catch {}
  }
  return values;
})()`

interface MediaCandidate {
  url: string
  totalBytes: number
  isAudio: boolean
  requestUrls: string[]
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

  const requestUrls = [url]
  try {
    let request = response.request()
    for (let i = 0; request && i < 10; i++) {
      requestUrls.push(request.url())
      const previous = request.redirectedFrom()
      if (!previous) break
      request = previous
    }
  } catch {}
  return { url, totalBytes, isAudio, requestUrls }
}

/** Only media declared by the requested work's video metadata can be downloaded. */
function targetMediaUrls(payload: unknown, videoId: string): Set<string> {
  const urls = new Set<string>()
  const stack: Array<{ value: unknown; depth: number; video: boolean }> = [{ value: payload, depth: 0, video: false }]
  let visited = 0
  while (stack.length && visited++ < 15000) {
    const { value, depth, video } = stack.pop()!
    if (depth > 20 || value === null || value === undefined) continue
    if (typeof value === 'string' && video) {
      try {
        const url = new URL(value)
        if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) urls.add(url.href)
      } catch {}
      continue
    }
    if (typeof value !== 'object') continue
    const item = value as Record<string, unknown>
    const id = item.aweme_id ?? item.awemeId ?? item.item_id ?? item.id
    if (id === videoId) {
      // Do not include music/author/recommendation URLs from the surrounding item.
      for (const field of ['video', 'videoInfo']) {
        if (item[field]) stack.push({ value: item[field], depth: depth + 1, video: true })
      }
    }
    for (const child of Object.values(item).slice(0, 1000)) {
      if (video || (child && typeof child === 'object')) stack.push({ value: child, depth: depth + 1, video })
    }
  }
  return urls
}

function belongsToTarget(candidate: MediaCandidate, allowed: Set<string>): boolean {
  return candidate.requestUrls.some((value) => {
    try { return allowed.has(new URL(value).href) } catch { return false }
  })
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
  signal: AbortSignal,
): Promise<number> {
  const partialPath = `${destination}.${process.pid}.${Date.now()}.part`
  let offset = 0
  let expectedTotal = candidate.totalBytes

  try {
    for (let part = 0; part < 512; part++) {
      signal.throwIfAborted()
      const response = await withAbort(request.get(candidate.url, {
        headers: {
          Accept: '*/*',
          'Accept-Encoding': 'identity',
          Origin: 'https://www.douyin.com',
          Range: `bytes=${offset}-`,
          Referer: DOUYIN_REFERER,
        },
        failOnStatusCode: false,
        timeout: 180000,
      }), signal)

      try {
        if (response.status() !== 200 && response.status() !== 206) {
          throw new Error(`媒体文件请求返回 HTTP ${response.status()}`)
        }

        const body = await withAbort(response.body(), signal)
        signal.throwIfAborted()
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
      } finally {
        // APIRequestContext retains response buffers until they are disposed.
        try { await response.dispose() } catch {}
      }
    }

    signal.throwIfAborted()
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

async function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort: () => void = () => {}
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason)
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  })
  try { return await Promise.race([operation, cancelled]) }
  finally { signal.removeEventListener('abort', onAbort) }
}

function runNative(
  executable: string,
  args: string[],
  timeoutMs: number,
  signal: AbortSignal,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return }
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let settled = false
    let terminationError: unknown
    const terminate = (error: unknown) => {
      if (settled || terminationError) return
      terminationError = error
      clearTimeout(timer)
      // Wait for close before rejecting so the caller can safely remove files on Windows.
      try { child.kill('SIGKILL') } catch {}
    }
    const onAbort = () => {
      terminate(signal.reason)
    }

    const timer = setTimeout(() => {
      terminate(new Error(`${path.basename(executable)} 执行超时`))
    }, timeoutMs)
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()

    child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(terminationError || error)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      if (terminationError) { reject(terminationError); return }
      const result = {
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      }
      if (code === 0) resolve(result)
      else reject(new Error(result.stderr.trim().slice(-800) || `${path.basename(executable)} 退出码 ${code}`))
    })
  })
}

async function probeMedia(filePath: string, signal: AbortSignal): Promise<ProbeResult> {
  const ffprobePath = getFfprobePath()
  if (!fs.existsSync(ffprobePath)) throw new Error('未找到 FFprobe。请安装包含 ffmpeg 和 ffprobe 的 FFmpeg 工具，并将其 bin 目录加入系统 PATH 后重启应用。')

  const result = await runNative(ffprobePath, [
    '-v', 'error',
    '-show_entries', 'format=duration,size',
    '-show_entries', 'stream=codec_type',
    '-of', 'json',
    filePath,
  ], 30000, signal)
  const parsed = JSON.parse(result.stdout)
  const streams = Array.isArray(parsed?.streams) ? parsed.streams : []
  return {
    duration: Number(parsed?.format?.duration || 0),
    size: Number(parsed?.format?.size || fs.statSync(filePath).size),
    hasVideo: streams.some((stream: any) => stream?.codec_type === 'video'),
    hasAudio: streams.some((stream: any) => stream?.codec_type === 'audio'),
  }
}

async function mergeMedia(videoPath: string, audioPath: string, outputPath: string, signal: AbortSignal): Promise<void> {
  const ffmpegPath = getFfmpegPath()
  if (!fs.existsSync(ffmpegPath)) throw new Error('未找到 FFmpeg，无法合并音视频。请安装 FFmpeg 并将其 bin 目录加入系统 PATH 后重启应用。')

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
  ], 10 * 60 * 1000, signal)
}

export async function downloadDouyinVideoWithBrowser(
  pageUrl: string,
  downloadDir: string,
): Promise<DouyinBrowserDownloadResult> {
  const inputUrl = validateDouyinUrl(pageUrl)
  return withDouyinBrowser(async (context) => {
    fs.mkdirSync(downloadDir, { recursive: true })
    let videoId = videoIdFromDouyinUrl(inputUrl)
    const nonce = `${process.pid}-${Date.now()}`
    const videoTemp = path.join(downloadDir, `.douyin-${nonce}-video.mp4`)
    const audioTemp = path.join(downloadDir, `.douyin-${nonce}-audio.mp4`)
    const mergedTemp = path.join(downloadDir, `.douyin-${nonce}-merged.mp4`)
    const abort = new AbortController()
    const onClosed = () => abort.abort(new Error(DOUYIN_BROWSER_CLOSED_MESSAGE))
    context.on('close', onClosed)
    let page: Page | undefined

    try {
      page = await context.newPage()
      page.on('close', onClosed)
      await page.addInitScript({ content: LOGIN_HINT_SCRIPT })
      const candidates = new Map<string, MediaCandidate>()
      const metadata: unknown[] = []
      let navigationBlocked = false
      page.on('framenavigated', (frame) => {
        if (frame === page!.mainFrame()) videoId ||= videoIdFromDouyinUrl(frame.url())
      })
      await page.route('**/*', async (route) => {
        const request = route.request()
        if (request.isNavigationRequest() && request.frame() === page!.mainFrame()) {
          try { validateDouyinUrl(request.url()) } catch {
            navigationBlocked = true
            await route.abort()
            return
          }
        }
        await route.continue()
      })
      page.on('response', (response) => {
        try {
          const candidate = classifyMediaResponse(response)
          if (candidate) {
            if (candidates.size >= 100) candidates.delete(candidates.keys().next().value!)
            candidates.set(candidate.url, candidate)
          }
        } catch {}
        void (async () => {
          try {
            validateDouyinUrl(response.url())
            const headers = response.headers()
            if (!response.ok() || !/json/i.test(headers['content-type'] || '') || Number(headers['content-length'] || 0) > 3_000_000) return
            const data = parsePageJson(await response.text())
            if (data && !abort.signal.aborted) {
              if (metadata.length >= 20) metadata.shift()
              metadata.push(data)
            }
          } catch {}
        })()
      })

      // A visible window gives the user time to log in or finish the site's verification.
      // Navigation timing out does not mean the browser is broken: a login page may be usable.
      const deadline = Date.now() + LOGIN_AND_MEDIA_WAIT_MS
      try {
        await page.goto(inputUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
      } catch (error) {
        if (navigationBlocked) throw new Error('抖音链接重定向到了其他网站，已停止下载。请重新复制目标视频的抖音链接。')
        if (!(error instanceof Error) || error.name !== 'TimeoutError') throw error
      }
      let firstMediaAt = 0
      let lastSnapshotAt = 0
      const allowedUrls = new Set<string>()
      while (Date.now() < deadline) {
        abort.signal.throwIfAborted()
        if (navigationBlocked) throw new Error('抖音页面已跳转到其他网站，已停止下载。请重新复制目标视频的抖音链接。')
        videoId ||= videoIdFromDouyinUrl(page.url())
        if (videoId) {
          for (const data of metadata.splice(0)) for (const url of targetMediaUrls(data, videoId)) allowedUrls.add(url)
          if (!lastSnapshotAt || Date.now() - lastSnapshotAt >= 2000) {
            lastSnapshotAt = Date.now()
            try {
              const snapshot = await page.evaluate(MEDIA_METADATA_SCRIPT) as string[]
              for (const text of snapshot) for (const url of targetMediaUrls(parsePageJson(text), videoId)) allowedUrls.add(url)
            } catch { /* Login/navigation can replace the page's execution context. */ }
          }
        }
        const values = [...candidates.values()].filter((candidate) => belongsToTarget(candidate, allowedUrls))
        if (pickLargest(values, false)) {
          if (!firstMediaAt) firstMediaAt = Date.now()
          // Some videos contain audio in the same response; allow split streams to arrive too.
          if (Date.now() - firstMediaAt >= 8000 && pickLargest(values, true)) break
          if (Date.now() - firstMediaAt >= 15000) break
        }
        await page.waitForTimeout(500)
      }

      const values = [...candidates.values()].filter((candidate) => belongsToTarget(candidate, allowedUrls))
      const videoCandidate = pickLargest(values, false)
      const audioCandidate = pickLargest(values, true)
      if (!videoCandidate || !videoId) throw new Error('等待 2 分钟后仍未发现可确认属于目标作品的视频流。请重新开始，在打开的抖音窗口内完成登录或验证并播放目标视频；也请确认链接仍可访问。登录状态会保存在本应用的独立浏览器配置中。')

      await downloadMedia(context.request, videoCandidate, videoTemp, abort.signal)
      const videoProbe = await probeMedia(videoTemp, abort.signal)
      if (!videoProbe.hasVideo) throw new Error('捕获的文件不包含视频流')

      let completeTemp = videoTemp
      if (videoProbe.hasAudio) {
        abort.signal.throwIfAborted()
      } else {
        if (!audioCandidate) throw new Error('页面未发现可下载的音频流')
        await downloadMedia(context.request, audioCandidate, audioTemp, abort.signal)
        await mergeMedia(videoTemp, audioTemp, mergedTemp, abort.signal)
        completeTemp = mergedTemp
      }

      const finalProbe = await probeMedia(completeTemp, abort.signal)
      if (!finalProbe.hasVideo || !finalProbe.hasAudio || finalProbe.duration <= 0 || finalProbe.size < 128 * 1024) {
        throw new Error('下载文件校验失败，音视频流不完整')
      }
      abort.signal.throwIfAborted()
      const outputPath = path.join(downloadDir, `douyin_${videoId}.mp4`)
      fs.rmSync(outputPath, { force: true })
      fs.renameSync(completeTemp, outputPath)

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
      context.off('close', onClosed)
      page?.off('close', onClosed)
      try { await page?.close() } catch {}
      for (const tempPath of [videoTemp, audioTemp, mergedTemp]) {
        try { fs.rmSync(tempPath, { force: true }) } catch {}
      }
    }
  })
}
