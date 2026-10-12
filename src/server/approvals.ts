import { createWorkspaceReader } from './workspace.js'
import { projectWorkspace } from '../workspaceAccess.js'
import { activeProfile } from '../../api/_user-roster.js'
import { createClient } from '@supabase/supabase-js'
import type { Request } from 'express'
import { createServiceClient } from './supabase.js'
import type { Database } from './database.types.js'

export type ApprovalUser = { id: string; profile?: Record<string, any>; config?: Record<string, any> }
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
      if (error || !data.user?.id) return null
      const profile = await activeProfile(service, data.user)
      if (!profile) return null
      const settings = await service.from('settings').select('data').eq('id', 'config').is('deleted_at', null).maybeSingle()
      if (settings.error) throw settings.error
      return { id: data.user.id, profile: { ...profile, authId: data.user.id }, config: (settings.data?.data || {}) as Record<string, any> }
    },
    async read(token) {
      const user = await this.authenticate(token)
      if (!user?.profile) throw new Error('An active account is required.')
      const workspace = await createWorkspaceReader()?.()
      return projectWorkspace(workspace || {}, user.profile).approvals || []
    },
    async readLive(token, _userId, entities) {
      const user = await this.authenticate(token)
      if (!user?.profile) throw new Error('An active account is required.')
      const workspace = await createWorkspaceReader()?.()
      const projected = projectWorkspace(workspace || {}, user.profile) as Record<string, any>
      return Object.fromEntries(entities.map(entity => [entity, projected[entity] || []])) as LiveData
    },
    publish: (entities = ['approvals']) => events.publish(entities),
    subscribe: listener => events.subscribe(listener),
  }
}
