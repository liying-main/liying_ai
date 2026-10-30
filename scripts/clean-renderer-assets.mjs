// 跨平台清理 out/renderer/assets 下的冗余媒体目录 (这些是开发期复制进来的，
// 真实运行时由 asarUnpack 的 assets/ 提供，留在 renderer 里只会让安装包变胖)
import { rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const TARGETS = ['bgms', 'fonts', 'videos', 'voices', 'title-styles']
const root = process.cwd()
const base = join(root, 'out', 'renderer', 'assets')

let removed = 0
for (const name of TARGETS) {
  const dir = join(base, name)
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
    console.log(`Removed ${name}`)
    removed++
  }
}
console.log(`Cleaned ${removed} redundant renderer media directories`)
