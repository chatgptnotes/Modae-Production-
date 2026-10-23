import test from 'node:test'
import assert from 'node:assert/strict'
import { createDocumentsPreferences, documentsKeys } from '../src/documentsPreferences.js'
const storage = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), clear: () => data.clear() } }
test('document preferences separate device choices from per-user and scope navigation', () => {
  const local = storage(), session = storage()
  const a = createDocumentsPreferences('alice', 'global', local, session)
  a.save({layout:'list',sort:'customer',search:'Acme',statusFilter:'WON',collapsed:['Closed'],scroll:{'/folders':400}})
  assert.equal(createDocumentsPreferences('alice','my',local,session).read().layout,'list')
  assert.equal(createDocumentsPreferences('alice','my',local,session).read().search,'')
  assert.equal(createDocumentsPreferences('bob','global',local,session).read().layout,'grid')
  assert.equal(a.read().scroll['/folders'],400)
  local.clear(); session.clear()
  assert.equal(a.read().layout,'grid')
  assert.equal(a.read().search,'')
})
test('document preferences validate corrupt values and survive unavailable storage', () => {
  const local=storage(), session=storage(), keys=documentsKeys('alice','global')
  local.setItem(keys.device, '{broken')
  session.setItem(keys.tab, JSON.stringify({search:12,statusFilter:'bad',collapsed:['Open','bad'],scroll:{'/folders':-3}}))
  const prefs=createDocumentsPreferences('alice','global',local,session)
  assert.deepEqual(prefs.read(),{layout:'grid',sort:'id',search:'',statusFilter:'All',collapsed:['Open'],scroll:{}})
  const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}}
  const fallback=createDocumentsPreferences('alice','global',blocked,blocked)
  fallback.save({layout:'list',search:'pump'})
  assert.equal(fallback.read().layout,'list')
  assert.equal(fallback.read().search,'pump')
  const remounted=createDocumentsPreferences('alice','global',blocked,blocked)
  assert.equal(remounted.read().search,'pump')
  assert.equal(createDocumentsPreferences('alice','my',blocked,blocked).read().search,'')
})

test('unlinked SharePoint folder filter persists for the current tab', () => {
  const local = storage(), session = storage()
  const prefs = createDocumentsPreferences('alice', 'global', local, session)
  prefs.save({ statusFilter: 'Unlinked', collapsed: ['Unlinked'] })
  assert.equal(prefs.read().statusFilter, 'Unlinked')
  assert.deepEqual(prefs.read().collapsed, ['Unlinked'])
})
