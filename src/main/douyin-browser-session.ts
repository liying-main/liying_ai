import { app } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium, type BrowserContext } from 'playwright'
import { getChromePath, validateMacChromeArch } from './platform-paths'
import { listDouyinBrowserCandidates } from './douyin-browser-paths'

export const DOUYIN_BROWSER_MISSING_MESSAGE =
  '未找到可用浏览器。请安装 Google Chrome 或 Microsoft Edge 后重试；源码开发者也可在项目目录运行 npx playwright install chromium。无需安装 downloadDouyinVideo.exe。'
export const DOUYIN_BROWSER_CLOSED_MESSAGE =
  '抖音浏览器窗口已关闭，本次操作已取消。请重新开始，并保持窗口打开直至任务完成。'

function availableBrowsers() {
  let playwrightPath: string | undefined
  try { playwrightPath = chromium.executablePath() } catch {}
  return listDouyinBrowserCandidates({
    platform: process.platform,
    env: process.env,
    homeDir: os.homedir(),
    bundledPath: getChromePath(),
    playwrightPath,
  }).filter((candidate) => {
    try {
      if (!fs.statSync(candidate.executablePath).isFile()) return false
      // This validator understands bundled Chrome for Testing, not system Chrome/Edge.
      return candidate.source !== 'bundled' || validateMacChromeArch(candidate.executablePath).ok
    } catch { return false }
  })
}

export function isDouyinBrowserAvailable(): boolean {
  return availableBrowsers().length > 0
}

let queue: Promise<void> = Promise.resolve()

/** A dedicated visible profile preserves login between tasks without touching the user's main profile. */
export function withDouyinBrowser<T>(task: (context: BrowserContext) => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(signal.reason)
  const result = queue.then(() => runInBrowser(task, signal))
  // A failed/cancelled task must not poison the queue or leave the profile locked.
  queue = result.then(() => undefined, () => undefined)
  if (!signal) return result
  // Report queued cancellation promptly; the queue still waits for launch/cleanup to finish.
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
    result.then((value) => {
      signal.removeEventListener('abort', onAbort)
      resolve(value)
    }, (error) => {
      signal.removeEventListener('abort', onAbort)
      reject(error)
    })
  })
}

async function runInBrowser<T>(task: (context: BrowserContext) => Promise<T>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted()
  const candidates = availableBrowsers()
  if (!candidates.length) throw new Error(DOUYIN_BROWSER_MISSING_MESSAGE)
  const profileDir = path.join(app.getPath('userData'), 'app-data2', 'browser', 'douyin')
  fs.mkdirSync(profileDir, { recursive: true })
  let context: BrowserContext | undefined
  let profileLocked = false
  for (const candidate of candidates) {
    try {
      signal?.throwIfAborted()
      context = await chromium.launchPersistentContext(profileDir, {
        executablePath: candidate.executablePath,
        headless: false,
        viewport: null,
        timeout: 45000,
        args: ['--autoplay-policy=no-user-gesture-required'],
      })
      if (signal?.aborted) {
        try { await context.close() } catch {}
        signal.throwIfAborted()
      }
      break
    } catch (error) {
      signal?.throwIfAborted()
      const message = error instanceof Error ? error.message : String(error)
      if (/ProcessSingleton|SingletonLock|profile.*(?:in use|locked)|user data directory.*in use/i.test(message)) {
        profileLocked = true
        break
      }
      // Never chmod, remove quarantine, or sign a system browser to make it launch.
    }
  }
  if (!context) {
    if (profileLocked) {
      throw new Error('抖音专用浏览器配置正被另一个应用实例占用。请关闭另一实例中的抖音窗口后重试；不需要关闭日常浏览器或删除登录资料。')
    }
    throw new Error('已找到浏览器，但启动失败。请确认 Chrome 或 Edge 可以正常打开并已更新，关闭上次由本应用打开的抖音窗口后重试。源码环境也可运行 npx playwright install chromium。')
  }

  const activeContext = context
  let wasClosed = false
  let rejectClosed: (error: Error) => void = () => {}
  const closed = new Promise<never>((_resolve, reject) => { rejectClosed = reject })
  const onClose = () => {
    wasClosed = true
    rejectClosed(new Error(DOUYIN_BROWSER_CLOSED_MESSAGE))
  }
  const onAbort = () => {
    rejectClosed(signal!.reason)
    void activeContext.close().catch(() => {})
  }
  activeContext.on('close', onClose)
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    signal?.throwIfAborted()
    return await Promise.race([Promise.resolve().then(() => task(activeContext)), closed])
  } catch (error) {
    if (signal?.aborted) throw signal.reason
    if (wasClosed || /Target page, context or browser has been closed|browser has been closed/i.test(String(error))) {
      throw new Error(DOUYIN_BROWSER_CLOSED_MESSAGE)
    }
    throw error
  } finally {
    signal?.removeEventListener('abort', onAbort)
    activeContext.off('close', onClose)
    try { await activeContext.close() } catch {}
  }
}
