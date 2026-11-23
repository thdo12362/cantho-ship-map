import test from 'node:test'
import assert from 'node:assert/strict'
import {
  openDatabase,
  resetMemoryStoreForTesting,
  saveFavorite,
  getFavorites,
  getFavoriteById,
  deleteFavorite,
  searchFavorites,
  saveNote,
  getNotes,
  getNoteById,
  deleteNote,
  searchNotes,
  addSearchHistory,
  getSearchHistory,
  deleteSearchHistoryItem,
  clearAllSearchHistory,
  exportBackup,
  validateBackup,
  importBackup,
} from '../src/services/db.js'

test.beforeEach(() => {
  resetMemoryStoreForTesting()
})

test('1. Khởi tạo cơ sở dữ liệu IndexedDB / Local Storage', async () => {
  const db = await openDatabase()
  assert.ok(db, 'Khởi tạo DB thành công')
})

test('2. Thêm, sửa và xóa địa điểm yêu thích (Favorites)', async () => {
  // Thêm mới
  const fav1 = await saveFavorite({
    name: 'Kho hàng Ba Láng',
    lat: 10.005,
    lng: 105.742,
    street_name: 'Quốc lộ 1A',
    ward_id: 'ct-cai-rang',
    ward_name: 'Cái Răng',
    notes: 'Cổng sau kho số 2',
  })

  assert.ok(fav1.id, 'Phải sinh ID')
  assert.equal(fav1.name, 'Kho hàng Ba Láng')
  assert.equal(fav1.lat, 10.005)
  assert.equal(fav1.lng, 105.742)

  // Đọc lại
  const saved = await getFavoriteById(fav1.id)
  assert.deepEqual(saved, fav1)

  // Sửa
  const updated = await saveFavorite({
    ...fav1,
    name: 'Kho hàng Ba Láng (Cổng 1)',
    notes: 'Đã đổi sang cổng 1',
  })
  assert.equal(updated.name, 'Kho hàng Ba Láng (Cổng 1)')
  assert.equal(updated.notes, 'Đã đổi sang cổng 1')
  assert.equal(updated.id, fav1.id)

  // Xóa
  const deleted = await deleteFavorite(fav1.id)
  assert.ok(deleted)
  const afterDelete = await getFavoriteById(fav1.id)
  assert.equal(afterDelete, null)
})

test('3. Lưu và chỉnh sửa ghi chú (Notes)', async () => {
  const note1 = await saveNote({
    title: 'Hẻm 54 đường 30 Tháng 4',
    content: 'Đoạn giữa hẻm có cua gắt, xe ba gác khó quay đầu.',
    target_type: 'road',
    target_name: 'Đường 30 Tháng 4',
    tags: ['hẻm nhỏ', 'khó quay đầu'],
  })

  assert.ok(note1.id)
  assert.equal(note1.title, 'Hẻm 54 đường 30 Tháng 4')
  assert.deepEqual(note1.tags, ['hẻm nhỏ', 'khó quay đầu'])

  // Chỉnh sửa
  const updated = await saveNote({
    ...note1,
    content: 'Đã gắn biển cấm xe ba gác.',
    tags: ['hẻm nhỏ', 'biển cấm'],
  })
  assert.equal(updated.content, 'Đã gắn biển cấm xe ba gác.')
  assert.deepEqual(updated.tags, ['hẻm nhỏ', 'biển cấm'])

  // Tìm kiếm theo tag
  const filtered = await searchNotes('', 'biển cấm')
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].id, note1.id)

  // Xóa
  await deleteNote(note1.id)
  const listAfter = await getNotes()
  assert.equal(listAfter.length, 0)
})

test('4. Tìm kiếm trong danh sách địa điểm đã lưu', async () => {
  await saveFavorite({
    name: 'Khách quen anh Nam',
    lat: 10.034,
    lng: 105.783,
    street_name: 'Đại lộ Hòa Bình',
    ward_name: 'Ninh Kiều',
  })

  await saveFavorite({
    name: 'Cửa hàng tiện lợi 24h',
    lat: 10.045,
    lng: 105.772,
    street_name: 'Trần Phú',
    ward_name: 'Cái Khế',
  })

  // Tìm có dấu
  const searchNam = await searchFavorites('Nam')
  assert.equal(searchNam.length, 1)
  assert.equal(searchNam[0].name, 'Khách quen anh Nam')

  // Tìm không dấu
  const searchHoaBinh = await searchFavorites('hoa binh')
  assert.equal(searchHoaBinh.length, 1)
  assert.equal(searchHoaBinh[0].street_name, 'Đại lộ Hòa Bình')

  // Tìm theo tên phường
  const searchCaiKhe = await searchFavorites('cai khe')
  assert.equal(searchCaiKhe.length, 1)
  assert.equal(searchCaiKhe[0].ward_name, 'Cái Khế')
})

test('5. Lưu, giới hạn 50 mục và xóa lịch sử tìm kiếm', async () => {
  // Thêm mục
  const item1 = await addSearchHistory({ query: 'Võ Văn Kiệt' }, true)
  assert.ok(item1.id)
  assert.equal(item1.query, 'Võ Văn Kiệt')

  let history = await getSearchHistory()
  assert.equal(history.length, 1)

  // Thêm 55 mục để kiểm tra giới hạn 50 mục
  for (let i = 0; i < 55; i++) {
    await addSearchHistory({ query: `Đường số ${i}` }, true)
  }

  history = await getSearchHistory(100)
  assert.equal(history.length, 50, 'Lịch sử phải được giới hạn tối đa 50 mục gần nhất')

  // Xóa 1 mục
  await deleteSearchHistoryItem(history[0].id)
  const afterOne = await getSearchHistory()
  assert.equal(afterOne.length, 49)

  // Xóa toàn bộ
  await clearAllSearchHistory()
  const empty = await getSearchHistory()
  assert.equal(empty.length, 0)
})

test('6. Bật/tắt lưu lịch sử tìm kiếm', async () => {
  // Khi tắt: không lưu
  const resDisabled = await addSearchHistory({ query: 'Đường Nguyễn Trãi' }, false)
  assert.equal(resDisabled, null)
  let history = await getSearchHistory()
  assert.equal(history.length, 0)

  // Khi bật: lưu bình thường
  const resEnabled = await addSearchHistory({ query: 'Đường Nguyễn Trãi' }, true)
  assert.ok(resEnabled)
  history = await getSearchHistory()
  assert.equal(history.length, 1)
})

test('7. Xuất file JSON sao lưu hợp lệ', async () => {
  await saveFavorite({
    name: 'Điểm giao 1',
    lat: 10.03,
    lng: 105.78,
  })

  await saveNote({
    title: 'Ghi chú 1',
    content: 'Nội dung 1',
  })

  await addSearchHistory({ query: 'Tân An' }, true)

  const backup = await exportBackup({ highAccuracy: true })
  assert.equal(backup.app_name, 'CanTho Ship Map')
  assert.equal(backup.schema_version, 1)
  assert.ok(backup.exported_at)
  assert.equal(backup.data.favorites.length, 1)
  assert.equal(backup.data.notes.length, 1)
  assert.equal(backup.data.search_history.length, 1)
  assert.equal(backup.data.settings.highAccuracy, true)

  const validation = validateBackup(backup)
  assert.equal(validation.valid, true)
  assert.equal(validation.errors.length, 0)
  assert.equal(validation.summary.favoritesCount, 1)
})

test('8. Nhập file JSON hợp lệ và khôi phục dữ liệu', async () => {
  const sampleBackup = {
    app_name: 'CanTho Ship Map',
    schema_version: 1,
    exported_at: '2026-11-23T12:00:00.000Z',
    data: {
      favorites: [
        {
          id: 'fav_ext_1',
          name: 'Điểm giao ngoại thành',
          lat: 10.02,
          lng: 105.76,
          updated_at: '2026-11-23T12:00:00.000Z',
        },
      ],
      notes: [
        {
          id: 'note_ext_1',
          title: 'Ghi chú cầu Rạch Súc',
          content: 'Cầu đang sửa',
          updated_at: '2026-11-23T12:00:00.000Z',
        },
      ],
      search_history: [
        {
          id: 'hist_ext_1',
          query: 'Cái Răng',
          timestamp: '2026-11-23T12:00:00.000Z',
        },
      ],
    },
  }

  const result = await importBackup(sampleBackup, { mode: 'merge' })
  assert.equal(result.importedFavorites, 1)
  assert.equal(result.importedNotes, 1)
  assert.equal(result.importedHistory, 1)

  const favs = await getFavorites()
  assert.equal(favs.length, 1)
  assert.equal(favs[0].name, 'Điểm giao ngoại thành')
})

test('9. Từ chối các file JSON không hợp lệ hoặc sai cấu trúc', async () => {
  // Sai tên ứng dụng
  const wrongApp = { app_name: 'Other Map', schema_version: 1, data: {} }
  assert.equal(validateBackup(wrongApp).valid, false)

  // Sai schema version
  const wrongVer = { app_name: 'CanTho Ship Map', schema_version: 99, data: {} }
  assert.equal(validateBackup(wrongVer).valid, false)

  // Tọa độ lat/lng ngoài phạm vi
  const invalidCoords = {
    app_name: 'CanTho Ship Map',
    schema_version: 1,
    data: {
      favorites: [{ id: 'f1', name: 'Điểm sai', lat: 100, lng: 105 }],
      notes: [],
      search_history: [],
    },
  }
  const checkCoords = validateBackup(invalidCoords)
  assert.equal(checkCoords.valid, false)
  assert.match(checkCoords.errors[0], /tọa độ không hợp lệ/)

  // Null hoặc không phải object
  assert.equal(validateBackup(null).valid, false)
  assert.equal(validateBackup('string').valid, false)
})

test('10. Xử lý bản ghi trùng lặp và không ghi đè dữ liệu âm thầm', async () => {
  // Tạo bản ghi ban đầu
  await saveFavorite({
    id: 'fav_exist',
    name: 'Khách hiện tại',
    lat: 10.034,
    lng: 105.783,
    notes: 'Ghi chú gốc của người dùng',
  })

  // File import có cùng ID nhưng nội dung khác
  const incomingBackup = {
    app_name: 'CanTho Ship Map',
    schema_version: 1,
    data: {
      favorites: [
        {
          id: 'fav_exist',
          name: 'Khách trong bản sao lưu',
          lat: 10.034,
          lng: 105.783,
          notes: 'Nội dung từ máy cũ',
          updated_at: '2026-11-23T10:00:00.000Z',
        },
      ],
      notes: [],
      search_history: [],
    },
  }

  // Khi import ở chế độ merge:
  await importBackup(incomingBackup, { mode: 'merge' })

  const allFavs = await getFavorites()
  assert.equal(allFavs.length, 2, 'Cả bản ghi hiện tại và bản sao lưu đều được bảo tồn')

  // Bản ghi gốc vẫn nguyên vẹn
  const original = allFavs.find((f) => f.id === 'fav_exist')
  assert.equal(original.name, 'Khách hiện tại')
  assert.equal(original.notes, 'Ghi chú gốc của người dùng')

  // Bản ghi imported được gán nhãn phân biệt
  const imported = allFavs.find((f) => f.id !== 'fav_exist')
  assert.match(imported.name, /sao lưu/)
})

test('11. Chế độ bỏ qua bản ghi trùng ID (Skip duplicates)', async () => {
  await saveFavorite({
    id: 'fav_keep',
    name: 'Điểm giữ nguyên',
    lat: 10.034,
    lng: 105.783,
  })

  const backupToSkip = {
    app_name: 'CanTho Ship Map',
    schema_version: 1,
    data: {
      favorites: [
        { id: 'fav_keep', name: 'Điểm muốn chép đè', lat: 10.034, lng: 105.783 },
        { id: 'fav_new', name: 'Điểm hoàn toàn mới', lat: 10.04, lng: 105.77 },
      ],
      notes: [],
      search_history: [],
    },
  }

  const res = await importBackup(backupToSkip, { mode: 'skip' })
  assert.equal(res.importedFavorites, 1)
  assert.equal(res.skippedCount, 1)

  const favs = await getFavorites()
  assert.equal(favs.length, 2)
  const kept = favs.find((f) => f.id === 'fav_keep')
  assert.equal(kept.name, 'Điểm giữ nguyên', 'Không bị ghi đè')
})
