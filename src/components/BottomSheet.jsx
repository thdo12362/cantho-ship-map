import { useState, useEffect } from 'react'
import Icon from './Icon.jsx'

export default function BottomSheet({
  isOpen,
  onToggle,
  title,
  subtitle,
  children,
}) {
  const [expanded, setExpanded] = useState(false)

  // Auto-expand when active item (road or location) is selected
  useEffect(() => {
    if (isOpen) {
      setExpanded(true)
    }
  }, [isOpen])

  function handleToggle() {
    setExpanded((prev) => !prev)
    onToggle?.(!expanded)
  }

  return (
    <section
      className={`bottom-sheet ${expanded ? 'expanded' : 'collapsed'}`}
      aria-label="Bảng thông tin chi tiết và danh sách đường"
    >
      <div className="sheet-header" onClick={handleToggle} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleToggle() }}>
        <div className="drag-handle-bar" aria-hidden="true" />
        <div className="sheet-header-text">
          <span className="sheet-title">{title || 'Thông tin & Tra cứu đường'}</span>
          {subtitle && <span className="sheet-subtitle">{subtitle}</span>}
        </div>
        <button
          type="button"
          className="sheet-toggle-btn"
          aria-label={expanded ? 'Thu gọn bảng điều khiển' : 'Mở rộng bảng điều khiển'}
          onClick={(e) => {
            e.stopPropagation()
            handleToggle()
          }}
        >
          <Icon name={expanded ? 'chevronDown' : 'chevronUp'} width="20" height="20" />
        </button>
      </div>

      <div className="sheet-content-scroll">
        {children}
      </div>
    </section>
  )
}
