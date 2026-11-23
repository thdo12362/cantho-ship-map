export function normalizeVietnamese(str) {
  if (!str || typeof str !== 'string') return ''
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

export function formatRoadType(roadType, highway) {
  switch (roadType) {
    case 'named_alley':
      return 'Hẻm'
    case 'unnamed_alley':
      return 'Hẻm chưa đặt tên'
    case 'service_road':
      return 'Đường nội bộ / dịch vụ'
    case 'unnamed_branch':
      return 'Nhánh đường'
    case 'unnamed_road':
      return 'Đường chưa đặt tên'
    case 'named_road':
    default:
      if (highway === 'primary' || highway === 'trunk' || highway === 'motorway') {
        return 'Đường trục chính'
      }
      if (highway === 'secondary') {
        return 'Đường chính'
      }
      if (highway === 'tertiary') {
        return 'Đường liên khu'
      }
      if (highway === 'residential') {
        return 'Đường dân sinh'
      }
      return 'Tuyến đường'
  }
}

export function formatRoadDisplayName(road) {
  if (!road) return 'Tuyến đường'
  if (road.name && road.name.trim()) return road.name.trim()
  return formatRoadType(road.road_type, road.highway)
}
