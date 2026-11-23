import Icon from './Icon.jsx'
import { googleMapsUrl } from '../services/location.js'
import { formatRoadDisplayName } from '../services/text.js'

export default function RoadDetailCard({
  road,
  roadFeature,
  midpoint,
  wardLookup,
  onClear,
  onSaveRoad,
  onAddRoadNote,
}) {
  if (!road) return null

  const displayName = formatRoadDisplayName(road)
  const isNamed = Boolean(road.name && road.name.trim())
  const roadType = road.roadTypeDesc || 'Tuyến đường'
  const wardNames = (road.candidate_ward_ids || []).map((id) => (wardLookup ? wardLookup.get(id) || id : id))
  const isMultiWard = road.candidate_ward_ids && road.candidate_ward_ids.length > 1
  const isAmbiguous = road.verification?.state === 'UNVERIFIED'

  // Construct Google Maps search target
  const searchAddress = isNamed
    ? `${road.name}, Cần Thơ`
    : wardNames.length > 0
      ? `${wardNames.join(', ')}, Cần Thơ`
      : 'Cần Thơ'
  const url = googleMapsUrl(midpoint, searchAddress)

  return (
    <section className="road-detail-card" aria-labelledby="road-detail-heading">
      <div className="card-top-bar">
        <button type="button" className="icon-back-btn" onClick={onClear} aria-label="Quay lại danh sách">
          <Icon name="arrowLeft" width="20" height="20" />
        </button>
        <span className="section-label">TUYẾN ĐƯỜNG ĐƯỢC CHỌN</span>
        <button type="button" className="close-btn" onClick={onClear} aria-label="Đóng chi tiết">
          <Icon name="close" width="18" height="18" />
        </button>
      </div>

      <div className="road-title-row">
        <span className="road-badge-icon">
          <Icon name="road" width="22" height="22" />
        </span>
        <div>
          <h2 id="road-detail-heading" className="road-title">{displayName}</h2>
          <div className="road-meta-tags">
            <span className="tag road-type-tag">{roadType}</span>
            {road.road_id && <span className="tag osm-tag">{road.road_id}</span>}
          </div>
        </div>
      </div>

      <div className="road-info-body">
        {wardNames.length > 0 && (
          <div className="info-item">
            <span className="info-label">Khu vực tham khảo:</span>
            <div className="ward-pill-list">
              {wardNames.map((w, idx) => (
                <span key={idx} className="ward-sub-pill">{w}</span>
              ))}
            </div>
          </div>
        )}

        {midpoint && (
          <div className="info-item">
            <span className="info-label">Tọa độ tâm đoạn:</span>
            <span className="coordinates-value">{midpoint.lat.toFixed(6)}, {midpoint.lng.toFixed(6)}</span>
          </div>
        )}

        {/* Verification Alert Banner */}
        <div className={`verification-alert ${isAmbiguous || isMultiWard ? 'alert-warning' : 'alert-info'}`} role="status">
          <Icon name={isAmbiguous || isMultiWard ? 'alertTriangle' : 'info'} width="18" height="18" />
          <div>
            <strong>{road.verification?.badgeText || 'Tham khảo OSM'}:</strong>{' '}
            <span>{road.verification?.alertText || 'Vị trí tuyến đường tham khảo theo dữ liệu OpenStreetMap, chưa xác minh thực địa.'}</span>
          </div>
        </div>

        <p className="shipper-disclaimer">
          Lưu ý cho shipper: Tọa độ là tâm đoạn đường tham khảo, không phải vị trí số nhà của khách hàng. Vui lòng xác nhận với người nhận khi giao hàng.
        </p>
      </div>

      <div className="card-actions">
        {url ? (
          <a className="button primary" href={url} target="_blank" rel="noopener noreferrer">
            <Icon name="external" /> Mở Google Maps
          </a>
        ) : (
          <button className="button primary" disabled>
            <Icon name="external" /> Mở Google Maps
          </button>
        )}

        {midpoint && (
          <div className="secondary-actions-row">
            <button
              type="button"
              className="button secondary-action-btn"
              onClick={() => onSaveRoad?.({
                lat: midpoint.lat,
                lng: midpoint.lng,
                road_id: road.road_id,
                street_name: displayName,
                name: displayName,
                ward_id: road.candidate_ward_ids?.[0] || null,
                ward_name: wardNames[0] || null,
              })}
            >
              <Icon name="star" width="16" height="16" /> Lưu tuyến đường
            </button>
            <button
              type="button"
              className="button secondary-action-btn"
              onClick={() => onAddRoadNote?.({
                target_type: 'road',
                target_id: road.road_id,
                target_name: displayName,
              })}
            >
              <Icon name="fileText" width="16" height="16" /> Thêm ghi chú
            </button>
          </div>
        )}

        <button type="button" className="clear-button" onClick={onClear}>
          Bỏ chọn tuyến đường
        </button>
      </div>
    </section>
  )
}
