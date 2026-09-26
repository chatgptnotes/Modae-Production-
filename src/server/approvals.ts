import { createClient } from '@supabase/supabase-js'
import type { Request } from 'express'
import { createServiceClient } from './supabase.js'
import type { Database } from './database.types.js'

export type ApprovalUser = { id: string }
export const liveEntities = ['approvals', 'leads', 'opportunities'] as const
export type LiveEntity = typeof liveEntities[number]
export type LiveData = Partial<Record<LiveEntity, unknown[]>>

export type ApprovalGateway = {
  authenticate: (token: string) => Promise<ApprovalUser | null>
  read: (token: string, userId: string) => Promise<unknown[]>
  readLive: (token: string, userId: string, entities: LiveEntity[]) => Promise<LiveData>
  publish: (entities?: LiveEntity[]) => void
  subscribe: (listener: (entities: LiveEntity[]) => void) => () => void
}

export class ApprovalEventHub {
  private listeners = new Set<(entities: LiveEntity[]) => void>()

  subscribe(listener: (entities: LiveEntity[]) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  publish(entities: LiveEntity[] = ['approvals']) {
    this.listeners.forEach(listener => listener(entities))
  }
}

const configuredValue = (...names: string[]) => names.map(name => process.env[name]?.trim()).find(Boolean) || ''

export function authorizationToken(request: Request) {
  return String(request.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
}

export function requestedLiveEntities(value: unknown): LiveEntity[] | null {
  const requested = (Array.isArray(value) ? value : String(value || '').split(','))
    .map(entity => String(entity).trim()).filter(Boolean)
  if (!requested.length || requested.some(entity => !liveEntities.includes(entity as LiveEntity))) return null
  return [...new Set(requested)] as LiveEntity[]
}

export function createApprovalGateway(events = new ApprovalEventHub()): ApprovalGateway | null {
  const url = configuredValue('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const serviceRoleKey = configuredValue('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = configuredValue('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')
  if (!url || !serviceRoleKey || !anonKey) return null
  const service = createServiceClient(url, serviceRoleKey)
  return {
    async authenticate(token) {
      const { data, error } = await service.auth.getUser(token)
      return error || !data.user?.id ? null : { id: data.user.id }
    },
    async read(token) {
      // Use the caller's token, not the service role, so Supabase RLS continues
      // to decide exactly which approval rows this browser may receive.
      const client = createClient<Database>(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
      const { data, error } = await client.from('approvals').select('data').is('deleted_at', null)
      if (error) throw error
      return (data || []).map(row => row.data)
    },
    async readLive(token, _userId, entities) {
      // Reads always use the visitor's bearer token. The service role is used
      // only to validate that token, never to bypass row-level security.
      const client = createClient<Database>(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
      const rows = await Promise.all(entities.map(async entity => {
        const { data, error } = await client.from(entity).select('data').is('deleted_at', null)
        if (error) throw error
        return [entity, (data || []).map(row => row.data)] as const
      }))
      return Object.fromEntries(rows) as LiveData
    },
    publish: (entities = ['approvals']) => events.publish(entities),
    subscribe: listener => events.subscribe(listener),
  }
}
