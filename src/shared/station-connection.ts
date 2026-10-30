export interface StationConfig {
  baseUrl: string
  apiKey: string
}

export function normalizeStationUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('请输入完整的服务地址，例如 https://api.openapi.cn/v1')
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('服务地址仅支持 HTTP/HTTPS，不能包含账号密码、查询参数或片段')
  }
  return url.toString().replace(/\/+$/, '')
}

/** 只检查模型列表与鉴权，不提交生成任务，也不替用户保存草稿。 */
export async function checkStationConnection(config: StationConfig): Promise<{ ok: boolean; message: string }> {
  const baseUrl = normalizeStationUrl(String(config?.baseUrl || ''))
  const apiKey = String(config?.apiKey || '').trim()
  if (!apiKey) return { ok: false, message: '请先填写 API Key' }
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    })
    if (!response.ok) {
      const reason = response.status === 401 || response.status === 403
        ? '请检查 API Key 和服务权限'
        : response.status === 404 ? '此服务未提供模型列表接口，请核对 Base URL' : '请稍后重试或检查服务状态'
      return { ok: false, message: `连接检查失败（HTTP ${response.status}），${reason}` }
    }
    const payload: unknown = await response.json().catch(() => null)
    if (!payload || typeof payload !== 'object' || !('data' in payload) || !Array.isArray(payload.data)) {
      return { ok: false, message: '服务响应不是兼容的模型列表，请核对 Base URL' }
    }
    return { ok: true, message: `已连接，返回 ${payload.data.length} 个模型。未提交生成任务；各项能力与可用额度以服务端为准。` }
  } catch {
    // 不回显服务器返回的任意文本，以免其中包含令牌或敏感信息。
    return { ok: false, message: '连接失败或超时，请检查地址、网络和服务状态；不支持带令牌跳转到其他地址。' }
  }
}
