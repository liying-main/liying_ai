import { ipcMain, app } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { getUserDataPath } from '../local-server'

let cachedMachineId: string | null = null

function getMachineId(): string {
  try {
    if (process.platform === 'win32') {
      const output = execSync('reg query "HKLM\\Software\\Microsoft\\Cryptography" /v MachineGuid', { encoding: 'utf-8', timeout: 5000 })
      const match = /MachineGuid\s+REG_SZ\s+([a-fA-F0-9-]+)/i.exec(output)
      if (match && match[1]) {
        return match[1].trim()
      }
    } else if (process.platform === 'darwin') {
      const output = execSync('ioreg -rd1 -c IOPlatformExpertDevice', { encoding: 'utf-8', timeout: 5000 })
      const match = /"IOPlatformUUID"\s+=\s+"([^"]+)"/i.exec(output)
      if (match && match[1]) {
        return match[1].trim()
      }
    }
  } catch (err) {
    console.error('Failed to get system hardware UUID:', err)
  }
  return ''
}

function getStableMachineId(): string {
  if (cachedMachineId) return cachedMachineId
  let id = getMachineId()
  if (!id) {
    id = crypto.randomUUID()
  }
  cachedMachineId = id
  return id
}

export function registerDeviceHandlers(): void {
  ipcMain.handle('get-device-nonce', async () => {
    return buildNonceBundle()
  })
}

function hashShort(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 32)
}

function buildNonceBundle() {
  const base = readOrCreateDeviceNonce()
  const nonce6 = readOrCreateDeviceNonce6()

  const nonce1 = base
  const nonce2 = hashShort(`${base}|D|stable`)
  const nonce3 = hashShort(`${base}|M|stable`)
  const nonce4 = hashShort(`${base}|UUID|stable`)
  const nonce5 = hashShort(`${nonce1}|${nonce2}|${nonce3}|${nonce4}`)
  return { nonce1, nonce2, nonce3, nonce4, nonce5, nonce6 }
}

function readOrCreateDeviceNonce(): string {
  const filePath = path.join(getUserDataPath(), 'device_nonce.txt')
  try {
    if (fs.existsSync(filePath)) {
      const v = fs.readFileSync(filePath, 'utf-8').trim()
      if (v) return v
    }
  } catch {}
  const nonce = getStableMachineId()
  try {
    fs.writeFileSync(filePath, nonce, 'utf-8')
  } catch {}
  return nonce
}

function readOrCreateDeviceNonce6(): string {
  const userDataDir = getUserDataPath()
  const cacheDir = path.join(userDataDir, 'ffmpeg-cache')
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })
  const videosDir = path.join(cacheDir, 'videos')
  if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true })
  const audiosDir = path.join(cacheDir, 'audios')
  if (!fs.existsSync(audiosDir)) fs.mkdirSync(audiosDir, { recursive: true })
  const imagesDir = path.join(cacheDir, 'images')
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true })

  const filePath = path.join(audiosDir, 'desc.txt')
  try {
    if (fs.existsSync(filePath)) {
      const v = fs.readFileSync(filePath, 'utf-8').trim()
      if (v) return v
    }
  } catch {}
  const nonce = hashShort(`${getStableMachineId()}|nonce6`)
  try {
    fs.writeFileSync(filePath, nonce, 'utf-8')
  } catch {}
  return nonce
}
