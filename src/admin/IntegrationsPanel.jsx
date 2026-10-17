import React, { useEffect, useState } from 'react'
import { supabaseAuth } from '../supabase.js'
import './IntegrationsPanel.css'

const PROVIDERS = { gemini: 'Google Gemini', openai: 'OpenAI', anthropic: 'Anthropic Claude', xai: 'xAI', deepseek: 'DeepSeek', mistral: 'Mistral', openrouter: 'OpenRouter' }
async function request(body) {
  const { data } = await supabaseAuth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('Sign in to the shared workspace to manage integrations.')
  const response = await fetch('/api/admin-integrations', { method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Could not update integrations.')
  return result
}
export default function IntegrationsPanel({ store }) {
  const connected = store?.auth?.source === 'supabase'
  const [config, setConfig] = useState(null), [provider, setProvider] = useState('gemini')
  const [key, setKey] = useState(''), [models, setModels] = useState({})
  const [text, setText] = useState(null), [document, setDocument] = useState(null)
  const [enabled, setEnabled] = useState(true), [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(''), [error, setError] = useState('')
  const install = result => { setConfig(result); setText(result.text); setDocument(result.document); setEnabled(!result.providers[provider]?.configured || result.providers[provider]?.enabled !== false) }
  const act = async fn => { setBusy(true); setError(''); setMessage(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) } }
  useEffect(() => { if (connected) void act(async () => install(await request())) }, [connected])
  if (!connected) return <section className="integrations-panel"><h3>AI integrations</h3><p>Sign in to a connected workspace as an administrator to add API keys and choose models. Local demo accounts cannot change server credentials.</p></section>
  const choices = Object.entries(models).flatMap(([p, list]) => list.map(model => ({ ...model, provider: p })))
  // Preserve saved choices before catalogues are refreshed, without treating them as new discovered models.
  for (const selection of [text, document]) if (selection && !choices.some(m => m.provider === selection.provider && m.id === selection.model)) choices.push({ provider: selection.provider, id: selection.model, name: selection.model, ...selection.capabilities })
  const selectModel = (value, setter) => { const model = choices.find(m => `${m.provider}:${m.id}` === value); setter(model ? { provider: model.provider, model: model.id, capabilities: { text: model.text, image: model.image, pdf: model.pdf } } : null) }
  const select = (label, selection, setter, docs = false) => <label>{label}<select name={docs ? 'ai-document-model' : 'ai-default-model'} disabled={busy} value={selection ? `${selection.provider}:${selection.model}` : ''} onChange={e => selectModel(e.target.value, setter)}><option value="">Choose a model</option>{choices.filter(m => m.text && (!docs || m.image && m.pdf)).map(m => <option key={`${m.provider}:${m.id}`} value={`${m.provider}:${m.id}`}>{PROVIDERS[m.provider]} — {m.name}</option>)}</select></label>
  return <section className="integrations-panel"><h3>AI integrations</h3><p>Add a provider key, refresh its models, then choose your default and document models. Keys stay encrypted on the server.</p>
    <div className="integration-providers">{Object.entries(PROVIDERS).map(([id, name]) => <button type="button" disabled={busy} key={id} aria-pressed={provider === id} onClick={() => { setProvider(id); setKey(''); setEnabled(!config?.providers[id]?.configured || config?.providers[id]?.enabled !== false); setMessage(''); setError('') }}><strong>{name}</strong><span>{config?.providers[id]?.configured ? config.providers[id].enabled ? 'Connected' : 'Disabled' : 'Not configured'}</span></button>)}</div>
    <fieldset disabled={busy || !config}><legend>{PROVIDERS[provider]}</legend><label>API key {config?.providers[provider]?.credential}<input name="ai-provider-api-key" type="password" autoComplete="new-password" value={key} onChange={e => setKey(e.target.value)} placeholder={config?.providers[provider]?.configured ? 'Leave blank to retain saved key' : 'Enter API key'} /></label>
      <label className="integration-toggle"><input name="ai-provider-enabled" type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Enable this provider</label><small>Disabling a selected provider stops its AI tasks until you enable it or select another provider.</small>
      <button type="button" onClick={() => act(async () => { const result = await request({ operation: 'models', provider, key }); setModels(prev => ({ ...prev, [provider]: result.models })); setMessage(`${result.models.length} compatible text models loaded. The document list requires image and PDF support.`) })}>Refresh models</button>
      {select('Default model', text, setText)}{select('Document/image model', document, setDocument, true)}
      <div className="integration-actions"><button type="button" disabled={!text || !document} onClick={() => act(async () => { for (const [selection, documentModel] of [[text, false], [document, true]]) await request({ operation: 'test', provider: selection.provider, key: selection.provider === provider ? key : '', model: selection.model, documentModel }); setMessage('Both selected models passed the connection and JSON response test. Save to activate.') })}>Test connection</button>
      <button type="button" onClick={() => act(async () => { install(await request({ operation: 'save', provider, key, enabled, rev: config.rev, text, document })); setKey(''); setMessage(text && document ? 'AI integration saved and models activated.' : 'Credential saved. Choose both models to activate them.') })}>Save</button></div>
    </fieldset>
    {busy && <p role="status">Checking provider configuration…</p>}{message && <p role="status">{message}</p>}{error && <p role="alert">{error} <button type="button" disabled={busy} onClick={() => act(async () => { install(await request()); setKey(''); setMessage('Current settings reloaded.') })}>Reload settings</button></p>}
  </section>
}
