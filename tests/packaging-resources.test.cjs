const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { requiredResources, verifyResources } = require('../build/required-resources.cjs')

test('Windows package rejects missing browser DLL even when chrome.exe exists', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'liying-package-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const [relative, size] of requiredResources('win32')) {
    const file = path.join(root, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, Buffer.alloc(size))
  }
  assert.doesNotThrow(() => verifyResources(root, 'win32'))
  fs.unlinkSync(path.join(root, 'chrome/chrome.dll'))
  assert.throws(() => verifyResources(root, 'win32'), /chrome\/chrome.dll \(missing\)/)
})

test('Windows package rejects partial downloads and absent media tools', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'liying-package-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'chrome'))
  fs.writeFileSync(path.join(root, 'chrome/chrome.exe'), 'incomplete')
  assert.throws(() => verifyResources(root, 'win'), (error) => {
    assert.match(error.message, /chrome\/chrome.exe \(invalid or truncated\)/)
    assert.match(error.message, /ffmpeg\/bin\/ffprobe.exe \(missing\)/)
    return true
  })
})
