/** Douyin URL detection, profile resolution helpers, and user-facing error messages. */

export const DOUYIN_PROFILE_HINT =
  '请打开抖音博主主页 → 右上角「…」→「分享主页」→ 复制链接（格式如 https://www.douyin.com/user/MS4wLjABAAAA...）'

const URL_IN_TEXT = /https?:\/\/[^\s\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]+/i

export function extractUrlFromText(input: string): string {
  if (!input) return ''
  const trimmed = String(input).trim()
  const match = trimmed.match(URL_IN_TEXT)
  return (match ? match[0] : trimmed).replace(/[)\]}>"']+$/g, '').trim()
}

export function isDouyinVideoUrl(input: string): boolean {
  const url = extractUrlFromText(input).toLowerCase()
  if (!url) return false
  return (
    /\/video\//.test(url) ||
    /iesdouyin\.com\/share\/video/.test(url) ||
    /\/note\//.test(url) ||
    /\/aweme\/detail/.test(url)
  )
}

export function isDouyinProfileUrl(input: string): boolean {
  const url = extractUrlFromText(input).toLowerCase()
  if (!url) return false
  if (/\/user\//.test(url)) return true
  if (/\/share\/user\//.test(url)) return true
  if (/sec_user_id=/.test(url)) return true
  if (/sec_uid=/.test(url)) return true
  return false
}

export function buildDouyinProfileUrl(secUid: string): string {
  const uid = String(secUid || '').trim()
  if (!uid) return ''
  return `https://www.douyin.com/user/${uid}`
}

function ensureDouyinHttpProtocol(url: string): string {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url)
      if (parsed.hostname.toLowerCase() === 'douyin.com') {
        parsed.hostname = 'www.douyin.com'
      }
      return parsed.toString()
    } catch {
      return url
    }
  }
  const cleaned = url.replace(/^\/\//, '').trim()
  if (/^www\./i.test(cleaned)) {
    return `https://${cleaned}`
  }
  if (/^douyin\.com/i.test(cleaned)) {
    return `https://www.${cleaned}`
  }
  return `https://${cleaned}`
}

/** Normalize Douyin URLs before passing to downloadDouyinVideo.exe */
export function normalizeDouyinUrlForDownloader(input: string): string {
  const extracted = extractUrlFromText(input)
  if (!extracted) return ''
  const url = ensureDouyinHttpProtocol(extracted)
  if (isDouyinProfileUrl(url)) {
    const secUid = extractSecUidFromProfileUrl(url)
    if (secUid) return buildDouyinProfileUrl(secUid)
    try {
      const parsed = new URL(url)
      parsed.search = ''
      parsed.hash = ''
      return parsed.toString()
    } catch {
      return url.split('?')[0].split('#')[0]
    }
  }
  return url
}

export function extractSecUidFromProfileUrl(input: string): string | null {
  const url = extractUrlFromText(input)
  if (!url) return null
  try {
    const parsed = new URL(url)
    const fromQuery =
      parsed.searchParams.get('sec_user_id') ||
      parsed.searchParams.get('sec_uid')
    if (fromQuery?.trim()) return fromQuery.trim()
    const match = parsed.pathname.match(/\/(?:share\/)?user\/([^/?#]+)/i)
    if (match?.[1]) return decodeURIComponent(match[1]).trim()
  } catch {
    const qMatch = url.match(/[?&]sec_user_id=([^&]+)/i)
    if (qMatch?.[1]) return decodeURIComponent(qMatch[1]).trim()
    const pathMatch = url.match(/\/(?:share\/)?user\/([^/?#]+)/i)
    if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]).trim()
  }
  return null
}

export function extractSecUidFromInfoResult(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null
  const obj = result as Record<string, unknown>
  const directKeys = [
    'sec_uid',
    'secUid',
    'author_id',
    'authorId',
    'uploader_id',
    'uploaderId',
  ]
  for (const key of directKeys) {
    const val = obj[key]
    if (typeof val === 'string' && val.trim()) return val.trim()
  }
  for (const nestedKey of ['author', 'user', 'uploader']) {
    const nested = obj[nestedKey]
    if (!nested || typeof nested !== 'object') continue
    const nestedObj = nested as Record<string, unknown>
    const uid =
      nestedObj.sec_uid ||
      nestedObj.secUid ||
      nestedObj.author_id ||
      nestedObj.authorId ||
      nestedObj.unique_id
    if (typeof uid === 'string' && uid.trim()) return uid.trim()
  }
  return null
}

export function isDouyinProfileResolutionError(message: string): boolean {
  const msg = (message || '').toLowerCase()
  return (
    msg.includes('sec_user_id') ||
    msg.includes('sec_uid') ||
    msg.includes('secuseridfetcher') ||
    msg.includes('getclientinfo') ||
    msg.includes('client_user_id') ||
    msg.includes('用户主页') ||
    msg.includes('profile')
  )
}

export function formatDouyinUserPostsError(
  rawMessage: string | undefined,
  inputUrl: string
): string {
  const url = extractUrlFromText(inputUrl)
  const msg = (rawMessage || '').trim()
  const lower = msg.toLowerCase()
  if (
    lower.includes('no valid douyin url') ||
    lower.includes('invalid douyin url') ||
    lower.includes('not a valid douyin')
  ) {
    if (!/^https?:\/\//i.test(url)) {
      return `链接缺少 https:// 前缀，请粘贴完整的抖音主页分享链接。${DOUYIN_PROFILE_HINT}`
    }
    if (isDouyinProfileUrl(url)) {
      return `主页链接格式无法被下载器识别，请重新从抖音「分享主页」复制完整链接。${DOUYIN_PROFILE_HINT}`
    }
    return `无法识别抖音链接，请确认粘贴的是抖音主页或视频分享链接。${DOUYIN_PROFILE_HINT}`
  }
  if (isDouyinVideoUrl(url)) {
    return (
      '您填写的是视频分享链接，选题分析需要博主主页链接。' +
      '系统已尝试从视频自动识别博主，但未成功。' +
      DOUYIN_PROFILE_HINT
    )
  }
  if (isDouyinProfileResolutionError(rawMessage || '')) {
    return `无法识别博主主页，请确认链接来自抖音「分享主页」。${DOUYIN_PROFILE_HINT}`
  }
  if (rawMessage?.trim()) return rawMessage.trim()
  return `获取博主作品失败，请检查主页链接是否正确。${DOUYIN_PROFILE_HINT}`
}
