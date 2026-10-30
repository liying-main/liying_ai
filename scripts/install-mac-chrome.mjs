/**
 * 下载并安装正确架构的 Chrome for Testing（mac-arm64 / mac-x64）。
 * Intel Mac 必须使用 x86_64 版 Chrome，不能把 arm64 版复制到 mac-x64。
 *
 * 用法:
 *   node scripts/install-mac-chrome.mjs arm64
 *   node scripts/install-mac-chrome.mjs x64
 *   node scripts/install-mac-chrome.mjs all
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  validateMacChromeFolder,
  resolveChromeFrameworkBinary,
} from './mac-chrome-arch.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const chromeDir = path.join(repoRoot, 'chrome')

function run(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { cwd: repoRoot }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message))
        return
      }
      resolve(stdout)
    })
  })
}

function findInstalledApp(tmpRoot, platformFolder) {
  const base = path.join(tmpRoot, 'chrome')
  if (!fs.existsSync(base)) return null
  for (const entry of fs.readdirSync(base)) {
    if (!entry.startsWith(platformFolder)) continue
    const app = path.join(base, entry, 'chrome-mac-arm64', 'Google Chrome for Testing.app')
    const appX64 = path.join(base, entry, 'chrome-mac-x64', 'Google Chrome for Testing.app')
    if (fs.existsSync(app)) return app
    if (fs.existsSync(appX64)) return appX64
    const direct = path.join(base, entry, 'Google Chrome for Testing.app')
    if (fs.existsSync(direct)) return direct
  }
  return null
}

async function installArch(macArch) {
  const puppeteerPlatform = macArch === 'arm64' ? 'mac_arm64' : 'mac'
  const platformFolder = macArch === 'arm64' ? 'mac_arm64' : 'mac'
  const tmpRoot = path.join(repoRoot, 'tool-zips', '.chrome-install', macArch)
  const targetDir = path.join(chromeDir, `mac-${macArch}`)

  console.log(`[install-mac-chrome] Downloading Chrome for Testing (${macArch}, platform=${puppeteerPlatform})...`)
  await rm(tmpRoot, { recursive: true, force: true })
  await mkdir(tmpRoot, { recursive: true })

  await run('npx', [
    '@puppeteer/browsers',
    'install',
    'chrome@stable',
    `--platform=${puppeteerPlatform}`,
    `--path=${tmpRoot}`,
  ])

  const appPath = findInstalledApp(tmpRoot, platformFolder)
  if (!appPath) {
    throw new Error(`下载完成但未找到 Google Chrome for Testing.app (${macArch})`)
  }

  await rm(targetDir, { recursive: true, force: true })
  await mkdir(path.dirname(targetDir), { recursive: true })
  fs.cpSync(appPath, path.join(targetDir, 'Google Chrome for Testing.app'), { recursive: true })

  const bin = path.join(
    targetDir,
    'Google Chrome for Testing.app',
    'Contents',
    'MacOS',
    'Google Chrome for Testing'
  )
  if (fs.existsSync(bin)) fs.chmodSync(bin, 0o755)

  const check = validateMacChromeFolder(chromeDir, macArch)
  if (!check.ok) throw new Error(check.message)

  const fw = resolveChromeFrameworkBinary(chromeDir, macArch)
  console.log(`[install-mac-chrome] OK mac-${macArch}: ${fw}`)
}

async function main() {
  const arg = (process.argv[2] || 'all').toLowerCase()
  const arches =
    arg === 'all' ? ['arm64', 'x64'] : arg === 'intel' ? ['x64'] : [arg === 'x64' || arg === 'arm64' ? arg : null]

  if (!arches[0]) {
    console.error('用法: node scripts/install-mac-chrome.mjs [arm64|x64|all]')
    process.exit(1)
  }

  for (const macArch of arches) {
    await installArch(macArch)
  }

  console.log('\n[install-mac-chrome] 完成。Intel Mac 包请确认 chrome/mac-x64 为 x86_64 后再打包。')
}

main().catch((error) => {
  console.error(`[install-mac-chrome] ${error.message || error}`)
  process.exit(1)
})
