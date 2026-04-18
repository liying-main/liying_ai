import { useState } from 'react'
import { VideoScriptCard } from './VideoScriptCard'
import { VideoAudioCard } from './VideoAudioCard'
import { VideoGenerateCard } from './VideoGenerateCard'
import { VideoSubtitleCard } from './VideoSubtitleCard'
import { VideoBgmCard } from './VideoBgmCard.simple'
import { useVideoPageStore } from '../../store/VideoPageStore'
import { Sidebar } from '../../components/Sidebar'
import { SettingsPanel } from '../../components/SettingsPanel'
import { AdProvider, useAd } from '../../components/AdContext'

function AutoFlowAdButton() {
  const { openAd } = useAd()
  return (
    <button
      type="button"
      className="video-button video-button-primary app-flow-oneclick"
      onClick={() => openAd()}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
      一键串联后续流程
    </button>
  )
}

function VideoPageInner() {
  const flowMode = useVideoPageStore((s) => s.flowMode)
  const setFlowMode = useVideoPageStore((s) => s.setFlowMode)
  const runAutoFlow = useVideoPageStore((s) => s.runAutoFlow)
  const autoFlowRunning = useVideoPageStore((s) => s.autoFlowRunning)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activePage, setActivePage] = useState('home')
  const { openAd } = useAd()

  const isSettingsPage = activePage.startsWith('settings-')

  const handleMinimize = () => {
    (window as any).api?.minimizeWindow?.()
  }
  const handleMaximize = () => {
    (window as any).api?.maximizeWindow?.()
  }
  const handleClose = () => {
    (window as any).api?.closeWindow?.()
  }

  return (
    <div className="app-container">
      {/* 自定义标题栏 */}
      <div className="custom-titlebar">
        <div className="titlebar-drag-region" />
        <div className="titlebar-controls">
          <button className="titlebar-button" onClick={() => window.location.reload()} title="刷新">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
          <button className="titlebar-button" onClick={handleMinimize} title="最小化">
            <svg width="12" height="12" viewBox="0 0 12 12"><path fill="currentColor" d="M2 6h8v1H2z"/></svg>
          </button>
          <button className="titlebar-button" onClick={handleMaximize} title="最大化">
            <svg width="12" height="12" viewBox="0 0 12 12"><path fill="none" stroke="currentColor" d="M2.5 2.5h7v7h-7z"/></svg>
          </button>
          <button className="titlebar-button close-button" onClick={handleClose} title="关闭">
            <svg width="12" height="12" viewBox="0 0 12 12"><path fill="currentColor" d="M6.707 6l2.647 2.646-.708.708L6 6.707l-2.646 2.647-.708-.708L5.293 6 2.646 3.354l.708-.708L6 5.293l2.646-2.647.708.708z"/></svg>
          </button>
        </div>
      </div>

      {/* 侧边栏 + 主区域 横向布局 */}
      <div className="app-body">
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} activeItem={activePage} onItemChange={setActivePage} onAdClick={openAd} />

        <div className="app-main">
          {/* 主头部导航 */}
          <div className="app-main-header">
            <div className="app-main-header-inner">
              {/* 左侧 - 汉堡菜单 */}
              <div className="app-main-header-left">
                <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} title={sidebarCollapsed ? '展开' : '收起'}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <line x1="3" y1="12" x2="21" y2="12"/>
                    <line x1="3" y1="18" x2="21" y2="18"/>
                  </svg>
                </button>
              </div>

              {/* 中间 - 手动/自动切换 */}
              <div className="app-main-header-center">
                <div className="script-mode-tabs app-flow-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={flowMode === 'manual'}
                    className={`script-mode-tab app-flow-tab ${flowMode === 'manual' ? 'active' : ''}`}
                    onClick={() => setFlowMode('manual')}
                  >
                    分步处理
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={flowMode === 'auto'}
                    className={`script-mode-tab app-flow-tab ${flowMode === 'auto' ? 'active' : ''}`}
                    onClick={() => setFlowMode('auto')}
                  >
                    智能串联
                  </button>
                </div>
                {flowMode === 'auto' && <AutoFlowAdButton />}
              </div>

              {/* 右侧 */}
              <div className="app-main-header-right">
              </div>
            </div>
          </div>

          {/* 视频页面内容 或 设置页面 */}
          {isSettingsPage ? (
            <SettingsPanel activeTab={activePage as any} />
          ) : (
            <div className="video-page">
              <div className="video-page-container">
                <div className="video-page-grid-slot video-page-grid-slot--1">
                  <VideoScriptCard />
                </div>
                <div className="video-column">
                  <div className="video-page-grid-slot video-page-grid-slot--2">
                    <VideoAudioCard />
                  </div>
                  <div className="video-page-grid-slot video-page-grid-slot--3">
                    <VideoGenerateCard />
                  </div>
                </div>
                <div className="video-column video-column-span2">
                  <div className="video-page-grid-slot video-page-grid-slot--4">
                    <VideoSubtitleCard />
                  </div>
                  <div className="video-page-grid-slot video-page-grid-slot--5">
                    <VideoBgmCard />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function VideoPage() {
  return (
    <AdProvider>
      <VideoPageInner />
    </AdProvider>
  )
}
