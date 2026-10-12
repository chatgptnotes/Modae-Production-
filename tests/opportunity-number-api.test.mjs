import test from 'node:test'
import assert from 'node:assert/strict'
import { createOpportunityNumberHandler } from '../api/opportunity-number.js'
import { defaultAccessPolicy } from '../src/accessPolicy.js'

function clientFor({ status='Active', deny=false, denyPages=false, fail=false }={}) {
 const accessPolicy=defaultAccessPolicy(); if(deny) accessPolicy.roles.STANDARD_USER.actions=[]
 if(denyPages) accessPolicy.roles.STANDARD_USER.pages=[]
 const client={ calls:0, auth:{getUser:async()=>({data:{user:{id:'a',email:'test@example.com'}}})}, from(table) {
 const q={select(){return q},eq(){return q},is(){return q},async maybeSingle(){return {data:{data:table==='records'?[{id:'u',authId:'a',email:'test@example.com',role:'STANDARD_USER',status}]:{accessPolicy}}}}};return q
 },async rpc(name,args){client.rpcArgs=args;client.calls++;return fail?{error:new Error('unavailable')}:{data:'MODAE-2026-0001'}}};return client
}
async function invoke(client, authorization='Bearer token', method='POST') { const res={status(n){this.code=n;return this},json(b){this.body=b;return this}};await createOpportunityNumberHandler({getClient:()=>client})({method,headers:{authorization},body:{prefix:'EVIL'}},res);return res }
test('server reserves authoritative complete ID and ignores caller format',async()=>{const c=clientFor();const r=await invoke(c);assert.equal(r.code,200);assert.equal(r.body.id,'MODAE-2026-0001');assert.equal(c.calls,1);assert.deepEqual(c.rpcArgs,{p_actor_id:'a'})})
test('missing session, inactive accounts and denied create grants cannot reserve',async()=>{
 for(const [c,token,code] of [[clientFor(),' ',401],[clientFor({status:'Suspended'}),'Bearer token',403],[clientFor({deny:true}),'Bearer token',403],[clientFor({denyPages:true}),'Bearer token',403]]) {assert.equal((await invoke(c,token)).code,code);assert.equal(c.calls,0)}
})
test('reservation failure does not return a locally generated ID',async()=>{const r=await invoke(clientFor({fail:true}));assert.equal(r.code,502);assert.equal(r.body.id,undefined)})
