// @ts-nocheck
import { usePublishAccountsStore } from '../store/PublishAccountsStore'
import { PLATFORM_LABELS, type PublishAccount, type PublishPlatform } from '../types/publish'

export type PlatformAccountMap = Partial<Record<PublishPlatform, PublishAccount>>

export function getAccountsForPlatform(platform: PublishPlatform): PublishAccount[] {
  return usePublishAccountsStore.getState().getAccountsByPlatform(platform)
}

export function getAccountIdForTaskPlatform(task: { accountIds?: string[] }, platform: PublishPlatform): string {
  const accounts = usePublishAccountsStore.getState().accounts
  return (
    task.accountIds?.find((id) => accounts.find((a) => a.id === id)?.platform === platform) || ''
  )
}

export function buildTaskAccountIds(
  platforms: PublishPlatform[],
  platformAccountIds: Partial<Record<PublishPlatform, string>>,
): string[] {
  return platforms
    .map((platform) => platformAccountIds[platform])
    .filter(Boolean) as string[]
}

export async function resolvePlatformAccount(
  platform: PublishPlatform,
  preferredAccountId?: string,
  options?: { autoCreate?: boolean },
): Promise<{ account: PublishAccount | null; created: boolean; error?: string }> {
  const store = usePublishAccountsStore.getState()

  if (preferredAccountId) {
    const preferred = store.accounts.find((a) => a.id === preferredAccountId && a.platform === platform)
    if (preferred) return { account: preferred, created: false }
  }

  const list = store.getAccountsByPlatform(platform)
  if (list.length > 0) {
    const picked =
      list.find((a) => a.id === preferredAccountId) ||
      list.find((a) => a.linkStatus === 'connected') ||
      list[0]
    return { account: picked, created: false }
  }

  if (options?.autoCreate === false) {
    return {
      account: null,
      created: false,
      error: `请先在发布账号管理中添加${PLATFORM_LABELS[platform]}账号`,
    }
  }

  const defaultName = `${PLATFORM_LABELS[platform]}默认`
  const { account, error } = await store.addAccount({ name: defaultName, platform })
  if (!account) {
    return { account: null, created: false, error: error || `创建${PLATFORM_LABELS[platform]}账号失败` }
  }
  return { account, created: true }
}

export async function resolveAccountsForPlatforms(
  platforms: PublishPlatform[],
  preferredIds: Partial<Record<PublishPlatform, string>> = {},
  autoCreate = true,
) {
  const map: PlatformAccountMap = {}
  const accountIds: string[] = []
  const created: PublishPlatform[] = []
  const errors: string[] = []

  for (const platform of platforms) {
    const { account, created: wasCreated, error } = await resolvePlatformAccount(
      platform,
      preferredIds[platform],
      { autoCreate },
    )
    if (account) {
      map[platform] = account
      if (!accountIds.includes(account.id)) accountIds.push(account.id)
      if (wasCreated) created.push(platform)
    } else if (error) {
      errors.push(error)
    }
  }

  return { map, accountIds, created, errors }
}

export async function syncAccountLoginStatus(account: {
  id: string
  platform: PublishPlatform
  userDataDir?: string
}) {
  const api = (window as any).api
  if (typeof api?.browserCheckAccountStatus !== 'function') {
    return { success: false, is_valid: false, message: '检测接口未就绪' }
  }
  const res = await api.browserCheckAccountStatus({
    platform: account.platform,
    userDataDir: account.userDataDir,
    accountId: account.id,
  })
  await usePublishAccountsStore.getState().updateAccount(account.id, {
    linkStatus: res?.is_valid ? 'connected' : 'reauth',
    linkMessage: res?.message,
    lastStatusCheckedAt: Date.now(),
  })
  return res
}
