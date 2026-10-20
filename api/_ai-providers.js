// Provider endpoints are fixed: credentials cannot be forwarded to arbitrary hosts.
export const AI_PROVIDERS = Object.freeze({
  gemini: { name: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta', kind: 'gemini' },
  openai: { name: 'OpenAI', base: 'https://api.openai.com/v1', kind: 'chat' },
  anthropic: { name: 'Anthropic Claude', base: 'https://api.anthropic.com/v1', kind: 'anthropic' },
  xai: { name: 'xAI', base: 'https://api.x.ai/v1', kind: 'chat' },
  deepseek: { name: 'DeepSeek', base: 'https://api.deepseek.com', kind: 'chat' },
  mistral: { name: 'Mistral', base: 'https://api.mistral.ai/v1', kind: 'chat' },
  openrouter: { name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', kind: 'chat' },
})
export const AI_UPSTREAM_TIMEOUT_MS = 40000
export const providerHeaders = (provider, key) => ({ 'Content-Type': 'application/json',
  ...(provider === 'gemini' ? { 'x-goog-api-key': key } : provider === 'anthropic'
    ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' } : { Authorization: `Bearer ${key}` }) })

export class ProviderError extends Error {
  constructor(message, status = 502, code = 'AI_UPSTREAM_FAILED') { super(message); this.status = status; this.code = code }
}
export function checkProviderResponse(response, provider) {
  if (response.ok) return
  const code = [401, 403].includes(response.status) ? 'AI_KEY_REJECTED' : response.status === 404
    ? 'AI_MODEL_UNAVAILABLE' : response.status === 429 ? 'AI_RATE_LIMITED' : 'AI_UPSTREAM_FAILED'
  throw new ProviderError(`${AI_PROVIDERS[provider]?.name || 'AI provider'} returned HTTP ${response.status}. Check the credential, model access and provider quota.`, 502, code)
}
export function normalizeModel(provider, row) {
  const id = String(row.id || row.name || '').replace(/^models\//, '')
  const modalities = row.architecture?.input_modalities || row.input_modalities || []
  const outputs = row.architecture?.output_modalities || row.output_modalities || []
  const excluded = /embedding|moderation|whisper|tts|transcrib|realtime|dall-e|image-gen|gpt-image|ocr|audio|speech/i.test(id)
  let text = !excluded && (!outputs.length || outputs.includes('text'))
  if (provider === 'gemini') text = text && (row.supportedGenerationMethods || []).includes('generateContent')
  if (provider === 'mistral') text = text && row.capabilities?.completion_chat === true
  if (provider === 'openai') text = text && /^(gpt-|chatgpt-|o[1-9])/.test(id) && !/codex|search|deep-research|pro$/.test(id)
  const image = text && (modalities.includes('image') || row.capabilities?.vision === true || provider === 'gemini' && /^gemini-/.test(id)
    || (provider === 'anthropic' && /^claude-(?:[3-9]|sonnet|opus|haiku)/.test(id))
    || (provider === 'openai' && /^(gpt-(?:4o|4\.1|[5-9])|o[3-9])/.test(id)))
  // PDF transport is deliberately conservative. Image-only endpoints must not silently drop PDFs.
  const pdf = text && (['gemini', 'anthropic'].includes(provider) && image
    || ['openai', 'openrouter'].includes(provider) && image && (provider === 'openai' || modalities.includes('file')))
  return { id, name: String(row.displayName || row.display_name || row.name || id).replace(/^models\//, ''), text, image: !!image, pdf: !!pdf }
}
export async function listProviderModels(provider, key, fetcher = fetch) {
  const spec = AI_PROVIDERS[provider]
  if (!spec) throw new ProviderError('Unknown provider.', 400)
  const rows = []; let cursor = ''
  for (let page = 0; page < 20; page += 1) {
    const suffix = provider === 'gemini' ? `?pageSize=1000${cursor ? `&pageToken=${encodeURIComponent(cursor)}` : ''}`
      : provider === 'anthropic' ? `?limit=1000${cursor ? `&after_id=${encodeURIComponent(cursor)}` : ''}` : ''
    const response = await fetcher(`${spec.base}/models${suffix}`, { headers: providerHeaders(provider, key), signal: AbortSignal.timeout(15000) })
    checkProviderResponse(response, provider)
    const body = await response.json()
    rows.push(...(body.models || body.data || []))
    cursor = provider === 'gemini' ? body.nextPageToken : provider === 'anthropic' && body.has_more ? body.last_id : ''
    if (!cursor) return rows.map(row => normalizeModel(provider, row)).filter(row => row.text).sort((a, b) => a.id.localeCompare(b.id))
  }
  throw new ProviderError('The provider model catalogue exceeded the supported page limit. Narrow the provider account catalogue and retry.')
}
const lowerSchema = value => Array.isArray(value) ? value.map(lowerSchema) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).map(([key, val]) => [key, key === 'type' && typeof val === 'string' ? val.toLowerCase() : lowerSchema(val)])) : value

export function providerRequest(provider, model, key, geminiBody, capabilities) {
  const spec = AI_PROVIDERS[provider]
  if (!spec) throw new ProviderError('Unknown provider.', 400)
  const parts = geminiBody.contents.flatMap(content => content.parts)
  const files = parts.filter(part => part.inlineData)
  if (capabilities && files.some(({ inlineData: file }) => file.mimeType === 'application/pdf' ? !capabilities.pdf : !file.mimeType.startsWith('image/') || !capabilities.image))
    throw new ProviderError('The selected model does not support this document type. Choose a compatible document model in Admin Integrations.', 400, 'AI_DOCUMENT_UNSUPPORTED')
  if (provider === 'gemini') return { url: `${spec.base}/models/${encodeURIComponent(model)}:generateContent`,
    headers: providerHeaders(provider, key), body: geminiBody }
  const structured = geminiBody.generationConfig?.responseMimeType === 'application/json'
  const schema = lowerSchema(geminiBody.generationConfig?.responseSchema)
  let prompt = parts.filter(part => part.text).map(part => part.text).join('\n')
  if (structured) prompt += `\nReturn only a JSON object matching this schema, without Markdown fences:\n${JSON.stringify(schema)}`
  const maxTokens = Math.max(geminiBody.generationConfig?.maxOutputTokens || 2048, 256)
  if (provider === 'anthropic') {
    const content = [{ type: 'text', text: prompt }, ...files.map(({ inlineData: file }) => ({
      type: file.mimeType === 'application/pdf' ? 'document' : 'image',
      source: { type: 'base64', media_type: file.mimeType, data: file.data },
    }))]
    return { url: `${spec.base}/messages`, headers: providerHeaders(provider, key), body: { model, max_tokens: maxTokens, messages: [{ role: 'user', content }] } }
  }
  const content = [{ type: 'text', text: prompt }, ...files.map(({ inlineData: file }, i) => file.mimeType === 'application/pdf'
    ? { type: 'file', file: { filename: `document-${i + 1}.pdf`, file_data: `data:application/pdf;base64,${file.data}` } }
    : { type: 'image_url', image_url: { url: `data:${file.mimeType};base64,${file.data}` } })]
  return { url: `${spec.base}/chat/completions`, headers: providerHeaders(provider, key), body: { model,
    ...(provider === 'openai' ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
    messages: [{ role: 'user', content: files.length ? content : prompt }],
    ...(structured ? { response_format: { type: 'json_object' } } : {}),
    ...(provider === 'openrouter' ? { provider: { allow_fallbacks: false, require_parameters: true } } : {}),
  } }
}
export const providerText = (provider, body) => provider === 'gemini'
  ? body?.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('') || ''
  : provider === 'anthropic' ? body?.content?.filter(p => p.type === 'text').map(p => p.text).join('') || ''
    : body?.choices?.[0]?.message?.content || ''

export async function generateProvider({ provider, model, key, requestBody, capabilities, fetcher = fetch }) {
  const request = providerRequest(provider, model, key, requestBody, capabilities)
  let response
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetcher(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body), signal: AbortSignal.timeout(AI_UPSTREAM_TIMEOUT_MS) })
    if (response.status !== 429 || attempt === 2) break
    if (process.env.NODE_ENV !== 'test') await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)))
  }
  checkProviderResponse(response, provider)
  const text = providerText(provider, await response.json())
  if (!text) throw new ProviderError('The AI provider returned no usable output.', 502, 'AI_EMPTY_RESPONSE')
  return text
}
