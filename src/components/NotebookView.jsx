import { useState, useEffect, useMemo, useRef } from 'react'
import Icon from './Icon.jsx'
import {
  getFavorites,
  deleteFavorite,
  getNotes,
  deleteNote,
  getSearchHistory,
  deleteSearchHistoryItem,
  clearAllSearchHistory,
  exportBackup,
  validateBackup,
  importBackup,
} from '../services/db.js'
import { googleMapsUrl } from '../services/location.js'
import { normalizeVietnamese } from '../services/text.js'

export default function NotebookView({
  activeTab = 'favorites',
  onTabChange,
  onViewLocationOnMap,
  onReSearch,
  saveHistoryEnabled,
  onToggleSaveHistory,
  onOpenAddPlace,
  onEditPlace,
  onOpenAddNote,
  onEditNote,
}) {
  const [tab, setTab] = useState(activeTab)
  const [favorites, setFavorites] = useState([])
  const [notes, setNotes] = useState([])
  const [history, setHistory] = useState([])
  const [favQuery, setFavQuery] = useState('')
  const [favSort, setFavSort] = useState('updated_at') // 'updated_at' | 'name'
  const [noteQuery, setNoteQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null) // { type, item }

  // Backup & Import states
  const [importFile, setImportFile] = useState(null)
  const [importPreview, setImportPreview] = useState(null)
  const [importErrors, setImportErrors] = useState([])
  const [importMode, setImportMode] = useState('merge') // 'merge' | 'skip'
  const [importLoading, setImportLoading] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    setTab(activeTab)
  }, [activeTab])

  // Load data when tab changes
  useEffect(() => {
    loadData()
  }, [tab])

  async function loadData() {
    setLoading(true)
    try {
      if (tab === 'favorites') {
        const favs = await getFavorites(favSort)
        setFavorites(favs)
      } else if (tab === 'notes') {
        const nts = await getNotes()
        setNotes(nts)
      } else if (tab === 'history') {
        const hist = await getSearchHistory(50)
        setHistory(hist)
      }
    } catch (err) {
      console.error('Lỗi tải dữ liệu sổ tay:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleSwitchTab(nextTab) {
    setTab(nextTab)
    onTabChange?.(nextTab)
    setMessage(null)
  }

  // Favorites handling
  const filteredFavorites = useMemo(() => {
    let list = [...favorites]
    const norm = normalizeVietnamese(favQuery)
    if (norm) {
      list = list.filter((f) => {
        return (
          normalizeVietnamese(f.name).includes(norm) ||
          normalizeVietnamese(f.street_name || '').includes(norm) ||
          normalizeVietnamese(f.ward_name || '').includes(norm) ||
          normalizeVietnamese(f.notes || '').includes(norm)
        )
      })
    }
    if (favSort === 'name') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'))
    } else {
      list.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
    }
    return list
  }, [favorites, favQuery, favSort])

  async function handleDeleteFavorite(fav) {
    await deleteFavorite(fav.id)
    setFavorites((prev) => prev.filter((f) => f.id !== fav.id))
    setConfirmDelete(null)
    setMessage({ type: 'success', text: `Đã xóa địa điểm "${fav.name}".` })
  }

  // Notes handling
  const allTags = useMemo(() => {
    const set = new Set()
    for (const n of notes) {
      if (Array.isArray(n.tags)) {
        for (const t of n.tags) set.add(t)
      }
    }
    return Array.from(set)
  }, [notes])

  const filteredNotes = useMemo(() => {
    let list = [...notes]
    if (selectedTag) {
      list = list.filter((n) => n.tags && n.tags.includes(selectedTag))
    }
    const norm = normalizeVietnamese(noteQuery)
    if (norm) {
      list = list.filter((n) => {
        return (
          normalizeVietnamese(n.title).includes(norm) ||
          normalizeVietnamese(n.content).includes(norm) ||
          normalizeVietnamese(n.target_name || '').includes(norm) ||
          (n.tags && n.tags.some((t) => normalizeVietnamese(t).includes(norm)))
        )
      })
    }
    return list
  }, [notes, selectedTag, noteQuery])

  async function handleDeleteNote(note) {
    await deleteNote(note.id)
    setNotes((prev) => prev.filter((n) => n.id !== note.id))
    setConfirmDelete(null)
    setMessage({ type: 'success', text: `Đã xóa ghi chú "${note.title}".` })
  }

  // History handling
  async function handleDeleteHistory(id) {
    await deleteSearchHistoryItem(id)
    setHistory((prev) => prev.filter((h) => h.id !== id))
  }

  async function handleClearAllHistory() {
    await clearAllSearchHistory()
    setHistory([])
    setConfirmDelete(null)
    setMessage({ type: 'success', text: 'Đã xóa toàn bộ lịch sử tìm kiếm.' })
  }

  // Export handling
  async function handleExport() {
    try {
      const backup = await exportBackup({ saveHistoryEnabled })
      const jsonStr = JSON.stringify(backup, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const dateStr = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `cantho-ship-map-backup-${dateStr}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setMessage({ type: 'success', text: 'Xuất file sao lưu thành công!' })
    } catch (err) {
      setMessage({ type: 'error', text: `Lỗi xuất dữ liệu: ${err.message}` })
    }
  }

  // Import handling
  function handleFileSelected(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setImportFile(file)
    setImportErrors([])
    setImportPreview(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result)
        const check = validateBackup(parsed)
        if (!check.valid) {
          setImportErrors(check.errors)
        } else {
          setImportPreview({
            data: parsed,
            summary: check.summary,
          })
        }
      } catch (err) {
        setImportErrors(['Tệp không đúng định dạng JSON: ' + err.message])
      }
    }
    reader.onerror = () => {
      setImportErrors(['Không thể đọc tệp sao lưu.'])
    }
    reader.readAsText(file)
  }

  async function handleConfirmImport() {
    if (!importPreview?.data) return
    setImportLoading(true)
    setMessage(null)
    try {
      const res = await importBackup(importPreview.data, { mode: importMode })
      setMessage({
        type: 'success',
        text: `Nhập thành công: ${res.importedFavorites} địa điểm, ${res.importedNotes} ghi chú, ${res.importedHistory} lịch sử. (Bỏ qua ${res.skippedCount} mục trùng)`,
      })
      setImportPreview(null)
      setImportFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      loadData()
    } catch (err) {
      setMessage({ type: 'error', text: `Lỗi nhập dữ liệu: ${err.message}` })
    } finally {
      setImportLoading(false)
    }
  }

  return (
    <div className="notebook-view" aria-label="Sổ tay cá nhân của shipper">
      {/* Tab Switcher */}
      <nav className="notebook-tabs-nav" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'favorites'}
          className={`notebook-tab-btn ${tab === 'favorites' ? 'active' : ''}`}
          onClick={() => handleSwitchTab('favorites')}
        >
          <Icon name="star" width="16" height="16" />
          <span>Địa điểm</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'notes'}
          className={`notebook-tab-btn ${tab === 'notes' ? 'active' : ''}`}
          onClick={() => handleSwitchTab('notes')}
        >
          <Icon name="fileText" width="16" height="16" />
          <span>Ghi chú</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          className={`notebook-tab-btn ${tab === 'history' ? 'active' : ''}`}
          onClick={() => handleSwitchTab('history')}
        >
          <Icon name="clock" width="16" height="16" />
          <span>Lịch sử</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'backup'}
          className={`notebook-tab-btn ${tab === 'backup' ? 'active' : ''}`}
          onClick={() => handleSwitchTab('backup')}
        >
          <Icon name="download" width="16" height="16" />
          <span>Sao lưu</span>
        </button>
      </nav>

      {/* Global alert message */}
      {message && (
        <div className={`notebook-alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}`} role="status">
          <Icon name={message.type === 'error' ? 'alertTriangle' : 'checkCircle'} width="18" height="18" />
          <span>{message.text}</span>
          <button type="button" className="close-alert-btn" onClick={() => setMessage(null)} aria-label="Đóng thông báo">
            ×
          </button>
        </div>
      )}

      {/* Tab 1: Favorites */}
      {tab === 'favorites' && (
        <div className="notebook-tab-content">
          <div className="tab-actions-header">
            <div className="filter-search-box">
              <Icon name="search" width="16" height="16" />
              <input
                type="search"
                placeholder="Tìm trong địa điểm đã lưu…"
                value={favQuery}
                onChange={(e) => setFavQuery(e.target.value)}
              />
            </div>
            <div className="sort-and-add-row">
              <select
                className="sort-select"
                value={favSort}
                onChange={(e) => {
                  setFavSort(e.target.value)
                  loadData()
                }}
                aria-label="Sắp xếp danh sách"
              >
                <option value="updated_at">Mới cập nhật</option>
                <option value="name">Theo tên (A-Z)</option>
              </select>
              <button type="button" className="add-btn-primary" onClick={onOpenAddPlace}>
                <Icon name="plus" width="16" height="16" /> Thêm điểm
              </button>
            </div>
          </div>

          <div className="items-list-container">
            {loading ? (
              <div className="loading-state"><span className="spinner" /> Đang tải địa điểm…</div>
            ) : filteredFavorites.length === 0 ? (
              <div className="empty-state-box">
                <Icon name="star" width="32" height="32" />
                <p className="empty-main-text">
                  {favQuery ? 'Không tìm thấy địa điểm phù hợp.' : 'Chưa có địa điểm yêu thích nào.'}
                </p>
                <p className="empty-sub-text">
                  Bạn có thể lưu vị trí GPS, một điểm chạm trên bản đồ hoặc tuyến đường đang xem.
                </p>
              </div>
            ) : (
              filteredFavorites.map((fav) => {
                const mapUrl = googleMapsUrl({ lat: fav.lat, lng: fav.lng }, fav.name)
                return (
                  <article key={fav.id} className="notebook-card favorite-card">
                    <div className="card-header-row">
                      <div className="card-title-group">
                        <span className="card-type-icon star-icon">
                          <Icon name="star" width="18" height="18" />
                        </span>
                        <div>
                          <h3 className="card-item-title">{fav.name}</h3>
                          {fav.street_name && <p className="card-street-name">{fav.street_name}</p>}
                        </div>
                      </div>
                      {fav.ward_name && <span className="tag ward-tag">P. {fav.ward_name}</span>}
                    </div>

                    {fav.notes && <p className="card-notes-text">{fav.notes}</p>}

                    <div className="card-footer-row">
                      <span className="card-coords-text">
                        {Number(fav.lat).toFixed(5)}, {Number(fav.lng).toFixed(5)}
                      </span>
                      <div className="card-actions-group">
                        <button
                          type="button"
                          className="card-action-btn view-map-btn"
                          onClick={() => onViewLocationOnMap(fav)}
                          title="Xem vị trí trên bản đồ"
                        >
                          Xem bản đồ
                        </button>
                        {mapUrl && (
                          <a
                            href={mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="card-action-btn gmap-btn"
                            title="Mở Google Maps"
                          >
                            <Icon name="external" width="14" height="14" />
                          </a>
                        )}
                        <button
                          type="button"
                          className="card-action-btn edit-btn"
                          onClick={() => onEditPlace(fav)}
                          title="Sửa địa điểm"
                        >
                          <Icon name="edit" width="14" height="14" />
                        </button>
                        <button
                          type="button"
                          className="card-action-btn delete-btn"
                          onClick={() => setConfirmDelete({ type: 'favorite', item: fav })}
                          title="Xóa địa điểm"
                        >
                          <Icon name="trash" width="14" height="14" />
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Notes */}
      {tab === 'notes' && (
        <div className="notebook-tab-content">
          <div className="tab-actions-header">
            <div className="filter-search-box">
              <Icon name="search" width="16" height="16" />
              <input
                type="search"
                placeholder="Tìm tiêu đề, nội dung, nhãn…"
                value={noteQuery}
                onChange={(e) => setNoteQuery(e.target.value)}
              />
            </div>
            <button type="button" className="add-btn-primary" onClick={onOpenAddNote}>
              <Icon name="plus" width="16" height="16" /> Thêm ghi chú
            </button>
          </div>

          {/* Tags Filter Row */}
          {allTags.length > 0 && (
            <div className="tags-filter-bar">
              <button
                type="button"
                className={`tag-pill-btn ${!selectedTag ? 'active' : ''}`}
                onClick={() => setSelectedTag(null)}
              >
                Tất cả
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`tag-pill-btn ${selectedTag === tag ? 'active' : ''}`}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          <div className="items-list-container">
            {loading ? (
              <div className="loading-state"><span className="spinner" /> Đang tải ghi chú…</div>
            ) : filteredNotes.length === 0 ? (
              <div className="empty-state-box">
                <Icon name="fileText" width="32" height="32" />
                <p className="empty-main-text">
                  {noteQuery || selectedTag ? 'Không tìm thấy ghi chú phù hợp.' : 'Chưa có ghi chú nào.'}
                </p>
                <p className="empty-sub-text">
                  Lưu các thông tin như đặc điểm hẻm, lối vào, lưu ý giờ cao điểm để tiện tra cứu lại.
                </p>
              </div>
            ) : (
              filteredNotes.map((note) => (
                <article key={note.id} className="notebook-card note-card">
                  <div className="card-header-row">
                    <h3 className="card-item-title">{note.title}</h3>
                    {note.target_name && <span className="tag note-target-tag">{note.target_name}</span>}
                  </div>

                  <p className="card-content-text">{note.content}</p>

                  {note.tags && note.tags.length > 0 && (
                    <div className="note-tags-list">
                      {note.tags.map((t) => (
                        <span key={t} className="sub-tag-chip">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="card-footer-row">
                    <span className="card-date-text">
                      {new Date(note.updated_at).toLocaleDateString('vi-VN')}
                    </span>
                    <div className="card-actions-group">
                      <button
                        type="button"
                        className="card-action-btn edit-btn"
                        onClick={() => onEditNote(note)}
                        title="Chỉnh sửa ghi chú"
                      >
                        <Icon name="edit" width="14" height="14" /> Sửa
                      </button>
                      <button
                        type="button"
                        className="card-action-btn delete-btn"
                        onClick={() => setConfirmDelete({ type: 'note', item: note })}
                        title="Xóa ghi chú"
                      >
                        <Icon name="trash" width="14" height="14" /> Xóa
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Search History */}
      {tab === 'history' && (
        <div className="notebook-tab-content">
          <div className="history-settings-bar">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={saveHistoryEnabled}
                onChange={(e) => onToggleSaveHistory(e.target.checked)}
              />
              <span>Tự động lưu lịch sử tìm kiếm</span>
            </label>
            {history.length > 0 && (
              <button
                type="button"
                className="clear-all-btn"
                onClick={() => setConfirmDelete({ type: 'clear_all_history' })}
              >
                Xóa tất cả
              </button>
            )}
          </div>

          <div className="items-list-container">
            {loading ? (
              <div className="loading-state"><span className="spinner" /> Đang tải lịch sử…</div>
            ) : history.length === 0 ? (
              <div className="empty-state-box">
                <Icon name="clock" width="32" height="32" />
                <p className="empty-main-text">Chưa có lịch sử tìm kiếm.</p>
                <p className="empty-sub-text">
                  Khi bạn tìm kiếm tên đường hoặc địa chỉ, các từ khóa sẽ được lưu tại đây để tra cứu nhanh.
                </p>
              </div>
            ) : (
              history.map((h) => (
                <div key={h.id} className="history-item-row">
                  <span className="history-clock-icon">
                    <Icon name="clock" width="16" height="16" />
                  </span>
                  <div className="history-text-col" onClick={() => onReSearch(h)} role="button" tabIndex={0}>
                    <span className="history-query">{h.query}</span>
                    {h.selected_result && <span className="history-sub">Đã chọn: {h.selected_result}</span>}
                  </div>
                  <span className="history-time-text">
                    {new Date(h.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button
                    type="button"
                    className="delete-item-btn"
                    onClick={() => handleDeleteHistory(h.id)}
                    aria-label={`Xóa "${h.query}" khỏi lịch sử`}
                  >
                    <Icon name="close" width="14" height="14" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Backup & Restore */}
      {tab === 'backup' && (
        <div className="notebook-tab-content backup-tab">
          <div className="backup-section-card">
            <div className="backup-card-header">
              <Icon name="download" width="22" height="22" />
              <div>
                <h3 className="backup-heading">Sao lưu dữ liệu cá nhân (Xuất JSON)</h3>
                <p className="backup-subtext">
                  Xuất toàn bộ địa điểm đã lưu, ghi chú và lịch sử sang file JSON để sao lưu hoặc chuyển sang máy khác.
                </p>
              </div>
            </div>
            <button type="button" className="button primary export-btn" onClick={handleExport}>
              <Icon name="download" /> Tải về tệp sao lưu (.json)
            </button>
            <p className="privacy-warning">
              ⚠️ Lưu ý bảo mật: Tệp sao lưu chứa thông tin cá nhân của bạn. Không gửi file lên mạng hoặc các kho lưu trữ công khai.
            </p>
          </div>

          <div className="backup-section-card">
            <div className="backup-card-header">
              <Icon name="upload" width="22" height="22" />
              <div>
                <h3 className="backup-heading">Khôi phục dữ liệu (Nhập JSON)</h3>
                <p className="backup-subtext">
                  Chọn tệp JSON sao lưu trước đó để nạp lại vào sổ tay của trình duyệt hiện tại.
                </p>
              </div>
            </div>

            <div className="file-picker-row">
              <input
                ref={fileInputRef}
                id="backup-file-input"
                type="file"
                accept=".json,application/json"
                onChange={handleFileSelected}
              />
            </div>

            {importErrors.length > 0 && (
              <div className="import-errors-box" role="alert">
                <strong>Tệp sao lưu không hợp lệ:</strong>
                <ul>
                  {importErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {importPreview && (
              <div className="import-preview-box">
                <h4 className="preview-heading">Xem trước dữ liệu sẽ nhập:</h4>
                <ul className="preview-stats-list">
                  <li>⭐ <strong>{importPreview.summary.favoritesCount}</strong> địa điểm yêu thích</li>
                  <li>📝 <strong>{importPreview.summary.notesCount}</strong> ghi chú hẻm / đường</li>
                  <li>🕒 <strong>{importPreview.summary.historyCount}</strong> lịch sử tìm kiếm</li>
                  {importPreview.summary.exportedAt && (
                    <li>📅 Ngày xuất: {new Date(importPreview.summary.exportedAt).toLocaleString('vi-VN')}</li>
                  )}
                </ul>

                <div className="mode-selection">
                  <label className="mode-radio">
                    <input
                      type="radio"
                      name="importMode"
                      value="merge"
                      checked={importMode === 'merge'}
                      onChange={() => setImportMode('merge')}
                    />
                    <span>Hợp nhất an toàn (Merge - bảo toàn dữ liệu hiện có)</span>
                  </label>
                  <label className="mode-radio">
                    <input
                      type="radio"
                      name="importMode"
                      value="skip"
                      checked={importMode === 'skip'}
                      onChange={() => setImportMode('skip')}
                    />
                    <span>Bỏ qua bản ghi trùng ID (Skip duplicates)</span>
                  </label>
                </div>

                <button
                  type="button"
                  className="button primary confirm-import-btn"
                  onClick={handleConfirmImport}
                  disabled={importLoading}
                >
                  {importLoading ? <span className="spinner" /> : <Icon name="upload" />}
                  {importLoading ? 'Đang nhập…' : 'Xác nhận nhập dữ liệu'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(null)} role="dialog" aria-modal="true">
          <div className="modal-card confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirm-title">Xác nhận xóa</h3>
            <p className="confirm-msg">
              {confirmDelete.type === 'clear_all_history'
                ? 'Bạn có chắc chắn muốn xóa toàn bộ lịch sử tìm kiếm? Thao tác này không thể hoàn tác.'
                : confirmDelete.type === 'favorite'
                  ? `Bạn có chắc chắn muốn xóa địa điểm "${confirmDelete.item.name}"?`
                  : `Bạn có chắc chắn muốn xóa ghi chú "${confirmDelete.item.title}"?`}
            </p>
            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={() => setConfirmDelete(null)}>
                Hủy
              </button>
              <button
                type="button"
                className="button danger-btn"
                onClick={() => {
                  if (confirmDelete.type === 'clear_all_history') handleClearAllHistory()
                  else if (confirmDelete.type === 'favorite') handleDeleteFavorite(confirmDelete.item)
                  else if (confirmDelete.type === 'note') handleDeleteNote(confirmDelete.item)
                }}
              >
                Xóa ngay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
