/**
 * 本地资源管理（开源版）
 *
 * 原版会从私有 OSS 拉取 resource-manifest.json 并下载模型/工具包；
 * 开源版全部改为读本地 resources 目录，不再有任何云端请求。
 *
 * 目录约定：
 *   - 打包后：<安装目录>/resources/resources
 *   - 开发时：<仓库根>/resources
 */
import { app, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export type ResourceProgress = {
  status: 'idle' | 'checking' | 'downloading' | 'extracting' | 'done' | 'error'
  label?: string
  index?: number
  total?: number
  percent?: number
  transferred?: number
  totalBytes?: number
  message?: string
}

/** 本地资源根目录 */
export function getCloudResourcesDir(): string {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'resources')
    : path.join(process.cwd(), 'resources')
  try {
    fs.mkdirSync(base, { recursive: true })
  } catch {
    /* ignore */
  }
  return base
}

/** 开源版本地资源始终视为就绪（缺失的素材由用户自行放入 resources 目录） */
export function isCloudResourcesReady(): boolean {
  return true
}

export async function ensureCloudResources(_options: { onProgress?: (p: ResourceProgress) => void } = {}) {
  const dir = getCloudResourcesDir()
  _options.onProgress?.({
    status: 'done',
    percent: 100,
    label: '本地资源',
    message: `使用本地资源目录：${dir}`,
  })
  return { success: true as const }
}

export function startCloudResourceSync(): void {
  /* 开源版没有云端同步 */
}

export function registerResourceHandlers(): void {
  ipcMain.handle('ensure-cloud-resources', async () => ensureCloudResources())
  ipcMain.handle('is-cloud-resources-ready', async () => isCloudResourcesReady())
  ipcMain.handle('get-cloud-resources-dir', async () => getCloudResourcesDir())
}

