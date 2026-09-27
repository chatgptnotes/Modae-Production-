import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

export const ONLINE_WINDOW_MS = 2 * 60 * 1000
export const HEARTBEAT_INTERVAL_MS = 60 * 1000

export function countOnlineUsers(rows = [], now = Date.now()) {
  const onlineIds = new Set()
  for (const row of rows) {
    const lastSeen = Date.parse(row?.lastSeenAt || row?.last_seen_at || '')
    if (row?.userId && Number.isFinite(lastSeen) && lastSeen >= now - ONLINE_WINDOW_MS) onlineIds.add(row.userId)
  }
  return onlineIds.size
}

async function accessToken() {
  const { data, error } = await supabase?.auth?.getSession?.() || {}
  if (error) throw error
  return data?.session?.access_token || ''
}

async function presenceRequest(action) {
  const token = await accessToken()
  if (!token) return null
  const response = await fetch('/api/presence', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  if (!response.ok) throw new Error(`Presence request failed (${response.status})`)
  return response.json()
}

export const sendPresenceHeartbeat = () => presenceRequest('heartbeat')
export const getOnlineUserCount = async () => (await presenceRequest('status'))?.onlineCount ?? null

export function usePresenceHeartbeat(enabled) {
  useEffect(() => {
    if (!enabled || !supabase) return undefined
    const send = () => { sendPresenceHeartbeat().catch(() => {}) }
    send()
    const timer = window.setInterval(send, HEARTBEAT_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [enabled])
}

export function useOnlineUserCount(enabled) {
  const [onlineUserCount, setOnlineUserCount] = useState(null)

  useEffect(() => {
    if (!enabled || !supabase) { setOnlineUserCount(null); return undefined }
    let active = true
    const refresh = () => {
      getOnlineUserCount()
        .then(count => { if (active) setOnlineUserCount(count) })
        .catch(() => { if (active) setOnlineUserCount(null) })
    }
    refresh()
    const timer = window.setInterval(refresh, HEARTBEAT_INTERVAL_MS)
    return () => { active = false; window.clearInterval(timer) }
  }, [enabled])

  return onlineUserCount
}
