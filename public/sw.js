// CanTho Ship Map Service Worker
// Version: cantho-ship-map-v1.0.0

const CACHE_STATIC = 'cantho-static-v1'
const CACHE_DATA = 'cantho-data-v1'
const CACHE_TILES = 'cantho-osm-tiles-v1'

const MAX_TILES_CACHE = 150

// Pre-cache core application shell and essential GIS data
// NOTE: strictly no tile prefetching per OpenStreetMap Tile Usage Policy!
const PRECACHE_RESOURCES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './data/wards.geojson',
  './data/roads-index.json',
  './data/ambiguous-segments-audit.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_STATIC)
      .then((cache) => cache.addAll(PRECACHE_RESOURCES))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn('[SW] Pre-cache warning:', err)
      })
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((k) => k !== CACHE_STATIC && k !== CACHE_DATA && k !== CACHE_TILES)
            .map((k) => caches.delete(k))
        )
      })
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Prune cache to keep tile count reasonable
async function limitTileCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName)
    const keys = await cache.keys()
    if (keys.length > maxItems) {
      await cache.delete(keys[0])
      limitTileCache(cacheName, maxItems)
    }
  } catch (e) {
    // ignore
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  // 1. Navigation requests (HTML documents)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match('./index.html').then((match) => {
          return match || caches.match('./')
        })
      })
    )
    return
  }

  // 2. OpenStreetMap Tiles (Strict compliance with OSM Tile Usage Policy)
  // - No bulk download / prefetch
  // - On-demand caching of viewed tiles only
  // - Fallback cleanly when offline
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(CACHE_TILES).then((cache) => {
        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              cache.put(request, networkResponse.clone())
              limitTileCache(CACHE_TILES, MAX_TILES_CACHE)
            }
            return networkResponse
          })
          .catch(() => {
            // When offline, return tile if previously seen, or 503 fallback
            return cache.match(request).then((cachedTile) => {
              if (cachedTile) return cachedTile
              // Return transparent 1x1 png or 503 so Leaflet handles it gracefully
              return new Response(null, { status: 503, statusText: 'Tile Offline' })
            })
          })
      })
    )
    return
  }

  // 3. GIS Data files (/data/*.geojson, /data/*.json)
  if (url.pathname.includes('/data/')) {
    event.respondWith(
      caches.open(CACHE_DATA).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request)
            .then((networkResponse) => {
              if (networkResponse.status === 200) {
                cache.put(request, networkResponse.clone())
              }
              return networkResponse
            })
            .catch(() => null)

          // Stale-While-Revalidate: return cached immediately if available
          return cachedResponse || fetchPromise
        })
      })
    )
    return
  }

  // 4. Static assets (JS, CSS, icons, images)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }
      return fetch(request).then((networkResponse) => {
        // Cache successful GET responses for assets
        if (
          networkResponse.status === 200 &&
          request.method === 'GET' &&
          (url.pathname.includes('/assets/') || url.pathname.includes('/icons/'))
        ) {
          const responseClone = networkResponse.clone()
          caches.open(CACHE_STATIC).then((cache) => cache.put(request, responseClone))
        }
        return networkResponse
      })
    })
  )
})
