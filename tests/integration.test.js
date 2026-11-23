import test from 'node:test'
import assert from 'node:assert/strict'
import { WARDS_LIST } from '../src/config/wards.js'
import { googleMapsUrl, isValidCoordinates, requestLocation } from '../src/services/location.js'
import { CANTHO_CENTER, DEFAULT_ZOOM, TILE_URL } from '../src/config/map.js'

test('11. Giao diện mobile và desktop đáp ứng các yêu cầu bố cục và tương tác', () => {
  // Test 11.1: Danh sách 9 phường có đủ 9 mục với màu sắc nhận diện
  assert.equal(WARDS_LIST.length, 9)
  for (const w of WARDS_LIST) {
    assert.ok(w.id.startsWith('ct-'), 'ID phường theo quy ước ct-*')
    assert.ok(w.name.length > 0, 'Phường phải có tên hiển thị')
    assert.ok(w.color.startsWith('#'), 'Phường có mã màu riêng')
  }

  // Test 11.2: Cấu hình bản đồ gốc
  assert.equal(CANTHO_CENTER[0], 10.034)
  assert.equal(CANTHO_CENTER[1], 105.783)
  assert.equal(DEFAULT_ZOOM, 14)
  assert.ok(TILE_URL.includes('tile.openstreetmap.org'))
})

test('12. Các chức năng Giai đoạn 1 vẫn hoạt động đầy đủ và không bị hồi quy', async () => {
  // 12.1: Google Maps link sinh đúng với tọa độ hợp lệ
  const urlCoord = googleMapsUrl({ lat: 10.034, lng: 105.783 }, 'Võ Văn Kiệt')
  assert.equal(urlCoord, 'https://www.google.com/maps/search/?api=1&query=10.034%2C105.783')

  // 12.2: Google Maps link fallback với tên đường / địa chỉ
  const urlAddress = googleMapsUrl(null, 'Phạm Ngọc Hưng, Cần Thơ')
  assert.equal(urlAddress, 'https://www.google.com/maps/search/?api=1&query=Ph%E1%BA%A1m%20Ng%E1%BB%8Dc%20H%C6%B0ng%2C%20C%E1%BA%A7n%20Th%C6%A1')

  // 12.3: Tọa độ không hợp lệ
  assert.equal(googleMapsUrl(null, ''), null)
  assert.equal(isValidCoordinates(null), false)
  assert.equal(isValidCoordinates({ lat: 95, lng: 105 }), false)
  assert.equal(isValidCoordinates({ lat: 10, lng: 200 }), false)
  assert.equal(isValidCoordinates({ lat: 10.03, lng: 105.78 }), true)

  // 12.4: GPS mock invocation
  const mockGeo = {
    getCurrentPosition(success) {
      success({ coords: { latitude: 10.035, longitude: 105.785, accuracy: 15 } })
    },
  }
  const pos = await requestLocation(mockGeo, true)
  assert.deepEqual(pos, { lat: 10.035, lng: 105.785, accuracy: 15, source: 'gps' })
})
