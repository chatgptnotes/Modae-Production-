import test from 'node:test'
import assert from 'node:assert/strict'
import {createWorkspaceDataHandler} from '../api/workspace-data.js'
import {createWorkspaceDataClient} from '../src/workspaceDataClient.js'
const res=()=>({statusCode:200,status(n){this.statusCode=n;return this},json(body){this.body=body;return this},setHeader(){}})
test('HTTP 409 retains accepted snapshots and client does not discard them',async()=>{
 const profile={id:'U',authId:'U',role:'ADMIN',status:'Active'}
 const state={workspaceGeneration:0,config:{},users:[profile],leads:[{id:'A',subject:'old'},{id:'B',subject:'old'}]}
 const client={auth:{getUser:async()=>({data:{user:{id:'U'}}})},from(table){const q={select(){return q},eq(){return q},is(){return q},in(){return q},maybeSingle:async()=>({data:{data:[profile],rev:1}}),then(resolve){return Promise.resolve({data:state.leads.map(data=>({id:data.id,data,rev:1}))}).then(resolve)}};return q},rpc:async()=>({data:{accepted:['A'],conflicts:[{id:'B',rev:2,data:{id:'B',subject:'someone else'}}]}})}
 const handler=createWorkspaceDataHandler({getClient:()=>client,getReader:()=>async()=>state})
 const response=res()
 await handler({method:'POST',headers:{authorization:'Bearer valid','x-workspace-generation':'0'},body:{operation:'rpc',name:'save_rows',args:{p_entity:'leads',p_rows:[{id:'A',rev:1,data:{id:'A',subject:'mine'}},{id:'B',rev:1,data:{id:'B',subject:'mine'}}]}}},response)
 assert.equal(response.statusCode,409);assert.equal(response.body.code,'REVISION_CONFLICT')
 assert.equal(response.body.data.committed[0].id,'A');assert.equal(response.body.data.committed[0].rev,2)
 const adapter=createWorkspaceDataClient({auth:{getSession:async()=>({data:{session:{access_token:'token'}}})}},()=> '0',async()=>({ok:false,status:409,json:async()=>response.body}))
 const result=await adapter.rpc('save_rows',{})
 assert.equal(result.error,null);assert.equal(result.data.committed[0].id,'A');assert.equal(result.data.conflicts[0].id,'B')
})
test('old-deployment mutation is rejected before authentication or database work',async()=>{
 const previous={flag:process.env.WORKSPACE_SYNC_ENABLED,sha:process.env.RAILWAY_GIT_COMMIT_SHA}
 process.env.WORKSPACE_SYNC_ENABLED='true';process.env.RAILWAY_GIT_COMMIT_SHA='new'
 try{
  const handler=createWorkspaceDataHandler({getClient:()=>({auth:{getUser:()=>assert.fail('must reject before Supabase')}})})
  const response=res();await handler({method:'POST',headers:{authorization:'Bearer token','x-workspace-deployment':'old'},body:{operation:'approval_decision'}},response)
  assert.equal(response.statusCode,409);assert.equal(response.body.code,'DEPLOYMENT_CHANGED')
 }finally{for(const[key,value]of [['WORKSPACE_SYNC_ENABLED',previous.flag],['RAILWAY_GIT_COMMIT_SHA',previous.sha]])if(value===undefined)delete process.env[key];else process.env[key]=value}
})
