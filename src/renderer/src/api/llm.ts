/**
 * 开源版：文案生成直连中转站（OpenAI 兼容 /v1/chat/completions）。
 *
 * 原来的 /app/llm/info/* 系列端点属于私有后端，已全部移除。
 * 图片理解（describe-image）与向量化（embedding）在中转站暂无对应模型，
 * 调用时直接返回明确错误，界面侧应隐藏入口。
 */
import {
  STATION_BASE_URL,
  STATION_CHAT_MODEL,
} from '../../../shared/station'

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface CompletionOptions {
  temperature?: number
  top_p?: number
  max_tokens?: number
  stream?: boolean
}

interface CompletionResponse {
  choices: { message: { content: string } }[]
}

function extractContent(payload: any): string | null {
  const content =
    payload?.choices?.[0]?.message?.content ??
    payload?.choices?.[0]?.delta?.content ??
    payload?.content ??
    payload?.data?.content
  return typeof content === 'string' && content.trim() ? content.trim() : null
}

function errorMessage(payload: any, fallback: string): string {
  const error = payload?.error
  if (typeof error === 'string' && error.trim()) return error.trim()
  if (typeof error?.message === 'string' && error.message.trim()) return error.message.trim()
  if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message.trim()
  return fallback
}

async function stationEndpoint(): Promise<{ base: string; key: string }> {
  const config = await (window as any).api?.getStationConfig?.()
  const base = String(config?.baseUrl || STATION_BASE_URL).replace(/\/+$/, '')
  const key = String(config?.apiKey || '').trim()
  if (!key) {
    throw new Error('未配置 API Key，请到「设置 → API 配置」填写（在 https://api.openapi.cn 注册后创建令牌）')
  }
  return { base, key }
}

export const llmService = {
  async completion(
    _model: string,
    messages: Message[],
    options: CompletionOptions = {},
  ): Promise<CompletionResponse> {
    const { base, key } = await stationEndpoint()
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: STATION_CHAT_MODEL,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 2000,
      }),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(errorMessage(payload, `请求失败：HTTP ${response.status}`))
    }
    const content = extractContent(payload)
    if (!content) throw new Error('模型未返回有效内容')
    return { choices: [{ message: { content } }] }
  },

  /** 流式输出：逐段回调，返回完整文本 */
  async streamCompletion(
    _model: string,
    messages: Message[],
    onChunk: (chunk: string) => void,
    options: CompletionOptions = {},
  ): Promise<string> {
    let full = ''
    const { base, key } = await stationEndpoint()
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: STATION_CHAT_MODEL,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 2000,
        stream: true,
      }),
    })

    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => null)
      throw new Error(errorMessage(payload, `请求失败：HTTP ${response.status}`))
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (!data || data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          const piece = parsed?.choices?.[0]?.delta?.content
          if (typeof piece === 'string' && piece) {
            full += piece
            onChunk(piece)
          }
        } catch {
          /* 忽略无法解析的分片 */
        }
      }
    }
    return full
  },

  /** 开源版：中转站暂无多模态模型 */
  async describeImageFromBase64(_base64: string): Promise<never> {
    throw new Error('当前底座暂不支持图片理解')
  },

  /** 开源版：中转站暂无 embedding 模型 */
  async getTextEmbedding(_text: string): Promise<never> {
    throw new Error('当前底座暂不支持文本向量化')
  },
}
