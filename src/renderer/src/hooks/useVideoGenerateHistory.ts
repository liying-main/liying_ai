// @ts-nocheck
/* eslint-disable */
import { useState, useCallback, useEffect } from 'react'
import { useVideoPageStore } from '../store/VideoPageStore'
import { useVideoWorksHistoryStore } from '../store/VideoWorksHistoryStore'
import { useToast } from './useToast'

async function resolvePreviewUrl(item: any) {
  const path =
    item.finalVideoPath ||
    item.smartCutVideoPath ||
    item.bgmedVideoPath ||
    item.subtitledVideoPath ||
    item.titledVideoPath ||
    item.generatedVideoPath ||
    item.originalVideoPath
  if (!path) return ''
  try {
    const res = await (window as any).api?.getLocalFileUrl?.(path)
    return res?.success && res.url ? res.url : ''
  } catch {
    return ''
  }
}

export function useVideoGenerateHistory() {
  const showToast = useToast()
  const [showHistoryModal, setShowHistoryModal] = useState(false)

  const historyList = useVideoWorksHistoryStore((s) => s.historyList)
  const loading = useVideoWorksHistoryStore((s) => s.loading)
  const refreshHistoryList = useVideoWorksHistoryStore((s) => s.refreshHistoryList)
  const saveNewSnapshot = useVideoWorksHistoryStore((s) => s.saveNewSnapshot)
  const updateLatestSnapshot = useVideoWorksHistoryStore((s) => s.updateLatestSnapshot)
  const deleteSnapshotFromStore = useVideoWorksHistoryStore((s) => s.deleteSnapshot)

  useEffect(() => {
    if (showHistoryModal) refreshHistoryList()
  }, [showHistoryModal, refreshHistoryList])

  const loadHistoryItem = useCallback(async (item: any) => {
    if (!item) return
    const store = useVideoPageStore.getState()
    store.setOriginalVideoPath?.(item.originalVideoPath ?? '')
    store.setGeneratedVideoPath?.(item.generatedVideoPath ?? '')
    store.setRewrittenScript?.(item.rewrittenScript ?? '')
    store.setTranslatedText?.(item.translatedText ?? '')
    store.setMainTitle?.(item.mainTitle ?? '')
    store.setSubTitle?.(item.subTitle ?? '')
    store.setViralTitle?.(item.viralTitle ?? '')
    store.setVideoTags?.(item.videoTags ?? '')
    store.setGeneratedAudioPath?.(item.generatedAudioPath ?? '')
    store.setAudioDuration?.(item.audioDuration ?? 0)
    store.setSubtitleText?.(item.subtitleText ?? '')
    store.setWhisperSegments?.(item.whisperSegments ?? [])
    store.setTitledVideoPath?.(item.titledVideoPath ?? '')
    store.setSubtitledVideoPath?.(item.subtitledVideoPath ?? '')
    store.setBgmedVideoPath?.(item.bgmedVideoPath ?? '')
    store.setSmartCutVideoPath?.(item.smartCutVideoPath ?? '')
    store.setSmartCutBaseVideoPath?.(item.smartCutBaseVideoPath ?? '')
    store.setFinalVideoPath?.(item.finalVideoPath ?? '')
    store.setTitleEffectConfig?.(item.titleEffectConfig ?? null)
    store.setSelectedTitleStyleId?.(item.selectedTitleStyleId ?? '')
    store.setSelectedVoiceId?.(item.selectedVoiceId ?? '')
    store.setSubtitleEffectConfig?.(item.subtitleEffectConfig ?? null)
    store.setBgmEffectConfig?.(item.bgmEffectConfig ?? null)
    store.setMixSegments?.(item.mixSegments ?? [])
    store.setPipSegments?.(item.pipSegments ?? [])
    store.setPipRect?.(item.pipRect ?? null)
    store.setMainVideoRect?.(item.mainVideoRect ?? { x: 0, y: 0, width: 100, height: 100 })
    store.setMainVideoBgColor?.(item.mainVideoBgColor ?? '#000000')
    store.setMainVideoZIndex?.(item.mainVideoZIndex ?? 0)
    store.setAlreadySubtitled?.(item.alreadySubtitled ?? false)
    store.setAlreadyBgmAdded?.(item.alreadyBgmAdded ?? false)
    store.setSubtitleEnabled?.(item.subtitleEnabled ?? true)
    store.setBgmEnabled?.(item.bgmEnabled ?? true)
    store.setTitleSegmentRange?.(item.titleSegmentRange ?? null)
    store.setBgmSegmentRange?.(item.bgmSegmentRange ?? null)
    store.setVideoHistoryCurrentId?.(item.id ?? '')
    store.setVideoHistoryCurrentCreatedAt?.(item.createdAt ?? 0)
    store.setGeneratedVideoPreview?.(await resolvePreviewUrl(item))
    setShowHistoryModal(false)
    showToast?.('已加载该历史视频', 'success')
  }, [showToast])

  const deleteSnapshot = useCallback(async (id: string, event?: any) => {
    event?.stopPropagation?.()
    event?.preventDefault?.()
    if (!id) return
    try {
      await deleteSnapshotFromStore(id)
      showToast?.('已删除历史记录', 'success')
    } catch (e) {
      console.error('Failed to delete snapshot:', e)
      showToast?.('删除失败', 'error')
    }
  }, [deleteSnapshotFromStore, showToast])

  return {
    showHistoryModal,
    setShowHistoryModal,
    historyList,
    loading,
    refreshHistoryList,
    saveNewSnapshot,
    loadHistoryItem,
    deleteSnapshot,
    updateLatestSnapshot,
  }
}
