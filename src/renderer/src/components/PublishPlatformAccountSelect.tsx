// @ts-nocheck
import { useMemo } from 'react'
import { usePublishAccountsStore } from '../store/PublishAccountsStore'
import { PLATFORM_LABELS, type PublishPlatform } from '../types/publish'

interface PublishPlatformAccountSelectProps {
  platform: PublishPlatform
  accountId?: string
  onChange: (accountId: string) => void
  disabled?: boolean
  onNavigateAccounts?: () => void
  onSyncStatus?: (platform: PublishPlatform, accountId: string) => void
  compact?: boolean
}

export function PublishPlatformAccountSelect({
  platform,
  accountId,
  onChange,
  disabled,
  onNavigateAccounts,
  onSyncStatus,
  compact = false,
}: PublishPlatformAccountSelectProps) {
  const accounts = usePublishAccountsStore((s) => s.accounts)
  const platformAccounts = useMemo(
    () => accounts.filter((a) => a.platform === platform),
    [accounts, platform],
  )
  const selected = platformAccounts.find((a) => a.id === accountId)

  const statusText = selected
    ? selected.linkStatus === 'connected'
      ? '已登录'
      : '待登录'
    : platformAccounts.length
      ? '未选'
      : '待创建'

  return (
    <div className={`publish-account-row${compact ? ' publish-account-row--compact' : ''}`}>
      {!compact && <span className="publish-account-row-label">{PLATFORM_LABELS[platform]}</span>}
      <select
        className="video-input publish-account-select"
        value={accountId || ''}
        disabled={disabled || platformAccounts.length === 0}
        onChange={(e) => onChange(e.target.value)}
      >
        {platformAccounts.length === 0 ? (
          <option value="">无账号</option>
        ) : (
          <>
            <option value="">选择账号</option>
            {platformAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </>
        )}
      </select>
      <span
        className={`publish-account-status ${
          selected?.linkStatus === 'connected'
            ? 'publish-account-status--ok'
            : 'publish-account-status--pending'
        }`}
      >
        {statusText}
      </span>
      {selected?.linkStatus !== 'connected' && onSyncStatus && selected && (
        <button type="button" className="publish-account-link-btn" onClick={() => onSyncStatus(platform, selected.id)}>
          同步
        </button>
      )}
      {selected?.linkStatus !== 'connected' && onNavigateAccounts && (
        <button type="button" className="publish-account-link-btn" onClick={onNavigateAccounts}>
          登录
        </button>
      )}
    </div>
  )
}

interface PublishPlatformAccountListProps {
  platforms: PublishPlatform[]
  accountIds: Partial<Record<PublishPlatform, string>>
  onChange: (platform: PublishPlatform, accountId: string) => void
  disabled?: boolean
  onNavigateAccounts?: () => void
  onSyncStatus?: (platform: PublishPlatform, accountId: string) => void
  compact?: boolean
}

export function PublishPlatformAccountList({
  platforms,
  accountIds,
  onChange,
  disabled,
  onNavigateAccounts,
  onSyncStatus,
  compact = false,
}: PublishPlatformAccountListProps) {
  if (!platforms.length) return null
  return (
    <div className="publish-account-list">
      {platforms.map((platform) => (
        <PublishPlatformAccountSelect
          key={platform}
          platform={platform}
          accountId={accountIds[platform]}
          onChange={(id) => onChange(platform, id)}
          disabled={disabled}
          onNavigateAccounts={onNavigateAccounts}
          onSyncStatus={onSyncStatus}
          compact={compact ?? platforms.length === 1}
        />
      ))}
    </div>
  )
}
