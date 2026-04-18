export const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://47.105.45.25:8001'

// Stub auth functions (no-op, no backend auth)
export function getStoredToken(): string | null { return null }
export function setStoredToken(_token: string): void {}
export function clearStoredToken(): void {}
export function setRefreshToken(_token: string): void {}
export function onAuthStateChange(_cb: (isLoggedIn: boolean) => void): () => void { return () => {} }
export function getAuthRedirectMessage(): string | null { return null }
export function setRefreshTokenHandler(_handler: (refreshToken: string) => Promise<any>): void {}
export async function ensureValidToken(): Promise<string | null> { return null }

declare const __APP_VERSION__: string
export function getClientApiVersion(): string {
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '3.0.1'
}

function appVersionHeaders(): Record<string, string> {
  return { 'X-App-Version': getClientApiVersion() }
}

export class ApiClient {
  async request<T = any>(url: string, config: RequestInit & { skipAuth?: boolean; skipRefresh?: boolean } = {}): Promise<T> {
    const { skipAuth = false, skipRefresh = false, headers = {}, ...restConfig } = config

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(headers as Record<string, string>),
      ...appVersionHeaders()
    }

    const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`
    
    const response = await fetch(fullUrl, { ...restConfig, headers: requestHeaders })
    const data = await response.json()

    if (data.code !== undefined && data.code !== 0 && data.code !== 1000) {
      throw new Error(data.message || '请求失败')
    }

    return data
  }

  async get<T = any>(url: string, config?: RequestInit & { skipAuth?: boolean }): Promise<T> {
    return this.request<T>(url, { ...config, method: 'GET' })
  }

  async post<T = any>(url: string, data?: any, config?: RequestInit & { skipAuth?: boolean }): Promise<T> {
    return this.request<T>(url, {
      ...config,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined
    })
  }

  async put<T = any>(url: string, data?: any, config?: RequestInit & { skipAuth?: boolean }): Promise<T> {
    return this.request<T>(url, {
      ...config,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined
    })
  }

  async delete<T = any>(url: string, config?: RequestInit & { skipAuth?: boolean }): Promise<T> {
    return this.request<T>(url, { ...config, method: 'DELETE' })
  }
}

export const apiClient = new ApiClient()
