// @ts-nocheck
import { useCallback, useEffect, useRef, useState } from 'react'
import { useVideoPageStore } from '../store/VideoPageStore'
import { useToast } from '../hooks/useToast'
import { PageRefreshButton } from './PageRefreshButton'

interface MaterialItem {
  id: string
  name: string
  path: string
  category?: string
}

const AUDIO_EXTENSIONS = ['wav', 'mp3', 'm4a']
const AUDIO_MIME_TYPES = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a']
const PIP_EXTENSIONS = ['mp4', 'mov', 'webm', 'avi', 'mkv', 'png', 'jpg', 'jpeg', 'gif', 'webp']

function isAllowedAudioFile(file: File) {
  const ext = file.name.toLowerCase().split('.').pop()
  return AUDIO_EXTENSIONS.includes(ext || '') || AUDIO_MIME_TYPES.includes(file.type)
}

function isPipImagePath(pathOrName: string) {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(pathOrName)
}

function isAllowedPipFile(file: File) {
  const ext = file.name.toLowerCase().split('.').pop()
  return PIP_EXTENSIONS.includes(ext || '')
}

async function saveFileToTemp(file: File, tempSubPath: string): Promise<string | null> {
  const electronPath = (file as any).path
  if (electronPath && typeof electronPath === 'string') {
    return electronPath
  }
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const base64Data = e.target?.result
        if (typeof base64Data !== 'string') {
          resolve(null)
          return
        }
        const base64Content = base64Data.split(',')[1]
        const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${file.name}`
        const saveResult = await (window as any).api?.saveFileFromBase64?.(
          base64Content,
          tempFileName,
          tempSubPath,
        )
        resolve(saveResult?.success && saveResult.file_path ? saveResult.file_path : null)
      } catch {
        resolve(null)
      }
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

async function saveVideoFileToTemp(file: File): Promise<string | null> {
  return saveFileToTemp(file, 'temp/videos')
}

async function savePipFileToTemp(file: File): Promise<string | null> {
  return saveFileToTemp(file, 'temp/pip')
}

function MaterialVideoPreview({ item }: { item: MaterialItem }) {
  const [previewUrl, setPreviewUrl] = useState('')

  useEffect(() => {
    let cancelled = false
    setPreviewUrl('')
    if (!item?.path) return
    ;(async () => {
      try {
        const res = await (window as any).api?.getLocalFileUrl?.(item.path)
        if (!cancelled && res?.success && res.url) {
          setPreviewUrl(res.url)
        }
      } catch {
        if (!cancelled) setPreviewUrl('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [item?.path])

  if (!item?.path) {
    return (
      <div className="material-card-preview material-card-preview--empty">
        <span>无文件</span>
      </div>
    )
  }

  if (!previewUrl) {
    return <div className="material-card-preview material-card-preview--loading">加载中…</div>
  }

  return (
    <video
      className="material-card-preview-video"
      src={previewUrl}
      muted
      playsInline
      preload="metadata"
      onMouseEnter={(e) => {
        const el = e.currentTarget
        el.currentTime = 0
        el.play().catch(() => {})
      }}
      onMouseLeave={(e) => {
        e.currentTarget.pause()
      }}
    />
  )
}

function MaterialPipPreview({ item }: { item: MaterialItem }) {
  const [previewUrl, setPreviewUrl] = useState('')
  const isImage = isPipImagePath(item?.path || item?.name || '')

  useEffect(() => {
    let cancelled = false
    setPreviewUrl('')
    if (!item?.path) return
    ;(async () => {
      try {
        const res = await (window as any).api?.getLocalFileUrl?.(item.path)
        if (!cancelled && res?.success && res.url) {
          setPreviewUrl(res.url)
        }
      } catch {
        if (!cancelled) setPreviewUrl('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [item?.path])

  if (!item?.path) {
    return (
      <div className="material-card-preview material-card-preview--empty">
        <span>无文件</span>
      </div>
    )
  }

  if (!previewUrl) {
    return <div className="material-card-preview material-card-preview--loading">加载中…</div>
  }

  if (isImage) {
    return <img className="material-card-preview material-card-preview-image" src={previewUrl} alt={item.name || '画中画'} />
  }

  return (
    <video
      className="material-card-preview-video"
      src={previewUrl}
      muted
      playsInline
      preload="metadata"
      onMouseEnter={(e) => {
        const el = e.currentTarget
        el.currentTime = 0
        el.play().catch(() => {})
      }}
      onMouseLeave={(e) => {
        e.currentTarget.pause()
      }}
    />
  )
}

function MaterialAudioIcon({ playing }: { playing?: boolean }) {
  return (
    <div className={`material-card-audio-icon ${playing ? 'material-card-audio-icon--playing' : ''}`}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    </div>
  )
}

export function MaterialLibraryPanel() {
  const showToast = useToast()
  const [dataSubTab, setDataSubTab] = useState('voices')
  const [uploadedVoices, setUploadedVoices] = useState<MaterialItem[]>([])
  const [uploadedVideos, setUploadedVideos] = useState<MaterialItem[]>([])
  const [uploadedBgms, setUploadedBgms] = useState<MaterialItem[]>([])
  const [uploadedPips, setUploadedPips] = useState<MaterialItem[]>([])
  const [loadingMaterials, setLoadingMaterials] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [previewVideoItem, setPreviewVideoItem] = useState<MaterialItem | null>(null)
  const [previewVideoUrl, setPreviewVideoUrl] = useState('')
  const [cacheInfo, setCacheInfo] = useState<{ formattedSize: string; fileCount: number } | null>(null)
  const [clearingCache, setClearingCache] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const voiceInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const bgmInputRef = useRef<HTMLInputElement>(null)
  const pipInputRef = useRef<HTMLInputElement>(null)

  const {
    selectedVoiceId,
    selectedVideoMaterialId,
    selectedBgmId,
    setUploadedVideos: setStoreVideos,
    setUploadedVoices: setStoreVoices,
    setUploadedBgms: setStoreBgms,
    setSelectedVoiceId,
    setSelectedVideoMaterialId,
    setSelectedBgmId,
  } = useVideoPageStore()

  const loadMaterials = useCallback(async () => {
    if (!(window as any).api) return
    setLoadingMaterials(true)
    try {
      const [voicesConfig, videosConfig, bgmsConfig, pipsConfig] = await Promise.all([
        (window as any).api.loadUploadedVoicesConfig?.() || { voices: [] },
        (window as any).api.loadUploadedVideosConfig?.() || { videos: [] },
        (window as any).api.loadUploadedBgmsConfig?.() || { bgms: [] },
        (window as any).api.loadPipResourcesConfig?.() || { items: [] },
      ])
      const voices = voicesConfig?.voices || []
      const videos = videosConfig?.videos || []
      const bgms = bgmsConfig?.bgms || []
      const pips = pipsConfig?.items || []
      setUploadedVoices(voices)
      setUploadedVideos(videos)
      setUploadedBgms(bgms)
      setUploadedPips(pips)
      setStoreVoices(voices)
      setStoreVideos(videos)
      setStoreBgms(bgms)
    } catch (e) {
      console.error('Load materials failed:', e)
    } finally {
      setLoadingMaterials(false)
    }
  }, [setStoreBgms, setStoreVideos, setStoreVoices])

  const loadCacheInfo = useCallback(async () => {
    if (!(window as any).api?.getCacheInfo) return
    try {
      const info = await (window as any).api.getCacheInfo()
      if (info.success) {
        setCacheInfo({ formattedSize: info.formattedSize, fileCount: info.fileCount })
      }
    } catch (e) {
      console.error('Load cache info failed:', e)
    }
  }, [])

  useEffect(() => {
    loadMaterials()
  }, [loadMaterials])

  useEffect(() => {
    if (dataSubTab === 'cache') {
      loadCacheInfo()
    }
  }, [dataSubTab, loadCacheInfo])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  useEffect(() => {
    if (!previewVideoItem) {
      setPreviewVideoUrl('')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await (window as any).api?.getLocalFileUrl?.(previewVideoItem.path)
        if (!cancelled) {
          setPreviewVideoUrl(res?.success && res.url ? res.url : '')
        }
      } catch {
        if (!cancelled) setPreviewVideoUrl('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [previewVideoItem])

  const deleteMaterial = async (type: 'voices' | 'videos' | 'bgms' | 'pips', item: MaterialItem) => {
    if (!(window as any).api) return
    try {
      if (item.path) {
        await (window as any).api.deleteUserDataFile?.(item.path)
      }
      if (type === 'voices') {
        const newList = uploadedVoices.filter((v) => v.id !== item.id)
        setUploadedVoices(newList)
        await (window as any).api.saveUploadedVoicesConfig?.({ voices: newList })
        setStoreVoices(newList)
        if (selectedVoiceId === item.id) setSelectedVoiceId(newList[0]?.id || '')
        if (playingId === item.id) {
          audioRef.current?.pause()
          setPlayingId(null)
        }
      } else if (type === 'videos') {
        const newList = uploadedVideos.filter((v) => v.id !== item.id)
        setUploadedVideos(newList)
        await (window as any).api.saveUploadedVideosConfig?.({ videos: newList })
        setStoreVideos(newList)
        if (selectedVideoMaterialId === item.id) setSelectedVideoMaterialId(newList[0]?.id || '')
      } else if (type === 'bgms') {
        const newList = uploadedBgms.filter((v) => v.id !== item.id)
        setUploadedBgms(newList)
        await (window as any).api.saveUploadedBgmsConfig?.({ bgms: newList })
        setStoreBgms(newList)
        if (selectedBgmId === item.id) setSelectedBgmId(newList[0]?.id || '')
        if (playingId === item.id) {
          audioRef.current?.pause()
          setPlayingId(null)
        }
      } else if (type === 'pips') {
        const newList = uploadedPips.filter((v) => v.id !== item.id)
        setUploadedPips(newList)
        await (window as any).api.savePipResourcesConfig?.({ items: newList })
        if (previewVideoItem?.id === item.id) setPreviewVideoItem(null)
      }
      showToast('已删除', 'success')
    } catch (e) {
      console.error('Delete material failed:', e)
      showToast('删除失败', 'error')
    }
  }

  const togglePlay = async (item: MaterialItem) => {
    if (playingId === item.id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    try {
      const urlResult = await (window as any).api?.getLocalFileUrl?.(item.path)
      if (urlResult?.success && urlResult.url) {
        audioRef.current?.pause()
        const audio = new Audio(urlResult.url)
        audioRef.current = audio
        audio.onended = () => setPlayingId(null)
        audio.play()
        setPlayingId(item.id)
      }
    } catch (e) {
      console.error('Play audio failed:', e)
      showToast('播放失败', 'error')
    }
  }

  const batchUploadVoices = () => {
    if (!(window as any).api?.uploadVoiceAndTranscribe) {
      showToast('上传功能不可用，请重启客户端', 'error')
      return
    }
    voiceInputRef.current?.click()
  }

  const handleVoiceFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return

    setUploading(true)
    let successCount = 0
    try {
      for (const file of files) {
        if (!isAllowedAudioFile(file)) continue
        const filePath = await saveFileToTemp(file, 'temp/voices')
        if (!filePath) continue
        const res = await (window as any).api.uploadVoiceAndTranscribe(filePath, file.name)
        if (res?.success) successCount++
      }
      await loadMaterials()
      showToast(successCount > 0 ? `成功上传 ${successCount} 个音色` : '没有可上传的文件', successCount > 0 ? 'success' : 'info')
    } catch (err) {
      console.error('Batch upload voices failed:', err)
      showToast('批量上传失败', 'error')
    } finally {
      setUploading(false)
    }
  }

  const batchUploadAvatars = () => {
    if (!(window as any).api?.uploadVideoMaterial) {
      showToast('上传功能不可用，请重启客户端', 'error')
      return
    }
    avatarInputRef.current?.click()
  }

  const handleAvatarFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return

    setUploading(true)
    let successCount = 0
    try {
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith('.mp4') && file.type !== 'video/mp4') continue
        const filePath = await saveVideoFileToTemp(file)
        if (!filePath) continue
        const res = await (window as any).api.uploadVideoMaterial(filePath, file.name)
        if (res?.success) successCount++
      }
      await loadMaterials()
      showToast(successCount > 0 ? `成功上传 ${successCount} 个形象` : '没有可上传的文件', successCount > 0 ? 'success' : 'info')
    } catch (err) {
      console.error('Batch upload avatars failed:', err)
      showToast('批量上传失败', 'error')
    } finally {
      setUploading(false)
    }
  }

  const batchUploadBgms = () => {
    if (!(window as any).api?.uploadBgmMaterial) {
      showToast('上传功能不可用，请重启客户端', 'error')
      return
    }
    bgmInputRef.current?.click()
  }

  const handleBgmFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return

    setUploading(true)
    let successCount = 0
    let failCount = 0
    try {
      for (const file of files) {
        if (!isAllowedAudioFile(file)) {
          failCount++
          continue
        }
        const filePath = await saveFileToTemp(file, 'temp/bgms')
        if (!filePath) {
          failCount++
          continue
        }
        const res = await (window as any).api.uploadBgmMaterial(filePath, file.name, '推荐')
        if (res?.success) successCount++
        else failCount++
      }
      await loadMaterials()
      if (successCount > 0) {
        showToast(`成功上传 ${successCount} 个BGM`, 'success')
      } else if (failCount > 0) {
        showToast('上传失败，请确认文件为 WAV / MP3 / M4A 格式', 'error')
      } else {
        showToast('没有可上传的文件', 'info')
      }
    } catch (err) {
      console.error('Batch upload bgms failed:', err)
      showToast('批量上传失败', 'error')
    } finally {
      setUploading(false)
    }
  }

  const batchUploadPips = () => {
    if (!(window as any).api?.uploadPipMaterial) {
      showToast('上传功能不可用，请重启客户端', 'error')
      return
    }
    pipInputRef.current?.click()
  }

  const handlePipFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return

    setUploading(true)
    let successCount = 0
    let failCount = 0
    try {
      for (const file of files) {
        if (!isAllowedPipFile(file)) {
          failCount++
          continue
        }
        const filePath = await savePipFileToTemp(file)
        if (!filePath) {
          failCount++
          continue
        }
        const res = await (window as any).api.uploadPipMaterial(filePath, file.name)
        if (res?.success) successCount++
        else failCount++
      }
      await loadMaterials()
      if (successCount > 0) {
        showToast(`成功上传 ${successCount} 个画中画素材`, 'success')
      } else if (failCount > 0) {
        showToast('上传失败，请确认文件为 MP4 视频或 JPG/PNG 等图片格式', 'error')
      } else {
        showToast('没有可上传的文件', 'info')
      }
    } catch (err) {
      console.error('Batch upload pips failed:', err)
      showToast('批量上传失败', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleClearCache = async () => {
    if (!(window as any).api?.clearCache) return
    setClearingCache(true)
    try {
      const result = await (window as any).api.clearCache()
      if (result.success) {
        showToast(result.message || '缓存已清理', 'success')
        loadCacheInfo()
      } else {
        showToast('清理失败: ' + (result.error || '未知错误'), 'error')
      }
    } catch (e) {
      console.error('Clear cache failed:', e)
      showToast('清理失败', 'error')
    } finally {
      setClearingCache(false)
    }
  }

  const handleRefresh = async () => {
    if (refreshing || uploading) return
    setRefreshing(true)
    try {
      if (dataSubTab === 'cache') {
        await loadCacheInfo()
      } else {
        await loadMaterials()
      }
      showToast('已刷新', 'success')
    } catch (e) {
      console.error('Refresh materials failed:', e)
      showToast('刷新失败', 'error')
    } finally {
      setRefreshing(false)
    }
  }

  const renderToolbar = (count: number, label: string, onUpload?: () => void, uploadLabel?: string) => (
    <div className="material-toolbar">
      <span className="material-toolbar-count">共 {count} 个{label}</span>
      {onUpload && (
        <button type="button" className="material-upload-btn" onClick={onUpload} disabled={uploading}>
          {uploading ? '上传中…' : uploadLabel || '批量上传'}
        </button>
      )}
    </div>
  )

  const renderEmpty = (text: string) => (
    <div className="material-empty">
      <div className="material-empty-icon">📁</div>
      <p className="material-empty-title">{text}</p>
    </div>
  )

  const subTabs = [
    { key: 'voices', label: '音色素材' },
    { key: 'videos', label: '形象素材' },
    { key: 'bgms', label: 'BGM素材' },
    { key: 'pips', label: '画中画素材' },
    { key: 'cache', label: '缓存清理' },
  ]

  return (
    <div className="data-management-panel material-library-panel">
      <div className="data-management-subtabs-row">
        <div className="data-management-subtabs">
          {subTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              className={dataSubTab === t.key ? 'active' : ''}
              onClick={() => setDataSubTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <PageRefreshButton onRefresh={handleRefresh} loading={refreshing || loadingMaterials} title="刷新素材列表" />
      </div>

      <div className="data-management-body">
        {dataSubTab === 'voices' && (
          <div className="material-section">
            <p className="data-management-desc">管理你上传的参考音色，支持批量上传、试听预览，删除后不可恢复。</p>
            {renderToolbar(uploadedVoices.length, '音色', batchUploadVoices, '批量上传音色')}
            {loadingMaterials ? (
              <div className="data-management-empty">加载中...</div>
            ) : uploadedVoices.length === 0 ? (
              renderEmpty('暂无音色，点击右上角批量上传')
            ) : (
              <div className="material-grid">
                {uploadedVoices.map((item) => (
                  <div key={item.id} className="material-card material-card--audio">
                    <button type="button" className="material-card-preview-btn" onClick={() => togglePlay(item)} title="试听">
                      <MaterialAudioIcon playing={playingId === item.id} />
                    </button>
                    <div className="material-card-body">
                      <span className="material-card-title" title={item.name}>{item.name}</span>
                      <div className="material-card-actions">
                        <button type="button" className="material-action-btn material-action-btn--primary" onClick={() => togglePlay(item)}>
                          {playingId === item.id ? '停止' : '播放'}
                        </button>
                        <button
                          type="button"
                          className="material-action-btn material-action-btn--danger"
                          onClick={() => { if (confirm(`确定删除「${item.name}」？`)) deleteMaterial('voices', item) }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {dataSubTab === 'videos' && (
          <div className="material-section">
            <p className="data-management-desc">管理数字人形象视频，支持批量上传、缩略图预览，删除后不可恢复。</p>
            {renderToolbar(uploadedVideos.length, '形象', batchUploadAvatars, '批量上传形象')}
            {loadingMaterials ? (
              <div className="data-management-empty">加载中...</div>
            ) : uploadedVideos.length === 0 ? (
              renderEmpty('暂无形象素材，点击右上角批量上传')
            ) : (
              <div className="material-grid">
                {uploadedVideos.map((item) => (
                  <div key={item.id} className="material-card material-card--video">
                    <button type="button" className="material-card-preview-btn" onClick={() => setPreviewVideoItem(item)} title="预览">
                      <MaterialVideoPreview item={item} />
                    </button>
                    <div className="material-card-body">
                      <span className="material-card-title" title={item.name}>{item.name}</span>
                      <div className="material-card-actions">
                        <button type="button" className="material-action-btn material-action-btn--primary" onClick={() => setPreviewVideoItem(item)}>
                          预览
                        </button>
                        <button
                          type="button"
                          className="material-action-btn material-action-btn--danger"
                          onClick={() => { if (confirm(`确定删除「${item.name}」？`)) deleteMaterial('videos', item) }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {dataSubTab === 'bgms' && (
          <div className="material-section">
            <p className="data-management-desc">管理背景音乐素材，支持批量上传、试听预览，删除后不可恢复。</p>
            {renderToolbar(uploadedBgms.length, 'BGM', batchUploadBgms, '批量上传BGM')}
            {loadingMaterials ? (
              <div className="data-management-empty">加载中...</div>
            ) : uploadedBgms.length === 0 ? (
              renderEmpty('暂无BGM，点击右上角批量上传')
            ) : (
              <div className="material-grid">
                {uploadedBgms.map((item) => (
                  <div key={item.id} className="material-card material-card--audio">
                    <button type="button" className="material-card-preview-btn" onClick={() => togglePlay(item)} title="试听">
                      <MaterialAudioIcon playing={playingId === item.id} />
                    </button>
                    <div className="material-card-body">
                      <span className="material-card-title" title={item.name}>{item.name}</span>
                      <div className="material-card-actions">
                        <button type="button" className="material-action-btn material-action-btn--primary" onClick={() => togglePlay(item)}>
                          {playingId === item.id ? '停止' : '播放'}
                        </button>
                        <button
                          type="button"
                          className="material-action-btn material-action-btn--danger"
                          onClick={() => { if (confirm(`确定删除「${item.name}」？`)) deleteMaterial('bgms', item) }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {dataSubTab === 'pips' && (
          <div className="material-section">
            <p className="data-management-desc">
              管理智能剪辑画中画素材，支持批量上传 MP4 视频或 JPG/PNG 图片，素材会同步到智能剪辑的画中画库，删除后不可恢复。
            </p>
            {renderToolbar(uploadedPips.length, '画中画', batchUploadPips, '批量上传画中画')}
            {loadingMaterials ? (
              <div className="data-management-empty">加载中...</div>
            ) : uploadedPips.length === 0 ? (
              renderEmpty('暂无画中画素材，点击右上角批量上传')
            ) : (
              <div className="material-grid">
                {uploadedPips.map((item) => (
                  <div key={item.id} className="material-card material-card--video material-card--pip">
                    <button type="button" className="material-card-preview-btn" onClick={() => setPreviewVideoItem(item)} title="预览">
                      <MaterialPipPreview item={item} />
                    </button>
                    <div className="material-card-body">
                      <span className="material-card-title" title={item.name}>{item.name}</span>
                      <div className="material-card-actions">
                        <button type="button" className="material-action-btn material-action-btn--primary" onClick={() => setPreviewVideoItem(item)}>
                          预览
                        </button>
                        <button
                          type="button"
                          className="material-action-btn material-action-btn--danger"
                          onClick={() => { if (confirm(`确定删除「${item.name}」？`)) deleteMaterial('pips', item) }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {dataSubTab === 'cache' && (
          <div className="material-section material-section--cache">
            <p className="data-management-desc">清理生成的视频、音频及各类缓存文件，释放磁盘空间。</p>
            <div className="material-cache-card">
              <div className="material-cache-info">
                <div className="material-cache-icon">🗂️</div>
                <div>
                  <div className="material-cache-label">当前缓存占用</div>
                  <div className="material-cache-size">{cacheInfo?.formattedSize || '计算中...'}</div>
                  {cacheInfo && <div className="material-cache-meta">{cacheInfo.fileCount} 个文件</div>}
                </div>
              </div>
              <button type="button" className="material-cache-clear-btn" onClick={handleClearCache} disabled={clearingCache}>
                {clearingCache ? '清理中...' : '一键清理缓存'}
              </button>
            </div>
          </div>
        )}
      </div>

      {previewVideoItem && (
        <div className="works-preview-overlay" onClick={() => setPreviewVideoItem(null)}>
          <div className="works-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="works-preview-header">
              <span>{previewVideoItem.name || '形象预览'}</span>
              <button type="button" className="works-preview-close" onClick={() => setPreviewVideoItem(null)}>×</button>
            </div>
            <div className="works-preview-body">
              {previewVideoUrl ? (
                isPipImagePath(previewVideoItem.path || previewVideoItem.name || '') ? (
                  <img className="works-preview-video works-preview-image" src={previewVideoUrl} alt={previewVideoItem.name || '画中画预览'} />
                ) : (
                  <video className="works-preview-video" src={previewVideoUrl} controls autoPlay playsInline />
                )
              ) : (
                <div className="works-preview-missing">无法预览，文件可能已被移动或删除。</div>
              )}
            </div>
          </div>
        </div>
      )}

      <input
        ref={voiceInputRef}
        type="file"
        accept=".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4,audio/x-m4a"
        multiple
        style={{ display: 'none' }}
        onChange={handleVoiceFilesSelected}
      />
      <input
        ref={avatarInputRef}
        type="file"
        accept=".mp4,video/mp4"
        multiple
        style={{ display: 'none' }}
        onChange={handleAvatarFilesSelected}
      />
      <input
        ref={bgmInputRef}
        type="file"
        accept=".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4,audio/x-m4a"
        multiple
        style={{ display: 'none' }}
        onChange={handleBgmFilesSelected}
      />
      <input
        ref={pipInputRef}
        type="file"
        accept=".mp4,.mov,.webm,.avi,.mkv,.png,.jpg,.jpeg,.gif,.webp,video/*,image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handlePipFilesSelected}
      />
    </div>
  )
}
