import React, { RefObject, useState } from 'react'

interface PhoneModalProps {
  visible?: boolean
  videoUrl?: string
  videoSrc?: string
  onClose?: () => void
  isGeneratedVideo?: boolean
  phoneVideoRef?: RefObject<HTMLVideoElement>
  isPhoneVideoPaused?: boolean
  setIsPhoneVideoPaused?: (v: boolean) => void
  phoneVideoCurrentTime?: number
  phoneVideoDuration?: number
  setPhoneVideoCurrentTime?: (v: number) => void
  setPhoneVideoDuration?: (v: number) => void
  isPhoneVideoLandscape?: boolean
  setIsPhoneVideoLandscape?: (v: boolean) => void
  viralTitle?: string
  videoTags?: string
  nickName?: string
  avatarUrl?: string
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function PhoneModal(props: PhoneModalProps) {
  const [activeTab, setActiveTab] = useState('推荐')
  const videoSource = props.videoSrc || props.videoUrl
  if (!videoSource) return null

  const {
    isGeneratedVideo,
    phoneVideoRef,
    isPhoneVideoPaused,
    setIsPhoneVideoPaused,
    phoneVideoCurrentTime = 0,
    phoneVideoDuration = 0,
    setPhoneVideoCurrentTime,
    setPhoneVideoDuration,
    isPhoneVideoLandscape,
    setIsPhoneVideoLandscape,
    viralTitle,
    videoTags,
    nickName,
    avatarUrl,
    onClose,
  } = props

  const hasTitleOrTags = (viralTitle?.trim().length ?? 0) > 0 || (videoTags?.trim().length ?? 0) > 0
  const normalizedTags = (videoTags || '')
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0)
    .map(t => t.startsWith('#') ? t : `#${t}`)
    .join(' ')
  const descriptionText = hasTitleOrTags
    ? `${(viralTitle || '').trim()} ${normalizedTags}`.trim()
    : 'AI智能视频创作，一键生成专业级内容 #视频制作 #AI创作'
  const displayNickName = nickName?.trim().length ? nickName.trim() : '创作者'
  const fallbackAvatarSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Ccircle cx='24' cy='24' r='24' fill='%233b82f6'/%3E%3Ctext x='24' y='32' font-size='20' fill='white' text-anchor='middle'%3E用户%3C/text%3E%3C/svg%3E"

  const handleVideoClick = () => {
    if (phoneVideoRef?.current) {
      if (phoneVideoRef.current.paused) phoneVideoRef.current.play()
      else phoneVideoRef.current.pause()
    }
  }

  const handleVideoLoadedMetadata = () => {
    if (phoneVideoRef?.current) {
      phoneVideoRef.current.currentTime = 0
      setPhoneVideoDuration?.(phoneVideoRef.current.duration)
      setPhoneVideoCurrentTime?.(0)
      setIsPhoneVideoPaused?.(phoneVideoRef.current.paused)
      setIsPhoneVideoLandscape?.(phoneVideoRef.current.videoWidth > phoneVideoRef.current.videoHeight)
    }
  }

  const handleTimeUpdate = () => {
    if (phoneVideoRef?.current) {
      setPhoneVideoCurrentTime?.(phoneVideoRef.current.currentTime)
    }
  }

  if (isGeneratedVideo) {
    return (
      <div className="phone-modal-overlay" onClick={onClose}>
        <div className="phone-modal" onClick={e => e.stopPropagation()}>
          <div className="phone-frame">
            <div className="phone-notch" />
            <div className="phone-screen">
              {/* Status Bar */}
              <div className="phone-status-bar">
                <div className="phone-status-left">
                  <span className="phone-status-time">9:41</span>
                </div>
                <div className="phone-status-right">
                  <svg className="phone-status-icon" width="20" height="13" viewBox="0 0 20 13" fill="none">
                    <rect x="1" y="8" width="2.5" height="5" rx="0.5" fill="white" opacity="0.3" />
                    <rect x="5" y="5" width="2.5" height="8" rx="0.5" fill="white" opacity="0.5" />
                    <rect x="9" y="2" width="2.5" height="11" rx="0.5" fill="white" opacity="0.7" />
                    <rect x="13" y="0" width="2.5" height="13" rx="0.5" fill="white" />
                  </svg>
                  <svg className="phone-status-icon" width="20" height="15" viewBox="0 0 20 15" fill="none">
                    <rect x="0.5" y="2" width="16" height="11" rx="1" stroke="white" strokeWidth="1.2" />
                    <rect x="17" y="4.5" width="1.5" height="6" rx="0.3" fill="white" />
                    <rect x="2" y="4.5" width="13" height="6" rx="0.5" fill="white" />
                  </svg>
                </div>
              </div>

              {/* Tab Bar */}
              <div className="douyin-tab-bar">
                <button className={`douyin-tab-item ${activeTab === '直播' ? 'active' : ''}`} onClick={() => setActiveTab('直播')}>直播</button>
                <button className={`douyin-tab-item ${activeTab === '关注' ? 'active' : ''}`} onClick={() => setActiveTab('关注')}>关注</button>
                <button className={`douyin-tab-item ${activeTab === '推荐' ? 'active' : ''}`} onClick={() => setActiveTab('推荐')}>推荐</button>
              </div>

              {/* Video */}
              <video
                key={videoSource}
                ref={phoneVideoRef}
                className="phone-video"
                style={{ objectFit: isPhoneVideoLandscape ? 'contain' : 'cover' }}
                preload="auto"
                loop
                playsInline
                onClick={handleVideoClick}
                onPlay={() => setIsPhoneVideoPaused?.(false)}
                onPause={() => setIsPhoneVideoPaused?.(true)}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleVideoLoadedMetadata}
                onError={e => console.error('视频播放错误:', e)}
              >
                <source src={videoSource} />
              </video>

              {/* Douyin UI Overlay */}
              <div className="douyin-ui">
                {/* Right Actions */}
                <div className="douyin-actions">
                  {/* Avatar */}
                  <div className="douyin-action-item !mb-2">
                    <div className="douyin-avatar-wrapper">
                      <div className="douyin-avatar">
                        <img src={avatarUrl || fallbackAvatarSvg} alt="avatar" />
                      </div>
                      <button className="douyin-follow-add-btn">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M7 2V12M2 7H12" stroke="white" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Like */}
                  <div className="douyin-action-item">
                    <button className="douyin-action-btn">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                      <span>1.2w</span>
                    </button>
                  </div>

                  {/* Comment */}
                  <div className="douyin-action-item">
                    <button className="douyin-action-btn">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="12" r="10" />
                        <circle cx="8" cy="12" r="1.5" fill="#000" />
                        <circle cx="12" cy="12" r="1.5" fill="#000" />
                        <circle cx="16" cy="12" r="1.5" fill="#000" />
                      </svg>
                      <span>888</span>
                    </button>
                  </div>

                  {/* Star */}
                  <div className="douyin-action-item">
                    <button className="douyin-action-btn">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                      </svg>
                      <span>520</span>
                    </button>
                  </div>

                  {/* Share */}
                  <div className="douyin-action-item">
                    <button className="douyin-action-btn">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13 7l5 5-5 5M6 12h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </svg>
                      <span>666</span>
                    </button>
                  </div>

                  {/* Small Avatar */}
                  <div className="douyin-action-item">
                    <div className="douyin-avatar-wrapper">
                      <div className="douyin-avatar douyin-avatar-no-border">
                        <img src={avatarUrl || fallbackAvatarSvg} alt="avatar" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Info */}
                <div className="douyin-info">
                  <div className="douyin-music">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                    </svg>
                    <span className="douyin-music-name">原创音乐 - 创作者</span>
                  </div>
                  <div className="douyin-author">
                    <span className="douyin-author-name">@{displayNickName}</span>
                  </div>
                  <div className="douyin-description">{descriptionText}</div>
                </div>

                {/* Center Play Button */}
                <button className="douyin-center-play-btn" onClick={handleVideoClick}>
                  {isPhoneVideoPaused && (
                    <svg width="100" height="100" viewBox="0 0 80 80" fill="none">
                      <path d="M23 18 L60 40 L23 62 Z" fill="white" stroke="white" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                    </svg>
                  )}
                </button>

                {/* Progress Bar */}
                <div className="douyin-video-controls">
                  <div className="douyin-progress-bar">
                    <div className="douyin-progress-filled" style={{ width: `${phoneVideoDuration > 0 ? (phoneVideoCurrentTime / phoneVideoDuration) * 100 : 0}%` }} />
                  </div>
                  <div className="douyin-controls-row">
                    <span className="douyin-time">{formatTime(phoneVideoCurrentTime)}</span>
                    <span className="douyin-time">{formatTime(phoneVideoDuration)}</span>
                  </div>
                </div>

                {/* Bottom Nav */}
                <div className="douyin-bottom-nav">
                  <div className="douyin-nav-item"><span>首页</span></div>
                  <div className="douyin-nav-item"><span>商城</span></div>
                  <div className="douyin-nav-item douyin-nav-add">
                    <div className="douyin-nav-add-border"><span>+</span></div>
                  </div>
                  <div className="douyin-nav-item"><span>消息</span></div>
                  <div className="douyin-nav-item"><span>我</span></div>
                </div>
              </div>
            </div>
            <div className="phone-home-indicator" />
          </div>
          <button className="phone-modal-close" onClick={onClose}><span>×</span></button>
        </div>
      </div>
    )
  }

  // Simple video preview for non-generated videos
  return (
    <div className="phone-modal-overlay" onClick={onClose}>
      <div className="phone-modal" onClick={e => e.stopPropagation()}>
        <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
          <video
            key={videoSource}
            ref={phoneVideoRef}
            style={{ width: '100%', height: 'auto', maxHeight: '90vh', objectFit: 'contain', background: '#000' }}
            preload="auto"
            loop
            playsInline
            onClick={handleVideoClick}
            onPlay={() => setIsPhoneVideoPaused?.(false)}
            onPause={() => setIsPhoneVideoPaused?.(true)}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleVideoLoadedMetadata}
            onError={e => console.error('视频播放错误:', e)}
          >
            <source src={videoSource} />
          </video>
          {isPhoneVideoPaused && (
            <button
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'rgba(0, 0, 0, 0.5)',
                border: 'none',
                borderRadius: '50%',
                width: '80px',
                height: '80px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(10px)',
              }}
              onClick={() => phoneVideoRef?.current?.play()}
            >
              <svg width="40" height="40" viewBox="0 0 80 80" fill="none">
                <path d="M23 18 L60 40 L23 62 Z" fill="white" stroke="white" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
        <button className="phone-modal-close" onClick={onClose}><span>×</span></button>
      </div>
    </div>
  )
}

export default PhoneModal
