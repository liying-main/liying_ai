import { create } from 'zustand'

interface UserInfo {
  phone?: string
  nickName?: string
  avatarUrl?: string
  expiryTime?: string
  [key: string]: any
}

interface UserInfoState {
  userInfo: UserInfo | null
  loadUserInfo: () => Promise<void>
  clearUserInfo: () => void
}

export const useUserInfoStore = create<UserInfoState>()((set) => ({
  userInfo: {
    nickName: '本地用户',
    phone: '',
    avatarUrl: undefined,
    expiryTime: undefined
  },
  
  loadUserInfo: async () => {
    // No backend - use default local user
  },
  
  clearUserInfo: () => {
    set({ userInfo: null })
  }
}))
