import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { findPriceListMatch } from '../src/pricing.js'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

test('curated B&K parts resolve by exact or normalized part number', () => {
  const priceLists = {
    BNK: {
      version: 'Curated-2026-09',
      currency: 'EUR',
      parts: [
        { pn: 'EC-10', price: 148 },
        { pn: 'AGSC-51-4-CAB', price: 1300 },
        { pn: 'IN-081/3/110/50', price: 954 },
        { pn: 'MMS-6210', price: 2340 },
      ],
    },
  }
  for (const pn of ['EC-10', 'AGSC-51-4-CAB', 'IN081-3-110-50', 'MMS-6210']) {
    assert.equal(findPriceListMatch({ pn }, priceLists)?.matchKind, 'exact', pn)
  }
})

test('production catalogue migration is additive and carries the four curated rows', () => {
  const migration = fs.readFileSync(path.join(root, 'supabase/017_complete_bnk_catalogue.sql'), 'utf8')
  for (const pn of ['EC-10', 'AGSC-51-4-CAB', 'IN081-3-110-50', 'MMS-6210']) {
    assert.match(migration, new RegExp(`'${pn.replaceAll('-', '\\-')}'`))
  }
  assert.match(migration, /parts := parts \|\| jsonb_build_array\(item\)/)
  assert.doesNotMatch(migration, /delete from public\.(price_lists|price_list_versions)/)
})
