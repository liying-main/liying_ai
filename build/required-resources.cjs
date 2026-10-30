const fs = require('node:fs')
const path = require('node:path')

// Shared by preflight and afterPack. A system browser is a development fallback,
// not a replacement for the resources shipped in a release.
function requiredResources(platform, arch = process.arch) {
  if (platform === 'win' || platform === 'win32') {
    return [
      ['ffmpeg/bin/ffmpeg.exe', 65536], ['ffmpeg/bin/ffprobe.exe', 65536],
      ['chrome/chrome.exe', 65536], ['chrome/chrome.dll', 1048576],
      ['chrome/icudtl.dat', 65536], ['chrome/resources.pak', 65536],
      ['chrome/locales/en-US.pak', 1024], ['chrome/v8_context_snapshot.bin', 1024]
    ]
  }
  if (platform === 'mac' || platform === 'darwin') {
    const cpu = arch === 'arm64' || String(arch) === '3' ? 'arm64' : 'x64'
    return [
      [`ffmpeg/bin/ffmpeg-${cpu}`, 65536], [`ffmpeg/bin/ffprobe-${cpu}`, 65536],
      [`chrome/mac-${cpu}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, 65536]
    ]
  }
  if (platform === 'linux') {
    return [['ffmpeg/bin/ffmpeg', 65536], ['ffmpeg/bin/ffprobe', 65536], ['chrome/chrome', 65536]]
  }
  throw new Error(`Unsupported packaging platform: ${platform}`)
}

function verifyResources(root, platform, arch) {
  const required = requiredResources(platform, arch)
  const failures = []
  for (const [relativePath, minimumBytes] of required) {
    try {
      const stat = fs.statSync(path.join(root, relativePath))
      if (!stat.isFile() || stat.size < minimumBytes) failures.push(`${relativePath} (invalid or truncated)`)
    } catch {
      failures.push(`${relativePath} (missing)`)
    }
  }
  if (failures.length) throw new Error(`Packaging resources incomplete in ${root}:\n${failures.join('\n')}`)
  return required.map(([name]) => name)
}

module.exports = { requiredResources, verifyResources }
