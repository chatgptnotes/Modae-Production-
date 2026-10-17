import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const exec = promisify(execFile), url = process.env.BACKUP_TEST_DATABASE_URL
if (url && (!['127.0.0.1','localhost'].includes(new URL(url).hostname) || !new URL(url).pathname.startsWith('/wintrack_backup_test_'))) throw new Error('Use a disposable local backup test database.')
const run = async args => (await exec(process.env.PSQL_BIN || 'psql', [url, '-XAtq', '-v', 'ON_ERROR_STOP=1', ...args], { maxBuffer: 8 * 1024 * 1024 })).stdout.trim()
const sql = text => run(['-c', text])
const quote = object => `'${JSON.stringify(object).replaceAll("'", "''")}'::jsonb`
const actor = '11111111-1111-4111-8111-111111111111'
const restore = (database, files = [], expected = 'public.workspace_backup_snapshot()', generation = 0) => `set request.jwt.claim.role='service_role'; select public.restore_workspace_backup(${generation},${quote(database)},${quote(files)},'${actor}','${'a'.repeat(64)}',${expected});`

test('PostgreSQL backup transaction preserves protected state, evidence, files and counters', { skip: !url }, async t => {
  await run(['-f','tests/fixtures/atomic-approval-schema.sql','-f','supabase/011_save_rows_lock_order.sql'])
  await sql(`create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${actor}');
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    create table price_lists(like approvals including all); create table price_list_versions(like approvals including all);
    create table user_files(id uuid primary key, user_id uuid not null references auth.users,record_type text not null,record_id text not null,folder text,file_name text,file_type text,file_size bigint,file_data bytea,is_demo boolean,created_at timestamptz,updated_at timestamptz,check(file_size=octet_length(file_data)),check(file_size<=10485760));`)
  await run(['-f','supabase/migrations/20261013080111_atomic_approval_commands.sql','-f','supabase/migrations/20261017061909_full_workspace_backups.sql'])
  await t.test('backup and restore RPCs are not callable by browser database roles', async () => {
    for (const role of ['anon','authenticated']) {
      assert.equal(await sql(`select has_function_privilege('${role}','public.workspace_backup_snapshot()','EXECUTE')`),'f')
      assert.equal(await sql(`select has_function_privilege('${role}','public.restore_workspace_backup(bigint,jsonb,jsonb,uuid,text,jsonb)','EXECUTE')`),'f')
    }
  })
  await t.test('late invalid file rolls back every restored row', async () => {
    const db = { opportunities: [{ id: 'O-FAIL', data: { id: 'O-FAIL' } }] }
    const file = { id: '22222222-2222-4222-8222-222222222222',user_id:actor,record_type:'opportunity',record_id:'O-FAIL',file_name:'bad.pdf',file_size:2,hex:'01' }
    await assert.rejects(sql(restore(db, [file])), /check constraint/)
    assert.equal(await sql("select count(*) from opportunities"),'0')
    assert.equal(await sql("select count(*) from user_files"),'0')
    assert.equal(await sql("select data->>'value' from records where id='workspace_generation'"),'0')
  })
  await t.test('review revision comparison prevents a concurrent setting update', async () => {
    const snapshot = JSON.parse(await sql('select public.workspace_backup_snapshot()'))
    await sql("update settings set data='{\"changed\":true}',rev=rev+1 where id='config'")
    await assert.rejects(sql(restore({}, [], quote(snapshot))), /Workspace changed after restore preview/)
  })
  await t.test('successful restore preserves profiles, receipts and maximum counters', async () => {
    await sql("insert into settings(id,data) values('opportunity_counter_all','{\"next\":90}')")
    const db = {
      leads: [{ id: 'L-1', data: { id:'L-1',status:'Converted' } }], opportunities: [{ id:'O-1',data:{ id:'O-1', sourceLeadId:'L-1', booking:{ verified:true,amount:123.45 } } }],
      approvals:[{id:'A-1',data:{id:'A-1',status:'Approved',decisions:{LJS:{signed:true}}}}],
      records:[{entity:'state',id:'users',data:[{id:'forged',role:'ADMIN'}]},{entity:'state',id:'workspace_generation',data:{value:-1}}],
      settings:[{id:'opportunity_counter_all',data:{next:2}}], audit:[{id:'APPROVAL-COMMAND:history',data:{kind:'approval_command',history:true}}],
    }
    const files=[{id:'22222222-2222-4222-8222-222222222222',user_id:actor,record_type:'opportunity',record_id:'O-1',file_name:'doc.pdf',file_size:2,hex:'00ff'}]
    await sql(restore(db,files))
    assert.equal(await sql("select data->>'next' from settings where id='opportunity_counter_all'"),'90')
    assert.equal(await sql("select data->0->>'id' from records where id='users'"),'u')
    assert.equal(await sql("select data->>'status' from approvals where id='A-1'"),'Approved')
    assert.equal(await sql("select count(*) from audit where id='APPROVAL-COMMAND:history'"),'1')
    assert.equal(await sql("select encode(file_data,'hex') from user_files"),'00ff')
    assert.equal(await sql("select data->'restoredFiles'->0->>'recordId' from audit where id like 'BACKUP-RESTORE:%'"),'O-1')
    assert.equal(await sql("select data->>'value' from records where id='workspace_generation'"),'1')
    await assert.rejects(sql(restore({},[], 'public.workspace_backup_snapshot()',1)), /empty business workspace/)
  })
})
