import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import ts from 'typescript'

const component = fs.readFileSync(new URL('../src/renderer/src/pages/Video/VideoScriptCard.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('VideoScriptCard.tsx', component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const actionNames = [
  'beginTopicRun', 'isTopicRunActive', 'collectTopicPosts', 'requestTopicLlmContent',
  'runTopicStyleAnalysisWithPosts', 'runTopicIdeasWithPosts', 'handleOpenTopicAnalysis',
  'handleCancelTopicAnalysis', 'handleRefreshTopicIdeas', 'handleGenerateScriptsForTopic',
]
const declarations = new Map()
function visit(node) {
  if (ts.isVariableDeclaration(node) && actionNames.includes(node.name.getText(ast))) {
    declarations.set(node.name.getText(ast), node.initializer.getText(ast))
  }
  ts.forEachChild(node, visit)
}
visit(ast)
assert.equal(declarations.size, actionNames.length)
// Execute the component's real action bodies with only UI/IPC/HTTP boundaries mocked.
// This avoids a second implementation of the cancellation state machine in tests.
const actionsSource = actionNames.map(name => `const ${name} = ${declarations.get(name)};`).join('\n')
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const nextTurn = () => new Promise(resolve => setImmediate(resolve))
const postsResult = { success: true, posts: [{ id: '7350000000000000001', desc: '公开作品' }] }
const answer = content => ({ choices: [{ message: { content } }] })

function topicFixture({ download, completion, ...overrides } = {}) {
  const writes = [], calls = [], downloads = [], cancels = []
  const env = {
    AbortController, crypto,
    topicRunRef: { current: null },
    fixedLlmModel: 'test-model',
    ipBrain: { id: 'author', homepage: 'https://www.douyin.com/user/test_author' },
    topicStyleText: '已有风格', topicPostsSnapshot: null, ipBrainLength: '150', sourceLanguage: 'zh',
    TOPIC_ANALYSIS_GUARDRAIL: '', DOUYIN_HOMEPAGE_HINT: '',
    validateHomepageForTopicAnalysis: () => ({ ok: true }),
    normalizeDouyinUrlForDownloader: value => value,
    formatDouyinProfileError: value => value,
    buildPostDescLines: posts => posts.map(post => post.desc).join('\n'),
    getLanguageName: () => '中文',
    showToast: (...args) => writes.push(['toast', ...args]),
    applyResolvedDouyinProfile: () => writes.push(['resolved-profile']),
    setTimeout: fn => { queueMicrotask(fn); return 0 },
    console: { error: () => {} },
    window: { api: {
      downloadDouyinUserPosts: (...args) => { downloads.push(args); return download?.(...args) ?? Promise.resolve(postsResult) },
      cancelDouyinUserPosts: async id => { cancels.push(id); return true },
    } },
    llmService: { completion: (...args) => { calls.push(args); return completion?.(...args) ?? Promise.resolve(answer(calls.length === 1 ? '【风格与定位分析】风格' : '【推荐选题】\n1、选题一\n2、选题二')) } },
    ...overrides,
  }
  for (const name of new Set(actionsSource.match(/\bset[A-Z]\w+/g))) {
    if (name !== 'setTimeout') env[name] = value => writes.push([name, value])
  }
  const actions = new Function(...Object.keys(env), `${actionsSource}\nreturn {${actionNames.join(',')}};`)(...Object.values(env))
  return { ...actions, writes, calls, downloads, cancels, env }
}

test('normal collection still produces style followed by topics', async () => {
  const fixture = topicFixture()
  await fixture.handleOpenTopicAnalysis()
  assert.equal(fixture.downloads.length, 1)
  assert.match(fixture.downloads[0][1], /^[a-f0-9-]{36}$/)
  assert.equal(fixture.calls.length, 2)
  assert.ok(fixture.writes.some(([name, value]) => name === 'setTopicIdeas' && value.length === 2))
  assert.equal(fixture.cancels.length, 0)
})

test('cancel during collection sends matching IPC cancellation and never calls the model', async () => {
  const pending = deferred()
  const fixture = topicFixture({ download: () => pending.promise })
  const run = fixture.handleOpenTopicAnalysis()
  fixture.handleCancelTopicAnalysis()
  const writesAfterCancel = fixture.writes.length
  pending.resolve(postsResult)
  await run
  assert.deepEqual(fixture.cancels, [fixture.downloads[0][1]])
  assert.equal(fixture.calls.length, 0)
  assert.equal(fixture.writes.length, writesAfterCancel)
})

test('cancel during style aborts HTTP and prevents retries or topic generation', async () => {
  const pending = deferred()
  const fixture = topicFixture({ completion: () => pending.promise })
  const run = fixture.handleOpenTopicAnalysis()
  await nextTurn()
  assert.equal(fixture.calls.length, 1)
  const signal = fixture.calls[0][2].signal
  fixture.handleCancelTopicAnalysis()
  assert.equal(signal.aborted, true)
  const writesAfterCancel = fixture.writes.length
  pending.reject(new Error('request aborted'))
  await run
  assert.equal(fixture.calls.length, 1)
  assert.equal(fixture.writes.length, writesAfterCancel)
})

test('a late old task cannot overwrite a newer analysis or issue any model request', async () => {
  const old = deferred(), newer = deferred()
  let count = 0
  const fixture = topicFixture({ download: () => (++count === 1 ? old : newer).promise })
  const oldRun = fixture.handleOpenTopicAnalysis()
  const newRun = fixture.handleOpenTopicAnalysis()
  const writesAfterStart = fixture.writes.length
  old.resolve(postsResult)
  await oldRun
  assert.equal(fixture.calls.length, 0)
  assert.equal(fixture.writes.length, writesAfterStart)
  assert.deepEqual(fixture.cancels, [fixture.downloads[0][1]])
  newer.resolve(postsResult)
  await newRun
  assert.equal(fixture.calls.length, 2)
})

test('cancelled refresh and script creation discard late model results', async () => {
  for (const kind of ['refresh', 'script']) {
    const pending = deferred()
    const fixture = topicFixture({ completion: () => pending.promise, topicPostsSnapshot: postsResult.posts })
    const run = kind === 'refresh' ? fixture.handleRefreshTopicIdeas() : fixture.handleGenerateScriptsForTopic('选题')
    fixture.handleCancelTopicAnalysis()
    const writesAfterCancel = fixture.writes.length
    pending.resolve(answer('1、已取消的内容'))
    await run
    assert.equal(fixture.writes.length, writesAfterCancel)
    assert.equal(fixture.calls.length, 1)
    assert.equal(fixture.calls[0][2].signal.aborted, true)
  }
})

test('abort before a model call or during retry delay prevents another HTTP attempt', async () => {
  const delay = deferred()
  const fixture = topicFixture({ completion: async () => { throw new Error('temporary failure') }, setTimeout: fn => { delay.promise.then(fn); return 0 } })
  const run = fixture.beginTopicRun()
  const request = fixture.requestTopicLlmContent([], {}, 'empty', run)
  await nextTurn()
  run.abort()
  delay.resolve()
  await assert.rejects(request, { name: 'AbortError' })
  assert.equal(fixture.calls.length, 1)
  await assert.rejects(fixture.requestTopicLlmContent([], {}, 'empty', run), { name: 'AbortError' })
  assert.equal(fixture.calls.length, 1)
})

function loadLlm({ getConfig, fetch }) {
  const source = fs.readFileSync(new URL('../src/renderer/src/api/llm.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'window', 'fetch', compiled)(
    () => ({ STATION_BASE_URL: 'https://test.invalid/v1', STATION_CHAT_MODEL: 'test' }),
    module, module.exports, { api: { getStationConfig: getConfig } }, fetch,
  )
  return module.exports.llmService
}

test('LLM adapter aborts before fetch if cancellation happens while reading config', async () => {
  const config = deferred(), controller = new AbortController()
  const service = loadLlm({ getConfig: () => config.promise, fetch: () => assert.fail('must not fetch after cancel') })
  const request = service.completion('test', [], { signal: controller.signal })
  controller.abort()
  config.resolve({ apiKey: 'test-only' })
  await assert.rejects(request, { name: 'AbortError' })
})

test('LLM adapter passes the exact AbortSignal to fetch and propagates aborts', async () => {
  const controller = new AbortController(), started = deferred()
  const service = loadLlm({
    getConfig: async () => ({ apiKey: 'test-only' }),
    fetch: (_url, options) => new Promise((_resolve, reject) => {
      assert.equal(options.signal, controller.signal)
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
      started.resolve()
    }),
  })
  const request = service.completion('test', [], { signal: controller.signal })
  await started.promise
  controller.abort()
  await assert.rejects(request, { name: 'AbortError' })
})

function ipcFixture() {
  const source = fs.readFileSync(new URL('../src/main/ipc-handlers/ipc-download.ts', import.meta.url), 'utf8')
  const start = source.indexOf('  const profileRequests = new Map')
  const end = source.indexOf("  ipcMain.handle('upload-voice-and-transcribe'", start)
  assert.ok(start > 0 && end > start)
  const compiled = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const handlers = new Map(), calls = []
  new Function('ipcMain', 'downloadDouyinUserPostsWithBrowser', compiled)(
    { handle: (name, handler) => handlers.set(name, handler) },
    (_url, signal) => { const pending = deferred(); calls.push({ signal, ...pending }); return pending.promise },
  )
  const sender = id => Object.assign(new EventEmitter(), { id })
  return { handlers, calls, sender }
}

test('IPC cancellation is scoped to the requesting window and cleans pending entries', async () => {
  const fixture = ipcFixture(), owner = fixture.sender(1), other = fixture.sender(2)
  const read = fixture.handlers.get('download-douyin-user-posts')
  const cancel = fixture.handlers.get('cancel-douyin-user-posts')
  const promise = read({ sender: owner }, 'https://www.douyin.com/user/test_author', 'request-1')
  assert.equal(cancel({ sender: other }, 'request-1'), false)
  assert.equal(fixture.calls[0].signal.aborted, false)
  assert.equal(cancel({ sender: owner }, 'request-1'), true)
  assert.equal(fixture.calls[0].signal.aborted, true)
  fixture.calls[0].resolve(postsResult)
  assert.equal((await promise).cancelled, true)
  assert.equal(cancel({ sender: owner }, 'request-1'), false)
  assert.equal(owner.listenerCount('destroyed'), 0)
})

test('closing the renderer cancels its collection, and malformed IDs never start it', async () => {
  const fixture = ipcFixture(), owner = fixture.sender(1)
  const read = fixture.handlers.get('download-douyin-user-posts')
  const bad = await read({ sender: owner }, 'https://www.douyin.com/', '../bad')
  assert.equal(bad.success, false)
  assert.equal(fixture.calls.length, 0)
  const promise = read({ sender: owner }, 'https://www.douyin.com/', 'request-1')
  owner.emit('destroyed')
  assert.equal(fixture.calls[0].signal.aborted, true)
  fixture.calls[0].reject(fixture.calls[0].signal.reason)
  assert.equal((await promise).cancelled, true)
})
