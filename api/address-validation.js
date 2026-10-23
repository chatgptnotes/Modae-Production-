import { getAdminSupabaseClient } from './_supabase-client.js'
import { activeProfile } from './_user-roster.js'
import { canPerform } from '../src/accessPolicy.js'

const locationFields = ['eucLocation', 'sellToCustomerLocation']
const geography = new Set(['locality', 'postal_town', 'administrative_area_level_1', 'postal_code', 'country'])
const unavailable = message => ({ status: 'Needs Clarification', standardizedAddress: '', issues: [message], confidence: 'Low', source: '', canApply: false })

const loopback = value => {
  try { const url = new URL(value); return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash }
  catch { return false }
}
export const isLocalAddressValidationRequest = (req, environment = process.env.NODE_ENV) => environment !== 'production'
  && req.headers?.['x-wintrack-local-address'] === 'true'
  && loopback(`http://${req.headers?.host || ''}`) && loopback(req.headers?.origin || '')
  && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)

export function addressVerdict(data) {
  const { verdict = {}, address = {} } = data?.result || {}
  const components = address.addressComponents || []
  const issues = []
  const missing = address.missingComponentTypes || []
  if (missing.length) issues.push(`Missing: ${missing.join(', ').replaceAll('_', ' ')}.`)
  const conflict = components.filter(c => geography.has(c.componentType) && c.replaced && c.confirmationLevel === 'CONFIRMED')
  if (conflict.length) issues.push(`Google changed geographical components: ${conflict.map(c => c.componentType.replaceAll('_', ' ')).join(', ')}. Check against the source address.`)
  const uncertain = components.filter(c => c.confirmationLevel !== 'CONFIRMED')
  if (uncertain.length) issues.push(`Unconfirmed: ${uncertain.map(c => c.componentType.replaceAll('_', ' ')).join(', ')}.`)
  const changed = verdict.hasInferredComponents || verdict.hasReplacedComponents || verdict.hasSpellCorrectedComponents
    || components.some(c => c.inferred || c.replaced || c.spellCorrected)
  if (changed) issues.push('Suggested corrections or inferred details need your confirmation.')
  const has = types => components.some(c => types.includes(c.componentType) && c.confirmationLevel === 'CONFIRMED')
  const complete = verdict.addressComplete === true && !missing.length && !address.unresolvedTokens?.length
    && has(['locality', 'postal_town']) && has(['administrative_area_level_1']) && has(['postal_code']) && has(['country'])
    && has(['premise', 'street_number', 'subpremise'])
  const precise = ['PREMISE', 'SUB_PREMISE'].includes(verdict.validationGranularity)
  const valid = complete && precise && !uncertain.length && !changed && !verdict.hasUnconfirmedComponents
  if (!valid && !issues.length) issues.push('The complete street or premises address could not be confirmed.')
  return {
    status: conflict.length ? 'Invalid' : valid ? 'Valid' : 'Needs Clarification',
    standardizedAddress: address.formattedAddress || '', issues,
    confidence: valid ? 'High' : components.length ? 'Medium' : 'Low',
    source: 'Google Address Validation', canApply: Boolean(address.formattedAddress),
  }
}

export async function validateGoogleAddress(input, { key = process.env.GOOGLE_MAPS_API_KEY, fetcher = fetch } = {}) {
  const text = input.trim()
  if (!key) return unavailable('Address validation is unavailable until Google Maps is configured. You can keep this address.')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    if (text.length <= 280) {
      const response = await fetcher('https://addressvalidation.googleapis.com/v1:validateAddress', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
        body: JSON.stringify({ address: { addressLines: [text], ...(/\bindia\b/i.test(text) ? { regionCode: 'IN' } : {}) } }),
      })
      const body = await response.json()
      if (response.ok && body.result?.address?.addressComponents?.length) return addressVerdict(body)
      // Fall back only for coverage or genuinely absent address data, never billing/auth/quota errors.
      if (!response.ok && !(response.status === 400 && /unsupported|not supported|coverage/i.test(body.error?.message || ''))) {
        return unavailable('Google address validation is temporarily unavailable. You can keep this address.')
      }
    }
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
    url.searchParams.set('address', text); url.searchParams.set('key', key)
    const response = await fetcher(url, { signal: controller.signal })
    const body = await response.json()
    const match = response.ok && body.status === 'OK' ? body.results?.[0] : null
    if (!match) return unavailable('No reliable address match was available. This does not mean your address is invalid.')
    return { status: 'Needs Clarification', standardizedAddress: match.formatted_address || '',
      issues: [match.partial_match ? 'Only part of the address matched. Confirm the remaining details.' : 'A location matched, but the complete address was not validated.'],
      confidence: match.partial_match || ['APPROXIMATE', 'GEOMETRIC_CENTER'].includes(match.geometry?.location_type) ? 'Low' : 'Medium',
      source: 'Google Geocoding', canApply: false }
  } catch {
    return unavailable('Address validation could not finish. You can keep this address and continue.')
  } finally { clearTimeout(timeout) }
}

export function createAddressValidationHandler({ getClient = getAdminSupabaseClient, validate = validateGoogleAddress } = {}) {
  const buckets = new Map()
  let active = 0
  return async (req, res) => {
    res.setHeader?.('Cache-Control', 'private, no-store')
    if (req.method !== 'POST') { res.setHeader?.('Allow', 'POST'); return res.status(405).json({ error: 'POST only.' }) }
    try {
      let id = 'local-demo'
      if (!isLocalAddressValidationRequest(req)) {
      const token = /^Bearer\s+(.+)$/i.exec(String(req.headers?.authorization || '').trim())?.[1]
      if (!token) return res.status(401).json({ error: 'Sign in to check addresses.' })
      const client = getClient()
      if (!client) return res.status(503).json({ error: 'Address validation is unavailable.' })
      const auth = await client.auth.getUser(token)
      if (auth.error || !auth.data?.user) return res.status(401).json({ error: 'Your session has expired.' })
      const profile = await activeProfile(client, auth.data.user)
      if (!profile) return res.status(403).json({ error: 'This account no longer has workspace access.' })
      const settings = await client.from('settings').select('data').eq('id', 'config').is('deleted_at', null).maybeSingle()
      if (settings.error) throw settings.error
      if (!canPerform(profile, 'leads.edit', settings.data?.data || {})) return res.status(403).json({ error: 'Lead editing permission is required.' })
      id = auth.data.user.id
      }
      const fields = req.body?.fields
      if (!fields || typeof fields !== 'object' || Array.isArray(fields) || Object.keys(fields).length < 1
        || Object.keys(fields).some(k => !locationFields.includes(k) || typeof fields[k] !== 'string' || !fields[k].trim() || fields[k].length > 1000)
        || Object.keys(req.body).some(k => k !== 'fields')) return res.status(400).json({ error: 'Provide one or two addresses of at most 1,000 characters.' })
      const now = Date.now()
      for (const [key, bucket] of buckets) if (now - bucket.start >= 60000) buckets.delete(key)
      const bucket = buckets.get(id) || { start: now, count: 0 }
      if (bucket.count >= 10 || active >= 8 || buckets.size >= 10000) return res.status(429).json({ error: 'Address validation is busy. You can continue without it.' })
      bucket.count++; buckets.set(id, bucket); active++
      try {
        const deduplicated = new Map(), results = {}
        for (const [field, value] of Object.entries(fields)) {
          const text = value.trim()
          if (!deduplicated.has(text)) deduplicated.set(text, await validate(text))
          results[field] = deduplicated.get(text)
        }
        return res.status(200).json({ results })
      } finally { active-- }
    } catch { return res.status(503).json({ error: 'Address validation is unavailable. You can continue without it.' }) }
  }
}

export default createAddressValidationHandler()
