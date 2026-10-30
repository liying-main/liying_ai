import fs from 'node:fs'
import path from 'node:path'

const MACH_MAGIC_64 = 0xfeedfacf
const MACH_MAGIC_32 = 0xfeedface
const CPU_TYPE_X86_64 = 0x01000007
const CPU_TYPE_ARM64 = 0x0100000c

export function readMacMachCpuType(filePath) {
  if (!fs.existsSync(filePath)) return null
  try {
    const fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(8)
    fs.readSync(fd, buf, 0, 8, 0)
    fs.closeSync(fd)
    const magic = buf.readUInt32LE(0)
    if (magic !== MACH_MAGIC_64 && magic !== MACH_MAGIC_32) return null
    return buf.readUInt32LE(4)
  } catch {
    return null
  }
}

export function machCpuLabel(cpu) {
  if (cpu === CPU_TYPE_ARM64) return 'arm64'
  if (cpu === CPU_TYPE_X86_64) return 'x86_64'
  return `cpu-${cpu}`
}

export function expectedMachCpuForMacArch(macArch) {
  return macArch === 'arm64' ? CPU_TYPE_ARM64 : CPU_TYPE_X86_64
}

export function resolveChromeFrameworkBinary(chromeDir, macArch) {
  const appBundle = path.join(
    chromeDir,
    `mac-${macArch}`,
    'Google Chrome for Testing.app'
  )
  const versionsDir = path.join(
    appBundle,
    'Contents',
    'Frameworks',
    'Google Chrome for Testing Framework.framework',
    'Versions'
  )
  if (!fs.existsSync(versionsDir)) return null
  for (const ver of fs.readdirSync(versionsDir)) {
    if (ver === 'Current') continue
    const candidate = path.join(versionsDir, ver, 'Google Chrome for Testing Framework')
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

export function validateMacChromeFolder(chromeDir, macArch) {
  const fw = resolveChromeFrameworkBinary(chromeDir, macArch)
  if (!fw) {
    return { ok: false, message: `缺少 chrome/mac-${macArch}/Google Chrome for Testing.app` }
  }
  const cpu = readMacMachCpuType(fw)
  const expected = expectedMachCpuForMacArch(macArch)
  if (cpu === null) {
    return { ok: false, message: `无法识别 chrome/mac-${macArch} 的二进制架构` }
  }
  if (cpu !== expected) {
    return {
      ok: false,
      message:
        `chrome/mac-${macArch} 架构错误：检测到 ${machCpuLabel(cpu)}，应为 ${machCpuLabel(expected)}。` +
        (macArch === 'x64'
          ? ' Intel Mac 不能使用 arm64 版 Chrome，请运行: node scripts/install-mac-chrome.mjs x64'
          : ' 请运行: node scripts/install-mac-chrome.mjs arm64'),
    }
  }
  return { ok: true }
}

export function validateAllMacChromeFolders(chromeDir) {
  const errors = []
  for (const macArch of ['arm64', 'x64']) {
    const fw = resolveChromeFrameworkBinary(chromeDir, macArch)
    if (!fw) continue
    const result = validateMacChromeFolder(chromeDir, macArch)
    if (!result.ok) errors.push(result.message)
  }
  return errors
}
