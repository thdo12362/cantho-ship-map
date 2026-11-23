export const VERIFICATION_STATES = {
  VERIFIED_OFFICIAL: 'VERIFIED_OFFICIAL',
  PROVISIONAL_OSM: 'PROVISIONAL_OSM',
  UNVERIFIED: 'UNVERIFIED',
}

export function getWardVerificationState(wardFeature) {
  if (!wardFeature || !wardFeature.properties) return VERIFICATION_STATES.UNVERIFIED
  const status = wardFeature.properties.verification_status
  if (status === 'official_verified' || status === 'verified_official') {
    return VERIFICATION_STATES.VERIFIED_OFFICIAL
  }
  if (status === 'osm_boundary_unverified' || status === 'provisional_osm_boundary') {
    return VERIFICATION_STATES.PROVISIONAL_OSM
  }
  return VERIFICATION_STATES.PROVISIONAL_OSM
}

export function getWardStatusBadge(state) {
  switch (state) {
    case VERIFICATION_STATES.VERIFIED_OFFICIAL:
      return {
        state,
        badgeText: 'Chính thức',
        alertText: 'Ranh giới hành chính chính thức đã được xác minh theo tài liệu quy chuẩn.',
        badgeClass: 'badge-verified',
      }
    case VERIFICATION_STATES.PROVISIONAL_OSM:
    default:
      return {
        state: VERIFICATION_STATES.PROVISIONAL_OSM,
        badgeText: 'Tham khảo OSM',
        alertText: 'Ranh giới tham khảo – OpenStreetMap, chưa xác minh chính thức.',
        badgeClass: 'badge-provisional',
      }
  }
}

export function getRoadVerificationBadge(road, ambiguousSet = null) {
  if (!road) {
    return {
      state: VERIFICATION_STATES.UNVERIFIED,
      badgeText: 'Chưa xác minh',
      alertText: 'Chưa có thông tin xác minh cho tuyến đường này.',
      badgeClass: 'badge-unverified',
    }
  }

  // Check if road has official verified ward assignment
  if (road.ward_ids && road.ward_ids.length > 0 && road.verification_status === 'verified_official') {
    return {
      state: VERIFICATION_STATES.VERIFIED_OFFICIAL,
      badgeText: 'Chính thức',
      alertText: 'Tuyến đường đã xác minh địa giới hành chính chính thức.',
      badgeClass: 'badge-verified',
    }
  }

  // Check if road belongs to ambiguous set or crosses multiple wards
  const isAmbiguous = ambiguousSet && ambiguousSet.has(road.road_id)
  const isMultiWard = road.candidate_ward_ids && road.candidate_ward_ids.length > 1

  if (isAmbiguous || isMultiWard) {
    return {
      state: VERIFICATION_STATES.UNVERIFIED,
      badgeText: isMultiWard ? 'Qua nhiều phường' : 'Chưa đủ căn cứ',
      alertText: isMultiWard
        ? 'Tuyến đường đi qua nhiều phường theo ranh giới tham khảo OSM, chưa xác minh chính thức.'
        : 'Đoạn đường giáp ranh hoặc chưa đủ căn cứ để gán phường chính thức.',
      badgeClass: 'badge-unverified',
    }
  }

  return {
    state: VERIFICATION_STATES.PROVISIONAL_OSM,
    badgeText: 'Tham khảo OSM',
    alertText: 'Vị trí tuyến đường tham khảo theo dữ liệu OpenStreetMap, chưa xác minh thực địa. Tuyến đường không đại diện cho vị trí số nhà của khách hàng.',
    badgeClass: 'badge-provisional',
  }
}
