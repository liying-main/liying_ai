const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

exports.default = async function afterPack(context) {
  prunePlatformBinaries(context)
  verifyRequiredUnpackedBinaries(context)

  if (context.electronPlatformName === 'darwin') {
    prepareMacUnpackedBinaries(context)
    return
  }

  if (context.electronPlatformName !== 'win32') return

  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  let iconPath = path.join(context.packager.projectDir, 'build', 'icon.ico')
  const metaPath = path.join(context.packager.projectDir, '.build-meta.json')
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
      const metadataIcon = meta.iconIco && path.resolve(context.packager.projectDir, meta.iconIco)
      if (metadataIcon && fs.existsSync(metadataIcon)) {
        iconPath = metadataIcon
      }
    } catch (error) {
      console.warn('[afterPack] failed to read .build-meta.json:', error.message)
    }
  }

  if (!fs.existsSync(exePath)) {
    console.warn(`[afterPack] exe not found: ${exePath}`)
    return
  }
  if (!fs.existsSync(iconPath)) {
    console.warn(`[afterPack] icon not found: ${iconPath}`)
    console.warn('[afterPack] 请先运行 node scripts/prepare-channel.mjs default 同步 logo 图标')
    return
  }

  // Find rcedit
  const cacheBase = path.join(
    process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local'),
    'electron-builder', 'Cache', 'winCodeSign'
  )
  let rceditPath = ''
  if (fs.existsSync(cacheBase)) {
    const dirs = fs.readdirSync(cacheBase).filter(d => d.startsWith('winCodeSign-'))
    for (const dir of dirs) {
      const candidate = path.join(cacheBase, dir, 'rcedit-x64.exe')
      if (fs.existsSync(candidate)) {
        rceditPath = candidate
        break
      }
    }
  }

  if (!rceditPath) {
    console.warn('[afterPack] rcedit not found, skipping icon embedding')
    return
  }

  const productName = context.packager.appInfo.productName || '厉影AI'
  const version = context.packager.appInfo.version || '1.0.0'
  const description = context.packager.appInfo.description || ''

  // Verify icon file
  const iconStats = fs.statSync(iconPath)
  console.log(`[afterPack] Icon file: ${iconPath}, size: ${iconStats.size} bytes`)

  // Retry with delay to handle antivirus file locks
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      console.log(`[afterPack] Setting icon (attempt ${attempt}/5)...`)
      console.log(`[afterPack] rcedit: ${rceditPath}`)
      console.log(`[afterPack] exe: ${exePath}`)
      console.log(`[afterPack] icon: ${iconPath}`)

      const result = execSync(
        `"${rceditPath}" "${exePath}" --set-icon "${iconPath}" --set-version-string ProductName "${productName}" --set-version-string FileDescription "${description}" --set-file-version ${version} --set-product-version ${version}.0`,
        { stdio: 'inherit', timeout: 30000 }
      )
      console.log('[afterPack] Icon set successfully!')
      console.log('[afterPack] rcedit output:', result?.toString())
      return
    } catch (err) {
      console.warn(`[afterPack] Attempt ${attempt} failed: ${err.message}`)
      if (attempt < 5) {
        console.log(`[afterPack] Waiting ${attempt * 3}s before retry...`)
        await new Promise(r => setTimeout(r, attempt * 3000))
      }
    }
  }
  console.error('[afterPack] Failed to set icon after 5 attempts')
}

function verifyRequiredUnpackedBinaries(context) {
  const unpackedRoot = path.join(context.appOutDir, 'resources', 'app.asar.unpacked')
  const binDir = path.join(unpackedRoot, 'ffmpeg', 'bin')
  const required = context.electronPlatformName === 'win32'
    ? ['ffmpeg.exe', 'ffprobe.exe']
    : context.electronPlatformName === 'darwin'
      ? [`ffmpeg-${normalizeArch(context.arch)}`, `ffprobe-${normalizeArch(context.arch)}`]
      : []

  const missing = required.filter((fileName) => {
    const filePath = path.join(binDir, fileName)
    if (!fs.existsSync(filePath)) return true
    const stat = fs.statSync(filePath)
    return !stat.isFile() || stat.size < 64 * 1024
  })

  if (missing.length > 0) {
    throw new Error(
      `[afterPack] FFmpeg resources missing or invalid: ${missing.join(', ')} in ${binDir}`
    )
  }

  if (required.length > 0) {
    console.log(`[afterPack] FFmpeg resources verified: ${required.join(', ')}`)
  }
}

function normalizeArch(arch) {
  const value = String(arch || process.arch)
  if (value === '1' || value === 'x64') return 'x64'
  if (value === '3' || value === 'arm64') return 'arm64'
  return process.arch === 'arm64' ? 'arm64' : 'x64'
}

function removeIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) return
  fs.rmSync(targetPath, { recursive: true, force: true })
  console.log(`[afterPack] Pruned platform-unused binary: ${targetPath}`)
}

function removeEntries(dirPath, shouldRemove) {
  if (!fs.existsSync(dirPath)) return
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (shouldRemove(entry.name, entry)) {
      removeIfExists(path.join(dirPath, entry.name))
    }
  }
}

function prunePlatformBinaries(context) {
  const unpackedRoot = path.join(context.appOutDir, 'resources', 'app.asar.unpacked')
  if (!fs.existsSync(unpackedRoot)) return

  const platform = context.electronPlatformName
  const arch = normalizeArch(context.arch)
  const ffmpegBinDir = path.join(unpackedRoot, 'ffmpeg', 'bin')
  const chromeDir = path.join(unpackedRoot, 'chrome')
  const douyinDir = path.join(unpackedRoot, 'douyin')

  if (platform === 'win32') {
    removeEntries(ffmpegBinDir, name => (
      /^(ffmpeg|ffprobe)-(x64|arm64)$/.test(name) ||
      /^mkv\d*\.exe$/i.test(name) ||
      name.toLowerCase() === 'ffplay.exe' ||
      name.toLowerCase() === 'avcodec-58.dll'
    ))
    removeEntries(douyinDir, name => /^downloadDouyinVideo-(x64|arm64)$/.test(name))
    removeIfExists(path.join(chromeDir, 'mac-arm64'))
    removeIfExists(path.join(chromeDir, 'mac-x64'))
    removeIfExists(path.join(chromeDir, 'Google Chrome for Testing.app'))
    return
  }

  if (platform === 'darwin') {
    removeEntries(ffmpegBinDir, name => {
      if (name === `ffmpeg-${arch}` || name === `ffprobe-${arch}` || name === 'LICENSE.txt') return false
      return (
        /^(ffmpeg|ffprobe)-(x64|arm64)$/.test(name) ||
        /\.(exe|dll)$/i.test(name)
      )
    })
    removeEntries(douyinDir, name => name !== `downloadDouyinVideo-${arch}`)
    removeEntries(chromeDir, name => name !== `mac-${arch}`)
  }
}

/** macOS: 去除隔离属性并对内置 Chrome / 原生二进制做 ad-hoc 签名，避免 Gatekeeper 拦截子进程 */
function prepareMacUnpackedBinaries(context) {
  const unpackedRoot = path.join(context.appOutDir, 'resources', 'app.asar.unpacked')
  if (!fs.existsSync(unpackedRoot)) return

  const arch = normalizeArch(context.arch)
  const chromeApp = path.join(
    unpackedRoot,
    'chrome',
    `mac-${arch}`,
    'Google Chrome for Testing.app'
  )
  const chromeBin = path.join(
    chromeApp,
    'Contents',
    'MacOS',
    'Google Chrome for Testing'
  )
  const ffmpegBin = path.join(unpackedRoot, 'ffmpeg', 'bin', `ffmpeg-${arch}`)
  const ffprobeBin = path.join(unpackedRoot, 'ffmpeg', 'bin', `ffprobe-${arch}`)
  const douyinBin = path.join(unpackedRoot, 'douyin', `downloadDouyinVideo-${arch}`)

  const dirsToClear = [
    path.join(unpackedRoot, 'ffmpeg', 'bin'),
    path.join(unpackedRoot, 'chrome', `mac-${arch}`),
    path.join(unpackedRoot, 'douyin'),
  ]

  for (const dir of dirsToClear) {
    if (!fs.existsSync(dir)) continue
    try {
      execSync(`xattr -cr "${dir}"`, { stdio: 'inherit' })
      console.log(`[afterPack] Cleared quarantine: ${dir}`)
    } catch (error) {
      console.warn(`[afterPack] xattr failed for ${dir}:`, error.message)
    }
  }

  for (const bin of [chromeBin, ffmpegBin, ffprobeBin, douyinBin]) {
    if (!fs.existsSync(bin)) continue
    try {
      fs.chmodSync(bin, 0o755)
    } catch (error) {
      console.warn(`[afterPack] chmod failed for ${bin}:`, error.message)
    }
  }

  if (!fs.existsSync(chromeApp)) {
    console.warn(`[afterPack] Chrome app missing for ${arch}: ${chromeApp}`)
    return
  }

  try {
    execSync(`codesign --force --deep --sign - "${chromeApp}"`, { stdio: 'inherit' })
    console.log(`[afterPack] Ad-hoc signed Chrome: ${chromeApp}`)
  } catch (error) {
    console.warn(`[afterPack] codesign Chrome failed:`, error.message)
  }
}
