import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspaceCoordinator } from '../src/workspaceSync.js'
function environment(shared={channels:[],locked:false}) {
  const win=new EventTarget(),doc=new EventTarget();doc.visibilityState='visible'
  let seq=0;const timers=new Map()
  class Channel { constructor(){shared.channels.push(this)} postMessage(data){for(const c of shared.channels)if(c!==this)c.onmessage?.({data})} close(){shared.channels=shared.channels.filter(c=>c!==this)} }
  const env={crypto:{randomUUID:()=>String(Math.random())},document:doc,navigator:{onLine:true,locks:{async request(name,options,fn){if(shared.locked)return fn(null);shared.locked=true;try{return await fn({})}finally{shared.locked=false}}}},BroadcastChannel:Channel,addEventListener:win.addEventListener.bind(win),removeEventListener:win.removeEventListener.bind(win),setTimeout(fn,ms){timers.set(++seq,{fn,ms});return seq},clearTimeout(id){timers.delete(id)}}
  return {env,timers,doc,async tick(){const next=[...timers].filter(([,t])=>t.ms<=3000).sort((a,b)=>a[1].ms-b[1].ms)[0];if(next){timers.delete(next[0]);next[1].fn();await new Promise(r=>setImmediate(r))}},shared}
}
test('each tab checks its own records on initial activation without a leader loop',async()=>{
  const shared={channels:[],locked:false},a=environment(shared),b=environment(shared),calls=[]
  const make=(e,id)=>createWorkspaceCoordinator({scope:'actor:0',env:e.env,interests:()=>({records:[{entity:'leads',id}],views:[]}),check:async batch=>{calls.push(batch);return {generation:'0',records:[]}},receive:()=>{},error:e=>{throw e}})
  const first=make(a,'A'),second=make(b,'B');await a.tick();await b.tick()
  assert.equal(calls.length,2);assert.deepEqual(calls.flatMap(call=>call.records.map(r=>r.id)).sort(),['A','B'])
  first.dispose();second.dispose()
})
test('hidden leader aborts its request and discards a late response',async()=>{
  const e=environment();let finish,signal,received=0
  const c=createWorkspaceCoordinator({scope:'a:0',env:e.env,interests:()=>({records:[{entity:'leads',id:'L'}],views:[]}),check:(b,s)=>{signal=s;return new Promise(r=>{finish=r})},receive:()=>received++,error:()=>{}})
  await e.tick();e.doc.visibilityState='hidden';e.doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(signal.aborted,true);finish({records:[]});await new Promise(r=>setImmediate(r));assert.equal(received,0);c.dispose()
})
test('local commit hints make no additional requests on idle screens',async()=>{
  const e=environment();let count=0
  const c=createWorkspaceCoordinator({scope:'a:0',env:e.env,interests:()=>({records:[],views:[]}),check:async()=>{count++;return{}},receive:()=>{},error:()=>{}})
  await e.tick();const before=count;c.committed([]);c.committed([]);await e.tick();assert.equal(count,before);c.dispose()
})

test('tabs poll independently when messaging is unavailable even if locks exist',async()=>{
  const shared={channels:[],locked:false},a=environment(shared),b=environment(shared),calls=[]
  delete a.env.BroadcastChannel;delete b.env.BroadcastChannel
  const make=(e,id)=>createWorkspaceCoordinator({scope:'fallback',env:e.env,interests:()=>({records:[{entity:'leads',id}],views:[]}),check:async batch=>{calls.push(batch.records[0].id);return{}},receive:()=>{},error:e=>{throw e}})
  const first=make(a,'A'),second=make(b,'B')
  try {await a.tick();await b.tick();assert.deepEqual(calls.sort(),['A','B'])}
  finally {first.dispose();second.dispose()}
})
test('unusable messaging constructor falls back to independent polling',async()=>{
  const e=environment();let calls=0
  e.env.BroadcastChannel=class{constructor(){throw new Error('disabled')}}
  const c=createWorkspaceCoordinator({scope:'fallback',env:e.env,interests:()=>({records:[{entity:'leads',id:'A'}],views:[]}),check:async()=>{calls++;return{}},receive:()=>{},error:()=>{}})
  try {await e.tick();assert.equal(calls,1)}finally{c.dispose()}
})
