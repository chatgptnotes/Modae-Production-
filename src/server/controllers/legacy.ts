import type { RequestHandler } from 'express'
import aiHandler from '../../../api/ai.js'
import adminUsersHandler from '../../../api/admin-users.js'
import appVersionHandler from '../../../api/app-version.js'
import locationsHandler from '../../../api/locations.js'
import purgeWorkspaceHandler from '../../../api/purge-workspace.js'
import sendProposalEmailHandler from '../../../api/send-proposal-email.js'
import presenceHandler from '../../../api/presence.js'

type LegacyHandler = (request: Parameters<RequestHandler>[0], response: Parameters<RequestHandler>[1]) => void | Promise<void>

// These adapters make Express the runtime owner while retaining the thoroughly
// tested request validation and authorisation logic from the Vercel handlers.
export function controller(handler: LegacyHandler): RequestHandler {
  return async (req, res, next) => {
    const setHeader = res.setHeader.bind(res)
    res.setHeader = ((name: string, value: number | string | readonly string[]) => {
      if (name.toLowerCase() === 'access-control-allow-origin') return res
      return setHeader(name, value)
    }) as typeof res.setHeader
    try { await handler(req, res) } catch (error) { next(error) }
  }
}

export const ai = controller(aiHandler)
export const adminUsers = controller(adminUsersHandler)
export const appVersion = controller(appVersionHandler)
export const locations = controller(locationsHandler)
export const purgeWorkspace = controller(purgeWorkspaceHandler)
export const sendProposalEmail = controller(sendProposalEmailHandler)
export const presence = controller(presenceHandler)
