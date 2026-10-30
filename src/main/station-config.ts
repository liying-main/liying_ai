/**
 * 中转站配置（主进程持有）
 *
 * 开源版没有登录，API Key 由用户在「设置 → API 配置」里填写，
 * 存在用户数据目录的 station-config.json，主进程与渲染层共用这一份。
 */
import { app, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { STATION_BASE_URL } from './station'
import { checkStationConnection, normalizeStationUrl, type StationConfig } from '../shared/station-connection'
export type { StationConfig } from '../shared/station-connection'

function configPath(): string {
  return path.join(app.getPath('userData'), 'station-config.json')
}

export function loadStationConfig(): StationConfig {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), 'utf8'))
    return {
      baseUrl: normalizeStationUrl(String(parsed?.baseUrl || STATION_BASE_URL)),
      apiKey: String(parsed?.apiKey || '').trim(),
    }
  } catch {
    return { baseUrl: STATION_BASE_URL, apiKey: '' }
  }
}

export function saveStationConfig(patch: Partial<StationConfig>): StationConfig {
  const merged: StationConfig = { ...loadStationConfig(), ...patch }
  merged.baseUrl = normalizeStationUrl(String(merged.baseUrl || STATION_BASE_URL))
  merged.apiKey = String(merged.apiKey || '').trim()
  fs.mkdirSync(path.dirname(configPath()), { recursive: true })
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2), 'utf8')
  return merged
}

export function requireStationKey(): string {
  const { apiKey } = loadStationConfig()
  if (!apiKey) {
    throw new Error('未配置 API Key，请到「设置 → API 配置」填写（在 https://api.openapi.cn 注册后创建令牌）')
  }
  return apiKey
}

export function registerStationConfigHandlers(): void {
  ipcMain.handle('station:get-config', () => loadStationConfig())
  ipcMain.handle('station:save-config', (_event, patch: Partial<StationConfig>) =>
    saveStationConfig(patch || {}),
  )
  ipcMain.handle('station:test-config', (_event, config: StationConfig) => checkStationConnection(config))
}

