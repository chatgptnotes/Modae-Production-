// Server-side worldwide city search using GeoNames.
// The GeoNames username stays on the server and is never exposed to the browser.

const GEO_NAMES_URL = 'https://secure.geonames.org/searchJSON'
const clean = value => String(value ?? '').trim()

const send = (res, status, body) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  return res.status(status).json(body)
}

export function normalizeGeoNamesResults(rows = []) {
  return rows.map(row => {
    const city = clean(row.name)
    const state = clean(row.adminName1)
    const country = clean(row.countryName)
    const countryCode = clean(row.countryCode).toUpperCase()
    if (!city || !country) return null
    return {
      city, state, country, countryCode,
      region: state || country,
      routingRegion: countryCode === 'IN' ? state || country : 'International opportunities',
      value: [city, state, country].filter(Boolean).join(', '),
      source: 'geonames',
    }
  }).filter(Boolean)
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'Method not allowed' })

  const query = clean(req.query?.q || new URL(req.url || '', 'http://localhost').searchParams.get('q'))
  if (query.length < 2) return send(res, 200, { ok: true, locations: [] })

  const username = clean(process.env.GEONAMES_USERNAME)
  if (!username) return send(res, 503, { ok: false, error: 'Global location search is not configured' })

  const url = new URL(GEO_NAMES_URL)
  url.searchParams.set('q', query.slice(0, 80))
  url.searchParams.set('username', username)
  url.searchParams.set('maxRows', '50')
  url.searchParams.set('featureClass', 'P')
  url.searchParams.set('style', 'SHORT')
  url.searchParams.set('orderby', 'relevance')

  try {
    const response = await fetch(url)
    if (!response.ok) return send(res, 502, { ok: false, error: 'Global location provider unavailable' })
    const payload = await response.json()
    if (payload.status) return send(res, 502, { ok: false, error: payload.status.message || 'Global location provider rejected the request' })
    return send(res, 200, { ok: true, locations: normalizeGeoNamesResults(payload.geonames) })
  } catch (error) {
    console.error('Global location search failed', error?.message || error)
    return send(res, 502, { ok: false, error: 'Global location provider unavailable' })
  }
}
