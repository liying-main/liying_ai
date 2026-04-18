/**
 * 渠道/代理贴牌 预处理脚本
 *
 * 用法:
 *   node scripts/prepare-channel.mjs [channelId]
 *   node scripts/prepare-channel.mjs --list-channels
 *   node scripts/prepare-channel.mjs --from-api <agentCode> [--api <url>] [--token <token>]
 *
 * 功能:
 *   1. 生成 src/shared/channel.generated.ts   (主进程 + preload 可引用)
 *   2. 生成 src/renderer/src/brand.generated.ts (渲染进程品牌配置)
 *   3. 复制对应渠道图标到 resources/icon.png + build/icon.ico
 *   4. 生成 electron-builder.generated.yml
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()

// ===== 本地渠道配置 =====
// 新增代理时在这里加一项，并在 channels/<id>/ 放 icon.png + icon.ico
const CHANNELS = {
  default: {
    id: 'default',
    appId: 'com.liying.ai',
    packageName: 'liying-ai',
    productName: '厉影AI',
    description: '厉影AI - AI视频处理工具',
    titleLeft: '厉影',
    titleMiddle: 'AI',
    titleRight: '',
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
  //   iconPng: path.join(repoRoot, 'channels', 'agent001', 'icon.png'),
  //   iconIco: path.join(repoRoot, 'channels', 'agent001', 'icon.ico')
  // }
}

// ===== 参数解析 =====
const args = process.argv.slice(2)

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
  const apiBase = apiIdx !== -1 ? args[apiIdx + 1] : 'http://localhost:8080'
  const token = tokenIdx !== -1 ? args[tokenIdx + 1] : null

  if (!agentCode) {
    console.error('用法: node scripts/prepare-channel.mjs --from-api <agentCode>')
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

function resolveIconImagePath(preferredPngPath) {
  if (preferredPngPath && fs.existsSync(preferredPngPath)) return preferredPngPath
  const dir = preferredPngPath ? path.dirname(preferredPngPath) : null
  if (!dir) return null
  for (const ext of ['icon.jpg', 'icon.jpeg']) {
    const p = path.join(dir, ext)
    if (fs.existsSync(p)) return p
  }
  return null
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
    `  titleRight: ${JSON.stringify(cfg.titleRight)}\n` +
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
    `  titleRight: ${JSON.stringify(cfg.titleRight)}\n` +
    `} as const\n`
  fs.writeFileSync(outPath, content, 'utf8')
  console.log(`[prepare-channel] 已写入品牌配置: ${outPath}`)
}

// ===== 3. 复制图标 =====
function copyIconIfNeeded() {
  const resourcesIcon = path.join(repoRoot, 'resources', 'icon.png')
  const buildIconIco = path.join(repoRoot, 'build', 'icon.ico')

  // PNG (用于应用内 / 托盘)
  const iconImage = resolveIconImagePath(cfg.iconPng)
  if (iconImage) {
    safeCopyFile(iconImage, resourcesIcon)
    console.log(`[prepare-channel] 已覆盖图标: resources/icon.png (source=${path.basename(iconImage)})`)
  } else {
    console.warn(`[prepare-channel] 找不到渠道图标(PNG): ${cfg.iconPng}，跳过`)
  }

  // ICO (用于 Windows exe 图标)
  if (cfg.iconIco && fs.existsSync(cfg.iconIco)) {
    safeCopyFile(cfg.iconIco, buildIconIco)
    console.log('[prepare-channel] 已覆盖图标: build/icon.ico')
  } else {
    console.warn(`[prepare-channel] 找不到渠道图标(ICO): ${cfg.iconIco}，跳过`)
  }
}

// ===== 4. 生成 electron-builder.generated.yml =====
function generateElectronBuilderConfig() {
  const basePath = path.join(repoRoot, 'electron-builder.yml')
  const outPath = path.join(repoRoot, 'electron-builder.generated.yml')

  const base = fs.readFileSync(basePath, 'utf8')

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

// ===== 从后端API获取代理配置 =====
async function fetchAgentConfig(apiBase, agentCode, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const listRes = await fetch(`${apiBase}/app/admin/agents`, { headers })
  const listJson = await listRes.json()
  if (!listJson.data) throw new Error('获取代理列表失败: ' + (listJson.message || '未知错误'))

  const agent = listJson.data.find(a => a.agentCode === agentCode)
  if (!agent) throw new Error(`未找到代理: ${agentCode}`)

  // 如果有远程图标，下载到 channels/<agentCode>/
  const channelDir = path.join(repoRoot, 'channels', agentCode)
  ensureDir(channelDir)

  let iconPng = path.join(channelDir, 'icon.png')
  let iconIco = path.join(channelDir, 'icon.ico')

  if (agent.appIconUrl) {
    console.log(`[prepare-channel] 下载图标: ${agent.appIconUrl}`)
    try {
      const res = await fetch(agent.appIconUrl)
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer())
        // 判断是 ICO 还是 PNG
        if (agent.appIconUrl.endsWith('.ico')) {
          fs.writeFileSync(iconIco, buffer)
          console.log(`[prepare-channel] 已下载 ICO: ${iconIco}`)
        } else {
          fs.writeFileSync(iconPng, buffer)
          console.log(`[prepare-channel] 已下载 PNG: ${iconPng}`)
        }
      }
    } catch (e) {
      console.warn(`[prepare-channel] 图标下载失败: ${e.message}`)
    }
  }

  // 如果没有本地图标，fallback 到 default
  if (!fs.existsSync(iconPng)) iconPng = path.join(repoRoot, 'channels', 'default', 'icon.png')
  if (!fs.existsSync(iconIco)) iconIco = path.join(repoRoot, 'channels', 'default', 'icon.ico')

  const appName = agent.appName || '厉影AI'
  // 解析 titleLeft/titleMiddle/titleRight
  // 简单规则: 如果 appName 包含 'AI' 则拆分
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
    iconPng,
    iconIco
  }
}

// ===== 执行 =====
writeChannelGenerated()
writeBrandGenerated()
copyIconIfNeeded()
generateElectronBuilderConfig()

console.log(`\n[prepare-channel] ✅ 渠道 "${cfg.id}" 准备完成`)
