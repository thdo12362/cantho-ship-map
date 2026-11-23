import { normalizeVietnamese, formatRoadDisplayName, formatRoadType } from './text.js'
import { getRoadVerificationBadge } from './verification.js'
import { isValidCoordinates } from './location.js'

let wardsPromise = null
let roadsIndexPromise = null
let ambiguousAuditPromise = null
let roadsGeoJSONPromise = null

function getBaseUrl() {
  const base = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : './'
  return base.endsWith('/') ? base : `${base}/`
}

export async function fetchWards() {
  if (!wardsPromise) {
    const url = `${getBaseUrl()}data/wards.geojson`
    wardsPromise = fetch(url).then(async (res) => {
      if (!res.ok) throw new Error(`Không thể tải dữ liệu phường (${res.status})`)
      return res.json()
    })
  }
  return wardsPromise
}

export async function fetchRoadsIndex() {
  if (!roadsIndexPromise) {
    const url = `${getBaseUrl()}data/roads-index.json`
    roadsIndexPromise = fetch(url).then(async (res) => {
      if (!res.ok) throw new Error(`Không thể tải chỉ mục đường (${res.status})`)
      return res.json()
    })
  }
  return roadsIndexPromise
}

export async function fetchAmbiguousAudit() {
  if (!ambiguousAuditPromise) {
    const url = `${getBaseUrl()}data/ambiguous-segments-audit.json`
    ambiguousAuditPromise = fetch(url).then(async (res) => {
      if (!res.ok) throw new Error(`Không thể tải kiểm tra đoạn mơ hồ (${res.status})`)
      const data = await res.json()
      const set = new Set()
      const categoryMap = new Map()
      const segments = data.segments || []
      for (const s of segments) {
        set.add(s.road_id)
        categoryMap.set(s.road_id, s.category)
      }
      return { set, categoryMap, segments }
    })
  }
  return ambiguousAuditPromise
}

export async function fetchRoadsGeoJSON() {
  if (!roadsGeoJSONPromise) {
    const url = `${getBaseUrl()}data/roads.geojson`
    roadsGeoJSONPromise = fetch(url).then(async (res) => {
      if (!res.ok) throw new Error(`Không thể tải dữ liệu đường (${res.status})`)
      const data = await res.json()
      const map = new Map()
      for (const feature of data.features || []) {
        if (feature?.properties?.road_id) {
          map.set(feature.properties.road_id, feature)
        }
      }
      return map
    })
  }
  return roadsGeoJSONPromise
}

export async function getRoadFeature(roadId) {
  const map = await fetchRoadsGeoJSON()
  return map.get(roadId) || null
}

export function getRoadMidpoint(feature) {
  if (!feature || !feature.geometry) return null
  const { type, coordinates } = feature.geometry
  if (type === 'LineString' && Array.isArray(coordinates) && coordinates.length > 0) {
    const midCoord = coordinates[Math.floor(coordinates.length / 2)]
    if (Array.isArray(midCoord) && midCoord.length >= 2) {
      const position = { lat: midCoord[1], lng: midCoord[0] }
      return isValidCoordinates(position) ? position : null
    }
  }
  return null
}

export function buildWardLookup(wardsGeoJSON) {
  const map = new Map()
  if (wardsGeoJSON && Array.isArray(wardsGeoJSON.features)) {
    for (const f of wardsGeoJSON.features) {
      if (f.properties?.ward_id) {
        map.set(f.properties.ward_id, f.properties.name || f.properties.ward_id)
      }
    }
  }
  return map
}

export function searchRoads(query, { wardId = null, limit = 25, roadsIndex = null, ambiguousSet = null, wardLookup = null } = {}) {
  if (!query || !roadsIndex || !Array.isArray(roadsIndex.entries)) return []
  const normQuery = normalizeVietnamese(query)
  if (!normQuery) return []

  const results = []
  const entries = roadsIndex.entries

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]

    // Scoped filtering by ward if specified
    if (wardId) {
      if (!entry.candidate_ward_ids || !entry.candidate_ward_ids.includes(wardId)) {
        continue
      }
    }

    const normName = entry.normalized_name || ''
    let score = -1

    if (normName === normQuery) {
      score = 100
    } else if (normName.startsWith(normQuery)) {
      score = 80
    } else if (normName.includes(normQuery)) {
      score = 60
    } else if (entry.keywords && entry.keywords.some((k) => k.includes(normQuery))) {
      score = 40
    } else if (entry.aliases && entry.aliases.some((a) => normalizeVietnamese(a).includes(normQuery))) {
      score = 30
    } else if (entry.road_id.toLowerCase().includes(normQuery)) {
      score = 10
    }

    if (score >= 0) {
      const wardNames = (entry.candidate_ward_ids || []).map((id) => (wardLookup ? wardLookup.get(id) || id : id))
      const verification = getRoadVerificationBadge(entry, ambiguousSet)
      const displayName = formatRoadDisplayName(entry)
      const roadTypeDesc = formatRoadType(entry.road_type, entry.highway)

      results.push({
        ...entry,
        displayName,
        roadTypeDesc,
        wardNames,
        verification,
        score,
      })
    }
  }

  // Sort by score descending, then by name length ascending
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const aLen = a.name ? a.name.length : 999
    const bLen = b.name ? b.name.length : 999
    return aLen - bLen
  })

  return results.slice(0, limit)
}

export function filterRoadsByWard(wardId, roadsIndex, ambiguousSet = null, wardLookup = null) {
  if (!roadsIndex || !Array.isArray(roadsIndex.entries)) {
    return { sole: [], crosses: [], ambiguous: [], total: 0 }
  }

  const sole = []
  const crosses = []
  const ambiguous = []

  for (const entry of roadsIndex.entries) {
    if (!entry.candidate_ward_ids || !entry.candidate_ward_ids.includes(wardId)) {
      continue
    }

    const displayName = formatRoadDisplayName(entry)
    const roadTypeDesc = formatRoadType(entry.road_type, entry.highway)
    const wardNames = (entry.candidate_ward_ids || []).map((id) => (wardLookup ? wardLookup.get(id) || id : id))
    const verification = getRoadVerificationBadge(entry, ambiguousSet)
    const item = { ...entry, displayName, roadTypeDesc, wardNames, verification }

    const isAmbiguous = ambiguousSet && ambiguousSet.has(entry.road_id)
    const isMultiWard = entry.candidate_ward_ids.length > 1

    if (isAmbiguous) {
      ambiguous.push(item)
    } else if (isMultiWard) {
      crosses.push(item)
    } else {
      sole.push(item)
    }
  }

  // Sort named roads first, then unnamed
  const sortFn = (a, b) => {
    if (Boolean(a.name) !== Boolean(b.name)) return a.name ? -1 : 1
    return (a.displayName || '').localeCompare(b.displayName || '', 'vi')
  }

  sole.sort(sortFn)
  crosses.sort(sortFn)
  ambiguous.sort(sortFn)

  return {
    sole,
    crosses,
    ambiguous,
    total: sole.length + crosses.length + ambiguous.length,
  }
}
