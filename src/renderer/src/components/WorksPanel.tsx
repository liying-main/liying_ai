// @ts-nocheck
import { useEffect, useState } from 'react'
import { useVideoGenerateHistory } from '../hooks/useVideoGenerateHistory'
import { useVideoWorksHistoryStore } from '../store/VideoWorksHistoryStore'
import { useToast } from '../hooks/useToast'
import { usePublishTasksStore } from '../store/PublishTasksStore'
import { useVideoPageStore } from '../store/VideoPageStore'
import { PageRefreshButton } from './PageRefreshButton'

function getWorkVideoPath(item: any) {
  return (
    item?.finalVideoPath ||
    item?.smartCutVideoPath ||
    item?.bgmedVideoPath ||
    item?.subtitledVideoPath ||
    item?.titledVideoPath ||
    item?.generatedVideoPath ||
    item?.originalVideoPath ||
    ''
  )
}

function WorkPreview({ item }: { item: any }) {
  const [previewUrl, setPreviewUrl] = useState('')
  const path = getWorkVideoPath(item)

  useEffect(() => {
    let cancelled = false
    setPreviewUrl('')
    if (!path) return
    ;(async () => {
      try {
        const res = await (window as any).api?.getLocalFileUrl?.(path)
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
  }, [path])

  if (!path) {
    return (
      <div className="works-card-preview works-card-preview--empty">
        <span>无视频文件</span>
      </div>
    )
  }

  if (!previewUrl) {
    return <div className="works-card-preview works-card-preview--loading">加载预览…</div>
  }

  return (
    <video
      className="works-card-preview-video"
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
        const el = e.currentTarget
        el.pause()
      }}
    />
  )
}

interface WorksPanelProps {
  onNavigateHome?: () => void
  onNavigateTaskCenter?: () => void
}

export function WorksPanel({ onNavigateHome, onNavigateTaskCenter }: WorksPanelProps) {
  const showToast = useToast()
  const historyList = useVideoWorksHistoryStore((s) => s.historyList)
  const historyLoading = useVideoWorksHistoryStore((s) => s.loading)
  const refreshHistoryList = useVideoWorksHistoryStore((s) => s.refreshHistoryList)
  const updateLatestSnapshot = useVideoWorksHistoryStore((s) => s.updateLatestSnapshot)
  const deleteSnapshot = useVideoWorksHistoryStore((s) => s.deleteSnapshot)
  const videoHistory = useVideoGenerateHistory()
  const addTask = usePublishTasksStore((s) => s.addTask)
  const viralTitle = useVideoPageStore((s) => s.viralTitle)
  const videoTags = useVideoPageStore((s) => s.videoTags)
  const publishPlatforms = useVideoPageStore((s) => s.publishPlatforms)
  const publishAccountIds = useVideoPageStore((s) => s.publishAccountIds)
  const publishMode = useVideoPageStore((s) => s.publishMode)
  const [previewItem, setPreviewItem] = useState<any>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    refreshHistoryList().catch(() => {})
  }, [refreshHistoryList])

  useEffect(() => {
    if (!previewItem) {
      setPreviewUrl('')
      return
    }
    const path = getWorkVideoPath(previewItem)
    if (!path) {
      setPreviewUrl('')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await (window as any).api?.getLocalFileUrl?.(path)
        if (!cancelled) {
          setPreviewUrl(res?.success && res.url ? res.url : '')
        }
      } catch {
        if (!cancelled) setPreviewUrl('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [previewItem])

  const handleLoad = async (item: any) => {
    await videoHistory.loadHistoryItem(item)
    onNavigateHome?.()
  }

  const handleExport = async (item: any) => {
    const path = getWorkVideoPath(item)
    if (!path) {
      showToast('该作品没有可导出的视频', 'info')
      return
    }
    const result = await (window as any).api?.saveLocalFileAs?.(path)
    if (result?.canceled) return
    if (result?.success) showToast('视频已保存', 'success')
    else showToast(result?.error || '保存失败', 'error')
  }

  const handleCreateTask = async (item: any) => {
    const path = getWorkVideoPath(item)
    if (!path) {
      showToast('该作品没有可发布的视频', 'info')
      return
    }
    if (!publishPlatforms?.length) {
      showToast('请先在发布准备中选择至少一个发布平台', 'info')
      return
    }
    if (!publishMode) {
      showToast('请先在发布准备中选择投放方式', 'info')
      return
    }
    await addTask({
      workId: item.id,
      workLabel: item.label || '未命名',
      videoPath: path,
      title: item.label || viralTitle || '未命名作品',
      tags: videoTags,
      platforms: publishPlatforms,
      accountIds: publishPlatforms.map((p) => publishAccountIds[p]).filter(Boolean),
      publishMode: publishMode as 'manual' | 'auto',
    })
    showToast('已加入任务中心', 'success')
    onNavigateTaskCenter?.()
  }

  const handleRefresh = async () => {
    if (historyLoading) return
    try {
      const saved = await updateLatestSnapshot()
      const list = await refreshHistoryList()
      setRefreshKey((k) => k + 1)
      if (saved) {
        showToast(`已刷新，共 ${list.length} 个作品（已同步当前工作台）`, 'success')
      } else {
        showToast(`已刷新，共 ${list.length} 个作品`, 'success')
      }
    } catch (e) {
      console.error('Refresh works failed:', e)
      showToast(e instanceof Error ? e.message : '刷新失败', 'error')
    }
  }

  return (
    <div className="settings-page works-page">
      <div className="settings-page-header">
        <div className="settings-page-header-row">
          <h2 className="settings-page-title">我的作品</h2>
          <PageRefreshButton onRefresh={handleRefresh} loading={historyLoading} title="刷新作品列表" />
        </div>
        <p className="works-page-desc">这里保存你在工作台制作并生成的历史成片，可加载继续编辑或导出。</p>
      </div>

      <div className="settings-page-body">
        {historyLoading && historyList.length === 0 ? (
          <div className="data-management-empty">加载中...</div>
        ) : historyList.length === 0 ? (
          <div className="works-empty">
            <div className="works-empty-icon">🎬</div>
            <p className="works-empty-title">还没有作品</p>
            <p className="works-empty-desc">在工作台完成形象生成、润色或导出后，会自动保存到这里。</p>
          </div>
        ) : (
          <div className={`works-grid ${historyLoading ? 'works-grid--refreshing' : ''}`}>
            {historyList.map((item: any) => (
              <div key={`${item.id ?? item.createdAt}-${refreshKey}`} className="works-card">
                <button
                  type="button"
                  className="works-card-preview-btn"
                  onClick={() => setPreviewItem(item)}
                  title="预览成片"
                >
                  <WorkPreview item={item} />
                </button>
                <div className="works-card-body">
                  <div className="works-card-meta">
                    <span className="works-card-title">{item.label || '未命名'}</span>
                    <span className="works-card-date">
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleString('zh-CN')
                        : ''}
                    </span>
                  </div>
                  <div className="works-card-actions works-card-actions--wrap">
                    <button
                      type="button"
                      className="works-action-btn works-action-btn--primary"
                      onClick={() => handleLoad(item)}
                      title="加载到工作台"
                    >
                      加载
                    </button>
                    <button
                      type="button"
                      className="works-action-btn"
                      onClick={() => handleCreateTask(item)}
                      title="创建发布任务"
                    >
                      任务
                    </button>
                    <button
                      type="button"
                      className="works-action-btn"
                      onClick={() => handleExport(item)}
                      title="导出视频"
                    >
                      导出
                    </button>
                    <button
                      type="button"
                      className="works-action-btn works-action-btn--danger"
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        if (!confirm(`确定删除「${item.label || '未命名'}」？`)) return
                        deleteSnapshot(item.id)
                          .then(() => showToast('已删除', 'success'))
                          .catch(() => showToast('删除失败', 'error'))
                      }}
                      title="删除作品"
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

      {previewItem && (
        <div className="works-preview-overlay" onClick={() => setPreviewItem(null)}>
          <div className="works-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="works-preview-header">
              <span>{previewItem.label || '作品预览'}</span>
              <button type="button" className="works-preview-close" onClick={() => setPreviewItem(null)}>
                ×
              </button>
            </div>
            <div className="works-preview-body">
              {previewUrl ? (
                <video className="works-preview-video" src={previewUrl} controls autoPlay playsInline />
              ) : (
                <div className="works-preview-missing">无法预览，视频文件可能已被移动或删除。</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
