import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { CANTHO_CENTER, DEFAULT_ZOOM, TILE_URL } from '../config/map.js'
import { WARDS_LIST } from '../config/wards.js'
import Icon from './Icon.jsx'

const markerIcon = L.divIcon({
  className: 'location-marker',
  html: '<span></span>',
  iconSize: [28, 36],
  iconAnchor: [14, 34],
})

export default function MapView({
  position,
  onSelect,
  locating,
  onLocate,
  wardsData,
  selectedWardId,
  onSelectWard,
  selectedRoadFeature,
}) {
  const container = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const markerRef = useRef(null)
  const wardsLayerRef = useRef(null)
  const roadLayerRef = useRef(null)
  const wardFeatureLayers = useRef(new Map())

  const selectRef = useRef(onSelect)
  selectRef.current = onSelect
  const selectWardRef = useRef(onSelectWard)
  selectWardRef.current = onSelectWard

  const [status, setStatus] = useState('loading')
  const [showBoundaries, setShowBoundaries] = useState(true)

  // Initialize Map
  useEffect(() => {
    const map = L.map(container.current, { zoomControl: false }).setView(CANTHO_CENTER, DEFAULT_ZOOM)
    mapRef.current = map
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>')

    const tiles = L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    })
    layerRef.current = tiles

    let errors = 0
    let timer
    const start = () => {
      errors = 0
      setStatus('loading')
      clearTimeout(timer)
      timer = setTimeout(() => setStatus('error'), 20000)
    }
    tiles.on('loading', start)
    tiles.on('tileerror', () => {
      errors += 1
      setStatus('error')
    })
    tiles.on('load', () => {
      clearTimeout(timer)
      setStatus(errors ? 'error' : 'ready')
    })
    tiles.addTo(map)

    map.on('click', ({ latlng }) => {
      selectRef.current({ lat: latlng.lat, lng: latlng.lng, source: 'map' })
    })

    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(container.current)

    return () => {
      clearTimeout(timer)
      observer.disconnect()
      map.remove()
      mapRef.current = null
      markerRef.current = null
      wardsLayerRef.current = null
      roadLayerRef.current = null
      wardFeatureLayers.current.clear()
    }
  }, [])

  // Position Marker (Phase 1 support)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!position) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    const coordinates = [position.lat, position.lng]
    if (markerRef.current) {
      markerRef.current.setLatLng(coordinates)
    } else {
      markerRef.current = L.marker(coordinates, {
        icon: markerIcon,
        title: 'Vị trí được chọn',
        keyboard: false,
      }).addTo(map)
    }
    map.setView(coordinates, position.source === 'gps' ? Math.max(map.getZoom(), 16) : map.getZoom())
  }, [position])

  // Ward Polygons Layer
  useEffect(() => {
    const map = mapRef.current
    if (!map || !wardsData || !wardsData.features) return

    // Clear previous wards layer if exists
    if (wardsLayerRef.current) {
      wardsLayerRef.current.remove()
      wardFeatureLayers.current.clear()
    }

    const wardsLayer = L.geoJSON(wardsData, {
      style: (feature) => {
        const wid = feature.properties?.ward_id
        const wardInfo = WARDS_LIST.find((w) => w.id === wid)
        const baseColor = wardInfo ? wardInfo.color : '#08785e'

        return {
          fillColor: baseColor,
          fillOpacity: 0.12,
          color: baseColor,
          weight: 1.5,
          opacity: 0.7,
        }
      },
      onEachFeature: (feature, layer) => {
        const wid = feature.properties?.ward_id
        if (wid) {
          wardFeatureLayers.current.set(wid, layer)
        }

        const name = feature.properties?.name || 'Phường'
        layer.bindTooltip(name, {
          sticky: true,
          direction: 'center',
          className: 'ward-map-tooltip',
        })

        layer.on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          if (wid) {
            selectWardRef.current(wid)
          }
        })
      },
    })

    wardsLayerRef.current = wardsLayer
    if (showBoundaries) {
      wardsLayer.addTo(map)
    }

    return () => {
      wardsLayer.remove()
      wardsLayerRef.current = null
      wardFeatureLayers.current.clear()
    }
  }, [wardsData])

  // Update styles and zoom when selectedWardId changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !wardsLayerRef.current) return

    wardFeatureLayers.current.forEach((layer, wid) => {
      const wardInfo = WARDS_LIST.find((w) => w.id === wid)
      const baseColor = wardInfo ? wardInfo.color : '#08785e'

      if (!selectedWardId) {
        // All active default
        layer.setStyle({
          fillColor: baseColor,
          fillOpacity: 0.12,
          color: baseColor,
          weight: 1.5,
          opacity: 0.7,
        })
      } else if (wid === selectedWardId) {
        // Highlighted
        layer.setStyle({
          fillColor: baseColor,
          fillOpacity: 0.35,
          color: '#08785e',
          weight: 3.5,
          opacity: 1.0,
        })
        layer.bringToFront()
      } else {
        // Inactive / dimmed
        layer.setStyle({
          fillColor: '#94a3b8',
          fillOpacity: 0.04,
          color: '#cbd5e1',
          weight: 1,
          opacity: 0.35,
        })
      }
    })

    // If a ward is selected, fit bounds to that ward
    if (selectedWardId) {
      const activeLayer = wardFeatureLayers.current.get(selectedWardId)
      if (activeLayer) {
        const bounds = activeLayer.getBounds()
        if (bounds.isValid()) {
          const isMobile = window.innerWidth < 850
          map.fitBounds(bounds, {
            paddingTopLeft: isMobile ? [20, 100] : [40, 40],
            paddingBottomRight: isMobile ? [20, 120] : [40, 40],
            maxZoom: 15,
          })
        }
      }
    }
  }, [selectedWardId])

  // Selected Road Highlight Layer
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (roadLayerRef.current) {
      roadLayerRef.current.remove()
      roadLayerRef.current = null
    }

    if (!selectedRoadFeature || !selectedRoadFeature.geometry) return

    const roadLayer = L.geoJSON(selectedRoadFeature, {
      style: {
        color: '#d97706',
        weight: 6,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      },
    }).addTo(map)

    roadLayerRef.current = roadLayer
    roadLayer.bringToFront()

    const bounds = roadLayer.getBounds()
    if (bounds.isValid()) {
      const isMobile = window.innerWidth < 850
      map.fitBounds(bounds, {
        paddingTopLeft: isMobile ? [30, 100] : [50, 50],
        paddingBottomRight: isMobile ? [30, 140] : [50, 50],
        maxZoom: 17,
      })
    }
  }, [selectedRoadFeature])

  // Boundary Layer Toggle
  function toggleBoundaries() {
    const map = mapRef.current
    if (!map || !wardsLayerRef.current) return

    if (showBoundaries) {
      wardsLayerRef.current.remove()
      setShowBoundaries(false)
    } else {
      wardsLayerRef.current.addTo(map)
      setShowBoundaries(true)
    }
  }

  function handleHomeClick() {
    const map = mapRef.current
    if (!map) return
    if (wardsLayerRef.current && showBoundaries) {
      const bounds = wardsLayerRef.current.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30] })
        return
      }
    }
    map.setView(CANTHO_CENTER, DEFAULT_ZOOM)
  }

  return (
    <section className="map-panel" aria-label="Bản đồ tương tác 9 phường Cần Thơ">
      <div ref={container} className="map-canvas" aria-label="Bản đồ tương tác. Chạm để chọn vị trí." />
      <div className="map-caption">
        <span className="live-dot" /> CẦN THƠ <span className="caption-divider" /> 9 Phường Tham Khảo OSM
      </div>

      <div className="map-controls">
        <button
          type="button"
          title={showBoundaries ? 'Ẩn ranh giới phường' : 'Hiện ranh giới phường'}
          aria-label={showBoundaries ? 'Ẩn ranh giới phường' : 'Hiện ranh giới phường'}
          className={`control-btn ${showBoundaries ? 'active-layer' : ''}`}
          onClick={toggleBoundaries}
        >
          <Icon name="layers" />
        </button>
        <button
          type="button"
          title="Toàn cảnh 9 phường Cần Thơ"
          aria-label="Toàn cảnh 9 phường Cần Thơ"
          onClick={handleHomeClick}
        >
          <Icon name="home" />
        </button>
        <div className="zoom-group">
          <button type="button" aria-label="Phóng to" onClick={() => mapRef.current?.zoomIn()}>
            <Icon name="plus" />
          </button>
          <button type="button" aria-label="Thu nhỏ" onClick={() => mapRef.current?.zoomOut()}>
            <Icon name="minus" />
          </button>
        </div>
        <button
          type="button"
          className="gps-control"
          aria-label="Định vị GPS"
          disabled={locating}
          onClick={onLocate}
        >
          <Icon name="gps" />
        </button>
      </div>

      {status === 'loading' && (
        <div className="map-status" role="status">
          <span className="spinner" /> Đang tải bản đồ…
        </div>
      )}
      {status === 'error' && (
        <div className="map-status map-error" role="alert">
          <span>Không tải đủ bản đồ. Kiểm tra kết nối mạng.</span>
          <button
            type="button"
            onClick={() => {
              setStatus('loading')
              layerRef.current?.redraw()
            }}
          >
            Thử lại
          </button>
        </div>
      )}
      <div className="map-hint">Chạm vào phường hoặc tuyến đường để xem chi tiết</div>
    </section>
  )
}
