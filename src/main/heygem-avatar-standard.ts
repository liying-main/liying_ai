/**
 * HeyGem / Duix avatar "tea spec" (喝茶.mp4) normalization.
 * Primary: compress on material library upload. Fallback at video/run for legacy files.
 */
import crypto from 'crypto'
import { spawn, exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import { getUserDataPath } from './local-server'
import { getFfmpegPath, getFfprobePath } from './platform-paths'

const TEA_MAX_SHORT_SIDE = 1080
const TEA_CRF_TIERS = [17, 18, 20, 23]
const TEA_MAXRATE_MBPS = 12
const TEA_FPS = 30
const TEA_MB_PER_SEC = 1.2
const TEA_AVATAR_MAX_MB = 15
const TEA_PRESET = (process.env.HEYGEM_TEA_PRESET ?? 'fast').trim() || 'fast'

export type StandardizeAvatarOptions = {
  /** Write tea-spec output here (material library dest). */
  outputPath?: string
}

function isClientPrecompressEnabled(): boolean {
  const flag = (process.env.HEYGEM_CLIENT_PRECOMPRESS ?? '1').trim().toLowerCase()
  return flag !== '0' && flag !== 'false' && flag !== 'no'
}

function execText(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })
}

async function probeVideo(videoPath: string): Promise<{
  width: number
  height: number
  durationSec: number
  sizeMb: number
  codec: string
}> {
  const ffprobe = getFfprobePath()
  const json = await execText(
    `"${ffprobe}" -v error -select_streams v:0 -show_entries stream=codec_name,width,height -show_entries format=duration,size -of json "${videoPath}"`
  )
  const data = JSON.parse(json)
  const stream = (data.streams ?? [])[0] ?? {}
  const fmt = data.format ?? {}
  const sizeBytes = Number(fmt.size ?? 0)
  return {
    width: Number(stream.width ?? 0),
    height: Number(stream.height ?? 0),
    durationSec: Number(fmt.duration ?? 0),
    sizeMb: sizeBytes / (1024 * 1024),
    codec: String(stream.codec_name ?? ''),
  }
}

function teaSizeLimitMb(durationSec: number): number {
  const dur = Math.max(durationSec, 1)
  return Math.min(dur * TEA_MB_PER_SEC, TEA_AVATAR_MAX_MB)
}

function buildScaleFilter(width: number, height: number): string | null {
  if (width <= 0 || height <= 0) return null
  const shortSide = Math.min(width, height)
  if (shortSide <= TEA_MAX_SHORT_SIDE) return null
  const maxVal = TEA_MAX_SHORT_SIDE % 2 === 0 ? TEA_MAX_SHORT_SIDE : TEA_MAX_SHORT_SIDE + 1
  return width <= height ? `scale=${maxVal}:-2` : `scale=-2:${maxVal}`
}

export async function isTeaCompliant(videoPath: string): Promise<boolean> {
  if (!fs.existsSync(videoPath)) return false
  const meta = await probeVideo(videoPath)
  if (meta.width <= 0 || meta.height <= 0) return false
  if (meta.codec && meta.codec !== 'h264') return false
  const shortSide = Math.min(meta.width, meta.height)
  if (shortSide > TEA_MAX_SHORT_SIDE + 2) return false
  const limit = teaSizeLimitMb(meta.durationSec || 12)
  if (meta.sizeMb > limit * 1.08) return false
  return true
}

function copyToOutput(videoPath: string, outputPath: string): string {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.copyFileSync(videoPath, outputPath)
  return outputPath
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

async function encodeTeaPass(
  inputPath: string,
  outputPath: string,
  crf: number,
  scaleFilter: string | null
): Promise<void> {
  const args = ['-y', '-i', inputPath]
  if (scaleFilter) args.push('-vf', scaleFilter)
  args.push(
    '-c:v', 'libx264',
    '-crf', String(crf),
    '-preset', TEA_PRESET,
    '-maxrate', `${TEA_MAXRATE_MBPS}M`,
    '-bufsize', `${TEA_MAXRATE_MBPS * 2}M`,
    '-pix_fmt', 'yuv420p',
    '-r', String(TEA_FPS),
    '-an',
    outputPath
  )
  const meta = await probeVideo(inputPath)
  const timeoutMs = Math.max(5 * 60 * 1000, Math.ceil((meta.durationSec || 60) * 15 * 1000))
  await runFfmpeg(args, timeoutMs)
}

/**
 * Normalize avatar to tea spec. Returns path to use (original, library dest, or cache).
 * Set HEYGEM_CLIENT_PRECOMPRESS=0 to disable.
 */
export async function standardizeAvatarForHeygem(
  videoPath: string,
  options?: StandardizeAvatarOptions
): Promise<string> {
  const outputPath = options?.outputPath?.trim()
  const resolvedOut = outputPath ? path.resolve(outputPath) : null
  const resolvedIn = path.resolve(videoPath)

  if (!isClientPrecompressEnabled()) {
    if (resolvedOut && resolvedOut !== resolvedIn) {
      return copyToOutput(videoPath, resolvedOut)
    }
    return videoPath
  }
  if (!fs.existsSync(videoPath)) {
    return resolvedOut ?? videoPath
  }
  if (await isTeaCompliant(videoPath)) {
    console.log('[HeyGem] avatar already tea-spec compliant:', videoPath)
    if (resolvedOut && resolvedOut !== resolvedIn) {
      return copyToOutput(videoPath, resolvedOut)
    }
    return videoPath
  }

  const meta = await probeVideo(videoPath)
  const limitMb = teaSizeLimitMb(meta.durationSec || 12)

  let outPath: string
  let tmpPath: string

  if (resolvedOut) {
    outPath = resolvedOut
    tmpPath = `${outPath}.tmp.mp4`
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
  } else {
    const outDir = getUserDataPath('videos/heygem-upload')
    fs.mkdirSync(outDir, { recursive: true })
    const hash = crypto
      .createHash('sha256')
      .update(`${videoPath}:${fs.statSync(videoPath).mtimeMs}:${meta.sizeMb}:${limitMb}`)
      .digest('hex')
      .slice(0, 16)
    outPath = path.join(outDir, `tea_${hash}.mp4`)
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
      if (await isTeaCompliant(outPath)) {
        console.log('[HeyGem] reuse cached tea-spec avatar:', outPath)
        return outPath
      }
    }
    tmpPath = `${outPath}.tmp.mp4`
  }

  let scaleFilter = buildScaleFilter(meta.width, meta.height)
  console.log(
    '[HeyGem] client tea-spec normalize:',
    `${meta.sizeMb.toFixed(1)}MB -> limit ${limitMb.toFixed(1)}MB`,
    videoPath
  )

  let lastSizeMb = meta.sizeMb
  try {
    for (let i = 0; i < TEA_CRF_TIERS.length; i++) {
      const crf = TEA_CRF_TIERS[i]
      await encodeTeaPass(videoPath, tmpPath, crf, scaleFilter)
      scaleFilter = null
      const outMeta = await probeVideo(tmpPath)
      lastSizeMb = outMeta.sizeMb
      console.log(`[HeyGem] tea-spec pass crf=${crf} preset=${TEA_PRESET}: ${lastSizeMb.toFixed(1)}MB`)
      if (lastSizeMb <= limitMb * 1.05) {
        break
      }
    }
    fs.renameSync(tmpPath, outPath)
  } catch (e) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
    } catch {
      /* ignore */
    }
    throw e
  }

  console.log('[HeyGem] tea-spec done:', `${meta.sizeMb.toFixed(1)}MB -> ${lastSizeMb.toFixed(1)}MB`, outPath)
  return outPath
}
