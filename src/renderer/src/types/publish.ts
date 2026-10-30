export type PublishPlatform = 'douyin' | 'bilibili' | 'kuaishou' | 'wechat' | 'redbook'

export type LinkStatus = 'connected' | 'reauth'

export type PublishTaskStatus = 'pending' | 'publishing' | 'done' | 'failed'

export interface PublishAccount {
  id: string
  name: string
  platform: PublishPlatform
  linkStatus: LinkStatus
  linkMessage?: string
  lastStatusCheckedAt?: number
  positioning?: string
  userDataDir: string
  createdAt?: number
}

export interface PublishTask {
  id: string
  workId?: string
  workLabel?: string
  videoPath: string
  title: string
  tags: string
  platforms: PublishPlatform[]
  accountIds: string[]
  publishMode: 'manual' | 'auto'
  status: PublishTaskStatus
  statusMessage?: string
  createdAt: number
  updatedAt: number
}

export const PLATFORM_LABELS: Record<PublishPlatform, string> = {
  douyin: '抖音',
  bilibili: 'B站',
  kuaishou: '快手',
  wechat: '视频号',
  redbook: '小红书',
}

export const PUBLISH_PLATFORMS: PublishPlatform[] = ['douyin', 'bilibili', 'kuaishou', 'wechat', 'redbook']
