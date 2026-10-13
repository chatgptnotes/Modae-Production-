-- Synthetic fixtures for a disposable local approval test database only.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create table records(entity text,id text,data jsonb not null default '{}',rev bigint not null default 1,updated_at timestamptz default now(),updated_by text,deleted_at timestamptz,primary key(entity,id));
create table approvals(id text primary key,data jsonb not null default '{}',rev bigint not null default 1,updated_at timestamptz default now(),updated_by text,deleted_at timestamptz);
create table opportunities(like approvals including all); create table leads(like approvals including all); create table proposals(like approvals including all); create table clarifications(like approvals including all); create table spares_lines(like approvals including all); create table settings(like approvals including all); create table audit(like approvals including all);
insert into records(entity,id,data) values ('state','users','[{"id":"u","authId":"11111111-1111-4111-8111-111111111111","status":"Active","role":"LJS"}]'),('state','workspace_generation','{"value":0}');
insert into settings(id,data) values('config','{}');
