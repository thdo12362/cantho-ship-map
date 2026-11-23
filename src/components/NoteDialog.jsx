import { useState, useEffect } from 'react'
import Icon from './Icon.jsx'
import { saveNote } from '../services/db.js'

const POPULAR_TAGS = ['hẻm nhỏ', 'khó tìm', 'chó dữ', 'giờ cao điểm', 'cổng sau', 'chung cư']

export default function NoteDialog({
  isOpen,
  onClose,
  initialData,
  onSaved,
}) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || (initialData.target_name ? `Lưu ý ${initialData.target_name}` : ''))
      setContent(initialData.content || '')
      setTags(Array.isArray(initialData.tags) ? initialData.tags : [])
      setTagInput('')
      setError('')
    }
  }, [initialData, isOpen])

  if (!isOpen) return null

  function handleAddTag(tagToAdd) {
    const trimmed = tagToAdd.trim().toLowerCase()
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed])
      setTagInput('')
    }
  }

  function handleRemoveTag(tagToRemove) {
    setTags(tags.filter((t) => t !== tagToRemove))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Vui lòng nhập tiêu đề ghi chú.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const saved = await saveNote({
        id: initialData?.id,
        title: title.trim(),
        content: content.trim(),
        target_type: initialData?.target_type || 'general',
        target_id: initialData?.target_id || null,
        target_name: initialData?.target_name || null,
        tags,
        created_at: initialData?.created_at,
      })
      onSaved?.(saved)
      onClose()
    } catch (err) {
      setError(err.message || 'Không thể lưu ghi chú.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="note-dialog-title">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="note-dialog-title" className="modal-title">
            <Icon name="fileText" width="20" height="20" /> {initialData?.id ? 'Chỉnh sửa ghi chú' : 'Thêm ghi chú giao hàng'}
          </h2>
          <button type="button" className="icon-close-btn" onClick={onClose} aria-label="Đóng">
            <Icon name="close" width="18" height="18" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="dialog-form">
          {initialData?.target_name && (
            <div className="form-group">
              <span className="field-label">Gắn với mục:</span>
              <span className="badge-tag">{initialData.target_name}</span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="note-title">Tiêu đề ghi chú <span className="req">*</span></label>
            <input
              id="note-title"
              type="text"
              placeholder="VD: Hẻm 54 - lưu ý vào buổi tối…"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="note-content">Nội dung ghi chú</label>
            <textarea
              id="note-content"
              rows={4}
              placeholder="VD: Có chốt rào hẻm sau 22h, cần gọi khách trước khi rẽ vào…"
              value={content}
              maxLength={1000}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="note-tags">Nhãn phân loại (Tags)</label>
            <div className="tag-input-row">
              <input
                id="note-tags"
                type="text"
                placeholder="Nhập nhãn và nhấn Thêm…"
                value={tagInput}
                maxLength={30}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddTag(tagInput)
                  }
                }}
              />
              <button
                type="button"
                className="add-tag-btn"
                onClick={() => handleAddTag(tagInput)}
                disabled={!tagInput.trim()}
              >
                Thêm
              </button>
            </div>

            {/* Selected Tags */}
            {tags.length > 0 && (
              <div className="chips-row">
                {tags.map((t) => (
                  <span key={t} className="active-tag-chip">
                    #{t}
                    <button type="button" onClick={() => handleRemoveTag(t)} aria-label={`Xóa nhãn ${t}`}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Popular Tag suggestions */}
            <div className="popular-tags-list">
              <span className="popular-label">Gợi ý:</span>
              {POPULAR_TAGS.map((pt) => (
                <button
                  key={pt}
                  type="button"
                  className={`popular-tag-btn ${tags.includes(pt) ? 'chosen' : ''}`}
                  onClick={() => handleAddTag(pt)}
                >
                  +{pt}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="error-text" role="alert">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onClose} disabled={loading}>
              Hủy
            </button>
            <button type="submit" className="button primary" disabled={loading}>
              {loading ? <span className="spinner" /> : <Icon name="fileText" width="18" height="18" />}
              {loading ? 'Đang lưu…' : 'Lưu ghi chú'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
