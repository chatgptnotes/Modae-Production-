import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspaceViewCache } from '../src/workspaceViewCache.js'

test('page cache makes no request within three minutes and retains older display data', async () => {
  let time = 0, calls = 0
  const cache = createWorkspaceViewCache({ now: () => time })
  const load = async () => ({ version: ++calls })
  await cache.read('inbox', load)
  time = 179999
  assert.equal((await cache.read('inbox', load)).version, 1)
  assert.equal(calls, 1)
  time = 180000
  assert.equal(cache.peek('inbox').fresh, false)
  assert.equal(cache.peek('inbox').value.version, 1)
  assert.equal((await cache.read('inbox', load)).version, 2)
})

test('refresh coalesces, invalidated responses cannot win, and snapshots are bounded', async () => {
  const cache = createWorkspaceViewCache({ maxEntries: 2 })
  await cache.read('a', async () => 'a')
  await cache.read('b', async () => 'b')
  cache.peek('a')
  await cache.read('c', async () => 'c')
  assert.equal(cache.peek('b'), null)
  cache.invalidate()
  assert.equal(cache.peek('a').fresh, false)
  let finish, calls = 0
  const load = () => { calls++; return new Promise(resolve => { finish = resolve }) }
  const first = cache.read('a', load, { force: true })
  const second = cache.read('a', load, { force: true })
  await Promise.resolve()
  assert.equal(calls, 1)
  cache.clear()
  finish('late')
  await assert.rejects(first, { code: 'VIEW_READ_INVALIDATED' })
  await assert.rejects(second, { code: 'VIEW_READ_INVALIDATED' })
  assert.equal(cache.peek('a'), null)
})

test('access changes evict old display snapshots and reject older in-flight reads', async () => {
  const cache = createWorkspaceViewCache()
  await cache.read('old', async () => ({ accessVersion: 'old' }))
  await cache.read('current', async () => ({ accessVersion: 'current' }))
  let finish
  const pending = cache.read('late', () => new Promise(resolve => { finish = resolve }))
  await Promise.resolve()
  cache.evict((key, value) => value.accessVersion !== 'current')
  assert.equal(cache.peek('old'), null)
  assert.equal(cache.peek('current').fresh, true)
  finish({ accessVersion: 'old' })
  await assert.rejects(pending, { code: 'VIEW_READ_INVALIDATED' })
})
