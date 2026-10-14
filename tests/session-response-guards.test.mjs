import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../src/store.jsx', import.meta.url), 'utf8')
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))
function harness() {
  let resolve, reject
  const pending = new Promise((yes, no) => { resolve = yes; reject = no })
  const effects = [], timers = []
  const ctx = vm.createContext({
    authEpochRef: { current: 1 }, authInvalidRef: { current: false },
    stateRef: { current: { auth: { user: { id: 'A' } }, opportunities: [{ id: 'draft' }] } },
    hydratedRef: { current: true }, permanentPurgeRef: { current: false },
    saveTimerRef: { current: null }, saveRetryRef: { current: { attempts: 0, retryAt: 0, timer: null } },
    lastSavedRef: { current: {} }, workspaceSyncState: { ready: true, enabled: false },
    workspaceDrafts: { entries: new Map(), blocked: () => false },
    datastore: { dbEnabled: () => true, loadSourcingData: () => pending, loadOpportunity: () => pending,
      loadApprovalDecisionState: () => pending, saveSlices: () => pending },
    dirtySlices: () => ({ opportunities: [{ id: 'draft' }] }),
    registerDirtyRecords() {}, persistLocalSnapshot() {}, clearTimeout() {},
    setTimeout: fn => { timers.push(fn); return timers.length },
    setAdminSaveState: v => effects.push(['save', v]), setLiveSyncStatus: v => effects.push(['live', v]),
    setSourcingDataStatus: v => effects.push(['sourcing', v]), setSourcingDataError: v => effects.push(['error', v]),
    setSyncDiagnostics: () => effects.push(['diagnostics']),
    setState: fn => { effects.push(['state']); ctx.stateRef.current = fn(ctx.stateRef.current) },
    applyServer: () => effects.push(['install']), getWorkspaceGeneration: () => '1',
    invalidateSupabaseAuth: e => { if (e.status === 401) { effects.push(['signout']); return true } return false },
    window: { location: { reload: () => effects.push(['reload']) } }, console: { warn() {} },
  })
  const methods = between('  async refreshSourcingData()', '    // ---- Auth (demo login')
  vm.runInContext(`${between('  const flushSaves =', '  const flushLocalCache =')}
    ${between('  const refreshDecisionState =', '  // Pull only on user/lifecycle events.')}
    globalThis.api = {${methods}}; globalThis.save = flushSaves`, ctx)
  return { ctx, effects, timers, resolve, reject, switchSession(sameAccount = false) {
    ctx.authEpochRef.current++
    if (!sameAccount) ctx.stateRef.current.auth.user.id = 'B'
    effects.length = 0
  } }
}

for (const method of ['refreshSourcingData', 'refreshApprovals', 'recoverOpportunity']) {
  for (const sameAccount of [false, true]) {
    test(`${method} ignores old authentication errors after ${sameAccount ? 'same-account relogin' : 'account switch'}`, async () => {
      const h = harness(), result = h.ctx.api[method]('OPP')
      h.switchSession(sameAccount)
      h.reject(Object.assign(new Error('Old request expired'), { status: 401 }))
      assert.equal(await result, false)
      assert.deepEqual(h.effects, [])
    })
  }
  test(`${method} ignores old successful reads after same-account relogin`, async () => {
    const h = harness(), result = h.ctx.api[method]('OPP')
    h.switchSession(true)
    h.resolve(method === 'recoverOpportunity' ? { id: 'OPP' } : { opportunities: [] })
    assert.equal(await result, false)
    assert.deepEqual(h.effects, [])
  })
}

for (const method of ['refreshSourcingData', 'refreshApprovals']) {
  test(`${method} still handles authentication errors in the current session`, async () => {
    const h = harness(), result = h.ctx.api[method]()
    h.reject(Object.assign(new Error('Session expired'), { status: 401 }))
    await result
    assert.ok(h.effects.some(([effect]) => effect === 'signout'))
  })
}

for (const error of [null, { status: 401 }, { status: 503 }, { code: 'WORKSPACE_PURGED' }]) {
  test(`old save response has no effects after same-account relogin: ${JSON.stringify(error)}`, async () => {
    const h = harness(), result = h.ctx.save()
    h.switchSession(true)
    if (error) h.reject(Object.assign(new Error('Old save'), error))
    else h.resolve()
    assert.equal(await result, false)
    assert.deepEqual(h.effects, [])
    assert.equal(h.timers.length, 0)
    assert.deepEqual(Object.keys(h.ctx.lastSavedRef.current), [])
  })
}

test('a previously scheduled save retry cannot run in a new session', async () => {
  const h = harness(), result = h.ctx.save()
  h.reject(Object.assign(new Error('Temporary failure'), { status: 503 }))
  await result
  assert.equal(h.timers.length, 1)
  h.switchSession()
  h.timers[0]()
  await Promise.resolve()
  assert.deepEqual(h.effects, [])
})

test('successful current-session save still advances its baseline', async () => {
  const h = harness(), result = h.ctx.save()
  h.resolve()
  assert.equal(await result, true)
  assert.equal(h.ctx.lastSavedRef.current.opportunities[0].id, 'draft')
  assert.ok(h.effects.some(([effect, value]) => effect === 'save' && value === 'saved'))
})
