import { useState } from 'react'

export default function useSetting(key, fallback) {
  const [value, setValue] = useState(() => {
    try { const stored = JSON.parse(localStorage.getItem(key)); return typeof stored === 'boolean' ? stored : fallback }
    catch { return fallback }
  })
  function update(next) {
    setValue(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* Settings remain usable in memory. */ }
  }
  return [value, update]
}
