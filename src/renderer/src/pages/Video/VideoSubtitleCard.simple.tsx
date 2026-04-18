// @ts-nocheck
/* eslint-disable */
import React from 'react'
import { useVideoPageStore } from '../../store/VideoPageStore'

export function VideoSubtitleCard() {
  const {
    mainTitle,
    setMainTitle,
    subTitle,
    setSubTitle,
    subtitleText,
    setSubtitleText,
  } = useVideoPageStore()

  return (
    <div className="video-card video-card-smartcut">
      <div className="video-card-header">
        <span className="video-card-number">04</span>
        <span className="video-card-title">视频剪辑</span>
      </div>
      <div className="video-card-body">
        {/* 左侧列 - 按钮和视频预览 */}
        <div className="smartcut-preview-col">
          <div className="video-form-group">
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="video-button video-button-primary" style={{ flex: 1 }}>
                成片模板
              </button>
              <button type="button" className="video-button video-button-warning" style={{ flex: 1 }}>
                智能精剪
              </button>
            </div>
          </div>
          <label className="video-label mt-2!">视频预览</label>
          <div className="video-preview-box video-preview-box-generated">
            <div className="video-preview-placeholder">剪辑后的视频将显示在这里</div>
          </div>
        </div>
        {/* 右侧列 - 表单控件 */}
        <div className="smartcut-controls-col">
          <div className="video-form-group">
            <label className="video-label">封面标题</label>
            <input 
              type="text" 
              className="video-input" 
              placeholder="输入主标题"
              value={mainTitle}
              onChange={(e) => setMainTitle(e.target.value)}
            />
          </div>
          <div className="video-form-group">
            <label className="video-label">副标题</label>
            <input 
              type="text" 
              className="video-input" 
              placeholder="输入副标题"
              value={subTitle}
              onChange={(e) => setSubTitle(e.target.value)}
            />
          </div>
          <div className="video-form-group">
            <label className="video-label">字幕内容</label>
            <textarea 
              className="video-textarea" 
              rows={8} 
              placeholder="字幕内容将显示在这里..."
              value={subtitleText}
              onChange={(e) => setSubtitleText(e.target.value)}
            />
          </div>
          <div className="video-form-group">
            <label className="video-label">背景音乐</label>
            <div className="video-select-upload-row">
              <div className="video-select-upload-row__select">
                <select className="video-select">
                  <option>请选择音乐</option>
                </select>
              </div>
              <div className="video-select-upload-row__upload">
                <button type="button" className="video-file-input video-file-input-wrap">
                  <span className="video-file-input-text">上传</span>
                </button>
              </div>
            </div>
          </div>
          <div className="video-form-group smartcut-volume-row">
            <div className="smartcut-volume-item">
              <label className="video-label">人声音量</label>
              <input type="range" className="video-range" min="0" max="1" step="0.1" defaultValue="1" />
            </div>
            <div className="smartcut-volume-item">
              <label className="video-label">音乐音量</label>
              <input type="range" className="video-range" min="0" max="1" step="0.1" defaultValue="0.3" />
            </div>
          </div>
          <button type="button" className="video-button video-button-primary" style={{ width: '100%' }}>
            快捷剪辑
          </button>
        </div>
      </div>
    </div>
  )
}
