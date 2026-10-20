import test from 'node:test'
import assert from 'node:assert/strict'
import { createFontPreferenceSession, fontPreferenceKey } from '../src/userFontPreferences.js'
const storage = () => { const values = new Map(); return { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) } }
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b}); return {promise,resolve,reject} }

test('new font choices restore for their account without affecting other accounts', async () => {
 const cache = storage()
 for (const font of ['roboto', 'open-sans', 'merriweather', 'lora']) {
  const session = createFontPreferenceSession({key: 'local:a', storage: cache})
  await session.save(font)
  assert.equal(createFontPreferenceSession({key:'local:a',storage:cache}).getSnapshot().font, font)
  assert.equal(createFontPreferenceSession({key:'local:b',storage:cache}).getSnapshot().font, 'candara')
 }
})

test('local choices are isolated by account and invalid cached fonts fall back to Candara', async () => {
 const cache=storage(), first=createFontPreferenceSession({key:'local:a',storage:cache})
 await first.save('inter')
 assert.equal(createFontPreferenceSession({key:'local:a',storage:cache}).getSnapshot().font,'inter')
 assert.equal(createFontPreferenceSession({key:'local:b',storage:cache}).getSnapshot().font,'candara')
 cache.setItem(fontPreferenceKey('local:c'),JSON.stringify({font:'bad-css'}))
 assert.equal(createFontPreferenceSession({key:'local:c',storage:cache}).getSnapshot().font,'candara')
 await assert.rejects(first.save('bad-css'),/Choose a supported font/)
})
test('remote preferences require a pull and save using the authoritative revision', async () => {
 const calls=[]
 const session=createFontPreferenceSession({key:'supabase:a',remote:true,storage:storage(),request:async(method,body)=>{calls.push([method,body]);return method==='GET'?{font:'system',rev:4}:{font:body.font,rev:5}}})
 await assert.rejects(session.save('inter'),/Load/)
 await session.refresh(); await session.save('inter')
 assert.deepEqual(calls,[['GET',undefined],['PUT',{font:'inter',rev:4}]])
 assert.equal(session.getSnapshot().font,'inter')
})
test('failed and conflicting writes retain the saved font', async () => {
 const session=createFontPreferenceSession({key:'a',remote:true,storage:storage(),request:async method=>{if(method==='GET')return {font:'system',rev:8}; throw Object.assign(new Error('Reload settings before saving.'),{status:409})}})
 await session.refresh();await assert.rejects(session.save('inter'),/Reload/)
 assert.equal(session.getSnapshot().font,'system');assert.equal(session.getSnapshot().saving,false)
 assert.match(session.getSnapshot().error,/Reload/)
})
test('a slow refresh cannot overwrite a subsequent save', async () => {
 const slow=deferred();let reads=0
 const session=createFontPreferenceSession({key:'a',remote:true,request:async method=>method==='GET'?(++reads===1?{font:'candara',rev:1}:slow.promise):{font:'inter',rev:2}})
 await session.refresh();const pending=session.refresh();await session.save('inter');slow.resolve({font:'candara',rev:1});await pending
 assert.equal(session.getSnapshot().font,'inter');assert.equal(session.getSnapshot().rev,2)
})
test('disposed account sessions never write a late response to browser cache', async () => {
 const slow=deferred(),cache=storage();const session=createFontPreferenceSession({key:'a',remote:true,storage:cache,request:()=>slow.promise})
 const pending=session.refresh();session.dispose();slow.resolve({font:'inter',rev:9});await pending
 assert.equal(cache.getItem(fontPreferenceKey('a')),null)
})
test('storage denial does not block in-memory preferences',async()=>{
 const cache={getItem(){throw Error('denied')},setItem(){throw Error('denied')}}
 const session=createFontPreferenceSession({key:'a',storage:cache});await session.save('system');assert.equal(session.getSnapshot().font,'system')
})

test('sidebar choices restore independently per account and survive a font change', async () => {
 const cache = storage()
 const session = createFontPreferenceSession({ key: 'local:a', storage: cache })
 await session.saveLayout({ sidebarCompact: true })
 await session.saveLayout({ leadDetailsCollapsed: true })
 await session.save('inter')
 await session.saveLayout({ sidebarCompact: false })
 const restored = createFontPreferenceSession({ key: 'local:a', storage: cache }).getSnapshot()
 assert.equal(restored.sidebarCompact, false)
 assert.equal(restored.leadDetailsCollapsed, true)
 assert.equal(restored.font, 'inter')
 const other = createFontPreferenceSession({ key: 'local:b', storage: cache }).getSnapshot()
 assert.equal(other.sidebarCompact, false)
 assert.equal(other.leadDetailsCollapsed, false)
})

test('sidebar save is optimistic and rolls back on failure without changing font', async () => {
 const pending = deferred()
 const session = createFontPreferenceSession({ key: 'a', remote: true, request: async method => method === 'GET'
  ? { font: 'inter', sidebarCompact: false, leadDetailsCollapsed: true, rev: 3 } : pending.promise })
 await session.refresh()
 const saving = session.saveLayout({ sidebarCompact: true })
 assert.equal(session.getSnapshot().sidebarCompact, true)
 pending.reject(new Error('Offline. Try again.'))
 await assert.rejects(saving, /Offline/)
 assert.equal(session.getSnapshot().sidebarCompact, false)
 assert.equal(session.getSnapshot().leadDetailsCollapsed, true)
 assert.equal(session.getSnapshot().font, 'inter')
 assert.match(session.getSnapshot().error, /Offline/)
})

test('late sidebar saves cannot write to a disposed account cache', async () => {
 const cache = storage(), pending = deferred()
 const session = createFontPreferenceSession({ key: 'a', remote: true, storage: cache, request: async method => method === 'GET'
  ? { font: 'candara', sidebarCompact: false, leadDetailsCollapsed: false, rev: 1 } : pending.promise })
 await session.refresh()
 const saving = session.saveLayout({ leadDetailsCollapsed: true })
 session.dispose()
 pending.resolve({ font: 'candara', sidebarCompact: false, leadDetailsCollapsed: true, rev: 2 })
 await saving
 assert.equal(JSON.parse(cache.getItem(fontPreferenceKey('a'))).leadDetailsCollapsed, false)
})
