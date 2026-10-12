import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
const run=promisify(execFile)
const url=process.env.NUMBERING_TEST_DATABASE_URL
const psql=process.env.PSQL_PATH || 'psql'
const args=['-X','-q','-A','-t','-v','ON_ERROR_STOP=1',url || '']
const sql=q=>execFileSync(psql,[...args,'-c',q],{encoding:'utf8'}).trim()

test('Postgres reserves unique IDs concurrently, retains legacy counters and prevents reuse across formats', {skip:!url},async()=>{
 assert.match(sql('select current_database()'),/^wintrack_numbering_test_/,'Only disposable numbering test databases are permitted')
 sql("create table settings(id text primary key,data jsonb not null default '{}',rev bigint default 1,updated_at timestamptz default now(),deleted_at timestamptz); create table opportunities(id text primary key);")
 sql("do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon; end if; if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select from pg_roles where rolname='service_role') then create role service_role; end if; end $$;")
 sql(fs.readFileSync(new URL('../supabase/015_atomic_opportunity_sequences.sql',import.meta.url),'utf8'))
 sql(fs.readFileSync(new URL('../supabase/021_configurable_opportunity_numbers.sql',import.meta.url),'utf8'))
 const month=sql("select to_char(timezone('Asia/Kolkata',now()),'YYMM')")
 sql(`insert into opportunities values ('${month}011-AH'); insert into settings(id,data) values ('opportunity_sequence_${month}','{"next":15}')`)
 assert.equal(sql("select reserve_opportunity_number('actor-1')"),month+'016')
 assert.equal(sql(`select data->>'actor' from settings where id='opportunity_reserved_${month}016'`),'actor-1')
 assert.throws(()=>sql("select reserve_opportunity_number('')"))
 const results=await Promise.all(Array.from({length:12},()=>run(psql,[...args,'-c',"select reserve_opportunity_number('actor-1')"]).then(r=>r.stdout.trim())))
 assert.equal(new Set(results).size,12)
 assert.equal(results.every(id=>id.startsWith(month)),true)
 const setConfig=c=>sql(`insert into settings(id,data) values('config','${JSON.stringify({opportunityNumbering:c})}') on conflict(id) do update set data=excluded.data`)
 setConfig({prefix:'MOD',dateFormat:'none',reset:'continuous',separator:'-',sequenceWidth:4})
 assert.equal(sql("select reserve_opportunity_number('actor-1')"),'MOD-0001')
 setConfig({prefix:'MOD',dateFormat:'none',reset:'continuous',separator:'-',sequenceWidth:3})
 assert.equal(sql("select reserve_opportunity_number('actor-1')"),'MOD-002')
 setConfig({prefix:'MOD',dateFormat:'none',reset:'continuous',separator:'-',sequenceWidth:4})
 assert.equal(sql("select reserve_opportunity_number('actor-1')"),'MOD-0003')
 sql("insert into opportunities values('MOD-0075')")
 assert.equal(sql("select reserve_opportunity_number('actor-1')"),'MOD-0076')
 assert.equal(sql("select has_function_privilege('authenticated','public.reserve_opportunity_number(text)','execute')"),'f')
 assert.equal(sql("select has_function_privilege('anon','public.next_opportunity_sequence(text)','execute')"),'f')
 setConfig({prefix:'MOD',dateFormat:'none',reset:'monthly'})
 assert.throws(()=>sql("select reserve_opportunity_number('actor-1')"))
 // Purging a disposable workspace retains existing reservations and imported IDs.
 sql("create table records(entity text,id text,data jsonb,rev bigint default 1,updated_at timestamptz,updated_by text,deleted_at timestamptz,primary key(entity,id));")
 for(const table of ['user_files','proposals','spares_lines','clarifications','audit','approvals','leads','ai_secrets','price_lists','price_list_versions']) sql(`create table ${table}(id text primary key)`)
 sql(fs.readFileSync(new URL('../supabase/016_workspace_generation.sql',import.meta.url),'utf8').split('-- Keep the marker alive')[0])
 sql(fs.readFileSync(new URL('../supabase/023_preserve_number_reservations.sql',import.meta.url),'utf8'))
 sql("insert into records(entity,id,data) values('state','users','[]'); insert into price_lists values('kept'); insert into price_list_versions values('kept');")
 const before=Number(sql("select data->>'value' from records where id='workspace_generation'"))
 sql('select purge_workspace_data()')
 assert.equal(sql("select count(*) from opportunities"),'0')
 assert.equal(sql("select count(*) from settings where id='opportunity_reserved_MOD-0075'"),'1')
 assert.equal(sql("select data->>'next' from settings where id='opportunity_counter_continuous_all'"),'76')
 assert.equal(sql("select count(*) from price_lists"),'1')
 assert.equal(sql("select count(*) from price_list_versions"),'1')
 assert.equal(sql("select count(*) from records where id='users'"),'1')
 assert.ok(Number(sql("select data->>'value' from records where id='workspace_generation'"))>before)
 assert.equal(sql("select has_function_privilege('authenticated','public.purge_workspace_data()','execute')"),'f')
 assert.equal(sql("select reserve_opportunity_number('actor-1')"),month+'029')
})
