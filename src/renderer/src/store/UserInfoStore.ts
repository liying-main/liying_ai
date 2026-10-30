import { create } from 'zustand'

/**
 * 开源版：没有账号体系，用户信息固定为本地占位。
 * 保留原有 store 形状，业务代码无需改动。
 */
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

const LOCAL_USER: UserInfo = {
  nickName: '厉影AI 开源版',
  phone: '',
  expiryTime: '',
}

export const useUserInfoStore = create<UserInfoState>()((set) => ({
  userInfo: LOCAL_USER,

  loadUserInfo: async () => {
    set({ userInfo: LOCAL_USER })
  },

  clearUserInfo: () => {
    set({ userInfo: LOCAL_USER })
  },
}))

