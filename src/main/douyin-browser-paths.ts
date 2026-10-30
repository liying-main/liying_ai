import path from 'node:path'

export interface DouyinBrowserCandidate {
  executablePath: string
  source: 'bundled' | 'system' | 'playwright'
}

/** Pure candidate generation: never opens a user's regular browser profile. */
export function listDouyinBrowserCandidates(options: {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  homeDir: string
  bundledPath: string
  playwrightPath?: string
}): DouyinBrowserCandidate[] {
  const { platform, env, homeDir, bundledPath, playwrightPath } = options
  const paths = platform === 'win32' ? path.win32 : path.posix
  const candidates: DouyinBrowserCandidate[] = []
  const seen = new Set<string>()
  const add = (value: string | undefined, source: DouyinBrowserCandidate['source']) => {
    if (!value || !paths.isAbsolute(value)) return
    const normalized = paths.normalize(value)
    const key = platform === 'win32' ? normalized.toLowerCase() : normalized
    if (seen.has(key)) return
    seen.add(key)
    candidates.push({ executablePath: normalized, source })
  }
  add(bundledPath, 'bundled')

  if (platform === 'win32') {
    const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA]
    for (const root of roots) {
      if (!root) continue
      add(paths.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'), 'system')
      add(paths.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), 'system')
    }
  } else if (platform === 'darwin') {
    for (const root of ['/Applications', paths.join(homeDir, 'Applications')]) {
      for (const name of ['Google Chrome', 'Microsoft Edge', 'Chromium']) {
        add(paths.join(root, `${name}.app`, 'Contents', 'MacOS', name), 'system')
      }
    }
  }

  const pathValue = env.PATH || env.Path || ''
  const binaryNames = platform === 'win32'
    ? ['chrome.exe', 'msedge.exe']
    : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable']
  const searchDirs = pathValue.split(platform === 'win32' ? ';' : ':')
  if (platform === 'linux') searchDirs.push('/usr/bin', '/usr/local/bin', '/opt/google/chrome')
  for (const rawDir of searchDirs) {
    const dir = rawDir.replace(/^"|"$/g, '')
    if (!dir || !paths.isAbsolute(dir)) continue
    for (const name of binaryNames) add(paths.join(dir, name), 'system')
  }
  add(playwrightPath, 'playwright')
  return candidates
}
