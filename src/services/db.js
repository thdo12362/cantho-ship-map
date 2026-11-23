import { isValidCoordinates } from './location.js'
import { normalizeVietnamese } from './text.js'

const DB_NAME = 'cantho_ship_map_db'
const DB_VERSION = 1

// In-memory fallback storage for Node tests or environments where IndexedDB is blocked
const memoryStore = {
  favorites: new Map(),
  notes: new Map(),
  search_history: new Map(),
}

function hasIndexedDB() {
  return typeof globalThis !== 'undefined' && Boolean(globalThis.indexedDB)
}

let dbInstance = null

export function resetMemoryStoreForTesting() {
  memoryStore.favorites.clear()
  memoryStore.notes.clear()
  memoryStore.search_history.clear()
}

export function openDatabase() {
  if (!hasIndexedDB()) {
    // Return memory-backed pseudo-db
    return Promise.resolve({ isMemory: true })
  }

  if (dbInstance) {
    return Promise.resolve(dbInstance)
  }

  return new Promise((resolve, reject) => {
    try {
      const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = event.target.result

        if (!db.objectStoreNames.contains('favorites')) {
          const favStore = db.createObjectStore('favorites', { keyPath: 'id' })
          favStore.createIndex('by_name', 'name', { unique: false })
          favStore.createIndex('by_ward_id', 'ward_id', { unique: false })
          favStore.createIndex('by_road_id', 'road_id', { unique: false })
          favStore.createIndex('by_updated_at', 'updated_at', { unique: false })
        }

        if (!db.objectStoreNames.contains('notes')) {
          const noteStore = db.createObjectStore('notes', { keyPath: 'id' })
          noteStore.createIndex('by_target_type', 'target_type', { unique: false })
          noteStore.createIndex('by_target_id', 'target_id', { unique: false })
          noteStore.createIndex('by_created_at', 'created_at', { unique: false })
          noteStore.createIndex('by_updated_at', 'updated_at', { unique: false })
        }

        if (!db.objectStoreNames.contains('search_history')) {
          const histStore = db.createObjectStore('search_history', { keyPath: 'id' })
          histStore.createIndex('by_timestamp', 'timestamp', { unique: false })
        }
      }

      request.onsuccess = (event) => {
        dbInstance = event.target.result
        resolve(dbInstance)
      }

      request.onerror = (event) => {
        console.warn('Không thể mở IndexedDB, sử dụng bộ nhớ đệm:', event.target.error)
        resolve({ isMemory: true })
      }
    } catch (err) {
      console.warn('Lỗi khởi tạo IndexedDB:', err)
      resolve({ isMemory: true })
    }
  })
}

// ==========================================================================
// Generic DB Operations
// ==========================================================================
async function getAllFromStore(storeName) {
  const db = await openDatabase()
  if (db.isMemory) {
    return Array.from(memoryStore[storeName].values())
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    } catch (err) {
      reject(err)
    }
  })
}

async function getByIdFromStore(storeName, id) {
  const db = await openDatabase()
  if (db.isMemory) {
    return memoryStore[storeName].get(id) || null
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const req = store.get(id)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    } catch (err) {
      reject(err)
    }
  })
}

async function putToStore(storeName, item) {
  const db = await openDatabase()
  if (db.isMemory) {
    memoryStore[storeName].set(item.id, item)
    return item
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const req = store.put(item)
      req.onsuccess = () => resolve(item)
      req.onerror = () => reject(req.error)
    } catch (err) {
      reject(err)
    }
  })
}

async function deleteFromStore(storeName, id) {
  const db = await openDatabase()
  if (db.isMemory) {
    const existed = memoryStore[storeName].has(id)
    memoryStore[storeName].delete(id)
    return existed
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const req = store.delete(id)
      req.onsuccess = () => resolve(true)
      req.onerror = () => reject(req.error)
    } catch (err) {
      reject(err)
    }
  })
}

async function clearStore(storeName) {
  const db = await openDatabase()
  if (db.isMemory) {
    memoryStore[storeName].clear()
    return true
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const req = store.clear()
      req.onsuccess = () => resolve(true)
      req.onerror = () => reject(req.error)
    } catch (err) {
      reject(err)
    }
  })
}

// ==========================================================================
// Favorites Service
// ==========================================================================
export async function getFavorites(sortBy = 'updated_at') {
  const items = await getAllFromStore('favorites')
  return items.sort((a, b) => {
    if (sortBy === 'name') {
      return (a.name || '').localeCompare(b.name || '', 'vi')
    }
    return new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
  })
}

export async function getFavoriteById(id) {
  return getByIdFromStore('favorites', id)
}

export async function saveFavorite(place) {
  if (!place || !place.name?.trim()) {
    throw new Error('Vui lòng nhập tên địa điểm.')
  }
  const lat = Number(place.lat)
  const lng = Number(place.lng)
  if (!isValidCoordinates({ lat, lng })) {
    throw new Error('Tọa độ địa điểm không hợp lệ.')
  }

  const now = new Date().toISOString()
  const existing = place.id ? await getFavoriteById(place.id) : null

  const item = {
    id: place.id || `fav_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: place.name.trim(),
    lat,
    lng,
    street_name: place.street_name?.trim() || null,
    ward_id: place.ward_id || null,
    ward_name: place.ward_name || null,
    road_id: place.road_id || null,
    notes: place.notes?.trim() || '',
    created_at: existing?.created_at || place.created_at || now,
    updated_at: now,
  }

  return putToStore('favorites', item)
}

export async function deleteFavorite(id) {
  return deleteFromStore('favorites', id)
}

export async function searchFavorites(query) {
  const items = await getAllFromStore('favorites')
  const normQuery = normalizeVietnamese(query)
  if (!normQuery) return items

  return items.filter((f) => {
    const normName = normalizeVietnamese(f.name)
    const normStreet = normalizeVietnamese(f.street_name || '')
    const normWard = normalizeVietnamese(f.ward_name || '')
    const normNotes = normalizeVietnamese(f.notes || '')
    return (
      normName.includes(normQuery) ||
      normStreet.includes(normQuery) ||
      normWard.includes(normQuery) ||
      normNotes.includes(normQuery)
    )
  })
}

// ==========================================================================
// Notes Service
// ==========================================================================
export async function getNotes(targetType = null, targetId = null) {
  const items = await getAllFromStore('notes')
  let filtered = items
  if (targetType) {
    filtered = filtered.filter((n) => n.target_type === targetType)
  }
  if (targetId) {
    filtered = filtered.filter((n) => n.target_id === targetId)
  }
  return filtered.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
}

export async function getNoteById(id) {
  return getByIdFromStore('notes', id)
}

export async function saveNote(note) {
  if (!note || !note.title?.trim()) {
    throw new Error('Vui lòng nhập tiêu đề ghi chú.')
  }

  const now = new Date().toISOString()
  const existing = note.id ? await getNoteById(note.id) : null

  const tags = Array.isArray(note.tags)
    ? note.tags.map((t) => t.trim().toLowerCase()).filter(Boolean)
    : []

  const item = {
    id: note.id || `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: note.title.trim(),
    content: note.content?.trim() || '',
    target_type: note.target_type || 'general',
    target_id: note.target_id || null,
    target_name: note.target_name?.trim() || null,
    tags,
    created_at: existing?.created_at || note.created_at || now,
    updated_at: now,
  }

  return putToStore('notes', item)
}

export async function deleteNote(id) {
  return deleteFromStore('notes', id)
}

export async function searchNotes(query, filterTag = null) {
  const items = await getAllFromStore('notes')
  const normQuery = normalizeVietnamese(query)

  return items.filter((n) => {
    if (filterTag && (!n.tags || !n.tags.includes(filterTag.toLowerCase()))) {
      return false
    }
    if (!normQuery) return true

    const normTitle = normalizeVietnamese(n.title)
    const normContent = normalizeVietnamese(n.content)
    const normTargetName = normalizeVietnamese(n.target_name || '')
    const tagsMatch = n.tags && n.tags.some((t) => normalizeVietnamese(t).includes(normQuery))

    return normTitle.includes(normQuery) || normContent.includes(normQuery) || normTargetName.includes(normQuery) || tagsMatch
  })
}

// ==========================================================================
// Search History Service
// ==========================================================================
export async function getSearchHistory(limit = 50) {
  const items = await getAllFromStore('search_history')
  items.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
  return items.slice(0, limit)
}

export async function addSearchHistory(entry, isEnabled = true) {
  if (!isEnabled) return null
  if (!entry || !entry.query?.trim()) return null

  const now = new Date().toISOString()
  const item = {
    id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    query: entry.query.trim(),
    selected_result: entry.selected_result || null,
    coordinates: entry.coordinates && isValidCoordinates(entry.coordinates) ? entry.coordinates : null,
    timestamp: now,
  }

  await putToStore('search_history', item)

  // Prune history to max 50 items
  const all = await getAllFromStore('search_history')
  if (all.length > 50) {
    all.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
    const toRemove = all.slice(50)
    for (const r of toRemove) {
      await deleteFromStore('search_history', r.id)
    }
  }

  return item
}

export async function deleteSearchHistoryItem(id) {
  return deleteFromStore('search_history', id)
}

export async function clearAllSearchHistory() {
  return clearStore('search_history')
}

// ==========================================================================
// Backup & Export / Import
// ==========================================================================
export async function exportBackup(extraSettings = {}) {
  const [favorites, notes, searchHistory] = await Promise.all([
    getAllFromStore('favorites'),
    getAllFromStore('notes'),
    getAllFromStore('search_history'),
  ])

  return {
    app_name: 'CanTho Ship Map',
    schema_version: 1,
    exported_at: new Date().toISOString(),
    data: {
      favorites,
      notes,
      search_history: searchHistory,
      settings: extraSettings,
    },
  }
}

export function validateBackup(backup) {
  const errors = []
  if (!backup || typeof backup !== 'object') {
    return { valid: false, errors: ['Tệp sao lưu không đúng định dạng JSON object.'], summary: null }
  }

  if (backup.app_name !== 'CanTho Ship Map') {
    errors.push('Tệp sao lưu không thuộc ứng dụng CanTho Ship Map.')
  }

  if (backup.schema_version !== 1) {
    errors.push(`Phiên bản schema ${backup.schema_version} không được hỗ trợ.`)
  }

  const data = backup.data || {}

  if (!Array.isArray(data.favorites)) {
    errors.push('Dữ liệu địa điểm yêu thích không đúng định dạng mảng.')
  } else {
    for (const [idx, f] of data.favorites.entries()) {
      if (!f.id || !f.name) {
        errors.push(`Địa điểm thứ ${idx + 1} thiếu ID hoặc tên.`)
      }
      if (!isValidCoordinates({ lat: f.lat, lng: f.lng })) {
        errors.push(`Địa điểm "${f.name || idx + 1}" có tọa độ không hợp lệ: [${f.lat}, ${f.lng}].`)
      }
    }
  }

  if (!Array.isArray(data.notes)) {
    errors.push('Dữ liệu ghi chú không đúng định dạng mảng.')
  } else {
    for (const [idx, n] of data.notes.entries()) {
      if (!n.id || !n.title) {
        errors.push(`Ghi chú thứ ${idx + 1} thiếu ID hoặc tiêu đề.`)
      }
    }
  }

  if (!Array.isArray(data.search_history)) {
    errors.push('Dữ liệu lịch sử tìm kiếm không đúng định dạng mảng.')
  }

  const summary = {
    favoritesCount: Array.isArray(data.favorites) ? data.favorites.length : 0,
    notesCount: Array.isArray(data.notes) ? data.notes.length : 0,
    historyCount: Array.isArray(data.search_history) ? data.search_history.length : 0,
    exportedAt: backup.exported_at || null,
  }

  return {
    valid: errors.length === 0,
    errors,
    summary,
  }
}

export async function importBackup(backup, { mode = 'merge' } = {}) {
  const validation = validateBackup(backup)
  if (!validation.valid) {
    throw new Error(`Tệp sao lưu không hợp lệ: ${validation.errors.join('; ')}`)
  }

  const { favorites = [], notes = [], search_history = [] } = backup.data || {}

  const [existingFavs, existingNotes, existingHist] = await Promise.all([
    getAllFromStore('favorites'),
    getAllFromStore('notes'),
    getAllFromStore('search_history'),
  ])

  const existingFavIds = new Set(existingFavs.map((f) => f.id))
  const existingNoteIds = new Set(existingNotes.map((n) => n.id))
  const existingHistIds = new Set(existingHist.map((h) => h.id))

  let importedFavorites = 0
  let importedNotes = 0
  let importedHistory = 0
  let skippedCount = 0

  // Import Favorites
  for (const item of favorites) {
    let toSave = item
    if (existingFavIds.has(item.id)) {
      if (mode === 'merge') {
        // Do not silently overwrite: create a differentiated ID or merge safely
        const existing = existingFavs.find((f) => f.id === item.id)
        if (existing && existing.updated_at >= item.updated_at) {
          // If existing is newer or same, assign unique ID so both are preserved without loss
          toSave = {
            ...item,
            id: `fav_imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: `${item.name} (sao lưu)`,
          }
        }
      } else if (mode === 'skip') {
        skippedCount++
        continue
      }
    }
    await putToStore('favorites', toSave)
    importedFavorites++
  }

  // Import Notes
  for (const item of notes) {
    let toSave = item
    if (existingNoteIds.has(item.id)) {
      if (mode === 'merge') {
        const existing = existingNotes.find((n) => n.id === item.id)
        if (existing && existing.updated_at >= item.updated_at) {
          toSave = {
            ...item,
            id: `note_imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            title: `${item.title} (sao lưu)`,
          }
        }
      } else if (mode === 'skip') {
        skippedCount++
        continue
      }
    }
    await putToStore('notes', toSave)
    importedNotes++
  }

  // Import History
  for (const item of search_history) {
    if (existingHistIds.has(item.id)) {
      if (mode === 'skip') {
        skippedCount++
        continue
      }
      item.id = `hist_imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    }
    await putToStore('search_history', item)
    importedHistory++
  }

  return {
    importedFavorites,
    importedNotes,
    importedHistory,
    skippedCount,
    summary: validation.summary,
  }
}
