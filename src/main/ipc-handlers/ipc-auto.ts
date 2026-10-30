import { ipcMain, app, Notification, BrowserWindow } from 'electron'
import { chromium, BrowserContext, Page } from 'playwright'
import fs from 'fs'
import path from 'path'
import { getUserDataPath } from '../local-server'
import { getChromePath, prepareMacChromeForLaunch, validateMacChromeArch } from '../platform-paths'

const PLATFORM_CONFIG = {
  bilibili: { homeUrl: 'https://www.bilibili.com' },
  douyin: { homeUrl: 'https://www.douyin.com' },
  kuaishou: { homeUrl: 'https://www.kuaishou.com' },
  wechat: { homeUrl: 'https://channels.weixin.qq.com' },
  redbook: { homeUrl: 'https://www.xiaohongshu.com' }
}

/** 各平台创作者后台管理首页（非 C 端首页） */
const PLATFORM_BACKEND_URLS: Record<string, string> = {
  douyin: 'https://creator.douyin.com/creator-micro/home',
  bilibili: 'https://member.bilibili.com/platform/home',
  kuaishou: 'https://cp.kuaishou.com/profile',
  wechat: 'https://channels.weixin.qq.com/platform/home',
  redbook: 'https://creator.xiaohongshu.com/new/home',
}

const platformContexts = new Map<string, BrowserContext>()
const loginWatchTimers = new Map<string, NodeJS.Timeout>()

const PLATFORM_LABELS: Record<string, string> = {
  douyin: '抖音',
  bilibili: 'B站',
  kuaishou: '快手',
  wechat: '视频号',
  redbook: '小红书',
}

function sanitizeProfileDirName(value: string): string {
  return (String(value || '').trim() || 'default').replace(/[/\\:*?"<>|]/g, '_')
}

export function getPublishAccountProfileDir(accountId: string): string {
  return getUserDataPath(`publish-browser-profiles/${sanitizeProfileDirName(accountId)}`)
}

function getLegacyPlatformProfileDir(platform: string): string {
  return getUserDataPath(`browser-profiles/${platform}`)
}

function getCreatorUrl(platform: string): string {
  return PLATFORM_BACKEND_URLS[platform] || ''
}

function getCreatorBackendUrl(platform: string): string {
  return getCreatorUrl(platform)
}

function evaluatePlatformLogin(platform: string, url: string, content: string): boolean {
  switch (platform) {
    case 'douyin': {
      const onCreator = url.includes('creator.douyin.com') || url.includes('douyin.com/creator')
      if (!onCreator) return false
      if (/login|passport|sso|\/auth/i.test(url)) return false
      if (url.includes('/creator-micro/') || url.includes('/content/')) return true
      const loggedInMarkers = ['新的创作', '数据总览', '创作服务平台', '抖音号', '发布视频', '高清发布', '互动管理']
      const needsLogin = ['扫码登录', '请使用抖音', '立即登录', '请登录后'].some((m) => content.includes(m))
      if (loggedInMarkers.some((m) => content.includes(m)) && !needsLogin) return true
      return onCreator && !needsLogin && !content.includes('扫码登录')
    }
    case 'bilibili':
      return !url.includes('passport.bilibili.com') && (url.includes('member.bilibili.com') || url.includes('space.bilibili.com') || !content.includes('登录'))
    case 'kuaishou':
      return !content.includes('请登录') && !url.includes('/login') && (url.includes('cp.kuaishou.com') || url.includes('creator.kuaishou.com'))
    case 'wechat':
      return !url.includes('login') && !content.includes('扫码登录') && url.includes('channels.weixin.qq.com/platform')
    case 'redbook':
      return url.includes('creator.xiaohongshu.com') && !url.includes('login') && !(content.includes('登录') && content.includes('扫码'))
    default:
      return !content.includes('请登录') && !content.includes('扫码登录')
  }
}

async function checkPlatformLoginStatus(
  page: Page,
  platform: string,
  options?: { soft?: boolean },
): Promise<boolean> {
  try {
    const soft = options?.soft ?? false
    let url = page.url()
    let content = ''
    try {
      content = await page.content()
    } catch {
      content = ''
    }

    if (evaluatePlatformLogin(platform, url, content)) return true
    if (soft) return false

    const creatorUrl = getCreatorUrl(platform)
    if (creatorUrl) {
      const host = (() => {
        try {
          return new URL(creatorUrl).hostname
        } catch {
          return ''
        }
      })()
      if (!host || !url.includes(host)) {
        await page.goto(creatorUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
      } else {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(async () => {
          await page.goto(creatorUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
        })
      }
      await page.waitForTimeout(2000)
      url = page.url()
      content = await page.content()
    }
    return evaluatePlatformLogin(platform, url, content)
  } catch {
    return false
  }
}

function notifyPublishAccountStatus(payload: {
  accountId: string
  platform: string
  is_valid: boolean
  message?: string
  current_url?: string
}) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('publish-account-status-changed', payload)
    }
  })
}

async function checkContextLoginStatus(
  context: BrowserContext,
  platform: string,
  options?: { soft?: boolean },
): Promise<{ isValid: boolean; page?: Page; url?: string }> {
  const pages = context.pages().filter((p) => {
    try {
      return !p.isClosed()
    } catch {
      return false
    }
  })

  for (const page of pages) {
    if (await checkPlatformLoginStatus(page, platform, { soft: true })) {
      return { isValid: true, page, url: page.url() }
    }
  }

  if (options?.soft) return { isValid: false }

  const page = pages.length > 0 ? pages[pages.length - 1] : await getOrCreateActivePage(context)
  const isValid = await checkPlatformLoginStatus(page, platform, { soft: false })
  return { isValid, page, url: page.url() }
}

function stopLoginWatch(userDataDir: string) {
  const timer = loginWatchTimers.get(userDataDir)
  if (timer) clearInterval(timer)
  loginWatchTimers.delete(userDataDir)
}

function startLoginWatch(params: {
  accountId: string
  platform: string
  userDataDir: string
  context: BrowserContext
}) {
  stopLoginWatch(params.userDataDir)

  const started = Date.now()
  const timeoutMs = 10 * 60 * 1000

  const timer = setInterval(async () => {
    if (Date.now() - started > timeoutMs) {
      stopLoginWatch(params.userDataDir)
      return
    }
    try {
      const { isValid, page, url } = await checkContextLoginStatus(params.context, params.platform, { soft: true })
      if (!isValid) return

      stopLoginWatch(params.userDataDir)
      const message = '已登录'
      notifyPublishAccountStatus({
        accountId: params.accountId,
        platform: params.platform,
        is_valid: true,
        message,
        current_url: url || page?.url(),
      })
      try {
        const label = PLATFORM_LABELS[params.platform] || params.platform
        new Notification({
          title: '账号登录成功',
          body: `${label}账号已登录，软件状态已同步`,
        }).show()
      } catch {
        /* ignore */
      }
    } catch (error) {
      console.error('[login-watch] failed:', error)
    }
  }, 2000)

  loginWatchTimers.set(params.userDataDir, timer)
}

async function tryNotifyIfAlreadyLoggedIn(params: {
  accountId: string
  platform: string
  userDataDir: string
  context: BrowserContext
}) {
  await new Promise((r) => setTimeout(r, 1500))
  const { isValid, url, page } = await checkContextLoginStatus(params.context, params.platform, { soft: true })
  if (!isValid) return
  stopLoginWatch(params.userDataDir)
  notifyPublishAccountStatus({
    accountId: params.accountId,
    platform: params.platform,
    is_valid: true,
    message: '已登录',
    current_url: url || page?.url(),
  })
}

async function getOrCreateActivePage(context: BrowserContext): Promise<Page> {
  const pages = context.pages().filter((p) => {
    try {
      return !p.isClosed()
    } catch {
      return false
    }
  })
  if (pages.length === 0) return await context.newPage()

  const nonBlank = pages.filter((p) => {
    try {
      return p.url() !== 'about:blank'
    } catch {
      return false
    }
  })
  if (nonBlank.length > 0) return nonBlank[nonBlank.length - 1]
  return pages[pages.length - 1]
}

async function getOrLaunchContext(cacheKey: string, userDataDir: string): Promise<BrowserContext> {
  const existing = platformContexts.get(cacheKey)
  if (existing) {
    try {
      const pages = existing.pages()
      if (pages.length > 0) return existing
      await existing.close().catch(() => {})
    } catch {
      // ignore stale context
    } finally {
      platformContexts.delete(cacheKey)
    }
  }

  const chromePath = getChromePath()
  if (!fs.existsSync(chromePath)) {
    const archHint = process.platform === 'darwin' ? ` (当前架构: ${process.arch})` : ''
    throw new Error(
      `Chrome 未找到: ${chromePath}${archHint}。请确认安装包包含 mac-${process.arch} 内置浏览器，或重新安装最新版。`
    )
  }

  prepareMacChromeForLaunch(chromePath)

  const archCheck = validateMacChromeArch(chromePath)
  if (!archCheck.ok) {
    throw new Error(archCheck.message)
  }

  fs.mkdirSync(userDataDir, { recursive: true })
  clearStaleProfileLocks(userDataDir)

  let context: BrowserContext
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      executablePath: chromePath,
      headless: false,
      viewport: null,
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled'
      ]
    })
  } catch (launchError: any) {
    const rawMsg = launchError?.message || String(launchError)
    console.error('[ipc-auto] Chrome launch failed:', rawMsg)

    if (/already running|SingletonLock|profile.*in use|user data directory/i.test(rawMsg)) {
      clearStaleProfileLocks(userDataDir, true)
      try {
        context = await chromium.launchPersistentContext(userDataDir, {
          executablePath: chromePath,
          headless: false,
          viewport: null,
          args: [
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-blink-features=AutomationControlled'
          ]
        })
      } catch (retryError: any) {
        throw new Error(`浏览器启动失败：${retryError?.message || rawMsg}`)
      }
    } else if (rawMsg.includes('3221225781') || rawMsg.includes('0xC0000135')) {
      throw new Error(
        '浏览器启动失败：系统缺少必要的运行库（DLL）。\n' +
        '请下载并安装 Visual C++ Redistributable（https://aka.ms/vs/17/release/vc_redist.x64.exe），安装后重启软件再试。'
      )
    } else if (rawMsg.includes('3221225477') || rawMsg.includes('0xC0000005')) {
      throw new Error('浏览器启动失败：内存访问异常，请尝试重启软件或电脑后再试。')
    } else if (rawMsg.includes('browser has been closed') || rawMsg.includes('Target page, context or browser')) {
      throw new Error(
        process.platform === 'darwin'
          ? '浏览器启动失败：Chrome 进程异常退出。请用「右键 → 打开」启动软件后重试，或安装包含浏览器修复的最新版本。'
          : '浏览器启动失败：进程异常退出。请确认系统已安装 Visual C++ Redistributable 运行库，或尝试重启软件。'
      )
    } else if (
      process.platform === 'darwin' &&
      /quarantine|SIGKILL|killed|Code Signature|damaged|cannot be opened|Library Validation|not permitted/i.test(rawMsg)
    ) {
      throw new Error(
        '浏览器启动失败：macOS 安全策略拦截了内置浏览器。\n' +
          '请用「右键 → 打开」启动主程序（不要双击），或在「系统设置 → 隐私与安全性」中允许运行后重试。'
      )
    } else {
      const shortMsg = rawMsg.length > 200 ? rawMsg.substring(0, 200) + '...' : rawMsg
      throw new Error(`浏览器启动失败：${shortMsg}`)
    }
  }

  context.on('close', () => platformContexts.delete(cacheKey))
  platformContexts.set(cacheKey, context)
  return context
}

function clearStaleProfileLocks(userDataDir: string, force = false): void {
  for (const lockName of ['SingletonLock', 'lockfile']) {
    const lockPath = path.join(userDataDir, lockName)
    if (!fs.existsSync(lockPath)) continue
    if (force) {
      try { fs.unlinkSync(lockPath) } catch { /* ignore */ }
      continue
    }
    try {
      const stat = fs.lstatSync(lockPath)
      if (stat.isSymbolicLink() || stat.isFile()) {
        fs.unlinkSync(lockPath)
      }
    } catch { /* ignore */ }
  }
}

export function registerAutoHandlers(): void {
  ipcMain.handle('browser-open-platform', async (_, platform: string) => {
    try {
      const config = PLATFORM_CONFIG[platform as keyof typeof PLATFORM_CONFIG]
      if (!config) return { success: false, error: '不支持的平台' }

      const userDataDir = getLegacyPlatformProfileDir(platform)
      const context = await getOrLaunchContext(`legacy:${platform}`, userDataDir)
      const page = await getOrCreateActivePage(context)
      await page.bringToFront()
      await page.goto(config.homeUrl, { waitUntil: 'domcontentloaded' })
      
      return { success: true }
    } catch (error: any) {
      console.log('browser-open-platform error', error)
      return { success: false, message: '打开平台浏览器失败', error: error.message }
    }
  })

  ipcMain.handle('browser-navigate', async (_, platform: string, url: string) => {
    try {
      const context = platformContexts.get(platform)
      if (!context) return { success: false, message: '该平台浏览器尚未打开，请先打开平台' }

      let page = context.pages()[0]
      if (!page) page = await context.newPage()

      await page.goto(url, { waitUntil: 'domcontentloaded' })
      return { success: true }
    } catch (error: any) {
      platformContexts.delete(platform)
      return { success: false, message: '跳转失败', error: error.message }
    }
  })

  ipcMain.handle('browser-run-publish-flow', async (_, platform: string, params: any) => {
    try {
      const config = PLATFORM_CONFIG[platform as keyof typeof PLATFORM_CONFIG]
      if (!config) return { success: false, message: '不支持的平台' }

      const userDataDir = params?.userDataDir || getLegacyPlatformProfileDir(platform)
      const cacheKey = params?.userDataDir || `legacy:${platform}`
      let context = platformContexts.get(cacheKey)
      if (!context) context = await getOrLaunchContext(cacheKey, userDataDir)

      if (params?.accountId) {
        startLoginWatch({
          accountId: params.accountId,
          platform,
          userDataDir,
          context,
        })
      }

      const page = await getOrCreateActivePage(context)
      await page.bringToFront()

      const options = {
        videoPath: params.videoPath,
        title: params.title,
        description: params.description,
        publishMode: params.publishMode ?? 'auto',
        skipLoginWait: !!params?.userDataDir,
      }

      switch (platform) {
        case 'douyin':
          return await runDouyinPublishFlow(page, options)
        case 'bilibili':
          return await runBilibiliPublishFlow(page, options)
        case 'kuaishou':
          return await runKuaishouPublishFlow(page, options)
        case 'wechat':
          return await runWechatPublishFlow(page, options)
        case 'redbook':
          return await runRedbookPublishFlow(page, options)
        default:
          return { success: false, message: '不支持的平台' }
      }
    } catch (error: any) {
      console.log('browser-run-publish-flow error', error)
      return { success: false, message: error.message }
    }
  })

  ipcMain.handle('browser-login-account', async (_, params: { platform: string; userDataDir?: string; accountId?: string }) => {
    try {
      const platform = params?.platform
      let userDataDir = params?.userDataDir
      if (!userDataDir && params?.accountId) {
        userDataDir = getPublishAccountProfileDir(params.accountId)
        fs.mkdirSync(userDataDir, { recursive: true })
      }
      const config = PLATFORM_CONFIG[platform as keyof typeof PLATFORM_CONFIG]
      if (!config) return { success: false, error: '不支持的平台' }
      if (!userDataDir) return { success: false, error: '缺少浏览器目录' }

      const context = await getOrLaunchContext(userDataDir, userDataDir)
      const page = await getOrCreateActivePage(context)
      await page.bringToFront()
      const url = getCreatorUrl(platform)
      if (!url) return { success: false, error: '不支持的平台' }
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      if (params.accountId) {
        startLoginWatch({
          accountId: params.accountId,
          platform,
          userDataDir,
          context,
        })
        void tryNotifyIfAlreadyLoggedIn({
          accountId: params.accountId,
          platform,
          userDataDir,
          context,
        })
      }
      try {
        new Notification({
          title: '账号登录',
          body: '请在打开的浏览器中扫码登录，完成后将自动同步到软件',
        }).show()
      } catch { /* ignore notification errors */ }
      return { success: true, message: '浏览器已打开，扫码后将自动同步登录状态', userDataDir, watching: !!params.accountId }
    } catch (error: any) {
      console.error('[browser-login-account]', error)
      return { success: false, error: error?.message || '打开登录失败' }
    }
  })

  ipcMain.handle('browser-open-account', async (_, params: { platform: string; userDataDir?: string; accountId?: string }) => {
    try {
      const platform = params?.platform
      let userDataDir = params?.userDataDir
      if (!userDataDir && params?.accountId) {
        userDataDir = getPublishAccountProfileDir(params.accountId)
        fs.mkdirSync(userDataDir, { recursive: true })
      }
      const config = PLATFORM_CONFIG[platform as keyof typeof PLATFORM_CONFIG]
      if (!config) return { success: false, error: '不支持的平台' }
      if (!userDataDir) return { success: false, error: '缺少浏览器目录' }

      const context = await getOrLaunchContext(userDataDir, userDataDir)
      const page = await getOrCreateActivePage(context)
      await page.bringToFront()
      const url = getCreatorBackendUrl(platform)
      if (!url) return { success: false, error: '不支持的平台' }
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      const label = PLATFORM_LABELS[platform] || platform
      return { success: true, message: `已打开${label}创作者后台`, userDataDir, url }
    } catch (error: any) {
      console.error('[browser-open-account]', error)
      return { success: false, error: error?.message || '打开失败' }
    }
  })

  ipcMain.handle('browser-check-account-status', async (_, params: { platform: string; userDataDir?: string; accountId?: string }) => {
    try {
      const platform = params?.platform
      let userDataDir = params?.userDataDir
      if (!userDataDir && params?.accountId) {
        userDataDir = getPublishAccountProfileDir(params.accountId)
        fs.mkdirSync(userDataDir, { recursive: true })
      }
      if (!PLATFORM_CONFIG[platform as keyof typeof PLATFORM_CONFIG]) {
        return { success: false, is_valid: false, message: '不支持的平台' }
      }
      if (!userDataDir) return { success: false, is_valid: false, message: '缺少浏览器目录' }

      const context = await getOrLaunchContext(userDataDir, userDataDir)
      let { isValid, page, url } = await checkContextLoginStatus(context, platform, { soft: true })
      if (!isValid) {
        const hard = await checkContextLoginStatus(context, platform, { soft: false })
        isValid = hard.isValid
        page = hard.page
        url = hard.url
      }
      if (isValid && params?.accountId) {
        stopLoginWatch(userDataDir)
        notifyPublishAccountStatus({
          accountId: params.accountId,
          platform,
          is_valid: true,
          message: '已登录',
          current_url: url || page?.url(),
        })
      }
      return {
        success: true,
        is_valid: isValid,
        message: isValid ? '已登录' : '待登录',
        current_url: url || page?.url() || '',
      }
    } catch (error: any) {
      return { success: false, is_valid: false, message: error.message }
    }
  })
}

// 等待视频上传完成的通用辅助函数
async function waitForUploadComplete(page: Page, timeoutMs: number = 180000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const progressEl = await page.locator('[class*="progress"], [class*="upload"]').first().textContent({ timeout: 2000 })
      if (progressEl && (progressEl.includes('100%') || progressEl.includes('完成') || progressEl.includes('成功'))) {
        await page.waitForTimeout(2000)
        return
      }
    } catch {}
    // 检查是否已经没有上传中的状态
    const uploading = await page.locator('[class*="uploading"], [class*="progress-bar"]:not([style*="100"])').count()
    if (uploading === 0) {
      await page.waitForTimeout(3000)
      return
    }
    await page.waitForTimeout(3000)
  }
}

// Douyin helpers
const DOUYIN_CREATOR_URL = 'https://creator.douyin.com'

async function isSessionValidAfterCookieLoad(page: Page): Promise<boolean> {
  try {
    const content = await page.content()
    if (content.includes('扫码登录')) return false
    return true
  } catch {
    return false
  }
}

async function clickPublishVideo(page: Page): Promise<boolean> {
  try {
    const byText = page.getByText('发布视频', { exact: false })
    await byText.first().click({ timeout: 10000 })
    return true
  } catch {
    return false
  }
}

async function uploadVideo(page: Page, videoPath: string): Promise<boolean> {
  try {
    const input = page.locator('input[type="file"]').first()
    await input.setInputFiles(videoPath, { timeout: 15000 })
    await page.waitForTimeout(2000)
    return true
  } catch {
    return false
  }
}

async function fillDouyinPublishForm(page: Page, options: { title: string; description: string; uploaded: boolean }): Promise<void> {
  const { title = '', description = '', uploaded } = options

  if (title) {
    try {
      const titleInput = page.locator('input[placeholder*="作品标题"]').first()
      await titleInput.fill(title, { timeout: 15000 })
    } catch {}
  }

  if (description) {
    try {
      const descEl = page.locator('[contenteditable="true"][data-placeholder*="作品简介"]').first()
      await descEl.click({ timeout: 10000 })
      await page.keyboard.press('Control+a')
      await page.keyboard.press('Backspace')
      const tags = description.split(',').map(t => t.trim()).filter(Boolean)
      const allTags = tags.map(tag => `#${tag}`).join(' ')
      await descEl.pressSequentially(`${allTags} `, { delay: 100 })
    } catch {}
  }

  if (uploaded) {
    try {
      const coverArea = page.locator("div[class*='recommendCover'] div[class*='maskBox']").first()
      await coverArea.click({ timeout: 10000 })
      await page.waitForTimeout(1000)
      const confirmBtn = page.getByText('确定').first()
      await confirmBtn.click({ timeout: 5000 })
    } catch {}
  }
}

async function runDouyinPublishFlow(page: Page, options: any) {
  const { videoPath = '', title = '', description = '', publishMode = 'manual' } = options

  try {
    new Notification({ title: '抖音', body: '正在打开网站，请耐心等待' }).show()
    await page.goto(DOUYIN_CREATOR_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    let sessionValid = await isSessionValidAfterCookieLoad(page)
    if (!sessionValid) {
      new Notification({ title: '抖音', body: '正在等待登录，请手动进行登录' }).show()
      const maxWaitMs = 300000
      const checkIntervalMs = 3000
      const start = Date.now()
      while (Date.now() - start < maxWaitMs) {
        await page.waitForTimeout(checkIntervalMs)
        sessionValid = await isSessionValidAfterCookieLoad(page)
        if (sessionValid) break
      }
      if (!sessionValid) {
        return { success: false, message: '等待登录超时，请在浏览器中完成登录后重试' }
      }
    }

    new Notification({ title: '抖音', body: '正在自动化操作，请勿干扰，等待完成提示' }).show()

    const clicked = await clickPublishVideo(page)
    if (!clicked) {
      return { success: false, message: '未能进入发布视频页面，请手动点击「发布视频」' }
    }
    await page.waitForTimeout(3000)

    let uploaded = false
    if (videoPath && fs.existsSync(videoPath)) {
      uploaded = await uploadVideo(page, videoPath)
      await page.waitForTimeout(3000)
    }

    await fillDouyinPublishForm(page, { title: title.trim(), description: description.trim(), uploaded })

    if (publishMode === 'auto') {
      await waitForUploadComplete(page, 180000)
      const publishBtn = page.locator('button').filter({ hasText: /^发布$/ }).first()
      try {
        await publishBtn.click({ timeout: 10000 })
        await page.waitForTimeout(3000)
        new Notification({ title: '抖音', body: '已自动发布成功' }).show()
        return { success: true, message: '已自动发布成功' }
      } catch {
        new Notification({ title: '抖音', body: '自动点击发布失败，请手动点击「发布」' }).show()
        return { success: true, message: '自动点击发布失败，请手动点击「发布」' }
      }
    }

    new Notification({ title: '抖音', body: '表单已填写完成，请检查后手动点击「发布」' }).show()
    return { success: true, message: '表单已填写完成，请检查后手动点击「发布」' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

// Bilibili helpers
const BILIBILI_PUBLISH_URL = 'https://member.bilibili.com/platform/upload/video/frame'
const BILIBILI_LOGIN_HOST = 'passport.bilibili.com'

async function waitForBilibiliLogin(page: Page, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const url = new URL(page.url())
      if (!url.hostname.includes(BILIBILI_LOGIN_HOST)) return true
    } catch {}
    await page.waitForTimeout(3000)
  }
  return false
}

async function runBilibiliPublishFlow(page: Page, options: any) {
  const { videoPath = '', title = '', description = '', publishMode = 'manual' } = options

  try {
    new Notification({ title: '哔哩哔哩', body: '正在打开网站，请耐心等待' }).show()
    await page.goto(BILIBILI_PUBLISH_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    const url = new URL(page.url())
    if (url.hostname.includes(BILIBILI_LOGIN_HOST)) {
      new Notification({ title: '哔哩哔哩', body: '正在等待登录，请手动进行登录' }).show()
      const loggedIn = await waitForBilibiliLogin(page, 300000)
      if (!loggedIn) {
        return { success: false, message: '等待登录超时，请在浏览器中完成登录后重试' }
      }
      await page.goto(BILIBILI_PUBLISH_URL, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(3000)
    }

    new Notification({ title: '哔哩哔哩', body: '正在自动化操作，请勿干扰，等待完成提示' }).show()

    if (videoPath && fs.existsSync(videoPath)) {
      try {
        const input = page.locator('input[type="file"]').first()
        await input.setInputFiles(videoPath, { timeout: 15000 })
        await page.waitForTimeout(2000)
      } catch {}
    }

    if (title) {
      try {
        const titleEl = page.locator('textarea[placeholder*="稿件标题"], input[placeholder*="稿件标题"]').first()
        await titleEl.fill(title, { timeout: 10000 })
      } catch {}
    }

    await page.waitForTimeout(5000)
    const tags = (description || '').split(/[,，]/).map((t: string) => t.trim()).filter(Boolean)
    const tagInput = page.locator('input[placeholder*="按回车键Enter创建标签"]').first()
    for (const tag of tags) {
      try {
        await tagInput.fill(tag, { timeout: 3000 })
        await page.waitForTimeout(300)
        await page.keyboard.press('Enter')
        await page.waitForTimeout(1000)
      } catch {
        break
      }
    }

    if (publishMode === 'auto') {
      await waitForUploadComplete(page, 180000)
      const submitBtn = page.locator('button').filter({ hasText: /提交|发布/ }).first()
      try {
        await submitBtn.click({ timeout: 10000 })
        await page.waitForTimeout(3000)
        new Notification({ title: '哔哩哔哩', body: '已自动发布成功' }).show()
        return { success: true, message: '已自动发布成功' }
      } catch {
        new Notification({ title: '哔哩哔哩', body: '自动点击发布失败，请手动点击「提交」' }).show()
        return { success: true, message: '自动点击发布失败，请手动点击「提交」' }
      }
    }

    new Notification({ title: '哔哩哔哩', body: '表单已填写完成，请检查后手动点击「发布」' }).show()
    return { success: true, message: '表单已填写完成，请检查后手动点击「提交」' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

// Kuaishou helpers
const KUAISHOU_CREATOR_URL = 'https://cp.kuaishou.com'
const KUAISHOU_POST_PATH = '/article/publish/video'

async function waitForKuaishouLogin(page: Page, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  await page.goto(KUAISHOU_CREATOR_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)

  while (Date.now() - start < timeoutMs) {
    const content = await page.content()
    if (content.includes('登录') && !content.includes('退出登录')) {
      new Notification({ title: '快手', body: '正在等待登录，请手动进行登录' }).show()
      await page.waitForTimeout(5000)
      continue
    }
    try {
      await page.goto(KUAISHOU_CREATOR_URL + KUAISHOU_POST_PATH, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)
      const url = page.url()
      if (url.includes('/publish/') || url.includes('/article/')) return true
    } catch {}
    await page.waitForTimeout(5000)
  }
  return false
}

async function runKuaishouPublishFlow(page: Page, options: any) {
  const { videoPath = '', title = '', description = '', publishMode = 'manual' } = options

  try {
    new Notification({ title: '快手', body: '正在打开网站，请耐心等待' }).show()
    const loggedIn = await waitForKuaishouLogin(page, 300000)
    if (!loggedIn) {
      return { success: false, message: '等待登录超时，请在浏览器中完成登录后重试' }
    }

    new Notification({ title: '快手', body: '正在自动化操作，请勿干扰，等待完成提示' }).show()

    if (videoPath && fs.existsSync(videoPath)) {
      try {
        const input = page.locator('input[type="file"]').first()
        await input.setInputFiles(videoPath, { timeout: 15000 })
        await page.waitForTimeout(3000)
      } catch {}
    }

    if (title) {
      try {
        const titleEl = page.locator('textarea[placeholder*="描述"], [contenteditable="true"]').first()
        await titleEl.fill(title, { timeout: 5000 })
        await page.keyboard.press('Space')
      } catch {}
    }

    if (description) {
      try {
        const tags = (description || '').split(/[,，]/).map((t: string) => t.trim()).filter(Boolean)
        const descEl = page.locator('textarea[placeholder*="描述"], [contenteditable="true"]').first()
        await descEl.click({ timeout: 5000 })
        await page.keyboard.press('End')
        for (const tag of tags) {
          await page.keyboard.press('Shift+#')
          await page.waitForTimeout(1000)
          await page.keyboard.type(`${tag}`, { delay: 300 })
          await page.waitForTimeout(2000)
          await page.keyboard.press('Space')
          await page.waitForTimeout(300)
        }
      } catch {}
    }

    if (publishMode === 'auto') {
      await waitForUploadComplete(page, 180000)
      const publishBtn = page.locator('button').filter({ hasText: /发布/ }).first()
      try {
        await publishBtn.click({ timeout: 10000 })
        await page.waitForTimeout(3000)
        new Notification({ title: '快手', body: '已自动发布成功' }).show()
        return { success: true, message: '已自动发布成功' }
      } catch {
        new Notification({ title: '快手', body: '自动点击发布失败，请手动点击「发布」' }).show()
        return { success: true, message: '自动点击发布失败，请手动点击「发布」' }
      }
    }

    new Notification({ title: '快手', body: '表单已填写完成，请检查后手动点击「发布」' }).show()
    return { success: true, message: '表单已填写完成，请检查后手动点击「发布」' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

// Wechat helpers
const WECHAT_CREATOR_URL = 'https://channels.weixin.qq.com'
const WECHAT_POST_PATH = '/platform/post/create'

async function waitForWechatLogin(page: Page, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  await page.goto(WECHAT_CREATOR_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)

  while (Date.now() - start < timeoutMs) {
    const content = await page.content()
    const url = page.url()
    if (url.includes('login') || content.includes('扫码登录') || content.includes('请登录')) {
      new Notification({ title: '视频号', body: '正在等待登录，请手动进行登录' }).show()
      await page.waitForTimeout(5000)
      continue
    }
    try {
      await page.goto(WECHAT_CREATOR_URL + WECHAT_POST_PATH, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)
      const url2 = page.url()
      if (!url2.includes('login') && !url2.includes('wx.qq.com')) return true
    } catch {}
    await page.waitForTimeout(5000)
  }
  return false
}

async function runWechatPublishFlow(page: Page, options: any) {
  const { videoPath = '', title = '', description = '', publishMode = 'manual' } = options

  try {
    new Notification({ title: '视频号', body: '正在打开网站，请耐心等待' }).show()
    const loggedIn = await waitForWechatLogin(page, 300000)
    if (!loggedIn) {
      return { success: false, message: '等待登录超时，请在浏览器中完成登录后重试' }
    }

    new Notification({ title: '视频号', body: '正在自动化操作，请勿干扰，等待完成提示' }).show()

    if (videoPath && fs.existsSync(videoPath)) {
      try {
        const input = page.locator('input[type="file"]').first()
        await input.setInputFiles(videoPath, { timeout: 15000 })
        await page.waitForTimeout(3000)
      } catch {}
    }

    if (title) {
      try {
        const titleEl = page.locator('div[data-placeholder*="添加描述"], [contenteditable="true"]').first()
        await titleEl.fill(title, { timeout: 10000 })
        await page.keyboard.press('Space')
      } catch {}
    }

    if (description) {
      try {
        const descEl = page.locator('div[data-placeholder*="添加描述"], [contenteditable="true"]').first()
        const tags = description.split(',').map((t: string) => t.trim()).filter(Boolean)
        for (const tag of tags) {
          await descEl.pressSequentially('#', { delay: 300 })
          await page.waitForTimeout(100)
          await descEl.pressSequentially(`${tag}`, { delay: 300 })
          await page.waitForTimeout(3000)
          await page.keyboard.press('Space')
          await page.waitForTimeout(300)
        }
      } catch {}
    }

    if (publishMode === 'auto') {
      await waitForUploadComplete(page, 180000)
      const publishBtn = page.locator('button').filter({ hasText: /发表/ }).first()
      try {
        await publishBtn.click({ timeout: 10000 })
        await page.waitForTimeout(3000)
        new Notification({ title: '视频号', body: '已自动发布成功' }).show()
        return { success: true, message: '已自动发布成功' }
      } catch {
        new Notification({ title: '视频号', body: '自动点击发布失败，请手动点击「发表」' }).show()
        return { success: true, message: '自动点击发布失败，请手动点击「发表」' }
      }
    }

    new Notification({ title: '视频号', body: '表单已填写完成，请检查后手动点击「发布」' }).show()
    return { success: true, message: '表单已填写完成，请检查后手动点击「发布」' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

// Redbook helpers
const REDBOOK_CREATOR_URL = 'https://creator.xiaohongshu.com'

async function waitForRedbookLogin(page: Page, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  await page.goto(REDBOOK_CREATOR_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)

  while (Date.now() - start < timeoutMs) {
    const content = await page.content()
    if (content.includes('登录') && content.includes('扫码')) {
      new Notification({ title: '小红书', body: '正在等待登录，请手动进行登录' }).show()
      await page.waitForTimeout(5000)
      continue
    }
    try {
      const url = page.url()
      if (url.includes('creator.xiaohongshu.com') && !url.includes('login')) return true
    } catch {}
    await page.waitForTimeout(5000)
  }
  return false
}

async function runRedbookPublishFlow(page: Page, options: any) {
  const { videoPath = '', title = '', description = '', publishMode = 'manual' } = options

  try {
    new Notification({ title: '小红书', body: '正在打开网站，请耐心等待' }).show()
    const loggedIn = await waitForRedbookLogin(page, 300000)
    if (!loggedIn) {
      return { success: false, message: '等待登录超时，请在浏览器中完成登录后重试' }
    }

    new Notification({ title: '小红书', body: '正在自动化操作，请勿干扰，等待完成提示' }).show()

    try {
      const publishBtn = page.getByText('发布笔记', { exact: false }).first()
      await publishBtn.click({ timeout: 10000 })
      await page.waitForTimeout(2000)
    } catch {}

    if (videoPath && fs.existsSync(videoPath)) {
      try {
        const input = page.locator('input[type="file"]').first()
        await input.setInputFiles(videoPath, { timeout: 15000 })
        await page.waitForTimeout(3000)
      } catch {}
    }

    if (title) {
      try {
        const titleEl = page.locator('input[placeholder*="标题"], textarea[placeholder*="标题"]').first()
        await titleEl.fill(title, { timeout: 10000 })
      } catch {}
    }

    if (description) {
      try {
        const descEl = page.locator('textarea[placeholder*="描述"], [contenteditable="true"]').first()
        const tags = description.split(',').map((t: string) => t.trim()).filter(Boolean)
        for (const tag of tags) {
          await descEl.pressSequentially('#', { delay: 300 })
          await page.waitForTimeout(100)
          await descEl.pressSequentially(`${tag}`, { delay: 300 })
          await page.waitForTimeout(3000)
          await page.keyboard.press('Space')
          await page.waitForTimeout(300)
        }
      } catch {}
    }

    if (publishMode === 'auto') {
      await waitForUploadComplete(page, 180000)
      const publishBtn = page.locator('button').filter({ hasText: /发布/ }).first()
      try {
        await publishBtn.click({ timeout: 10000 })
        await page.waitForTimeout(3000)
        new Notification({ title: '小红书', body: '已自动发布成功' }).show()
        return { success: true, message: '已自动发布成功' }
      } catch {
        new Notification({ title: '小红书', body: '自动点击发布失败，请手动点击「发布」' }).show()
        return { success: true, message: '自动点击发布失败，请手动点击「发布」' }
      }
    }

    new Notification({ title: '小红书', body: '表单已填写完成，请检查后手动点击「发布」' }).show()
    return { success: true, message: '表单已填写完成，请检查后手动点击「发布」' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}
