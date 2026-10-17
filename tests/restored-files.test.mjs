import test from 'node:test'
import assert from 'node:assert/strict'
import { createRestoredFilesHandler } from '../api/restored-files.js'
import { defaultAccessPolicy } from '../src/accessPolicy.js'
const id='22222222-2222-4222-8222-222222222222', privateId='33333333-3333-4333-8333-333333333333'
function fixture(patch={},policy=defaultAccessPolicy()) {
  const profile={id:'sales',authId:'11111111-1111-4111-8111-111111111111',email:'sales@example.test',role:'RS',roles:['STANDARD_USER'],status:'Active',...patch}
  let files=[{id,user_id:'exporting-admin',record_type:'opportunity',record_id:'O',folder:'Customer Specs',file_name:'original.pdf',file_type:'application/pdf',file_size:2,file_data:'\\x0102'},{id:privateId,record_type:'opportunity',record_id:'O',folder:'Customer Specs',file_name:'private.pdf',file_size:1,file_data:'\\xff'}]
  const receipt={id,recordType:'opportunity',recordId:'O',folder:'Customer Specs',name:'original.pdf'}
  const client={auth:{getUser:async token=>token==='valid'?{data:{user:{id:profile.authId,email:profile.email}}}:{error:{}}},from(table){
    const filters=[];let deleting=false
    const rows=()=> table==='records'?[{data:[profile]}]:table==='settings'?[{data:{accessPolicy:policy}}]:table==='opportunities'?[{data:{id:'O',owner:'RS'}}]:table==='leads'?[{data:{id:'L',assignedOwner:'RS'}}]:table==='audit'?[{data:{kind:'backup_restore_command',restoredFiles:[receipt]}}]:files
    const result=()=>{const selected=rows().filter(row=>filters.every(check=>check(row)));if(deleting)files=files.filter(row=>!selected.includes(row));return {data:selected}}
    const query={select(){return query},eq(key,value){if(table==='user_files')filters.push(row=>row[key]===value);return query},is(){return query},like(){return query},contains(){return query},in(key,values){filters.push(row=>values.includes(row[key]));return query},delete(){deleting=true;return query},maybeSingle:async()=>({data:rows()[0]}),then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}}
    return query
  }}
  const handler=createRestoredFilesHandler(()=>client)
  return {async invoke(body,token='valid') {const res={code:200,setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};await handler({method:'POST',headers:{authorization:`Bearer ${token}`},body},res);return res},get files(){return files}}
}
const scope={recordType:'opportunity',recordId:'O',folder:'Customer Specs'}
test('authorized sales owner reads Admin-owned recovered bytes while ordinary private files remain excluded',async()=>{
  const h=fixture()
  const listed=await h.invoke({operation:'list',...scope})
  assert.equal(listed.code,200);assert.deepEqual(listed.body.files.map(row=>row.name),['original.pdf'])
  const got=await h.invoke({operation:'get',...scope,name:'original.pdf'})
  assert.equal(got.code,200);assert.equal(got.body.file.base64,'AQI=');assert.equal(got.body.file.restored,true)
  assert.equal((await h.invoke({operation:'get',...scope,name:'private.pdf'})).body.file,null)
})
test('unauthorized, inactive and unrelated sales accounts cannot read recovered bytes',async()=>{
  assert.equal((await fixture().invoke({operation:'list',...scope},'invalid')).code,401)
  for(const patch of [{status:'Suspended'},{accessPending:true},{role:'PP'}]) assert.equal((await fixture(patch).invoke({operation:'get',...scope,name:'original.pdf'})).code,403)
  const policy=defaultAccessPolicy();policy.users={sales:{pages:{folders:'deny',proposal:'deny'}}}
  assert.equal((await fixture({},policy).invoke({operation:'list',...scope})).code,403)
})
test('only authorized editors can retire recovered copies and cannot remove ordinary private uploads',async()=>{
  const h=fixture(),result=await h.invoke({operation:'retire',...scope,name:'original.pdf'})
  assert.equal(result.code,200);assert.equal(result.body.retired,1);assert.equal(h.files[0].id,privateId)
  const policy=defaultAccessPolicy();policy.users={sales:{actions:{'opportunities.edit':'deny'}}}
  assert.equal((await fixture({},policy).invoke({operation:'retire',...scope})).code,403)
  assert.equal((await fixture().invoke({operation:'retire',recordType:'admin-template',recordId:'x'})).code,403)
})

test('fresh uploads without a restoration receipt do not require a persisted parent', async () => {
  const result = await fixture().invoke({ operation:'retire',recordType:'opportunity',recordId:'not-yet-saved',folder:'Specs',name:'new.pdf' })
  assert.equal(result.code,200);assert.equal(result.body.retired,0)
})
