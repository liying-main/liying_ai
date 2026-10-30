import logoImg from '../assets/logo.png'
import { BRAND } from '../config/channel'

interface SidebarProps {
  collapsed?: boolean
  onToggle?: () => void
  activeItem?: string
  onItemChange?: (id: string) => void
}

export function Sidebar({ collapsed = false, onToggle, activeItem = 'home', onItemChange }: SidebarProps) {
  const handleItemClick = (id: string) => {
    onItemChange?.(id)
  }

  const navItems = [
    {
      id: 'home',
      label: '工作台',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      ),
    },
    {
      id: 'settings-data',
      label: '素材中心',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <polyline points="22 6 12 13 2 6"/>
        </svg>
      ),
    },
    {
      id: 'works',
      label: '我的作品',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="15" rx="2" ry="2"/>
          <polyline points="17 2 12 7 7 2"/>
        </svg>
      ),
    },
    {
      id: 'task-center',
      label: '任务中心',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      ),
    },
  ]

  const bottomItems = [
    {
      id: 'settings-api',
      label: 'API 配置',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
        </svg>
      ),
    },
    {
      id: 'settings-appearance',
      label: '界面外观',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ),
    },
  ]

  return (
    <div className={`app-sidebar ${collapsed ? 'app-sidebar--collapsed' : ''}`}>
      {/* Logo区域 */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <img src={logoImg} alt={BRAND.productName} width={32} height={32} style={{ borderRadius: 6 }} />
        </div>
        {!collapsed && <span className="sidebar-logo-text">{BRAND.titleLeft}<em>{BRAND.titleMiddle}</em><small style={{ fontSize: '12px', marginLeft: '6px', fontWeight: 400 }}>{BRAND.titleRight}</small></span>}
      </div>

      {/* 主导航 */}
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`sidebar-nav-item ${activeItem === item.id ? 'sidebar-nav-item--active' : ''}`}
            onClick={() => handleItemClick(item.id)}
            title={collapsed ? item.label : undefined}
          >
            <span className="sidebar-nav-icon">{item.icon}</span>
            {!collapsed && <span className="sidebar-nav-label">{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* 底部导航 */}
      <div className="sidebar-bottom">
        {bottomItems.map((item) => (
          <button
            key={item.id}
            className={`sidebar-nav-item ${activeItem === item.id ? 'sidebar-nav-item--active' : ''}`}
            onClick={() => handleItemClick(item.id)}
            title={collapsed ? item.label : undefined}
          >
            <span className="sidebar-nav-icon">{item.icon}</span>
            {!collapsed && <span className="sidebar-nav-label">{item.label}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
