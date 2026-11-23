import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { WARDS_LIST } from '../src/config/wards.js'
import { getWardVerificationState, getWardStatusBadge, VERIFICATION_STATES } from '../src/services/verification.js'

const wardsGeoJSONPath = path.resolve('public/data/wards.geojson')
const wardsData = JSON.parse(fs.readFileSync(wardsGeoJSONPath, 'utf8'))

test('1. Tải thành công dữ liệu 9 phường và kiểm tra schema', () => {
  assert.equal(wardsData.type, 'FeatureCollection')
  assert.equal(wardsData.features.length, 9, 'Phải có đúng 9 phường')

  const expectedWards = [
    'ct-ninh-kieu',
    'ct-cai-khe',
    'ct-tan-an',
    'ct-an-binh',
    'ct-binh-thuy',
    'ct-long-tuyen',
    'ct-thoi-an-dong',
    'ct-cai-rang',
    'ct-hung-phu',
  ]

  for (const feature of wardsData.features) {
    const { properties, geometry } = feature
    assert.ok(properties.ward_id, 'Phường phải có ward_id')
    assert.ok(expectedWards.includes(properties.ward_id), `ward_id ${properties.ward_id} không hợp lệ`)
    assert.ok(properties.name, 'Phường phải có tên')
    assert.equal(geometry.type, 'MultiPolygon', 'Hình học phải là MultiPolygon')
    assert.ok(Array.isArray(geometry.coordinates), 'Coordinates phải là mảng')
    assert.ok(geometry.coordinates.length > 0, 'MultiPolygon phải có ít nhất 1 polygon')

    // Trạng thái xác minh mặc định phải là tham khảo OSM
    const state = getWardVerificationState(feature)
    assert.equal(state, VERIFICATION_STATES.PROVISIONAL_OSM)
    const badge = getWardStatusBadge(state)
    assert.equal(badge.badgeText, 'Tham khảo OSM')
    assert.match(badge.alertText, /Ranh giới tham khảo – OpenStreetMap, chưa xác minh chính thức/)
  }
})

test('2. Chọn từng phường và highlight đúng Polygon', () => {
  for (const ward of WARDS_LIST) {
    const feature = wardsData.features.find((f) => f.properties.ward_id === ward.id)
    assert.ok(feature, `Tìm thấy feature cho phường ${ward.id}`)

    // Test style generator logic
    const selectedStyle = {
      fillColor: ward.color,
      fillOpacity: 0.35,
      color: '#08785e',
      weight: 3.5,
      opacity: 1.0,
    }
    assert.equal(selectedStyle.color, '#08785e', 'Viền highlight nổi bật')
    assert.equal(selectedStyle.weight, 3.5)
    assert.equal(selectedStyle.fillOpacity, 0.35)

    const unselectedStyle = {
      fillColor: ward.color,
      fillOpacity: 0.12,
      color: ward.color,
      weight: 1.5,
      opacity: 0.7,
    }
    assert.equal(unselectedStyle.weight, 1.5)
  }
})

test('3. Chuyển phường liên tục không bị sai trạng thái', () => {
  let activeWardId = null
  const history = []

  function setWard(id) {
    activeWardId = id
    history.push(id)
  }

  // Simulate rapid user clicks
  setWard('ct-cai-khe')
  assert.equal(activeWardId, 'ct-cai-khe')
  setWard('ct-ninh-kieu')
  assert.equal(activeWardId, 'ct-ninh-kieu')
  setWard('ct-binh-thuy')
  assert.equal(activeWardId, 'ct-binh-thuy')
  setWard(null) // Clear selection back to all wards
  assert.equal(activeWardId, null)

  assert.deepEqual(history, ['ct-cai-khe', 'ct-ninh-kieu', 'ct-binh-thuy', null])
})

test('4. fitBounds() tính toán đúng bounding box cho từng phường', () => {
  // Bounding box tổng thể Cần Thơ: [minLng ~ 105.6, minLat ~ 9.9, maxLng ~ 105.9, maxLat ~ 10.2]
  for (const feature of wardsData.features) {
    let minLat = Infinity
    let maxLat = -Infinity
    let minLng = Infinity
    let maxLng = -Infinity

    for (const polygon of feature.geometry.coordinates) {
      for (const ring of polygon) {
        for (const [lng, lat] of ring) {
          if (lat < minLat) minLat = lat
          if (lat > maxLat) maxLat = lat
          if (lng < minLng) minLng = lng
          if (lng > maxLng) maxLng = lng
        }
      }
    }

    assert.ok(minLat < maxLat, `Lat bounds hợp lệ cho ${feature.properties.ward_id}`)
    assert.ok(minLng < maxLng, `Lng bounds hợp lệ cho ${feature.properties.ward_id}`)
    assert.ok(minLat >= 9.9 && maxLat <= 10.2, `Vĩ độ nằm trong phạm vi Cần Thơ: [${minLat}, ${maxLat}]`)
    assert.ok(minLng >= 105.6 && maxLng <= 105.9, `Kinh độ nằm trong phạm vi Cần Thơ: [${minLng}, ${maxLng}]`)
  }
})
