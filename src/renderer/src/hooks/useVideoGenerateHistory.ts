// @ts-nocheck
/* eslint-disable */
import { useState, useCallback, useEffect } from 'react'
import { useVideoPageStore } from '../store/VideoPageStore'
import { useToast } from './useToast'

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
    finalVideoPath: state.finalVideoPath ?? '',
    titleEffectConfig: state.titleEffectConfig ?? null,
    selectedTitleStyleId: state.selectedTitleStyleId ?? '',
    selectedVoiceId: state.selectedVoiceId ?? '',
    subtitleEffectConfig: state.subtitleEffectConfig ?? null,
    bgmEffectConfig: state.bgmEffectConfig ?? null,
    titleSegmentRange: state.titleSegmentRange ?? null,
    subtitleEnabled: state.subtitleEnabled ?? true,
    bgmEnabled: state.bgmEnabled ?? true,
  }
}

export function useVideoGenerateHistory() {
  const showToast = useToast()
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [historyList, setHistoryList] = useState([])

  const refreshHistoryList = useCallback(async () => {
    try {
      const list = await (window as any).api?.getVideoGenerateHistory?.()
      setHistoryList((list ?? []).slice().reverse())
    } catch (e) {
      console.error('Failed to refresh history list:', e)
    }
  }, [])

  useEffect(() => {
    if (showHistoryModal) refreshHistoryList()
  }, [showHistoryModal, refreshHistoryList])

  const saveNewSnapshot = useCallback(async (params: any) => {
    try {
      const item = {
        id: Date.now().toString(),
        createdAt: Date.now(),
        ...params,
      }
      const list = await (window as any).api?.getVideoGenerateHistory?.() || []
      const arr = Array.isArray(list) ? list : []
      arr.push(item)
      const trimmed = arr.length > HISTORY_MAX ? arr.slice(-HISTORY_MAX) : arr
      await (window as any).api?.setVideoGenerateHistory?.(trimmed)
      useVideoPageStore.getState().setVideoHistoryCurrentId?.(item.id)
      useVideoPageStore.getState().setVideoHistoryCurrentCreatedAt?.(item.createdAt)
      return item
    } catch (e) {
      console.error('Failed to save snapshot:', e)
      return null
    }
  }, [])

  const restoreSnapshot = useCallback(async (item: any) => {
    if (!item) return
    const store = useVideoPageStore.getState()
    // Restore various fields from snapshot
    if (item.generatedVideoPreview) store.setGeneratedVideoPreview?.(item.generatedVideoPreview)
    if (item.originalVideoPath) store.setOriginalVideoPath?.(item.originalVideoPath)
    if (item.generatedVideoPath) store.setGeneratedVideoPath?.(item.generatedVideoPath)
    if (item.rewrittenScript) store.setRewrittenScript?.(item.rewrittenScript)
    if (item.translatedText) store.setTranslatedText?.(item.translatedText)
    if (item.mainTitle) store.setMainTitle?.(item.mainTitle)
    if (item.subTitle) store.setSubTitle?.(item.subTitle)
    if (item.viralTitle) store.setViralTitle?.(item.viralTitle)
    if (item.videoTags) store.setVideoTags?.(item.videoTags)
    if (item.generatedAudioPath) store.setGeneratedAudioPath?.(item.generatedAudioPath)
    if (item.audioDuration) store.setAudioDuration?.(item.audioDuration)
    if (item.subtitleText) store.setSubtitleText?.(item.subtitleText)
    if (item.whisperSegments) store.setWhisperSegments?.(item.whisperSegments)
    store.setVideoHistoryCurrentId?.(item.id)
    store.setVideoHistoryCurrentCreatedAt?.(item.createdAt)
    showToast?.('已恢复历史记录', 'success')
  }, [showToast])

  const deleteSnapshot = useCallback(async (id: string) => {
    try {
      const list = await (window as any).api?.getVideoGenerateHistory?.() || []
      const filtered = list.filter((item: any) => item.id !== id)
      await (window as any).api?.setVideoGenerateHistory?.(filtered)
      await refreshHistoryList()
      showToast?.('已删除历史记录', 'success')
    } catch (e) {
      console.error('Failed to delete snapshot:', e)
    }
  }, [refreshHistoryList, showToast])

  const updateLatestSnapshot = useCallback(async () => {
    try {
      const state = useVideoPageStore.getState()
      if (!state.originalVideoPath) return
      const list = await (window as any).api?.getVideoGenerateHistory?.()
      const arr = Array.isArray(list) ? list : []
      if (arr.length === 0) return
      const currentId = state.videoHistoryCurrentId
      const currentCreatedAt = state.videoHistoryCurrentCreatedAt
      if (!currentId || !currentCreatedAt) return
      const idx = arr.findIndex((i: any) => i.id === currentId)
      if (idx < 0) return
      const item = buildSnapshotFromStore()
      item.id = currentId
      item.createdAt = currentCreatedAt
      arr[idx] = item
      const res = await (window as any).api?.setVideoGenerateHistory?.(arr)
      if (res && !res.success) console.error('updateLatestSnapshot failed', res.error)
    } catch (e) {
      console.error('Failed to update latest snapshot:', e)
    }
  }, [])

  return {
    showHistoryModal,
    setShowHistoryModal,
    historyList,
    refreshHistoryList,
    saveNewSnapshot,
    restoreSnapshot,
    deleteSnapshot,
    updateLatestSnapshot,
  }
}
