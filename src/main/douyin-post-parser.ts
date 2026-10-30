/** Parsing only: never sends requests or evaluates page-provided code. */
export interface DouyinPost {
  id: string
  aweme_id: string
  desc: string
}

const MAX_POSTS = 30
const SAFE_SEC_UID = /^[A-Za-z0-9_-]{8,200}$/
const VIDEO_ID = /^\d{5,30}$/

export function validateDouyinUrl(input: string): string {
  if (typeof input !== 'string') throw new Error('请粘贴抖音主页或视频的 http(s) 分享链接')
  const found = input.trim().match(/https?:\/\/[^\s\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]+/i)
  const raw = (found?.[0] || input.trim()).replace(/[)\]}>"']+$/g, '')
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('请粘贴完整的抖音 http(s) 分享链接') }
  const host = url.hostname.toLowerCase()
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port ||
      !['douyin.com', 'iesdouyin.com'].some(domain => host === domain || host.endsWith(`.${domain}`))) {
    throw new Error('仅支持抖音 douyin.com / iesdouyin.com 的 http(s) 链接')
  }
  return url.toString()
}

export function secUidFromDouyinUrl(input: string): string | null {
  try {
    const url = new URL(validateDouyinUrl(input))
    const raw = url.pathname.match(/^\/(?:share\/)?user\/([^/]+)\/?$/)?.[1] ||
      url.searchParams.get('sec_user_id') || url.searchParams.get('sec_uid') || ''
    const uid = decodeURIComponent(raw)
    return SAFE_SEC_UID.test(uid) ? uid : null
  } catch { return null }
}

export function videoIdFromDouyinUrl(input: string): string | null {
  try {
    const url = new URL(validateDouyinUrl(input))
    const id = url.pathname.match(/^\/(?:share\/)?(?:video|note)\/(\d+)\/?$/)?.[1] ||
      url.searchParams.get('modal_id') || url.searchParams.get('aweme_id') || ''
    return VIDEO_ID.test(id) ? id : null
  } catch { return null }
}

type JsonObject = Record<string, unknown>
function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null
}

/** Bound traversal also protects against unexpectedly large hydration data. */
function visitObjects(value: unknown, visit: (item: JsonObject) => void): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }]
  const seen = new Set<object>()
  let count = 0
  while (stack.length && count++ < 15000) {
    const item = stack.pop()!
    if (!item.value || typeof item.value !== 'object' || seen.has(item.value) || item.depth > 18) continue
    seen.add(item.value)
    if (!Array.isArray(item.value)) visit(item.value as JsonObject)
    for (const child of Object.values(item.value).slice(0, 1000).reverse()) {
      if (child && typeof child === 'object') stack.push({ value: child, depth: item.depth + 1 })
    }
  }
}

function postId(item: JsonObject): string {
  // Numeric JSON values can lose precision for Douyin's 19-digit IDs.
  const id = item.aweme_id ?? item.awemeId ?? item.item_id ?? item.id
  return typeof id === 'string' && VIDEO_ID.test(id) ? id : ''
}

function authorSecUid(item: JsonObject): string {
  const author = asObject(item.author) || asObject(item.authorInfo)
  const uid = author?.sec_uid ?? author?.secUid ?? item.author_sec_uid
  return typeof uid === 'string' && SAFE_SEC_UID.test(uid) ? uid : ''
}

export function authorForVideo(payload: unknown, videoId: string): string | null {
  if (!VIDEO_ID.test(videoId)) return null
  const matches = new Set<string>()
  visitObjects(payload, item => {
    if (postId(item) === videoId) {
      const uid = authorSecUid(item)
      if (uid) matches.add(uid)
    }
  })
  return matches.size === 1 ? [...matches][0] : null
}

export function postsForAuthor(payload: unknown, secUid: string): DouyinPost[] {
  if (!SAFE_SEC_UID.test(secUid)) return []
  const posts = new Map<string, DouyinPost>()
  visitObjects(payload, item => {
    const id = postId(item)
    const desc = typeof item.desc === 'string' ? item.desc.trim() :
      typeof item.description === 'string' ? item.description.trim() : ''
    if (posts.size < MAX_POSTS && id && desc && authorSecUid(item) === secUid && !posts.has(id)) {
      posts.set(id, { id, aweme_id: id, desc: desc.slice(0, 10000) })
    }
  })
  return [...posts.values()]
}

export function mergePosts(target: Map<string, DouyinPost>, posts: DouyinPost[]): void {
  for (const post of posts) {
    if (target.size >= MAX_POSTS) break
    if (VIDEO_ID.test(post.id) && post.desc.trim() && !target.has(post.id)) target.set(post.id, post)
  }
}

export function parsePageJson(text: string): unknown | null {
  if (!text || text.length > 3_000_000) return null
  try { return JSON.parse(text) } catch {
    try { return JSON.parse(decodeURIComponent(text)) } catch { return null }
  }
}

export function postResponseState(payload: unknown): { ended: boolean; empty: boolean } {
  const obj = asObject(payload)
  if (!obj || (obj.status_code !== undefined && obj.status_code !== 0)) return { ended: false, empty: false }
  const list = obj.aweme_list ?? obj.awemeList
  const ended = Array.isArray(list) && (obj.has_more === 0 || obj.has_more === false)
  return { ended, empty: ended && list.length === 0 }
}
