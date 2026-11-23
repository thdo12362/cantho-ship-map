import { useState, useMemo } from 'react'
import Icon from './Icon.jsx'
import { formatRoadDisplayName } from '../services/text.js'

export default function RoadList({
  selectedWard,
  roadGroups,
  onSelectRoad,
  selectedRoadId,
  wardLookup,
}) {
  const [activeTab, setActiveTab] = useState('all') // 'all', 'sole', 'crosses'
  const [displayCount, setDisplayCount] = useState(40)

  const { sole = [], crosses = [], ambiguous = [], total = 0 } = roadGroups || {}

  const currentList = useMemo(() => {
    let list = []
    if (activeTab === 'sole') {
      list = sole
    } else if (activeTab === 'crosses') {
      list = [...crosses, ...ambiguous]
    } else {
      list = [...sole, ...crosses, ...ambiguous]
    }
    return list
  }, [activeTab, sole, crosses, ambiguous])

  if (!selectedWard) {
    return (
      <div className="road-list-empty">
        <p className="empty-title">Chọn một phường để tra cứu danh sách đường</p>
        <p className="muted">
          Hoặc nhập tên đường vào ô tìm kiếm ở trên để định vị nhanh trên bản đồ 9 phường.
        </p>
      </div>
    )
  }

  const wardName = selectedWard.properties.name || selectedWard.properties.ward_id
  const visibleItems = currentList.slice(0, displayCount)
  const hasMore = currentList.length > displayCount

  return (
    <div className="road-list-container">
      {/* Ward Status Alert */}
      <div className="ward-status-banner alert-provisional" role="status">
        <Icon name="info" width="18" height="18" />
        <div>
          <strong>Phường {wardName}:</strong>{' '}
          <span>Ranh giới tham khảo – OpenStreetMap, chưa xác minh chính thức.</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="road-list-tabs" role="tablist" aria-label="Phân loại đường trong phường">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'all'}
          className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => { setActiveTab('all'); setDisplayCount(40) }}
        >
          Tất cả ({total})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'sole'}
          className={`tab-btn ${activeTab === 'sole' ? 'active' : ''}`}
          onClick={() => { setActiveTab('sole'); setDisplayCount(40) }}
        >
          Trong phường ({sole.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'crosses'}
          className={`tab-btn ${activeTab === 'crosses' ? 'active' : ''}`}
          onClick={() => { setActiveTab('crosses'); setDisplayCount(40) }}
        >
          Giáp ranh / Nhiều phường ({crosses.length + ambiguous.length})
        </button>
      </div>

      {/* List */}
      <div className="road-items-list" role="list">
        {visibleItems.length === 0 ? (
          <p className="no-roads-msg muted">Không có tuyến đường trong mục này.</p>
        ) : (
          visibleItems.map((road) => {
            const isSelected = selectedRoadId === road.road_id
            const isMulti = road.candidate_ward_ids && road.candidate_ward_ids.length > 1
            const isAmbiguous = road.verification?.state === 'UNVERIFIED'
            const wardNames = (road.candidate_ward_ids || []).map((id) => (wardLookup ? wardLookup.get(id) || id : id))

            return (
              <button
                key={road.road_id}
                type="button"
                role="listitem"
                className={`road-item-card ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectRoad(road)}
                aria-pressed={isSelected}
              >
                <div className="road-item-main">
                  <span className="road-item-name">{road.displayName}</span>
                  <div className="road-item-meta">
                    <span className="tag road-tag">{road.roadTypeDesc}</span>
                    {isMulti && <span className="tag multi-ward-tag">Qua nhiều phường</span>}
                    {isAmbiguous && !isMulti && <span className="tag ambiguous-tag">Chưa xác minh</span>}
                  </div>
                </div>
                {isMulti && wardNames.length > 1 && (
                  <div className="road-item-wards">
                    <span className="ward-relation-text">Phạm vi: {wardNames.join(' · ')}</span>
                  </div>
                )}
              </button>
            )
          })
        )}
      </div>

      {hasMore && (
        <button
          type="button"
          className="load-more-btn"
          onClick={() => setDisplayCount((c) => c + 40)}
        >
          Xem thêm ({currentList.length - displayCount} đường)
        </button>
      )}
    </div>
  )
}
