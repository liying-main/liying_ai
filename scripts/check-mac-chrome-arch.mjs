import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateMacChromeFolder } from './mac-chrome-arch.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const arch = process.argv[2]

if (!arch || !['arm64', 'x64'].includes(arch)) {
  console.error('用法: node scripts/check-mac-chrome-arch.mjs [arm64|x64]')
  process.exit(1)
}

const result = validateMacChromeFolder(path.join(repoRoot, 'chrome'), arch)
if (!result.ok) {
  console.error(`[check-mac-chrome-arch] ${result.message}`)
  process.exit(1)
}

console.log(`[check-mac-chrome-arch] chrome/mac-${arch} OK`)
