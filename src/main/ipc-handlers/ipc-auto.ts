import { ipcMain, app, Notification } from 'electron'
import { chromium, BrowserContext, Page } from 'playwright'
import fs from 'fs'
import path from 'path'
import { getUserDataPath } from '../local-server'

const PLATFORM_CONFIG = {
  bilibili: { homeUrl: 'https://www.bilibili.com' },
  douyin: { homeUrl: 'https://www.douyin.com' },
  kuaishou: { homeUrl: 'https://www.kuaishou.com' },
  wechat: { homeUrl: 'https://channels.weixin.qq.com' },
  redbook: { homeUrl: 'https://www.xiaohongshu.com' }
}

const platformContexts = new Map<string, BrowserContext>()

function getChromePath(): string {
  const baseDir = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'chrome')
    : path.join(process.cwd(), 'chrome')
  return path.join(baseDir, 'chrome.exe')
}

async function getOrCreateActivePage(context: BrowserContext): Promise<Page> {
  const pages = context.pages()
  if (pages.length === 0) return await context.newPage()
  if (pages.length === 1 && pages[0]?.url() === 'about:blank') return pages[0]
  return await context.newPage()
}

async function getOrLaunchContext(platform: string): Promise<BrowserContext> {
  const existing = platformContexts.get(platform)
  if (existing) {
    try {
      const pages = existing.pages()
      if (pages.length > 0) return existing
    } catch {
      platformContexts.delete(platform)
    }
  }

  const chromePath = getChromePath()
  if (!fs.existsSync(chromePath)) {
    throw new Error(`Chrome 未找到: ${chromePath}`)
  }

  const userDataDir = getUserDataPath(`browser-profiles/${platform}`)
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

    // exitCode 3221225781 = 0xC0000135 = STATUS_DLL_NOT_FOUND
    if (rawMsg.includes('3221225781') || rawMsg.includes('0xC0000135')) {
      throw new Error(
        '浏览器启动失败：系统缺少必要的运行库（DLL）。\n' +
        '请下载并安装 Visual C++ Redistributable（https://aka.ms/vs/17/release/vc_redist.x64.exe），安装后重启软件再试。'
      )
    }
    // exitCode 3221225477 = 0xC0000005 = ACCESS_VIOLATION
    if (rawMsg.includes('3221225477') || rawMsg.includes('0xC0000005')) {
      throw new Error('浏览器启动失败：内存访问异常，请尝试重启软件或电脑后再试。')
    }
    // Generic browser closed / crashed
    if (rawMsg.includes('browser has been closed') || rawMsg.includes('Target page, context or browser')) {
      throw new Error('浏览器启动失败：进程异常退出。请确认系统已安装 Visual C++ Redistributable 运行库，或尝试重启软件。')
    }
    // Fallback: truncate Playwright's verbose message
    const shortMsg = rawMsg.length > 200 ? rawMsg.substring(0, 200) + '...' : rawMsg
    throw new Error(`浏览器启动失败：${shortMsg}`)
  }

  context.on('close', () => platformContexts.delete(platform))
  platformContexts.set(platform, context)
  return context
}

export function registerAutoHandlers(): void {
  ipcMain.handle('browser-open-platform', async (_, platform: string) => {
    try {
      const config = PLATFORM_CONFIG[platform as keyof typeof PLATFORM_CONFIG]
      if (!config) return { success: false, error: '不支持的平台' }

      const context = await getOrLaunchContext(platform)
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

      let context = platformContexts.get(platform)
      if (!context) context = await getOrLaunchContext(platform)

      const page = await getOrCreateActivePage(context)
      await page.bringToFront()

      const options = {
        videoPath: params.videoPath,
        title: params.title,
        description: params.description,
        publishMode: params.publishMode ?? 'auto'
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
  const { videoPath = '', title = '', description = '' } = options

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
  const { videoPath = '', title = '', description = '' } = options

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
  const { videoPath = '', title = '', description = '' } = options

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
  const { videoPath = '', title = '', description = '' } = options

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
  const { videoPath = '', title = '', description = '' } = options

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

    new Notification({ title: '小红书', body: '表单已填写完成，请检查后手动点击「发布」' }).show()
    return { success: true, message: '表单已填写完成，请检查后手动点击「发布」' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}
