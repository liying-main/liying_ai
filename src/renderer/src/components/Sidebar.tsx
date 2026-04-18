import logoImg from '../assets/logo.png'
import { BRAND } from '../config/channel'

interface SidebarProps {
  collapsed?: boolean
  onToggle?: () => void
  activeItem?: string
  onItemChange?: (id: string) => void
  onAdClick?: () => void
}

const AD_ITEMS = new Set(['settings-data', 'settings-appearance'])

export function Sidebar({ collapsed = false, onToggle, activeItem = 'home', onItemChange, onAdClick }: SidebarProps) {
  const handleItemClick = (id: string) => {
    if (AD_ITEMS.has(id)) {
      onAdClick?.()
      return
    }
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
      label: '素材库',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <polyline points="22 6 12 13 2 6"/>
        </svg>
      ),
    },
  ]

  const bottomItems = [
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
        {!collapsed && <span className="sidebar-logo-text">{BRAND.titleLeft}<em>{BRAND.titleMiddle}</em></span>}
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
