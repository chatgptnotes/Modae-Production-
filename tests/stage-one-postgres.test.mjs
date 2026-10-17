import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const exec = promisify(execFile)
const url = process.env.STAGE_ONE_TEST_DATABASE_URL
if (url) {
  const parsed = new URL(url)
  if (!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname) || !parsed.pathname.startsWith('/wintrack_stage_one_test_')) throw new Error('Stage 1 tests require a disposable local wintrack_stage_one_test_ database.')
}
const run = async args => (await exec(process.env.PSQL_BIN || 'psql', [url, '-XAt', '-v', 'ON_ERROR_STOP=1', ...args], { maxBuffer: 4 * 1024 * 1024 })).stdout.trim()
const sql = text => run(['-c', text])
const quote = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb"
const actor = '11111111-1111-4111-8111-111111111111'
const conversion = (lead, id, rev=1, generation=0) => `select public.convert_lead_to_opportunity('${lead}',${rev},${quote({id,sourceLeadId:lead,sellTo:'Synthetic customer',owner:'LJS',status:'Open'})},'${actor}',${generation});`
const seed = id => sql(`insert into leads(id,data,rev) values('${id}',${quote({id,status:'Qualified',assignedOwner:'LJS'})},1)`)

test('Stage 1 PostgreSQL access and atomic conversion contract', { skip: !url }, async t => {
  await run(['-f','tests/fixtures/atomic-approval-schema.sql', '-f','supabase/011_save_rows_lock_order.sql'])
  await sql(`create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email','test@example.com') $$;
    create function public.workspace_account_active() returns boolean language sql stable as $$ select true $$;`)
  await run(['-f','supabase/migrations/20261016122935_stage_one_non_sales_access.sql'])
  await t.test('non-sales overrides mixed administrator grants; service-only conversion cannot be called by browsers', async () => {
    await sql(`update records set data=${quote([{id:'u',authId:actor,status:'Active',role:'LJS',roles:['NON_SALES','ADMIN']}])} where entity='state' and id='users'`)
    assert.equal(await sql(`set request.jwt.claim.sub='${actor}'; select workspace_access_granted('pages','folders');`),'SET\nf')
    await sql(`update records set data=${quote([{id:'u',authId:actor,status:'Active',role:'LJS',roles:['ADMIN']}])} where entity='state' and id='users'`)
    assert.equal(await sql(`set request.jwt.claim.sub='${actor}'; select workspace_access_granted('pages','folders');`),'SET\nt')
    for (const role of ['anon','authenticated']) assert.equal(await sql(`select has_function_privilege('${role}','public.convert_lead_to_opportunity(text,bigint,jsonb,text,bigint)','EXECUTE')`),'f')
  })
  await t.test('two devices produce exactly one opportunity and retry returns the saved record', async () => {
    await seed('L-RACE')
    const results = await Promise.all([sql(conversion('L-RACE','O-RACE-A')),sql(conversion('L-RACE','O-RACE-B'))])
    const receipts=results.map(JSON.parse)
    assert.equal(new Set(receipts.map(result=>result.opportunity.id)).size,1)
    assert.deepEqual(receipts.map(result=>result.existing).sort(),[false,true])
    assert.equal(await sql("select count(*) from opportunities where data->>'sourceLeadId'='L-RACE'"),'1')
    assert.equal(await sql("select data->>'status' from leads where id='L-RACE'"),'Converted')
    const repeat=JSON.parse(await sql(conversion('L-RACE','O-RACE-C')))
    assert.equal(repeat.opportunity.id,receipts[0].opportunity.id)
    assert.equal(await sql("select count(*) from audit where id='LEAD-CONVERSION:L-RACE'"),'1')
  })
  await t.test('normal revision-aware editing of converted opportunity remains allowed', async () => {
    const row=JSON.parse(await sql("select jsonb_build_object('id',id,'data',data,'rev',rev) from opportunities where data->>'sourceLeadId'='L-RACE'"))
    row.data.oppName='Updated after conversion'
    const result=JSON.parse(await sql(`select public.save_rows('opportunities',${quote([row])})`))
    assert.deepEqual(result.accepted,[row.id])
    await assert.rejects(sql(`select public.save_rows('opportunities',${quote([{...row,rev:row.rev+1,data:{...row.data,sourceLeadId:'FORGED'}}])})`), /source lead cannot be changed/)
    await assert.rejects(sql(`select public.save_rows('opportunities',${quote([{id:'FORGED',rev:0,data:{id:'FORGED',sourceLeadId:'L-RACE'}}])})`), /lead conversion command/)
  })
  await t.test('stale revision, generation and unqualified leads do not partially create rows', async () => {
    await seed('L-STALE')
    await assert.rejects(sql(conversion('L-STALE','O-STALE-REV',0)),/Lead changed or is not qualified/)
    await assert.rejects(sql(conversion('L-STALE','O-STALE-GEN',1,9)),/Workspace changed/)
    await sql("update leads set data=jsonb_set(data,'{status}','\"New\"') where id='L-STALE'")
    await assert.rejects(sql(conversion('L-STALE','O-NOT-QUALIFIED')),/Lead changed or is not qualified/)
    assert.equal(await sql("select count(*) from opportunities where data->>'sourceLeadId'='L-STALE'"),'0')
  })
  await t.test('reserved audit receipts reject generic writes and collisions roll back conversion', async () => {
    await seed('L-AUDIT-COLLISION')
    const receipt = {id:'LEAD-CONVERSION:L-AUDIT-COLLISION', action:'Existing receipt'}
    await assert.rejects(sql(`select public.save_rows('audit',${quote([{id:receipt.id,rev:0,data:receipt}])})`), /receipt namespace is server-owned/)
    // Simulate an earlier server receipt without relying on generic write access.
    await sql(`begin; select set_config('wintrack.lead_conversion','on',true); insert into audit(id,data) values('${receipt.id}',${quote(receipt)}); commit;`)
    await assert.rejects(sql(conversion('L-AUDIT-COLLISION','O-AUDIT-COLLISION')), /audit receipt conflicted/)
    assert.equal(await sql("select count(*) from opportunities where id='O-AUDIT-COLLISION'"),'0')
    assert.equal(await sql("select data->>'status' from leads where id='L-AUDIT-COLLISION'"),'Qualified')
    assert.equal(await sql(`select data->>'action' from audit where id='${receipt.id}'`),'Existing receipt')
  })
  await t.test('failure after opportunity save rolls back the entire conversion', async () => {
    await seed('L-ROLLBACK')
    await sql(`create function reject_conversion_test() returns trigger language plpgsql as $$ begin
      if NEW.id='L-ROLLBACK' and NEW.data->>'status'='Converted' then raise exception 'synthetic lead failure'; end if; return NEW; end $$;
      create trigger reject_conversion_test before update on leads for each row execute function reject_conversion_test();`)
    await assert.rejects(sql(conversion('L-ROLLBACK','O-ROLLBACK')), /synthetic lead failure/)
    assert.equal(await sql("select count(*) from opportunities where id='O-ROLLBACK'"),'0')
    assert.equal(await sql("select data->>'status' from leads where id='L-ROLLBACK'"),'Qualified')
    assert.equal(await sql("select count(*) from audit where id='LEAD-CONVERSION:L-ROLLBACK'"),'0')
  })
})
