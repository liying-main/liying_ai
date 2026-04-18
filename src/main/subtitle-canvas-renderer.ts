import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { spawn, exec } from 'child_process'
import fs from 'fs'
import path from 'path'

const REF_W = 720
const REF_H = 1280

function getEntranceDuration(effect: string): number {
  switch (effect) {
    case 'fade': return 0.3
    case 'slide_up': return 0.4
    case 'typewriter': return 0.6
    case 'pop': return 0.2
    default: return 0
  }
}

const EXIT_DURATION = 0.2

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '').padEnd(6, '0')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function fillRoundedRect(ctx: any, x: number, y: number, w: number, h: number, r: number): void {
  if (r <= 0) {
    ctx.fillRect(x, y, w, h)
    return
  }
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
}

function strokeTextMultiDir(ctx: any, text: string, x: number, y: number, strokeWidth: number, strokeColor: string): void {
  if (strokeWidth <= 0) return
  ctx.save()
  ctx.fillStyle = strokeColor
  const offsets = strokeWidth
  for (let ox = -offsets; ox <= offsets; ox += offsets) {
    for (let oy = -offsets; oy <= offsets; oy += offsets) {
      if (ox === 0 && oy === 0) continue
      ctx.fillText(text, x + ox, y + oy)
    }
  }
  ctx.restore()
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

interface SubtitleStyle {
  font: string
  fontSize: number
  fontWeight: number
  color: string
  strokeEnabled?: boolean
  strokeWidth?: number
  strokeColor?: string
  shadowEnabled?: boolean
  shadowColor?: string
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowBlur?: number
  bgEnabled?: boolean
  bgColor?: string
  bgOpacity?: number
  bgPaddingH?: number
  bgPaddingV?: number
  bgBorderRadius?: number
}

interface RenderState {
  text: string
  style: SubtitleStyle
  canvasWidth: number
  canvasHeight: number
  posX?: number | null
  posY?: number | null
  alignment?: number
  bottomMargin: number
  entranceEffect: string
  entranceProgress: number
  exitProgress: number
}

function renderSubtitleFrame(ctx: any, state: RenderState): void {
  const { text, style, canvasWidth, canvasHeight, entranceEffect, entranceProgress, exitProgress } = state
  if (!text) return

  const scaleX = canvasWidth / REF_W
  const scaleY = canvasHeight / REF_H
  const scale = Math.min(scaleX, scaleY)
  const fontSize = style.fontSize * scale
  const fontStr = `${style.fontWeight} ${fontSize}px "${style.font}"`
  const lineHeight = fontSize * 1.3

  const chars = [...text]
  let visibleText: string
  if (entranceEffect === 'typewriter' && entranceProgress < 1) {
    const visibleCount = Math.ceil(easeOutCubic(entranceProgress) * chars.length)
    visibleText = chars.slice(0, visibleCount).join('')
  } else {
    visibleText = text
  }
  if (!visibleText) return

  const lines = visibleText.split('\n').filter(l => l.length > 0)
  if (lines.length === 0) return

  ctx.font = fontStr
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  let maxW = 0
  for (const line of lines) {
    const w = ctx.measureText(line).width
    if (w > maxW) maxW = w
  }

  const textTotalHeight = lines.length * lineHeight
  const padH = (style.bgEnabled ? style.bgPaddingH ?? 6 : 0) * scale
  const padV = (style.bgEnabled ? style.bgPaddingV ?? 2 : 0) * scale
  const boxWidth = maxW + padH * 2
  const boxHeight = textTotalHeight + padV * 2

  let centerX: number
  let centerY: number

  if (state.posX != null && state.posY != null) {
    centerX = state.posX * scaleX
    centerY = state.posY * scaleY
  } else {
    const alignment = state.alignment ?? 2
    const col = alignment % 3
    if (col === 1) centerX = canvasWidth * 0.05 + boxWidth / 2
    else if (col === 0) centerX = canvasWidth * 0.95 - boxWidth / 2
    else centerX = canvasWidth / 2

    const row = alignment <= 3 ? 'bottom' : alignment <= 6 ? 'middle' : 'top'
    const margin = state.bottomMargin * scaleY
    if (row === 'bottom') centerY = canvasHeight - margin - boxHeight / 2
    else if (row === 'top') centerY = margin + boxHeight / 2
    else centerY = canvasHeight / 2
  }

  ctx.save()
  let alpha = 1
  if (exitProgress > 0) {
    alpha *= 1 - easeOutCubic(exitProgress)
  }

  switch (entranceEffect) {
    case 'fade':
      alpha *= easeOutCubic(entranceProgress)
      break
    case 'slide_up': {
      const slideDistance = 80 * scaleY
      const offset = (1 - easeOutCubic(entranceProgress)) * slideDistance
      centerY += offset
      alpha *= easeOutCubic(entranceProgress)
      break
    }
    case 'pop': {
      const s = easeOutBack(Math.min(1, entranceProgress))
      ctx.translate(centerX, centerY)
      ctx.scale(s, s)
      ctx.translate(-centerX, -centerY)
      alpha *= Math.min(1, entranceProgress * 3)
      break
    }
  }

  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))

  if (style.bgEnabled) {
    const bgOpacity = (style.bgOpacity ?? 50) / 100
    const bgColor = style.bgColor || '#000000'
    const bgRadius = (style.bgBorderRadius ?? 0) * scale
    ctx.fillStyle = hexToRgba(bgColor, bgOpacity * ctx.globalAlpha)
    const savedAlpha = ctx.globalAlpha
    ctx.globalAlpha = 1
    fillRoundedRect(ctx, centerX - boxWidth / 2, centerY - boxHeight / 2, boxWidth, boxHeight, bgRadius)
    ctx.globalAlpha = savedAlpha
  }

  const strokeEnabled = style.strokeEnabled !== false && (style.strokeWidth ?? 2) > 0
  const startY = centerY - textTotalHeight / 2 + lineHeight / 2

  for (let li = 0; li < lines.length; li++) {
    const lineY = startY + li * lineHeight

    if (style.shadowEnabled) {
      ctx.shadowColor = style.shadowColor || '#000000'
      ctx.shadowOffsetX = (style.shadowOffsetX ?? 2) * scale
      ctx.shadowOffsetY = (style.shadowOffsetY ?? 2) * scale
      ctx.shadowBlur = (style.shadowBlur ?? 0) * scale
    }

    if (strokeEnabled) {
      ctx.shadowColor = 'transparent'
      strokeTextMultiDir(ctx, lines[li], centerX, lineY, (style.strokeWidth ?? 2) * scale, style.strokeColor || '#000000')
      if (style.shadowEnabled) {
        ctx.shadowColor = style.shadowColor || '#000000'
        ctx.shadowOffsetX = (style.shadowOffsetX ?? 2) * scale
        ctx.shadowOffsetY = (style.shadowOffsetY ?? 2) * scale
        ctx.shadowBlur = (style.shadowBlur ?? 0) * scale
      }
    }

    ctx.fillStyle = style.color || '#FFFFFF'
    ctx.fillText(lines[li], centerX, lineY)
  }

  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  ctx.restore()
}

function getVideoDimensions(ffmpegPath: string, videoPath: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    exec(`"${ffmpegPath}" -i "${videoPath}"`, { maxBuffer: 10 * 1024 * 1024, encoding: 'utf8' }, (_error, _stdout, stderr) => {
      const match = stderr.match(/, (\d+)x(\d+)[ ,]/)
      if (match) {
        resolve({ width: parseInt(match[1], 10), height: parseInt(match[2], 10) })
      } else {
        resolve(null)
      }
    })
  })
}

function getVideoDuration(ffmpegPath: string, videoPath: string): Promise<number> {
  return new Promise((resolve) => {
    exec(`"${ffmpegPath}" -i "${videoPath}"`, { maxBuffer: 10 * 1024 * 1024, encoding: 'utf8' }, (_error, _stdout, stderr) => {
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/)
      if (match) {
        const h = parseInt(match[1], 10)
        const m = parseInt(match[2], 10)
        const s = parseInt(match[3], 10)
        const cs = parseInt(match[4], 10)
        resolve(h * 3600 + m * 60 + s + cs / 100)
      } else {
        resolve(0)
      }
    })
  })
}

const FONT_EXTS = ['.ttf', '.otf', '.woff', '.woff2', '.ttc']

let fontsLoaded = false

export function loadFontsFromDir(fontsDir: string): void {
  if (fontsLoaded) {
    console.log('[Fonts] Fonts already loaded, skipping')
    return
  }
  
  console.log('[Fonts] Loading fonts from:', fontsDir)
  
  if (!fs.existsSync(fontsDir)) {
    console.error('[Fonts] Fonts directory does not exist:', fontsDir)
    return
  }
  
  const files = fs.readdirSync(fontsDir)
  console.log('[Fonts] Found files:', files)
  
  let loadedCount = 0
  for (const file of files) {
    const ext = path.extname(file).toLowerCase()
    if (!FONT_EXTS.includes(ext)) continue
    const filePath = path.join(fontsDir, file)
    const familyName = path.basename(file, ext)
    try {
      GlobalFonts.registerFromPath(filePath, familyName)
      console.log('[Fonts] Registered font:', familyName, 'from', filePath)
      loadedCount++
    } catch (err) {
      console.error('[Fonts] Failed to register font:', familyName, err)
    }
  }
  
  console.log('[Fonts] Total fonts loaded:', loadedCount)
  
  // Log all registered font families
  try {
    const families = GlobalFonts.families
    console.log('[Fonts] All registered families:', JSON.stringify(families.map((f: any) => f.family)))
  } catch (e) {
    console.log('[Fonts] Could not list families')
  }
  
  fontsLoaded = true
}

interface Segment {
  start: number
  end: number
  text: string
}

interface RenderPipeOpts {
  videoPath: string
  outputPath: string
  ffmpegPath: string
  videoWidth: number
  videoHeight: number
  fps: number
  totalDuration: number
  segments: Segment[]
  style: SubtitleStyle
  posX?: number | null
  posY?: number | null
  alignment?: number
  bottomMargin: number
  entranceEffect: string
  onProgress?: (percent: number) => void
}

async function renderSubtitlePipe(opts: RenderPipeOpts): Promise<string> {
  const { videoWidth: W, videoHeight: H, fps, totalDuration } = opts
  const totalFrames = Math.ceil(totalDuration * fps)
  const frameDur = 1 / fps
  const entranceDur = getEntranceDuration(opts.entranceEffect)

  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  const child = spawn(opts.ffmpegPath, [
    '-i', opts.videoPath,
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-s', `${W}x${H}`,
    '-r', String(fps),
    '-i', 'pipe:0',
    '-filter_complex', '[0:v][1:v]overlay=0:0:shortest=1[vout]',
    '-map', '[vout]',
    '-map', '0:a?',
    '-c:a', 'copy',
    '-movflags', 'faststart',
    '-y', opts.outputPath
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  })

  let stderrOutput = ''
  child.stderr?.on('data', (chunk) => {
    stderrOutput += chunk.toString()
  })

  const writeFrame = (buf: Buffer): Promise<void> => {
    return new Promise((resolve, reject) => {
      const ok = child.stdin!.write(buf, (err) => {
        if (err) reject(err)
      })
      if (ok) resolve()
      else child.stdin!.once('drain', resolve)
    })
  }

  for (let i = 0; i < totalFrames; i++) {
    const t = i * frameDur
    ctx.clearRect(0, 0, W, H)

    const seg = opts.segments.find(s => t >= s.start && t < s.end)
    if (seg) {
      const elapsed = t - seg.start
      const remaining = seg.end - t
      const ep = entranceDur > 0 ? Math.min(1, elapsed / entranceDur) : 1
      const xp = remaining < EXIT_DURATION ? 1 - remaining / EXIT_DURATION : 0

      renderSubtitleFrame(ctx, {
        text: seg.text,
        style: opts.style,
        canvasWidth: W,
        canvasHeight: H,
        posX: opts.posX,
        posY: opts.posY,
        alignment: opts.alignment,
        bottomMargin: opts.bottomMargin,
        entranceEffect: opts.entranceEffect,
        entranceProgress: ep,
        exitProgress: xp
      })
    }

    const rgbaBuffer = canvas.data()
    await writeFrame(rgbaBuffer)

    if (opts.onProgress && i % 10 === 0) {
      opts.onProgress(Math.round((i + 1) / totalFrames * 100))
    }
  }

  child.stdin!.end()

  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) {
        resolve(opts.outputPath)
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderrOutput.slice(-500)}`))
      }
    })
    child.on('error', reject)
  })
}

export async function renderSubtitleToVideo(
  ffmpegPath: string,
  fontsDir: string,
  videoPath: string,
  outputPath: string,
  segments: Segment[],
  style: SubtitleStyle,
  posX?: number | null,
  posY?: number | null,
  alignment?: number,
  bottomMargin?: number,
  entranceEffect?: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  loadFontsFromDir(fontsDir)
  
  const dims = await getVideoDimensions(ffmpegPath, videoPath)
  const w = dims?.width ?? 720
  const h = dims?.height ?? 1280
  const dur = await getVideoDuration(ffmpegPath, videoPath)
  if (dur <= 0) throw new Error('无法获取视频时长')

  return renderSubtitlePipe({
    videoPath,
    outputPath,
    ffmpegPath,
    videoWidth: w,
    videoHeight: h,
    fps: 30,
    totalDuration: dur,
    segments,
    style,
    posX,
    posY,
    alignment,
    bottomMargin: bottomMargin ?? 50,
    entranceEffect: entranceEffect ?? 'none',
    onProgress
  })
}
