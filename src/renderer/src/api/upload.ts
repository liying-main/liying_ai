import { API_BASE, ensureValidToken, getClientApiVersion } from './client'

function appVersionHeaders() {
  return { 'X-App-Version': getClientApiVersion() }
}

export class UploadService {
  async upload(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('key', file.name)
    
    const token = await ensureValidToken()
    const response = await fetch(`${API_BASE}/app/base/comm/upload`, {
      method: 'POST',
      headers: {
        ...appVersionHeaders(),
        ...(token ? { Authorization: token } : {}),
      },
      body: formData,
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: '上传失败' } }))
      throw new Error(errorData.error?.message || errorData.message || `HTTP ${response.status}: ${response.statusText}`)
    }
    
    const data = await response.json()
    if (data.code !== undefined && data.code !== 0 && data.code !== 1000) {
      throw new Error(data.message || '上传失败')
    }
    return data
  }
}

export const uploadService = new UploadService()
