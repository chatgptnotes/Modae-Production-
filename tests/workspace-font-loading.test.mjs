import test from 'node:test'
import assert from 'node:assert/strict'
import { fontAvailable, requireDocumentFont } from '../src/workspaceFonts.js'
import { createUserPreferencesRequest } from '../src/userPreferencesApi.js'

test('each new choice checks its own loaded font face', async () => {
 for (const [id, family] of [['roboto', 'Roboto'], ['open-sans', 'Open Sans'], ['merriweather', 'Merriweather'], ['lora', 'Lora']]) {
  assert.equal(await fontAvailable(id, { load: async query => {
   assert.equal(query, `16px "WinTrack ${family}"`)
   return [{}]
  }}), true)
 }
 assert.equal(await fontAvailable('unsupported', {load: async () => [{}]}), false)
})

test('font availability requires a loaded face, not merely a fallback font check',async()=>{
 assert.equal(await fontAvailable('candara',{load:async()=>[]}),false)
 assert.equal(await fontAvailable('candara',{load:async()=>{throw Error('missing')}}),false)
 assert.equal(await fontAvailable('inter',{load:async()=>[{}]}),true)
})
test('printing requires every Candara face and waits for fonts to be ready',async()=>{
 const loads=[]
 await requireDocumentFont({load:async value=>{loads.push(value);return [{}]},ready:Promise.resolve()})
 assert.equal(loads.length,4)
 await assert.rejects(requireDocumentFont({load:async()=>[],ready:Promise.resolve()}),/Candara/)
})
test('API client refuses a session belonging to a different account',async()=>{
 let called=false
 const request=createUserPreferencesRequest('A',{getSession:async()=>({data:{session:{access_token:'token',user:{id:'B'}}}})},async()=>{called=true})
 await assert.rejects(request('GET'),/Sign in again/);assert.equal(called,false)
})
test('API client sends font and revision only and surfaces conflicts',async()=>{
 const request=createUserPreferencesRequest('A',{getSession:async()=>({data:{session:{access_token:'token',user:{id:'A'}}}})},async(url,options)=>{
 assert.equal(url,'/api/user-preferences');assert.equal(options.method,'PUT');assert.equal(options.cache,'no-store')
 assert.deepEqual(JSON.parse(options.body),{font:'inter',rev:3})
 return {ok:false,status:409,json:async()=>({error:'Settings changed. Reload.'})}
 })
 await assert.rejects(request('PUT',{font:'inter',rev:3}),error=>error.status===409)
})
