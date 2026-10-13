import test from 'node:test'
import assert from 'node:assert/strict'
import { createApprovalCommands } from '../src/approvalCommands.js'
function fixture(results) {
  const sent=[];const memory=new Map(); let identity={actorId:'u',generation:'0'}
  const controller=createApprovalCommands({identity:()=>identity,revision:()=>3,send:async c=>{sent.push(structuredClone(c));return results.shift()},storage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}})
  return {controller,sent,memory,setIdentity:value=>{identity=value}}
}
test('uncertain retry retains exact operation even if the user changes the draft',async()=>{
  const f=fixture([{kind:'uncertain'},{kind:'committed',data:{status:'Approved'}}])
  assert.equal((await f.controller.decide('A',{action:'accept',comment:'Original'})).kind,'uncertain')
  await f.controller.decide('A',{action:'reject',comment:'Changed'})
  assert.deepEqual(f.sent[1],f.sent[0]);assert.equal(f.controller.pending.size,0)
})
test('double click shares the in-flight command',async()=>{
  let finish;let calls=0
  const c=createApprovalCommands({identity:()=>({actorId:'u',generation:'0'}),revision:()=>1,send:()=>{calls++;return new Promise(r=>{finish=r})}})
  const one=c.decide('A',{action:'accept',comment:'yes'});const two=c.decide('A',{action:'accept',comment:'yes'})
  finish({kind:'committed',data:{}});await Promise.all([one,two]);assert.equal(calls,1)
})
test('restored pending command is uncertain and remains blocked after an access error',async()=>{
  const f=fixture([{kind:'uncertain'}]);await f.controller.decide('A',{action:'accept',comment:'yes'})
  const c=createApprovalCommands({identity:()=>({actorId:'u',generation:'0'}),revision:()=>1,storage:{getItem:k=>f.memory.get(k),setItem:(k,v)=>f.memory.set(k,v)},send:async()=>({kind:'rejected',status:403})})
  const result=await c.decide('A',{action:'reject',comment:'no'})
  assert.equal(result.kind,'uncertain');assert.equal(c.pending.size,1)
})
test('late response after generation change is never accepted',async()=>{
  let finish; let generation='0'
  const c=createApprovalCommands({identity:()=>({actorId:'u',generation}),revision:()=>1,send:()=>new Promise(r=>{finish=r})})
  const p=c.decide('A',{action:'accept',comment:'yes'});generation='1';finish({kind:'committed',data:{}})
  assert.equal((await p).kind,'session-changed')
})
