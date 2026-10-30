import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import resources from '../build/required-resources.cjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const platform = process.argv[2] || process.platform
const rootDir = path.resolve(process.argv[3] || repoRoot)

try {
  const required = resources.verifyResources(rootDir, platform)
  if (process.platform === 'win32' && ['win', 'win32'].includes(platform)) {
    for (const tool of ['ffmpeg.exe', 'ffprobe.exe']) {
      const run = spawnSync(path.join(rootDir, 'ffmpeg', 'bin', tool), ['-version'], { timeout: 15000, windowsHide: true, encoding: 'utf8' })
      if (run.error || run.status !== 0) throw new Error(`${tool} cannot run; check its DLLs and architecture: ${run.error?.message || run.status}`)
    }
  }
  console.log(`[resource-check] FFmpeg and browser resources OK (${required.length} files)`)
} catch (error) {
  console.error(`[resource-check] ${error.message}`)
  console.error('[resource-check] 请按 README 准备完整 Chromium 和 FFmpeg / FFprobe，不能只复制一个 EXE。')
  process.exitCode = 1
}
