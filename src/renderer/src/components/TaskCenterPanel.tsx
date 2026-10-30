// @ts-nocheck
import { useEffect, useMemo, useState } from 'react'
import { usePublishTasksStore, taskStatusLabel } from '../store/PublishTasksStore'
import { usePublishAccountsStore } from '../store/PublishAccountsStore'
import { useVideoGenerateHistory } from '../hooks/useVideoGenerateHistory'
import { useToast } from '../hooks/useToast'
import { PublishPlatformAccountList } from './PublishPlatformAccountSelect'
import { PublishModePicker, PublishPlatformPicker } from './PublishPlatformPicker'
import {
  buildTaskAccountIds,
  getAccountIdForTaskPlatform,
  resolveAccountsForPlatforms,
  syncAccountLoginStatus,
} from '../utils/publishAccountHelpers'
import { PLATFORM_LABELS, type PublishPlatform } from '../types/publish'
import { PageRefreshButton } from './PageRefreshButton'

interface TaskCenterPanelProps {
  onNavigateHome?: () => void
  onNavigateWorks?: () => void
  onNavigatePublishAccounts?: () => void
}

export function TaskCenterPanel({
  onNavigateHome,
  onNavigateWorks,
  onNavigatePublishAccounts,
}: TaskCenterPanelProps) {
  const showToast = useToast()
  const { tasks, loading, loadTasks, updateTask, removeTask } = usePublishTasksStore()
  const { accounts, loadAccounts } = usePublishAccountsStore()
  const videoHistory = useVideoGenerateHistory()
  const [publishingId, setPublishingId] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadTasks()
    loadAccounts()
  }, [loadTasks, loadAccounts])

  const taskAccountMaps = useMemo(() => {
    const maps: Record<string, Partial<Record<PublishPlatform, string>>> = {}
    tasks.forEach((task) => {
      const map: Partial<Record<PublishPlatform, string>> = {}
      task.platforms.forEach((platform) => {
        map[platform] = getAccountIdForTaskPlatform(task, platform)
      })
      maps[task.id] = map
    })
    return maps
  }, [tasks, accounts])

  const handleTaskAccountChange = async (task: any, platform: PublishPlatform, accountId: string) => {
    const current = { ...taskAccountMaps[task.id] }
    current[platform] = accountId
    await updateTask(task.id, {
      accountIds: buildTaskAccountIds(task.platforms, current),
    })
  }

  const handleTaskPlatformChange = async (task: any, nextPlatforms: PublishPlatform[]) => {
    const accountMap = taskAccountMaps[task.id] || {}
    await updateTask(task.id, {
      platforms: nextPlatforms,
      accountIds: buildTaskAccountIds(nextPlatforms, accountMap),
    })
  }

  const handleTaskModeChange = async (task: any, publishMode: 'manual' | 'auto') => {
    await updateTask(task.id, { publishMode })
  }

  const handleLoadWork = async (task: any) => {
    if (!task.workId) {
      showToast('该任务未关联作品快照，无法加载到工作台', 'info')
      return
    }
    const work = videoHistory.historyList.find((w: any) => w.id === task.workId)
    if (!work) {
      showToast('原作品可能已被删除，请从「我的作品」重新选择', 'info')
      onNavigateWorks?.()
      return
    }
    await videoHistory.loadHistoryItem(work)
    onNavigateHome?.()
    showToast('已加载到工作台', 'success')
  }

  const handlePublishTask = async (task: any) => {
    if (!task.videoPath) {
      showToast('任务缺少视频文件', 'error')
      return
    }
    if (!task.platforms?.length) {
      showToast('请先配置发布平台', 'info')
      return
    }

    setPublishingId(task.id)
    await updateTask(task.id, { status: 'publishing', statusMessage: '发布中...' })

    try {
      const preferredIds: Partial<Record<PublishPlatform, string>> = {}
      task.platforms.forEach((platform: PublishPlatform) => {
        preferredIds[platform] = getAccountIdForTaskPlatform(task, platform)
      })

      const { map, accountIds, created, errors } = await resolveAccountsForPlatforms(
        task.platforms,
        preferredIds,
        true,
      )

      if (errors.length && Object.keys(map).length === 0) {
        await updateTask(task.id, { status: 'failed', statusMessage: errors[0] })
        showToast(errors[0], 'error')
        return
      }

      if (accountIds.length) {
        await updateTask(task.id, { accountIds })
      }

      if (created.length) {
        showToast(
          `已为 ${created.map((p) => PLATFORM_LABELS[p]).join('、')} 自动创建默认账号，请完成后去发布账号管理登录`,
          'info',
        )
      }

      const results = []
      for (const platform of task.platforms as PublishPlatform[]) {
        const account = map[platform]
        if (!account) {
          results.push({
            platform,
            result: { success: false, message: `缺少${PLATFORM_LABELS[platform]}账号` },
            account: '',
          })
          continue
        }
        const payload = {
          videoPath: task.videoPath,
          title: task.title,
          description: task.tags,
          publishMode: task.publishMode || 'manual',
          userDataDir: account.userDataDir,
          accountId: account.id,
        }
        const result = await (window as any).api.browserRunPublishFlow(platform, payload)
        results.push({ platform, result, account: account.name })
      }

      const failed = results.filter((r) => !r.result?.success)
      if (failed.length === 0) {
        await updateTask(task.id, { status: 'done', statusMessage: '发布流程已完成' })
        showToast('发布任务已完成', 'success')
      } else {
        await updateTask(task.id, {
          status: 'failed',
          statusMessage: failed
            .map((f) => `${PLATFORM_LABELS[f.platform as PublishPlatform]}(${f.account}): ${f.result?.message || '失败'}`)
            .join('；'),
        })
        showToast('部分平台发布失败', 'error')
      }
    } catch (err: any) {
      await updateTask(task.id, { status: 'failed', statusMessage: err?.message || '发布失败' })
      showToast('发布失败', 'error')
    } finally {
      setPublishingId('')
    }
  }

  const handleDelete = async (task: any) => {
    if (!confirm(`确定删除任务「${task.title}」？`)) return
    await removeTask(task.id)
    showToast('已删除', 'success')
  }

  const handleRefresh = async () => {
    if (refreshing || loading) return
    setRefreshing(true)
    try {
      await Promise.all([loadTasks(), loadAccounts(), videoHistory.refreshHistoryList()])
      showToast('已刷新', 'success')
    } catch (e) {
      console.error('Refresh tasks failed:', e)
      showToast('刷新失败', 'error')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="settings-page task-center-page">
      <div className="settings-page-header">
        <div className="settings-page-header-row">
          <h2 className="settings-page-title">任务中心</h2>
          <PageRefreshButton onRefresh={handleRefresh} loading={refreshing || loading} title="刷新任务列表" />
        </div>
        <p className="works-page-desc">
          在此统一管理发布任务。每个平台请选择对应账号；若无账号，首次发布会自动创建默认账号并同步到发布账号管理。
        </p>
      </div>

      <div className="settings-page-body">
        {loading ? (
          <div className="data-management-empty">加载中...</div>
        ) : tasks.length === 0 ? (
          <div className="material-empty">
            <div className="material-empty-icon">📋</div>
            <p className="material-empty-title">暂无发布任务</p>
            <p className="works-page-desc">在工作台 05 发布准备或「我的作品」中创建任务</p>
          </div>
        ) : (
          <div className="task-center-list">
            {tasks.map((task) => (
              <div key={task.id} className="task-center-item">
                <div className="task-center-item-main">
                  <div className="task-center-item-title">{task.title}</div>
                  <div className="task-center-item-meta">
                    <span className={`task-center-status task-center-status--${task.status}`}>
                      {taskStatusLabel(task.status)}
                    </span>
                    <span>{new Date(task.createdAt).toLocaleString('zh-CN')}</span>
                  </div>
                  {task.workLabel && <div className="task-center-item-work">关联作品：{task.workLabel}</div>}
                  {task.statusMessage && <div className="task-center-item-msg">{task.statusMessage}</div>}
                  <div className="task-center-item-config">
                    <div className="task-center-item-config-row">
                      <label className="video-label">投放方式</label>
                      <PublishModePicker
                        mode={task.publishMode || 'manual'}
                        onChange={(mode) => handleTaskModeChange(task, mode as 'manual' | 'auto')}
                        disabled={task.status === 'publishing' || publishingId === task.id}
                      />
                    </div>
                    <div className="task-center-item-config-row">
                      <label className="video-label">投放平台</label>
                      <PublishPlatformPicker
                        platforms={task.platforms}
                        onChange={(platforms) => handleTaskPlatformChange(task, platforms)}
                        disabled={task.status === 'publishing' || publishingId === task.id}
                        onMinOneBlocked={() => showToast('至少保留一个发布平台', 'info')}
                      />
                    </div>
                  </div>
                  <div className="task-center-item-accounts">
                    <label className="video-label">发布账号</label>
                    <PublishPlatformAccountList
                      platforms={task.platforms}
                      accountIds={taskAccountMaps[task.id] || {}}
                      onChange={(platform, accountId) => handleTaskAccountChange(task, platform, accountId)}
                      disabled={task.status === 'publishing' || publishingId === task.id}
                      onNavigateAccounts={onNavigatePublishAccounts}
                      onSyncStatus={async (platform, accountId) => {
                        const account = accounts.find((a) => a.id === accountId)
                        if (!account) return
                        const res = await syncAccountLoginStatus(account)
                        showToast(
                          res?.is_valid ? `${PLATFORM_LABELS[platform]}已登录` : res?.message || '仍未登录',
                          res?.is_valid ? 'success' : 'info',
                        )
                      }}
                    />
                  </div>
                </div>
                <div className="task-center-item-actions">
                  {task.status !== 'publishing' && (
                    <button
                      type="button"
                      className="material-action-btn material-action-btn--primary"
                      disabled={publishingId === task.id}
                      onClick={() => handlePublishTask(task)}
                    >
                      开始发布
                    </button>
                  )}
                  {task.workId && (
                    <button type="button" className="material-action-btn" onClick={() => handleLoadWork(task)}>
                      加载作品
                    </button>
                  )}
                  <button
                    type="button"
                    className="material-action-btn material-action-btn--danger"
                    onClick={() => handleDelete(task)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
