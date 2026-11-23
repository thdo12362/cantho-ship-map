export function isRunningStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  )
}

export function isServiceWorkerSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

export function registerServiceWorker(onUpdateAvailable) {
  if (!isServiceWorkerSupported()) {
    return Promise.resolve(null)
  }

  const base = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : './'
  const swUrl = `${base.endsWith('/') ? base : `${base}/`}sw.js`

  return navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      // Check for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (!newWorker) return

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version ready to take over
            onUpdateAvailable?.(() => {
              newWorker.postMessage({ type: 'SKIP_WAITING' })
            })
          }
        })
      })

      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true
          window.location.reload()
        }
      })

      return registration
    })
    .catch((err) => {
      console.warn('[PWA] Service Worker registration failed:', err)
      return null
    })
}
