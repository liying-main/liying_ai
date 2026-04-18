import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'midnight-gold' | 'dark-teal' | 'dark-indigo' | 'light-teal' | 'original-ui' | 'black-orange' | 'dark-crimson'

export const THEMES: { id: Theme; label: string }[] = [
  { id: 'midnight-gold', label: '午夜金' },
  { id: 'dark-teal', label: '赛博青' },
  { id: 'dark-indigo', label: '极光蓝' },
  { id: 'light-teal', label: '冰晶绿' },
  { id: 'original-ui', label: '幻紫' },
  { id: 'black-orange', label: '暗夜橙' },
  { id: 'dark-crimson', label: '炽焰红' },
]

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

function applyTheme(theme: Theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

function getInitialTheme(): Theme {
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem('theme-store')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.state?.theme) {
          return parsed.state.theme
        }
      }
    } catch {}
  }
  return 'midnight-gold'
}

// Apply initial theme immediately
const initialTheme = getInitialTheme()
applyTheme(initialTheme)

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: initialTheme,
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      }
    }),
    {
      name: 'theme-store',
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          applyTheme(state.theme)
        }
      }
    }
  )
)
