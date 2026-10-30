import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const platform = process.argv[2] || process.platform
const rootDir = path.resolve(process.argv[3] || repoRoot)

function requiredFilesFor(platformName) {
  if (platformName === 'win32' || platformName === 'win') {
    return ['ffmpeg.exe', 'ffprobe.exe']
  }
  if (platformName === 'darwin' || platformName === 'mac') {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    return [`ffmpeg-${arch}`, `ffprobe-${arch}`]
  }
  return []
}

const requiredFiles = requiredFilesFor(platform)
if (requiredFiles.length === 0) {
  console.log(`[resource-check] No FFmpeg filename rules for platform: ${platform}`)
  process.exit(0)
}

const binDir = path.join(rootDir, 'ffmpeg', 'bin')
const missing = []
const invalid = []

for (const fileName of requiredFiles) {
  const filePath = path.join(binDir, fileName)
  if (!fs.existsSync(filePath)) {
    missing.push(fileName)
    continue
  }

  const stat = fs.statSync(filePath)
  if (!stat.isFile() || stat.size < 64 * 1024) {
    invalid.push(`${fileName} (${stat.isFile() ? `${stat.size} bytes` : 'not a file'})`)
  }
}

if (missing.length > 0 || invalid.length > 0) {
  console.error(`[resource-check] FFmpeg resources are incomplete in: ${binDir}`)
  if (missing.length > 0) console.error(`  Missing: ${missing.join(', ')}`)
  if (invalid.length > 0) console.error(`  Invalid: ${invalid.join(', ')}`)
  console.error('[resource-check] 请将有再分发许可的 FFmpeg / FFprobe 放入 ffmpeg/bin；参见 README 的打包资源说明。')
  process.exit(1)
}

console.log(`[resource-check] FFmpeg resources OK: ${requiredFiles.join(', ')}`)
