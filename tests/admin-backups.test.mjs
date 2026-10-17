import test from 'node:test'
import assert from 'node:assert/strict'
import { createAdminBackupsHandler } from '../api/admin-backups.js'
import { readBackupArchive } from '../src/workspaceBackup.js'

const actor = { id:'account',authId:'11111111-1111-4111-8111-111111111111',email:'admin@test.example',role:'ADMIN',roles:['ADMIN'],status:'Active' }
const tables = ['approvals','audit','clarifications','leads','opportunities','price_list_versions','price_lists','proposals','records','settings','spares_lines','user_files']
function fixture() {
  const database = Object.fromEntries(tables.map(table=>[table,[]]))
  database.records=[{entity:'state',id:'users',data:[actor],rev:1},{entity:'state',id:'workspace_generation',data:{value:0},rev:1}]
  const calls=[]
  const client={ auth:{getUser:async token=>token==='valid'?{data:{user:{id:actor.authId,email:actor.email}}}:{error:{message:'bad'}}},
    from(table) { const query={select:()=>query,eq:()=>query,is:()=>query,maybeSingle:async()=>({data:table==='records'?{data:[actor],rev:1}:null})}; return query },
    rpc:async(name,args)=> { calls.push({name,args}); return {data:name==='workspace_backup_snapshot'?structuredClone(database):{ok:true}} },
  }
  const handler=createAdminBackupsHandler(()=>client)
  const invoke=async(body,token='valid')=> { const response={code:200,setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}}; await handler({method:'POST',headers:{authorization:`Bearer ${token}`},body},response); return response }
  return {database,calls,invoke}
}
test('authenticated backup lifecycle includes inline originals and binds reviewed restore to exact snapshot', async()=>{
  const oldKey=process.env.BACKUP_SIGNING_KEY, oldUrl=process.env.SUPABASE_URL
  process.env.BACKUP_SIGNING_KEY='test-backup-signing-key-with-at-least-32-characters';process.env.SUPABASE_URL='https://workspace.example'
  try {
    const {database,invoke,calls}=fixture()
    database.leads=[{id:'L',data:{id:'L',attachments:[{name:'original.pdf',dataUrl:'data:application/pdf;base64,AAH/'}]},rev:1}]
    const preparation=await invoke({operation:'prepare-export'})
    assert.equal(preparation.code,200);assert.equal(preparation.body.references.length,0)
    const exported=await invoke({operation:'export',token:preparation.body.token})
    assert.equal(exported.code,200)
    const archive=await readBackupArchive(new Uint8Array(Buffer.from(exported.body.archive,'base64')))
    assert.deepEqual([...archive.files[0].bytes],[0,1,255])
    assert.equal(archive.payload.database.leads[0].data.id,'L')
    database.leads=[]
    const reviewed=await invoke({operation:'preview',archive:exported.body.archive})
    assert.equal(reviewed.code,200)
    const restored=await invoke({operation:'restore',token:reviewed.body.token})
    assert.equal(restored.code,200)
    const write=calls.find(call=>call.name==='restore_workspace_backup')
    assert.equal(write.args.p_generation,0);assert.deepEqual(write.args.p_expected_snapshot,database)
    assert.equal(write.args.p_files[0].hex,'0001ff')
    assert.equal(write.args.p_files[0].user_id,actor.authId)
    assert.equal((await invoke({operation:'restore',token:reviewed.body.token})).code,409)
    assert.equal((await invoke({operation:'prepare-export'},'invalid')).code,401)
  } finally { if(oldKey===undefined)delete process.env.BACKUP_SIGNING_KEY;else process.env.BACKUP_SIGNING_KEY=oldKey;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl }
})
test('full exports block unresolved original documents and do not accept unauthenticated requests',async()=>{
  const previous=process.env.BACKUP_SIGNING_KEY;process.env.BACKUP_SIGNING_KEY='test-backup-signing-key-with-at-least-32-characters'
  try {
    const {database,invoke}=fixture();database.leads=[{id:'L',data:{attachments:[{name:'missing.pdf'}]}}]
    const preparation=await invoke({operation:'prepare-export'})
    assert.equal(preparation.body.references.length,1)
    const result=await invoke({operation:'export',token:preparation.body.token})
    assert.equal(result.code,400);assert.match(result.body.error,/Missing document bytes/)
  } finally {if(previous===undefined)delete process.env.BACKUP_SIGNING_KEY;else process.env.BACKUP_SIGNING_KEY=previous}
})

test('re-export preserves authoritative restored bytes over a stale SharePoint duplicate', async () => {
  const previous=process.env.BACKUP_SIGNING_KEY;process.env.BACKUP_SIGNING_KEY='test-backup-signing-key-with-at-least-32-characters'
  try {
    const {database,invoke}=fixture()
    database.user_files=[{id:'22222222-2222-4222-8222-222222222222',user_id:actor.authId,record_type:'opportunity',record_id:'O',folder:'Customer Specs',file_name:'original.pdf',file_type:'application/pdf',file_size:2,file_data:'\\x0102'}]
    const prepared=await invoke({operation:'prepare-export'})
    const result=await invoke({operation:'export',token:prepared.body.token,externalFiles:[{meta:{backend:'sharepoint',record_type:'opportunity',record_id:'O',folder:'Customer Specs',file_name:'original.pdf'},base64:'AA=='}]})
    assert.equal(result.code,200)
    const archive=await readBackupArchive(new Uint8Array(Buffer.from(result.body.archive,'base64')))
    assert.equal(archive.files.length,1)
    assert.deepEqual([...archive.files[0].bytes],[1,2])
    assert.equal(archive.files[0].meta.backend,'supabase')
  } finally {if(previous===undefined)delete process.env.BACKUP_SIGNING_KEY;else process.env.BACKUP_SIGNING_KEY=previous}
})
