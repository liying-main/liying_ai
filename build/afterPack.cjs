const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const { createRequire } = require('module')
const { verifyResources } = require('./required-resources.cjs')

exports.default = async function afterPack(context) {
  prunePlatformBinaries(context)
  verifyRequiredUnpackedBinaries(context)

  if (context.electronPlatformName === 'darwin') {
    prepareMacUnpackedBinaries(context)
    return
  }

  if (context.electronPlatformName !== 'win32') return

  const exePath = path.join(context.appOutDir, `${context.packager.platformSpecificBuildOptions.executableName || context.packager.appInfo.productFilename}.exe`)
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

  if (!fs.existsSync(exePath)) throw new Error(`[afterPack] exe not found: ${exePath}`)
  if (!fs.existsSync(iconPath)) throw new Error(`[afterPack] icon not found: ${iconPath}`)

  // Use electron-builder's verified resource editor and argv handling, including
  // a fresh build machine where winCodeSign has not been cached yet.
  const builderRequire = createRequire(require.resolve('electron-builder'))
  const { executeAppBuilder } = builderRequire('builder-util')
  const productName = context.packager.appInfo.productName || '厉影AI'
  const version = context.packager.appInfo.version
  const args = [
    exePath, '--set-icon', iconPath,
    '--set-version-string', 'ProductName', productName,
    '--set-version-string', 'FileDescription', context.packager.appInfo.description || productName,
    '--set-version-string', 'CompanyName', '厉影AI',
    '--set-file-version', version, '--set-product-version', `${version}.0`,
  ]
  await executeAppBuilder(['rcedit', '--args', JSON.stringify(args)], undefined, {}, 3)
  console.log(`[afterPack] Windows icon and version resources set: ${productName} ${version}`)

}

function verifyRequiredUnpackedBinaries(context) {
  const unpackedRoot = path.join(context.appOutDir, 'resources', 'app.asar.unpacked')
  const verified = verifyResources(unpackedRoot, context.electronPlatformName, normalizeArch(context.arch))
  console.log(`[afterPack] FFmpeg and browser resources verified (${verified.length} files)`)
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
