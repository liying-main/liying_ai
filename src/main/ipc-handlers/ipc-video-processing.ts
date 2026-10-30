import { ipcMain, app } from 'electron'
import { exec, spawn } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { getUserDataPath } from '../local-server'
import { getFfmpegPath, getFfprobePath } from '../platform-paths'
import { getCloudResourcesDir } from '../resource-manager'
import {
  ensureSmartcutPreviewVideo,
  resolveSmartcutMediaPath,
} from '../smartcut-preview-video'

function resolveAssetPath(inputPath: string): string {
  if (!inputPath) return inputPath
  
  // If path starts with /assets/, resolve to actual asset directory
  if (inputPath.startsWith('/assets/')) {
    const relativePath = inputPath.substring('/assets/'.length)
    const cloudPath = path.join(getCloudResourcesDir(), relativePath)
    if (fs.existsSync(cloudPath)) return cloudPath

    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', relativePath)
    }
    return path.join(process.cwd(), 'assets', relativePath)
  }
  
  // Already an absolute path
  return inputPath
}

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function extensionFromUrl(url: string, fallback: string): string {
  try {
    const ext = path.extname(new URL(url).pathname)
    return ext || fallback
  } catch {
    return fallback
  }
}

async function downloadRemoteAsset(url: string, fallbackExt: string): Promise<string> {
  const cacheDir = getUserDataPath('remote-assets')
  const hash = crypto.createHash('sha256').update(url).digest('hex')
  const ext = extensionFromUrl(url, fallbackExt)
  const targetPath = path.join(cacheDir, `${hash}${ext}`)
  if (fs.existsSync(targetPath)) return targetPath

  const tmpPath = `${targetPath}.tmp`
  const res = await fetch(url)
  if (!res.ok || !res.body) {
    throw new Error(`远程素材下载失败: HTTP ${res.status} ${url}`)
  }
  await pipeline(res.body as any, fs.createWriteStream(tmpPath))
  fs.renameSync(tmpPath, targetPath)
  return targetPath
}

async function resolveProcessingInputPath(inputPath: string, fallbackExt: string): Promise<string> {
  if (isRemoteUrl(inputPath)) {
    return downloadRemoteAsset(inputPath, fallbackExt)
  }
  const resolved = resolveAssetPath(inputPath)
  return ensureSmartcutPreviewVideo(resolveExistingMediaPath(resolved))
}

async function getVideoDimensionsInternal(videoPath: string): Promise<{ width: number; height: number } | null> {
  try {
    const { stdout } = await runTool(getFfprobePath(), [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=s=x:p=0',
      videoPath,
    ])
    const parts = stdout.trim().split('x')
    if (parts.length === 2) {
      const width = parseInt(parts[0], 10)
      const height = parseInt(parts[1], 10)
      if (!isNaN(width) && !isNaN(height)) {
        return { width, height }
      }
    }
  } catch {
    // ignore
  }
  return null
}

async function getVideoDurationInternal(videoPath: string): Promise<number | null> {
  try {
    const { stdout } = await runTool(getFfprobePath(), [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ])
    const duration = parseFloat(stdout.trim())
    return Number.isFinite(duration) && duration > 0 ? duration : null
  } catch {
    return null
  }
}

function buildFfmpegTimeoutMs(durationSeconds: number): number {
  const safeDuration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 60
  return Math.max(5 * 60 * 1000, Math.ceil(safeDuration * 20 * 1000))
}

function resolveExistingMediaPath(inputPath: string): string {
  return resolveSmartcutMediaPath(inputPath)
}

/** 用 spawn 调 ffmpeg/ffprobe，避免 Windows 下 exec 二次包裹引号导致命令被拼进多余的 ffmpeg 路径。 */
function runTool(
  binPath: string,
  args: string[],
  timeoutMs = 5 * 60 * 1000,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (!binPath || !fs.existsSync(binPath)) {
      console.error('[runTool] binary missing:', binPath)
      reject(new Error('FFmpeg 未找到，请重新安装客户端'))
      return
    }
    console.log('[runTool]', binPath, args.slice(0, 6).join(' '))
    const child = spawn(binPath, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`处理超时（${Math.round(timeoutMs / 1000)}秒）`))
    }, timeoutMs)
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      const msg = String(err?.message || err)
      reject(new Error(msg.includes('ENOENT') ? 'FFmpeg 未找到，请重新安装客户端' : msg))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      const detail = stderr.trim().slice(-500)
      reject(new Error(detail || `处理失败（退出码 ${code}）`))
    })
  })
}

export function registerVideoProcessingHandlers(): void {
  ipcMain.handle('get-video-duration', async (_, videoPath: string) => {
    try {
      const resolvedVideoPath = resolveExistingMediaPath(videoPath)
      const { stdout } = await runTool(getFfprobePath(), [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        resolvedVideoPath,
      ])
      const duration = parseFloat(stdout.trim())
      return { success: true, duration }
    } catch (error: any) {
      return { success: false, error: error?.message || '获取视频时长失败' }
    }
  })

  ipcMain.handle('get-video-dimensions', async (_, videoPath: string) => {
    try {
      const resolvedVideoPath = resolveExistingMediaPath(videoPath)
      const { stdout } = await runTool(getFfprobePath(), [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height',
        '-of', 'csv=s=x:p=0',
        resolvedVideoPath,
      ])
      const [width, height] = stdout.trim().split('x').map(Number)
      return { success: true, width, height }
    } catch (error: any) {
      return { success: false, error: error?.message || '获取视频尺寸失败' }
    }
  })

  ipcMain.handle('extract-video-audio-to-wav', async (_, videoPath: string) => {
    try {
      const resolvedVideoPath = resolveExistingMediaPath(videoPath)
      const outputDir = getUserDataPath('audio')
      fs.mkdirSync(outputDir, { recursive: true })
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const outputPath = path.join(outputDir, `audio_${timestamp}.wav`)
      await runTool(getFfmpegPath(), [
        '-i', resolvedVideoPath,
        '-acodec', 'pcm_s16le',
        '-ar', '44100',
        '-ac', '2',
        '-y', outputPath,
      ])
      return { success: true, file_path: outputPath }
    } catch (error: any) {
      return { success: false, error: error?.message || '提取音频失败' }
    }
  })

  ipcMain.handle('extract-video-audio-for-transcribe', async (_, videoPath: string) => {
    try {
      const resolvedVideoPath = resolveExistingMediaPath(videoPath)
      if (!fs.existsSync(resolvedVideoPath)) {
        return { success: false, error: `视频文件不存在: ${resolvedVideoPath}` }
      }
      const outputDir = getUserDataPath('audio')
      fs.mkdirSync(outputDir, { recursive: true })
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const outputPath = path.join(outputDir, `audio_transcribe_${timestamp}.wav`)
      await runTool(getFfmpegPath(), [
        '-i', resolvedVideoPath,
        '-vn',
        '-af', 'highpass=f=200,lowpass=f=3000,loudnorm=I=-16:TP=-1.5:LRA=11',
        '-ac', '1',
        '-ar', '16000',
        '-c:a', 'pcm_s16le',
        '-y', outputPath,
      ])
      return { success: true, file_path: outputPath }
    } catch (error: any) {
      return { success: false, error: error?.message || '提取识别音频失败' }
    }
  })

  ipcMain.handle('extract-frame-from-video', async (_, videoPath: string) => {
    try {
      const outputDir = getUserDataPath('frames')
      fs.mkdirSync(outputDir, { recursive: true })
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const outputPath = path.join(outputDir, `frame_${timestamp}.jpg`)
      console.log('[ExtractFrame] videoPath:', videoPath)
      console.log('[ExtractFrame] outputPath:', outputPath)

      const resolvedVideoPath = resolveExistingMediaPath(videoPath)
      if (!fs.existsSync(resolvedVideoPath)) {
        console.log('[ExtractFrame] Video file not found:', resolvedVideoPath)
        return { success: false, error: '视频文件不存在' }
      }

      await runTool(getFfmpegPath(), [
        '-i', resolvedVideoPath,
        '-vframes', '1',
        '-q:v', '2',
        '-y', outputPath,
      ])

      if (!fs.existsSync(outputPath)) {
        console.log('[ExtractFrame] Output file not created')
        return { success: false, error: '首帧文件未生成' }
      }

      console.log('[ExtractFrame] Success:', outputPath)
      return { success: true, image_path: outputPath }
    } catch (error: any) {
      console.log('[ExtractFrame] Error:', error?.message)
      return { success: false, error: error?.message || '提取首帧失败' }
    }
  })

  ipcMain.handle('prepare-still-image-base64-for-llm', async (_, imagePath: string) => {
    try {
      if (!imagePath || !fs.existsSync(imagePath)) {
        return { success: false, error: '图片文件不存在', base64: '' }
      }
      const ext = path.extname(imagePath).toLowerCase()
      const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'])
      if (!imageExts.has(ext)) {
        return { success: false, error: '不支持的图片格式', base64: '' }
      }
      const outputDir = getUserDataPath('temp/llm_image_resize')
      fs.mkdirSync(outputDir, { recursive: true })
      const absolutePath = path.resolve(imagePath)
      let mtimeMs = 0
      try {
        mtimeMs = fs.statSync(absolutePath).mtimeMs
      } catch {
        mtimeMs = 0
      }
      const crypto = require('crypto')
      const cacheKey = crypto.createHash('sha256')
        .update(absolutePath.replace(/\\/g, '/'))
        .update('\0')
        .update(String(mtimeMs))
        .digest('hex')
      const outputPath = path.join(outputDir, `llm_resize_${cacheKey}.jpg`)
      if (fs.existsSync(outputPath)) {
        const base64 = fs.readFileSync(outputPath).toString('base64')
        return { success: true, base64 }
      }
      const vf = 'scale=1280:1280:force_original_aspect_ratio=decrease'
      await runTool(getFfmpegPath(), [
        '-y',
        '-i', absolutePath,
        '-vf', vf,
        '-q:v', '2',
        outputPath,
      ])
      if (!fs.existsSync(outputPath)) {
        return { success: false, error: '处理失败：压缩结果未生成', base64: '' }
      }
      const base64 = fs.readFileSync(outputPath).toString('base64')
      return { success: true, base64 }
    } catch (error: any) {
      console.error('prepare-still-image-base64-for-llm failed:', error)
      return { success: false, error: error?.message || '处理失败', base64: '' }
    }
  })

  ipcMain.handle('add-bgm-to-video', async (_, videoPath: string, bgmPath: string, volume: number, options?: any) => {
    return new Promise(async (resolve) => {
      try {
      const ffmpegPath = getFfmpegPath()
      const ffprobePath = getFfprobePath()
      const outputDir = getUserDataPath('videos')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const outputPath = path.join(outputDir, `bgm_${timestamp}.mp4`)
      
      // Resolve BGM path if it's an asset path like /assets/bgms/xxx.mp3
      const resolvedBgmPath = await resolveProcessingInputPath(bgmPath, '.mp3')
      
      const probeCmd = `"${ffprobePath}" -v error -select_streams a -show_entries stream=index -of csv=p=0 "${videoPath}"`
      exec(probeCmd, (probeErr, probeStdout) => {
        const hasAudio = !probeErr && probeStdout.trim().length > 0
        const voiceVolume = options?.voiceVolume ?? 1
        const bgmVolumeFilter = `volume=${volume}`
        let cmd: string

        if (hasAudio) {
          const voiceVolumeFilter = `volume=${voiceVolume}`
          cmd = `"${ffmpegPath}" -i "${videoPath}" -i "${resolvedBgmPath}" -filter_complex "[0:a]${voiceVolumeFilter}[voice];[1:a]${bgmVolumeFilter}[bgm];[voice][bgm]amix=inputs=2:duration=first[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -y "${outputPath}"`
        } else {
          cmd = `"${ffmpegPath}" -i "${videoPath}" -i "${resolvedBgmPath}" -filter_complex "[1:a]${bgmVolumeFilter}[bgm]" -map 0:v -map "[bgm]" -c:v copy -c:a aac -shortest -y "${outputPath}"`
        }

        exec(cmd, { maxBuffer: 100 * 1024 * 1024 }, (error) => {
          if (error) {
            resolve({ success: false, error: error.message })
            return
          }
          resolve({ success: true, file_path: outputPath })
        })
      })
      } catch (error: any) {
        resolve({ success: false, error: error.message || String(error) })
      }
    })
  })

  ipcMain.handle('add-title-to-video', async (_, videoPath: string, mainTitleImageData: any, subTitleImageData: any, options?: any) => {
    return new Promise(async (resolve) => {
      try {
        if (!fs.existsSync(videoPath)) {
          resolve({ success: false, error: '视频文件不存在' })
          return
        }
        
        const ffmpegPath = getFfmpegPath()
        if (!fs.existsSync(ffmpegPath)) {
          resolve({ success: false, error: 'FFmpeg未找到' })
          return
        }
        
        const outputDir = getUserDataPath('videos/titled')
        const videoFileName = path.basename(videoPath, path.extname(videoPath))
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const outputPath = path.join(outputDir, `${videoFileName}_titled_${timestamp}.mp4`)
        
        const tempDir = getUserDataPath('temp/imgs')
        const mainTitleImagePath = path.join(tempDir, `main_title_${timestamp}.png`)
        const subTitleImagePath = subTitleImageData ? path.join(tempDir, `sub_title_${timestamp}.png`) : null
        
        // Save main title image
        const mainTitleBase64 = mainTitleImageData.replace(/^data:image\/png;base64,/, '')
        fs.writeFileSync(mainTitleImagePath, Buffer.from(mainTitleBase64, 'base64'))
        
        // Save sub title image if exists
        if (subTitleImageData && subTitleImagePath) {
          const subTitleBase64 = subTitleImageData.replace(/^data:image\/png;base64,/, '')
          fs.writeFileSync(subTitleImagePath, Buffer.from(subTitleBase64, 'base64'))
        }
        
        const hasSubTitle = options?.hasSubTitle || false
        const mainTitleConfig = options?.mainTitle || {
          font: 'Arial',
          fontSize: 48,
          fontWeight: 400,
          color: '#FFFFFF',
          strokeColor: '#000000',
          top: 100,
          borderRadius: 10,
          backgroundColor: 'transparent'
        }
        const subTitleConfig = options?.subTitle || (hasSubTitle ? {
          font: 'Arial',
          fontSize: 36,
          fontWeight: 400,
          color: '#FFFFFF',
          strokeColor: '#000000',
          top: 50,
          borderRadius: 10,
          backgroundColor: 'transparent'
        } : undefined)
        
        const isCombinedImage = options?.combinedImage === true
        const mainTitleTop = mainTitleConfig.top || 100
        const subTitleTopOffset = subTitleConfig?.top ?? 0
        const mainTitleImageHeight = options?.mainTitleImageHeight
        const subTitleTop = mainTitleImageHeight != null && hasSubTitle 
          ? mainTitleTop + mainTitleImageHeight + subTitleTopOffset 
          : (subTitleConfig?.top ?? 50)
        
        // Get video dimensions for scaling
        const baseVideoHeight = 1280
        const dims = await getVideoDimensionsInternal(videoPath)
        const scaleFactor = dims && dims.height > 0 ? dims.height / baseVideoHeight : 1
        
        const mainTitleY = isCombinedImage ? 0 : Math.round(mainTitleTop * scaleFactor)
        const subTitleY = Math.round(subTitleTop * scaleFactor)
        const scaleExpr = scaleFactor.toFixed(4)
        
        // Time range for title display
        const startTime = options?.startTime
        const endTime = options?.endTime
        const hasTimeRange = typeof startTime === 'number' && typeof endTime === 'number' && startTime < endTime
        const enableExpr = hasTimeRange ? `:enable='between(t,${startTime},${endTime})'` : ''
        
        // Build filter complex
        let filterComplex: string
        let command: string
        
        if (isCombinedImage) {
          // Combined image: when nativeResolution=true, canvas already matches video size
          // with the same min-scale logic as subtitle rendering — overlay 1:1 without stretch.
          const nativeResolution = options?.nativeResolution === true
          if (nativeResolution && dims) {
            filterComplex = `[0:v][1:v]overlay=0:0${enableExpr}[v1]`
          } else {
            filterComplex = `[1:v]scale=${dims?.width || 'iw'}:${dims?.height || 'ih'}[mt];[0:v][mt]overlay=0:0${enableExpr}[v1]`
          }
          command = `"${ffmpegPath}" -i "${videoPath}" -i "${mainTitleImagePath}" -filter_complex "${filterComplex}" -map "[v1]" -map 0:a -c:a copy -movflags faststart -y "${outputPath}"`
        } else if (hasSubTitle && subTitleImageData && subTitleImagePath) {
          filterComplex = `[1:v]scale=iw*${scaleExpr}:ih*${scaleExpr}[mt];[2:v]scale=iw*${scaleExpr}:ih*${scaleExpr}[st];[0:v][mt]overlay=x=(W-w)/2:y=${mainTitleY}${enableExpr}[v1];[v1][st]overlay=x=(W-w)/2:y=${subTitleY}${enableExpr}[v2]`
          command = `"${ffmpegPath}" -i "${videoPath}" -i "${mainTitleImagePath}" -i "${subTitleImagePath}" -filter_complex "${filterComplex}" -map "[v2]" -map 0:a -c:a copy -movflags faststart -y "${outputPath}"`
        } else {
          filterComplex = `[1:v]scale=iw*${scaleExpr}:ih*${scaleExpr}[mt];[0:v][mt]overlay=x=(W-w)/2:y=${mainTitleY}${enableExpr}[v1]`
          command = `"${ffmpegPath}" -i "${videoPath}" -i "${mainTitleImagePath}" -filter_complex "${filterComplex}" -map "[v1]" -map 0:a -c:a copy -movflags faststart -y "${outputPath}"`
        }
        
        console.log('Add title command:', command)
        
        exec(command, { maxBuffer: 50 * 1024 * 1024, encoding: 'utf8' }, (error, _stdout, stderr) => {
          // Cleanup temp files
          try {
            if (fs.existsSync(mainTitleImagePath)) {
              fs.unlinkSync(mainTitleImagePath)
            }
            if (subTitleImagePath && fs.existsSync(subTitleImagePath)) {
              fs.unlinkSync(subTitleImagePath)
            }
          } catch (cleanupError) {
            console.error('清理临时文件失败:', cleanupError)
          }
          
          if (error) {
            console.error('Add title error:', error)
            resolve({ success: false, error: error.message || '添加标题失败', stderr })
            return
          }
          
          if (!fs.existsSync(outputPath)) {
            resolve({ success: false, error: '输出文件未生成', stderr })
            return
          }
          
          resolve({ success: true, file_path: outputPath, message: '标题插入成功' })
        })
      } catch (error: any) {
        console.error('Add title to video failed:', error)
        resolve({ success: false, error: error.message || '添加标题失败' })
      }
    })
  })

  ipcMain.handle('add-subtitle-to-video', async (_, videoPath: string, subtitleItems: any[], options?: any) => {
    return new Promise(async (resolve) => {
      try {
        if (!fs.existsSync(videoPath)) {
          resolve({ success: false, error: '视频文件不存在' })
          return
        }
        
        if (!subtitleItems || subtitleItems.length === 0) {
          resolve({ success: false, error: '字幕数据为空' })
          return
        }
        
        const ffmpegPath = getFfmpegPath()
        if (!fs.existsSync(ffmpegPath)) {
          resolve({ success: false, error: 'FFmpeg未找到' })
          return
        }
        
        const outputDir = getUserDataPath('videos/subtitled')
        const videoFileName = path.basename(videoPath, path.extname(videoPath))
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const outputPath = path.join(outputDir, `${videoFileName}_subtitled_${timestamp}.mp4`)
        
        const tempDir = getUserDataPath('temp/imgs')
        const bottomMargin = options?.bottomMargin || 50
        const baseVideoHeight = 1280
        const subtitleImagePaths: string[] = []
        
        // Save subtitle images
        for (let i = 0; i < subtitleItems.length; i++) {
          const subtitleImagePath = path.join(tempDir, `subtitle_${timestamp}_${i}.png`)
          const base64 = subtitleItems[i].imageData.replace(/^data:image\/png;base64,/, '')
          fs.writeFileSync(subtitleImagePath, Buffer.from(base64, 'base64'))
          subtitleImagePaths.push(subtitleImagePath)
        }
        
        // Get video dimensions for scaling
        const dims = await getVideoDimensionsInternal(videoPath)
        const scaleFactor = dims && dims.height > 0 ? dims.height / baseVideoHeight : 1
        const scaledBottomMargin = bottomMargin * scaleFactor
        
        // Build filter complex
        let filterComplex = ''
        let currentInput = '[0:v]'
        
        for (let i = 0; i < subtitleItems.length; i++) {
          const item = subtitleItems[i]
          const outputStream = i === subtitleItems.length - 1 ? '[vout]' : `[v${i + 1}]`
          const startTime = item.startTime
          const endTime = item.endTime
          const scaleExpr = scaleFactor.toFixed(4)
          const marginPx = Math.round(scaledBottomMargin)
          const scaledLabel = `[s${i + 1}]`
          
          filterComplex += `[${i + 1}:v]scale=iw*${scaleExpr}:ih*${scaleExpr}${scaledLabel};${currentInput}${scaledLabel}overlay=x=(W-w)/2:y=H-h-${marginPx}:enable='between(t,${startTime},${endTime})'${outputStream}`
          
          if (i < subtitleItems.length - 1) {
            filterComplex += ';'
            currentInput = outputStream
          }
        }
        
        // Write filter script to file (handles complex filters better)
        const filterScriptDir = getUserDataPath('temp/filters')
        if (!fs.existsSync(filterScriptDir)) {
          fs.mkdirSync(filterScriptDir, { recursive: true })
        }
        const filterScriptPath = path.join(filterScriptDir, `filter_${timestamp}.txt`)
        fs.writeFileSync(filterScriptPath, filterComplex)
        
        // Build ffmpeg args
        const args: string[] = []
        args.push('-i', videoPath)
        subtitleImagePaths.forEach(p => {
          args.push('-i', p)
        })
        args.push(
          '-filter_complex_script', filterScriptPath,
          '-map', '[vout]',
          '-map', '0:a',
          '-c:a', 'copy',
          '-movflags', 'faststart',
          '-y', outputPath
        )
        
        console.log('Add subtitle command:', ffmpegPath, args.join(' '))
        
        const child = spawn(ffmpegPath, args, { windowsHide: true })
        let stderrData = ''
        let settled = false
        
        child.stderr.on('data', (data) => {
          stderrData += data.toString()
        })
        
        const finish = (success: boolean, errorMessage?: string) => {
          if (settled) return
          settled = true
          
          // Cleanup temp files
          try {
            subtitleImagePaths.forEach(imagePath => {
              if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath)
              }
            })
            if (fs.existsSync(filterScriptPath)) {
              fs.unlinkSync(filterScriptPath)
            }
          } catch (cleanupError) {
            console.error('清理临时文件失败:', cleanupError)
          }
          
          if (!success) {
            resolve({ success: false, error: errorMessage || '添加字幕失败', stderr: stderrData })
            return
          }
          
          if (!fs.existsSync(outputPath)) {
            resolve({ success: false, error: '输出文件未生成', stderr: stderrData })
            return
          }
          
          resolve({ success: true, file_path: outputPath, message: '字幕添加成功' })
        }
        
        child.on('error', (error) => {
          console.error('Add subtitle error:', error)
          finish(false, error.message)
        })
        
        child.on('close', (code) => {
          if (code !== 0) {
            console.error('Add subtitle exited with code:', code)
            finish(false, `FFmpeg 退出码 ${code}`)
          } else {
            finish(true)
          }
        })
      } catch (error: any) {
        console.error('Add subtitle to video failed:', error)
        resolve({ success: false, error: error.message || '添加字幕失败' })
      }
    })
  })

  ipcMain.handle('add-subtitle-to-video-canvas', async (_, videoPath: string, options?: any) => {
    try {
      if (!fs.existsSync(videoPath)) {
        return { success: false, error: '视频文件不存在' }
      }
      
      if (!options?.lineSegments || options.lineSegments.length === 0) {
        return { success: false, error: '字幕数据为空' }
      }
      
      const ffmpegPath = getFfmpegPath()
      if (!fs.existsSync(ffmpegPath)) {
        return { success: false, error: 'FFmpeg未找到' }
      }
      
      // Import the subtitle renderer dynamically
      const { renderSubtitleToVideo, loadFontsFromDir } = await import('../subtitle-canvas-renderer')
      
      const fontCandidates = [
        path.join(getCloudResourcesDir(), 'fonts'),
        app.isPackaged
          ? path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', 'fonts')
          : path.join(process.cwd(), 'assets', 'fonts'),
        path.join(process.cwd(), 'src', 'assets', 'fonts'),
        path.join(__dirname, '..', '..', '..', 'assets', 'fonts')
      ]
      const fontsDir = fontCandidates.find(p => fs.existsSync(p)) || fontCandidates[0]
      
      console.log('[Fonts] Using fonts directory:', fontsDir, 'exists:', fs.existsSync(fontsDir))
      
      loadFontsFromDir(fontsDir)
      
      const outputDir = getUserDataPath('videos/subtitled')
      fs.mkdirSync(outputDir, { recursive: true })
      
      const videoFileName = path.basename(videoPath, path.extname(videoPath))
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const outputPath = path.join(outputDir, `${videoFileName}_subtitled_canvas_${timestamp}.mp4`)
      
      const effect = options.entranceEffect ?? 'none'
      
      await renderSubtitleToVideo(
        ffmpegPath,
        fontsDir,
        videoPath,
        outputPath,
        options.lineSegments,
        options.style,
        options.posX ?? null,
        options.posY ?? null,
        options.alignment ?? 2,
        options.bottomMargin,
        effect
      )
      
      return { success: true, file_path: outputPath, message: 'Canvas字幕添加成功' }
    } catch (error: any) {
      console.error('Add subtitle canvas error:', error)
      return { success: false, error: error.message || 'Canvas字幕添加失败' }
    }
  })

  ipcMain.handle('compose-video-with-mix-segments', async (_, baseVideoPath: string, totalDuration: number, segments: any[]) => {
    try {
      if (!fs.existsSync(baseVideoPath)) {
        return { success: false, error: '视频文件不存在' }
      }
      if (!segments || segments.length === 0) {
        return { success: true, file_path: baseVideoPath }
      }
      const ffmpegPath = getFfmpegPath()
      if (!fs.existsSync(ffmpegPath)) {
        return { success: false, error: 'FFmpeg未找到' }
      }
      const dims = await getVideoDimensionsInternal(baseVideoPath)
      if (!dims) {
        return { success: false, error: '无法获取视频尺寸' }
      }
      const { width: W, height: H } = dims
      const outputDir = getUserDataPath('videos/mix')
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const outputPath = path.join(outputDir, `mix_${timestamp}.mp4`)

      const args: string[] = ['-i', baseVideoPath]
      for (const seg of segments) {
        const resolvedPath = await resolveProcessingInputPath(seg.overlayVideoPath, '.mp4')
        args.push('-stream_loop', '-1', '-i', resolvedPath)
      }

      const filterParts: string[] = []
      let currentBase = '[0:v]'
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]
        const inputIdx = i + 1
        const isLast = i === segments.length - 1
        const outputLabel = isLast ? '[vout]' : `[v${i}]`
        const segDur = Math.max(0.1, seg.end - seg.start)
        filterParts.push(`[${inputIdx}:v]trim=0:${segDur},setpts=PTS-STARTPTS+${seg.start}/TB,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,format=yuv420p,setsar=1[m${i}]`)
        filterParts.push(`${currentBase}[m${i}]overlay=0:0:eof_action=pass:enable='between(t,${seg.start},${seg.end})'${outputLabel}`)
        currentBase = outputLabel
      }
      const filterComplex = filterParts.join(';')

      const filterDir = getUserDataPath('temp/filters')
      if (!fs.existsSync(filterDir)) {
        fs.mkdirSync(filterDir, { recursive: true })
      }
      const filterPath = path.join(filterDir, `mix_filter_${timestamp}.txt`)
      fs.writeFileSync(filterPath, filterComplex)

      args.push(
        '-filter_complex_script', filterPath,
        '-map', '[vout]',
        '-map', '0:a',
        '-c:a', 'copy',
        '-movflags', 'faststart',
        '-y', outputPath
      )

      console.log('[MIX] Filter:', filterComplex)

      return new Promise((resolve) => {
        const child = spawn(ffmpegPath, args, { windowsHide: true })
        let stderrData = ''
        child.stderr.on('data', (data: Buffer) => { stderrData += data.toString() })
        child.on('error', (error: Error) => {
          try { if (fs.existsSync(filterPath)) fs.unlinkSync(filterPath) } catch {}
          resolve({ success: false, error: error.message })
        })
        child.on('close', (code: number | null) => {
          try { if (fs.existsSync(filterPath)) fs.unlinkSync(filterPath) } catch {}
          if (code !== 0) {
            console.error('[MIX] FFmpeg exit code:', code, stderrData.slice(-500))
            resolve({ success: false, error: `FFmpeg 退出码 ${code}`, stderr: stderrData })
            return
          }
          if (!fs.existsSync(outputPath)) {
            resolve({ success: false, error: '输出文件未生成' })
            return
          }
          resolve({ success: true, file_path: outputPath })
        })
      })
    } catch (error: any) {
      console.error('[MIX] Error:', error)
      return { success: false, error: error.message || '混剪合成失败' }
    }
  })

  ipcMain.handle('compose-video-with-pip-segments', async (_, baseVideoPath: string, totalDuration: number, segments: any[], mainVideoScaling?: any) => {
    try {
      if (!fs.existsSync(baseVideoPath)) {
        return { success: false, error: '视频文件不存在' }
      }
      const ffmpegPath = getFfmpegPath()
      if (!fs.existsSync(ffmpegPath)) {
        return { success: false, error: 'FFmpeg未找到' }
      }
      const dims = await getVideoDimensionsInternal(baseVideoPath)
      if (!dims) {
        return { success: false, error: '无法获取视频尺寸' }
      }
      const { width: W, height: H } = dims
      const outputDir = getUserDataPath('videos/pip')
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const outputPath = path.join(outputDir, `pip_${timestamp}.mp4`)

      const hasMainScaling = mainVideoScaling &&
        (mainVideoScaling.rect.x !== 0 || mainVideoScaling.rect.y !== 0 ||
         mainVideoScaling.rect.width !== 100 || mainVideoScaling.rect.height !== 100)

      const baseDuration = await getVideoDurationInternal(baseVideoPath)
      const outputDuration = baseDuration || (Number.isFinite(totalDuration) && totalDuration > 0 ? totalDuration : null)
      if (!outputDuration) {
        return { success: false, error: '无法获取视频时长' }
      }

      const args: string[] = ['-i', baseVideoPath]
      for (const seg of segments) {
        const resolvedPath = await resolveProcessingInputPath(seg.pipVideoPath, '.mp4')
        if (!fs.existsSync(resolvedPath)) {
          return { success: false, error: `画中画素材不存在: ${resolvedPath}` }
        }
        args.push('-stream_loop', '-1', '-i', resolvedPath)
      }

      const filterParts: string[] = []
      let currentBase: string

      if (hasMainScaling) {
        const mr = mainVideoScaling.rect
        const bgColor = (mainVideoScaling.bgColor || '#000000').replace('#', '0x')
        const mw = Math.max(2, Math.round(mr.width / 100 * W))
        const mh = Math.max(2, Math.round(mr.height / 100 * H))
        const mx = Math.round(mr.x / 100 * W)
        const my = Math.round(mr.y / 100 * H)
        // Ensure even dimensions for pad
        const padW = W % 2 === 0 ? W : W + 1
        const padH = H % 2 === 0 ? H : H + 1
        filterParts.push(`[0:v]scale=${mw}:${mh},pad=${padW}:${padH}:${mx}:${my}:color=${bgColor},format=yuv420p,setsar=1[base]`)
        currentBase = '[base]'
      } else {
        currentBase = '[0:v]'
      }

      if (segments.length === 0 && hasMainScaling) {
        // Only main scaling, no PIP segments - rename [base] to [vout]
        const lastIdx = filterParts.length - 1
        filterParts[lastIdx] = filterParts[lastIdx].replace('[base]', '[vout]')
      } else {
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i]
          const rect = seg.rect || { x: 0, y: 0, width: 30, height: 30 }
          const pw = Math.max(2, Math.round(rect.width / 100 * W))
          const ph = Math.max(2, Math.round(rect.height / 100 * H))
          const px = Math.round(rect.x / 100 * W)
          const py = Math.round(rect.y / 100 * H)
          const inputIdx = i + 1
          const isLast = i === segments.length - 1
          const outputLabel = isLast ? '[vout]' : `[v${i}]`
          const segDur = Math.max(0.1, seg.end - seg.start)
          filterParts.push(`[${inputIdx}:v]trim=0:${segDur},setpts=PTS-STARTPTS+${seg.start}/TB,scale=${pw}:${ph},format=yuv420p,setsar=1[p${i}]`)
          filterParts.push(`${currentBase}[p${i}]overlay=${px}:${py}:eof_action=pass:enable='between(t,${seg.start},${seg.end})'${outputLabel}`)
          currentBase = outputLabel
        }
      }

      const filterComplex = filterParts.join(';')
      const filterDir = getUserDataPath('temp/filters')
      if (!fs.existsSync(filterDir)) {
        fs.mkdirSync(filterDir, { recursive: true })
      }
      const filterPath = path.join(filterDir, `pip_filter_${timestamp}.txt`)
      fs.writeFileSync(filterPath, filterComplex)

      args.push(
        '-filter_complex_script', filterPath,
        '-map', '[vout]',
        '-map', '0:a?',
        '-c:a', 'copy',
        '-t', outputDuration.toFixed(3),
        '-movflags', 'faststart',
        '-y', outputPath
      )

      console.log('[PIP] Filter:', filterComplex)

      return new Promise((resolve) => {
        const child = spawn(ffmpegPath, args, { windowsHide: true })
        let stderrData = ''
        let settled = false
        const timeoutMs = buildFfmpegTimeoutMs(outputDuration)
        const finish = (result: any) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          try { if (fs.existsSync(filterPath)) fs.unlinkSync(filterPath) } catch {}
          resolve(result)
        }
        const timeout = setTimeout(() => {
          console.error('[PIP] FFmpeg timeout:', timeoutMs, stderrData.slice(-500))
          try { child.kill('SIGKILL') } catch {}
          finish({ success: false, error: '画中画合成超时，请检查素材时长或格式', stderr: stderrData })
        }, timeoutMs)
        child.stderr.on('data', (data: Buffer) => { stderrData += data.toString() })
        child.on('error', (error: Error) => {
          finish({ success: false, error: error.message })
        })
        child.on('close', (code: number | null) => {
          if (code !== 0) {
            console.error('[PIP] FFmpeg exit code:', code, stderrData.slice(-500))
            finish({ success: false, error: `FFmpeg 退出码 ${code}`, stderr: stderrData })
            return
          }
          if (!fs.existsSync(outputPath)) {
            finish({ success: false, error: '输出文件未生成' })
            return
          }
          finish({ success: true, file_path: outputPath })
        })
      })
    } catch (error: any) {
      console.error('[PIP] Error:', error)
      return { success: false, error: error.message || '画中画合成失败' }
    }
  })

  ipcMain.handle('scale-main-video', async (_, videoPath: string, rect: any, bgColor: string) => {
    try {
      if (!fs.existsSync(videoPath)) {
        return { success: false, error: '视频文件不存在' }
      }
      const ffmpegPath = getFfmpegPath()
      if (!fs.existsSync(ffmpegPath)) {
        return { success: false, error: 'FFmpeg未找到' }
      }
      const dims = await getVideoDimensionsInternal(videoPath)
      if (!dims) {
        return { success: false, error: '无法获取视频尺寸' }
      }
      const { width: W, height: H } = dims
      const outputDir = getUserDataPath('videos/scaled')
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const outputPath = path.join(outputDir, `scaled_${timestamp}.mp4`)

      const videoDuration = await getVideoDurationInternal(videoPath)
      if (!videoDuration) {
        return { success: false, error: '无法获取视频时长' }
      }

      const mw = Math.max(2, Math.round(rect.width / 100 * W))
      const mh = Math.max(2, Math.round(rect.height / 100 * H))
      const mx = Math.round(rect.x / 100 * W)
      const my = Math.round(rect.y / 100 * H)
      const colorHex = (bgColor || '#000000').replace('#', '0x')
      const padW = W % 2 === 0 ? W : W + 1
      const padH = H % 2 === 0 ? H : H + 1

      const filterComplex = `[0:v]scale=${mw}:${mh},pad=${padW}:${padH}:${mx}:${my}:color=${colorHex},setsar=1[vout]`

      const args: string[] = [
        '-i', videoPath,
        '-filter_complex', filterComplex,
        '-map', '[vout]',
        '-map', '0:a?',
        '-c:a', 'copy',
        '-t', videoDuration.toFixed(3),
        '-movflags', 'faststart',
        '-y', outputPath
      ]

      console.log('[ScaleMain] Filter:', filterComplex)

      return new Promise((resolve) => {
        const child = spawn(ffmpegPath, args, { windowsHide: true })
        let stderrData = ''
        let settled = false
        const timeoutMs = buildFfmpegTimeoutMs(videoDuration)
        const finish = (result: any) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          resolve(result)
        }
        const timeout = setTimeout(() => {
          console.error('[ScaleMain] FFmpeg timeout:', timeoutMs, stderrData.slice(-500))
          try { child.kill('SIGKILL') } catch {}
          finish({ success: false, error: '主视频缩放超时，请检查视频素材格式', stderr: stderrData })
        }, timeoutMs)
        child.stderr.on('data', (data: Buffer) => { stderrData += data.toString() })
        child.on('error', (error: Error) => {
          finish({ success: false, error: error.message })
        })
        child.on('close', (code: number | null) => {
          if (code !== 0) {
            console.error('[ScaleMain] FFmpeg exit code:', code, stderrData.slice(-500))
            finish({ success: false, error: `FFmpeg 退出码 ${code}`, stderr: stderrData })
            return
          }
          if (!fs.existsSync(outputPath)) {
            finish({ success: false, error: '输出文件未生成' })
            return
          }
          finish({ success: true, file_path: outputPath })
        })
      })
    } catch (error: any) {
      console.error('[ScaleMain] Error:', error)
      return { success: false, error: error.message || '主视频缩放失败' }
    }
  })

  // Cache management
  ipcMain.handle('get-cache-info', async () => {
    try {
      // 实际的缓存目录
      const videosGeneratedDir = getUserDataPath('videos/generated')
      const audioGeneratedDir = getUserDataPath('audio/generated')
      const videosDownloadedDir = getUserDataPath('videos/downloaded')
      const tempDir = getUserDataPath('temp')
      
      let totalSize = 0
      let fileCount = 0
      
      const calcDirSize = (dir: string): void => {
        if (!fs.existsSync(dir)) return
        const files = fs.readdirSync(dir)
        for (const file of files) {
          const filePath = path.join(dir, file)
          try {
            const stat = fs.statSync(filePath)
            if (stat.isDirectory()) {
              calcDirSize(filePath)
            } else {
              totalSize += stat.size
              fileCount++
            }
          } catch {}
        }
      }
      
      calcDirSize(videosGeneratedDir)
      calcDirSize(audioGeneratedDir)
      calcDirSize(videosDownloadedDir)
      calcDirSize(tempDir)
      
      return {
        success: true,
        totalSize,
        fileCount,
        formattedSize: totalSize < 1024 * 1024 
          ? `${(totalSize / 1024).toFixed(2)} KB`
          : totalSize < 1024 * 1024 * 1024
            ? `${(totalSize / (1024 * 1024)).toFixed(2)} MB`
            : `${(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB`
      }
    } catch (error: any) {
      return { success: false, error: error.message, totalSize: 0, fileCount: 0, formattedSize: '0 KB' }
    }
  })

  ipcMain.handle('clear-cache', async () => {
    try {
      // 实际的缓存目录
      const videosGeneratedDir = getUserDataPath('videos/generated')
      const audioGeneratedDir = getUserDataPath('audio/generated')
      const videosDownloadedDir = getUserDataPath('videos/downloaded')
      const tempDir = getUserDataPath('temp')
      
      let clearedSize = 0
      let clearedCount = 0
      
      const clearDir = (dir: string): void => {
        if (!fs.existsSync(dir)) return
        const files = fs.readdirSync(dir)
        for (const file of files) {
          const filePath = path.join(dir, file)
          try {
            const stat = fs.statSync(filePath)
            if (stat.isDirectory()) {
              clearDir(filePath)
              try {
                fs.rmdirSync(filePath)
              } catch {}
            } else {
              clearedSize += stat.size
              clearedCount++
              fs.unlinkSync(filePath)
            }
          } catch {}
        }
      }
      
      clearDir(videosGeneratedDir)
      clearDir(audioGeneratedDir)
      clearDir(videosDownloadedDir)
      clearDir(tempDir)
      
      return {
        success: true,
        clearedSize,
        clearedCount,
        message: `已清理 ${clearedCount} 个文件，释放 ${
          clearedSize < 1024 * 1024 
            ? `${(clearedSize / 1024).toFixed(2)} KB`
            : `${(clearedSize / (1024 * 1024)).toFixed(2)} MB`
        } 空间`
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}
