import Icon from './Icon.jsx'
import { WARDS_LIST } from '../config/wards.js'

export default function WardFilter({ selectedWardId, onSelectWard, wardsData }) {
  const wards = wardsData?.features?.map((f) => ({
    id: f.properties.ward_id,
    name: f.properties.name,
    color: WARDS_LIST.find((w) => w.id === f.properties.ward_id)?.color || '#08785e',
  })) || WARDS_LIST

  return (
    <nav className="ward-filter-nav" aria-label="Bộ lọc 9 phường">
      <div className="ward-chips-scroll">
        <button
          type="button"
          className={`ward-chip ${!selectedWardId ? 'active' : ''}`}
          onClick={() => onSelectWard(null)}
          aria-pressed={!selectedWardId}
        >
          <span>Tất cả phường</span>
        </button>
        {wards.map((w) => {
          const isSelected = selectedWardId === w.id
          return (
            <button
              key={w.id}
              type="button"
              className={`ward-chip ${isSelected ? 'active' : ''}`}
              onClick={() => onSelectWard(isSelected ? null : w.id)}
              aria-pressed={isSelected}
              style={{
                '--chip-accent': w.color,
              }}
            >
              <span className="ward-dot" style={{ backgroundColor: w.color }} />
              <span>{w.name}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
