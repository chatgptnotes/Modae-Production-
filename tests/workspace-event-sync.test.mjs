import test from 'node:test'
import assert from 'node:assert/strict'
import {createWorkspaceCoordinator} from '../src/workspaceSync.js'
function browser(shared=[]){
 const win=new EventTarget(),doc=new EventTarget();doc.visibilityState='visible';const timers=new Map();let n=0
 class Channel{constructor(){shared.push(this)}postMessage(data){for(const c of shared)if(c!==this)c.onmessage?.({data})}close(){shared.splice(shared.indexOf(this),1)}}
 const env={crypto:{randomUUID:()=>String(Math.random())},document:doc,navigator:{onLine:true},BroadcastChannel:Channel,addEventListener:win.addEventListener.bind(win),removeEventListener:win.removeEventListener.bind(win),setTimeout(fn,ms){timers.set(++n,{fn,ms});return n},clearTimeout:id=>timers.delete(id)}
 return {env,win,doc,timers,async tick(){for(const[id,t]of [...timers])if(t.ms<1000){timers.delete(id);t.fn()}await new Promise(r=>setImmediate(r))}}
}
const interests=()=>({records:[{entity:'leads',id:'L'}],views:[]})
test('focus is coalesced and no polling remains after request completion',async()=>{
 const b=browser();let calls=0
 const c=createWorkspaceCoordinator({scope:'s',env:b.env,interests,check:async()=>{calls++;return{}},receive:()=>{},error:()=>{}})
 await b.tick();const before=calls
 b.win.dispatchEvent(new Event('focus'));b.doc.dispatchEvent(new Event('visibilitychange'));await b.tick()
 assert.equal(calls,before+1);assert.equal(b.timers.size,0);c.dispose()
})
test('committed snapshots reach another tab without a server request',async()=>{
 const shared=[],a=browser(shared),b=browser(shared);let calls=0;const received=[]
 const make=(e,receive)=>createWorkspaceCoordinator({scope:'s',env:e.env,interests,check:async()=>{calls++;return{}},receive,error:()=>{}})
 const x=make(a,()=>{}),y=make(b,r=>received.push(r));await a.tick();await b.tick();const before=calls
 x.committed([{entity:'leads',id:'L',rev:2,available:true,data:{id:'L',subject:'saved'}}]);await a.tick();await b.tick()
 assert.equal(calls,before);assert.equal(received.at(-1).kind,'committed');assert.equal(received.at(-1).records[0].data.subject,'saved');x.dispose();y.dispose()
})
test('errors do not schedule background retries',async()=>{
 const b=browser();const c=createWorkspaceCoordinator({scope:'s',env:b.env,interests,check:async()=>{throw new Error('offline')},receive:()=>{},error:()=>{}})
 c.wake();await b.tick();assert.equal(b.timers.size,0);c.dispose()
})
