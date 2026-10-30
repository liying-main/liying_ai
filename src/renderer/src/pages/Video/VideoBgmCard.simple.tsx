// @ts-nocheck
/* eslint-disable */
import React, { useState, useRef, useEffect } from 'react'
import { useVideoPageStore } from '../../store/VideoPageStore'
import { useToast } from '../../hooks/useToast'
import { useVideoGenerateHistory } from '../../hooks/useVideoGenerateHistory'
import { templateService, llmService } from '../../api'
import { AutoFlowBinder } from '../../components/AutoFlowBinder'
import { usePublishAccountsStore } from '../../store/PublishAccountsStore'
import { PublishPlatformAccountList } from '../../components/PublishPlatformAccountSelect'
import { resolveAccountsForPlatforms, syncAccountLoginStatus } from '../../utils/publishAccountHelpers'
import { PLATFORM_LABELS, type PublishPlatform } from '../../types/publish'

const LANG_NAME_MAP: Record<string, string> = {
  'zh': '中文',
  'en': '英语',
  'ja': '日语',
  'ko': '韩语',
  'es': '西班牙语',
  'fr': '法语',
  'de': '德语',
  'pt': '葡萄牙语',
  'ru': '俄语',
  'ar': '阿拉伯语',
}
const getLanguageName = (code: string) => LANG_NAME_MAP[code] || code

export function VideoBgmCard() {
  const showToast = useToast()
  const { updateLatestSnapshot } = useVideoGenerateHistory()
  const {
    viralTitle,
    setViralTitle,
    videoTags,
    setVideoTags,
    finalVideoPath,
    generatedVideoPath,
    originalVideoPath,
    publishPlatforms,
    setPublishPlatforms,
    publishMode,
    setPublishMode,
    publishAccountIds,
    setPublishAccountId,
    originalScript,
    rewrittenScript,
    translatedText,
    showTranslatedInTextarea,
    sourceLanguage,
    llmModel,
  } = useVideoPageStore()

  const autoFlowStep = useVideoPageStore((s) => s.autoFlowStep)
  const autoFlowRunning = useVideoPageStore((s) => s.autoFlowRunning)
  const autoLoading = autoFlowRunning && autoFlowStep === 'publish'

  const [isPublishing, setIsPublishing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateProgress, setGenerateProgress] = useState(0)
  const generateIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (generateIntervalRef.current) clearInterval(generateIntervalRef.current)
    }
  }, [])

  const accounts = usePublishAccountsStore((s) => s.accounts)

  const handleSyncAccount = async (platform: PublishPlatform, accountId: string) => {
    const account = accounts.find((a) => a.id === accountId)
    if (!account) return
    const res = await syncAccountLoginStatus(account)
    showToast(res?.is_valid ? `${PLATFORM_LABELS[platform]}已登录，状态已同步` : res?.message || '仍未登录，请先在浏览器完成扫码', res?.is_valid ? 'success' : 'info')
  }

  useEffect(() => {
    usePublishAccountsStore.getState().loadAccounts()
  }, [])

  useEffect(() => {
    if (!publishMode) setPublishMode('manual')
    if (!publishPlatforms.length) setPublishPlatforms(['douyin'])
  }, [publishMode, publishPlatforms.length, setPublishMode, setPublishPlatforms])

  useEffect(() => {
    publishPlatforms.forEach((platform) => {
      if (publishAccountIds[platform]) return
      const list = accounts.filter((a) => a.platform === platform)
      if (list.length > 0) {
        const picked = list.find((a) => a.linkStatus === 'connected') || list[0]
        setPublishAccountId(platform, picked.id)
      }
    })
  }, [publishPlatforms, accounts, publishAccountIds, setPublishAccountId])

  const handleGenerate = async () => {
    if (isGenerating) return
    const scriptContent =
      showTranslatedInTextarea && translatedText
        ? translatedText.trim()
        : rewrittenScript.trim() || originalScript.trim()
    if (!scriptContent) {
      showToast('请先提取视频文案或输入文案内容', 'info')
      return
    }
    const langName = getLanguageName(sourceLanguage)
    setIsGenerating(true)
    setGenerateProgress(0)
    setViralTitle('')
    setVideoTags('')
    if (generateIntervalRef.current) clearInterval(generateIntervalRef.current)
    let progress = 0
    const progressInterval = setInterval(() => {
      progress += Math.random() * 5
      if (progress < 90) setGenerateProgress(Math.round(progress))
    }, 500)
    generateIntervalRef.current = progressInterval
    try {
      const { systemPrompt, userPrompts } = await templateService.getParsedTemplate('viral_title', {
        langName,
        scriptContent,
      })
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...userPrompts.map((prompt) => ({ role: 'user' as const, content: prompt })),
      ]
      const data = await llmService.completion(llmModel || 'DeepSeek', messages, {
        temperature: 0.8,
        max_tokens: 500,
      })
      clearInterval(progressInterval)
      setGenerateProgress(100)
      const responseData = (data as any).data || data
      if (responseData.choices?.[0]?.message?.content) {
        const content = responseData.choices[0].message.content
        try {
          const result = JSON.parse(content.trim())
          if (result.viralTitle) setViralTitle(result.viralTitle)
          if (result.videoTags) setVideoTags(result.videoTags)
        } catch (error) {
          console.error('Parse JSON failed, trying to extract from text:', error)
          const viralTitleMatch = content.match(/"viralTitle"\s*:\s*"([^"]+)"/)
          const videoTagsMatch = content.match(/"videoTags"\s*:\s*"([^"]+)"/)
          if (viralTitleMatch) setViralTitle(viralTitleMatch[1])
          if (videoTagsMatch) setVideoTags(videoTagsMatch[1])
        }
      } else {
        throw new Error('API未返回有效结果')
      }
    } catch (error: any) {
      console.error('Generate title failed:', error)
      clearInterval(progressInterval)
      showToast(`生成失败: ${error.message || '未知错误'}`, 'error')
    } finally {
      setIsGenerating(false)
      if (generateIntervalRef.current) {
        clearInterval(generateIntervalRef.current)
        generateIntervalRef.current = null
      }
    }
  }

  const handlePublish = async () => {
    const videoPath = finalVideoPath || generatedVideoPath || originalVideoPath
    if (!videoPath) {
      showToast('请先选择或生成要发布的视频', 'info')
      return
    }
    if (!viralTitle.trim()) {
      showToast('请先生成爆款视频标题', 'info')
      return
    }
    if (!videoTags.trim()) {
      showToast('请先生成视频标签', 'info')
      return
    }
    if (!publishPlatforms.length) {
      showToast('请先选择至少一个发布平台', 'info')
      return
    }
    if (!publishMode) {
      showToast('请先选择投放方式', 'info')
      return
    }
    setIsPublishing(true)
    try {
      await updateLatestSnapshot()

      const preferredIds: Partial<Record<PublishPlatform, string>> = {}
      publishPlatforms.forEach((p) => {
        if (publishAccountIds[p]) preferredIds[p as PublishPlatform] = publishAccountIds[p]
      })

      const { map, accountIds, created, errors } = await resolveAccountsForPlatforms(
        publishPlatforms as PublishPlatform[],
        preferredIds,
        true,
      )

      if (errors.length && Object.keys(map).length === 0) {
        showToast(errors[0], 'error')
        return
      }

      publishPlatforms.forEach((platform) => {
        const account = map[platform as PublishPlatform]
        if (account) setPublishAccountId(platform, account.id)
      })

      if (created.length) {
        showToast(
          `已为 ${created.map((p) => PLATFORM_LABELS[p]).join('、')} 自动创建默认账号，请完成后去发布账号管理登录`,
          'info',
        )
        await usePublishAccountsStore.getState().loadAccounts()
      }

      for (const platform of publishPlatforms) {
        const account = map[platform as PublishPlatform]
        if (account?.linkStatus !== 'connected') {
          const syncRes = await syncAccountLoginStatus(account)
          if (syncRes?.is_valid) {
            map[platform as PublishPlatform] = { ...account, linkStatus: 'connected' }
          }
        }
      }

      const payloadBase = {
        videoPath,
        title: viralTitle.trim(),
        description: videoTags.trim(),
        publishMode,
      }
      const results = await Promise.allSettled(
        publishPlatforms.map(async (platform) => {
          const account = map[platform as PublishPlatform]
          return {
            platform,
            accountName: account?.name,
            result: await (window as any).api.browserRunPublishFlow(platform, {
              ...payloadBase,
              userDataDir: account?.userDataDir,
              accountId: account?.id,
            }),
          }
        }),
      )
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const { platform, result } = r.value
          if (result?.success && result?.message) showToast(result.message, 'success')
          else if (result?.message) showToast(result.message, 'info')
          else if (result?.success) showToast(`已启动发布：${platform}`, 'success')
          else showToast(`发布失败：${platform}`, 'error')
        } else {
          showToast(
            `发布失败：${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
            'error'
          )
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      showToast('发布失败: ' + errMsg, 'error')
    } finally {
      setIsPublishing(false)
    }
  }

  const publishModes = [
    {
      id: 'manual',
      label: '手动发布',
      icon: (
        <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
          <path d="M10.5 2a.5.5 0 0 1 .5.5v1h1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h1v-1a.5.5 0 0 1 1 0v1h4v-1a.5.5 0 0 1 .5-.5zM4 6v6h8V6H4zm2 2h4v1H6V8z" />
        </svg>
      ),
    },
    {
      id: 'auto',
      label: '自动发布',
      icon: (
        <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
          <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm0 1.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM6.5 5.5l4 2.5-4 2.5V5.5z" />
        </svg>
      ),
    },
  ]

  const platforms = [
    { id: 'douyin', label: '抖音' },
    { id: 'bilibili', label: 'B站' },
    { id: 'kuaishou', label: '快手' },
    { id: 'wechat', label: '视频号' },
    { id: 'redbook', label: '小红书' },
  ]

  return (
    <>
      <AutoFlowBinder />
      <div className={`video-card video-card-smartcut ${autoLoading ? 'video-card-auto-loading' : ''}`}>
        <div className="video-card-header">
          <span className="video-card-number">05</span>
          <span className="video-card-title">发布准备</span>
        </div>
      <div className="video-card-body">
        {/* 左侧列 - 标题、标签、生成文案 */}
        <div className="smartcut-controls-col">
          <div className="video-form-group">
            <label className="video-label">发布标题</label>
            <input
              type="text"
              value={viralTitle}
              onChange={(e) => setViralTitle(e.target.value)}
              placeholder="输入发布标题"
              className="video-input"
            />
          </div>
          <div className="video-form-group">
            <label className="video-label">话题标签</label>
            <input
              type="text"
              value={videoTags}
              onChange={(e) => setVideoTags(e.target.value)}
              placeholder="输入标签，多个标签用逗号分隔"
              className="video-input"
            />
          </div>
          <div className="video-form-group">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="video-button video-button-primary"
              style={{ width: '100%' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7V4h16v3"/>
                <path d="M9 20h6"/>
                <path d="M12 4v16"/>
              </svg>
              {isGenerating ? `生成中 ${Math.round(generateProgress)}%` : '生成发布文案'}
            </button>
            {isGenerating && (
              <div className="video-progress">
                <div className="video-progress-bar" style={{ width: `${generateProgress}%` }} />
              </div>
            )}
          </div>
        </div>
        {/* 右侧列 - 方式、平台、账号 */}
        <div className="smartcut-controls-col">
          <div className="video-form-group">
            <label className="video-label">投放方式</label>
            <div className="publish-mode-group">
              {publishModes.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`publish-mode-chip${publishMode === m.id ? ' publish-mode-chip--active' : ''}`}
                  onClick={() => setPublishMode(m.id)}
                >
                  <span className="publish-platform-chip-icon">{m.icon}</span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="video-form-group">
            <label className="video-label">投放平台</label>
            <div className="publish-platform-grid">
              {platforms.map((p) => {
                const checked = publishPlatforms.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`publish-platform-chip${checked ? ' publish-platform-chip--active' : ''} publish-platform-chip--${p.id}`}
                    onClick={() => {
                      if (checked) {
                        if (publishPlatforms.length <= 1) {
                          showToast('至少保留一个发布平台', 'info')
                          return
                        }
                        setPublishPlatforms(publishPlatforms.filter((x) => x !== p.id))
                      } else {
                        setPublishPlatforms([...publishPlatforms, p.id])
                      }
                    }}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>
          {publishPlatforms.length > 0 && (
            <div className="video-form-group">
              <label className="video-label">发布账号</label>
              <PublishPlatformAccountList
                platforms={publishPlatforms as PublishPlatform[]}
                accountIds={publishAccountIds}
                onChange={(platform, accountId) => setPublishAccountId(platform, accountId)}
                onSyncStatus={handleSyncAccount}
                disabled={isPublishing}
              />
            </div>
          )}
          <div className="video-form-group">
            <button
              type="button"
              className="video-button video-button-publish"
              onClick={handlePublish}
              disabled={isPublishing}
              style={{ width: '100%' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              {isPublishing ? '启动中...' : '开始发布'}
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}
