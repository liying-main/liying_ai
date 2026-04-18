import express from 'express'
import cors from 'cors'
import { app } from 'electron'
import { join } from 'path'
import fs from 'fs'

let localFileServer: express.Express | null = null
let localFileServerPort = 0
let appDataBaseDir = ''
let assetsBaseDir = ''

export function getUserDataPath(subPath = ''): string {
  const userDataDir = app.getPath('userData')
  const appDataDir = join(userDataDir, 'app-data2')
  
  if (!fs.existsSync(appDataDir)) {
    fs.mkdirSync(appDataDir, { recursive: true })
  }
  
  if (!subPath) return appDataDir
  
  const fullPath = join(appDataDir, subPath)
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true })
  }
  
  return fullPath
}

export function getLocalFileUrl(filePath: string): string | null {
  if (!localFileServer || localFileServerPort === 0) return null
  
  const normalizedFilePath = require('path').resolve(filePath)
  const appDataDir = getUserDataPath()
  const normalizedAppDataDir = require('path').resolve(appDataDir)
  
  // Check if file is in app-data directory
  if (normalizedFilePath.startsWith(normalizedAppDataDir + require('path').sep)) {
    const relativePath = normalizedFilePath.slice(normalizedAppDataDir.length + 1)
    const urlPath = relativePath.split(require('path').sep).join('/')
    return `http://127.0.0.1:${localFileServerPort}/app-data2/${urlPath}`
  }
  
  // Check if file is in assets directory
  const normalizedAssetsDir = require('path').resolve(assetsBaseDir)
  if (normalizedFilePath.startsWith(normalizedAssetsDir + require('path').sep)) {
    const relativePath = normalizedFilePath.slice(normalizedAssetsDir.length + 1)
    const urlPath = relativePath.split(require('path').sep).join('/')
    return `http://127.0.0.1:${localFileServerPort}/assets/${urlPath}`
  }
  
  return null
}

export function getLocalServerBaseUrl(): string {
  if (localFileServerPort === 0) return ''
  return `http://127.0.0.1:${localFileServerPort}`
}

export function startLocalFileServer(): void {
  if (localFileServer) return
  
  const userDataDir = app.getPath('userData')
  appDataBaseDir = join(userDataDir, 'app-data2')
  
  if (!fs.existsSync(appDataBaseDir)) {
    fs.mkdirSync(appDataBaseDir, { recursive: true })
  }
  
  if (app.isPackaged) {
    assetsBaseDir = join(process.resourcesPath, 'app.asar.unpacked', 'assets')
  } else {
    assetsBaseDir = join(process.cwd(), 'assets')
  }
  
  const expressApp = express()
  expressApp.use(cors())
  expressApp.use('/app-data2', express.static(appDataBaseDir))
  expressApp.use('/assets', express.static(assetsBaseDir))
  
  // Error handler to suppress RangeNotSatisfiableError
  expressApp.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err.status === 416 || err.name === 'RangeNotSatisfiableError') {
      // Ignore range errors silently
      res.status(416).end()
      return
    }
    next(err)
  })
  
  const server = expressApp.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (address && typeof address === 'object') {
      localFileServerPort = address.port
      console.log(`Local file server started on http://127.0.0.1:${localFileServerPort}`)
    }
  })
  
  localFileServer = expressApp
}
