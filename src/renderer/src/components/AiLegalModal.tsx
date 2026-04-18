import React, { useState } from 'react'

interface Edit {
  original: string
  replacement?: string
  reason?: string
}

interface HighlightRange {
  start: number
  end: number
  edit: Edit
}

interface AiLegalModalProps {
  show?: boolean
  originalText?: string
  reviewedText?: string
  setReviewedText?: (text: string) => void
  suggestions?: string
  setSuggestions?: (text: string) => void
  edits?: Edit[]
  isReviewing?: boolean
  progress?: number
  onClose?: () => void
  onReview?: () => void
  onComplete?: (reviewedText: string, suggestions?: string) => void
}

function buildHighlightRanges(text: string, edits: Edit[]): HighlightRange[] {
  const ranges: HighlightRange[] = []
  for (const edit of edits) {
    const needle = (edit.original || '').trim()
    if (!needle) continue
    let idx = 0
    while (idx < text.length) {
      const found = text.indexOf(needle, idx)
      if (found === -1) break
      ranges.push({ start: found, end: found + needle.length, edit })
      idx = found + needle.length
    }
  }
  ranges.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start))
  const merged: HighlightRange[] = []
  let lastEnd = -1
  for (const r of ranges) {
    if (r.start < lastEnd) continue
    merged.push(r)
    lastEnd = r.end
  }
  return merged
}

export function AiLegalModal({
  show,
  originalText = '',
  reviewedText = '',
  setReviewedText,
  suggestions = '',
  setSuggestions,
  edits = [],
  isReviewing = false,
  progress = 0,
  onClose,
  onReview,
  onComplete,
}: AiLegalModalProps) {
  if (!show) return null

  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    title: '',
    replacement: '',
    reason: '',
  })

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

  const showTooltip = (e: React.MouseEvent, edit: Edit) => {
    const pad = 12
    const x = clamp(e.clientX + 14, pad, window.innerWidth - pad)
    const y = clamp(e.clientY + 14, pad, window.innerHeight - pad)
    setTooltip({
      visible: true,
      x,
      y,
      title: edit.original,
      replacement: edit.replacement || '',
      reason: edit.reason || '',
    })
  }

  const moveTooltip = (e: React.MouseEvent) => {
    if (!tooltip.visible) return
    const pad = 12
    const x = clamp(e.clientX + 14, pad, window.innerWidth - pad)
    const y = clamp(e.clientY + 14, pad, window.innerHeight - pad)
    setTooltip((t) => ({ ...t, x, y }))
  }

  const hideTooltip = () => setTooltip((t) => ({ ...t, visible: false }))

  const ranges = buildHighlightRanges(originalText, edits)

  const renderHighlightedText = () => {
    if (!ranges.length) {
      return <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{originalText}</div>
    }

    const nodes: React.ReactNode[] = []
    let cursor = 0

    ranges.forEach((r, i) => {
      if (cursor < r.start) {
        nodes.push(
          <span key={`pre-${i}`}>{originalText.slice(cursor, r.start)}</span>
        )
      }
      nodes.push(
        <span
          key={`hl-${i}`}
          className="ai-legal-forbidden-mark"
          onMouseEnter={(e) => showTooltip(e, r.edit)}
          onMouseMove={moveTooltip}
          onMouseLeave={hideTooltip}
        >
          {originalText.slice(r.start, r.end)}
        </span>
      )
      cursor = r.end
    })

    if (cursor < originalText.length) {
      nodes.push(<span key="tail">{originalText.slice(cursor)}</span>)
    }

    return <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{nodes}</div>
  }

  return (
    <div
      className="video-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
      style={{
        position: 'fixed',
        inset: 0,
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
          maxWidth: '980px',
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
          aria-label="关闭"
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
            AI法务
          </h2>
        </div>

        {/* Main content: Original text and Reviewed text */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
          {/* Left: Original text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
              <label className="video-label" style={{ marginBottom: 0 }}>原文</label>
              {ranges.length > 0 && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--ly-danger)',
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: 'var(--ly-danger-soft)',
                    border: '1px solid rgba(239, 68, 68, 0.45)',
                  }}
                >
                  已标题{ranges.length} 处违禁词（悬停查看建议）
                </span>
              )}
            </div>
            <div
              className="video-textarea ai-legal-original-readonly"
              style={{
                minHeight: 12 * 22,
                maxHeight: 12 * 22,
                overflowY: 'auto',
                padding: '6px 10px',
              }}
            >
              {renderHighlightedText()}
            </div>
          </div>

          {/* Right: Reviewed text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <label className="video-label">法务审核后文案</label>
            <textarea
              value={reviewedText}
              onChange={(e) => setReviewedText?.(e.target.value)}
              placeholder={isReviewing ? 'AI法务审核中..' : '审核后的文案将显示在这里...'}
              rows={12}
              className="video-textarea"
              disabled={isReviewing}
              style={{
                minHeight: 12 * 22,
                maxHeight: 12 * 22,
                overflowY: 'auto',
              }}
            />
          </div>
        </div>

        {/* AI suggestions */}
        <div className="video-form-group" style={{ marginBottom: '16px' }}>
          <label className="video-label">AI法务修改意见</label>
          <textarea
            value={suggestions}
            onChange={(e) => setSuggestions?.(e.target.value)}
            placeholder={isReviewing ? '生成修改意见中..' : '这里会输出需要调整的点、风险提示、替换建议..'}
            rows={6}
            className="video-textarea"
            disabled={isReviewing}
          />
        </div>

        {/* Action buttons */}
        <div className="video-form-group">
          {!reviewedText ? (
            <>
              <button
                onClick={onReview}
                disabled={isReviewing}
                className="video-button video-button-primary"
              >
                {isReviewing ? `审核中 ${progress}%` : '开始法务审核'}
              </button>
              {isReviewing && (
                <div className="video-progress">
                  <div className="video-progress-bar" style={{ width: `${progress}%` }} />
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={onClose} className="video-button video-button-outline">
                  取消
                </button>
                <button
                  onClick={() => onComplete?.(reviewedText, suggestions)}
                  className="video-button video-button-primary"
                >
                  使用审核后的文案
                </button>
              </div>
              {isReviewing && (
                <div className="video-progress">
                  <div className="video-progress-bar" style={{ width: `${progress}%` }} />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip.visible && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            background: 'var(--ly-surface-solid)',
            border: '1px solid var(--ly-border)',
            borderRadius: '8px',
            padding: '10px 14px',
            boxShadow: 'var(--ly-shadow-lg)',
            zIndex: 1100,
            maxWidth: '320px',
            fontSize: '13px',
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--ly-danger)', marginBottom: '4px' }}>
            违禁词：{tooltip.title}
          </div>
          {tooltip.replacement && (
            <div style={{ color: 'var(--ly-text)', marginBottom: '4px' }}>
              <span style={{ color: 'var(--ly-text-2)' }}>建议替换: </span>
              {tooltip.replacement}
            </div>
          )}
          {tooltip.reason && (
            <div style={{ color: 'var(--ly-text-2)', fontSize: '12px' }}>
              原因: {tooltip.reason}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AiLegalModal
