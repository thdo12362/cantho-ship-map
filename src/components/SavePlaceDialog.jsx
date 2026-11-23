import { useState, useEffect } from 'react'
import Icon from './Icon.jsx'
import { saveFavorite } from '../services/db.js'

export default function SavePlaceDialog({
  isOpen,
  onClose,
  initialData,
  onSaved,
}) {
  const [name, setName] = useState('')
  const [streetName, setStreetName] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || initialData.street_name || 'Địa điểm mới')
      setStreetName(initialData.street_name || '')
      setNotes(initialData.notes || '')
      setError('')
    }
  }, [initialData, isOpen])

  if (!isOpen) return null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Vui lòng nhập tên địa điểm.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const saved = await saveFavorite({
        id: initialData?.id,
        name: name.trim(),
        lat: initialData.lat,
        lng: initialData.lng,
        street_name: streetName.trim() || null,
        ward_id: initialData.ward_id || null,
        ward_name: initialData.ward_name || null,
        road_id: initialData.road_id || null,
        notes: notes.trim(),
        created_at: initialData?.created_at,
      })
      onSaved?.(saved)
      onClose()
    } catch (err) {
      setError(err.message || 'Không thể lưu địa điểm.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="save-place-title">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="save-place-title" className="modal-title">
            <Icon name="star" width="20" height="20" /> {initialData?.id ? 'Chỉnh sửa địa điểm' : 'Lưu địa điểm yêu thích'}
          </h2>
          <button type="button" className="icon-close-btn" onClick={onClose} aria-label="Đóng">
            <Icon name="close" width="18" height="18" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="dialog-form">
          <div className="form-group">
            <label htmlFor="fav-name">Tên địa điểm <span className="req">*</span></label>
            <input
              id="fav-name"
              type="text"
              placeholder="VD: Khách quen hẻm 54, Kho hàng Ba Láng…"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="fav-street">Tên đường / Tuyến phố</label>
            <input
              id="fav-street"
              type="text"
              placeholder="VD: Đường 30 Tháng 4"
              value={streetName}
              maxLength={120}
              onChange={(e) => setStreetName(e.target.value)}
            />
          </div>

          {initialData?.ward_name && (
            <div className="form-group">
              <span className="field-label">Phường tham khảo:</span>
              <span className="badge-tag">Phường {initialData.ward_name}</span>
            </div>
          )}

          <div className="form-group">
            <span className="field-label">Tọa độ:</span>
            <span className="coords-text">
              {Number(initialData?.lat).toFixed(6)}, {Number(initialData?.lng).toFixed(6)}
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="fav-notes">Ghi chú (đặc điểm hẻm, lưu ý giao hàng…)</label>
            <textarea
              id="fav-notes"
              rows={3}
              placeholder="VD: Hẻm vào hơi nhỏ, rẽ phải sau quán cà phê…"
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="error-text" role="alert">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onClose} disabled={loading}>
              Hủy
            </button>
            <button type="submit" className="button primary" disabled={loading}>
              {loading ? <span className="spinner" /> : <Icon name="star" width="18" height="18" />}
              {loading ? 'Đang lưu…' : 'Lưu địa điểm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
