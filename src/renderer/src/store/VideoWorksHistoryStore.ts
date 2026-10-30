// @ts-nocheck
import { create } from 'zustand'
import { useVideoPageStore } from './VideoPageStore'

const HISTORY_MAX = 50

function buildSnapshotFromStore(overrides?: any) {
  const state = useVideoPageStore.getState() as any
  const labelSource =
    state.mainTitle ||
    state.viralTitle ||
    (state.rewrittenScript?.slice(0, 30) ?? '') ||
    '未命名'
  const label = labelSource.length > 40 ? labelSource.slice(0, 40) + '…' : labelSource
  return {
    id: String(Date.now()),
    createdAt: Date.now(),
    label: overrides?.label ?? label,
    originalVideoPath: overrides?.originalVideoPath ?? state.originalVideoPath ?? '',
    generatedVideoPath: overrides?.generatedVideoPath ?? state.generatedVideoPath ?? '',
    generatedAudioPath: state.generatedAudioPath ?? '',
    audioDuration: state.audioDuration ?? 0,
    rewrittenScript: state.rewrittenScript ?? '',
    translatedText: state.translatedText ?? '',
    mainTitle: state.mainTitle ?? '',
    viralTitle: state.viralTitle ?? '',
    subTitle: state.subTitle ?? '',
    videoTags: state.videoTags ?? '',
    subtitleText: state.subtitleText ?? '',
    whisperSegments: state.whisperSegments ?? [],
    titledVideoPath: state.titledVideoPath ?? '',
    subtitledVideoPath: state.subtitledVideoPath ?? '',
    bgmedVideoPath: state.bgmedVideoPath ?? '',
    smartCutVideoPath: state.smartCutVideoPath ?? '',
    smartCutBaseVideoPath: state.smartCutBaseVideoPath ?? '',
    finalVideoPath: state.finalVideoPath ?? '',
    titleEffectConfig: state.titleEffectConfig ?? null,
    selectedTitleStyleId: state.selectedTitleStyleId ?? '',
    selectedVoiceId: state.selectedVoiceId ?? '',
    subtitleEffectConfig: state.subtitleEffectConfig ?? null,
    bgmEffectConfig: state.bgmEffectConfig ?? null,
    titleSegmentRange: state.titleSegmentRange ?? null,
    bgmSegmentRange: state.bgmSegmentRange ?? null,
    subtitleEnabled: state.subtitleEnabled ?? true,
    bgmEnabled: state.bgmEnabled ?? true,
    alreadySubtitled: state.alreadySubtitled ?? false,
    alreadyBgmAdded: state.alreadyBgmAdded ?? false,
    mixSegments: state.mixSegments ?? [],
    pipSegments: state.pipSegments ?? [],
    pipRect: state.pipRect ?? null,
    mainVideoRect: state.mainVideoRect ?? { x: 0, y: 0, width: 100, height: 100 },
    mainVideoBgColor: state.mainVideoBgColor ?? '#000000',
    mainVideoZIndex: state.mainVideoZIndex ?? 0,
  }
}

async function persistSnapshotList(arr: any[]) {
  const trimmed = arr.length > HISTORY_MAX ? arr.slice(-HISTORY_MAX) : arr
  const res = await (window as any).api?.setVideoGenerateHistory?.(trimmed)
  if (res && !res.success) {
    throw new Error(res.error || '保存作品失败')
  }
  return trimmed
}

function hasPersistableVideo(state: any) {
  return !!(
    state.originalVideoPath ||
    state.generatedVideoPath ||
    state.finalVideoPath ||
    state.titledVideoPath ||
    state.subtitledVideoPath ||
    state.bgmedVideoPath ||
    state.smartCutVideoPath
  )
}

interface VideoWorksHistoryState {
  historyList: any[]
  loading: boolean
  refreshHistoryList: () => Promise<any[]>
  saveNewSnapshot: (params?: any) => Promise<any | null>
  updateLatestSnapshot: () => Promise<boolean>
  deleteSnapshot: (id: string) => Promise<void>
}

export const useVideoWorksHistoryStore = create<VideoWorksHistoryState>((set, get) => ({
  historyList: [],
  loading: false,

  refreshHistoryList: async () => {
    if (!(window as any).api?.getVideoGenerateHistory) {
      throw new Error('作品接口未就绪，请重启客户端')
    }
    set({ loading: true })
    try {
      const list = await (window as any).api.getVideoGenerateHistory()
      const reversed = (Array.isArray(list) ? list : []).slice().reverse()
      set({ historyList: reversed })
      return reversed
    } catch (e) {
      console.error('Failed to refresh history list:', e)
      throw e
    } finally {
      set({ loading: false })
    }
  },

  saveNewSnapshot: async (params: any = {}) => {
    try {
      const item = {
        ...buildSnapshotFromStore(),
        id: Date.now().toString(),
        createdAt: Date.now(),
        ...params,
      }
      const list = (await (window as any).api?.getVideoGenerateHistory?.()) || []
      const arr = Array.isArray(list) ? list : []
      arr.push(item)
      await persistSnapshotList(arr)
      useVideoPageStore.getState().setVideoHistoryCurrentId?.(item.id)
      useVideoPageStore.getState().setVideoHistoryCurrentCreatedAt?.(item.createdAt)
      await get().refreshHistoryList()
      return item
    } catch (e) {
      console.error('Failed to save snapshot:', e)
      return null
    }
  },

  updateLatestSnapshot: async () => {
    try {
      const state = useVideoPageStore.getState()
      if (!hasPersistableVideo(state)) return false

      const list = await (window as any).api?.getVideoGenerateHistory?.()
      const arr = Array.isArray(list) ? list : []
      const currentId = state.videoHistoryCurrentId
      const currentCreatedAt = state.videoHistoryCurrentCreatedAt
      const idx = currentId ? arr.findIndex((i: any) => i.id === currentId) : -1

      const item = buildSnapshotFromStore()
      if (idx >= 0 && currentId) {
        item.id = currentId
        item.createdAt = currentCreatedAt || arr[idx].createdAt
        arr[idx] = item
      } else {
        item.id = String(Date.now())
        item.createdAt = Date.now()
        arr.push(item)
        state.setVideoHistoryCurrentId?.(item.id)
        state.setVideoHistoryCurrentCreatedAt?.(item.createdAt)
      }

      await persistSnapshotList(arr)
      await get().refreshHistoryList()
      return true
    } catch (e) {
      console.error('Failed to update latest snapshot:', e)
      throw e
    }
  },

  deleteSnapshot: async (id: string) => {
    if (!id) return
    const list = (await (window as any).api?.getVideoGenerateHistory?.()) || []
    const filtered = (Array.isArray(list) ? list : []).filter((item: any) => item.id !== id)
    await (window as any).api?.setVideoGenerateHistory?.(filtered)
    const state = useVideoPageStore.getState()
    if (state.videoHistoryCurrentId === id) {
      state.setVideoHistoryCurrentId?.('')
      state.setVideoHistoryCurrentCreatedAt?.(0)
    }
    await get().refreshHistoryList()
  },
}))
