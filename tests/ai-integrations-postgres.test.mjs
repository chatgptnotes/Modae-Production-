import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
const run = promisify(execFile)
const url = process.env.AI_INTEGRATIONS_TEST_DATABASE_URL
const psql = process.env.PSQL_BIN || 'psql'
const args = [url || '', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1']
const sql = query => execFileSync(psql, [...args, '-c', query], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
const save = rev => `select save_ai_integrations('encrypted-data','nonce',${rev},'00000000-0000-0000-0000-000000000001','gemini')`
const service = "set request.jwt.claim.role='service_role';"
test('encrypted integration saves are service-only, revision checked and atomic with audit', { skip: !url }, async () => {
  assert.match(sql('select current_database()'), /^wintrack_ai_integrations_test_/)
  sql(`do $$ begin
    if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists(select from pg_roles where rolname='service_role') then create role service_role; end if;
    end $$;
    create schema auth;
    create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role', true)$$;
    create table ai_secrets(id text primary key, provider text not null, ciphertext text not null,iv text not null,updated_at timestamptz default now(),updated_by text);
    create table audit(id text primary key,data jsonb not null,updated_by text);
    grant select on ai_secrets to anon,authenticated;
  `)
  sql(fs.readFileSync(new URL('../supabase/migrations/20261017110000_ai_integrations.sql', import.meta.url), 'utf8'))
  assert.equal(sql("select has_table_privilege('authenticated','ai_secrets','select')"), 'f')
  assert.equal(sql("select has_table_privilege('anon','ai_secrets','select')"), 'f')
  assert.equal(sql("select relrowsecurity from pg_class where oid='ai_secrets'::regclass"), 't')
  assert.equal(sql("select has_function_privilege('authenticated','save_ai_integrations(text,text,bigint,uuid,text)','execute')"), 'f')
  assert.equal(sql("select has_function_privilege('service_role','save_ai_integrations(text,text,bigint,uuid,text)','execute')"), 't')
  assert.throws(() => sql(save(0)))
  assert.equal(sql(`${service}${save(0)}`), '1')
  assert.equal(sql('select count(*) from audit'), '1')
  assert.throws(() => sql(`${service}${save(0)}`))
  assert.equal(sql('select rev from ai_secrets'), '1')
  assert.equal(sql('select count(*) from audit'), '1')
  // Two concurrent writers see one winner and one conflict, with one audit receipt.
  const results = await Promise.allSettled([run(psql, [...args, '-c', `${service}${save(1)}`]), run(psql, [...args, '-c', `${service}${save(1)}`])])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(sql('select rev from ai_secrets'), '2')
  assert.equal(sql('select count(*) from audit'), '2')
  assert.throws(() => sql("insert into audit(id,data) values('AI-INTEGRATIONS:forged','{}')"))
  assert.throws(() => sql("insert into audit(id,data) values('innocent','{\"id\":\"AI-INTEGRATIONS:forged\"}')"))
  assert.throws(() => sql("insert into audit(id,data) values('innocent','{\"kind\":\"ai_integration_command\"}')"))
  assert.throws(() => sql("update audit set data='{}'"))
  assert.throws(() => sql("update audit set id='innocent'"))
  sql("begin; set local wintrack.backup_restore='on'; insert into audit(id,data) values('AI-INTEGRATIONS:historical','{}'); rollback;")
  // A failed audit insert must roll the encrypted credential update back too.
  sql("create function reject_audit() returns trigger language plpgsql as $$begin raise exception 'synthetic audit failure'; end$$; create trigger reject_audit before insert on audit for each row execute function reject_audit();")
  assert.throws(() => sql(`${service}${save(2)}`))
  assert.equal(sql('select rev from ai_secrets'), '2')
  assert.equal(sql('select count(*) from audit'), '2')
  assert.equal(sql("select data::text from audit limit 1").includes('encrypted-data'), false)
})
