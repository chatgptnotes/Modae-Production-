import { runTaskResult } from '../ai.js'

const cache = new Map()
const PREFETCH_TIMEOUT = 9000
const MAX_CANDIDATES = 160

const text = value => String(value ?? '').trim()
const tokens = value => text(value).toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2)
const detailsFor = item => item?.structured || item?.details || {
  manufacturer: item?.manufacturer || item?.maker || item?.oem || '',
  model: item?.model || item?.series || '',
  productType: item?.productType || item?.type || '',
  size: item?.size || '',
  length: item?.length || '',
  voltage: item?.voltage || '',
}

export const allSparesCatalogueParts = priceLists => Object.entries(priceLists || {})
  .flatMap(([name, list]) => (list?.parts || []).map(part => ({
    ...part,
    list: name,
    version: list.version,
    currency: list.currency,
  })))

const catalogueSignature = priceLists => Object.entries(priceLists || {})
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, list]) => `${name}:${list?.version || ''}:${(list?.parts || []).map(part => `${part.pn}|${part.desc || ''}`).join(';')}`)
  .join('||')

const lineSignature = line => [line?.id, line?.custRef, line?.pn, line?.desc, line?.qty].map(text).join('|')

export const sparesScanKey = (oppId, line, priceLists) =>
  `${text(oppId)}::${lineSignature(line)}::${catalogueSignature(priceLists)}`

const candidatesFor = (line, priceLists) => {
  const query = new Set([
    ...tokens(line?.pn), ...tokens(line?.custRef), ...tokens(line?.desc),
    ...tokens(JSON.stringify(detailsFor(line))),
  ])
  const score = part => {
    const candidate = new Set([
      ...tokens(part?.pn), ...tokens(part?.desc),
      ...tokens(JSON.stringify(detailsFor(part))),
    ])
    const overlap = [...query].filter(token => candidate.has(token)).length
    const anchors = [...query].filter(token => /\d/.test(token) && candidate.has(token)).length
    return anchors * 10 + overlap
  }
  return allSparesCatalogueParts(priceLists)
    .map((part, index) => ({ part, score: score(part), index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_CANDIDATES)
    .map(item => item.part)
}

const suggestionsFrom = (line, candidates, result) => {
  const byPartNumber = new Map(candidates.map(part => [text(part.pn).toUpperCase(), part]))
  const seen = new Set()
  return (Array.isArray(result?.matches) ? result.matches : [])
    .map(match => {
      const part = byPartNumber.get(text(match.partNumber).toUpperCase())
      if (!part || seen.has(part.pn)) return null
      seen.add(part.pn)
      return {
        forPn: line.pn,
        pn: part.pn,
        desc: part.desc,
        conf: Math.max(0, Math.min(100, Number(match.confidence) || 0)),
        reason: text(match.reason) || 'AI identified a possible catalogue match.',
        note: `${part.list} ${part.version || ''} price list · ${part.currency || ''} ${part.price ?? ''}`.replace(/\s+/g, ' ').trim(),
        price: Number(part.price) || 0,
        currency: part.currency || 'INR',
        priceList: part.list,
        priceListVersion: part.version || '',
        priceState: 'Current',
        suggestedBy: 'AI',
      }
    })
    .filter(Boolean)
    .slice(0, 6)
}

export function getSparesMatchEntry(oppId, line, priceLists) {
  return cache.get(sparesScanKey(oppId, line, priceLists)) || null
}

export function clearSparesMatchCache() {
  cache.clear()
}

export function requestSparesMatch({ oppId, line, priceLists, model, fallback, timeoutMs = PREFETCH_TIMEOUT }) {
  const key = sparesScanKey(oppId, line, priceLists)
  const existing = cache.get(key)
  if (existing?.promise) return existing.promise
  if (existing?.status === 'ready') return Promise.resolve(existing)

  const candidates = candidatesFor(line, priceLists)
  const promise = runTaskResult('spares.match', {
    line: {
      pn: line.pn || '',
      customerReference: line.custRef || '',
      description: line.desc || '',
      quantity: line.qty || 0,
      details: detailsFor(line),
    },
    candidates: candidates.map(part => ({
      partNumber: part.pn,
      description: part.desc,
      list: part.list,
      version: part.version,
      details: detailsFor(part),
    })),
  }, { fallback, model, timeoutMs }).then(aiResult => {
    const payload = aiResult?.data?.data || aiResult?.data
    const next = payload
      ? { status: 'ready', suggestions: suggestionsFrom(line, candidates, payload), error: '' }
      : { status: 'error', suggestions: [], error: aiResult?.error || 'AI suggestions are unavailable. Search the approved price lists manually.' }
    cache.set(key, next)
    return next
  }).catch(error => {
    const next = { status: 'error', suggestions: [], error: error?.message || String(error) }
    cache.set(key, next)
    return next
  })

  cache.set(key, { status: 'loading', suggestions: [], error: '', promise })
  return promise
}

export function prefetchSparesMatches({ oppId, lines, priceLists, model, fallback, concurrency = 2 }) {
  const pending = (lines || []).filter(line => !line?.confirmed)
  let cursor = 0
  const worker = async () => {
    const results = []
    while (cursor < pending.length) {
      const line = pending[cursor++]
      const result = await requestSparesMatch({ oppId, line, priceLists, model, fallback })
      results.push({ line, result })
    }
    return results
  }
  return Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker))
}
