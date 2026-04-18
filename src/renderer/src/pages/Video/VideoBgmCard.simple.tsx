// @ts-nocheck
/* eslint-disable */
import React, { useState, useRef, useEffect } from 'react'
import { useVideoPageStore } from '../../store/VideoPageStore'
import { useToast } from '../../hooks/useToast'
import { templateService, llmService } from '../../api'
import { AutoFlowBinder } from '../../components/AutoFlowBinder'
import { useAd } from '../../components/AdContext'

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
  const { openAd } = useAd()
  const showToast = useToast()
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

  const handleGenerate = async () => {
    openAd()
  }

  const handlePublish = async () => {
    openAd()
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
        {/* 左侧列 - 生成标题和输入 */}
        <div className="smartcut-controls-col">
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
        </div>
        {/* 右侧列 - 发布方式和平台 */}
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
