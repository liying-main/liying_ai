import { ipcMain, BrowserWindow, app } from 'electron'
import fs from 'fs'
import path from 'path'
import { getUserDataPath } from '../local-server'
import { API_BASE_URL } from '../api-config'
import * as OpenCC from 'opencc-js'

// Traditional to Simplified Chinese converter (only used if needed)
const t2sConverter = OpenCC.Converter({ from: 'tw', to: 'cn' })

// Resolve asset path from relative URL like /assets/voices/voice1.wav
function resolveAssetFilePath(relativePath: string): string {
  // If it's a full URL (e.g. http://127.0.0.1:51569/assets/voices/voice1.wav),
  // extract just the pathname portion so the regex below can match it.
  if (/^https?:\/\//i.test(relativePath)) {
    try {
      relativePath = new URL(relativePath).pathname
    } catch {
      // If URL parsing fails, continue with original string
    }
  }

  // Decode URL-encoded characters (e.g., %E5%96%9D%E8%8C%B6 -> 喝茶)
  let decodedPath = relativePath
  try {
    decodedPath = decodeURIComponent(relativePath)
  } catch {
    // If decoding fails, use original path
  }
  
  // Handle paths like /assets/voices/voice1.wav
  const match = decodedPath.match(/^\/assets\/([^/]+)\/(.+)$/)
  if (match) {
    const [, segment, filename] = match
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', segment, filename)
    }
    // Development: check multiple possible locations
    const candidates = [
      path.join(process.cwd(), 'assets', segment, filename),
      path.join(process.cwd(), 'src', 'assets', segment, filename),
      path.join(process.cwd(), 'app', 'assets', segment, filename),
      path.join(__dirname, '..', '..', 'assets', segment, filename),
      path.join(__dirname, '..', '..', '..', 'assets', segment, filename),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) return p
    }
    // Return first candidate even if not found (will error with clear path)
    return candidates[0]
  }
  // If already absolute path, return as-is
  if (path.isAbsolute(relativePath)) {
    return relativePath
  }
  // Otherwise try to resolve relative to cwd
  return path.resolve(process.cwd(), relativePath)
}

// API Configuration
const PLUGIN_PROXY_WHISPER_NAME = 'plugin-proxy-whisper'
const PLUGIN_PROXY_TTS2_NAME = 'plugin-proxy-tts2'
const PLUGIN_PROXY_VIDEO_NAME = 'plugin-proxy-video'

// Cancel flags management
const cancelFlags = new Map<string, boolean>()

export function setCancelFlag(pluginName: string): void {
  cancelFlags.set(pluginName, true)
}

export function clearCancelFlag(pluginName: string): void {
  cancelFlags.delete(pluginName)
}

export function consumeCancelFlag(pluginName: string): boolean {
  const v = cancelFlags.get(pluginName) === true
  if (v) cancelFlags.delete(pluginName)
  return v
}

// Session management
interface QueueSession {
  ticket: string
  proxyBase: string
  token: string
}

const sessions = new Map<string, QueueSession>()

export function registerPluginProxyQueueSession(pluginName: string, ctx: QueueSession): void {
  sessions.set(pluginName, ctx)
}

export function unregisterPluginProxyQueueSession(pluginName: string): void {
  sessions.delete(pluginName)
}

// Token management
let mainWindowRef: BrowserWindow | null = null
const RESPONSE_CHANNEL = 'plugin-token-response'
const REQUEST_CHANNEL = 'plugin-get-token-request'

export function setMainWindowForPluginToken(win: BrowserWindow): void {
  mainWindowRef = win
}

function generateRequestId(): string {
  return `token_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export function createGetToken(): () => Promise<string | null> {
  return async () => {
    const win = mainWindowRef
    if (!win?.webContents || win.isDestroyed()) {
      return null
    }
    const requestId = generateRequestId()
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ipcMain.removeListener(RESPONSE_CHANNEL, handler)
        resolve(null)
      }, 10000)
      
      const handler = (_: any, receivedId: string, token: string) => {
        if (receivedId === requestId) {
          clearTimeout(timeout)
          ipcMain.removeListener(RESPONSE_CHANNEL, handler)
          resolve(token)
        }
      }
      
      ipcMain.on(RESPONSE_CHANNEL, handler)
      win.webContents.send(REQUEST_CHANNEL, requestId)
    })
  }
}

const getToken = createGetToken()

export async function needTokenFromMain(): Promise<string> {
  const t = await getToken()
  if (!t || !String(t).trim()) {
    throw new Error('未登录')
  }
  return t
}

// Helper functions
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

declare const __APP_VERSION__: string
function getClientApiVersion(): string {
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '3.0.1'
}

function authHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: token,
    'X-App-Version': getClientApiVersion(),
    ...extra
  }
}

function assertBusinessOk(json: any, fallbackMsg: string): any {
  if (json.code !== undefined && json.code !== 0 && json.code !== 1000) {
    throw new Error(json.message || fallbackMsg)
  }
  if (json.data === undefined || json.data === null) {
    throw new Error(fallbackMsg)
  }
  return json.data
}

const HEALTH_PATH = '/healthz'

function rotate<T>(arr: T[], start: number): T[] {
  if (!arr.length) return []
  const s = start % arr.length
  return arr.slice(s).concat(arr.slice(0, s))
}

async function checkEndpointHealth(baseUrl: string, timeoutMs: number = 3000): Promise<boolean> {
  const url = `${baseUrl.replace(/\/$/, '')}${HEALTH_PATH}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const r = await fetch(url, { method: 'GET', signal: controller.signal })
    clearTimeout(timer)
    return r.ok
  } catch {
    clearTimeout(timer)
    return false
  }
}

function warnAndFallback(reason: string): null {
  console.warn(`[proxy-routing] ${reason}，不再使用硬编码回退基址`)
  return null
}

// Proxy base URL resolution
async function resolveProxyBaseUrlWithToken(apiBase: string, token: string, kind: string): Promise<string | null> {
  if (!token) {
    return null
  }
  
  const endpointType = kind
  const baseHeaders = {
    Authorization: token,
    'X-App-Version': getClientApiVersion()
  }
  const base = apiBase.replace(/\/$/, '')
  const qs = `endpointType=${encodeURIComponent(endpointType)}`
  
  let strategyRes: Response
  try {
    strategyRes = await fetch(`${base}/app/proxy/strategy/routeStrategy?${qs}`, {
      headers: baseHeaders
    })
  } catch {
    return warnAndFallback('拉取 routeStrategy 失败')
  }
  
  let strategyJson: any
  try {
    strategyJson = await strategyRes.json()
  } catch {
    return warnAndFallback('routeStrategy 响应非 JSON')
  }
  
  console.log('strategyJson', JSON.stringify(strategyJson))
  const steps = strategyJson?.data?.steps
  if (!steps?.length) {
    return warnAndFallback(`routeStrategy 无可用 steps（或未配置该 ${endpointType} 类型）`)
  }
  
  for (const step of steps) {
    if (step.mode === 'pinned' && step.pinned) {
      const b = step.pinned.baseUrl.replace(/\/$/, '')
      if (await checkEndpointHealth(b)) {
        return b
      }
      // 临时修复：健康检查失败时仍返回 pinned 端点
      console.warn('[proxy-routing] pinned 端点健康检查失败，仍使用:', b)
      return b
    }
    
    if (step.mode === 'round_robin' && step.endpoints?.length) {
      let rrJson: any
      try {
        const rrRes = await fetch(`${base}/app/proxy/strategy/nextRoundRobinStart`, {
          method: 'POST',
          headers: { ...baseHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            environmentId: step.environmentId,
            endpointType
          })
        })
        rrJson = await rrRes.json()
      } catch {
        continue
      }
      
      const startIndex = Number(rrJson?.data?.startIndex ?? 0)
      const endpoints = rrJson?.data?.endpoints || step.endpoints
      const ordered = rotate(endpoints, startIndex)
      
      for (const ep of ordered as any[]) {
        const b = (ep.baseUrl as string).replace(/\/$/, '')
        if (await checkEndpointHealth(b)) {
          return b
        }
      }
      // 临时修复：健康检查失败时返回第一个端点
      if (ordered.length > 0) {
        const firstEp = ordered[0] as { baseUrl: string }
        const b = firstEp.baseUrl.replace(/\/$/, '')
        console.warn('[proxy-routing] 健康检查失败，使用第一个端点:', b)
        return b
      }
    }
  }
  
  return warnAndFallback('策略中端点均不健康或轮询失败')
}

async function needResolvedBase(token: string, kind: string): Promise<string> {
  const b = await resolveProxyBaseUrlWithToken(API_BASE_URL, token, kind)
  console.log('needResolvedBase', b)
  if (!b) {
    throw new Error('未解析到可用插件代理地址，请检查卡密代理绑定')
  }
  return b.replace(/\/$/, '')
}

// Queue operations
interface QueueJoinResult {
  ticket: string
  proxyBase: string
}

async function pluginProxyQueueJoin(token: string, kind: string): Promise<QueueJoinResult> {
  const proxyBase = await needResolvedBase(token, kind)
  const url = `${proxyBase}/app/proxy/queue/join`

  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ endpointType: kind })
  })
  const text = await res.text()
  let json: { message?: string; code?: number; data?: any }
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`GPU节点返回非JSON（HTTP ${res.status}）：${text.slice(0, 200)}，地址=${url}`)
  }
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`)
  const out = assertBusinessOk(json, '加入排队失败')
  return { ...out, proxyBase }
}

interface QueueStatus {
  state: string
  position: number
  total: number
}

async function pluginProxyQueueStatus(token: string, proxyBase: string, ticket: string): Promise<QueueStatus> {
  const base = proxyBase.replace(/\/$/, '')
  const res = await fetch(`${base}/app/proxy/queue/status?ticket=${encodeURIComponent(ticket)}`, {
    headers: authHeaders(token)
  })
  const json = await res.json() as { message?: string; code?: number; data?: any }
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`)
  const raw = assertBusinessOk(json, '排队状态不存在')
  
  const position = Number(raw.position ?? 0)
  const total = Number(raw.total ?? 0)
  if (typeof raw.state === 'string') {
    return { state: raw.state, position, total }
  }
  if (position === 0) {
    return { state: 'active', position: 0, total }
  }
  return { state: 'waiting', position, total }
}

async function pluginProxyQueueLeave(token: string, proxyBase: string, ticket: string): Promise<void> {
  try {
    const base = proxyBase.replace(/\/$/, '')
    await fetch(`${base}/app/proxy/queue/leave`, {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ticket })
    })
  } catch {
    // Ignore errors on leave
  }
}

// Job operations
async function pluginProxyJobGet(token: string, proxyBase: string, jobId: string): Promise<any> {
  const base = proxyBase.replace(/\/$/, '')
  const res = await fetch(`${base}/app/proxy/plugins/jobs/${encodeURIComponent(jobId)}`, {
    headers: authHeaders(token)
  })
  const json = await res.json() as { message?: string; code?: number; data?: any }
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`)
  return assertBusinessOk(json, '任务不存在')
}

async function pluginProxyJobCancel(token: string, proxyBase: string, jobId: string): Promise<void> {
  const base = proxyBase.replace(/\/$/, '')
  try {
    await fetch(`${base}/app/proxy/plugins/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' })
    })
  } catch {
    // Ignore errors
  }
}

// Whisper transcription
async function pluginProxyWhisperTranscriptions(
  token: string,
  proxyBase: string,
  ticket: string,
  filePath: string,
  wordTimestamps: boolean
): Promise<{ jobId: string }> {
  const base = proxyBase.replace(/\/$/, '')
  const buf = fs.readFileSync(filePath)
  const fd = new FormData()
  fd.append('file', new Blob([buf]), path.basename(filePath))
  fd.append('word_timestamps', String(wordTimestamps))
  fd.append('language', 'zh')  // Request simplified Chinese
  
  const res = await fetch(`${base}/app/proxy/whisper/transcriptions`, {
    method: 'POST',
    headers: authHeaders(token, { 'X-Proxy-Queue-Ticket': ticket }),
    body: fd
  })
  
  if (res.status === 404) {
    throw new Error(`插件代理 404：/app/proxy/whisper/transcriptions`)
  }
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`插件代理返回非 JSON（HTTP ${res.status}）`)
  }
  if (!res.ok) {
    throw new Error(json.message || `HTTP ${res.status}`)
  }
  return assertBusinessOk(json, '未返回 jobId')
}

// Whisper align
async function pluginProxyWhisperAlign(
  token: string,
  proxyBase: string,
  ticket: string,
  filePath: string,
  subtitle: string
): Promise<{ jobId: string }> {
  const base = proxyBase.replace(/\/$/, '')
  const buf = fs.readFileSync(filePath)
  const fd = new FormData()
  fd.append('file', new Blob([buf]), path.basename(filePath))
  fd.append('subtitle', subtitle)
  
  const res = await fetch(`${base}/app/proxy/whisper/align_subtitles`, {
    method: 'POST',
    headers: authHeaders(token, { 'X-Proxy-Queue-Ticket': ticket }),
    body: fd
  })
  
  if (res.status === 404) {
    throw new Error(`插件代理 404：/app/proxy/whisper/align_subtitles`)
  }
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`插件代理返回非 JSON（HTTP ${res.status}）`)
  }
  if (!res.ok) {
    throw new Error(json.message || `HTTP ${res.status}`)
  }
  return assertBusinessOk(json, '未返回 jobId')
}

// Video run
async function pluginProxyVideoRun(
  token: string,
  proxyBase: string,
  ticket: string,
  audioPath: string,
  videoPath: string
): Promise<{ jobId: string }> {
  const base = proxyBase.replace(/\/$/, '')
  console.log('[Video] video/run request:', { base, ticket: ticket.slice(0, 8), audioPath, videoPath })
  
  const resolvedAudioPath = resolveAssetFilePath(audioPath)
  const resolvedVideoPath = resolveAssetFilePath(videoPath)
  
  if (!fs.existsSync(resolvedAudioPath)) {
    throw new Error(`音频文件不存在: ${resolvedAudioPath}`)
  }
  if (!fs.existsSync(resolvedVideoPath)) {
    throw new Error(`视频文件不存在: ${resolvedVideoPath}`)
  }
  
  const audioBuf = fs.readFileSync(resolvedAudioPath)
  const videoBuf = fs.readFileSync(resolvedVideoPath)
  const fd = new FormData()
  fd.append('audio', new Blob([audioBuf]), path.basename(audioPath))
  fd.append('video', new Blob([videoBuf]), path.basename(videoPath))
  
  const url = `${base}/app/proxy/plugins/video/run`
  console.log('[Video] fetching:', url)
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(token, { 'X-Proxy-Queue-Ticket': ticket }),
    body: fd
  })
  
  if (res.status === 404) {
    throw new Error(`插件代理 404：/app/proxy/plugins/video/run，基址=${base}`)
  }
  const text = await res.text()
  console.log('[Video] video/run response:', res.status, text.slice(0, 500))
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`插件代理返回非 JSON（HTTP ${res.status}）：${text.slice(0, 240)}… 基址=${base}`)
  }
  if (!res.ok) {
    throw new Error(json.message || `HTTP ${res.status}`)
  }
  return assertBusinessOk(json, '未返回 jobId')
}

// TTS Audio run
async function pluginProxyAudioRun(
  token: string,
  proxyBase: string,
  ticket: string,
  referencePath: string,
  params: { scriptContent: string; emotion?: string; emotionWeight?: number; speed?: number }
): Promise<{ jobId: string }> {
  const base = proxyBase.replace(/\/$/, '')
  // Resolve asset path if needed
  const resolvedPath = resolveAssetFilePath(referencePath)
  console.log('[TTS2] audio/run request:', { base, ticket: ticket.slice(0, 8), referencePath, resolvedPath })
  
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`参考音频文件不存在: ${resolvedPath}`)
  }
  
  const refBuf = fs.readFileSync(resolvedPath)
  const fd = new FormData()
  fd.append('referenceAudio', new Blob([refBuf]), path.basename(referencePath))
  fd.append('scriptContent', params.scriptContent)
  if (params.emotion != null) fd.append('emotion', params.emotion)
  if (params.emotionWeight != null) fd.append('emotionWeight', String(params.emotionWeight))
  if (params.speed != null) fd.append('speed', String(params.speed))
  
  const url = `${base}/app/proxy/plugins/audio/run`
  console.log('[TTS2] fetching:', url)
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(token, { 'X-Proxy-Queue-Ticket': ticket }),
    body: fd
  })
  
  if (res.status === 404) {
    throw new Error(`插件代理 404：/app/proxy/plugins/audio/run，基址=${base}`)
  }
  const text = await res.text()
  console.log('[TTS2] audio/run response:', res.status, text.slice(0, 500))
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`插件代理返回非 JSON（HTTP ${res.status}）：${text.slice(0, 240)}… 基址=${base}`)
  }
  if (!res.ok) {
    throw new Error(json.message || `HTTP ${res.status}`)
  }
  return assertBusinessOk(json, '未返回 jobId')
}

// Extract Whisper result
function extractWhisperResult(payload: any): { text: string; segments: any[] } | null {
  if (!payload || typeof payload !== 'object') return null
  if (typeof payload.text === 'string' && Array.isArray(payload.segments)) {
    return payload
  }
  const nested = payload.result
  if (!nested || typeof nested !== 'object') return null
  if (typeof nested.text === 'string' && Array.isArray(nested.segments)) {
    return nested
  }
  return null
}

// Wait for job completion
async function waitJobDone(
  token: string,
  proxyBase: string,
  jobId: string,
  timeoutMs: number,
  cancelPluginName: string,
  send?: SendFn
): Promise<any> {
  const startedAt = Date.now()
  let transientErrCount = 0
  let lastFetchErrMsg = ''
  
  while (true) {
    if (consumeCancelFlag(cancelPluginName)) {
      await pluginProxyJobCancel(token, proxyBase, jobId)
      throw new Error('已取消')
    }
    
    let cur
    try {
      cur = await pluginProxyJobGet(token, proxyBase, jobId)
      transientErrCount = 0
      lastFetchErrMsg = ''
    } catch (e) {
      transientErrCount += 1
      lastFetchErrMsg = e instanceof Error ? e.message : String(e)
      if (transientErrCount >= 30) {
        throw new Error(`任务状态查询失败（jobId=${jobId}）：${lastFetchErrMsg || '未知错误'}`)
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`云端任务超时（最后错误：${lastFetchErrMsg || '未知'}）`)
      }
      await sleep(1000)
      continue
    }
    
    const st = String(cur.state ?? '')
    if (send) {
      const pg = Math.max(0, Math.min(100, Number(cur.progress ?? 0)))
      send({
        pluginName: cancelPluginName,
        type: 'job_progress',
        progress: pg,
        state: st
      })
    }
    if (st === 'succeeded') return cur
    if (st === 'failed' || st === 'canceled') {
      throw new Error(`任务失败（jobId=${jobId}）：${cur.error?.message || '未知错误'}`)
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('云端任务超时')
    }
    await sleep(1000)
  }
}

// Wait for queue to become active
type SendFn = (data: any) => void

async function waitQueueActive(
  send: SendFn,
  token: string,
  proxyBase: string,
  ticket: string,
  cancelPluginName: string
): Promise<void> {
  while (true) {
    if (consumeCancelFlag(cancelPluginName)) {
      throw new Error('已取消')
    }
    const s = await pluginProxyQueueStatus(token, proxyBase, ticket)
    const pos = Number(s.position ?? 0)
    if (s.state === 'waiting') {
      send({
        pluginName: cancelPluginName,
        type: 'queue_waiting',
        position: pos,
        total: Number(s.total ?? 0)
      })
    }
    if (s.state === 'active') {
      send({ pluginName: cancelPluginName, type: 'queue_active' })
      return
    }
    await sleep(s.state === 'waiting' ? 1200 : 800)
  }
}

// Run Whisper Transcribe with Proxy
export async function runWhisperTranscribeWithProxy(
  send: SendFn,
  token: string,
  params: { audioPath: string; timeoutMs?: number }
): Promise<string> {
  const flowStartedAt = Date.now()
  clearCancelFlag(PLUGIN_PROXY_WHISPER_NAME)
  let proxyBase: string | undefined
  let ticket: string | undefined
  try {
    const queueStartedAt = Date.now()
    const joined = await pluginProxyQueueJoin(token, 'whisper')
    proxyBase = joined.proxyBase
    ticket = joined.ticket
    registerPluginProxyQueueSession(PLUGIN_PROXY_WHISPER_NAME, { ticket, proxyBase, token })
    await waitQueueActive(send, token, proxyBase, ticket, PLUGIN_PROXY_WHISPER_NAME)
    console.log('[Whisper] queue active in ms:', Date.now() - queueStartedAt)
    if (consumeCancelFlag(PLUGIN_PROXY_WHISPER_NAME)) {
      throw new Error('已取消')
    }
    
    const submitStartedAt = Date.now()
    const submit = await pluginProxyWhisperTranscriptions(token, proxyBase, ticket, params.audioPath, false)
    console.log('[Whisper] submit done in ms:', Date.now() - submitStartedAt)
    const waitStartedAt = Date.now()
    const statusData = await waitJobDone(
      token,
      proxyBase,
      submit.jobId,
      params.timeoutMs ?? 600000,
      PLUGIN_PROXY_WHISPER_NAME,
      send
    )
    console.log('[Whisper] job done in ms:', Date.now() - waitStartedAt)
    console.log('[Whisper] total flow ms:', Date.now() - flowStartedAt)
    const whisperResult = extractWhisperResult(statusData.result)
    console.log('whisperResult', JSON.stringify(whisperResult))
    
    if (whisperResult == null) throw new Error('Whisper 云端未返回转写结果')
    // Whisper already returns Simplified Chinese, no conversion needed
    const rawText = String(whisperResult.text ?? '')
    console.log('Raw text:', rawText)
    return rawText
  } finally {
    if (proxyBase && ticket) {
      try { await pluginProxyQueueLeave(token, proxyBase, ticket) } catch {}
    }
    unregisterPluginProxyQueueSession(PLUGIN_PROXY_WHISPER_NAME)
    send({ pluginName: PLUGIN_PROXY_WHISPER_NAME, type: 'queue_done' })
  }
}

// Run Whisper Align with Proxy
export async function runWhisperAlignWithProxy(
  send: SendFn,
  token: string,
  params: { audioPath: string; subtitle: string; timeoutMs?: number }
): Promise<any[]> {
  clearCancelFlag(PLUGIN_PROXY_WHISPER_NAME)
  let proxyBase: string | undefined
  let ticket: string | undefined
  try {
    const joined = await pluginProxyQueueJoin(token, 'whisper')
    proxyBase = joined.proxyBase
    ticket = joined.ticket
    registerPluginProxyQueueSession(PLUGIN_PROXY_WHISPER_NAME, { ticket, proxyBase, token })
    await waitQueueActive(send, token, proxyBase, ticket, PLUGIN_PROXY_WHISPER_NAME)
    if (consumeCancelFlag(PLUGIN_PROXY_WHISPER_NAME)) {
      throw new Error('已取消')
    }
    
    const submit = await pluginProxyWhisperAlign(token, proxyBase, ticket, params.audioPath, params.subtitle)
    const statusData = await waitJobDone(token, proxyBase, submit.jobId, params.timeoutMs ?? 600000, PLUGIN_PROXY_WHISPER_NAME)
    const whisperResult = extractWhisperResult(statusData.result)
    console.log('whisperAlignResult', JSON.stringify(whisperResult))
    
    if (!whisperResult?.segments?.length) {
      throw new Error('Whisper 云端未返回分段结果')
    }
    // Whisper already returns Simplified Chinese, no conversion needed
    const convertedSegments = whisperResult.segments.map((seg: any) => {
      const originalText = seg.text || ''
      console.log('[Whisper] Using segment:', {
        text: originalText,
        start: seg.start,
        end: seg.end
      })
      return {
        start: seg.start,
        end: seg.end,
        text: originalText,
        words: seg.words?.map((w: any) => ({ word: w.word || '', start: w.start, end: w.end }))
      }
    })
    console.log('[Whisper] First segment:', convertedSegments[0]?.text)
    return convertedSegments
  } finally {
    if (proxyBase && ticket) {
      try { await pluginProxyQueueLeave(token, proxyBase, ticket) } catch {}
    }
    unregisterPluginProxyQueueSession(PLUGIN_PROXY_WHISPER_NAME)
    send({ pluginName: PLUGIN_PROXY_WHISPER_NAME, type: 'queue_done' })
  }
}

// Run TTS2 Audio Job with Progress
export async function runTts2AudioJobWithProgress(
  send: SendFn,
  token: string,
  params: { referenceAudioPath: string; scriptContent: string; emotion?: string; emotionWeight?: number; speed?: number }
): Promise<string> {
  clearCancelFlag(PLUGIN_PROXY_TTS2_NAME)
  let proxyBase: string | undefined
  let ticket: string | undefined
  try {
    const joined = await pluginProxyQueueJoin(token, 'tts2')
    proxyBase = joined.proxyBase
    ticket = joined.ticket
    registerPluginProxyQueueSession(PLUGIN_PROXY_TTS2_NAME, { ticket, proxyBase, token })
    // Wait for queue
    while (true) {
      if (consumeCancelFlag(PLUGIN_PROXY_TTS2_NAME)) {
        throw new Error('已取消')
      }
      const s = await pluginProxyQueueStatus(token, proxyBase, ticket)
      const pos = Number(s.position ?? 0)
      if (s.state === 'waiting') {
        send({
          pluginName: PLUGIN_PROXY_TTS2_NAME,
          type: 'queue_waiting',
          position: pos,
          total: Number(s.total ?? 0)
        })
      }
      if (s.state === 'active') {
        send({ pluginName: PLUGIN_PROXY_TTS2_NAME, type: 'queue_active' })
        break
      }
      await sleep(s.state === 'waiting' ? 1200 : 800)
    }
    
    if (consumeCancelFlag(PLUGIN_PROXY_TTS2_NAME)) {
      throw new Error('已取消')
    }
    
    const submit = await pluginProxyAudioRun(token, proxyBase, ticket, params.referenceAudioPath, {
      scriptContent: params.scriptContent,
      emotion: params.emotion,
      emotionWeight: params.emotionWeight,
      speed: params.speed
    })
    const jobId = submit.jobId
    
    let lastFetchErrMsg = ''
    let transientErrCount = 0
    
    while (true) {
      if (consumeCancelFlag(PLUGIN_PROXY_TTS2_NAME)) {
        await pluginProxyJobCancel(token, proxyBase, jobId)
        throw new Error('已取消')
      }
      
      let cur
      try {
        cur = await pluginProxyJobGet(token, proxyBase, jobId)
        transientErrCount = 0
        lastFetchErrMsg = ''
      } catch (e) {
        transientErrCount += 1
        lastFetchErrMsg = e instanceof Error ? e.message : String(e)
        if (transientErrCount >= 30) {
          throw new Error(`任务状态查询失败（jobId=${jobId}）：${lastFetchErrMsg || '未知错误'}`)
        }
        await sleep(1000)
        continue
      }
      
      const st = String(cur.state ?? '')
      const pg = Math.max(0, Math.min(100, Number(cur.progress ?? 0)))
      send({
        pluginName: PLUGIN_PROXY_TTS2_NAME,
        type: 'job_progress',
        progress: pg,
        state: st
      })
      
      if (st === 'succeeded') {
        const url = cur.result?.url
        console.log('[TTS2] Job succeeded, result:', JSON.stringify(cur.result))
        if (!url) throw new Error('生成音频失败')
        console.log('[TTS2] Returning audio URL:', url)
        return url
      }
      if (st === 'failed' || st === 'canceled') {
        throw new Error(`TTS 任务失败（jobId=${jobId}）：${cur.error?.message || '未知错误'}`)
      }
      await sleep(1200)
    }
  } finally {
    if (proxyBase && ticket) {
      try { await pluginProxyQueueLeave(token, proxyBase, ticket) } catch {}
    }
    unregisterPluginProxyQueueSession(PLUGIN_PROXY_TTS2_NAME)
    send({ pluginName: PLUGIN_PROXY_TTS2_NAME, type: 'queue_done' })
  }
}

// Run Video Job with Progress
export async function runVideoJobWithProgress(
  send: SendFn,
  token: string,
  params: { audioPath: string; videoPath: string; endpointKind?: string }
): Promise<string> {
  const kind = params.endpointKind ?? 'heygem'
  clearCancelFlag(PLUGIN_PROXY_VIDEO_NAME)
  let proxyBase: string | undefined
  let ticket: string | undefined
  try {
    const joined = await pluginProxyQueueJoin(token, kind)
    proxyBase = joined.proxyBase
    ticket = joined.ticket
    registerPluginProxyQueueSession(PLUGIN_PROXY_VIDEO_NAME, { ticket, proxyBase, token })
    // Wait for queue
    while (true) {
      if (consumeCancelFlag(PLUGIN_PROXY_VIDEO_NAME)) {
        throw new Error('已取消')
      }
      const s = await pluginProxyQueueStatus(token, proxyBase, ticket)
      const pos = Number(s.position ?? 0)
      if (s.state === 'waiting') {
        send({
          pluginName: PLUGIN_PROXY_VIDEO_NAME,
          type: 'queue_waiting',
          position: pos,
          total: Number(s.total ?? 0)
        })
      }
      if (s.state === 'active') {
        send({ pluginName: PLUGIN_PROXY_VIDEO_NAME, type: 'queue_active' })
        break
      }
      await sleep(s.state === 'waiting' ? 1200 : 800)
    }
    
    if (consumeCancelFlag(PLUGIN_PROXY_VIDEO_NAME)) {
      throw new Error('已取消')
    }
    
    const submit = await pluginProxyVideoRun(token, proxyBase, ticket, params.audioPath, params.videoPath)
    const jobId = submit.jobId
    
    let lastFetchErrMsg = ''
    let transientErrCount = 0
    
    while (true) {
      if (consumeCancelFlag(PLUGIN_PROXY_VIDEO_NAME)) {
        await pluginProxyJobCancel(token, proxyBase, jobId)
        throw new Error('已取消')
      }
      
      let cur
      try {
        cur = await pluginProxyJobGet(token, proxyBase, jobId)
        transientErrCount = 0
        lastFetchErrMsg = ''
      } catch (e) {
        transientErrCount += 1
        lastFetchErrMsg = e instanceof Error ? e.message : String(e)
        if (transientErrCount >= 30) {
          throw new Error(`任务状态查询失败（jobId=${jobId}）：${lastFetchErrMsg || '未知错误'}`)
        }
        await sleep(1000)
        continue
      }
      
      const st = String(cur.state ?? '')
      const pg = Math.max(0, Math.min(100, Number(cur.progress ?? 0)))
      send({
        pluginName: PLUGIN_PROXY_VIDEO_NAME,
        type: 'job_progress',
        progress: pg,
        state: st
      })
      
      if (st === 'succeeded') {
        const url = cur.result?.url
        console.log('[Video] Job succeeded, result:', JSON.stringify(cur.result))
        if (!url) throw new Error('生成视频失败')
        console.log('[Video] Returning video URL:', url)
        return url
      }
      if (st === 'failed' || st === 'canceled') {
        throw new Error(`视频任务失败（jobId=${jobId}）：${cur.error?.message || '未知错误'}`)
      }
      await sleep(1200)
    }
  } finally {
    if (proxyBase && ticket) {
      try { await pluginProxyQueueLeave(token, proxyBase, ticket) } catch {}
    }
    unregisterPluginProxyQueueSession(PLUGIN_PROXY_VIDEO_NAME)
    send({ pluginName: PLUGIN_PROXY_VIDEO_NAME, type: 'queue_done' })
  }
}

// Abandon all queues
const PROXY_PROGRESS_NAMES = ['plugin-proxy-tts2', 'plugin-proxy-video', 'plugin-proxy-whisper']
const SANDBOX_QUEUE_PLUGIN_NAMES = ['transcribe', 'text-to-audio', 'video-generate', 'tts-with-emotion']

function broadcastQueueDoneClearUi(win: BrowserWindow | null): void {
  if (!win?.webContents || win.isDestroyed() || win.webContents.isDestroyed()) return
  for (const pluginName of PROXY_PROGRESS_NAMES) {
    try {
      win.webContents.send('plugin-proxy-progress', { pluginName, type: 'queue_done' })
    } catch {
      // Ignore
    }
  }
  for (const pluginName of SANDBOX_QUEUE_PLUGIN_NAMES) {
    try {
      win.webContents.send('plugin-progress', { pluginName, type: 'queue_done' })
    } catch {
      // Ignore
    }
  }
}

export async function abandonClientPluginQueues(): Promise<void> {
  for (const n of PROXY_PROGRESS_NAMES) setCancelFlag(n)
  for (const n of SANDBOX_QUEUE_PLUGIN_NAMES) setCancelFlag(n)
  
  const snapshot = [...sessions.entries()]
  sessions.clear()
  
  await Promise.allSettled(
    snapshot.map(([, { token, proxyBase, ticket }]) => pluginProxyQueueLeave(token, proxyBase, ticket))
  )
  
  broadcastQueueDoneClearUi(mainWindowRef)
}

// Register IPC handlers
export function registerPluginProxyHandlers(): void {
  ipcMain.handle('plugin-proxy-abandon-queues', () => abandonClientPluginQueues())
  
  ipcMain.handle('plugin-proxy-tts2-run', async (event, params: any) => {
    const token = await needTokenFromMain()
    return runTts2AudioJobWithProgress(
      (data) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('plugin-proxy-progress', data)
        }
      },
      token,
      params
    )
  })
  
  ipcMain.handle('plugin-proxy-whisper-align-run', async (event, params: any) => {
    const token = await needTokenFromMain()
    return runWhisperAlignWithProxy(
      (data) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('plugin-proxy-progress', data)
        }
      },
      token,
      params
    )
  })
  
  ipcMain.handle('plugin-proxy-whisper-transcribe-run', async (event, params: any) => {
    const token = await needTokenFromMain()
    return runWhisperTranscribeWithProxy(
      (data) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('plugin-proxy-progress', data)
        }
      },
      token,
      params
    )
  })
  
  ipcMain.handle('plugin-proxy-video-job-run', async (event, params: any) => {
    const token = await needTokenFromMain()
    return runVideoJobWithProgress(
      (data) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('plugin-proxy-progress', data)
        }
      },
      token,
      params
    )
  })
}
