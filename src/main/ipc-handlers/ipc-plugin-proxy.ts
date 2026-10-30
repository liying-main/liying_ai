/**
 * AI 能力代理（开源版）
 *
 * 原版这里实现的是私有后端的排队协议（join → status → submit → poll）与票据鉴权。
 * 开源版整段替换为直连中转站：
 *   - 配音：POST /v1/audio/speech          （indextts2-v1，零样本音色克隆）
 *   - 转写：POST /v1/audio/transcriptions  （whisper-large-v3-turbo）
 *   - 数字人：POST /v1/videos → 轮询 → GET /v1/videos/{id}/content （duix-avatar-v1）
 *
 * 对外仍返回本地文件 URL，渲染层无需改动。
 */
import { BrowserWindow, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { getLocalFileUrl, getUserDataPath } from '../local-server'
import { loadStationConfig, registerStationConfigHandlers, requireStationKey } from '../station-config'
import {
  STATION_ASR_MODEL,
  STATION_AVATAR_MODEL,
  STATION_TTS_MODEL,
} from '../station'

type SendFn = (data: any) => void

const PLUGIN_PROXY_TTS2_NAME = 'plugin-proxy-tts2'
const PLUGIN_PROXY_VIDEO_NAME = 'plugin-proxy-video'
const PLUGIN_PROXY_WHISPER_NAME = 'plugin-proxy-whisper'

const POLL_INTERVAL_MS = 6000
const POLL_TIMEOUT_MS = 30 * 60 * 1000

/* --------------------------------------------------------------- 取消控制 */
const cancelFlags = new Map<string, boolean>()

export function setCancelFlag(pluginName: string): void {
  cancelFlags.set(pluginName, true)
}
export function clearCancelFlag(pluginName: string): void {
  cancelFlags.delete(pluginName)
}
export function consumeCancelFlag(pluginName: string): boolean {
  const value = cancelFlags.get(pluginName) === true
  if (value) cancelFlags.delete(pluginName)
  return value
}

/* ------------------------------------------- 兼容原版签名（开源版不再需要） */
export function setMainWindowForPluginToken(_win: BrowserWindow): void {
  /* 开源版没有登录令牌 */
}
export async function needTokenFromMain(): Promise<string> {
  return ''
}
export async function abandonClientPluginQueues(): Promise<void> {
  cancelFlags.clear()
}
export function registerPluginProxyQueueSession(): void {
  /* 开源版没有排队会话 */
}
export function unregisterPluginProxyQueueSession(): void {
  /* 开源版没有排队会话 */
}
export function createGetToken(): () => Promise<string | null> {
  return async () => null
}

/* ------------------------------------------------------------- 工具函数 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function resultsDir(): string {
  return getUserDataPath('plugin-results')
}

function timestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function stationUrl(pathname: string): string {
  return `${loadStationConfig().baseUrl}${pathname}`
}

async function stationError(response: Response, fallback: string): Promise<Error> {
  const text = await response.text().catch(() => '')
  let message = text
  try {
    const parsed = JSON.parse(text)
    message = parsed?.error?.message || parsed?.message || text
  } catch {
    /* 非 JSON */
  }
  if (response.status === 503 && String(message).includes('No available channel')) {
    return new Error('中转站返回 503：当前令牌分组没有该模型的可用渠道，请到 api.openapi.cn 检查令牌分组')
  }
  if (response.status === 401) return new Error('中转站返回 401：API Key 无效或已过期')
  return new Error(`${fallback}：HTTP ${response.status} ${String(message).slice(0, 200)}`)
}

/** 把本地参考音频转成 data URI，供 /v1/audio/speech 的 voice 字段使用 */
function referenceAudioToDataUri(filePath: string): string {
  if (/^(https?:|data:)/i.test(filePath)) return filePath
  if (!fs.existsSync(filePath)) throw new Error(`参考音频不存在：${filePath}`)
  const ext = path.extname(filePath).toLowerCase()
  const mime =
    ext === '.wav' ? 'audio/wav'
      : ext === '.m4a' ? 'audio/mp4'
        : ext === '.aac' ? 'audio/aac'
          : ext === '.flac' ? 'audio/flac'
            : ext === '.ogg' ? 'audio/ogg' : 'audio/mpeg'
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`
}

function fileBlob(filePath: string): Blob {
  return new Blob([fs.readFileSync(filePath)])
}

/* ------------------------------------------------------------------ 配音 */
export async function runTts2AudioJobWithProgress(
  send: SendFn,
  _token: string,
  params: { referenceAudioPath: string; scriptContent: string; speed?: number },
): Promise<string> {
  clearCancelFlag(PLUGIN_PROXY_TTS2_NAME)
  const apiKey = requireStationKey()
  if (!params?.scriptContent?.trim()) throw new Error('配音文本为空')
  if (!params?.referenceAudioPath) throw new Error('请先选择参考音频（3-10 秒人声）')

  send({ pluginName: PLUGIN_PROXY_TTS2_NAME, type: 'queue_active' })
  send({ pluginName: PLUGIN_PROXY_TTS2_NAME, type: 'job_progress', progress: 10, state: 'uploading' })

  const response = await fetch(stationUrl('/audio/speech'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: STATION_TTS_MODEL,
      input: params.scriptContent,
      voice: referenceAudioToDataUri(params.referenceAudioPath),
      response_format: 'mp3',
      speed: params.speed ?? 1.0,
    }),
  })
  if (!response.ok) throw await stationError(response, '配音失败')

  send({ pluginName: PLUGIN_PROXY_TTS2_NAME, type: 'job_progress', progress: 70, state: 'downloading' })
  const buffer = Buffer.from(await response.arrayBuffer())
  const filePath = path.join(resultsDir(), `tts-${timestamp()}.mp3`)
  fs.writeFileSync(filePath, buffer)

  const url = getLocalFileUrl(filePath)
  if (!url) throw new Error('本地文件服务未启动，无法返回音频地址')
  send({ pluginName: PLUGIN_PROXY_TTS2_NAME, type: 'job_progress', progress: 100, state: 'succeeded' })
  send({ pluginName: PLUGIN_PROXY_TTS2_NAME, type: 'queue_done' })
  return url
}

/* ---------------------------------------------------------------- 转写 */
export async function runWhisperTranscribeWithProxy(
  send: SendFn,
  _token: string,
  params: { audioPath: string; language?: string; responseFormat?: string },
): Promise<string> {
  clearCancelFlag(PLUGIN_PROXY_WHISPER_NAME)
  const apiKey = requireStationKey()
  if (!params?.audioPath || !fs.existsSync(params.audioPath)) {
    throw new Error(`音频文件不存在：${params?.audioPath || ''}`)
  }

  send({ pluginName: PLUGIN_PROXY_WHISPER_NAME, type: 'queue_active' })
  send({ pluginName: PLUGIN_PROXY_WHISPER_NAME, type: 'job_progress', progress: 20, state: 'uploading' })

  const form = new FormData()
  form.append('model', STATION_ASR_MODEL)
  form.append('language', params.language || 'zh')
  form.append('response_format', params.responseFormat || 'json')
  form.append('file', fileBlob(params.audioPath), path.basename(params.audioPath))

  const response = await fetch(stationUrl('/audio/transcriptions'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!response.ok) throw await stationError(response, '语音识别失败')

  const payload: any = await response.json().catch(() => null)
  const text = String(payload?.text || '').trim()
  send({ pluginName: PLUGIN_PROXY_WHISPER_NAME, type: 'job_progress', progress: 100, state: 'succeeded' })
  send({ pluginName: PLUGIN_PROXY_WHISPER_NAME, type: 'queue_done' })
  return text
}

/** 字词级对齐：开源版暂不支持，返回空结果由上层按均分处理 */
export async function runWhisperAlignWithProxy(
  _send: SendFn,
  _token: string,
  _params: any,
): Promise<any[]> {
  return []
}

/* -------------------------------------------------------------- 数字人 */
export async function runVideoJobWithProgress(
  send: SendFn,
  _token: string,
  params: { audioPath: string; videoPath: string; endpointKind?: string },
): Promise<string> {
  clearCancelFlag(PLUGIN_PROXY_VIDEO_NAME)
  const apiKey = requireStationKey()
  if (!params?.videoPath || !fs.existsSync(params.videoPath)) {
    throw new Error(`人像素材不存在：${params?.videoPath || ''}`)
  }
  if (!params?.audioPath || !fs.existsSync(params.audioPath)) {
    throw new Error(`驱动音频不存在：${params?.audioPath || ''}`)
  }

  send({ pluginName: PLUGIN_PROXY_VIDEO_NAME, type: 'queue_active' })
  send({ pluginName: PLUGIN_PROXY_VIDEO_NAME, type: 'job_progress', progress: 8, state: 'uploading' })

  const form = new FormData()
  form.append('model', STATION_AVATAR_MODEL)
  form.append('video', fileBlob(params.videoPath), path.basename(params.videoPath))
  form.append('audio', fileBlob(params.audioPath), path.basename(params.audioPath))

  // 提交接口会等 GPU 空闲（排队），耗时可能到十几分钟
  const submit = await fetch(stationUrl('/videos'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
  })
  if (!submit.ok) throw await stationError(submit, '数字人任务提交失败')

  const task: any = await submit.json().catch(() => null)
  const taskId = String(task?.id || task?.task_id || '')
  if (!taskId) throw new Error(`数字人任务提交失败：${JSON.stringify(task).slice(0, 200)}`)
  send({ pluginName: PLUGIN_PROXY_VIDEO_NAME, type: 'job_progress', progress: 15, state: 'submitted' })

  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (consumeCancelFlag(PLUGIN_PROXY_VIDEO_NAME)) throw new Error('已取消')
    await sleep(POLL_INTERVAL_MS)

    const query = await fetch(stationUrl(`/videos/${encodeURIComponent(taskId)}`), {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!query.ok) continue
    const state: any = await query.json().catch(() => null)
    const status = String(state?.status || '').toLowerCase()
    const progress = Number(state?.progress || 0)
    send({
      pluginName: PLUGIN_PROXY_VIDEO_NAME,
      type: 'job_progress',
      progress: 15 + Math.min(80, Math.max(0, progress) * 0.8),
      state: status || 'processing',
    })
    if (['succeeded', 'success', 'completed'].includes(status)) break
    if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
      const detail = state?.error?.message || state?.error || state?.message || status
      throw new Error(`数字人任务失败：${detail}`)
    }
  }

  // 任务完成后立刻下载：任务记录不长期保留，延迟下载会 404
  send({ pluginName: PLUGIN_PROXY_VIDEO_NAME, type: 'job_progress', progress: 95, state: 'downloading' })
  const content = await fetch(stationUrl(`/videos/${encodeURIComponent(taskId)}/content`), {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15 * 60 * 1000),
  })
  if (!content.ok) throw await stationError(content, '下载成片失败')

  const buffer = Buffer.from(await content.arrayBuffer())
  const filePath = path.join(resultsDir(), `avatar-${timestamp()}.mp4`)
  fs.writeFileSync(filePath, buffer)

  const url = getLocalFileUrl(filePath)
  if (!url) throw new Error('本地文件服务未启动，无法返回视频地址')
  send({ pluginName: PLUGIN_PROXY_VIDEO_NAME, type: 'job_progress', progress: 100, state: 'succeeded' })
  send({ pluginName: PLUGIN_PROXY_VIDEO_NAME, type: 'queue_done' })
  return url
}

/* ----------------------------------------------------------- IPC 注册 */
export function registerPluginProxyHandlers(): void {
  registerStationConfigHandlers()

  ipcMain.handle('plugin-proxy-abandon-queues', () => abandonClientPluginQueues())

  const forward = (channel: string, runner: (send: SendFn, params: any) => Promise<any>) => {
    ipcMain.handle(channel, async (event, params: any) => {
      const send: SendFn = (data) => {
        if (!event.sender.isDestroyed()) event.sender.send('plugin-proxy-progress', data)
      }
      return runner(send, params)
    })
  }

  forward('plugin-proxy-tts2-run', (send, params) =>
    runTts2AudioJobWithProgress(send, '', params))
  forward('plugin-proxy-whisper-align-run', (send, params) =>
    runWhisperAlignWithProxy(send, '', params))
  forward('plugin-proxy-whisper-transcribe-run', (send, params) =>
    runWhisperTranscribeWithProxy(send, '', params))
  forward('plugin-proxy-video-job-run', (send, params) =>
    runVideoJobWithProgress(send, '', params))
}

