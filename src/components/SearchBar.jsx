import { useState, useRef, useEffect, useId } from 'react'
import Icon from './Icon.jsx'
import { searchRoads } from '../services/roads.js'

export default function SearchBar({
  query,
  onQueryChange,
  onSelectRoad,
  onCustomAddressSearch,
  selectedWardId,
  selectedWardName,
  roadsIndex,
  ambiguousSet,
  wardLookup,
  onRecordHistory,
}) {
  const [open, setOpen] = useState(false)
  const [isScoped, setIsScoped] = useState(Boolean(selectedWardId))
  const [suggestions, setSuggestions] = useState([])
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const listboxId = useId()

  // Keep isScoped in sync with selectedWardId
  useEffect(() => {
    if (selectedWardId) {
      setIsScoped(true)
    } else {
      setIsScoped(false)
    }
  }, [selectedWardId])

  // Run search when query, isScoped, or selectedWardId changes
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed || !roadsIndex) {
      setSuggestions([])
      setOpen(false)
      return
    }

    const results = searchRoads(trimmed, {
      wardId: isScoped ? selectedWardId : null,
      limit: 15,
      roadsIndex,
      ambiguousSet,
      wardLookup,
    })

    setSuggestions(results)
    setOpen(true)
  }, [query, isScoped, selectedWardId, roadsIndex, ambiguousSet, wardLookup])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [])

  function handleSubmit(e) {
    e.preventDefault()
    if (!query.trim()) return

    if (suggestions.length === 1) {
      handlePickRoad(suggestions[0])
    } else if (suggestions.length === 0) {
      // Fallback custom address search (Phase 1)
      setOpen(false)
      onRecordHistory?.(query.trim(), null, null)
      onCustomAddressSearch(query.trim())
    } else {
      // Keep suggestions open for user to disambiguate
      setOpen(true)
    }
  }

  function handlePickRoad(road) {
    setOpen(false)
    const displayName = road.displayName || road.name || ''
    onRecordHistory?.(displayName, displayName, null)
    onQueryChange(displayName)
    onSelectRoad(road)
  }

  function handleClear() {
    onQueryChange('')
    setSuggestions([])
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div className="search-bar-wrapper" ref={containerRef}>
      <form className="search-form" onSubmit={handleSubmit} role="search">
        <label htmlFor="road-search-input" className="sr-only">
          Tìm đường hoặc địa chỉ
        </label>
        <span className="search-icon-slot">
          <Icon name="search" />
        </span>
        <input
          ref={inputRef}
          id="road-search-input"
          type="search"
          placeholder={
            selectedWardName && isScoped
              ? `Tìm đường trong ${selectedWardName}…`
              : 'Tìm tên đường (có dấu hoặc không dấu)…'
          }
          value={query}
          maxLength={300}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true)
          }}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={open && suggestions.length > 0 ? listboxId : undefined}
        />
        {query && (
          <button
            type="button"
            className="search-clear-btn"
            onClick={handleClear}
            aria-label="Xóa nội dung tìm kiếm"
          >
            <Icon name="close" width="16" height="16" />
          </button>
        )}
        <button type="submit" className="search-submit-btn" aria-label="Tìm kiếm">
          <Icon name="search" />
        </button>
      </form>

      {/* Scope switch if a ward is selected */}
      {selectedWardId && (
        <div className="search-scope-row">
          <button
            type="button"
            className={`scope-pill ${isScoped ? 'active' : ''}`}
            onClick={() => setIsScoped(true)}
            aria-pressed={isScoped}
          >
            Trong {selectedWardName}
          </button>
          <button
            type="button"
            className={`scope-pill ${!isScoped ? 'active' : ''}`}
            onClick={() => setIsScoped(false)}
            aria-pressed={!isScoped}
          >
            Toàn bộ 9 phường
          </button>
        </div>
      )}

      {/* Suggestions Dropdown */}
      {open && suggestions.length > 0 && (
        <ul id={listboxId} className="search-suggestions-dropdown" role="listbox">
          {suggestions.map((road) => {
            const isMulti = road.candidate_ward_ids && road.candidate_ward_ids.length > 1
            const wardText = road.wardNames && road.wardNames.length > 0 ? road.wardNames.join(', ') : ''

            return (
              <li key={road.road_id} role="option" aria-selected="false">
                <button
                  type="button"
                  className="suggestion-item"
                  onClick={() => handlePickRoad(road)}
                >
                  <span className="suggestion-icon">
                    <Icon name="road" width="18" height="18" />
                  </span>
                  <div className="suggestion-content">
                    <div className="suggestion-header">
                      <span className="suggestion-name">{road.displayName}</span>
                      <span className="tag road-type-tag">{road.roadTypeDesc}</span>
                    </div>
                    <div className="suggestion-sub">
                      {wardText && <span className="suggestion-ward">Phạm vi: {wardText}</span>}
                      {isMulti && <span className="tag multi-ward-tag">Nhiều phường</span>}
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {open && query.trim() && suggestions.length === 0 && (
        <div className="search-no-results">
          <p className="no-result-text">Không tìm thấy tuyến đường trong cơ sở dữ liệu OSM.</p>
          <button
            type="button"
            className="fallback-search-btn"
            onClick={() => {
              setOpen(false)
              onRecordHistory?.(query.trim(), null, null)
              onCustomAddressSearch(query.trim())
            }}
          >
            Tìm địa chỉ "{query.trim()}" bằng Google Maps
          </button>
        </div>
      )}
    </div>
  )
}
