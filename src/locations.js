import { useEffect, useState } from 'react'
import { INDIA_LOCATIONS } from './indiaLocations.js'
import { runTask } from './ai.js'

const localLocations = INDIA_LOCATIONS.map(item => ({
  ...item,
  country: 'India',
  countryCode: 'IN',
  routingRegion: item.region,
  source: 'local',
}))

const textFor = item => [item.city, item.state, item.country].filter(Boolean).join(' ').toLowerCase()
const keyFor = item => `${item.city}|${item.state}|${item.country}`.toLowerCase()

export function localLocationSearch(query, limit = 50) {
  const needle = String(query || '').trim().toLowerCase()
  if (!needle) return []
  return localLocations.filter(item => textFor(item).includes(needle)).slice(0, limit)
}

function mergeLocations(remote, local, limit = 50) {
  const merged = []
  const seen = new Set()
  for (const item of [...remote, ...local]) {
    const key = keyFor(item)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
    if (merged.length >= limit) break
  }
  return merged
}

const geminiLocationSearch = async (query, limit) => {
  const payload = await runTask('location.search', { query, limit }, { timeoutMs: 15000 })
  return Array.isArray(payload?.locations) ? payload.locations.map(item => ({
    city: String(item.city || '').trim(),
    state: String(item.state || '').trim(),
    country: String(item.country || '').trim(),
    countryCode: String(item.countryCode || '').trim().toUpperCase(),
    region: String(item.state || item.country || '').trim(),
    routingRegion: String(item.countryCode || '').trim().toUpperCase() === 'IN'
      ? String(item.state || item.country || '').trim()
      : 'International opportunities',
    routingRegion: String(item.countryCode || '').trim().toUpperCase() === 'IN'
      ? String(item.state || item.country || '').trim()
      : 'International opportunities',
    value: [item.city, item.state, item.country].filter(Boolean).join(', '),
    source: 'gemini',
  })).filter(item => item.city && item.country && item.value) : []
}

export function useGlobalLocationSearch(query, limit = 50) {
  const [state, setState] = useState({ matches: [], loading: false })
  const normalized = String(query || '').trim()

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const local = localLocationSearch(normalized, limit)

    if (normalized.length < 2) {
      setState({ matches: [], loading: false })
      return () => { active = false; controller.abort() }
    }

    setState({ matches: local, loading: true })
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/locations?q=${encodeURIComponent(normalized)}`)
        const payload = response.ok ? await response.json() : null
        let remote = payload?.ok && Array.isArray(payload.locations) ? payload.locations : []
        if (!remote.length) remote = await geminiLocationSearch(normalized, limit)
        if (active) setState({ matches: mergeLocations(remote, local, limit), loading: false })
      } catch (error) {
        try {
          const remote = await geminiLocationSearch(normalized, limit)
          if (active) setState({ matches: mergeLocations(remote, local, limit), loading: false })
        } catch {
          if (active) setState({ matches: local, loading: false })
        }
      }
    }, 250)

    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [normalized, limit])

  return state
}
