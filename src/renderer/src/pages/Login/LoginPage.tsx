import { useState, useEffect } from 'react'
import { BRAND } from '../../config/channel'

interface LoginPageProps {
  onLogin: (cardNum: string, cardKey: string) => Promise<void>
  authMessage?: string | null
}

export function LoginPage({ onLogin, authMessage }: LoginPageProps) {
  const [cardNum, setCardNum] = useState('')
  const [cardKey, setCardKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(authMessage || '')
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const checkMaximized = async () => {
      try {
        const maximized = await (window as any).api?.windowIsMaximized?.()
        setIsMaximized(maximized)
      } catch {}
    }
    checkMaximized()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!cardNum.trim() || !cardKey.trim()) {
      setError('请输入卡号和密钥')
      return
    }
    setLoading(true)
    try {
      await onLogin(cardNum, cardKey)
    } catch (err: any) {
      setError(err.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-container">
      <div className="custom-titlebar">
        <div className="titlebar-drag-region">
          <div className="titlebar-icon !hidden"></div>
          <div className="titlebar-title !hidden">{BRAND.productName} - 卡密登录</div>
        </div>
        <div className="titlebar-controls">
          <button className="titlebar-button reload-button" onClick={() => (window as any).api?.windowReload?.()} title="刷新">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-6.22-8.56" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>
          <button className="titlebar-button minimize-button" onClick={() => (window as any).api?.minimizeWindow?.()} title="最小化">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
          <button className="titlebar-button maximize-button" onClick={() => (window as any).api?.maximizeWindow?.()} title="最大化">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
          </button>
          <button className="titlebar-button close-button" onClick={() => (window as any).api?.closeWindow?.()} title="关闭">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>

      <div className="app-login-wrap">
        <div className={`app-center-title${BRAND.titleRight ? ' app-center-title--agent' : ''}`}>
          <p data-role="left">{BRAND.titleLeft}</p>
          <p data-role="mid">{BRAND.titleMiddle}</p>
          {BRAND.titleRight && <p data-role="right">{BRAND.titleRight}</p>}
        </div>
        <div className="app-center-desc">
          <p>赶上AI浪潮，让AI智能体帮你跑赢2026</p>
        </div>

        <div className="card-login">
          <div className="card-login-box">
            <h2 className="card-login-title">卡密登录</h2>
            <p className="card-login-desc">请输入卡号和密钥以进入系统</p>
            <form onSubmit={handleSubmit} className="card-login-form">
              <div className="card-login-field">
                <label htmlFor="cardNum">卡号</label>
                <input
                  id="cardNum"
                  type="text"
                  value={cardNum}
                  onChange={(e) => setCardNum(e.target.value)}
                  placeholder="请输入卡号"
                  disabled={loading}
                  autoComplete="off"
                />
              </div>
              <div className="card-login-field">
                <label htmlFor="cardKey">密钥</label>
                <input
                  id="cardKey"
                  type="password"
                  value={cardKey}
                  onChange={(e) => setCardKey(e.target.value)}
                  placeholder="请输入密钥"
                  disabled={loading}
                  autoComplete="off"
                />
              </div>
              {error && <p className="card-login-error">{error}</p>}
              <button type="submit" className="card-login-btn" disabled={loading}>
                {loading ? '登录中...' : '登录'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
