import { useEffect, useRef, useState } from 'react'
import { requestLocation } from '../services/location.js'

export default function useGeolocation(onPosition) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])

  async function locate(highAccuracy) {
    if (pending.current) return
    pending.current = true
    setLoading(true)
    setError('')
    try {
      if (!window.isSecureContext) throw new Error('GPS cần kết nối HTTPS hoặc localhost.')
      const position = await requestLocation(navigator.geolocation, highAccuracy)
      if (active.current) onPosition(position)
    } catch (cause) {
      if (active.current) setError(cause.message)
    } finally {
      pending.current = false
      if (active.current) setLoading(false)
    }
  }
  return { locate, loading, error }
}
