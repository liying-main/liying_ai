import { app } from 'electron'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { getUserDataPath } from './local-server'

/**
 * 跨平台原生二进制 / 可执行文件路径解析。
 *
 * 命名约定（与 macOS arm64 / x64 兼容）:
 * - Windows: ffmpeg.exe / ffprobe.exe / chrome.exe / downloadDouyinVideo.exe
 * - macOS:   ffmpeg-${arch} / ffprobe-${arch} / chrome/mac-${arch}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
 *            downloadDouyinVideo-${arch}
 *   其中 ${arch} = 'arm64' 或 'x64' (取自 process.arch)
 *
 * 随应用分发的工具按这些路径解包，FFmpeg 也支持从系统 PATH 查找。
 */

const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'

function bundledRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked')
    : process.cwd()
}

function ffmpegBinName(): string {
  return isWin ? 'ffmpeg.exe' : `ffmpeg-${process.arch}`
}

function ffprobeBinName(): string {
  return isWin ? 'ffprobe.exe' : `ffprobe-${process.arch}`
}

function listNativeToolRoots(): string[] {
  const roots: string[] = []
  const push = (value?: string) => {
    if (!value) return
    const normalized = path.normalize(value)
    if (!roots.includes(normalized)) roots.push(normalized)
  }

  if (app.isPackaged) {
    push(path.join(process.resourcesPath, 'app.asar.unpacked'))
    push(path.join(path.dirname(process.execPath), 'resources', 'app.asar.unpacked'))
    push(process.resourcesPath)
  } else {
    push(process.cwd())
    push(path.join(__dirname, '..', '..'))
    const localApp = process.env.LOCALAPPDATA
    if (isWin && localApp) {
      push(path.join(localApp, 'Programs', 'liying-ai', 'resources', 'app.asar.unpacked'))
    }
  }

  return roots
}

function findBinaryOnPath(binName: string): string | null {
  const command = isWin ? 'where' : 'which'
  const query = isWin ? binName.replace(/\.exe$/i, '') : binName
  try {
    const out = execSync(`${command} ${query}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    })
    const first = String(out || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    if (first && fs.existsSync(first)) return first
  } catch {
    // ignore
  }
  return null
}

function resolveFfmpegLike(binName: string): string {
  const candidates = listNativeToolRoots().map((root) => path.join(root, 'ffmpeg', 'bin', binName))

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  const fromPath = findBinaryOnPath(binName)
  if (fromPath) return fromPath
  return candidates[0] || path.join(bundledRoot(), 'ffmpeg', 'bin', binName)
}

/** ffmpeg 主程序绝对路径 */
export function getFfmpegPath(): string {
  return resolveFfmpegLike(ffmpegBinName())
}

/** ffprobe 主程序绝对路径 */
export function getFfprobePath(): string {
  return resolveFfmpegLike(ffprobeBinName())
}

/** 抖音下载器二进制路径 (PyInstaller 打包产物) */
export function getDouyinExePath(): string {
  const root = bundledRoot()
  if (isWin) return path.join(root, 'douyin', 'downloadDouyinVideo.exe')
  if (isMac) return path.join(root, 'douyin', `downloadDouyinVideo-${process.arch}`)
  return path.join(root, 'douyin', `downloadDouyinVideo-${process.arch}`)
}

/** 内置 Chromium 浏览器主程序路径 (Playwright 用) */
export function getChromePath(): string {
  const root = bundledRoot()
  if (isWin) return path.join(root, 'chrome', 'chrome.exe')
  if (isMac) {
    // 按架构区分，避免 arm64 / x64 两套 Chrome for Testing 互相覆盖
    return path.join(
      root,
      'chrome',
      `mac-${process.arch}`,
      'Google Chrome for Testing.app',
      'Contents',
      'MacOS',
      'Google Chrome for Testing'
    )
  }
  // linux 兜底
  return path.join(root, 'chrome', 'chrome')
}

/** 从 Chrome 可执行文件路径解析 .app 包路径 */
export function getChromeAppBundlePath(chromePath: string): string | null {
  const marker = '.app/Contents/'
  const idx = chromePath.indexOf(marker)
  if (idx === -1) return null
  return chromePath.slice(0, idx + 4)
}

/**
 * macOS 启动前去除隔离属性并对内置 Chrome 做 ad-hoc 签名。
 * 未公证的 Mac 包（含贴牌）嵌入的 Chromium 常被 Gatekeeper 拦截，导致 Playwright 启动失败。
 */
export function prepareMacChromeForLaunch(chromePath: string): void {
  if (!isMac) return
  try {
    if (fs.existsSync(chromePath)) {
      fs.chmodSync(chromePath, 0o755)
    }
    const appBundle = getChromeAppBundlePath(chromePath)
    if (!appBundle || !fs.existsSync(appBundle)) return
    execSync(`xattr -cr "${appBundle}"`, { stdio: 'ignore' })
    execSync(`codesign --force --deep --sign - "${appBundle}"`, { stdio: 'ignore' })
  } catch (error) {
    console.warn('[platform-paths] prepareMacChromeForLaunch failed:', error)
  }
}

const MACH_MAGIC_64 = 0xfeedfacf
const CPU_TYPE_X86_64 = 0x01000007
const CPU_TYPE_ARM64 = 0x0100000c

function readMacMachCpuType(filePath: string): number | null {
  if (!fs.existsSync(filePath)) return null
  try {
    const fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(8)
    fs.readSync(fd, buf, 0, 8, 0)
    fs.closeSync(fd)
    const magic = buf.readUInt32LE(0)
    if (magic !== MACH_MAGIC_64) return null
    return buf.readUInt32LE(4)
  } catch {
    return null
  }
}

function resolveChromeFrameworkBinary(chromePath: string): string | null {
  const appBundle = getChromeAppBundlePath(chromePath)
  if (!appBundle) return null
  const versionsDir = path.join(
    appBundle,
    'Contents',
    'Frameworks',
    'Google Chrome for Testing Framework.framework',
    'Versions'
  )
  if (!fs.existsSync(versionsDir)) return null
  for (const ver of fs.readdirSync(versionsDir)) {
    if (ver === 'Current') continue
    const candidate = path.join(versionsDir, ver, 'Google Chrome for Testing Framework')
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

/** 校验内置 Chrome 与本机架构一致（Intel Mac 不能用 arm64 Chrome） */
export function validateMacChromeArch(chromePath: string): { ok: true } | { ok: false; message: string } {
  if (!isMac) return { ok: true }

  const expectedCpu = process.arch === 'arm64' ? CPU_TYPE_ARM64 : CPU_TYPE_X86_64
  const expectedLabel = process.arch === 'arm64' ? 'arm64 (Apple Silicon)' : 'x86_64 (Intel)'

  const framework = resolveChromeFrameworkBinary(chromePath)
  if (!framework) {
    return { ok: false, message: `内置 Chrome 结构异常，请重新安装 ${expectedLabel} 版本客户端` }
  }

  const cpu = readMacMachCpuType(framework)
  if (cpu === null) return { ok: true }

  if (cpu !== expectedCpu) {
    const actualLabel = cpu === CPU_TYPE_ARM64 ? 'arm64' : cpu === CPU_TYPE_X86_64 ? 'x86_64' : `cpu-${cpu}`
    return {
      ok: false,
      message:
        `内置浏览器架构错误：包内为 ${actualLabel}，本机为 ${expectedLabel}。` +
        (process.arch === 'x64'
          ? ' Intel Mac 需安装 x64 安装包，且包内须包含真正的 Intel 版 Chrome（不能是 M 芯片版复制）。'
          : ' 请安装 Apple Silicon (arm64) 版本。'),
    }
  }

  return { ok: true }
}

/** 窗口图标路径 (BrowserWindow icon 选项用，相对 __dirname/../../) */
export function getWindowIconRelativePath(): string | undefined {
  // macOS 不需要为 BrowserWindow 设置 icon (Dock 图标用 .icns 由 Info.plist 控制)
  // 返回 undefined 让 Electron 使用默认行为
  if (isWin) return '../../build/icon.ico'
  return undefined
}

function getDouyinExeFileName(): string {
  if (isWin) return 'downloadDouyinVideo.exe'
  return `downloadDouyinVideo-${process.arch}`
}

function listBundledDouyinExeCandidates(): string[] {
  const fileName = getDouyinExeFileName()
  const candidates: string[] = []

  if (app.isPackaged) {
    const roots = [
      path.join(process.resourcesPath, 'app.asar.unpacked'),
      path.join(path.dirname(process.execPath), 'resources', 'app.asar.unpacked'),
      process.resourcesPath,
    ]
    for (const root of roots) {
      candidates.push(path.join(root, 'douyin', fileName))
    }
  } else {
    candidates.push(
      path.join(process.cwd(), 'douyin', fileName),
      path.join(__dirname, '..', '..', 'douyin', fileName),
    )
  }

  return [...new Set(candidates)]
}

function getUserDataDouyinExePath(): string {
  return path.join(getUserDataPath('douyin'), getDouyinExeFileName())
}

/** 解析抖音下载器路径：多路径兜底，并复制到 userData 避免升级/杀毒导致找不到 */
export function resolveDouyinExePath(): { exePath: string | null; searched: string[] } {
  const searched: string[] = []
  const userDataExe = getUserDataDouyinExePath()
  searched.push(userDataExe)
  if (fs.existsSync(userDataExe)) {
    return { exePath: userDataExe, searched }
  }

  for (const bundled of listBundledDouyinExeCandidates()) {
    searched.push(bundled)
    if (!fs.existsSync(bundled)) continue

    try {
      const dir = path.dirname(userDataExe)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.copyFileSync(bundled, userDataExe)
      console.log('[douyin] copied downloader to userData:', userDataExe)
      return { exePath: userDataExe, searched }
    } catch (error) {
      console.warn('[douyin] failed to copy downloader to userData, using bundled path:', error)
      return { exePath: bundled, searched }
    }
  }

  return { exePath: null, searched }
}

export function ensureDouyinDownloader(): void {
  const { exePath, searched } = resolveDouyinExePath()
  if (exePath) {
    console.log('[douyin] downloader ready:', exePath)
    return
  }
  console.error('[douyin] downloader missing. searched paths:', searched)
}

export const DOUYIN_DOWNLOADER_MISSING_MESSAGE =
  '抖音下载组件缺失，请完全卸载后重新安装最新版；若已安装仍失败，请检查杀毒软件是否拦截并添加信任。'
