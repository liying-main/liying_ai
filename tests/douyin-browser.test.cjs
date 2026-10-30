// Default: offline unit tests, with no browser, login, download, or native binary launched.
// Run after npm ci: node --test tests/douyin-browser.test.cjs
// Optional real local-browser integration (no external website or real login):
// Set LIYING_BROWSER_INTEGRATION=1 and LIYING_BROWSER_RUN_DIR to an empty output folder.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const ts = require('typescript')

function loadTs(file, mocks = {}, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/main', file), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    process, Buffer, console: { log() {} }, Error, URL, AbortController, setTimeout, clearTimeout,
    ...globals,
  }, { filename: file })
  return module.exports
}

const browserPaths = loadTs('douyin-browser-paths.ts')
const douyinParser = loadTs('douyin-post-parser.ts')

test('Windows browser candidates preserve priority, spaces, absolute paths, and case-insensitive deduplication', () => {
  const candidates = browserPaths.listDouyinBrowserCandidates({
    platform: 'win32', homeDir: 'C:\\Users\\test',
    bundledPath: 'F:\\App Space\\chrome\\chrome.exe',
    playwrightPath: 'C:\\Cache\\pw\\chrome.exe',
    env: { ProgramFiles: 'C:\\Program Files', Path: 'relative;;"D:\\Browser Space";F:\\App Space\\chrome;f:\\APP SPACE\\chrome' },
  })
  assert.equal(candidates[0].source, 'bundled')
  assert.equal(candidates[1].executablePath, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  assert.equal(candidates[2].executablePath, 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe')
  assert.equal(candidates.at(-1).source, 'playwright')
  assert.ok(candidates.some((entry) => entry.executablePath === 'D:\\Browser Space\\chrome.exe'))
  assert.equal(candidates.filter((entry) => entry.executablePath.toLowerCase() === candidates[0].executablePath.toLowerCase()).length, 1)
  assert.ok(candidates.every((entry) => path.win32.isAbsolute(entry.executablePath)))
})

test('macOS and Linux candidates include system Chrome/Edge and the Playwright fallback', () => {
  const mac = browserPaths.listDouyinBrowserCandidates({ platform: 'darwin', env: {}, homeDir: '/Users/example', bundledPath: '/bundle/chrome', playwrightPath: '/cache/chrome' })
  assert.ok(mac.some((entry) => entry.executablePath === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'))
  assert.ok(mac.some((entry) => entry.executablePath === '/Users/example/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'))
  const linux = browserPaths.listDouyinBrowserCandidates({ platform: 'linux', env: {}, homeDir: '/home/example', bundledPath: '/bundle/chrome', playwrightPath: '/cache/chrome' })
  assert.ok(linux.some((entry) => entry.executablePath === '/usr/bin/chromium'))
  assert.equal(linux.at(-1).source, 'playwright')
})

class FakeContext extends EventEmitter {
  constructor() { super(); this.closeCount = 0 }
  async close() { this.closeCount++; this.emit('close') }
}

function sessionFixture({ files = ['/bundle/chrome'], launch, validBundle = true } = {}) {
  const calls = [], contexts = [], validated = [], directories = []
  const session = loadTs('douyin-browser-session.ts', {
    electron: { app: { getPath: (name) => { assert.equal(name, 'userData'); return '/app-user-data' } } },
    'node:fs': {
      statSync: (file) => { if (!files.includes(file)) throw new Error('ENOENT'); return { isFile: () => true } },
      mkdirSync: (directory) => directories.push(directory),
    },
    'node:os': { homedir: () => '/home/example' },
    'node:path': path.posix,
    playwright: { chromium: {
      executablePath: () => '/cache/chrome',
      launchPersistentContext: async (profile, options) => {
        calls.push({ profile, options })
        if (launch) await launch(calls.length, options)
        const context = new FakeContext(); contexts.push(context); return context
      },
    } },
    './platform-paths': {
      getChromePath: () => '/bundle/chrome',
      validateMacChromeArch: (file) => { validated.push(file); return { ok: validBundle } },
    },
    './douyin-browser-paths': browserPaths,
  }, { process: { platform: 'linux', env: {} } })
  return { session, calls, contexts, validated, directories }
}

test('persistent browser uses a visible independent app-data2 profile and closes after success', async () => {
  const f = sessionFixture()
  assert.equal(f.session.isDouyinBrowserAvailable(), true)
  assert.equal(await f.session.withDouyinBrowser(async () => 'done'), 'done')
  assert.equal(f.calls[0].profile, '/app-user-data/app-data2/browser/douyin')
  assert.equal(f.calls[0].options.headless, false)
  assert.equal(f.calls[0].options.executablePath, '/bundle/chrome')
  assert.equal(f.contexts[0].closeCount, 1)
})

test('launch failure falls back to installed Chrome without applying bundled-only validation to it', async () => {
  const f = sessionFixture({ files: ['/bundle/chrome', '/usr/bin/google-chrome', '/cache/chrome'], launch: async (count) => { if (count === 1) throw new Error('bundle is unavailable') } })
  await f.session.withDouyinBrowser(async () => {})
  assert.deepEqual(f.calls.map((call) => call.options.executablePath), ['/bundle/chrome', '/usr/bin/google-chrome'])
  assert.deepEqual(f.validated, ['/bundle/chrome'])
})

test('missing browser and locked independent profile produce actionable errors', async () => {
  const missing = sessionFixture({ files: [] })
  assert.equal(missing.session.isDouyinBrowserAvailable(), false)
  await assert.rejects(missing.session.withDouyinBrowser(async () => {}), /安装 Google Chrome 或 Microsoft Edge/)
  const locked = sessionFixture({ files: ['/bundle/chrome', '/cache/chrome'], launch: async () => { throw new Error('ProcessSingleton profile locked') } })
  await assert.rejects(locked.session.withDouyinBrowser(async () => {}), /另一个应用实例占用/)
  assert.equal(locked.calls.length, 1)
})

test('tasks run serially, and task failure closes its context before the next task starts', async () => {
  const f = sessionFixture()
  let releaseFirst, firstStarted
  const gate = new Promise((resolve) => { releaseFirst = resolve })
  const started = new Promise((resolve) => { firstStarted = resolve })
  const first = f.session.withDouyinBrowser(async () => { firstStarted(); await gate; throw new Error('task failed') })
  const rejected = assert.rejects(first, /task failed/)
  const second = f.session.withDouyinBrowser(async () => {
    assert.equal(f.contexts[0].closeCount, 1)
    return 'next'
  })
  await started
  assert.equal(f.calls.length, 1)
  releaseFirst()
  await rejected
  assert.equal(await second, 'next')
  assert.equal(f.calls.length, 2)
  assert.equal(f.contexts[1].closeCount, 1)
})

test('closing the browser cancels a pending task and does not poison the queue', async () => {
  const f = sessionFixture()
  const cancelled = f.session.withDouyinBrowser(async (context) => {
    queueMicrotask(() => context.emit('close'))
    return new Promise(() => {})
  })
  await assert.rejects(cancelled, /窗口已关闭，本次操作已取消/)
  assert.equal(await f.session.withDouyinBrowser(async () => 'retry'), 'retry')
  assert.equal(f.contexts[0].closeCount, 1)
})

test('already cancelled and queued cancelled tasks never launch a browser', async () => {
  const f = sessionFixture()
  const pre = new AbortController()
  pre.abort(new Error('cancel before queue'))
  await assert.rejects(f.session.withDouyinBrowser(async () => {}, pre.signal), /cancel before queue/)
  assert.equal(f.calls.length, 0)
  let release, ready
  const gate = new Promise((resolve) => { release = resolve })
  const started = new Promise((resolve) => { ready = resolve })
  const first = f.session.withDouyinBrowser(async () => { ready(); await gate })
  await started
  const queued = new AbortController()
  const second = f.session.withDouyinBrowser(async () => { assert.fail('cancelled task must not run') }, queued.signal)
  queued.abort(new Error('cancel while queued'))
  await assert.rejects(second, /cancel while queued/)
  assert.equal(f.calls.length, 1)
  release()
  await first
  await f.session.withDouyinBrowser(async () => {})
  assert.equal(f.calls.length, 2)
})

test('cancelling an in-flight launch closes its eventual context before the next launch', async () => {
  let releaseLaunch, ready
  const gate = new Promise((resolve) => { releaseLaunch = resolve })
  const started = new Promise((resolve) => { ready = resolve })
  const f = sessionFixture({ launch: async (count) => { if (count === 1) { ready(); await gate } } })
  const controller = new AbortController()
  const cancelled = f.session.withDouyinBrowser(async () => { assert.fail('cancelled launch must not invoke task') }, controller.signal)
  await started
  controller.abort(new Error('cancel during launch'))
  await assert.rejects(cancelled, /cancel during launch/)
  releaseLaunch()
  await f.session.withDouyinBrowser(async () => { assert.equal(f.contexts[0].closeCount, 1) })
  assert.equal(f.calls.length, 2)
})

test('cancelling an active context preserves the cancellation reason and releases the queue', async () => {
  const f = sessionFixture()
  const controller = new AbortController()
  const cancelled = f.session.withDouyinBrowser(async () => {
    queueMicrotask(() => controller.abort(new Error('user clicked cancel')))
    return new Promise(() => {})
  }, controller.signal)
  await assert.rejects(cancelled, /user clicked cancel/)
  await f.session.withDouyinBrowser(async () => {})
  assert.ok(f.contexts[0].closeCount >= 1)
  assert.equal(f.calls.length, 2)
})

function downloaderFixture(t, { splitAudio = false, noMedia = false, closeDuringRequest = false, closeDuringNative = false, recommendation = false, missingMetadata = false, externalRedirect = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'liying browser tests '))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const executable = path.join(directory, 'fake-tool.exe')
  fs.writeFileSync(executable, 'never executed')
  const page = new EventEmitter()
  const context = new EventEmitter()
  const nativeCalls = []
  const resources = { disposedResponses: 0, nativeClosed: false }
  const requests = []
  let clock = 1000
  page.addInitScript = async ({ content }) => { assert.match(content, /120 秒/) }
  page.close = async () => { page.closed = true; page.emit('close') }
  page.mainFrame = () => page
  page.route = async (_pattern, handler) => { page.routeHandler = handler }
  page.url = () => 'https://www.douyin.com/video/12345'
  page.evaluate = async () => missingMetadata ? [] : [JSON.stringify({ aweme_list: [
    { aweme_id: '12345', video: { play_addr: { url_list: ['https://example.invalid/video.mp4'] }, audio: { url_list: ['https://example.invalid/audio.mp4'] } } },
    { aweme_id: '67890', video: { play_addr: { url_list: ['https://example.invalid/recommendation.mp4'] } } },
  ] })]
  page.waitForTimeout = async (duration) => { clock += duration }
  page.goto = async () => {
    if (externalRedirect) {
      await page.routeHandler({ request: () => ({ isNavigationRequest: () => true, frame: () => page, url: () => 'https://example.invalid/' }), abort: async () => { page.redirectAborted = true }, continue: async () => { throw new Error('Must not navigate outside Douyin') } })
      throw new Error('navigation aborted')
    }
    if (noMedia) return
    for (const kind of splitAudio ? ['video', 'audio'] : ['video']) {
      page.emit('response', {
        status: () => 200,
        headers: () => ({ 'content-type': `${kind}/mp4`, 'content-length': String(200 * 1024) }),
        url: () => `https://example.invalid/${kind}.mp4`,
      })
    }
    if (recommendation) page.emit('response', {
      status: () => 200,
      headers: () => ({ 'content-type': 'video/mp4', 'content-length': String(900 * 1024) }),
      url: () => 'https://example.invalid/recommendation.mp4',
    })
  }
  context.newPage = async () => page
  context.request = { get: async (url) => {
    requests.push(url)
    if (closeDuringRequest) {
      queueMicrotask(() => page.emit('close'))
      return new Promise(() => {})
    }
    return { status: () => 200, headers: () => ({}), body: async () => Buffer.alloc(200 * 1024), dispose: async () => { resources.disposedResponses++ } }
  } }
  const downloader = loadTs('douyin-browser-downloader.ts', {
    './douyin-post-parser': douyinParser,
    './platform-paths': { getFfprobePath: () => executable, getFfmpegPath: () => executable },
    './douyin-browser-session': {
      DOUYIN_BROWSER_CLOSED_MESSAGE: '抖音浏览器窗口已关闭，本次操作已取消。',
      withDouyinBrowser: async (task) => task(context),
    },
    child_process: { spawn: (_file, args, options) => {
      assert.equal(options.windowsHide, true)
      nativeCalls.push(args)
      const child = new EventEmitter()
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => true
      if (closeDuringNative) {
        child.kill = () => {
          setTimeout(() => { resources.nativeClosed = true; child.emit('close', null) }, 30)
          return true
        }
        queueMicrotask(() => page.emit('close'))
        return child
      }
      queueMicrotask(() => {
        if (args.includes('-show_entries')) {
          const hasAudio = !splitAudio || !args.at(-1).endsWith('-video.mp4')
          const streams = [{ codec_type: 'video' }]
          if (hasAudio) streams.push({ codec_type: 'audio' })
          child.stdout.emit('data', Buffer.from(JSON.stringify({ format: { duration: 8, size: 200 * 1024 }, streams })))
        } else fs.writeFileSync(args.at(-1), Buffer.alloc(200 * 1024))
        child.emit('close', 0)
      })
      return child
    } },
  }, { Date: class extends Date { static now() { return clock } } })
  return { downloader, directory, page, context, nativeCalls, resources, requests }
}

test('shared-context video download validates combined media before publishing the final file', async (t) => {
  const f = downloaderFixture(t)
  const result = await f.downloader.downloadDouyinVideoWithBrowser('https://www.douyin.com/video/12345', f.directory)
  assert.equal(result.size, 200 * 1024)
  assert.ok(fs.existsSync(result.filePath))
  assert.equal(f.nativeCalls.length, 2)
  assert.ok(f.nativeCalls.every((args) => args.includes('-show_entries')))
  assert.equal(f.page.closed, true)
  assert.equal(f.context.listenerCount('close'), 0)
  assert.equal(f.resources.disposedResponses, 1)
})

test('split audio/video is merged with argument arrays and checked with FFprobe', async (t) => {
  const f = downloaderFixture(t, { splitAudio: true })
  await f.downloader.downloadDouyinVideoWithBrowser('https://www.douyin.com/video/12345', f.directory)
  const merge = f.nativeCalls.find((args) => args.includes('-map'))
  assert.ok(merge.includes('0:v:0'))
  assert.ok(merge.includes('1:a:0'))
  assert.equal(f.nativeCalls.length, 3)
  assert.equal(f.resources.disposedResponses, 2)
  assert.equal(fs.readdirSync(f.directory).filter((name) => name.startsWith('.douyin-')).length, 0)
})

test('login/media timeout explains login and verification instead of browser reinstallation', async (t) => {
  const f = downloaderFixture(t, { noMedia: true })
  await assert.rejects(f.downloader.downloadDouyinVideoWithBrowser('https://www.douyin.com/video/12345', f.directory), /等待 2 分钟.*完成登录或验证/)
  assert.equal(f.nativeCalls.length, 0)
  assert.equal(f.page.closed, true)
})

test('closing the task page cancels an outstanding download and clears temporary files', async (t) => {
  const f = downloaderFixture(t, { closeDuringRequest: true })
  await assert.rejects(f.downloader.downloadDouyinVideoWithBrowser('https://www.douyin.com/video/12345', f.directory), /窗口已关闭/)
  assert.equal(f.page.closed, true)
  assert.equal(f.context.listenerCount('close'), 0)
  assert.equal(fs.readdirSync(f.directory).filter((name) => name.startsWith('.douyin-')).length, 0)
})

test('native cancellation waits for process close before reporting completion and clearing files', async (t) => {
  const f = downloaderFixture(t, { closeDuringNative: true })
  await assert.rejects(f.downloader.downloadDouyinVideoWithBrowser('https://www.douyin.com/video/12345', f.directory), /窗口已关闭/)
  assert.equal(f.resources.nativeClosed, true)
  assert.equal(fs.readdirSync(f.directory).filter((name) => name.startsWith('.douyin-')).length, 0)
})

test('larger recommendation media cannot replace the requested work', async (t) => {
  const f = downloaderFixture(t, { recommendation: true })
  const result = await f.downloader.downloadDouyinVideoWithBrowser('https://www.douyin.com/video/12345', f.directory)
  assert.equal(result.videoId, '12345')
  assert.deepEqual(f.requests, ['https://example.invalid/video.mp4'])
})

test('media without target metadata fails clearly instead of downloading an unrelated response', async (t) => {
  const f = downloaderFixture(t, { missingMetadata: true })
  await assert.rejects(f.downloader.downloadDouyinVideoWithBrowser('https://www.douyin.com/video/12345', f.directory), /可确认属于目标作品/)
  assert.equal(f.requests.length, 0)
  assert.equal(f.nativeCalls.length, 0)
})

test('invalid inputs and external top-level redirects are rejected', async (t) => {
  const f = downloaderFixture(t, { externalRedirect: true })
  await assert.rejects(f.downloader.downloadDouyinVideoWithBrowser('file:///C:/private.txt', f.directory), /抖音|分享链接/)
  await assert.rejects(f.downloader.downloadDouyinVideoWithBrowser('https://www.douyin.com/video/12345', f.directory), /重定向到了其他网站/)
  assert.equal(f.page.redirectAborted, true)
  assert.equal(f.requests.length, 0)
})

test('real Chromium local fixture: isolated profile, persistence, queue, and close recovery', {
  skip: process.env.LIYING_BROWSER_INTEGRATION !== '1', timeout: 180000,
}, async () => {
  const http = require('node:http')
  const crypto = require('node:crypto')
  const esbuild = require(require.resolve('esbuild', { paths: [require.resolve('vite/package.json')] }))
  assert.ok(process.env.LIYING_BROWSER_RUN_DIR, 'LIYING_BROWSER_RUN_DIR must be an explicit output folder')
  const runDir = path.resolve(process.env.LIYING_BROWSER_RUN_DIR)
  fs.mkdirSync(runDir, { recursive: true })
  const userData = fs.mkdtempSync(path.join(runDir, 'isolated user data '))
  const profile = path.join(userData, 'app-data2', 'browser', 'douyin')
  const entry = path.resolve(__dirname, '../src/main/douyin-browser-session.ts')
  const bundledBrowser = path.resolve(__dirname, '../chrome/chrome.exe')
  assert.equal(process.platform, 'win32', 'This integration fixture currently expects the Windows repo Chromium')
  assert.ok(fs.existsSync(bundledBrowser), 'Download repo chrome/chrome.exe before opting in')
  const built = path.join(runDir, 'browser-session.cjs')
  await esbuild.build({
    entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile: built,
    plugins: [{ name: 'isolated-electron-app', setup(build) {
      build.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fixture' }))
      build.onResolve({ filter: /^playwright$/ }, () => ({ path: require.resolve('playwright'), external: true }))
      // platform-paths also exports unrelated agent paths; avoid loading the local server during this fixture.
      build.onResolve({ filter: /^\.\/local-server$/ }, () => ({ path: 'local-server', namespace: 'fixture' }))
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: module }) => ({
        contents: module === 'electron'
          ? `export const app = { isPackaged: false, getPath(name) { if(name !== 'userData') throw Error('Unexpected app path'); return ${JSON.stringify(userData)} } }`
          : `export function getUserDataPath() { throw Error('Unexpected local-server access') }`, loader: 'js',
      }))
    } }],
  })
  const session = require(built)
  const report = {
    startedAt: new Date().toISOString(), runDir, isolatedProfile: profile, executable: bundledBrowser,
    executableSha256: crypto.createHash('sha256').update(fs.readFileSync(bundledBrowser)).digest('hex'),
    steps: [], status: 'running',
  }
  const server = http.createServer((request, response) => {
    if (request.url === '/cookies') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ cookie: request.headers.cookie || '' }))
    } else {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end('<!doctype html><title>Liying local browser fixture</title><h1 id="fixture">Local fixture only</h1>')
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  async function fixturePage(context) {
    await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
    const page = await context.newPage()
    await page.goto(origin, { waitUntil: 'domcontentloaded' })
    assert.equal(await page.title(), 'Liying local browser fixture')
    assert.equal(await page.locator('#fixture').textContent(), 'Local fixture only')
    return page
  }
  async function step(name, work) {
    const start = Date.now()
    await work()
    report.steps.push({ name, passed: true, durationMs: Date.now() - start })
  }
  try {
    assert.equal(session.isDouyinBrowserAvailable(), true)
    await step('real visible bundled browser and page/context HTTP share isolated state', () => session.withDouyinBrowser(async (context) => {
      const page = await fixturePage(context)
      const cdp = await context.newCDPSession(page)
      report.browserVersion = (await cdp.send('Browser.getVersion')).product
      const command = (await cdp.send('Browser.getBrowserCommandLine')).arguments
      assert.equal(path.resolve(command[0]).toLowerCase(), bundledBrowser.toLowerCase())
      assert.ok(command.includes(`--user-data-dir=${profile}`))
      assert.ok(!command.some((arg) => /^--headless/.test(arg)))
      await cdp.detach()
      await context.addCookies([{ name: 'fixture_session', value: 'local-only', url: origin, expires: Math.floor(Date.now() / 1000) + 3600 }])
      await page.evaluate(() => localStorage.setItem('fixture', 'local-only'))
      const response = await context.request.get(`${origin}/cookies`)
      try { assert.match((await response.json()).cookie, /fixture_session=local-only/) }
      finally { await response.dispose() }
      await page.screenshot({ path: path.join(runDir, 'local-fixture.png') })
    }))
    await step('cookies and localStorage survive browser relaunch', () => session.withDouyinBrowser(async (context) => {
      const page = await fixturePage(context)
      assert.ok((await context.cookies(origin)).some((cookie) => cookie.name === 'fixture_session' && cookie.value === 'local-only'))
      assert.equal(await page.evaluate(() => localStorage.getItem('fixture')), 'local-only')
    }))
    await step('tasks serialize and a failing task releases the profile', async () => {
      let release, firstReady
      const gate = new Promise((resolve) => { release = resolve })
      const ready = new Promise((resolve) => { firstReady = resolve })
      let secondStarted = false
      let firstContext
      const first = session.withDouyinBrowser(async (context) => {
        firstContext = context
        await fixturePage(context)
        firstReady()
        await gate
        throw new Error('intentional local fixture failure')
      })
      const rejected = assert.rejects(first, /intentional local fixture failure/)
      const second = session.withDouyinBrowser(async (context) => {
        secondStarted = true
        assert.equal(firstContext.pages().length, 0)
        await fixturePage(context)
      })
      await ready
      await new Promise((resolve) => setTimeout(resolve, 150))
      assert.equal(secondStarted, false)
      release()
      await rejected
      await second
    })
    await step('actual browser close cancels pending work and the next task recovers', async () => {
      await assert.rejects(session.withDouyinBrowser(async (context) => {
        const page = await fixturePage(context)
        const cdp = await context.newCDPSession(page)
        // Browser.close closes the real browser process, as closing its final window does.
        setTimeout(() => { cdp.send('Browser.close').catch(() => {}) }, 50)
        return new Promise(() => {})
      }), /窗口已关闭，本次操作已取消/)
      await session.withDouyinBrowser(async (context) => { await fixturePage(context) })
    })
    await step('explicit cancellation closes the real active context and releases its profile', async () => {
      const controller = new AbortController()
      await assert.rejects(session.withDouyinBrowser(async (context) => {
        await fixturePage(context)
        setTimeout(() => controller.abort(new Error('local fixture user cancellation')), 50)
        return new Promise(() => {})
      }, controller.signal), /local fixture user cancellation/)
      await session.withDouyinBrowser(async (context) => { await fixturePage(context) })
    })
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'; report.error = error.stack || String(error)
    throw error
  } finally {
    report.finishedAt = new Date().toISOString()
    report.sourceSha256 = Object.fromEntries(['src/main/douyin-browser-session.ts', 'src/main/douyin-browser-paths.ts', 'src/main/douyin-browser-downloader.ts', 'tests/douyin-browser.test.cjs'].map((file) => [file, crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '..', file))).digest('hex')]))
    fs.writeFileSync(path.join(runDir, 'integration-report.json'), JSON.stringify(report, null, 2) + '\n')
    await new Promise((resolve) => server.close(resolve))
  }
})
