import Icon from './Icon.jsx'
import { googleMapsUrl } from '../services/location.js'

export default function LocationCard({
  position,
  address,
  detectedWard,
  onClear,
  onSavePlace,
  onAddNote,
}) {
  const url = googleMapsUrl(position, address)

  return (
    <section className="location-card" aria-labelledby="location-heading">
      <div className="section-label">ĐIỂM ĐƯỢC CHỌN</div>
      <div className="location-title">
        <span className="pin-badge">
          <Icon name="pin" />
        </span>
        <h2 id="location-heading">
          {position
            ? position.source === 'gps'
              ? 'Vị trí GPS hiện tại'
              : 'Vị trí trên bản đồ'
            : address
              ? 'Địa chỉ tìm kiếm'
              : 'Bạn muốn giao đến đâu?'}
        </h2>
      </div>

      <div aria-live="polite">
        {position ? (
          <>
            <p className="coordinates">
              {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
            </p>
            {Number.isFinite(position.accuracy) && (
              <p className="muted">Độ chính xác GPS: khoảng ±{Math.round(position.accuracy)} m.</p>
            )}

            {/* Detected Ward information according to OSM reference */}
            {detectedWard ? (
              <div
                className={`location-ward-alert ${
                  detectedWard.is_near_boundary
                    ? 'alert-warning'
                    : detectedWard.status === 'PROVISIONAL_WARD'
                      ? 'alert-provisional'
                      : 'alert-info'
                }`}
                role="status"
              >
                <Icon
                  name={detectedWard.is_near_boundary ? 'alertTriangle' : 'info'}
                  width="16"
                  height="16"
                />
                <div>
                  <strong>
                    {detectedWard.ward_name ? `Phường ${detectedWard.ward_name}` : 'Khu vực'}:
                  </strong>{' '}
                  <span>{detectedWard.message}</span>
                </div>
              </div>
            ) : (
              <p className="muted">Chưa xác định phường tại điểm này.</p>
            )}
          </>
        ) : address ? (
          <>
            <p className="address-value">{address}</p>
            <p className="muted">Mở Google Maps để tìm địa chỉ này.</p>
          </>
        ) : (
          <p className="muted">Chạm một điểm trên bản đồ hoặc dùng GPS để chọn vị trí của bạn.</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="card-actions-block">
        {url ? (
          <a className="button primary" href={url} target="_blank" rel="noopener noreferrer">
            <Icon name="external" /> Mở Google Maps
          </a>
        ) : (
          <button className="button primary" disabled>
            <Icon name="external" /> Mở Google Maps
          </button>
        )}

        {position && (
          <div className="secondary-actions-row">
            <button
              type="button"
              className="button secondary-action-btn"
              onClick={() => onSavePlace?.({
                lat: position.lat,
                lng: position.lng,
                ward_id: detectedWard?.ward_id,
                ward_name: detectedWard?.ward_name,
                name: position.source === 'gps' ? 'Vị trí GPS của tôi' : 'Điểm đã ghim',
              })}
            >
              <Icon name="star" width="16" height="16" /> Lưu vào sổ tay
            </button>
            <button
              type="button"
              className="button secondary-action-btn"
              onClick={() => onAddNote?.({
                target_type: 'location',
                target_name: detectedWard?.ward_name ? `Điểm tại P. ${detectedWard.ward_name}` : 'Điểm đã chọn',
                lat: position.lat,
                lng: position.lng,
              })}
            >
              <Icon name="fileText" width="16" height="16" /> Thêm ghi chú
            </button>
          </div>
        )}

        {(position || address) && (
          <button className="clear-button" onClick={onClear}>
            Bỏ chọn vị trí
          </button>
        )}
      </div>
    </section>
  )
}
