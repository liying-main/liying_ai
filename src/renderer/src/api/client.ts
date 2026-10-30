/**
 * 开源版 HTTP 客户端
 *
 * 原版这里包含登录令牌、刷新令牌、VIP 到期、卡密失效跳转等一整套账号逻辑，
 * 开源版没有账号体系，全部移除；底座指向中转站。
 */
import { STATION_BASE_URL } from '../../../shared/station'

// 开源版：底座指向中转站，不再依赖私有后端
export const API_BASE = (import.meta as any).env?.VITE_API_BASE || STATION_BASE_URL

/** 兼容旧调用：开源版没有令牌 */
export async function ensureValidToken(): Promise<string | null> {
  return null
}

export function getStoredToken(): string | null {
  return null
}

export function setStoredToken(_token: string): void {
  /* 开源版没有登录 */
}

export function clearStoredToken(): void {
  /* 开源版没有登录 */
}

export function onAuthStateChange(_callback: (isLoggedIn: boolean) => void): () => void {
  return () => {}
}

export class ApiClient {
  async get(url: string, config: any = {}) {
    return this.request('GET', url, undefined, config)
  }

  async post(url: string, data?: any, config: any = {}) {
    return this.request('POST', url, data, config)
  }

  async put(url: string, data?: any, config: any = {}) {
    return this.request('PUT', url, data, config)
  }

  async delete(url: string, config: any = {}) {
    return this.request('DELETE', url, undefined, config)
  }

  private async request(method: string, url: string, data?: any, config: any = {}) {
    const response = await fetch(`${API_BASE}${url}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(config.headers || {}) },
      body: data === undefined ? undefined : JSON.stringify(data),
    })
    if (!response.ok) {
      throw new Error(`请求失败：HTTP ${response.status}`)
    }
    const payload = await response.json().catch(() => ({}))
    return { ...payload, data: payload?.data ?? payload }
  }
}

export const apiClient = new ApiClient()

