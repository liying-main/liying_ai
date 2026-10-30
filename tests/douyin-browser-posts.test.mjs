import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import * as parser from '../src/main/douyin-post-parser.ts'

// Transpile the orchestration module in memory; no Electron process, browser,
// network requests, paid API, or generated files are involved in these tests.
const require = createRequire(import.meta.url)
const source = fs.readFileSync(new URL('../src/main/douyin-browser-posts.ts', import.meta.url), 'utf8')
const module = { exports: {} }
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
new Function('require', 'module', 'exports', compiled)((name) => {
  if (name === './douyin-post-parser') return parser
  if (name === './douyin-browser-session') return { withDouyinBrowser: () => { throw new Error('real browser forbidden in unit tests') } }
  return require(name)
}, module, module.exports)
const { collectDouyinPostsInContext, downloadDouyinUserPostsWithBrowser } = module.exports

const AUTHOR = 'MS4wLjABAAAA_target_author'
const OTHER = 'MS4wLjABAAAA_other_author'
const PROFILE = `https://www.douyin.com/user/${AUTHOR}`
const VIDEO = '7350000000000000001'
const post = (id = VIDEO, author = AUTHOR, desc = '我的公开作品文案') => ({ aweme_id: id, desc, author: { sec_uid: author } })
const blank = () => ({ json: [], posts: [], text: '', blocked: false })
const response = (data, author = AUTHOR, kind = 'post') => ({
  url: () => `https://www.douyin.com/aweme/v1/web/aweme/${kind}/?sec_user_id=${author}`,
  ok: () => true,
  headers: () => ({ 'content-type': 'application/json' }),
  text: async () => JSON.stringify(data),
})

function fakeBrowser({ snapshot = () => blank(), redirect, onGoto = () => {}, afterWait = () => {} } = {}) {
  let time = 0
  let current = 'about:blank'
  let closed = false
  let routeHandler
  const handlers = new Map()
  const navigations = []
  const mainFrame = {}
  const emit = (data, author, kind) => handlers.get('response')?.(response(data, author, kind))
  const page = {
    on: (name, fn) => handlers.set(name, fn),
    off: name => handlers.delete(name),
    route: async (_pattern, fn) => { routeHandler = fn },
    mainFrame: () => mainFrame,
    goto: async url => { current = redirect?.(url) || url; navigations.push(current); onGoto({ url: current, emit }) },
    url: () => current,
    evaluate: async script => script.includes('return {json, posts, text, blocked}') ? snapshot({ time, url: current, emit }) : undefined,
    isClosed: () => closed,
    close: async () => { closed = true },
  }
  return {
    context: { newPage: async () => page },
    timing: { timeoutMs: 12000, now: () => time, wait: async ms => { time += ms; afterWait({ time, emit, navigate: url => { current = url } }) } },
    navigations,
    closed: () => closed,
    listeners: () => handlers.size,
    testRoute: async url => {
      let decision
      await routeHandler({
        request: () => ({ isNavigationRequest: () => true, frame: () => mainFrame, url: () => url }),
        abort: async () => { decision = 'abort' }, continue: async () => { decision = 'continue' },
      })
      return decision
    },
  }
}

test('accepts official share text and rejects forged hosts, credentials, protocols and ports', () => {
  assert.equal(parser.validateDouyinUrl(`复制 https://v.douyin.com/abc/ 打开抖音`), 'https://v.douyin.com/abc/')
  for (const url of ['https://douyin.com.evil.test/user/abc', 'https://evil.test/user/abc', 'file:///tmp/douyin.com', 'javascript:alert(1)', 'https://user:pass@douyin.com/', 'https://douyin.com:8443/', '//douyin.com/user/a']) {
    assert.throws(() => parser.validateDouyinUrl(url), /抖音|http/)
  }
})

test('extracts precise video/profile identifiers and rejects unsafe or ambiguous IDs', () => {
  assert.equal(parser.secUidFromDouyinUrl(PROFILE), AUTHOR)
  assert.equal(parser.secUidFromDouyinUrl(`https://www.iesdouyin.com/share/user/${AUTHOR}`), AUTHOR)
  assert.equal(parser.videoIdFromDouyinUrl(`${PROFILE}?modal_id=${VIDEO}`), VIDEO)
  assert.equal(parser.secUidFromDouyinUrl('https://www.douyin.com/user/%2e%2e'), null)
  assert.equal(parser.videoIdFromDouyinUrl('https://www.douyin.com/video/abc'), null)
})

test('filters wrong and missing authors, retains exact 19-digit IDs, deduplicates and caps at 30', () => {
  const payload = { aweme_list: [post(VIDEO, OTHER), { aweme_id: '7350000000000000002', desc: '无作者' }, post(), post(), ...Array.from({ length: 60 }, (_, i) => post(String(7350000000000000010n + BigInt(i))))] }
  const result = parser.postsForAuthor(payload, AUTHOR)
  assert.equal(result.length, 30)
  assert.equal(result[0].id, VIDEO)
  assert.equal(new Set(result.map(item => item.id)).size, 30)
  assert.equal(parser.postsForAuthor({ aweme_list: [{ ...post(), aweme_id: Number(VIDEO) }] }, AUTHOR).length, 0)
})

test('video author comes from the exact video, never a recommendation or numeric author uid', () => {
  const payload = { recommendations: [post('7350000000000000999', OTHER)], videoInfoRes: { item_list: [post()] } }
  assert.equal(parser.authorForVideo(payload, VIDEO), AUTHOR)
  assert.equal(parser.authorForVideo({ aweme_list: [post('7350000000000000999', OTHER)] }, VIDEO), null)
  assert.equal(parser.authorForVideo([{ ...post(), author: { uid: '123456789' } }], VIDEO), null)
  assert.equal(parser.authorForVideo([post(), post(VIDEO, OTHER)], VIDEO), null)
})

test('parses encoded hydration safely and distinguishes empty/error/paginated responses', () => {
  const payload = { aweme_list: [], has_more: 0, status_code: 0 }
  assert.deepEqual(parser.parsePageJson(encodeURIComponent(JSON.stringify(payload))), payload)
  assert.equal(parser.parsePageJson('window.data = malicious()'), null)
  assert.equal(parser.parsePageJson('x'.repeat(3000001)), null)
  assert.deepEqual(parser.postResponseState(payload), { ended: true, empty: true })
  assert.deepEqual(parser.postResponseState({ ...payload, status_code: 4 }), { ended: false, empty: false })
  assert.deepEqual(parser.postResponseState({ ...payload, has_more: 1 }), { ended: false, empty: false })
})

test('invalid URL is rejected before opening a browser', async () => {
  await assert.rejects(downloadDouyinUserPostsWithBrowser('https://example.com/user/target'), /仅支持抖音/)
  await assert.rejects(collectDouyinPostsInContext({ newPage: () => assert.fail('must not open page') }, 'file:///tmp/video'), /抖音/)
})

test('collects matching author posts and ignores another profile response', async () => {
  const fake = fakeBrowser({ onGoto: ({ emit }) => {
    emit({ aweme_list: [post('7350000000000000099')], has_more: 0 }, OTHER)
    emit({ aweme_list: [post(), post('7350000000000000002', OTHER)], has_more: 0 })
  } })
  const result = await collectDouyinPostsInContext(fake.context, PROFILE, fake.timing)
  assert.deepEqual(result.posts.map(item => item.id), [VIDEO])
  assert.equal(result.resolvedFrom, 'direct')
  assert.equal(fake.closed(), true)
  assert.equal(fake.listeners(), 0)
  assert.equal(await fake.testRoute('https://evil.test/'), 'abort')
  assert.equal(await fake.testRoute(PROFILE), 'continue')
})

test('a video share resolves its exact author then navigates to the canonical profile', async () => {
  const fake = fakeBrowser({
    redirect: url => url.includes('v.douyin.com') ? `https://www.douyin.com/video/${VIDEO}` : url,
    snapshot: ({ url }) => url.includes('/video/') ? { ...blank(), json: [JSON.stringify({ detail: post(), recommendations: [post('7350000000000000099', OTHER)] })] } : blank(),
    onGoto: ({ url, emit }) => { if (url === PROFILE) emit({ aweme_list: [post()], has_more: false }) },
  })
  const result = await collectDouyinPostsInContext(fake.context, 'https://v.douyin.com/share/', fake.timing)
  assert.equal(result.resolvedProfileUrl, PROFILE)
  assert.equal(result.resolvedFrom, 'video')
  assert.deepEqual(fake.navigations, [`https://www.douyin.com/video/${VIDEO}`, PROFILE])
})

test('never resolves a video author from unrelated recommendation data', async () => {
  const fake = fakeBrowser({ snapshot: () => ({ ...blank(), json: [JSON.stringify({ list: [post('7350000000000000099', OTHER)] })] }) })
  await assert.rejects(collectDouyinPostsInContext(fake.context, `https://www.douyin.com/video/${VIDEO}`, fake.timing), /未能.*确认其作者/)
  assert.equal(fake.navigations.length, 1)
  assert.equal(fake.closed(), true)
})

test('keeps the requested video pinned after navigation to a recommended video', async () => {
  const unrelated = '7350000000000000099'
  const fake = fakeBrowser({
    snapshot: () => ({ ...blank(), json: [JSON.stringify({ detail: post(unrelated, OTHER) })] }),
    afterWait: ({ navigate }) => navigate(`https://www.douyin.com/video/${unrelated}`),
  })
  await assert.rejects(collectDouyinPostsInContext(fake.context, `https://www.douyin.com/video/${VIDEO}`, fake.timing), /未能.*确认其作者/)
  assert.equal(fake.navigations.length, 1)
})

test('cancellation closes an active collection and rejects even if posts arrived', async () => {
  const controller = new AbortController()
  const fake = fakeBrowser({
    afterWait: ({ emit }) => {
      emit({ aweme_list: [post()], has_more: 0 })
      controller.abort()
    },
  })
  await assert.rejects(collectDouyinPostsInContext(fake.context, PROFILE, { ...fake.timing, signal: controller.signal }), { name: 'AbortError' })
  assert.equal(fake.closed(), true)
  assert.equal(fake.listeners(), 0)
})

test('an already cancelled collection never creates a page', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(collectDouyinPostsInContext({ newPage: () => assert.fail('cancelled collection opened a page') }, PROFILE, { signal: controller.signal }), { name: 'AbortError' })
})

test('allows time for manual login and resumes after a matching posts response', async () => {
  const fake = fakeBrowser({
    snapshot: ({ time }) => ({ ...blank(), blocked: time < 3000 }),
    afterWait: ({ time, emit }) => { if (time === 3000) emit({ aweme_list: [post()], has_more: 0 }) },
  })
  const result = await collectDouyinPostsInContext(fake.context, PROFILE, fake.timing)
  assert.equal(result.posts.length, 1)
})

test('login timeout gives an actionable message and cleans its page', async () => {
  const fake = fakeBrowser({ snapshot: () => ({ ...blank(), blocked: true, text: '扫码登录' }) })
  await assert.rejects(collectDouyinPostsInContext(fake.context, PROFILE, fake.timing), /登录.*验证超时/)
  assert.equal(fake.closed(), true)
})

test('empty public profile is reported accurately instead of missing downloader', async () => {
  const fake = fakeBrowser({ onGoto: ({ emit }) => emit({ aweme_list: [], has_more: 0, status_code: 0 }) })
  await assert.rejects(collectDouyinPostsInContext(fake.context, PROFILE, fake.timing), /没有可读取的公开作品/)
})

test('private profile is not mistaken for a downloader failure', async () => {
  const fake = fakeBrowser({ snapshot: () => ({ ...blank(), text: '这是私密账号' }) })
  await assert.rejects(collectDouyinPostsInContext(fake.context, PROFILE, fake.timing), /作品未公开/)
})

test('DOM fallback accepts only valid video links and does not operate after leaving the target profile', async () => {
  const fake = fakeBrowser({ snapshot: () => ({ ...blank(), posts: [
    { href: `https://www.douyin.com/video/${VIDEO}`, desc: '主页作品' },
    { href: 'https://evil.test/video/7350000000000000002', desc: '外站内容' },
  ] }) })
  const result = await collectDouyinPostsInContext(fake.context, PROFILE, fake.timing)
  assert.deepEqual(result.posts.map(item => item.desc), ['主页作品'])
  const wrong = fakeBrowser({ redirect: () => `https://www.douyin.com/user/${OTHER}`, snapshot: () => ({ ...blank(), posts: [{ href: `https://www.douyin.com/video/${VIDEO}`, desc: '其他主页' }] }) })
  await assert.rejects(collectDouyinPostsInContext(wrong.context, PROFILE, wrong.timing), /未读取到/)
})
