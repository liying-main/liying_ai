import type { BrowserContext, Response } from 'playwright'
import { withDouyinBrowser } from './douyin-browser-session'
import {
  authorForVideo, mergePosts, parsePageJson, postResponseState, postsForAuthor,
  secUidFromDouyinUrl, validateDouyinUrl, videoIdFromDouyinUrl,
} from './douyin-post-parser'
import type { DouyinPost } from './douyin-post-parser'

interface PageSnapshot {
  json: string[]
  posts: Array<{ href: string; desc: string }>
  text: string
  blocked: boolean
}

// Only the author's works region is eligible for the DOM fallback. Never scan all
// video links: the surrounding page also contains recommendations from other authors.
const SNAPSHOT_SCRIPT = `(() => {
  const json = [];
  for (const node of document.querySelectorAll('script#RENDER_DATA, script#__NEXT_DATA__, script#SIGI_STATE, script[type="application/json"]')) {
    const value = node.textContent || '';
    if (value.length && value.length <= 3000000 && json.length < 8) json.push(value);
  }
  for (const key of ['_ROUTER_DATA', '__INITIAL_STATE__', 'SIGI_STATE']) {
    try {
      const value = JSON.stringify(window[key]);
      if (value && value.length <= 3000000 && json.length < 12) json.push(value);
    } catch {}
  }
  const roots = Array.from(document.querySelectorAll('[data-e2e="user-post-list"], [data-e2e="user-post"]'));
  const posts = [];
  for (const root of roots) {
    for (const anchor of root.querySelectorAll('a[href*="/video/"], a[href*="/note/"]')) {
      const descNode = anchor.querySelector('[data-e2e="video-desc"]');
      const image = anchor.querySelector('img[alt]');
      const desc = (descNode && descNode.textContent) || (image && image.alt) || anchor.getAttribute('title') || anchor.getAttribute('aria-label') || '';
      if (desc.trim()) posts.push({href: anchor.href, desc: desc.trim().slice(0, 10000)});
      if (posts.length >= 100) break;
    }
  }
  const text = (document.body && document.body.innerText || '').slice(0, 15000);
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [class*="captcha"], [id*="captcha"], [class*="login-panel"], [data-e2e="login-dialog"]'))
    .filter(node => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0)
    .map(node => node.innerText || '').join(' ');
  const blocked = /扫码登录|短信登录|验证码|完成验证|安全验证|拖动.*滑块|请先登录/.test(dialogs) || /登录后(?:查看|浏览|查看更多)|请完成验证|请通过安全验证/.test(text);
  return {json, posts, text, blocked};
})()`

const NOTICE_SCRIPT = `(() => {
  if (!document.body || document.getElementById('liying-douyin-notice')) return;
  const bar = document.createElement('div');
  bar.id = 'liying-douyin-notice';
  bar.textContent = '厉影正在读取此博主的公开作品；如出现登录或验证，请在此窗口手动完成，完成后自动继续（最多等待 120 秒）。';
  bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;padding:12px;background:#172554;color:white;border-radius:8px;font:14px sans-serif;pointer-events:none';
  document.body.appendChild(bar);
})()`

export interface DouyinPostsResult {
  posts: DouyinPost[]
  resolvedProfileUrl: string
  resolvedFrom: 'direct' | 'share' | 'video'
}

/** Uses only requests made by the normal web page. No private API or signature generation. */
export async function collectDouyinPostsInContext(
  context: BrowserContext,
  input: string,
  timing: { timeoutMs?: number; now?: () => number; wait?: (ms: number) => Promise<void>; signal?: AbortSignal } = {},
): Promise<DouyinPostsResult> {
  const inputUrl = validateDouyinUrl(input)
  const signal = timing.signal
  signal?.throwIfAborted()
  const now = timing.now || Date.now
  const wait = timing.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const deadline = now() + Math.min(timing.timeoutMs ?? 120_000, 120_000)
  const page = await context.newPage()
  const responses: Array<{ kind: 'post' | 'detail'; secUid: string | null; data: unknown }> = []
  const posts = new Map<string, DouyinPost>()
  let active = true
  // Pin the requested video, including the first resolved short-link target. A
  // manual navigation or recommendation must never silently select a new author.
  let requestedVideoId = videoIdFromDouyinUrl(inputUrl)
  let target = requestedVideoId ? null : secUidFromDouyinUrl(inputUrl)
  let profileUrl = target ? `https://www.douyin.com/user/${target}` : ''
  let resolvedFrom: DouyinPostsResult['resolvedFrom'] = target ? 'direct' : 'share'
  let blocked = false
  let ended = false
  let verifiedEmpty = false
  let lastGrowth = now()

  const onResponse = (response: Response): void => {
    void (async () => {
      try {
        const url = new URL(validateDouyinUrl(response.url()))
        const match = url.pathname.match(/\/aweme\/v\d+\/(?:web\/)?aweme\/(post|detail)\/?$/)
        if (!match || !response.ok()) return
        const headers = response.headers()
        if (Number(headers['content-length'] || 0) > 3_000_000 ||
          !/json/i.test(headers['content-type'] || '')) return
        const data = parsePageJson(await response.text())
        if (active && data) {
          if (responses.length >= 40) responses.shift()
          responses.push({ kind: match[1] as 'post' | 'detail', secUid: secUidFromDouyinUrl(url.toString()), data })
        }
      } catch { /* Navigation, non-JSON and unrelated third-party responses are ignored. */ }
    })()
  }
  page.on('response', onResponse)
  const onAbort = (): void => { void page.close().catch(() => {}) }
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    signal?.throwIfAborted()
    // Reject external top-level redirects before navigating them. Subresources are
    // left to the normal page, including its login and verification UI.
    await page.route('**/*', async route => {
      const request = route.request()
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        try { validateDouyinUrl(request.url()) } catch { await route.abort(); return }
      }
      await route.continue()
    })
    const navigate = async (url: string): Promise<void> => {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.max(1, Math.min(30_000, deadline - now())) })
      } catch (error) {
        signal?.throwIfAborted()
        if (page.isClosed()) throw new Error('抖音浏览器窗口已关闭，请重新分析')
        if (!(error instanceof Error) || !/Timeout|ERR_ABORTED/.test(error.message)) throw error
      }
    }
    await navigate(profileUrl || inputUrl)
    while (now() < deadline) {
      signal?.throwIfAborted()
      if (page.isClosed()) throw new Error('抖音浏览器窗口已关闭，请重新分析')
      let currentUrl: string
      try { currentUrl = validateDouyinUrl(page.url()) } catch {
        throw new Error('抖音分享链接未打开有效页面，请重新复制博主主页链接')
      }
      let snapshot: PageSnapshot
      try {
        await page.evaluate(NOTICE_SCRIPT)
        snapshot = await page.evaluate(SNAPSHOT_SCRIPT) as PageSnapshot
      } catch {
        signal?.throwIfAborted()
        // User-initiated navigation during login can replace the execution context.
        await wait(500)
        continue
      }
      blocked = snapshot.blocked
      const hydration = snapshot.json.map(parsePageJson).filter(Boolean)
      if (!target) {
        requestedVideoId ||= videoIdFromDouyinUrl(currentUrl)
        const videoId = requestedVideoId
        if (videoId) {
          const candidates = new Set<string>()
          for (const data of [...hydration, ...responses.filter(item => item.kind === 'detail').map(item => item.data)]) {
            const uid = authorForVideo(data, videoId)
            if (uid) candidates.add(uid)
          }
          if (candidates.size === 1) {
            target = [...candidates][0]
            resolvedFrom = 'video'
          }
        } else {
          target = secUidFromDouyinUrl(currentUrl)
        }
        if (target) {
          profileUrl = `https://www.douyin.com/user/${target}`
          responses.length = 0
          await navigate(profileUrl)
          continue
        }
      } else if (secUidFromDouyinUrl(currentUrl) === target && !videoIdFromDouyinUrl(currentUrl)) {
        const before = posts.size
        for (const response of responses.splice(0)) {
          if (response.kind !== 'post' || response.secUid !== target) continue
          mergePosts(posts, postsForAuthor(response.data, target))
          const state = postResponseState(response.data)
          ended ||= state.ended
          verifiedEmpty ||= state.empty
        }
        for (const data of hydration) mergePosts(posts, postsForAuthor(data, target))
        for (const entry of snapshot.posts) {
          const id = videoIdFromDouyinUrl(entry.href)
          if (id && entry.desc.trim()) mergePosts(posts, [{ id, aweme_id: id, desc: entry.desc.trim() }])
        }
        if (posts.size > before) lastGrowth = now()
        if (posts.size >= 30 || (posts.size && !blocked && (ended || now() - lastGrowth >= 8000))) break
        if (!posts.size && !blocked) {
          if (/私密账号|私密帐号|仅.*朋友.*可见|暂时无法查看.*作品/.test(snapshot.text)) {
            throw new Error('该博主的作品未公开，当前登录账号无法查看；请使用有公开作品的主页')
          }
          if (verifiedEmpty || /暂无作品|还没有发布.*作品|该用户没有发布作品/.test(snapshot.text)) {
            throw new Error('该博主主页当前没有可读取的公开作品，无法进行选题分析')
          }
        }
        if (!blocked) {
          await page.evaluate(`(() => {
            const root = document.querySelector('[data-e2e="user-post-list"]') || document.querySelector('[data-e2e="user-post"]');
            if (root && root.lastElementChild) root.lastElementChild.scrollIntoView({block: 'end'});
            window.scrollBy(0, Math.max(window.innerHeight, 800));
          })()`)
        }
      }
      await wait(Math.min(1000, Math.max(1, deadline - now())))
    }
    signal?.throwIfAborted()
    if (posts.size) return { posts: [...posts.values()], resolvedProfileUrl: profileUrl, resolvedFrom }
    if (blocked) throw new Error('等待抖音登录或安全验证超时。请重新分析，并在打开的浏览器中于 120 秒内手动完成登录/验证')
    if (!target) throw new Error('未能从分享视频确认其作者，请从抖音博主主页「分享主页」复制链接后重试')
    throw new Error('未读取到该博主的公开作品。页面可能尚未加载或作品区结构已变化，请确认浏览器中能看到作品后重试')
  } finally {
    active = false
    signal?.removeEventListener('abort', onAbort)
    page.off('response', onResponse)
    await page.close().catch(() => {})
  }
}

export async function downloadDouyinUserPostsWithBrowser(input: string, signal?: AbortSignal): Promise<DouyinPostsResult> {
  validateDouyinUrl(input)
  return withDouyinBrowser(context => collectDouyinPostsInContext(context, input, { signal }), signal)
}
