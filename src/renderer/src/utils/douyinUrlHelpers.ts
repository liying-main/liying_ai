/** Renderer-side Douyin URL helpers (mirrors main process logic for UI validation). */

export const DOUYIN_HOMEPAGE_HINT =
  '请粘贴抖音博主主页链接（分享主页），不是单条视频链接。视频链接请用在「解析视频」里。'

export const DOUYIN_PROFILE_EXAMPLE = 'https://www.douyin.com/user/MS4wLjABAAAA...'

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
  return /\/user\//.test(url) || /\/share\/user\//.test(url) || /sec_user_id=/.test(url) || /sec_uid=/.test(url)
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

export function normalizeDouyinUrlForDownloader(input: string): string {
  const extracted = extractUrlFromText(input)
  if (!extracted) return ''
  const url = ensureDouyinHttpProtocol(extracted)
  if (isDouyinProfileUrl(url)) {
    const secUid = extractSecUidFromProfileUrl(url)
    if (secUid) {
      return `https://www.douyin.com/user/${secUid}`
    }
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

function extractSecUidFromProfileUrl(input: string): string | null {
  const url = extractUrlFromText(input)
  if (!url) return null
  try {
    const parsed = new URL(url.startsWith('http') ? url : ensureDouyinHttpProtocol(url))
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

export function validateHomepageForTopicAnalysis(input: string): {
  ok: boolean
  hint?: string
  isVideoLink?: boolean
} {
  const url = extractUrlFromText(input)
  if (!url) {
    return { ok: false, hint: '请先填写主页链接' }
  }
  if (isDouyinVideoUrl(url)) {
    return {
      ok: true,
      isVideoLink: true,
      hint: '检测到视频链接，分析时将自动识别博主主页',
    }
  }
  if (!isDouyinProfileUrl(url) && !/douyin\.com|iesdouyin\.com/.test(url.toLowerCase())) {
    return {
      ok: false,
      hint: `链接格式可能不正确。${DOUYIN_HOMEPAGE_HINT}`,
    }
  }
  return { ok: true }
}

export function formatDouyinProfileError(
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
      return `链接缺少 https:// 前缀，请粘贴完整的抖音主页分享链接。${DOUYIN_HOMEPAGE_HINT}`
    }
    if (isDouyinProfileUrl(url)) {
      return `主页链接格式无法被识别，请重新从抖音「分享主页」复制完整链接。${DOUYIN_HOMEPAGE_HINT}`
    }
    return `无法识别抖音链接，请确认粘贴的是抖音主页或视频分享链接。${DOUYIN_HOMEPAGE_HINT}`
  }
  if (
    lower.includes('sec_user_id') ||
    lower.includes('secuseridfetcher') ||
    lower.includes('getclientinfo') ||
    lower.includes('client_user_id')
  ) {
    if (isDouyinVideoUrl(url)) {
      return (
        '您填写的是视频分享链接，选题分析需要博主主页链接。' +
        '若自动识别失败，请手动复制博主主页链接。' +
        DOUYIN_HOMEPAGE_HINT
      )
    }
    return `无法识别博主主页，请确认链接来自抖音「分享主页」。${DOUYIN_HOMEPAGE_HINT}`
  }
  if (msg) return msg
  return `获取博主作品失败，请检查主页链接。${DOUYIN_HOMEPAGE_HINT}`
}

export function applyResolvedDouyinProfile(
  result: {
    resolvedProfileUrl?: string
    resolvedFrom?: string
  } | null | undefined,
  ipBrainId: string | undefined,
  setIpBrain: (fn: (prev: any) => any) => void,
  setIpBrainProfiles: (fn: (prev: any[]) => any[]) => void,
  showToast: (msg: string, type?: string) => void
): void {
  if (!result?.resolvedProfileUrl || (result.resolvedFrom !== 'video' && result.resolvedFrom !== 'share')) return
  const resolved = result.resolvedProfileUrl
  showToast('已自动识别博主主页', 'success')
  setIpBrain((prev) => (prev ? { ...prev, homepage: resolved } : prev))
  if (ipBrainId) {
    setIpBrainProfiles((prev) =>
      prev.map((p) => (p.id === ipBrainId ? { ...p, homepage: resolved } : p))
    )
  }
}
