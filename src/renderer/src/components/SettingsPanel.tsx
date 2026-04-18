// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react'
import { useUserInfoStore } from '../store/UserInfoStore'
import { APP_VERSION } from '../config/channel'

interface SettingsPanelProps {
  activeTab: 'settings-account' | 'settings-update'
}

export function SettingsPanel({ activeTab }: SettingsPanelProps) {
  const { userInfo, loadUserInfo } = useUserInfoStore()
  const [isEditing, setIsEditing] = useState(false)
  const [editingNickName, setEditingNickName] = useState("")

  // Avatar upload
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Update state
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<{ version: string; description: string; downloadUrl: string; fileName?: string; fileSize?: number; forceUpdate: boolean } | null>(null)
  const [downloadingUpdate, setDownloadingUpdate] = useState(false)
  const [updateProgress, setUpdateProgress] = useState<{ percent: number; transferred: number; total: number } | null>(null)
  const [downloadedFilePath, setDownloadedFilePath] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'latest' | 'error'>('idle')

  // Handle avatar upload
  const handleAvatarClick = () => {
    avatarInputRef.current?.click()
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('图片大小不能超过2MB')
      return
    }
    setUploadingAvatar(true)
    try {
      // Local only - no backend upload
      const reader = new FileReader()
      reader.onload = () => {
        const avatarUrl = reader.result as string
        useUserInfoStore.setState({ userInfo: { ...userInfo, avatarUrl } })
        alert('头像更新成功')
        setUploadingAvatar(false)
      }
      reader.onerror = () => {
        alert('头像读取失败')
        setUploadingAvatar(false)
      }
      reader.readAsDataURL(file)
      return
    } catch (err) {
      console.error('Avatar upload error:', err)
      alert('头像更新失败')
    } finally {
      setUploadingAvatar(false)
    }
    if (avatarInputRef.current) {
      avatarInputRef.current.value = ''
    }
  }

  const startEdit = () => {
    setEditingNickName(userInfo?.nickName || "")
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setEditingNickName("")
  }

  const saveNickName = async () => {
    if (!editingNickName.trim()) {
      alert('昵称不能为空')
      return
    }
    // Local only - no backend
    useUserInfoStore.setState({ userInfo: { ...userInfo, nickName: editingNickName.trim() } })
    setIsEditing(false)
    alert('昵称更新成功')
  }

  // Update IPC event listeners
  useEffect(() => {
    const api = (window as any).api
    if (!api) return

    const cleanups: Array<() => void> = []

    if (api.onUpdateDownloadProgress) {
      cleanups.push(api.onUpdateDownloadProgress((progress: any) => {
        setUpdateProgress(progress)
        setDownloadingUpdate(true)
        setUpdateStatus('downloading')
      }))
    }
    if (api.onUpdateDownloaded) {
      cleanups.push(api.onUpdateDownloaded((info: any) => {
        setDownloadingUpdate(false)
        setDownloadedFilePath(info.filePath)
        setUpdateStatus('downloaded')
      }))
    }
    if (api.onUpdateError) {
      cleanups.push(api.onUpdateError((error: any) => {
        setDownloadingUpdate(false)
        setUpdateError(error.message || '更新出错')
        setUpdateStatus('error')
      }))
    }

    return () => { cleanups.forEach(fn => fn()) }
  }, [])

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true)
    setUpdateStatus('checking')
    setUpdateError(null)
    setUpdateInfo(null)
    setDownloadedFilePath(null)
    setUpdateProgress(null)
    try {
      // No backend - always report latest
      setUpdateStatus('latest')
    } catch (error: any) {
      console.error('检查更新失败:', error)
      setUpdateError(error.message || '检查更新失败')
      setUpdateStatus('error')
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleStartDownload = async () => {
    if (!updateInfo) return
    setDownloadingUpdate(true)
    setUpdateStatus('downloading')
    setUpdateProgress(null)
    setUpdateError(null)
    try {
      const result = await (window as any).api?.updateDownloadAndInstall(
        updateInfo.downloadUrl,
        updateInfo.version,
        updateInfo.description,
        updateInfo.forceUpdate
      )
      if (result && !result.success) {
        setUpdateError(result.error || '下载失败')
        setUpdateStatus('error')
        setDownloadingUpdate(false)
      }
    } catch (error: any) {
      setUpdateError(error.message || '下载失败')
      setUpdateStatus('error')
      setDownloadingUpdate(false)
    }
  }

  const handleInstall = async () => {
    if (!downloadedFilePath) return
    try {
      await (window as any).api?.updateInstallManual(downloadedFilePath)
    } catch (error: any) {
      setUpdateError(error.message || '安装失败')
      setUpdateStatus('error')
    }
  }

  const formatBytes = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1048576).toFixed(1) + ' MB'
  }

  const tabTitles: Record<string, string> = {
    'settings-account': '账号信息',
    'settings-update': '版本更新',
  }

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <h2 className="settings-page-title">{tabTitles[activeTab]}</h2>
      </div>
      <div className="settings-page-body">

        {/* 账号信息 */}
        {activeTab === 'settings-account' && (
          <div className="user-settings-panel">
            <div className="user-info-list">
              {/* 头像 */}
              <div className="user-info-item">
                <span className="label">头像</span>
                <div className="value" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: "60px", height: "60px", borderRadius: "50%", overflow: "hidden",
                      backgroundColor: "var(--ly-bg-soft)", display: "flex", alignItems: "center",
                      justifyContent: "center", border: "2px solid var(--ly-border)", cursor: uploadingAvatar ? "wait" : "pointer",
                      opacity: uploadingAvatar ? 0.6 : 1,
                    }}
                    title="点击更换头像"
                    onClick={handleAvatarClick}
                  >
                    {userInfo?.avatarUrl
                      ? <img src={userInfo.avatarUrl} alt="头像" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="8" r="4" />
                          <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                        </svg>
                    }
                    <input
                      type="file"
                      ref={avatarInputRef}
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={handleAvatarChange}
                    />
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--ly-text-muted)" }}>{uploadingAvatar ? "上传中..." : "点击头像更换"}</span>
                </div>
              </div>

              {/* 昵称 */}
              <div className="user-info-item">
                <span className="label">昵称</span>
                <div className="value" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {isEditing ? (
                    <>
                      <input
                        type="text" value={editingNickName} maxLength={20}
                        onChange={(e) => setEditingNickName(e.target.value)}
                        style={{ flex: 1, padding: "4px 8px", border: "1px solid var(--ly-border)", borderRadius: "4px", fontSize: "14px", background: "var(--ly-input-bg)", color: "var(--ly-text)" }}
                      />
                      <button type="button" onClick={saveNickName}
                        style={{ padding: "4px 12px", background: "linear-gradient(135deg, var(--ly-primary) 0%, var(--ly-primary-2) 100%)", color: "#fff", border: "none", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}>
                        保存
                      </button>
                      <button type="button" onClick={cancelEdit}
                        style={{ padding: "4px 12px", background: "rgba(148, 163, 184, 0.12)", color: "var(--ly-text-2)", border: "none", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}>
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1 }}>{userInfo?.nickName || "-"}</span>
                      <button type="button" onClick={startEdit}
                        style={{ padding: "4px 12px", background: "rgba(148, 163, 184, 0.12)", color: "var(--ly-text-2)", border: "none", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}>
                        编辑
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* 卡号 */}
              <div className="user-info-item">
                <span className="label">卡号</span>
                <span className="value">{userInfo?.phone || "-"}</span>
              </div>

              {/* 截至日期 */}
              <div className="user-info-item">
                <span className="label">截至日期</span>
                <span className="value">{userInfo?.expiryTime ? new Date(userInfo.expiryTime).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : "-"}</span>
              </div>
            </div>
          </div>
        )}

        {/* 版本更新 */}
        {activeTab === 'settings-update' && (
          <div className="user-settings-panel">
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* 当前版本 + 检查按钮 */}
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "14px", color: "var(--ly-text-2)" }}>当前版本</span>
                  <span style={{ fontSize: "16px", color: "var(--ly-text)", fontWeight: "600" }}>{APP_VERSION}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate || downloadingUpdate}
                  style={{
                    padding: "8px 20px",
                    background: (checkingUpdate || downloadingUpdate) ? "var(--ly-bg-soft)" : "linear-gradient(135deg, var(--ly-primary) 0%, var(--ly-primary-2) 100%)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    cursor: (checkingUpdate || downloadingUpdate) ? "not-allowed" : "pointer",
                    fontSize: "13px",
                    fontWeight: "500",
                    transition: "all 0.2s"
                  }}
                >
                  {checkingUpdate ? "检查中..." : "检查更新"}
                </button>
              </div>

              {/* 状态区域 */}
              <div style={{
                padding: "20px",
                background: "rgba(148, 163, 184, 0.06)",
                borderRadius: "12px",
                minHeight: "80px",
              }}>
                {/* 检查中 */}
                {updateStatus === 'checking' && (
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "var(--ly-text-2)" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                    <span style={{ fontSize: "14px" }}>正在检查更新...</span>
                  </div>
                )}

                {/* 空闲 */}
                {updateStatus === 'idle' && (
                  <div style={{ color: "var(--ly-text-muted)", fontSize: "13px", lineHeight: 1.6 }}>
                    点击"检查更新"按钮查看是否有新版本可用。
                  </div>
                )}

                {/* 已是最新 */}
                {updateStatus === 'latest' && (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#22c55e" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    <span style={{ fontSize: "14px", fontWeight: "500" }}>当前已是最新版本</span>
                  </div>
                )}

                {/* 发现新版本 */}
                {updateStatus === 'available' && updateInfo && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span style={{ fontSize: "15px", fontWeight: "600", color: "var(--ly-text)" }}>
                        发现新版本 {updateInfo.version}
                      </span>
                      {updateInfo.forceUpdate && (
                        <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px", background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", fontWeight: "500" }}>
                          强制更新
                        </span>
                      )}
                    </div>
                    <div style={{
                      padding: "12px 14px",
                      background: "rgba(148, 163, 184, 0.08)",
                      borderRadius: "8px",
                      fontSize: "13px",
                      color: "var(--ly-text-2)",
                      lineHeight: 1.8,
                      whiteSpace: "pre-line",
                      maxHeight: "150px",
                      overflow: "auto"
                    }}>
                      {updateInfo.description}
                    </div>
                    {updateInfo.fileSize && (
                      <div style={{ fontSize: "12px", color: "var(--ly-text-muted)" }}>
                        文件大小: {formatBytes(updateInfo.fileSize)}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleStartDownload}
                      style={{
                        padding: "10px 24px",
                        background: "linear-gradient(135deg, var(--ly-primary) 0%, var(--ly-primary-2) 100%)",
                        color: "#fff",
                        border: "none",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontSize: "14px",
                        fontWeight: "500",
                        width: "fit-content",
                        transition: "all 0.2s"
                      }}
                    >
                      立即下载并安装
                    </button>
                  </div>
                )}

                {/* 下载中 */}
                {updateStatus === 'downloading' && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--ly-text)" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span style={{ fontSize: "14px", fontWeight: "500" }}>
                        正在下载 {updateInfo?.version || ''}...
                      </span>
                    </div>
                    {/* 进度条 */}
                    <div style={{
                      width: "100%",
                      height: "8px",
                      background: "rgba(148, 163, 184, 0.15)",
                      borderRadius: "4px",
                      overflow: "hidden"
                    }}>
                      <div style={{
                        width: `${updateProgress?.percent || 0}%`,
                        height: "100%",
                        background: "linear-gradient(90deg, var(--ly-primary), var(--ly-primary-2))",
                        borderRadius: "4px",
                        transition: "width 0.3s ease"
                      }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--ly-text-muted)" }}>
                      <span>{updateProgress?.percent || 0}%</span>
                      <span>
                        {updateProgress ? `${formatBytes(updateProgress.transferred)} / ${formatBytes(updateProgress.total)}` : ''}
                      </span>
                    </div>
                  </div>
                )}

                {/* 下载完成 */}
                {updateStatus === 'downloaded' && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#22c55e" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      <span style={{ fontSize: "14px", fontWeight: "600" }}>下载完成！</span>
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--ly-text-muted)" }}>
                      点击下方按钮安装更新，应用将自动重启。
                    </div>
                    <button
                      type="button"
                      onClick={handleInstall}
                      style={{
                        padding: "10px 24px",
                        background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                        color: "#fff",
                        border: "none",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontSize: "14px",
                        fontWeight: "500",
                        width: "fit-content",
                        transition: "all 0.2s"
                      }}
                    >
                      立即安装并重启
                    </button>
                  </div>
                )}

                {/* 错误 */}
                {updateStatus === 'error' && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#ef4444" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                      <span style={{ fontSize: "14px", fontWeight: "500" }}>{updateError || '更新出错'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCheckUpdate}
                      style={{
                        padding: "8px 16px",
                        background: "rgba(148, 163, 184, 0.12)",
                        color: "var(--ly-text-2)",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "13px",
                        width: "fit-content"
                      }}
                    >
                      重试
                    </button>
                  </div>
                )}
              </div>
            </div>
            <style>{`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        )}
      </div>
    </div>
  )
}
