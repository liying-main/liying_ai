/**
 * 渠道/代理贴牌 预处理脚本
 *
 * 用法:
 *   node scripts/prepare-channel.mjs [channelId]
 *   node scripts/prepare-channel.mjs --list-channels
 *   node scripts/prepare-channel.mjs --from-api <agentCode> [--api <url>] [--token <token>]
 *   node scripts/prepare-channel.mjs --from-api <agentCode> --platform mac  (指定目标平台)
 *
 * 功能:
 *   1. 生成 src/shared/channel.generated.ts   (主进程 + preload 可引用)
 *   2. 生成 src/renderer/src/brand.generated.ts (渲染进程品牌配置)
 *   3. 复制对应渠道图标到 resources/icon.png + build/icon.ico (+ build/icon.icns for macOS)
 *   4. 生成 electron-builder.generated.yml
 *   5. 检查代理类型（定制版警告分支检查）
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execSync } from 'node:child_process'

const repoRoot = process.cwd()
const args_raw = process.argv.slice(2)

// 目标平台参数 (win | mac)
const platformIdx = args_raw.indexOf('--platform')
const targetPlatform = platformIdx !== -1 ? args_raw[platformIdx + 1] : 'win'

// ===== 本地渠道配置 =====
// 新增代理时在这里加一项，并在 channels/<id>/ 放 icon.png + icon.ico
const CHANNELS = {
  default: {
    id: 'default',
    appId: 'com.liying.ai',
    packageName: 'liying-ai',
    productName: '厉影AI 数字人',
    description: '厉影AI 数字人 - 免费开源客户端',
    titleLeft: '厉影',
    titleMiddle: 'AI',
    titleRight: '数字人',
    loginSubtitle: '免费开源客户端 · 文案、配音与数字人创作',
    iconPng: path.join(repoRoot, 'channels', 'default', 'icon.png'),
    iconIco: path.join(repoRoot, 'channels', 'default', 'icon.ico')
  }
  // 示例: 添加代理
  // agent001: {
  //   id: 'agent001',
  //   appId: 'com.agent001.ai',
  //   packageName: 'agent001-ai',
  //   productName: 'XX AI',
  //   description: 'XX AI - AI视频处理工具',
  //   titleLeft: 'XX',
  //   titleMiddle: 'AI',
  //   titleRight: '',
  //   loginSubtitle: '你的登录页 Slogan',
  //   iconPng: path.join(repoRoot, 'channels', 'agent001', 'icon.png'),
  //   iconIco: path.join(repoRoot, 'channels', 'agent001', 'icon.ico')
  // }
}

// ===== 参数解析 =====
const args = args_raw

if (args.includes('--list-channels')) {
  console.log(Object.keys(CHANNELS).join('\n'))
  process.exit(0)
}

let cfg

if (args.includes('--from-api')) {
  // 从后端 API 拉取代理配置，动态生成
  const agentCode = args[args.indexOf('--from-api') + 1]
  const apiIdx = args.indexOf('--api')
  const tokenIdx = args.indexOf('--token')
  const apiBase = apiIdx !== -1 ? args[apiIdx + 1] : (process.env.BUILD_API_BASE || process.env.API_BASE_URL || 'http://localhost:8080')
  let token = tokenIdx !== -1 ? args[tokenIdx + 1] : (process.env.BUILD_ADMIN_TOKEN || null)

  // 如果没有直接提供 token，尝试用账号密码自动登录
  if (!token) {
    const adminUser = process.env.BUILD_ADMIN_USER
    const adminPass = process.env.BUILD_ADMIN_PASS
    if (adminUser && adminPass) {
      token = await autoLogin(apiBase, adminUser, adminPass)
    }
  }

  if (!agentCode) {
    console.error('用法: node scripts/prepare-channel.mjs --from-api <agentCode>')
    process.exit(1)
  }

  if (!token) {
    console.error('[prepare-channel] 错误: 未提供认证信息')
    console.error('[prepare-channel] 请在 .build-env 中配置 BUILD_ADMIN_USER 和 BUILD_ADMIN_PASS')
    process.exit(1)
  }

  cfg = await fetchAgentConfig(apiBase, agentCode, token)
  console.log(`[prepare-channel] 从API获取代理配置: ${agentCode}`)
} else {
  const channelId = (args[0] || '').trim() || 'default'

  if (!Object.hasOwn(CHANNELS, channelId)) {
    console.error(`[prepare-channel] 未知渠道: ${channelId}`)
    console.error(`[prepare-channel] 可用渠道: ${Object.keys(CHANNELS).join(', ')}`)
    process.exit(1)
  }

  cfg = CHANNELS[channelId]
}

// ===== 工具函数 =====
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

function safeCopyFile(src, dst) {
  ensureDir(path.dirname(dst))
  fs.copyFileSync(src, dst)
}

function resolvePackagingIconPng(channelDir, preferredPngPath) {
  const envIcon = process.env.BUILD_ICON_PNG?.trim()
  if (envIcon) {
    if (fs.existsSync(envIcon)) return envIcon
    console.warn(`[prepare-channel] BUILD_ICON_PNG 不存在: ${envIcon}`)
  }
  if (preferredPngPath && fs.existsSync(preferredPngPath)) return preferredPngPath
  if (!channelDir) return null
  for (const name of ['app.png', 'icon.jpg', 'icon.jpeg']) {
    const p = path.join(channelDir, name)
    if (fs.existsSync(p)) return p
  }
  return null
}

/** Windows 安装包/exe 图标：优先专用 .ico（含后台 appIconIcoUrl 下载的 windows.ico） */
function resolvePackagingIconIco(channelDir, preferredIcoPath) {
  const envIco = process.env.BUILD_ICON_ICO?.trim()
  if (envIco) {
    if (fs.existsSync(envIco)) return envIco
    console.warn(`[prepare-channel] BUILD_ICON_ICO 不存在: ${envIco}`)
  }
  const candidates = []
  if (preferredIcoPath) candidates.push(preferredIcoPath)
  if (channelDir) {
    for (const name of ['windows.ico', 'icon.ico']) {
      candidates.push(path.join(channelDir, name))
    }
  }
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p
  }
  return null
}

function generateIcoFromPngFallback(pngPath, icoPath) {
  if (!fs.existsSync(pngPath)) {
    console.warn(`[prepare-channel] PNG文件不存在，无法生成ICO: ${pngPath}`)
    return false
  }

  try {
    console.log(`[prepare-channel] 从PNG生成ICO(备用方案): ${pngPath} -> ${icoPath}`)
    const psScript = `
      Add-Type -AssemblyName System.Drawing
      $png = [System.Drawing.Image]::FromFile('${pngPath.replace(/\\/g, '\\\\')}')
      $bmp = New-Object System.Drawing.Bitmap(256, 256)
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.DrawImage($png, 0, 0, 256, 256)
      $g.Dispose()
      $icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
      $fileStream = [System.IO.FileStream]::new('${icoPath.replace(/\\/g, '\\\\')}', [System.IO.FileMode]::Create)
      $icon.Save($fileStream)
      $fileStream.Close()
      $bmp.Dispose()
      $icon.Dispose()
      $png.Dispose()
    `
    execSync(`powershell -Command "${psScript}"`, { stdio: 'pipe' })
    console.log('[prepare-channel] ICO生成成功(备用方案)')
    return true
  } catch (err) {
    console.warn(`[prepare-channel] ICO生成失败: ${err.message}`)
    return false
  }
}

async function generateIcoFromPng(pngPath, icoPath) {
  if (!fs.existsSync(pngPath)) {
    console.warn(`[prepare-channel] PNG文件不存在，无法生成ICO: ${pngPath}`)
    return false
  }

  try {
    const sharp = (await import('sharp')).default
    const pngToIco = (await import('png-to-ico')).default
    const sizes = [16, 24, 32, 48, 64, 128, 256]
    const buffers = []
    for (const size of sizes) {
      const buf = await sharp(pngPath)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
      buffers.push(buf)
    }
    ensureDir(path.dirname(icoPath))
    fs.writeFileSync(icoPath, await pngToIco(buffers))
    console.log(`[prepare-channel] 从PNG生成多尺寸ICO: ${pngPath} -> ${icoPath}`)
    return true
  } catch (err) {
    console.warn(`[prepare-channel] 多尺寸ICO生成失败，尝试备用方案: ${err.message}`)
    return generateIcoFromPngFallback(pngPath, icoPath)
  }
}

// ===== 1. 生成 channel.generated.ts (主进程 + shared) =====
function writeChannelGenerated() {
  const outDir = path.join(repoRoot, 'src', 'shared')
  ensureDir(outDir)
  const outPath = path.join(outDir, 'channel.generated.ts')
  const content =
    `// 此文件由 scripts/prepare-channel.mjs 自动生成，请勿手动修改\n` +
    `export const CHANNEL = {\n` +
    `  id: ${JSON.stringify(cfg.id)},\n` +
    `  appId: ${JSON.stringify(cfg.appId)},\n` +
    `  packageName: ${JSON.stringify(cfg.packageName)},\n` +
    `  productName: ${JSON.stringify(cfg.productName)},\n` +
    `  description: ${JSON.stringify(cfg.description)},\n` +
    `  titleLeft: ${JSON.stringify(cfg.titleLeft)},\n` +
    `  titleMiddle: ${JSON.stringify(cfg.titleMiddle)},\n` +
    `  titleRight: ${JSON.stringify(cfg.titleRight)},\n` +
    `  loginSubtitle: ${JSON.stringify(cfg.loginSubtitle || '')}\n` +
    `} as const\n`
  fs.writeFileSync(outPath, content, 'utf8')
  console.log(`[prepare-channel] 已写入渠道配置: ${outPath}`)
}

// ===== 2. 生成 brand.generated.ts (渲染进程品牌) =====
function writeBrandGenerated() {
  const outPath = path.join(repoRoot, 'src', 'renderer', 'src', 'brand.generated.ts')
  const content =
    `// 此文件由 scripts/prepare-channel.mjs 自动生成，请勿手动修改\n` +
    `export const BRAND = {\n` +
    `  productName: ${JSON.stringify(cfg.productName)},\n` +
    `  titleLeft: ${JSON.stringify(cfg.titleLeft)},\n` +
    `  titleMiddle: ${JSON.stringify(cfg.titleMiddle)},\n` +
    `  titleRight: ${JSON.stringify(cfg.titleRight)},\n` +
    `  loginSubtitle: ${JSON.stringify(cfg.loginSubtitle || '')}\n` +
    `} as const\n`
  fs.writeFileSync(outPath, content, 'utf8')
  console.log(`[prepare-channel] 已写入品牌配置: ${outPath}`)
}

// ===== 3. 复制图标 =====
async function copyIconIfNeeded() {
  const resourcesIcon = path.join(repoRoot, 'resources', 'icon.png')
  const buildIconIco = path.join(repoRoot, 'build', 'icon.ico')
  const buildIconIcns = path.join(repoRoot, 'build', 'icon.icns')
  const rendererAssetsLogo = path.join(repoRoot, 'src', 'renderer', 'src', 'assets', 'logo.png')

  const channelDir = cfg.iconPng
    ? path.dirname(cfg.iconPng)
    : path.join(repoRoot, 'channels', 'default')
  const iconImage = resolvePackagingIconPng(channelDir, cfg.iconPng)
    || (fs.existsSync(rendererAssetsLogo) ? rendererAssetsLogo : null)

  if (iconImage) {
    const sourceLabel = process.env.BUILD_ICON_PNG?.trim() && path.resolve(iconImage) === path.resolve(process.env.BUILD_ICON_PNG.trim())
      ? 'BUILD_ICON_PNG'
      : path.relative(repoRoot, iconImage)
    console.log(`[prepare-channel] 打包图标源: ${sourceLabel}`)
    safeCopyFile(iconImage, resourcesIcon)
    console.log(`[prepare-channel] 已覆盖图标: resources/icon.png (source=${path.basename(iconImage)})`)

    if (path.resolve(iconImage) !== path.resolve(rendererAssetsLogo)) {
      safeCopyFile(iconImage, rendererAssetsLogo)
      console.log('[prepare-channel] 已同步界面 logo: src/renderer/src/assets/logo.png')
    }
  } else {
    console.warn(`[prepare-channel] 找不到渠道图标(PNG): ${cfg.iconPng}`)
  }

  // ICO (Windows exe / 安装包) — 优先使用专用 .ico，无 .ico 时才从 PNG 生成
  if (targetPlatform === 'win') {
    const sourceIco = resolvePackagingIconIco(channelDir, cfg.iconIco)

    if (sourceIco) {
      safeCopyFile(sourceIco, buildIconIco)
      console.log(
        `[prepare-channel] Windows 图标: build/icon.ico (source=${path.relative(repoRoot, sourceIco)})`
      )
    } else if (iconImage) {
      console.log('[prepare-channel] 无专用 .ico，从 PNG 生成 Windows 图标')
      const generated = await generateIcoFromPng(iconImage, buildIconIco)
      if (!generated) {
        console.error('[prepare-channel] 无法从 PNG 生成 build/icon.ico，Windows 打包已中止')
        process.exit(1)
      }
      console.log('[prepare-channel] 已覆盖图标: build/icon.ico (generated from PNG)')
    } else if (fs.existsSync(rendererAssetsLogo)) {
      const generated = await generateIcoFromPng(rendererAssetsLogo, buildIconIco)
      if (!generated) {
        console.error('[prepare-channel] 无法从 logo.png 生成 build/icon.ico，Windows 打包已中止')
        process.exit(1)
      }
    } else {
      console.error(`[prepare-channel] 找不到可用 Windows 图标(.ico)或 PNG 源: ${cfg.iconIco || cfg.iconPng}`)
      process.exit(1)
    }
  }

  // ICNS (用于 macOS 应用图标)
  if (targetPlatform === 'mac') {
    if (cfg.iconIcns && fs.existsSync(cfg.iconIcns)) {
      safeCopyFile(cfg.iconIcns, buildIconIcns)
      console.log('[prepare-channel] 已覆盖图标: build/icon.icns')
    } else {
      console.warn(`[prepare-channel] 找不到渠道图标(ICNS)，macOS打包可能需要手动添加 build/icon.icns`)
    }
  }
}

// ===== 4. 生成 electron-builder.generated.yml =====
function generateElectronBuilderConfig() {
  const basePath = path.join(repoRoot, 'electron-builder.yml')
  const outPath = path.join(repoRoot, 'electron-builder.generated.yml')

  const base = fs.readFileSync(basePath, 'utf8').replace(/\r\n/g, '\n')

  let next = base
    .replace(/^appId:\s*.*$/m, `appId: ${cfg.appId}`)
    .replace(/^productName:\s*.*$/m, `productName: ${cfg.productName}`)
    .replace(/^\s*executableName:\s*.*$/m, `  executableName: ${cfg.packageName}`)

  // 注入 extraMetadata
  if (!/^extraMetadata:\s*$/m.test(next)) {
    next = `${next.trimEnd()}\nextraMetadata:\n  name: ${cfg.packageName}\n  description: ${cfg.description}\n`
  }

  fs.writeFileSync(outPath, next, 'utf8')
  console.log(`[prepare-channel] 已生成 electron-builder 配置: ${outPath}`)
}

// ===== 自动登录获取Token =====
async function autoLogin(apiBase, username, password) {
  console.log(`[prepare-channel] 使用账号 ${username} 自动登录...`)
  try {
    const res = await fetch(`${apiBase}/app/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    const json = await res.json()
    if (json.code !== 0 && json.code !== 1000) {
      throw new Error(json.message || '登录失败')
    }
    const token = json.data?.token
    if (!token) throw new Error('登录返回无token')
    console.log(`[prepare-channel] 登录成功`)
    return token
  } catch (e) {
    console.error(`[prepare-channel] 自动登录失败: ${e.message}`)
    process.exit(1)
  }
}

// ===== 下载远程文件到本地 =====
function resolveDownloadUrl(url, apiBase) {
  if (!url) return null
  try {
    return new URL(url).toString()
  } catch {
    return new URL(url.startsWith('/') ? url : `/${url}`, apiBase).toString()
  }
}

async function downloadFile(url, destPath, apiBase) {
  if (!url) return false
  try {
    const fullUrl = resolveDownloadUrl(url, apiBase)
    console.log(`[prepare-channel] 下载: ${fullUrl}`)
    const res = await fetch(fullUrl)
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer())
      fs.writeFileSync(destPath, buffer)
      console.log(`[prepare-channel] 已保存: ${destPath}`)
      return true
    }
  } catch (e) {
    console.warn(`[prepare-channel] 下载失败: ${e.message}`)
  }
  return false
}

// ===== 从后端API获取代理配置 =====
async function fetchAgentConfig(apiBase, agentCode, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const listRes = await fetch(`${apiBase}/app/admin/agents`, { headers })
  const listJson = await listRes.json()
  if (!listJson.data) throw new Error('获取代理列表失败: ' + (listJson.message || '未知错误'))

  const agent = listJson.data.find(a => a.agentCode === agentCode)
  if (!agent) throw new Error(`未找到代理: ${agentCode}`)

  // ===== 代理类型检查 =====
  const agentType = agent.agentType ?? 0
  if (agentType === 1) {
    const gitBranch = agent.gitBranch || ''
    console.log(`\n[prepare-channel] ⚠️  这是一个【定制版】代理商`)
    if (gitBranch) {
      console.log(`[prepare-channel] ⚠️  应使用分支: ${gitBranch}`)
      console.log(`[prepare-channel] ⚠️  请确认当前代码已切换到正确分支！`)
    }
    if (agent.featureNote) {
      console.log(`[prepare-channel] ⚠️  定制功能: ${agent.featureNote}`)
    }
    console.log('')
  } else {
    console.log(`[prepare-channel] 通用版代理商，使用主分支代码`)
  }

  // ===== 下载多平台图标到 channels/<agentCode>/ =====
  const channelDir = path.join(repoRoot, 'channels', agentCode)
  ensureDir(channelDir)

  let iconPng = path.join(channelDir, 'icon.png')
  let iconIco = path.join(channelDir, 'icon.ico')
  let iconIcns = path.join(channelDir, 'icon.icns')

  // 优先使用专用平台图标URL，fallback到旧的 appIconUrl
  const pngUrl = agent.appIconPngUrl || (agent.appIconUrl && !agent.appIconUrl.endsWith('.ico') ? agent.appIconUrl : null)
  const icoUrl = agent.appIconIcoUrl || (agent.appIconUrl && agent.appIconUrl.endsWith('.ico') ? agent.appIconUrl : null)
  const icnsUrl = agent.appIconIcnsUrl || null

  await downloadFile(pngUrl, iconPng, apiBase)
  const icoDownloaded = await downloadFile(icoUrl, iconIco, apiBase)
  // 同步一份 windows.ico，便于本地 channels/<agent>/ 手工维护
  if (icoDownloaded && fs.existsSync(iconIco)) {
    safeCopyFile(iconIco, path.join(channelDir, 'windows.ico'))
  }
  if (targetPlatform === 'mac') {
    await downloadFile(icnsUrl, iconIcns, apiBase)
  }

  // 如果 ICO 下载失败或不存在，从 PNG 生成
  if (!fs.existsSync(iconIco) && fs.existsSync(iconPng)) {
    console.log('[prepare-channel] ICO文件不存在，从PNG生成...')
    await generateIcoFromPng(iconPng, iconIco)
  }

  // fallback 到 default
  if (!fs.existsSync(iconPng)) iconPng = path.join(repoRoot, 'channels', 'default', 'icon.png')
  if (!fs.existsSync(iconIco)) iconIco = path.join(repoRoot, 'channels', 'default', 'icon.ico')
  if (!fs.existsSync(iconIcns)) iconIcns = null

  const appName = agent.appName || '厉影AI'
  // 解析 titleLeft/titleMiddle/titleRight
  let titleLeft = appName
  let titleMiddle = ''
  let titleRight = ''
  const aiIdx = appName.indexOf('AI')
  if (aiIdx > 0) {
    titleLeft = appName.substring(0, aiIdx)
    titleMiddle = 'AI'
    titleRight = appName.substring(aiIdx + 2).trim()
  }

  return {
    id: agentCode,
    appId: `com.${agentCode.replace(/[^a-zA-Z0-9]/g, '')}.ai`,
    packageName: agent.installerPrefix || `${agentCode}-ai`,
    productName: appName,
    description: appName,
    titleLeft,
    titleMiddle,
    titleRight,
    loginSubtitle: agent.loginSubtitle || CHANNELS.default.loginSubtitle,
    iconPng,
    iconIco,
    iconIcns,
    agentType,
    gitBranch: agentType === 1 ? (agent.gitBranch || null) : null
  }
}

// ===== 执行 =====
writeChannelGenerated()
writeBrandGenerated()
await copyIconIfNeeded()
generateElectronBuilderConfig()

// 写入构建元信息供 build-agent.bat 读取
const buildMeta = {
  agentCode: cfg.id,
  agentType: cfg.agentType || 0,
  gitBranch: cfg.gitBranch || null,
  iconIco: 'build/icon.ico',
  iconPng: 'resources/icon.png',
  productName: cfg.productName,
  packageName: cfg.packageName,
}
fs.writeFileSync(path.join(repoRoot, '.build-meta.json'), JSON.stringify(buildMeta), 'utf8')

console.log(`\n[prepare-channel] ✅ 渠道 "${cfg.id}" 准备完成`)
