import { app, shell, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { startLocalFileServer } from './local-server'
import { registerAllIpcHandlers } from './ipc-handlers'
import { registerUpdaterHandlers } from './ipc-handlers/ipc-updater'
import { setMainWindowForPluginToken, abandonClientPluginQueues } from './ipc-handlers/ipc-plugin-proxy'
import { CHANNEL } from '../shared/channel.generated'

let mainWindow: BrowserWindow | null = null

const DESIGN_WINDOW_SIZE = { width: 1600, height: 960 }
const WORKAREA_FILL_RATIO = 1.02
const ZOOM_MIN = 0.65
const ZOOM_MAX = 1.95
const ZOOM_BIAS = 1.12

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function debounce<T extends (...args: any[]) => void>(fn: T, delayMs: number): T {
  let timer: NodeJS.Timeout | null = null
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delayMs)
  }) as T
}

function calcZoomFactor(win: BrowserWindow): number {
  const bounds = win.getBounds()
  const display = screen.getDisplayNearestPoint({
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2)
  })
  if (!display) return 1
  const scaleFactor = display.scaleFactor || 1
  const workArea = display.workAreaSize
  const zoomFromResolution = Math.min(
    workArea.width * WORKAREA_FILL_RATIO / DESIGN_WINDOW_SIZE.width,
    workArea.height * WORKAREA_FILL_RATIO / DESIGN_WINDOW_SIZE.height
  )
  const DPI_COMPENSATION_EXP = 0.18
  const zoomFromScale = 1 / Math.pow(scaleFactor, DPI_COMPENSATION_EXP)
  const nextZoom = zoomFromResolution * zoomFromScale * ZOOM_BIAS
  return clamp(nextZoom, ZOOM_MIN, ZOOM_MAX)
}

function attachDynamicPageZoom(win: BrowserWindow): () => void {
  const wc = win.webContents
  const apply = (): void => {
    const current = wc.getZoomFactor?.() ?? 1
    const next = calcZoomFactor(win)
    if (Math.abs(current - next) < 0.01) return
    wc.setZoomFactor(next)
  }
  const onDomReady = (): void => apply()
  wc.on('dom-ready', onDomReady)
  const onWindowMoved = debounce(apply, 250)
  const onWindowResized = debounce(apply, 250)
  win.on('moved', onWindowMoved)
  win.on('resize', onWindowResized)
  const onDisplayMetricsChanged = (): void => apply()
  screen.on('display-metrics-changed', onDisplayMetricsChanged)
  const onEnterFullScreen = (): void => apply()
  const onLeaveFullScreen = (): void => apply()
  win.on('enter-full-screen', onEnterFullScreen)
  win.on('leave-full-screen', onLeaveFullScreen)
  return () => {
    try {
      wc.off('dom-ready', onDomReady)
      win.off('moved', onWindowMoved)
      win.off('resize', onWindowResized)
      win.off('enter-full-screen', onEnterFullScreen)
      win.off('leave-full-screen', onLeaveFullScreen)
      screen.off('display-metrics-changed', onDisplayMetricsChanged)
    } catch {}
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 960,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    icon: join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true
    }
  })

  // 动态缩放 - 与原版一致
  const cleanupDynamicPageZoom = attachDynamicPageZoom(mainWindow)

  mainWindow.on('closed', () => {
    cleanupDynamicPageZoom()
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Dev server or production file
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setName(CHANNEL.packageName)
  electronApp.setAppUserModelId(CHANNEL.appId)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Start local file server for video playback
  startLocalFileServer()
  
  // Register all IPC handlers
  registerAllIpcHandlers()
  registerUpdaterHandlers()

  createWindow()
  
  // Set main window reference for plugin token management
  if (mainWindow) {
    setMainWindowForPluginToken(mainWindow)
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      if (mainWindow) {
        setMainWindowForPluginToken(mainWindow)
      }
    }
  })
})

let isQuitting = false

app.on('before-quit', async (e) => {
  if (isQuitting) return
  isQuitting = true
  e.preventDefault()
  try {
    await Promise.race([
      abandonClientPluginQueues(),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ])
  } catch {}
  app.exit(0)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
