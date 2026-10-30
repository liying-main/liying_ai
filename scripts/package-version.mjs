import fs from 'node:fs'
import path from 'node:path'

const packagePath = path.resolve('package.json')
const backupPath = path.resolve('.build-package-version.backup')
const [command, nextVersion] = process.argv.slice(2)

function readPackage() {
  return JSON.parse(fs.readFileSync(packagePath, 'utf8'))
}

function writePackage(raw) {
  fs.writeFileSync(packagePath, raw, 'utf8')
}

if (command === 'get') {
  console.log(readPackage().version || '')
  process.exit(0)
}

if (command === 'set') {
  if (!nextVersion || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(nextVersion)) {
    console.error(`Invalid package version: ${nextVersion || '(empty)'}`)
    process.exit(1)
  }

  const raw = fs.readFileSync(packagePath, 'utf8')
  const pkg = JSON.parse(raw)
  fs.writeFileSync(backupPath, raw, 'utf8')
  if (pkg.version === nextVersion) process.exit(0)
  pkg.version = nextVersion
  writePackage(`${JSON.stringify(pkg, null, 2)}\n`)
  console.log(`[package-version] ${pkg.name || 'app'}: ${pkg.version}`)
  process.exit(0)
}

if (command === 'restore') {
  if (fs.existsSync(backupPath)) {
    writePackage(fs.readFileSync(backupPath, 'utf8'))
    fs.rmSync(backupPath, { force: true })
    console.log('[package-version] restored package.json')
  }
  process.exit(0)
}

console.error('Usage: node scripts/package-version.mjs <get|set VERSION|restore>')
process.exit(1)
