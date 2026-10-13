import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { DraftRegistry, SYNC_ENTITIES } from '../src/workspaceDrafts.js'
const source=fs.readFileSync('src/datastore.js','utf8')
function fixture(rpc){
  const drafts=new DraftRegistry(),records=new Map([['leads|A',{data:{id:'A',subject:'base'},rev:2}],['leads|B',{data:{id:'B',subject:'base'},rev:2}]]),revisions=new Map([['leads|A',2],['leads|B',2]])
  const fn=new Function('supabase','workspaceDrafts','normalizedRecords','normalizedRevisions','SYNC_ENTITIES',`
    const workspaceSyncState={enabled:true};const committedWorkspace=()=>{};const currentActorId=async()=> 'U';const annotateRpcError=(entity,e)=>e;const MAX_CONFLICT_RETRIES=3;const normalizedKey=(e,id)=>e+'|'+id;
    ${source.match(/function normalizedPayload\([^]*?\n\}/)[0]}
    ${source.match(/async function saveNormalizedRowsNow\([^]*?\n\}/)[0]}
    return saveNormalizedRowsNow;
  `)({rpc},drafts,records,revisions,SYNC_ENTITIES)
  return {drafts,save:rows=>fn('leads',rows)}
}
test('paused row is omitted while an unrelated changed row commits',async()=>{
  const sent=[];const f=fixture(async(n,args)=>{sent.push(args);return{data:{conflicts:[]}}})
  f.drafts.edit('leads','A',{data:{id:'A',subject:'base'},rev:2});f.drafts.observe('leads','A',{available:true,rev:3})
  await f.save([{id:'A',subject:'mine'},{id:'B',subject:'changed'}])
  assert.deepEqual(sent[0].p_rows.map(r=>r.id),['B']);assert.equal(f.drafts.blocked('leads','A'),true)
})
test('revision conflict never retries against a newly read revision',async()=>{
  let calls=0;const f=fixture(async()=>{calls++;return{data:{conflicts:[{id:'A',rev:3,data:{id:'A',subject:'remote'}}]}}})
  await f.save([{id:'A',subject:'mine'},{id:'B',subject:'base'}])
  assert.equal(calls,1);assert.equal(f.drafts.blocked('leads','A'),true);assert.equal(f.drafts.get('leads','A').base.rev,2)
})
test('hidden or missing write conflict is never reported as a successful save',async()=>{
  const f=fixture(async()=>({data:{conflicts:[{id:'A',rev:0,data:null,unavailable:true}]}}))
  await f.save([{id:'A',subject:'mine'},{id:'B',subject:'base'}])
  assert.equal(f.drafts.get('leads','A').status,'unavailable')
})
