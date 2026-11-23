import { useState, useEffect, useRef } from 'react'
import { isRunningStandalone, registerServiceWorker } from '../services/pwa.js'

export default function usePWA() {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))
  const [canInstall, setCanInstall] = useState(false)
  const [isInstalled, setIsInstalled] = useState(() => isRunningStandalone())
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const deferredPrompt = useRef(null)
  const updateCallback = useRef(null)

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
    }
    function handleOffline() {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Check standalone mode change
    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    function handleDisplayModeChange(e) {
      if (e.matches) {
        setIsInstalled(true)
        setCanInstall(false)
      }
    }
    mediaQuery.addEventListener?.('change', handleDisplayModeChange)

    // Capture install prompt (Android Chrome)
    function handleBeforeInstallPrompt(e) {
      e.preventDefault()
      deferredPrompt.current = e
      setCanInstall(true)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // Listen for appinstalled
    function handleAppInstalled() {
      setIsInstalled(true)
      setCanInstall(false)
      deferredPrompt.current = null
    }
    window.addEventListener('appinstalled', handleAppInstalled)

    // Register Service Worker
    registerServiceWorker((applyUpdate) => {
      updateCallback.current = applyUpdate
      setUpdateAvailable(true)
    })

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      mediaQuery.removeEventListener?.('change', handleDisplayModeChange)
    }
  }, [])

  async function installApp() {
    if (!deferredPrompt.current) return false
    deferredPrompt.current.prompt()
    const { outcome } = await deferredPrompt.current.userChoice
    deferredPrompt.current = null
    if (outcome === 'accepted') {
      setIsInstalled(true)
      setCanInstall(false)
      return true
    }
    return false
  }

  function applyAppUpdate() {
    if (updateCallback.current) {
      updateCallback.current()
    }
  }

  return {
    isOnline,
    canInstall,
    isInstalled,
    updateAvailable,
    installApp,
    applyAppUpdate,
  }
}
