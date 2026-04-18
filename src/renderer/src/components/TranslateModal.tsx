import React from 'react'

const LANG_OPTIONS = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英语' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'es', label: '西班牙语' },
  { value: 'fr', label: '法语' },
  { value: 'de', label: '德语' },
  { value: 'pt', label: '葡萄牙语' },
  { value: 'ru', label: '俄语' },
  { value: 'ar', label: '阿拉伯语' },
]

interface TranslateModalProps {
  show?: boolean
  sourceLanguage?: string
  targetLanguage?: string
  setSourceLanguage?: (lang: string) => void
  setTargetLanguage?: (lang: string) => void
  rewrittenScript?: string
  setRewrittenScript?: (text: string) => void
  translatedText?: string
  setTranslatedText?: (text: string) => void
  isTranslating?: boolean
  translateProgress?: number
  onClose?: () => void
  onTranslate?: () => void
  onComplete?: (translatedText: string) => void
}

export function TranslateModal({
  show,
  sourceLanguage = 'zh',
  targetLanguage = 'en',
  setSourceLanguage,
  setTargetLanguage,
  rewrittenScript = '',
  setRewrittenScript,
  translatedText = '',
  setTranslatedText,
  isTranslating = false,
  translateProgress = 0,
  onClose,
  onTranslate,
  onComplete,
}: TranslateModalProps) {
  if (!show) return null

  return (
    <div
      className="video-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        className="video-modal-content"
        style={{
          backgroundColor: 'var(--ly-surface-solid)',
          borderRadius: '8px',
          padding: '24px',
          width: '90%',
          maxWidth: '900px',
          maxHeight: '80vh',
          overflow: 'auto',
          position: 'relative',
          border: '1px solid var(--ly-border)',
          boxShadow: 'var(--ly-shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            border: 'none',
            background: 'transparent',
            fontSize: '24px',
            cursor: 'pointer',
            color: 'var(--ly-text-2)',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '6px',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(148, 163, 184, 0.16)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Header */}
        <div style={{ marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid var(--ly-border)' }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--ly-text)' }}>
            翻译文案
          </h2>
        </div>

        {/* Language selectors */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
          <div style={{ flex: 1 }}>
            <label className="video-label">原始语言</label>
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage?.(e.target.value)}
              className="video-select"
              disabled={isTranslating}
            >
              {LANG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="video-label">目标语言</label>
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage?.(e.target.value)}
              className="video-select"
              disabled={isTranslating}
            >
              {LANG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Text areas */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
          <div style={{ flex: 1 }}>
            <label className="video-label">原始内容</label>
            <textarea
              value={rewrittenScript}
              onChange={(e) => setRewrittenScript?.(e.target.value)}
              rows={15}
              className="video-textarea"
              disabled={isTranslating}
              placeholder="可先微调内容，再执行翻译文案"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="video-label">改写结果</label>
            <textarea
              value={translatedText}
              onChange={(e) => setTranslatedText?.(e.target.value)}
              placeholder={isTranslating ? '改写中..' : '翻译文案结果会显示在这里...'}
              rows={15}
              className="video-textarea"
              disabled={isTranslating}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="video-form-group">
          {!translatedText ? (
            <>
              <button
                onClick={onTranslate}
                disabled={isTranslating}
                className="video-button video-button-primary"
              >
                {isTranslating ? `改写中 ${translateProgress}%` : '开始改写'}
              </button>
              {isTranslating && (
                <div className="video-progress">
                  <div className="video-progress-bar" style={{ width: `${translateProgress}%` }} />
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={onTranslate}
                  disabled={isTranslating}
                  className="video-button video-button-primary"
                >
                  {isTranslating ? `改写中 ${translateProgress}%` : '重新改写'}
                </button>
                <button
                  onClick={() => onComplete?.(translatedText)}
                  className="video-button video-button-primary"
                >
                  应用结果
                </button>
              </div>
              {isTranslating && (
                <div className="video-progress">
                  <div className="video-progress-bar" style={{ width: `${translateProgress}%` }} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default TranslateModal
