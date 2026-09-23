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

// Keep free-form locations usable while making the common Indian address
// spelling consistent in customer-facing documents. For example,
// "Plant - 400000, Maharashtra" becomes "Plant, Maharashtra - 400000".
// Unknown formats are preserved rather than guessed or discarded.
export function normalizeLocationValue(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  const suffixPostal = text.match(/^(.+?),\s*([^,]+?)(?:\s*,\s*(.+?))?\s*-\s*(\d{3,10})$/)
  if (suffixPostal) {
    const [, place, region, country, postalCode] = suffixPostal
    const countryPart = country && !/^india$/i.test(country.trim()) ? `, ${country.trim()}` : ''
    return `${place.trim()}, ${region.trim()}${countryPart} - ${postalCode}`
  }
  const prefixPostal = text.match(/^(.+?)\s*-\s*(\d{3,10})\s*,\s*([^,]+?)(?:\s*,\s*(.+))?$/)
  if (!prefixPostal) return text
  const [, place, postalCode, region, country] = prefixPostal
  const countryPart = country && !/^india$/i.test(country.trim()) ? `, ${country.trim()}` : ''
  return `${place.trim()}, ${region.trim()}${countryPart} - ${postalCode}`
}

// Uploaded enquiry data occasionally contains an obvious placeholder instead
// of a real locality. Keep the source value intact, but never print that
// placeholder in a customer-facing document.
export function isPlaceholderLocation(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return false
  const head = text.split(/\s*[-,]\s*/, 1)[0].trim()
  return /^(?:g{2,}|x{2,}|z{2,}|test|tbd|tbc|n\/a|na|unknown|placeholder)$/i.test(head)
}

export function customerLocationValue(value) {
  const normalized = normalizeLocationValue(value)
  return isPlaceholderLocation(normalized) ? '' : normalized
}

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
