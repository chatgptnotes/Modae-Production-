import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspaceDataHandler } from '../api/workspace-data.js'
const actor='11111111-1111-4111-8111-111111111111'
const command={requestId:'A',operationId:'22222222-2222-4222-8222-222222222222',expectedRev:1,generation:'0',action:'accept',comment:'Reviewed',commentReview:null}
const response=()=>({statusCode:200,status(s){this.statusCode=s;return this},setHeader(){},json(body){this.body=body;return this}})
function setup(error) {
  const calls=[]
  const client={auth:{getUser:async()=>({data:{user:{id:actor}}})},rpc:async(name,args)=>{calls.push({name,args});return error?{error}:{data:{operationId:command.operationId,replayed:true}}}}
  return {calls,handler:createWorkspaceDataHandler({getClient:()=>client,getReader:()=>{throw Error('Must not load workspace')}})}
}
test('approval command uses verified identity and can replay without a workspace snapshot',async()=>{
  const {calls,handler}=setup();const res=response()
  await handler({method:'POST',headers:{authorization:'Bearer valid','x-workspace-generation':'0'},body:{operation:'approval_decision',command}},res)
  assert.equal(res.statusCode,200);assert.equal(calls[0].name,'decide_approval');assert.equal(calls[0].args.p_actor,actor)
})
for(const status of [403,404,409,422]) test(`approval SQL domain error maps to ${status}`,async()=>{
  const {handler}=setup({code:`PT${status}`,message:'REJECTED'});const res=response()
  await handler({method:'POST',headers:{authorization:'Bearer valid','x-workspace-generation':'0'},body:{operation:'approval_decision',command}},res)
  assert.equal(res.statusCode,status)
})
test('client cannot submit a server plan or forged actor in the command',async()=>{
  const {handler,calls}=setup();const res=response()
  await handler({method:'POST',headers:{authorization:'Bearer valid','x-workspace-generation':'0'},body:{operation:'approval_decision',command:{...command,actorId:'attacker'}}},res)
  assert.equal(res.statusCode,422);assert.equal(calls.length,0)
})

test('missing session is rejected before any database operation',async()=>{
  const {handler,calls}=setup();const res=response()
  await handler({method:'POST',headers:{},body:{operation:'approval_decision',command}},res)
  assert.equal(res.statusCode,401);assert.equal(calls.length,0)
})
