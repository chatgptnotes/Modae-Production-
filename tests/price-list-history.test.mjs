import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('src/datastore.js', 'utf8')
const extract = name => source.match(new RegExp(`(?:export )?async function ${name}\\([^]*?\\n\\}`))[0].replace('export ', '')

test('saving after hydration preserves unloaded archives, including cached archives', async () => {
  const archive = { id: 'old', version: 'Original', parts: [{ pn: 'A', price: 10 }] }
  const records = new Map([['price_list_versions|old', { data: archive, rev: 2 }]])
  const revisions = new Map([['price_list_versions|old', 2]])
  const writes = []
  const save = new Function('supabase', 'normalizedRecords', 'normalizedRevisions', `
    const normalizedKey = (entity,id) => entity+'|'+id;
    const currentActorId = async () => 'qa';
    const annotateRpcError = (entity,error) => error;
    const MAX_CONFLICT_RETRIES = 3;
    const CONSOLIDATED_PRICE_LIST_ENTITY = 'price_lists';
    const CONSOLIDATED_PRICE_VERSION_ENTITY = 'price_list_versions';
    const priceVersionRecordId = (list,version) => list+'::'+version;
    let priceListCache, priceListCacheAt;
    ${source.match(/function normalizedPayload\([^]*?\n\}/)[0]}
    ${extract('saveNormalizedRowsNow')}
    ${extract('savePriceLists')}
    return savePriceLists;
  `)({ rpc: async (name, payload) => { writes.push(payload); return { data: { conflicts: [] } } } }, records, revisions)
  await save({ QA: {
    version: 'Revised', currency: 'EUR', activeVersionId: 'new',
    versions: [{ id: 'old', version: 'Original', parts: [] }, { id: 'new', version: 'Revised', parts: [{ pn: 'A', price: 20 }] }],
  } })
  assert.deepEqual(records.get('price_list_versions|old').data.parts, [{ pn: 'A', price: 10 }])
  const versionWrite = writes.find(write => write.p_entity === 'price_list_versions')
  assert.equal(versionWrite.p_rows.some(row => row.id === 'old'), false)
  assert.equal(versionWrite.p_rows.find(row => row.id === 'new').data.parts[0].price, 20)
})

test('archive loading uses the saved record id instead of guessing from the label', async () => {
  let requested
  const load = new Function('supabase', 'loadEntityRows', `
    const priceVersionRecordId = (list,version) => list+'::'+version;
    const CONSOLIDATED_PRICE_VERSION_ENTITY = 'price_list_versions';
    const mapConsolidatedVersion = data => data;
    ${extract('loadPriceListVersion')}
    return loadPriceListVersion;
  `)({}, async (entity, options) => { requested = options.ids; return { data: [{ id: options.ids[0], data: { currency: 'EUR', parts: [{ pn:'A', price:10 }] } }] } })
  await load('QA', 'Original', 'QA-12345')
  assert.deepEqual(requested, ['QA-12345'])
})
