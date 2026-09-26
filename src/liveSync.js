import { supabaseAuth } from './supabase.js'

export const LIVE_ENTITIES = new Set(['approvals', 'leads', 'opportunities'])

const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

async function accessToken() {
  const { data } = await supabaseAuth?.getSession?.() || {}
  return data?.session?.access_token || ''
}

export function liveDataUrl(entities) {
  return `/api/live-data?entities=${encodeURIComponent(entities.join(','))}`
}

export function parseLiveEvent(block) {
  const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim()
  const rawData = block.match(/^data:\s*(.+)$/m)?.[1]
  if (event !== 'changed' || !rawData) return []
  try {
    const entities = JSON.parse(rawData).entities
    return Array.isArray(entities) ? [...new Set(entities.filter(entity => LIVE_ENTITIES.has(entity)))] : []
  } catch { return [] }
}

export async function readLiveData(entities) {
  const token = await accessToken()
  if (!token || !entities.length) return null
  const response = await fetch(liveDataUrl(entities), { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error(`Live data refresh failed (${response.status})`)
  const body = await response.json()
  return body.data || null
}

export async function publishLiveChanges(entities) {
  const changed = [...new Set(entities.filter(entity => LIVE_ENTITIES.has(entity)))]
  const token = await accessToken()
  if (!token || !changed.length) return false
  const response = await fetch('/api/live-events/publish', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ entities: changed }),
  })
  if (!response.ok) throw new Error(`Live update publish failed (${response.status})`)
  return true
}

export function startLiveEvents({ onChange, onError = () => {} }) {
  let stopped = false
  let controller = null
  let retry = 1000

  const connect = async () => {
    while (!stopped) {
      try {
        const token = await accessToken()
        if (!token) return
        controller = new AbortController()
        const response = await fetch('/api/live-events', {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        })
        if (!response.ok || !response.body) throw new Error(`Live event connection failed (${response.status})`)
        retry = 1000
        // A reconnect can miss an in-memory notification. Refresh these three
        // small collaborative slices once, never the complete workspace.
        await onChange(['approvals', 'leads', 'opportunities'])
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let pending = ''
        while (!stopped) {
          const { value, done } = await reader.read()
          if (done) break
          pending += decoder.decode(value, { stream: true })
          const blocks = pending.split(/\r?\n\r?\n/)
          pending = blocks.pop() || ''
          for (const block of blocks) {
            const entities = parseLiveEvent(block)
            if (entities.length) await onChange(entities)
          }
        }
      } catch (error) {
        if (!stopped && error?.name !== 'AbortError') onError(error)
      }
      if (!stopped) { await pause(retry); retry = Math.min(retry * 2, 15000) }
    }
  }
  void connect()
  return () => { stopped = true; controller?.abort() }
}
