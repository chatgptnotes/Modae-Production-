import { getAdminSupabaseClient } from './_supabase-client.js'
import { activeProfile } from './_user-roster.js'
import { isAccountAdmin } from '../src/userManagement.js'
import { AI_PROVIDERS, listProviderModels, generateProvider, ProviderError } from './_ai-providers.js'
import { readIntegrations, encryptIntegrations, publicIntegrations } from './_ai-integrations.js'

const supported = provider => Object.hasOwn(AI_PROVIDERS, provider)
const validKey = key => typeof key === 'string' && key.trim().length >= 8 && key.length <= 4096 && !/[\r\n]/.test(key)
// Real image/PDF transport probes prevent catalogue name inference from activating
// a model that only accepts text. This synthetic PDF contains no workspace data.
const probePdf = () => {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', '<< /Length 34 >>\nstream\nBT /F1 12 Tf 5 36 Td (Test) Tj ET\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  let pdf = '%PDF-1.4\n', offsets = [0]
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` }
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf).toString('base64')
}
const probeParts = () => [{ inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOHsAAAAASUVORK5CYII=' } }, { inlineData: { mimeType: 'application/pdf', data: probePdf() } }]
export function createAdminIntegrationsHandler(getClient = getAdminSupabaseClient, fetcher = fetch) {
  return async (req, res) => {
    res.setHeader?.('Cache-Control', 'no-store')
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'GET or POST only' })
    const client = getClient()
    if (!client) return res.status(503).json({ error: 'Connect a shared workspace to manage AI credentials.' })
    try {
      const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim()
      if (!token) return res.status(401).json({ error: 'Sign in to manage integrations.' })
      const { data, error } = await client.auth.getUser(token)
      if (error || !data?.user) return res.status(401).json({ error: 'Your session has expired.' })
      const actor = await activeProfile(client, data.user)
      if (!actor || !isAccountAdmin(actor)) return res.status(403).json({ error: 'Only active administrators can manage integrations.' })
      const config = await readIntegrations(client)
      if (req.method === 'GET') return res.status(200).json(publicIntegrations(config))
      const { operation, provider, key: suppliedKey, rev, text, document, enabled } = req.body || {}
      if (!['models', 'test', 'save'].includes(operation)) throw new ProviderError('Choose models, test or save.', 400)
      if (!supported(provider)) throw new ProviderError('Choose a supported provider.', 400)
      if (suppliedKey && !validKey(suppliedKey)) throw new ProviderError('Enter a valid API key.', 400)
      const key = suppliedKey?.trim() || config.providers[provider]?.key
      if (!key) throw new ProviderError('Add an API key for this provider.', 400, 'AI_KEY_MISSING')
      if (operation === 'models') return res.status(200).json({ models: await listProviderModels(provider, key, fetcher) })
      const next = { ...config, providers: { ...config.providers, [provider]: { key, enabled: enabled !== false } } }
      const catalogues = new Map()
      const validateSelection = async (selection, documentModel, allowDisabled = false) => {
        if (!selection || !supported(selection.provider) || typeof selection.model !== 'string') throw new ProviderError('Choose both a default model and a document/image model.', 400)
        const connection = next.providers[selection.provider]
        const previous = documentModel ? config.document : config.text
        // An explicit disable retains the previous selection but makes runtime
        // calls fail closed; it never silently reactivates the environment key.
        if (allowDisabled && connection?.enabled === false && connection.key && previous?.provider === selection.provider && previous?.model === selection.model) return previous
        if (!connection?.enabled || !connection?.key) throw new ProviderError('Both selected model providers must be enabled and configured.', 400)
        if (!catalogues.has(selection.provider)) catalogues.set(selection.provider, await listProviderModels(selection.provider, connection.key, fetcher))
        const model = catalogues.get(selection.provider).find(model => model.id === selection.model)
        if (!model?.text || documentModel && (!model.image || !model.pdf)) throw new ProviderError('The selected model is unavailable or does not support the required text, image and PDF inputs.', 400, 'AI_DOCUMENT_UNSUPPORTED')
        const output = await generateProvider({ provider: selection.provider, model: model.id, key: connection.key,
          capabilities: model, fetcher, requestBody: { contents: [{ parts: [{ text: 'Reply with JSON only: {"ok":true}' }, ...(documentModel ? probeParts() : [])] }],
            generationConfig: { maxOutputTokens: 256, responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } }, required: ['ok'] } } } })
        let parsed
        try { parsed = JSON.parse(output) } catch { throw new ProviderError('This model did not return the required JSON. Select another model.', 400) }
        if (parsed?.ok !== true) throw new ProviderError('This model failed the structured-output connection test.', 400)
        return { provider: selection.provider, model: model.id, capabilities: { text: model.text, image: model.image, pdf: model.pdf } }
      }
      if (operation === 'test') {
        const selection = await validateSelection({ provider, model: req.body.model }, Boolean(req.body.documentModel))
        return res.status(200).json({ ok: true, selection })
      }
      if (!Number.isSafeInteger(rev) || rev < 0 || rev !== config.rev) return res.status(409).json({ error: 'Integrations changed in another session. Reload before saving.' })
      // Saving a credential without activating models is safe; activation always retests both selections.
      const hasSelections = text || document || config.text || config.document
      const sameSelection = (a, b) => a?.provider === b?.provider && a?.model === b?.model
      const disableOnly = enabled === false && !suppliedKey && sameSelection(text || config.text, config.text) && sameSelection(document || config.document, config.document)
      if (disableOnly) {
        // Removing access must remain possible even when another provider is
        // unavailable. No unchanged credential or selection is being activated.
        next.text = config.text; next.document = config.document
      } else if (hasSelections) {
        next.text = await validateSelection(text || config.text, false, true)
        next.document = await validateSelection(document || config.document, true, true)
      } else {
        await listProviderModels(provider, key, fetcher)
      }
      const encrypted = encryptIntegrations(next)
      const saved = await client.rpc('save_ai_integrations', { p_ciphertext: encrypted.ciphertext, p_iv: encrypted.iv,
        p_rev: rev, p_actor_id: data.user.id, p_provider: provider })
      if (saved.error) throw saved.error
      return res.status(200).json(publicIntegrations({ ...next, rev: Number(saved.data) }))
    } catch (error) {
      const conflict = error?.code === '40001'
      return res.status(conflict ? 409 : error instanceof ProviderError ? error.status : 503).json({
        error: conflict ? 'Integrations changed in another session. Reload before saving.' : error instanceof ProviderError ? error.message : 'Could not update integrations. Check server configuration and migrations.',
        errorCode: error instanceof ProviderError ? error.code : 'AI_INTEGRATIONS_FAILED',
      })
    }
  }
}
export default createAdminIntegrationsHandler()
