import { ipcMain, app } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { getUserDataPath } from '../local-server'

export function registerDeviceHandlers(): void {
  ipcMain.handle('get-device-nonce', async () => {
    const deviceId = getOrCreateDeviceId()
    return {
      nonce1: crypto.createHash('md5').update(deviceId + '1').digest('hex'),
      nonce2: crypto.createHash('md5').update(deviceId + '2').digest('hex'),
      nonce3: crypto.createHash('md5').update(deviceId + '3').digest('hex'),
      nonce4: crypto.createHash('md5').update(deviceId + '4').digest('hex'),
      nonce5: crypto.createHash('md5').update(deviceId + '5').digest('hex'),
      nonce6: crypto.createHash('md5').update(deviceId + '6').digest('hex')
    }
  })
}

function getOrCreateDeviceId(): string {
  const configPath = path.join(getUserDataPath(), 'device.json')
  
  if (fs.existsSync(configPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (data.deviceId) return data.deviceId
    } catch {}
  }
  
  const deviceId = crypto.randomUUID()
  fs.writeFileSync(configPath, JSON.stringify({ deviceId }), 'utf-8')
  return deviceId
}
