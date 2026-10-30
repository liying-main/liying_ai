// @ts-nocheck
import { create } from 'zustand'
import type { PublishAccount, PublishPlatform } from '../types/publish'
import { PUBLISH_PLATFORMS } from '../types/publish'

function slugify(name: string) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function sanitizeProfileDirName(value: string): string {
  return (String(value || '').trim() || 'default').replace(/[/\\:*?"<>|]/g, '_')
}

async function resolveProfileDir(accountId: string): Promise<{ userDataDir: string; error?: string }> {
  const api = (window as any).api
  if (api?.ensurePublishProfileDir) {
    try {
      const res = await api.ensurePublishProfileDir(accountId)
      if (res?.userDataDir) return { userDataDir: res.userDataDir }
      if (res?.error) return { userDataDir: '', error: res.error }
    } catch (error: any) {
      return { userDataDir: '', error: error?.message || String(error) }
    }
  }
  if (api?.getUserDataPath) {
    try {
      const dir = await api.getUserDataPath(`publish-browser-profiles/${sanitizeProfileDirName(accountId)}`)
      if (dir) return { userDataDir: dir }
    } catch (error: any) {
      return { userDataDir: '', error: error?.message || String(error) }
    }
  }
  return { userDataDir: '', error: '发布账号接口未就绪，请完整重启客户端后重试' }
}

function makeAccountId(name: string, platform: PublishPlatform, existing: string[]) {
  const base = `${platform}-${slugify(name) || 'account'}`
  let id = base
  let seq = 2
  while (existing.includes(id)) {
    id = `${base}-${seq}`
    seq += 1
  }
  return id
}

interface PublishAccountsState {
  accounts: PublishAccount[]
  loading: boolean
  loadAccounts: () => Promise<void>
  saveAccounts: (list: PublishAccount[]) => Promise<void>
  ensureAccountProfile: (id: string) => Promise<string | null>
  addAccount: (input: { name: string; platform: PublishPlatform; positioning?: string }) => Promise<{ account: PublishAccount | null; error?: string }>
  updateAccount: (id: string, patch: Partial<PublishAccount>) => Promise<void>
  removeAccount: (id: string) => Promise<void>
  getAccountsByPlatform: (platform: PublishPlatform) => PublishAccount[]
}

export const usePublishAccountsStore = create<PublishAccountsState>((set, get) => ({
  accounts: [],
  loading: false,

  loadAccounts: async () => {
    if (!(window as any).api?.getPublishAccounts) return
    set({ loading: true })
    try {
      const list = await (window as any).api.getPublishAccounts()
      const accounts: PublishAccount[] = Array.isArray(list) ? list : []
      let changed = false
      for (const account of accounts) {
        if (!account.userDataDir && account.id) {
          const { userDataDir } = await resolveProfileDir(account.id)
          if (userDataDir) {
            account.userDataDir = userDataDir
            changed = true
          }
        }
      }
      if (changed) {
        await (window as any).api?.savePublishAccounts?.(accounts)
      }
      set({ accounts })
    } finally {
      set({ loading: false })
    }
  },

  ensureAccountProfile: async (id) => {
    const account = get().accounts.find((a) => a.id === id)
    if (!account) return null
    if (account.userDataDir) return account.userDataDir
    const { userDataDir } = await resolveProfileDir(id)
    if (!userDataDir) return null
    await get().updateAccount(id, { userDataDir })
    return userDataDir
  },

  saveAccounts: async (list) => {
    set({ accounts: list })
    const res = await (window as any).api?.savePublishAccounts?.(list)
    if (res && res.success === false) {
      throw new Error(res.error || '保存账号失败')
    }
  },

  addAccount: async ({ name, platform, positioning }) => {
    const trimmed = name.trim()
    if (!trimmed) return { account: null, error: '请输入账号名称' }
    if (!PUBLISH_PLATFORMS.includes(platform)) return { account: null, error: '不支持的平台' }

    const existingIds = get().accounts.map((a) => a.id)
    const id = makeAccountId(trimmed, platform, existingIds)
    const { userDataDir } = await resolveProfileDir(id)

    const account: PublishAccount = {
      id,
      name: trimmed,
      platform,
      linkStatus: 'reauth',
      positioning: positioning?.trim() || '-',
      userDataDir,
      createdAt: Date.now(),
    }
    const next = [...get().accounts, account]
    try {
      await get().saveAccounts(next)
    } catch (error: any) {
      return { account: null, error: error?.message || '保存账号失败' }
    }
    return { account }
  },

  updateAccount: async (id, patch) => {
    const next = get().accounts.map((a) => (a.id === id ? { ...a, ...patch } : a))
    await get().saveAccounts(next)
  },

  removeAccount: async (id) => {
    const next = get().accounts.filter((a) => a.id !== id)
    await get().saveAccounts(next)
  },

  getAccountsByPlatform: (platform) => get().accounts.filter((a) => a.platform === platform),
}))
