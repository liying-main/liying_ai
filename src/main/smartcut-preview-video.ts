import crypto from 'crypto'
import { exec, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { getUserDataPath } from './local-server'
import { getFfmpegPath, getFfprobePath } from './platform-paths'

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'])
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v'])

export function getSmartcutMediaFallbackDirs(): string[] {
  return [
    getUserDataPath('smartcut/mix'),
    getUserDataPath('smartcut/pip'),
    getUserDataPath('smartcut/preview-cache'),
    getUserDataPath('videos/downloaded'),
    getUserDataPath('videos/generated'),
    getUserDataPath('temp/reference-videos'),
    getUserDataPath('uploaded_videos'),
    getUserDataPath('audio'),
  ]
}

export function resolveSmartcutMediaPath(filePath: string): string {
  if (!filePath || fs.existsSync(filePath)) return filePath

  const fileName = path.basename(filePath.replace(/\\/g, '/'))
  if (!fileName || fileName === '.' || fileName === '..') return filePath

  for (const dir of getSmartcutMediaFallbackDirs()) {
    const candidate = path.join(dir, fileName)
    if (fs.existsSync(candidate)) return candidate
  }
  return filePath
}

function isImagePath(filePath: string): boolean {
  return IMAGE_EXTS.has(path.extname(filePath).toLowerCase())
}

function isVideoPath(filePath: string): boolean {
  return VIDEO_EXTS.has(path.extname(filePath).toLowerCase())
}

function probeVideoCodec(videoPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const ffprobePath = getFfprobePath()
    const cmd = `"${ffprobePath}" -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    exec(cmd, (error, stdout) => {
      if (error) {
        resolve(null)
        return
      }
      const codec = stdout.trim().toLowerCase()
      resolve(codec || null)
    })
  })
}

function runFfmpeg(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = getFfmpegPath()
    const child = spawn(ffmpeg, args, { windowsHide: true })
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`ffmpeg timeout after ${timeoutMs}ms`))
    }, timeoutMs)
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(stderr.slice(-800) || `ffmpeg exit ${code}`))
    })
  })
}

/**
 * Ensure smart-cut preview media can play in Chromium (H.264 + yuv420p).
 * Images and already-compatible MP4 files are returned unchanged.
 */
export async function ensureSmartcutPreviewVideo(videoPath: string): Promise<string> {
  const resolvedPath = resolveSmartcutMediaPath(videoPath)
  if (!resolvedPath || !fs.existsSync(resolvedPath)) return resolvedPath
  if (isImagePath(resolvedPath) || !isVideoPath(resolvedPath)) return resolvedPath

  const codec = await probeVideoCodec(resolvedPath)
  if (codec === 'h264') return resolvedPath

  const cacheDir = getUserDataPath('smartcut/preview-cache')
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })

  const stat = fs.statSync(resolvedPath)
  const hash = crypto
    .createHash('sha256')
    .update(`${resolvedPath}:${stat.mtimeMs}:${stat.size}`)
    .digest('hex')
    .slice(0, 16)
  const outPath = path.join(cacheDir, `preview_${hash}.mp4`)
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
    return outPath
  }

  const tmpPath = `${outPath}.tmp.mp4`
  const timeoutMs = Math.max(3 * 60 * 1000, Math.ceil((stat.size / (1024 * 1024)) * 30 * 1000))
  console.log('[SmartCut] Transcoding preview video:', resolvedPath, 'codec=', codec ?? 'unknown')
  await runFfmpeg(
    [
      '-y',
      '-i',
      resolvedPath,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      'faststart',
      tmpPath,
    ],
    timeoutMs,
  )
  fs.renameSync(tmpPath, outPath)
  return outPath
}
