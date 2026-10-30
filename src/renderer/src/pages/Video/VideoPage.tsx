import { useState, useEffect } from 'react'
import { VideoScriptCard } from './VideoScriptCard'
import { VideoAudioCard } from './VideoAudioCard'
import { VideoGenerateCard } from './VideoGenerateCard'
import { VideoSubtitleCard } from './VideoSubtitleCard'
import { VideoBgmCard } from './VideoBgmCard.simple'
import { useVideoPageStore } from '../../store/VideoPageStore'
import { QueuePopup } from '../../components/QueuePopup'
import { UserAvatar } from '../../components/UserAvatar'
import { Sidebar } from '../../components/Sidebar'
import { SettingsPanel } from '../../components/SettingsPanel'
import { WorksPanel } from '../../components/WorksPanel'
import { TaskCenterPanel } from '../../components/TaskCenterPanel'

interface VideoPageProps {}

export function VideoPage(_props: VideoPageProps) {
  const flowMode = useVideoPageStore((s) => s.flowMode)
  const setFlowMode = useVideoPageStore((s) => s.setFlowMode)
  const runAutoFlow = useVideoPageStore((s) => s.runAutoFlow)
  const autoFlowRunning = useVideoPageStore((s) => s.autoFlowRunning)
  const loadAllResources = useVideoPageStore((s) => s.loadAllResources)
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activePage, setActivePage] = useState('home')
  const [needsSetup, setNeedsSetup] = useState(false)

  const isHomePage = activePage === 'home'
  const isSettingsPage = activePage.startsWith('settings-')
  const isWorksPage = activePage === 'works'
  const isTaskCenterPage = activePage === 'task-center'

  // Load all resources on mount
  useEffect(() => {
    loadAllResources()
  }, [loadAllResources])

  useEffect(() => {
    window.api?.getStationConfig?.().then((config) => setNeedsSetup(!config?.apiKey?.trim())).catch(() => setNeedsSetup(true))
  }, [])

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
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} activeItem={activePage} onItemChange={setActivePage} />

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
                    手动
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={flowMode === 'auto'}
                    className={`script-mode-tab app-flow-tab ${flowMode === 'auto' ? 'active' : ''}`}
                    onClick={() => setFlowMode('auto')}
                  >
                    自动
                  </button>
                </div>
                {flowMode === 'auto' && (
                  <button
                    type="button"
                    className="video-button video-button-primary app-flow-oneclick"
                    disabled={!runAutoFlow || autoFlowRunning}
                    onClick={() => runAutoFlow?.()}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                    </svg>
                    一键自动后续流程
                  </button>
                )}
              </div>

              {/* 右侧 - AI队列、用户头像 */}
              <div className="app-main-header-right">
                <QueuePopup />
                <UserAvatar showSettings={showSettings} setShowSettings={setShowSettings} />
              </div>
            </div>
          </div>

          {/* 工作台始终挂载（隐藏而非卸载），避免切换页面时丢失生成进度 */}
          <div className="app-main-content">
            {isHomePage && needsSetup && (
              <div role="status" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', borderBottom: '1px solid var(--ly-border)', fontSize: '12px', color: 'var(--ly-text-2)' }}>
                <span style={{ flex: 1 }}>欢迎使用厉影AI 数字人。先体验工作台；使用云端生成时，请在设置中配置 API Key。</span>
                <button className="video-button video-button-primary" onClick={() => setActivePage('settings-api')}>配置服务</button>
                <button className="video-button" onClick={() => setNeedsSetup(false)}>稍后再说</button>
              </div>
            )}
            <div
              className={`video-page${isHomePage ? '' : ' video-page--hidden'}`}
              aria-hidden={!isHomePage}
            >
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
            {isSettingsPage && (
              <SettingsPanel activeTab={activePage as any} onConfigured={() => setNeedsSetup(false)} />
            )}
            {isWorksPage && (
              <WorksPanel
                onNavigateHome={() => setActivePage('home')}
                onNavigateTaskCenter={() => setActivePage('task-center')}
              />
            )}
            {isTaskCenterPage && (
              <TaskCenterPanel
                onNavigateHome={() => setActivePage('home')}
                onNavigateWorks={() => setActivePage('works')}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
