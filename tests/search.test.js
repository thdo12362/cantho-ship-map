import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { searchRoads, buildWardLookup } from '../src/services/roads.js'
import { normalizeVietnamese } from '../src/services/text.js'

const roadsIndexPath = path.resolve('public/data/roads-index.json')
const roadsIndex = JSON.parse(fs.readFileSync(roadsIndexPath, 'utf8'))

const auditPath = path.resolve('public/data/ambiguous-segments-audit.json')
const ambiguousData = JSON.parse(fs.readFileSync(auditPath, 'utf8'))
const ambiguousSet = new Set(ambiguousData.segments.map((s) => s.road_id))

const wardsData = JSON.parse(fs.readFileSync(path.resolve('public/data/wards.geojson'), 'utf8'))
const wardLookup = buildWardLookup(wardsData)

test('6. Tìm kiếm đường phố có dấu và không dấu (Võ Văn Kiệt / vo van kiet, Phạm Ngọc Hưng / pham ngoc hung)', () => {
  // Test 6.1: Võ Văn Kiệt vs vo van kiet
  const resAccented = searchRoads('Võ Văn Kiệt', { roadsIndex, ambiguousSet, wardLookup, limit: 50 })
  const resUnaccented = searchRoads('vo van kiet', { roadsIndex, ambiguousSet, wardLookup, limit: 50 })

  assert.ok(resAccented.length > 0, 'Phải tìm thấy đường Võ Văn Kiệt')
  assert.equal(resAccented.length, resUnaccented.length, 'Tìm kiếm có dấu và không dấu phải trả về cùng số lượng')

  const idsAccented = resAccented.map((r) => r.road_id).sort()
  const idsUnaccented = resUnaccented.map((r) => r.road_id).sort()
  assert.deepEqual(idsAccented, idsUnaccented, 'Cùng tập hợp road_id cho có dấu và không dấu')

  // Test 6.2: Phạm Ngọc Hưng vs pham ngoc hung
  const resPhamAccented = searchRoads('Phạm Ngọc Hưng', { roadsIndex, ambiguousSet, wardLookup, limit: 50 })
  const resPhamUnaccented = searchRoads('pham ngoc hung', { roadsIndex, ambiguousSet, wardLookup, limit: 50 })

  assert.ok(resPhamAccented.length > 0, 'Phải tìm thấy đường Phạm Ngọc Hưng')
  assert.equal(resPhamAccented.length, resPhamUnaccented.length)

  // Test 6.3: Tìm kiếm một phần tên đường (Substring)
  const resPartial = searchRoads('Ngọc Hưng', { roadsIndex, ambiguousSet, wardLookup, limit: 50 })
  assert.ok(resPartial.length > 0, 'Tìm kiếm một phần "Ngọc Hưng" phải ra kết quả')
  assert.ok(resPartial.some((r) => r.name.includes('Phạm Ngọc Hưng')))

  // Test 6.4: Tìm kiếm có giới hạn theo phường đang chọn (Scoped search)
  const resCaiKheOnly = searchRoads('vo van kiet', {
    wardId: 'ct-cai-khe',
    roadsIndex,
    ambiguousSet,
    wardLookup,
    limit: 50,
  })
  assert.ok(resCaiKheOnly.length > 0, 'Phải có đoạn Võ Văn Kiệt liên quan đến Cái Khế')
  assert.ok(
    resCaiKheOnly.length < resUnaccented.length,
    'Số kết quả trong phường phải ít hơn hoặc bằng toàn bộ 9 phường'
  )
  for (const road of resCaiKheOnly) {
    assert.ok(road.candidate_ward_ids.includes('ct-cai-khe'))
  }
})

test('7. Kết quả trùng tên được phân biệt rõ ràng bằng thông tin vị trí / phường liên quan', () => {
  // Đường "Võ Văn Kiệt" có nhiều đoạn thuộc các phường khác nhau
  const results = searchRoads('Võ Văn Kiệt', { roadsIndex, ambiguousSet, wardLookup, limit: 30 })

  assert.ok(results.length > 1, 'Có nhiều đoạn đường mang tên Võ Văn Kiệt')

  // Kiểm tra mỗi kết quả đều có wardNames và roadTypeDesc để phân biệt
  const wardSets = new Set()
  for (const road of results) {
    assert.ok(road.wardNames && road.wardNames.length > 0, 'Mỗi kết quả phải có thông tin phường liên quan')
    assert.ok(road.roadTypeDesc, 'Mỗi kết quả phải có phân loại loại đường')
    assert.ok(road.road_id, 'Mỗi kết quả phải có ID định danh riêng')
    wardSets.add(road.wardNames.join(', '))
  }

  // Phải có ít nhất 2 cụm phường khác nhau trong các kết quả trùng tên
  assert.ok(wardSets.size > 1, 'Các kết quả trùng tên trải qua các cụm phường khác nhau để phân biệt')

  // Không tự chọn duy nhất 1 kết quả khi tìm kiếm có nhiều kết quả
  assert.notEqual(results.length, 1)
})
