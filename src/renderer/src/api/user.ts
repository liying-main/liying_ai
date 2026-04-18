import { apiClient, setRefreshTokenHandler } from './client'

interface DeviceNonceBundle {
  nonce1: string
  nonce2: string
  nonce3: string
  nonce4: string
  nonce5: string
  nonce6: string
}

async function getDeviceNonce(): Promise<DeviceNonceBundle> {
  try {
    const bundle = await window.api?.getDeviceNonce?.()
    if (bundle && bundle.nonce1) return bundle
  } catch {}
  return { nonce1: '', nonce2: '', nonce3: '', nonce4: '', nonce5: '', nonce6: '' }
}

export class UserService {
  async loginCard(cardNum: string, cardKey: string) {
    const { nonce1, nonce2, nonce3, nonce4, nonce5, nonce6 } = await getDeviceNonce()
    return apiClient.post('/app/user/login/card', {
      cardNum: cardNum.trim(),
      cardKey: cardKey.trim(),
      nonce1, nonce2, nonce3, nonce4, nonce5, nonce6
    }, { skipAuth: true })
  }

  async refreshToken(refreshToken: string) {
    const { nonce1, nonce2, nonce3, nonce4, nonce5, nonce6 } = await getDeviceNonce()
    return apiClient.post('/app/user/login/refreshToken', {
      refreshToken,
      nonce1, nonce2, nonce3, nonce4, nonce5, nonce6
    }, { skipAuth: true })
  }

  async getPerson() {
    return apiClient.get('/app/user/info/person')
  }

  async updatePerson(params: any) {
    return apiClient.post('/app/user/info/updatePerson', params)
  }
}

export const userService = new UserService()

// Register refresh token handler
setRefreshTokenHandler((refreshToken) => userService.refreshToken(refreshToken))
