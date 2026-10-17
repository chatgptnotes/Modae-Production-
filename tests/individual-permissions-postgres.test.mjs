import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { defaultAccessPolicy } from '../src/accessPolicy.js'

test('individual permission database transaction and file authorization', { skip: !process.env.PERMISSION_TEST_ADMIN_URL }, () => {
  const admin = new URL(process.env.PERMISSION_TEST_ADMIN_URL)
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(admin.hostname), 'Only a disposable local database is allowed')
  const name = `wintrack_permission_test_${randomUUID().replaceAll('-', '')}`
  const database = new URL(admin); database.pathname = `/${name}`
  const psql = process.env.PSQL_BIN || 'psql'
  const run = (url, args) => execFileSync(psql, [url.toString(), '-XAt', '-v', 'ON_ERROR_STOP=1', ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  const sql = text => run(database, ['-c', text])
  const quote = data => "'" + JSON.stringify(data).replaceAll("'", "''") + "'::jsonb"
  run(admin, ['-c', `create database ${name}`])
  try {
    run(database, ['-f', 'tests/fixtures/atomic-approval-schema.sql', '-f', 'supabase/011_save_rows_lock_order.sql'])
    sql(`create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email','person@example.com') $$;
      create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
      create function workspace_account_active() returns boolean language sql stable as $$ select true $$;
      create table price_lists(like approvals including all); create table price_list_versions(like approvals including all);
      create table user_files(user_id uuid,record_type text); alter table user_files enable row level security;`)
    run(database, ['-f', 'supabase/022_configurable_access_policy.sql'])
    run(database, ['-f', 'supabase/migrations/20261017061731_individual_account_permissions.sql'])
    const policy = defaultAccessPolicy()
    policy.users = { u: { pages: { inbox: 'deny' }, actions: { 'commercial.view': 'allow' } } }
    sql(`update records set data=${quote([{ id: 'u', authId: '11111111-1111-4111-8111-111111111111', role: 'RS', roles: ['STANDARD_USER'], status: 'Active' }])} where entity='state' and id='users';`)
    assert.match(sql(`set request.jwt.claim.role='service_role'; select save_access_policy(${quote(policy)},'{}',1,'Reviewed per-person access','actor')->>'rev'`), /2$/)
    const check = permission => sql(`set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111'; select ${permission}`).split('\n').at(-1)
    assert.equal(check("workspace_access_granted('pages','inbox')"), 'f')
    assert.equal(check("workspace_access_granted('actions','commercial.view')"), 't')
    assert.equal(check("workspace_file_allowed('attachment',false)"), 'f')
    assert.equal(check("workspace_access_granted('actions','opportunities.edit')"), 't')
    assert.throws(() => sql(`set request.jwt.claim.role='service_role'; select save_access_policy(${quote(policy)},'{}',1,'stale','actor')`), /reload before saving/)
    const invalid = structuredClone(policy); invalid.users.unknown = { pages: { inbox: 'allow' } }
    assert.throws(() => sql(`set request.jwt.claim.role='service_role'; select save_access_policy(${quote(invalid)},'{}',2,'bad','actor')`), /Invalid permission account/)
    assert.equal(sql("select count(*) from audit where data->>'reason'='Reviewed per-person access'"), '1')
    sql(`update records set data=jsonb_set(data,'{0,roles}','["ADMIN"]') where entity='state' and id='users'`)
    assert.equal(check("workspace_access_granted('pages','inbox')"), 't')
    sql(`update records set data=jsonb_set(data,'{0,roles}','["NON_SALES","ADMIN"]') where entity='state' and id='users'`)
    assert.equal(check("workspace_access_granted('actions','commercial.view')"), 'f')
    assert.equal(sql("select has_function_privilege('authenticated','public.save_access_policy(jsonb,jsonb,bigint,text,text)','EXECUTE')"), 'f')
    assert.equal(sql("select has_function_privilege('service_role','public.save_role_access_policy(jsonb,jsonb,bigint,text,text)','EXECUTE')"), 'f')
    assert.equal(sql("select has_function_privilege('authenticated','public.workspace_actor_profile()','EXECUTE')"), 'f')

    for (const mutate of [p => { p.roles = {} }, p => { delete p.roles.MANAGEMENT }, p => { delete p.roles.STANDARD_USER.pages },
      p => { p.roles.STANDARD_USER.actions.push('leads.create') }, p => { p.roles.MANAGEMENT.pages = null }, p => { p.roles.STANDARD_USER.pages.push(null) }]) {
      const invalid = structuredClone(policy); mutate(invalid)
      assert.throws(() => sql(`set request.jwt.claim.role='service_role'; select save_access_policy(${quote(invalid)},'{}',2,'invalid role schema','actor')`), /Invalid (configurable role|role grants|role collection|role permission)/)
    }
    const exact = { id: 'u', authId: '11111111-1111-4111-8111-111111111111', email: 'person@example.com', role: 'RS', roles: ['STANDARD_USER'], status: 'Active' }
    const fallback = { id: 'fallback', email: 'person@example.com', role: 'LJS', roles: ['ADMIN'], status: 'Active' }
    const setRoster = users => sql(`update records set data=${quote(users)} where entity='state' and id='users'`)
    setRoster([fallback, exact])
    assert.equal(check("workspace_access_granted('pages','inbox')"), 'f', 'exact bound profile overrides preceding email match')
    assert.equal(check("workspace_access_granted('actions','commercial.view')"), 't')
    assert.equal(check("workspace_access_granted('pages','admin')"), 'f')
    setRoster([fallback, { ...exact, status: 'Inactive' }])
    assert.equal(check('workspace_account_active()'), 'f', 'disabled exact binding cannot fall through')
    setRoster([fallback, exact, { ...exact, id: 'another-exact' }])
    assert.equal(check('workspace_account_active()'), 'f', 'ambiguous auth binding fails closed')
    setRoster([exact, { ...exact, authId: '22222222-2222-4222-8222-222222222222' }])
    assert.equal(check('workspace_account_active()'), 'f', 'duplicate roster identity fails closed')
    assert.throws(() => sql(`set request.jwt.claim.role='service_role'; select save_access_policy(${quote(policy)},'{}',2,'duplicate account','actor')`), /Invalid permission account/)
    setRoster([{ ...exact, id: exact.authId, authId: null, email: 'different@example.com' }, fallback])
    assert.equal(check("workspace_access_granted('pages','admin')"), 'f', 'exact UUID account ID wins over email fallback')
    assert.equal(check("workspace_access_granted('actions','opportunities.edit')"), 't')
    setRoster([fallback, { ...fallback, id: 'fallback-2' }])
    assert.equal(check('workspace_account_active()'), 'f', 'ambiguous email fallback fails closed')
  } finally { run(admin, ['-c', `drop database ${name} with (force)`]) }
})
