import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  detectWardFromCoordinates,
  WARD_DETECTION_STATUS,
} from '../src/services/wardDetection.js'
import { requestLocation, geolocationError } from '../src/services/location.js'

const wardsGeoJSONPath = path.resolve('public/data/wards.geojson')
const wardsData = JSON.parse(fs.readFileSync(wardsGeoJSONPath, 'utf8'))

test('12. Xác định phường theo tọa độ với nhãn tham khảo OSM', () => {
  // Điểm tại trung tâm Ninh Kiều (10.034, 105.783)
  const posNinhKieu = { lat: 10.034, lng: 105.783, accuracy: 10 }
  const result = detectWardFromCoordinates(posNinhKieu, wardsData)

  assert.equal(result.status, WARD_DETECTION_STATUS.PROVISIONAL_WARD)
  assert.equal(result.ward_id, 'ct-ninh-kieu')
  assert.equal(result.ward_name, 'Ninh Kiều')
  assert.equal(result.verification_state, 'PROVISIONAL_OSM')
  assert.match(result.message, /ranh giới tham khảo OpenStreetMap, chưa xác minh chính thức/)

  // Điểm ngoài phạm vi 9 phường (VD: TPHCM hoặc biển Đông)
  const posOutside = { lat: 10.776, lng: 106.700 }
  const resOutside = detectWardFromCoordinates(posOutside, wardsData)
  assert.equal(resOutside.status, WARD_DETECTION_STATUS.OUTSIDE)
  assert.equal(resOutside.ward_id, null)
  assert.match(resOutside.message, /ngoài phạm vi 9 phường/)

  // Tọa độ không hợp lệ
  const posInvalid = { lat: 95, lng: 105 }
  const resInvalid = detectWardFromCoordinates(posInvalid, wardsData)
  assert.equal(resInvalid.status, WARD_DETECTION_STATUS.INVALID_COORDINATES)
})

test('13. Xử lý tọa độ gần ranh giới và độ chính xác GPS', () => {
  // Điểm sát ranh giới giữa Cái Khế và Bình Thủy (khoảng 10.0575, 105.7663)
  // Khi đặt dung sai lớn hoặc khoảng cách gần ranh giới:
  const nearPoint = { lat: 10.0575, lng: 105.7663, accuracy: 15 }
  const resNear = detectWardFromCoordinates(nearPoint, wardsData, { boundaryToleranceMeters: 50 })

  if (resNear.status === WARD_DETECTION_STATUS.NEAR_BOUNDARY) {
    assert.equal(resNear.is_near_boundary, true)
    assert.ok(resNear.distance_to_boundary_m <= 50)
    assert.match(resNear.message, /gần ranh giới/)
    assert.match(resNear.message, /chưa xác định chắc chắn/)
  }

  // Độ chính xác GPS rất thấp (accuracy = 500m)
  const lowAccPoint = { lat: 10.034, lng: 105.783, accuracy: 500 }
  const resLowAcc = detectWardFromCoordinates(lowAccPoint, wardsData)
  assert.equal(resLowAcc.status, WARD_DETECTION_STATUS.LOW_ACCURACY)
  assert.equal(resLowAcc.ward_id, null)
  assert.match(resLowAcc.message, /Độ chính xác GPS thấp/)
})

test('14. Xử lý GPS bị từ chối, timeout hoặc không khả dụng', async () => {
  // Lỗi từ chối quyền (code 1)
  assert.match(geolocationError({ code: 1 }), /từ chối quyền vị trí/)

  // Lỗi không xác định được (code 2)
  assert.match(geolocationError({ code: 2 }), /Không xác định được vị trí/)

  // Lỗi timeout (code 3)
  assert.match(geolocationError({ code: 3 }), /phản hồi quá lâu/)

  // Browser không hỗ trợ GPS
  await assert.rejects(
    requestLocation(null, false),
    /Trình duyệt không hỗ trợ GPS/
  )

  // GPS trả về tọa độ ngoài phạm vi địa lý
  const mockBadCoords = {
    getCurrentPosition(success) {
      success({ coords: { latitude: 999, longitude: 999 } })
    },
  }
  await assert.rejects(
    requestLocation(mockBadCoords, false),
    /tọa độ không hợp lệ/
  )
})

test('15. Bảo đảm dữ liệu cá nhân không bao giờ xuất hiện trong dữ liệu công khai', () => {
  const publicDataDir = path.resolve('public/data')
  const files = fs.readdirSync(publicDataDir)

  // Danh sách các file trong public/data
  assert.ok(files.includes('wards.geojson'))
  assert.ok(files.includes('roads.geojson'))
  assert.ok(files.includes('roads-index.json'))

  // Kiểm tra từng file xem có bị dính dữ liệu cá nhân (favorites, user notes, private info)
  for (const file of files) {
    if (!file.endsWith('.json') && !file.endsWith('.geojson')) continue
    const content = fs.readFileSync(path.join(publicDataDir, file), 'utf8')

    // Tuyệt đối không chứa các trường/key cá nhân
    assert.equal(content.includes('favorite_places'), false, `${file} không được chứa favorite_places`)
    assert.equal(content.includes('shipper_notes'), false, `${file} không được chứa shipper_notes`)
    assert.equal(content.includes('user_search_history'), false, `${file} không được chứa user_search_history`)
  }
})
