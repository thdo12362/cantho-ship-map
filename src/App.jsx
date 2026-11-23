import { useState, useEffect, useMemo } from 'react'
import MapView from './components/MapView.jsx'
import LocationCard from './components/LocationCard.jsx'
import SearchBar from './components/SearchBar.jsx'
import WardFilter from './components/WardFilter.jsx'
import RoadList from './components/RoadList.jsx'
import RoadDetailCard from './components/RoadDetailCard.jsx'
import BottomSheet from './components/BottomSheet.jsx'
import NotebookView from './components/NotebookView.jsx'
import SavePlaceDialog from './components/SavePlaceDialog.jsx'
import NoteDialog from './components/NoteDialog.jsx'
import InstallPromptModal from './components/InstallPromptModal.jsx'
import Icon from './components/Icon.jsx'
import useGeolocation from './hooks/useGeolocation.js'
import useSetting from './hooks/useSetting.js'
import usePWA from './hooks/usePWA.js'
import {
  fetchWards,
  fetchRoadsIndex,
  fetchAmbiguousAudit,
  getRoadFeature,
  getRoadMidpoint,
  buildWardLookup,
  filterRoadsByWard,
} from './services/roads.js'
import { detectWardFromCoordinates } from './services/wardDetection.js'
import { addSearchHistory } from './services/db.js'

export default function App() {
  // Navigation View: 'map' | 'notebook'
  const [currentView, setCurrentView] = useState('map')
  const [notebookTab, setNotebookTab] = useState('favorites')

  // Phase 1 states
  const [position, setPosition] = useState(null)
  const [address, setAddress] = useState('')
  const [query, setQuery] = useState('')
  const [highAccuracy, setHighAccuracy] = useSetting('cantho:gps-high-accuracy', true)
  const [saveHistoryEnabled, setSaveHistoryEnabled] = useSetting('cantho:save-search-history', true)

  // PWA & Connectivity hooks
  const { isOnline, canInstall, isInstalled, updateAvailable, installApp, applyAppUpdate } = usePWA()
  const [installModalOpen, setInstallModalOpen] = useState(false)

  const gps = useGeolocation((next) => {
    setPosition(next)
    setAddress('')
    setSelectedRoad(null)
    setSelectedRoadFeature(null)
    setMidpoint(null)
    setCurrentView('map')
  })

  // Phase 3 & 4 GIS, Road & Sổ tay states
  const [wardsData, setWardsData] = useState(null)
  const [roadsIndex, setRoadsIndex] = useState(null)
  const [ambiguousAudit, setAmbiguousAudit] = useState(null)
  const [selectedWardId, setSelectedWardId] = useState(null)
  const [selectedRoad, setSelectedRoad] = useState(null)
  const [selectedRoadFeature, setSelectedRoadFeature] = useState(null)
  const [midpoint, setMidpoint] = useState(null)
  const [loadingData, setLoadingData] = useState(true)

  // Dialog states for Save Place & Note
  const [savePlaceDialog, setSavePlaceDialog] = useState({ open: false, data: null })
  const [noteDialog, setNoteDialog] = useState({ open: false, data: null })

  // Load initial GIS data
  useEffect(() => {
    let active = true

    async function initData() {
      try {
        const [wards, index, audit] = await Promise.all([
          fetchWards(),
          fetchRoadsIndex(),
          fetchAmbiguousAudit(),
        ])
        if (active) {
          setWardsData(wards)
          setRoadsIndex(index)
          setAmbiguousAudit(audit)
          setLoadingData(false)
        }
      } catch (err) {
        console.error('Lỗi tải dữ liệu bản đồ:', err)
        if (active) setLoadingData(false)
      }
    }

    initData()
    return () => {
      active = false
    }
  }, [])

  // Ward lookup map
  const wardLookup = useMemo(() => buildWardLookup(wardsData), [wardsData])

  // Point-in-polygon Ward Detection for current position
  const detectedWard = useMemo(() => {
    if (!position || !wardsData) return null
    return detectWardFromCoordinates(position, wardsData)
  }, [position, wardsData])

  // Selected ward feature
  const selectedWardFeature = useMemo(() => {
    if (!selectedWardId || !wardsData?.features) return null
    return wardsData.features.find((f) => f.properties.ward_id === selectedWardId) || null
  }, [selectedWardId, wardsData])

  // Filtered roads in selected ward
  const roadGroups = useMemo(() => {
    if (!selectedWardId || !roadsIndex) return { sole: [], crosses: [], ambiguous: [], total: 0 }
    return filterRoadsByWard(selectedWardId, roadsIndex, ambiguousAudit?.set, wardLookup)
  }, [selectedWardId, roadsIndex, ambiguousAudit, wardLookup])

  // Ward Selection handler
  function handleSelectWard(wardId) {
    setSelectedWardId(wardId)
    setSelectedRoad(null)
    setSelectedRoadFeature(null)
    setMidpoint(null)
    setPosition(null)
    setAddress('')
    setCurrentView('map')
  }

  // Road Selection handler
  async function handleSelectRoad(road) {
    if (!road) {
      setSelectedRoad(null)
      setSelectedRoadFeature(null)
      setMidpoint(null)
      return
    }

    setSelectedRoad(road)
    setPosition(null)
    setAddress('')
    setCurrentView('map')

    try {
      const feature = await getRoadFeature(road.road_id)
      setSelectedRoadFeature(feature)
      const mid = getRoadMidpoint(feature)
      setMidpoint(mid)
    } catch (err) {
      console.error('Lỗi tải tọa độ tuyến đường:', err)
    }
  }

  function handleClearSelection() {
    setSelectedRoad(null)
    setSelectedRoadFeature(null)
    setMidpoint(null)
    setPosition(null)
    setAddress('')
    setQuery('')
  }

  function handleCustomAddressSearch(customAddress) {
    setSelectedRoad(null)
    setSelectedRoadFeature(null)
    setMidpoint(null)
    setPosition(null)
    setAddress(customAddress)
    setCurrentView('map')
  }

  function handleMapClick(next) {
    setPosition(next)
    setAddress('')
    setSelectedRoad(null)
    setSelectedRoadFeature(null)
    setMidpoint(null)
  }

  // Record history
  function handleRecordHistory(q, selectedResult, coords) {
    if (saveHistoryEnabled) {
      addSearchHistory({ query: q, selected_result: selectedResult, coordinates: coords }, true)
    }
  }

  // View a saved favorite on map
  function handleViewFavoriteOnMap(fav) {
    setCurrentView('map')
    setPosition({
      lat: fav.lat,
      lng: fav.lng,
      source: 'favorite',
      name: fav.name,
    })
    setAddress('')
    setSelectedRoad(null)
    setSelectedRoadFeature(null)
    setMidpoint(null)
  }

  // Re-search from history
  function handleReSearch(histItem) {
    setQuery(histItem.query)
    setCurrentView('map')
    if (histItem.coordinates) {
      setPosition({ ...histItem.coordinates, source: 'history' })
    }
  }

  const selectedWardName = selectedWardFeature?.properties?.name || ''

  // Dynamic bottom sheet title
  const sheetTitle = selectedRoad
    ? selectedRoad.displayName
    : position
      ? position.name || (position.source === 'gps' ? 'Vị trí GPS của tôi' : 'Vị trí đã ghim')
      : address
        ? 'Địa chỉ tìm kiếm'
        : selectedWardName
          ? `Phường ${selectedWardName} (${roadGroups.total} tuyến đường)`
          : '9 Phường Cần Thơ'

  const sheetSubtitle = selectedRoad
    ? selectedRoad.roadTypeDesc
    : position
      ? detectedWard?.ward_name
        ? `Thuộc P. ${detectedWard.ward_name} (ước tính OSM)`
        : 'Chạm bản đồ hoặc dùng GPS'
      : selectedWardName
        ? 'Ranh giới tham khảo OSM'
        : 'Chạm để xem chi tiết'

  return (
    <main className="app-shell">
      {/* Offline Status Bar */}
      {!isOnline && (
        <div className="offline-status-banner" role="status">
          <Icon name="alertTriangle" width="16" height="16" />
          <span>Đang ngoại tuyến. Dữ liệu 9 phường & sổ tay vẫn hoạt động bình thường.</span>
        </div>
      )}

      {/* App Update Available Banner */}
      {updateAvailable && (
        <div className="update-available-banner" role="status">
          <Icon name="info" width="16" height="16" />
          <span>Đã có phiên bản cập nhật mới!</span>
          <button type="button" className="apply-update-btn" onClick={applyAppUpdate}>
            Cập nhật ngay
          </button>
        </div>
      )}

      {/* Mobile Top Header (Search & Ward Filter) */}
      <header className="mobile-top-bar">
        <div className="mobile-view-nav-row">
          <div className="view-toggle-pills">
            <button
              type="button"
              className={`view-pill ${currentView === 'map' ? 'active' : ''}`}
              onClick={() => setCurrentView('map')}
            >
              <Icon name="home" width="16" height="16" /> Bản đồ
            </button>
            <button
              type="button"
              className={`view-pill ${currentView === 'notebook' ? 'active' : ''}`}
              onClick={() => setCurrentView('notebook')}
            >
              <Icon name="book" width="16" height="16" /> Sổ tay của tôi
            </button>
          </div>

          <button
            type="button"
            className="mobile-install-btn"
            onClick={() => setInstallModalOpen(true)}
            aria-label="Cài đặt ứng dụng PWA"
            title="Cài đặt ứng dụng"
          >
            <Icon name="download" width="17" height="17" />
          </button>
        </div>

        {currentView === 'map' && (
          <>
            <SearchBar
              query={query}
              onQueryChange={setQuery}
              onSelectRoad={handleSelectRoad}
              onCustomAddressSearch={handleCustomAddressSearch}
              selectedWardId={selectedWardId}
              selectedWardName={selectedWardName}
              roadsIndex={roadsIndex}
              ambiguousSet={ambiguousAudit?.set}
              wardLookup={wardLookup}
              onRecordHistory={handleRecordHistory}
            />
            <WardFilter
              selectedWardId={selectedWardId}
              onSelectWard={handleSelectWard}
              wardsData={wardsData}
            />
          </>
        )}
      </header>

      {/* Desktop Sidebar */}
      <aside className="sidebar">
        <header className="brand">
          <div className="brand-icon">
            <Icon name="pin" width="28" height="28" />
          </div>
          <div>
            <h1>
              CanTho <span>Ship Map</span>
            </h1>
            <p>Sổ tay & Bản đồ 9 phường Cần Thơ</p>
          </div>
          <div className="header-badge-group">
            <span className="version">BẢN 05 (PWA)</span>
            <button
              type="button"
              className="pwa-install-pill"
              onClick={() => setInstallModalOpen(true)}
              title="Cài đặt ứng dụng lên máy"
            >
              <Icon name="download" width="13" height="13" /> {isInstalled ? 'Đã cài đặt' : 'Cài đặt'}
            </button>
          </div>
        </header>

        {/* View Switcher Tabs (Desktop) */}
        <div className="sidebar-nav-tabs">
          <button
            type="button"
            className={`nav-tab-btn ${currentView === 'map' ? 'active' : ''}`}
            onClick={() => setCurrentView('map')}
          >
            <Icon name="road" width="16" height="16" /> Bản đồ & Đường phố
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${currentView === 'notebook' ? 'active' : ''}`}
            onClick={() => setCurrentView('notebook')}
          >
            <Icon name="book" width="16" height="16" /> Sổ tay của tôi
          </button>
        </div>

        {currentView === 'notebook' ? (
          <div className="sidebar-notebook-wrapper">
            <NotebookView
              activeTab={notebookTab}
              onTabChange={setNotebookTab}
              onViewLocationOnMap={handleViewFavoriteOnMap}
              onReSearch={handleReSearch}
              saveHistoryEnabled={saveHistoryEnabled}
              onToggleSaveHistory={setSaveHistoryEnabled}
              onOpenAddPlace={() =>
                setSavePlaceDialog({
                  open: true,
                  data: {
                    lat: position?.lat || 10.034,
                    lng: position?.lng || 105.783,
                    ward_name: detectedWard?.ward_name || '',
                    ward_id: detectedWard?.ward_id || null,
                  },
                })
              }
              onEditPlace={(place) => setSavePlaceDialog({ open: true, data: place })}
              onOpenAddNote={() => setNoteDialog({ open: true, data: null })}
              onEditNote={(note) => setNoteDialog({ open: true, data: note })}
            />
          </div>
        ) : (
          <>
            <div className="search-section">
              <SearchBar
                query={query}
                onQueryChange={setQuery}
                onSelectRoad={handleSelectRoad}
                onCustomAddressSearch={handleCustomAddressSearch}
                selectedWardId={selectedWardId}
                selectedWardName={selectedWardName}
                roadsIndex={roadsIndex}
                ambiguousSet={ambiguousAudit?.set}
                wardLookup={wardLookup}
                onRecordHistory={handleRecordHistory}
              />
            </div>

            <div className="sidebar-filter-section">
              <WardFilter
                selectedWardId={selectedWardId}
                onSelectWard={handleSelectWard}
                wardsData={wardsData}
              />
            </div>

            <div className="sidebar-content">
              {selectedRoad ? (
                <RoadDetailCard
                  road={selectedRoad}
                  roadFeature={selectedRoadFeature}
                  midpoint={midpoint}
                  wardLookup={wardLookup}
                  onClear={handleClearSelection}
                  onSaveRoad={(data) => setSavePlaceDialog({ open: true, data })}
                  onAddRoadNote={(data) => setNoteDialog({ open: true, data })}
                />
              ) : position || address ? (
                <LocationCard
                  position={position}
                  address={address}
                  detectedWard={detectedWard}
                  onClear={handleClearSelection}
                  onSavePlace={(data) => setSavePlaceDialog({ open: true, data })}
                  onAddNote={(data) => setNoteDialog({ open: true, data })}
                />
              ) : (
                <RoadList
                  selectedWard={selectedWardFeature}
                  roadGroups={roadGroups}
                  onSelectRoad={handleSelectRoad}
                  selectedRoadId={selectedRoad?.road_id}
                  wardLookup={wardLookup}
                />
              )}

              {/* GPS Section (Phase 1 retained + smart ward detection) */}
              <section className="gps-section">
                <button
                  type="button"
                  className="button gps-button"
                  disabled={gps.loading}
                  onClick={() => gps.locate(highAccuracy)}
                >
                  {gps.loading ? <span className="spinner" /> : <Icon name="gps" />}
                  {gps.loading ? 'Đang lấy vị trí…' : 'Định vị GPS của tôi'}
                </button>
                <label className="setting">
                  <input
                    type="checkbox"
                    checked={highAccuracy}
                    onChange={(e) => setHighAccuracy(e.target.checked)}
                  />{' '}
                  GPS độ chính xác cao
                </label>
                {gps.error && (
                  <p className="error-text" role="alert">
                    {gps.error}
                  </p>
                )}
                <span className="sr-only" role="status">
                  {gps.loading ? 'Đang lấy vị trí GPS' : ''}
                </span>
              </section>

              <div className="safe-riding-alert" role="note">
                <span>⚠️ <strong>An toàn giao thông:</strong> Vui lòng dừng xe an toàn vào lề đường trước khi xem bản đồ hoặc ghi chú.</span>
              </div>

              <div className="scope-note">
                <span className="section-label">LƯU Ý DỮ LIỆU ĐỊA GIỚI</span>
                <p>9 Phường sáp nhập theo NQ 1668/NQ-UBTVQH15.</p>
                <span>
                  Ranh giới hiển thị theo quan hệ OpenStreetMap (PROVISIONAL_OSM). Sổ tay và dữ liệu cá nhân được lưu an toàn riêng trên thiết bị của bạn.
                </span>
              </div>
            </div>
          </>
        )}

        <footer>
          CanTho Ship Map <span>·</span> Sổ tay & Công cụ cá nhân shipper
        </footer>
      </aside>

      {/* Main Map Panel */}
      <MapView
        position={position}
        onSelect={handleMapClick}
        locating={gps.loading}
        onLocate={() => gps.locate(highAccuracy)}
        wardsData={wardsData}
        selectedWardId={selectedWardId}
        onSelectWard={handleSelectWard}
        selectedRoadFeature={selectedRoadFeature}
      />

      {/* Mobile Bottom Sheet (Used when in map view or notebook view) */}
      <div className="mobile-sheet-wrapper">
        {currentView === 'notebook' ? (
          <div className="mobile-notebook-fullscreen">
            <NotebookView
              activeTab={notebookTab}
              onTabChange={setNotebookTab}
              onViewLocationOnMap={handleViewFavoriteOnMap}
              onReSearch={handleReSearch}
              saveHistoryEnabled={saveHistoryEnabled}
              onToggleSaveHistory={setSaveHistoryEnabled}
              onOpenAddPlace={() =>
                setSavePlaceDialog({
                  open: true,
                  data: {
                    lat: position?.lat || 10.034,
                    lng: position?.lng || 105.783,
                    ward_name: detectedWard?.ward_name || '',
                    ward_id: detectedWard?.ward_id || null,
                  },
                })
              }
              onEditPlace={(place) => setSavePlaceDialog({ open: true, data: place })}
              onOpenAddNote={() => setNoteDialog({ open: true, data: null })}
              onEditNote={(note) => setNoteDialog({ open: true, data: note })}
            />
          </div>
        ) : (
          <BottomSheet
            isOpen={Boolean(selectedRoad || position || address || selectedWardId)}
            title={sheetTitle}
            subtitle={sheetSubtitle}
          >
            {selectedRoad ? (
              <RoadDetailCard
                road={selectedRoad}
                roadFeature={selectedRoadFeature}
                midpoint={midpoint}
                wardLookup={wardLookup}
                onClear={handleClearSelection}
                onSaveRoad={(data) => setSavePlaceDialog({ open: true, data })}
                onAddRoadNote={(data) => setNoteDialog({ open: true, data })}
              />
            ) : position || address ? (
              <LocationCard
                position={position}
                address={address}
                detectedWard={detectedWard}
                onClear={handleClearSelection}
                onSavePlace={(data) => setSavePlaceDialog({ open: true, data })}
                onAddNote={(data) => setNoteDialog({ open: true, data })}
              />
            ) : (
              <RoadList
                selectedWard={selectedWardFeature}
                roadGroups={roadGroups}
                onSelectRoad={handleSelectRoad}
                selectedRoadId={selectedRoad?.road_id}
                wardLookup={wardLookup}
              />
            )}

            <section className="gps-section mobile-gps-section">
              <button
                type="button"
                className="button gps-button"
                disabled={gps.loading}
                onClick={() => gps.locate(highAccuracy)}
              >
                {gps.loading ? <span className="spinner" /> : <Icon name="gps" />}
                {gps.loading ? 'Đang lấy vị trí…' : 'Định vị GPS của tôi'}
              </button>
            </section>
          </BottomSheet>
        )}
      </div>

      {/* Save Place Dialog */}
      <SavePlaceDialog
        isOpen={savePlaceDialog.open}
        initialData={savePlaceDialog.data}
        onClose={() => setSavePlaceDialog({ open: false, data: null })}
        onSaved={(saved) => {
          if (position) {
            setPosition({ ...position, name: saved.name })
          }
        }}
      />

      {/* Note Dialog */}
      <NoteDialog
        isOpen={noteDialog.open}
        initialData={noteDialog.data}
        onClose={() => setNoteDialog({ open: false, data: null })}
      />

      {/* PWA Install Modal */}
      <InstallPromptModal
        isOpen={installModalOpen}
        onClose={() => setInstallModalOpen(false)}
        canInstall={canInstall}
        isInstalled={isInstalled}
        onInstall={async () => {
          await installApp()
          setInstallModalOpen(false)
        }}
      />
    </main>
  )
}
