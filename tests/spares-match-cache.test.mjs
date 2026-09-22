import test from 'node:test'
import assert from 'node:assert/strict'
import { clearSparesMatchCache, getSparesMatchEntry, prefetchSparesMatches, requestSparesMatch } from '../src/workbench/sparesMatchCache.js'

const priceLists = {
  Meggitt: {
    version: '2026-02',
    currency: 'EUR',
    parts: [
      { pn: 'TQ402-A', desc: 'Proximity probe', price: 620 },
      { pn: 'VM600-MPC4', desc: 'Vibration monitoring card', price: 4750 },
    ],
  },
}

const responseFor = partNumber => ({
  ok: true,
  json: async () => ({ ok: true, data: { matches: [{ partNumber, confidence: 88, reason: 'matching evidence' }] } }),
})

test('background spares scans are deduplicated and cached for Compare', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return responseFor('TQ402-A')
  }
  try {
    clearSparesMatchCache()
    const line = { id: 'line-1', custRef: 'TQ402', pn: 'TQ402', desc: 'Proximity probe', qty: 6 }
    const first = requestSparesMatch({ oppId: 'opp-1', line, priceLists })
    const second = requestSparesMatch({ oppId: 'opp-1', line, priceLists })
    assert.strictEqual(first, second)
    const result = await first
    assert.equal(calls, 1)
    assert.equal(result.status, 'ready')
    assert.equal(result.suggestions[0].pn, 'TQ402-A')
    assert.equal(getSparesMatchEntry('opp-1', line, priceLists).status, 'ready')
  } finally {
    globalThis.fetch = originalFetch
    clearSparesMatchCache()
  }
})

test('prefetch scans every unresolved line and skips confirmed lines', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return responseFor('TQ402-A')
  }
  try {
    clearSparesMatchCache()
    await prefetchSparesMatches({
      oppId: 'opp-2',
      priceLists,
      lines: [
        { id: 'line-1', pn: 'TQ402', desc: 'Proximity probe', qty: 1 },
        { id: 'line-2', pn: 'MPC4', desc: 'Vibration monitoring card', qty: 1 },
        { id: 'line-3', pn: 'already-confirmed', confirmed: true, desc: 'Known item', qty: 1 },
      ],
    })
    assert.equal(calls, 2)
  } finally {
    globalThis.fetch = originalFetch
    clearSparesMatchCache()
  }
})
