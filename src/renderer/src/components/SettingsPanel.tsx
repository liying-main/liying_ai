// @ts-nocheck
/**
 * 开源版设置面板
 *
 * 去掉「账号信息」「版本更新」两个依赖私有后端的页签，
 * 新增「API 配置」用于填写中转站地址与 Key。
 */
import React, { useEffect, useState } from 'react'
import { useThemeStore, THEMES } from '../store/ThemeStore'
import {
  STATION_BASE_URL,
  STATION_HOME,
  STATION_CHAT_MODEL,
  STATION_TTS_MODEL,
  STATION_ASR_MODEL,
  STATION_AVATAR_MODEL,
} from '../../../shared/station'
import { MaterialLibraryPanel } from './MaterialLibraryPanel'
import { normalizeStationUrl } from '../../../shared/station-connection'

interface SettingsPanelProps {
  activeTab: 'settings-api' | 'settings-data' | 'settings-appearance'
  onConfigured?: () => void
}

export function SettingsPanel({ activeTab, onConfigured }: SettingsPanelProps) {
  const { theme, setTheme } = useThemeStore()
  const [baseUrl, setBaseUrl] = useState(STATION_BASE_URL)
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const config = await window.api.getStationConfig()
        setBaseUrl(String(config?.baseUrl || STATION_BASE_URL))
        setApiKey(String(config?.apiKey || ''))
      } catch {
        setTestResult({ ok: false, message: '读取配置失败，请在桌面客户端中重试。' })
      }
    })()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const normalizedUrl = normalizeStationUrl(baseUrl)
      await window.api.saveStationConfig({ baseUrl: normalizedUrl, apiKey: apiKey.trim() })
      setBaseUrl(normalizedUrl)
      setTestResult({ ok: true, message: apiKey.trim() ? '配置已保存在本机。' : '配置已保存，尚未填写 API Key；仍可使用本地功能。' })
      if (apiKey.trim()) onConfigured?.()
    } catch (error: any) {
      setTestResult({ ok: false, message: error?.message || '保存失败，请重试。' })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    const key = apiKey.trim()
    if (!key) {
      setTestResult({ ok: false, message: '请先填写 API Key' })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await window.api.testStationConfig({ baseUrl: normalizeStationUrl(baseUrl), apiKey: key }))
    } catch (error: any) {
      setTestResult({ ok: false, message: error?.message || '连接失败' })
    } finally {
      setTesting(false)
    }
  }

  const tabTitles: Record<string, string> = {
    'settings-api': 'API 配置',
    'settings-data': '素材管理',
    'settings-appearance': '界面外观',
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1px solid var(--ly-border)',
    background: 'rgba(2, 6, 23, 0.35)',
    color: 'var(--ly-text)',
    fontSize: '13px',
  }

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <h2 className="settings-page-title">{tabTitles[activeTab]}</h2>
      </div>
      <div className="settings-page-body">
        {activeTab === 'settings-api' && (
          <div className="user-settings-panel">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '560px' }}>
              <div style={{ fontSize: '13px', color: 'var(--ly-text-2)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--ly-text)' }}>软件免费开源，云端能力由你选择的服务提供。</strong>
                文案、配音、字幕识别与数字人生成需要 API Key；额度、价格与免费活动以所选服务的实际规则为准。
                默认接入项目团队提供的 OpenAPI，也可使用兼容服务。
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label htmlFor="station-base-url" style={{ fontSize: '12px', color: 'var(--ly-text-2)' }}>服务地址（Base URL）</label>
                <input id="station-base-url" style={fieldStyle} type="url" value={baseUrl} onChange={(e) => { setBaseUrl(e.target.value); setTestResult(null) }} placeholder={STATION_BASE_URL} spellCheck={false} />
                <button type="button" onClick={() => { setBaseUrl(STATION_BASE_URL); setTestResult(null) }} style={{ alignSelf: 'flex-start', border: 0, padding: 0, background: 'none', color: 'var(--ly-primary-2)', cursor: 'pointer', fontSize: '11px' }}>恢复默认 OpenAPI 地址</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label htmlFor="station-api-key" style={{ fontSize: '12px', color: 'var(--ly-text-2)' }}>API Key</label>
                <input id="station-api-key" style={fieldStyle} type="password" value={apiKey} onChange={(e) => { setApiKey(e.target.value); setTestResult(null) }} placeholder="填写所选服务的 API Key" autoComplete="off" spellCheck={false} />
                <div style={{ fontSize: '11px', color: 'var(--ly-text-muted)', lineHeight: 1.7 }}>
                  <a href={STATION_HOME} target="_blank" rel="noreferrer" style={{ color: 'var(--ly-primary-2)' }}>前往 OpenAPI 获取 Key</a>，或填写兼容服务的 Key。配置保存在本机；调用云端能力时，Key 和所需文本、音视频会发送至所选服务。
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={handleSave} disabled={saving || testing} style={{ padding: '8px 20px', background: 'linear-gradient(135deg, var(--ly-primary) 0%, var(--ly-primary-2) 100%)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                  {saving ? '保存中...' : '保存配置'}
                </button>
                <button type="button" onClick={handleTest} disabled={testing || saving} style={{ padding: '8px 20px', background: 'transparent', color: 'var(--ly-text-2)', border: '1px solid var(--ly-border)', borderRadius: '8px', cursor: testing ? 'not-allowed' : 'pointer', fontSize: '13px' }}>
                  {testing ? '测试中...' : '测试连接'}
                </button>
              </div>

              <div style={{ fontSize: '11px', color: 'var(--ly-text-muted)' }}>测试仅查询模型列表，不发起生成任务，也不会自动保存配置。</div>

              {testResult && (
                <div style={{ fontSize: '12px', color: testResult.ok ? '#22c55e' : '#ef4444' }}>
                  {testResult.message}
                </div>
              )}

              <div style={{ marginTop: '8px', padding: '12px', borderRadius: '10px', background: 'rgba(2, 6, 23, 0.3)', border: '1px solid var(--ly-border)' }}>
                <div style={{ fontSize: '12px', color: 'var(--ly-text-2)', marginBottom: '8px' }}>当前使用的模型</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: '12px', color: 'var(--ly-text-muted)' }}>
                  <span>文案</span><span>{STATION_CHAT_MODEL}</span>
                  <span>配音</span><span>{STATION_TTS_MODEL}</span>
                  <span>字幕</span><span>{STATION_ASR_MODEL}</span>
                  <span>数字人</span><span>{STATION_AVATAR_MODEL}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--ly-text-muted)', marginTop: '8px' }}>
                  兼容服务需支持对应模型和接口。连接测试通过不代表所有能力均已开通；调用前请在服务商处确认权限和费用。
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 素材管理 */}
        {activeTab === 'settings-data' && (
          <div className="user-settings-panel">
            <MaterialLibraryPanel />
          </div>
        )}

        {/* 界面外观 */}
        {activeTab === 'settings-appearance' && (
          <div className="user-settings-panel">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '13px', color: 'var(--ly-text-2)' }}>主题</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${t.id === theme ? 'var(--ly-primary)' : 'var(--ly-border)'}`,
                      background: t.id === theme ? 'var(--ly-primary-soft)' : 'rgba(2, 6, 23, 0.18)',
                      color: t.id === theme ? 'var(--ly-primary-2)' : 'var(--ly-text-2)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ly-text-muted)', lineHeight: 1.5 }}>
                切换后立即生效，并会记住你的选择
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
