// @ts-nocheck
import type { PublishPlatform } from '../types/publish'

export const PUBLISH_PLATFORM_OPTIONS: { id: PublishPlatform; label: string }[] = [
  { id: 'douyin', label: '抖音' },
  { id: 'bilibili', label: 'B站' },
  { id: 'kuaishou', label: '快手' },
  { id: 'wechat', label: '视频号' },
  { id: 'redbook', label: '小红书' },
]

interface PublishPlatformPickerProps {
  platforms: PublishPlatform[]
  onChange: (platforms: PublishPlatform[]) => void
  disabled?: boolean
  minOne?: boolean
  onMinOneBlocked?: () => void
}

export function PublishPlatformPicker({
  platforms,
  onChange,
  disabled,
  minOne = true,
  onMinOneBlocked,
}: PublishPlatformPickerProps) {
  return (
    <div className="publish-platform-grid">
      {PUBLISH_PLATFORM_OPTIONS.map((p) => {
        const checked = platforms.includes(p.id)
        return (
          <button
            key={p.id}
            type="button"
            className={`publish-platform-chip${checked ? ' publish-platform-chip--active' : ''} publish-platform-chip--${p.id}`}
            disabled={disabled}
            onClick={() => {
              if (checked) {
                if (minOne && platforms.length <= 1) {
                  onMinOneBlocked?.()
                  return
                }
                onChange(platforms.filter((x) => x !== p.id))
              } else {
                onChange([...platforms, p.id])
              }
            }}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}

interface PublishModePickerProps {
  mode: string
  onChange: (mode: string) => void
  disabled?: boolean
}

export function PublishModePicker({ mode, onChange, disabled }: PublishModePickerProps) {
  const modes = [
    {
      id: 'manual',
      label: '手动发布',
      icon: (
        <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
          <path d="M10.5 2a.5.5 0 0 1 .5.5v1h1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h1v-1a.5.5 0 0 1 1 0v1h4v-1a.5.5 0 0 1 .5-.5zM4 6v6h8V6H4zm2 2h4v1H6V8z" />
        </svg>
      ),
    },
    {
      id: 'auto',
      label: '自动发布',
      icon: (
        <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
          <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm0 1.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM6.5 5.5l4 2.5-4 2.5V5.5z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="publish-mode-group">
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`publish-mode-chip${mode === m.id ? ' publish-mode-chip--active' : ''}`}
          disabled={disabled}
          onClick={() => onChange(m.id)}
        >
          <span className="publish-platform-chip-icon">{m.icon}</span>
          <span>{m.label}</span>
        </button>
      ))}
    </div>
  )
}
