import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { executeApprovalCommand } from '../api/_approval-command.js'
const exec = promisify(execFile)
const url = process.env.APPROVAL_TEST_DATABASE_URL
if (url) {
  const parsed = new URL(url)
  if (!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname) || !parsed.pathname.startsWith('/wintrack_approval_test_')) throw new Error('Use scripts/test-approval-postgres.mjs with a disposable local database.')
}
const sql = async text => (await exec(process.env.PSQL_BIN || 'psql', [url, '-XAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-c', text])).stdout.trim()
const actor = '11111111-1111-4111-8111-111111111111'
const quote = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb"
const command = (id, operationId, action = 'accept') => ({ requestId:id, operationId, expectedRev:1, generation:'0', action, comment:'Reviewed', commentReview:null })
const call = (c,p) => `select public.decide_approval('${actor}', 'test@example.com', ${quote(c)}, ${p ? quote(p) : 'null'});`
async function seed(id) {
  await sql(`insert into approvals(id,data,rev) values ('${id}', '${JSON.stringify({id,status:'Pending',needed:['LJS'],anyOf:true,decisions:{}})}',1);`)
  const context = JSON.parse(await sql(`select public.approval_decision_context('${id}');`))
  return { guards:context.guards, reads:context.rows.map(({entity,id,rev})=>({entity,id,rev})), writes:[], expectedStatus:'Approved', at:context.at, approvalSnapshot:null }
}
test('real Postgres: simultaneous decisions, replay and rollback', {skip: !url}, async () => {
  const id='DB-RACE'; const plan=await seed(id)
  const a=command(id,'22222222-2222-4222-8222-222222222222')
  const b=command(id,'33333333-3333-4333-8333-333333333333','reject')
  const outcomes=await Promise.allSettled([sql(call(a,plan)),sql(call(b,{...plan,expectedStatus:'Rejected'}))])
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1)
  const winner=outcomes[0].status==='fulfilled'?a:b
  const receipt=JSON.parse(await sql(call(winner,null)))
  assert.equal(receipt.replayed,true)
  assert.equal(await sql(`select rev from approvals where id='${id}'`),'2')
  await assert.rejects(sql(call({...winner,comment:'Different'},null)), /OPERATION_ID_REUSED/)
  const p=await seed('DB-ROLLBACK'); p.writes=[{entity:'leads',id:'missing',rev:1,data:{id:'missing'}}]
  await assert.rejects(sql(call(command('DB-ROLLBACK','44444444-4444-4444-8444-444444444444'),p)))
  assert.equal(await sql("select data->>'status' from approvals where id='DB-ROLLBACK'"),'Pending')
})
test('real Postgres: inserted dependency invalidates the snapshot', {skip: !url}, async () => {
  await sql("insert into opportunities(id,data) values ('O-PHANTOM','{\"id\":\"O-PHANTOM\"}');")
  await seed('DB-PHANTOM')
  await sql("update approvals set data=data||'{\"oppId\":\"O-PHANTOM\"}' where id='DB-PHANTOM';")
  const context=JSON.parse(await sql("select public.approval_decision_context('DB-PHANTOM');"))
  await sql("insert into clarifications(id,data) values ('NEW-DEPENDENCY','{\"id\":\"NEW-DEPENDENCY\",\"oppId\":\"O-PHANTOM\"}');")
  const plan={guards:context.guards, reads:context.rows.map(({entity,id,rev})=>({entity,id,rev})),writes:[],expectedStatus:'Approved'}
  await assert.rejects(sql(call(command('DB-PHANTOM','55555555-5555-4555-8555-555555555555'),plan)), /DEPENDENCY_CHANGED/)
})
test('real Postgres: business effects and receipt commit together', {skip: !url}, async () => {
  await sql("insert into leads(id,data) values ('L-EFFECT','{\"id\":\"L-EFFECT\",\"status\":\"New\"}');")
  await seed('DB-EFFECT')
  await sql("update approvals set data=data||'{\"leadId\":\"L-EFFECT\"}' where id='DB-EFFECT';")
  const snapshot=JSON.parse(await sql("select public.approval_decision_context('DB-EFFECT');"))
  const plan={guards:snapshot.guards,reads:snapshot.rows.map(({entity,id,rev})=>({entity,id,rev})),writes:[{entity:'leads',id:'L-EFFECT',rev:1,data:{id:'L-EFFECT',status:'Qualified'}}],expectedStatus:'Approved'}
  const c=command('DB-EFFECT','66666666-6666-4666-8666-666666666666')
  await sql(call(c,plan));await sql(call(c,null))
  assert.equal(await sql("select rev||':'||(data->>'status') from leads where id='L-EFFECT'"),'2:Qualified')
  assert.equal(await sql("select count(*) from audit where id like '%66666666-6666-4666-8666-666666666666'"),'1')
  await assert.rejects(sql("update approvals set data=jsonb_set(data,'{status}','\"Pending\"') where id='DB-EFFECT'"),/approval command/)
  await assert.rejects(sql("update approvals set data=jsonb_set(data,'{status}','\"Cancelled\"') where id='DB-EFFECT'"),/approval command/)
  await assert.rejects(sql("insert into audit(id,data) values('APPROVAL-COMMAND:forged','{}')"),/Receipt namespace/)
})
test('real Postgres: account and generation changes deny stale commands', {skip: !url}, async()=>{
  const plan=await seed('DB-ACCESS'); const c=command('DB-ACCESS','77777777-7777-4777-8777-777777777777')
  await sql("update records set data='{\"value\":1}' where entity='state' and id='workspace_generation';")
  await assert.rejects(sql(call(c,plan)),/WORKSPACE_GENERATION_CHANGED/)
  await sql("update records set data='{\"value\":0}' where entity='state' and id='workspace_generation';")
  await sql("update records set data=jsonb_set(data,'{0,accessPending}','true') where entity='state' and id='users';")
  await assert.rejects(sql(call(c,plan)),/WORKSPACE_ACCESS_REVOKED/)
  await sql("update records set data=jsonb_set(data,'{0,accessPending}','false') where entity='state' and id='users';")
  assert.equal(await sql("select has_function_privilege('authenticated','public.decide_approval(uuid,text,jsonb,jsonb)','EXECUTE')"),'f')
})
test('real Postgres: server planner and RPC complete a joint lead approval end to end', {skip: !url}, async()=>{
  const other='88888888-8888-4888-8888-888888888888'
  await sql(`update records set data=data||'[{"id":"ah","authId":"${other}","status":"Active","role":"AH"}]'::jsonb,rev=rev+1 where entity='state' and id='users';`)
  await sql("insert into leads(id,data) values('L-JOINT','{\"id\":\"L-JOINT\",\"status\":\"New\"}');")
  await seed('DB-JOINT')
  await sql("update approvals set data=data||'{\"leadId\":\"L-JOINT\",\"type\":\"Red customer clearance\",\"needed\":[\"LJS\",\"AH\"],\"anyOf\":false}' where id='DB-JOINT';")
  const client={async rpc(name,args){
    const query=name==='approval_decision_context'
      ? `select public.approval_decision_context('${args.p_id}');`
      : `select public.decide_approval('${args.p_actor}','test@example.com',${quote(args.p_command)},${args.p_plan?quote(args.p_plan):'null'});`
    try{return {data:JSON.parse(await sql(query))}}
    catch(error){return {error:{code:error.stderr.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1],message:error.stderr}}}
  }}
  const c=command('DB-JOINT','99999999-9999-4999-8999-999999999999')
  const first=await executeApprovalCommand(client,{id:actor},c)
  assert.equal(first.status,'Pending')
  assert.equal(await sql("select data->>'status' from leads where id='L-JOINT'"),'New')
  const last=await executeApprovalCommand(client,{id:other},{...c,expectedRev:2,operationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})
  assert.equal(last.status,'Approved')
  assert.equal(await sql("select data->>'status' from leads where id='L-JOINT'"),'Qualified')
  assert.equal((await executeApprovalCommand(client,{id:actor},c)).replayed,true)
})
