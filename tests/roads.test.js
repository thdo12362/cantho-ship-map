import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { filterRoadsByWard, getRoadMidpoint, buildWardLookup } from '../src/services/roads.js'
import { normalizeVietnamese, formatRoadDisplayName, formatRoadType } from '../src/services/text.js'
import {
  getWardVerificationState,
  getWardStatusBadge,
  getRoadVerificationBadge,
  VERIFICATION_STATES,
} from '../src/services/verification.js'

const roadsIndexPath = path.resolve('public/data/roads-index.json')
const roadsIndex = JSON.parse(fs.readFileSync(roadsIndexPath, 'utf8'))

const auditPath = path.resolve('public/data/ambiguous-segments-audit.json')
const ambiguousData = JSON.parse(fs.readFileSync(auditPath, 'utf8'))
const ambiguousSet = new Set(ambiguousData.segments.map((s) => s.road_id))

const wardsData = JSON.parse(fs.readFileSync(path.resolve('public/data/wards.geojson'), 'utf8'))
const wardLookup = buildWardLookup(wardsData)

test('5. Lọc danh sách đường theo dữ liệu hiện có (phường Cái Khế)', () => {
  const result = filterRoadsByWard('ct-cai-khe', roadsIndex, ambiguousSet, wardLookup)
  assert.equal(result.total, 590, 'Cái Khế phải có đúng 590 đường liên quan theo dữ liệu Giai đoạn 2')
  assert.ok(result.sole.length > 0, 'Phải có đường nằm trọn trong phường')
  assert.equal(result.sole.length, 493, 'Cái Khế có 493 đường thuần túy trong nội vùng OSM')
  assert.equal(result.ambiguous.length, 97, 'Cái Khế có 97 đường thuộc nhóm ranh giới mơ hồ / chưa xác minh')

  // Mọi đường trong sole chỉ có candidate là ct-cai-khe và không nằm trong ambiguousSet
  for (const road of result.sole) {
    assert.deepEqual(road.candidate_ward_ids, ['ct-cai-khe'])
    assert.equal(ambiguousSet.has(road.road_id), false)
  }
})

test('8. Đường đi qua nhiều phường không bị gán sai vào duy nhất một phường', () => {
  // Tìm các đường đi qua nhiều phường (candidate_ward_ids.length > 1)
  const multiWardRoads = roadsIndex.entries.filter(
    (e) => e.candidate_ward_ids && e.candidate_ward_ids.length > 1
  )
  assert.equal(multiWardRoads.length, 306, 'Phải có 306 đường đi qua nhiều phường')

  for (const road of multiWardRoads) {
    const badge = getRoadVerificationBadge(road, ambiguousSet)
    assert.equal(
      badge.state,
      VERIFICATION_STATES.UNVERIFIED,
      `Đường ${road.road_id} đi qua nhiều phường phải ở trạng thái UNVERIFIED`
    )
    assert.equal(badge.badgeText, 'Qua nhiều phường')
    assert.match(badge.alertText, /đi qua nhiều phường/)

    // Kiểm tra rằng đường này có nhiều hơn 1 candidate ward
    assert.ok(road.candidate_ward_ids.length > 1)
  }
})

test('9. Đoạn chưa xác minh không bị hiển thị là đã xác minh', () => {
  // Kiểm tra 426 đoạn / 391 road trong ambiguous-segments-audit
  assert.equal(ambiguousData.segments.length, 426)

  for (const segment of ambiguousData.segments) {
    assert.equal(segment.verification_state, 'UNVERIFIED')
    assert.equal(segment.ward_id, null, 'ward_id chính thức phải là null')

    const roadEntry = roadsIndex.entries.find((e) => e.road_id === segment.road_id)
    if (roadEntry) {
      const badge = getRoadVerificationBadge(roadEntry, ambiguousSet)
      assert.notEqual(badge.state, VERIFICATION_STATES.VERIFIED_OFFICIAL)
      assert.ok(
        badge.state === VERIFICATION_STATES.UNVERIFIED || badge.state === VERIFICATION_STATES.PROVISIONAL_OSM
      )
    }
  }

  // Kiểm tra badge và thông điệp cảnh báo cho phường OSM
  for (const ward of wardsData.features) {
    const state = getWardVerificationState(ward)
    assert.notEqual(state, VERIFICATION_STATES.VERIFIED_OFFICIAL)
    const badge = getWardStatusBadge(state)
    assert.match(badge.alertText, /chưa xác minh chính thức/)
  }
})

test('10. Xử lý dữ liệu thiếu hoặc geometry lỗi an toàn (Fault Tolerance)', () => {
  // Midpoint with null or invalid geometries
  assert.equal(getRoadMidpoint(null), null)
  assert.equal(getRoadMidpoint({}), null)
  assert.equal(getRoadMidpoint({ geometry: null }), null)
  assert.equal(getRoadMidpoint({ geometry: { type: 'Point', coordinates: [105, 10] } }), null)
  assert.equal(getRoadMidpoint({ geometry: { type: 'LineString', coordinates: [] } }), null)
  assert.equal(getRoadMidpoint({ geometry: { type: 'LineString', coordinates: [[NaN, 10]] } }), null)
  assert.deepEqual(getRoadMidpoint({ geometry: { type: 'LineString', coordinates: [[105.78, 10.03]] } }), {
    lat: 10.03,
    lng: 105.78,
  })

  // Normalization with null / undefined / empty
  assert.equal(normalizeVietnamese(null), '')
  assert.equal(normalizeVietnamese(undefined), '')
  assert.equal(normalizeVietnamese(123), '')
  assert.equal(normalizeVietnamese('   '), '')

  // Format road display name
  assert.equal(formatRoadDisplayName(null), 'Tuyến đường')
  assert.equal(formatRoadDisplayName({ name: null, road_type: 'named_alley' }), 'Hẻm')
  assert.equal(formatRoadDisplayName({ name: '', road_type: 'unnamed_alley' }), 'Hẻm chưa đặt tên')
  assert.equal(formatRoadDisplayName({ name: 'Võ Văn Kiệt' }), 'Võ Văn Kiệt')

  // Road type labels
  assert.equal(formatRoadType('service_road'), 'Đường nội bộ / dịch vụ')
  assert.equal(formatRoadType('named_road', 'primary'), 'Đường trục chính')
  assert.equal(formatRoadType('named_road', 'secondary'), 'Đường chính')
  assert.equal(formatRoadType('named_road', 'residential'), 'Đường dân sinh')
})
