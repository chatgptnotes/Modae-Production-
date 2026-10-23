import { supabaseAuth } from './supabase.js'
import { createLeadAddressValidation } from './leadAddressValidation.js'
import { isLocalhost } from './authMode.js'

let sessionEpoch = 0
const extractionContexts = new WeakMap()
const latestExtractions = new Map()
const localDevelopment = () => Boolean(import.meta.env?.DEV && typeof window !== 'undefined' && isLocalhost(window.location.hostname))
const accountFor = store => store.auth?.source === 'supabase' || localDevelopment() ? store.auth?.user?.id : null

export async function requestAddressValidation(fields, signal, auth = supabaseAuth, fetcher = fetch) {
  const epoch = sessionEpoch
  const { data } = await auth?.getSession?.() || {}
  const session = data?.session
  const local = !session?.access_token && localDevelopment()
  if ((!session?.access_token && !local) || signal.aborted || epoch !== sessionEpoch) throw new Error('Address validation requires the original signed-in session.')
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, 22000)
  try {
    const response = await fetcher('/api/locations/validate', {
      method: 'POST', signal: controller.signal, cache: 'no-store',
      headers: { ...(local ? { 'X-WinTrack-Local-Address': 'true' } : { Authorization: `Bearer ${session.access_token}` }), 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })
    if (!response.ok) throw new Error('Address validation is unavailable.')
    const body = await response.json()
    const current = await auth?.getSession?.()
    if (current?.data?.session?.user?.id !== session?.user?.id || signal.aborted || epoch !== sessionEpoch) throw new Error('The account changed.')
    return body.results
  } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort) }
}

export const leadAddressValidation = createLeadAddressValidation(requestAddressValidation)
let sessionUser
supabaseAuth?.onAuthStateChange((event, session) => {
  const next = session?.user?.id || null
  if (event === 'SIGNED_OUT' || (sessionUser !== undefined && sessionUser !== next)) {
    sessionEpoch++
    latestExtractions.clear()
    leadAddressValidation.setAccount(null)
  }
  sessionUser = next
})

export function beginAddressExtraction(store, leadId) {
  const account = accountFor(store)
  leadAddressValidation.setAccount(account)
  const context = { account, epoch: sessionEpoch, leadId }
  if (leadId) {
    leadAddressValidation.invalidate(account, leadId)
    latestExtractions.delete(leadId)
    latestExtractions.set(leadId, context)
    while (latestExtractions.size > 20) latestExtractions.delete(latestExtractions.keys().next().value)
  }
  return context
}

export function rememberAddressExtraction(extracted, context) {
  if (extracted) extractionContexts.set(extracted, context)
}

export function validateExtractedLeadLocations(store, id, extracted, fields = extracted) {
  const context = extractionContexts.get(extracted)
  if (!context || context.account !== store.auth?.user?.id || context.epoch !== sessionEpoch) return
  if (context.leadId && (context.leadId !== id || latestExtractions.get(id) !== context)) return
  if (!accountFor(store) || !extracted?.ai?.scan?.complete) return
  leadAddressValidation.start(store.auth.user?.id, id, fields, extracted)
}

export function checkLeadLocations(store, id, fields) {
  const account = accountFor(store)
  if (!account) return
  leadAddressValidation.setAccount(account)
  latestExtractions.delete(id)
  leadAddressValidation.start(account, id, fields, {}, { preserveOtherFields: true })
}
