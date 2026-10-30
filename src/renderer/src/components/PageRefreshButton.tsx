interface PageRefreshButtonProps {
  onRefresh: () => void | Promise<void>
  loading?: boolean
  title?: string
  className?: string
}

export function PageRefreshButton({
  onRefresh,
  loading = false,
  title = '刷新当前页面',
  className = '',
}: PageRefreshButtonProps) {
  return (
    <button
      type="button"
      className={`page-refresh-btn ${loading ? 'page-refresh-btn--loading' : ''} ${className}`.trim()}
      onClick={() => onRefresh()}
      disabled={loading}
      title={title}
      aria-label={title}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M23 4v6h-6" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
    </button>
  )
}
