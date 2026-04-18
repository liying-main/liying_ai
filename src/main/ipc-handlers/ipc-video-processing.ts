import { ipcMain, app } from 'electron'
import { exec, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { getUserDataPath } from '../local-server'

function getFfmpegPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'ffmpeg', 'bin', 'ffmpeg.exe')
    : path.join(process.cwd(), 'ffmpeg', 'bin', 'ffmpeg.exe')
}

function getFfprobePath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'ffmpeg', 'bin', 'ffprobe.exe')
    : path.join(process.cwd(), 'ffmpeg', 'bin', 'ffprobe.exe')
}

function resolveAssetPath(inputPath: string): string {
  if (!inputPath) return inputPath
  
  // If path starts with /assets/, resolve to actual asset directory
  if (inputPath.startsWith('/assets/')) {
    const relativePath = inputPath.substring('/assets/'.length)
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', relativePath)
    }
    return path.join(process.cwd(), 'assets', relativePath)
  }
  
  // Already an absolute path
  return inputPath
}

async function getVideoDimensionsInternal(videoPath: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const ffprobePath = getFfprobePath()
    const cmd = `"${ffprobePath}" -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${videoPath}"`
    
    exec(cmd, (error, stdout) => {
      if (error) {
        resolve(null)
        return
      }
      const parts = stdout.trim().split('x')
      if (parts.length === 2) {
        const width = parseInt(parts[0], 10)
        const height = parseInt(parts[1], 10)
        if (!isNaN(width) && !isNaN(height)) {
          resolve({ width, height })
          return
        }
      }
      resolve(null)
    })
  })
}

export function registerVideoProcessingHandlers(): void {
  ipcMain.handle('get-video-duration', async (_, videoPath: string) => {
    return new Promise((resolve) => {
      const ffprobePath = getFfprobePath()
      const cmd = `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
      
      exec(cmd, (error, stdout) => {
        if (error) {
          resolve({ success: false, error: error.message })
          return
        }
        const duration = parseFloat(stdout.trim())
        resolve({ success: true, duration })
      })
    })
  })

  ipcMain.handle('get-video-dimensions', async (_, videoPath: string) => {
    return new Promise((resolve) => {
      const ffprobePath = getFfprobePath()
      const cmd = `"${ffprobePath}" -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${videoPath}"`
      
      exec(cmd, (error, stdout) => {
        if (error) {
          resolve({ success: false, error: error.message })
          return
        }
        const [width, height] = stdout.trim().split('x').map(Number)
        resolve({ success: true, width, height })
      })
    })
  })

  ipcMain.handle('extract-video-audio-to-wav', async (_, videoPath: string) => {
    return new Promise((resolve) => {
      const ffmpegPath = getFfmpegPath()
      const outputDir = getUserDataPath('audio')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const outputPath = path.join(outputDir, `audio_${timestamp}.wav`)
      
      const cmd = `"${ffmpegPath}" -i "${videoPath}" -acodec pcm_s16le -ar 44100 -ac 2 -y "${outputPath}"`
      
      exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (error) => {
        if (error) {
          resolve({ success: false, error: error.message })
          return
        }
        resolve({ success: true, file_path: outputPath })
      })
    })
  })

  ipcMain.handle('extract-video-audio-for-transcribe', async (_, videoPath: string) => {
    return new Promise((resolve) => {
      const ffmpegPath = getFfmpegPath()
      const outputDir = getUserDataPath('audio')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const outputPath = path.join(outputDir, `audio_transcribe_${timestamp}.m4a`)

      const cmd = `"${ffmpegPath}" -i "${videoPath}" -vn -ac 1 -ar 16000 -c:a aac -b:a 32k -y "${outputPath}"`

      exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (error) => {
        if (error) {
          resolve({ success: false, error: error.message })
          return
        }
        resolve({ success: true, file_path: outputPath })
      })
    })
  })

  ipcMain.handle('extract-frame-from-video', async (_, videoPath: string) => {
    return new Promise((resolve) => {
      const ffmpegPath = getFfmpegPath()
      const outputDir = getUserDataPath('frames')
      
      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const outputPath = path.join(outputDir, `frame_${timestamp}.jpg`)
      
      console.log('[ExtractFrame] videoPath:', videoPath)
      console.log('[ExtractFrame] outputPath:', outputPath)
      
      if (!fs.existsSync(videoPath)) {
        console.log('[ExtractFrame] Video file not found:', videoPath)
        resolve({ success: false, error: '视频文件不存在' })
        return
      }
      
      const cmd = `"${ffmpegPath}" -i "${videoPath}" -vframes 1 -q:v 2 -y "${outputPath}"`
      console.log('[ExtractFrame] cmd:', cmd)
      
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          console.log('[ExtractFrame] Error:', error.message)
          console.log('[ExtractFrame] stderr:', stderr)
          resolve({ success: false, error: error.message })
          return
        }
        
        if (!fs.existsSync(outputPath)) {
          console.log('[ExtractFrame] Output file not created')
          resolve({ success: false, error: '首帧文件未生成' })
          return
        }
        
        console.log('[ExtractFrame] Success:', outputPath)
        resolve({ success: true, image_path: outputPath })
      })
    })
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
      const ffmpegPath = getFfmpegPath()
      if (!fs.existsSync(ffmpegPath)) {
        return { success: false, error: 'FFmpeg 未找到', base64: '' }
      }
      const normalizedInput = absolutePath.replace(/\\/g, '/')
      const normalizedOutput = outputPath.replace(/\\/g, '/')
      const vf = 'scale=1280:1280:force_original_aspect_ratio=decrease'
      const command = process.platform === 'win32'
        ? `"${ffmpegPath}" -y -i "${normalizedInput}" -vf "${vf}" -q:v 2 -y "${normalizedOutput}"`
        : `${ffmpegPath} -y -i '${normalizedInput}' -vf '${vf}' -q:v 2 -y '${normalizedOutput}'`
      await new Promise<void>((resolve, reject) => {
        exec(command, { maxBuffer: 10 * 1024 * 1024, encoding: 'utf8' }, (error, _stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message || '处理失败'))
            return
          }
          if (!fs.existsSync(outputPath)) {
            reject(new Error('处理失败：压缩结果未生成'))
            return
          }
          resolve()
        })
      })
      const base64 = fs.readFileSync(outputPath).toString('base64')
      return { success: true, base64 }
    } catch (error: any) {
      console.error('prepare-still-image-base64-for-llm failed:', error)
      return { success: false, error: error?.message || '处理失败', base64: '' }
    }
  })

  ipcMain.handle('add-bgm-to-video', async (_, videoPath: string, bgmPath: string, volume: number, options?: any) => {
    return new Promise((resolve) => {
      const ffmpegPath = getFfmpegPath()
      const outputDir = getUserDataPath('videos')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const outputPath = path.join(outputDir, `bgm_${timestamp}.mp4`)
      
      // Resolve BGM path if it's an asset path like /assets/bgms/xxx.mp3
      const resolvedBgmPath = resolveAssetPath(bgmPath)
      
      // Apply volume filters to both voice (original audio) and BGM
      const voiceVolume = options?.voiceVolume ?? 1
      const bgmVolumeFilter = `volume=${volume}`
      const voiceVolumeFilter = `volume=${voiceVolume}`
      const cmd = `"${ffmpegPath}" -i "${videoPath}" -i "${resolvedBgmPath}" -filter_complex "[0:a]${voiceVolumeFilter}[voice];[1:a]${bgmVolumeFilter}[bgm];[voice][bgm]amix=inputs=2:duration=first[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -y "${outputPath}"`
      
      exec(cmd, { maxBuffer: 100 * 1024 * 1024 }, (error) => {
        if (error) {
          resolve({ success: false, error: error.message })
          return
        }
        resolve({ success: true, file_path: outputPath })
      })
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
          // Combined image: single 720x1280 canvas with all titles pre-positioned
          // Scale to match video height, overlay at (0,0) or centered if aspect ratio differs
          filterComplex = `[1:v]scale=${dims?.width || 'iw'}:${dims?.height || 'ih'}[mt];[0:v][mt]overlay=0:0${enableExpr}[v1]`
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
      
      // Get fonts directory - check multiple locations in dev mode
      let fontsDir: string
      if (app.isPackaged) {
        fontsDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', 'fonts')
      } else {
        const candidates = [
          path.join(process.cwd(), 'assets', 'fonts'),
          path.join(process.cwd(), 'src', 'assets', 'fonts'),
          path.join(__dirname, '..', '..', '..', 'assets', 'fonts')
        ]
        fontsDir = candidates.find(p => fs.existsSync(p)) || candidates[0]
      }
      
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
    // Video composition with mix segments
    return { success: true, file_path: baseVideoPath }
  })

  ipcMain.handle('compose-video-with-pip-segments', async (_, baseVideoPath: string, totalDuration: number, segments: any[], mainVideoScaling?: any) => {
    // Picture-in-picture composition
    return { success: true, file_path: baseVideoPath }
  })

  ipcMain.handle('scale-main-video', async (_, videoPath: string, rect: any, bgColor: string) => {
    // Scale and position main video
    return { success: true, file_path: videoPath }
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
