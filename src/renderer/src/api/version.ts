import { apiClient } from './client'
import { CHANNEL } from '../config/channel'

function getArch(): string {
  try {
    return (window as any).api?.getSystemArch?.() || 'x64'
  } catch {
    return 'x64'
  }
}

class VersionService {
  async checkUpdate(currentVersion: string) {
    const arch = getArch()
    return apiClient.get(
      `/app/version/checkUpdate?channel=${CHANNEL.id}&currentVersion=${encodeURIComponent(currentVersion)}&platform=win&arch=${arch}`
    )
  }
}

export const versionService = new VersionService()
