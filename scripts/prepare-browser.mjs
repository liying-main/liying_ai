import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

// Use this fixed unbranded distribution, independent of Playwright's cache.
// Newer Playwright versions download Google Chrome for Testing under the same
// API name; do not replace this source with chromium.executablePath().
const browserVersion = '141.0.7390.37'
const revision = '1194'
const sourceUrl = 'https://cdn.playwright.dev/dbazure/download/playwright/builds/chromium/1194/chromium-win64.zip'
const archiveSha256 = 'bc65aed7bded748e267bd4d5d21f19459fa6e47464370a923fb6d87ebb22d7fb'
const licenseUrl = 'https://raw.githubusercontent.com/chromium/chromium/141.0.7390.37/LICENSE'
const licenseSha256 = '368cca1106be99d39ecd32a38d8305585d802a475effb66380b91ffc9bcf709b'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const destination = path.join(root, 'chrome')
const args = process.argv.slice(2)
const options = {}
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--help' || args[i] === '--verify') options[args[i]] = true
  else if (['--archive', '--license'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) options[args[i]] = path.resolve(args[++i])
  else throw new Error(`Unknown or incomplete argument: ${args[i]}`)
}
if (options['--help']) {
  console.log('Usage: node scripts/prepare-browser.mjs [--archive chromium-win64.zip] [--license Chromium-LICENSE]\n       node scripts/prepare-browser.mjs --verify\nPrepares fixed unbranded Chromium 141.0.7390.37 (revision 1194), preserving all files and exporting chrome://credits. Windows x64 only. Existing chrome/ is never overwritten.')
  process.exit(0)
}
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This fixed distribution supports Windows x64 only. See README for other platforms.')

async function sha256(file) {
  const hash = createHash('sha256')
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}
async function checked(file, expected) {
  if (await sha256(file) !== expected) throw new Error(`SHA-256 mismatch: ${file}`)
}
async function download(url, file) {
  console.log(`[prepare-browser] Downloading ${url}`)
  const response = await fetch(url, { signal: AbortSignal.timeout(600_000) })
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`)
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(file, { flags: 'wx' }))
}
function powershell(script, env = {}) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from("$ProgressPreference='SilentlyContinue'; " + script, 'utf16le').toString('base64')], {
    encoding: 'utf8', windowsHide: true, env: { ...process.env, ...env }, maxBuffer: 1024 * 1024
  }).trim()
}
async function verify(directory, withNotices = true) {
  for (const name of ['chrome.exe', 'chrome.dll', 'chrome_elf.dll', 'resources.pak', 'icudtl.dat', 'locales/en-US.pak']) {
    if (!fs.statSync(path.join(directory, name)).isFile()) throw new Error(`Missing browser resource: ${name}`)
  }
  const metadata = JSON.parse(powershell("$ErrorActionPreference='Stop'; $v=(Get-Item -LiteralPath $env:LIYING_BROWSER_EXE).VersionInfo; @{name=$v.ProductName; version=$v.ProductVersion; company=$v.CompanyName} | ConvertTo-Json -Compress", { LIYING_BROWSER_EXE: path.join(directory, 'chrome.exe') }))
  if (metadata.name !== 'Chromium' || metadata.version !== browserVersion || metadata.company !== 'The Chromium Authors') throw new Error(`Unexpected browser branding/version: ${JSON.stringify(metadata)}`)
  if (withNotices) {
    await checked(path.join(directory, 'LICENSE'), licenseSha256)
    const credits = fs.readFileSync(path.join(directory, 'THIRD_PARTY_LICENSES.html'), 'utf8')
    if (credits.length < 10000 || !credits.includes('Chromium')) throw new Error('Missing or incomplete chrome://credits export.')
  }
  return metadata
}
if (options['--verify']) {
  console.log(`[prepare-browser] Verified ${JSON.stringify(await verify(destination))}; full credits and Chromium LICENSE present.`)
  process.exit(0)
}
if (fs.existsSync(destination)) throw new Error('chrome already exists. Review or rename it before preparing a new browser version. Use --verify to check it.')

// Stage on the destination volume; publish only after validation. Cleanup only
// touches directories created by this invocation.
const stage = fs.mkdtempSync(path.join(root, '.chromium-prepare-'))
const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'liying-chromium-'))
try {
  const archive = options['--archive'] || path.join(downloads, 'chromium-win64.zip')
  const license = options['--license'] || path.join(downloads, 'Chromium-LICENSE')
  if (!options['--archive']) await download(sourceUrl, archive)
  await checked(archive, archiveSha256)
  if (!options['--license']) await download(licenseUrl, license)
  await checked(license, licenseSha256)
  powershell("$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath $env:LIYING_BROWSER_ARCHIVE -DestinationPath $env:LIYING_BROWSER_STAGE", { LIYING_BROWSER_ARCHIVE: archive, LIYING_BROWSER_STAGE: stage })
  const distribution = path.join(stage, 'chrome-win')
  await verify(distribution, false)
  fs.copyFileSync(license, path.join(distribution, 'LICENSE'))
  const browser = await chromium.launch({ executablePath: path.join(distribution, 'chrome.exe'), headless: true, timeout: 30_000 })
  try {
    const page = await browser.newPage()
    await page.goto('chrome://credits', { waitUntil: 'load', timeout: 30_000 })
    fs.writeFileSync(path.join(distribution, 'THIRD_PARTY_LICENSES.html'), await page.content(), 'utf8')
  } finally { await browser.close() }
  await verify(distribution)
  fs.writeFileSync(path.join(distribution, 'BROWSER_PROVENANCE.json'), JSON.stringify({
    product: 'Chromium', version: browserVersion, revision, platform: 'win64',
    playwrightDistributionTag: 'v1.56.1', sourceUrl, archiveSha256, licenseUrl, licenseSha256,
    credits: 'THIRD_PARTY_LICENSES.html (exported from this executable at chrome://credits)'
  }, null, 2) + '\n')
  if (fs.existsSync(destination)) throw new Error('chrome appeared during preparation; refusing to overwrite it.')
  fs.renameSync(distribution, destination)
  console.log(`[prepare-browser] Prepared complete Chromium ${browserVersion} at ${destination}`)
} finally {
  fs.rmSync(stage, { recursive: true, force: true })
  fs.rmSync(downloads, { recursive: true, force: true })
}
