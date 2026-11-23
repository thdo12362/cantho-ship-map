import { isValidCoordinates } from './location.js'

function pointInRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

function pointInMultiPolygon(x, y, multiPoly) {
  for (const poly of multiPoly) {
    if (pointInRing(x, y, poly[0])) {
      let inHole = false
      for (let h = 1; h < poly.length; h++) {
        if (pointInRing(x, y, poly[h])) {
          inHole = true
          break
        }
      }
      if (!inHole) return true
    }
  }
  return false
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const avgLat = ((py + y1 + y2) / 3) * (Math.PI / 180)
  const kx = 111139 * Math.cos(avgLat)
  const ky = 111139

  const dx = (x2 - x1) * kx
  const dy = (y2 - y1) * ky
  const lenSq = dx * dx + dy * dy

  if (lenSq === 0) {
    const px_dist = (px - x1) * kx
    const py_dist = (py - y1) * ky
    return Math.sqrt(px_dist * px_dist + py_dist * py_dist)
  }

  const p_dx = (px - x1) * kx
  const p_dy = (py - y1) * ky
  const t = Math.max(0, Math.min(1, (p_dx * dx + p_dy * dy) / lenSq))

  const projX = x1 * kx + t * dx
  const projY = y1 * ky + t * dy
  const curX = px * kx
  const curY = py * ky

  const diffX = curX - projX
  const diffY = curY - projY
  return Math.sqrt(diffX * diffX + diffY * diffY)
}

function minDistanceToMultiPolygonBoundary(px, py, multiPoly) {
  let minDist = Infinity
  for (const poly of multiPoly) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const d = pointToSegmentDistance(px, py, ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1])
        if (d < minDist) minDist = d
      }
    }
  }
  return minDist
}

export const WARD_DETECTION_STATUS = {
  PROVISIONAL_WARD: 'PROVISIONAL_WARD',
  NEAR_BOUNDARY: 'NEAR_BOUNDARY',
  LOW_ACCURACY: 'LOW_ACCURACY',
  OUTSIDE: 'OUTSIDE',
  AMBIGUOUS_OVERLAP: 'AMBIGUOUS_OVERLAP',
  INVALID_COORDINATES: 'INVALID_COORDINATES',
}

export function detectWardFromCoordinates(position, wardsGeoJSON, options = {}) {
  if (!isValidCoordinates(position)) {
    return {
      status: WARD_DETECTION_STATUS.INVALID_COORDINATES,
      ward_id: null,
      ward_name: null,
      message: 'Tọa độ vị trí không hợp lệ.',
      verification_state: 'UNVERIFIED',
    }
  }

  const { lat, lng, accuracy } = position
  const boundaryToleranceMeters = options.boundaryToleranceMeters ?? 25

  if (Number.isFinite(accuracy) && accuracy > 200) {
    return {
      status: WARD_DETECTION_STATUS.LOW_ACCURACY,
      ward_id: null,
      ward_name: null,
      accuracy: Math.round(accuracy),
      message: `Độ chính xác GPS thấp (khoảng ±${Math.round(accuracy)} m), chưa đủ căn cứ xác định phường.`,
      verification_state: 'UNVERIFIED',
    }
  }

  if (!wardsGeoJSON || !Array.isArray(wardsGeoJSON.features)) {
    return {
      status: WARD_DETECTION_STATUS.OUTSIDE,
      ward_id: null,
      ward_name: null,
      message: 'Chưa có dữ liệu ranh giới phường.',
      verification_state: 'UNVERIFIED',
    }
  }

  const matchingWards = []

  for (const feature of wardsGeoJSON.features) {
    if (!feature.geometry || feature.geometry.type !== 'MultiPolygon') continue
    const isInside = pointInMultiPolygon(lng, lat, feature.geometry.coordinates)
    if (isInside) {
      const dist = minDistanceToMultiPolygonBoundary(lng, lat, feature.geometry.coordinates)
      matchingWards.push({
        feature,
        ward_id: feature.properties.ward_id,
        ward_name: feature.properties.name,
        distance_to_boundary_m: Math.round(dist),
      })
    }
  }

  if (matchingWards.length === 0) {
    return {
      status: WARD_DETECTION_STATUS.OUTSIDE,
      ward_id: null,
      ward_name: null,
      message: 'Vị trí nằm ngoài phạm vi 9 phường tham khảo Cần Thơ.',
      verification_state: 'UNVERIFIED',
    }
  }

  if (matchingWards.length > 1) {
    return {
      status: WARD_DETECTION_STATUS.AMBIGUOUS_OVERLAP,
      ward_id: null,
      ward_name: null,
      matching_wards: matchingWards.map((w) => w.ward_name),
      message: 'Vị trí rơi vào vùng chồng lấn giữa các polygon tham khảo.',
      verification_state: 'UNVERIFIED',
    }
  }

  const match = matchingWards[0]
  const effectiveTolerance = Math.max(boundaryToleranceMeters, Number.isFinite(accuracy) ? accuracy : 0)

  if (match.distance_to_boundary_m <= effectiveTolerance) {
    return {
      status: WARD_DETECTION_STATUS.NEAR_BOUNDARY,
      ward_id: match.ward_id,
      ward_name: match.ward_name,
      distance_to_boundary_m: match.distance_to_boundary_m,
      message: `Vị trí gần ranh giới Phường ${match.ward_name} (cách ranh khoảng ${match.distance_to_boundary_m} m theo OSM), chưa xác định chắc chắn.`,
      verification_state: 'PROVISIONAL_OSM',
      is_near_boundary: true,
    }
  }

  return {
    status: WARD_DETECTION_STATUS.PROVISIONAL_WARD,
    ward_id: match.ward_id,
    ward_name: match.ward_name,
    distance_to_boundary_m: match.distance_to_boundary_m,
    message: `Ước tính thuộc Phường ${match.ward_name} (theo ranh giới tham khảo OpenStreetMap, chưa xác minh chính thức).`,
    verification_state: 'PROVISIONAL_OSM',
    is_near_boundary: false,
  }
}
