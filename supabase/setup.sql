-- The Lions Den v2.0: shared data setup for Supabase
-- Paste all of this into Supabase → SQL Editor → New query, then press Run.
-- It's safe to run again: it only adds what's missing and updates the functions. Nothing is deleted.

-- 1. Squad members who can sign in, and what they can do
create table if not exists public.people (
  pid        text primary key,                       -- squad player id from the app, e.g. p10
  role       text not null default 'none' check (role in ('admin','scorer','none')),
  uid        uuid unique references auth.users(id) on delete set null,
  requested  boolean not null default false,          -- signed up but not yet allowed to score
  name       text,                                    -- display name, e.g. A. Nancollis
  updated_at timestamptz not null default now()
);

-- The three admins (Andy Nancollis, Dave Dibble, Adam Watt)
insert into public.people (pid, role, name) values
  ('p10','admin','A. Nancollis'),
  ('p9','admin','D. Dibble'),
  ('p13','admin','A. Watt')
on conflict (pid) do nothing;

-- 2. Team data: one row per shared item (fixtures, squad, rules, each match, each team sheet, subs)
create table if not exists public.docs (
  key        text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- 3. Helper checks, used by the security rules below
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.people where uid = auth.uid() and requested = false
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;
create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin','scorer'), false)
$$;
-- Items a scorer may change on match night; everything else is admin only
create or replace function public.scorer_key(k text) returns boolean
language sql immutable as $$
  select k in ('players','oppNames') or k like 'sel:%' or k like 'match:%'
$$;

-- Keep updated_at current
create or replace function public.touch() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs for each row execute function public.touch();
drop trigger if exists people_touch on public.people;
create trigger people_touch before update on public.people for each row execute function public.touch();

-- 4. Security rules (enforced by the database, whatever app is used)
alter table public.docs enable row level security;
alter table public.people enable row level security;

drop policy if exists docs_read on public.docs;
create policy docs_read on public.docs for select
  using (key not like 'subs:%' or public.is_admin());
drop policy if exists docs_insert on public.docs;
create policy docs_insert on public.docs for insert
  with check (public.is_admin() or (public.is_editor() and public.scorer_key(key)));
drop policy if exists docs_update on public.docs;
create policy docs_update on public.docs for update
  using (public.is_admin() or (public.is_editor() and public.scorer_key(key)))
  with check (public.is_admin() or (public.is_editor() and public.scorer_key(key)));
drop policy if exists docs_delete on public.docs;
create policy docs_delete on public.docs for delete using (public.is_admin());

drop policy if exists people_read on public.people;
create policy people_read on public.people for select using (true);
drop policy if exists people_admin on public.people;
create policy people_admin on public.people for all
  using (public.is_admin()) with check (public.is_admin());

grant select on public.docs, public.people to anon, authenticated;
grant insert, update, delete on public.docs, public.people to authenticated;

-- 5. Signing up: link a new sign-in to a squad name.
-- Every new sign-in waits as a request until an admin approves it (the role set beforehand is what they get).
create or replace function public.claim_player(p_pid text, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.people%rowtype;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from public.people where uid = me and pid <> p_pid) then
    raise exception 'This sign-in is already linked to another player';
  end if;
  select * into r from public.people where pid = p_pid;
  if found and r.uid is not null and r.uid <> me then
    raise exception 'That player already has a sign-in. Ask an admin to unlink it.';
  end if;
  if found and r.uid = me then   -- already linked: no change
    return case when r.requested or r.role = 'none' then 'requested' else r.role end;
  end if;
  if not found then
    insert into public.people (pid, role, uid, requested, name) values (p_pid, 'none', me, true, p_name);
  else
    update public.people set uid = me, requested = true, name = coalesce(r.name, p_name) where pid = p_pid;
  end if;
  return 'requested';
end $$;
revoke all on function public.claim_player(text, text) from public, anon;
grant execute on function public.claim_player(text, text) to authenticated;

-- Admins only: the email used for each waiting request, so they can check who it is
create or replace function public.admin_requests() returns table(pid text, email text)
language sql stable security definer set search_path = public, auth as $$
  select p.pid, u.email::text from public.people p join auth.users u on u.id = p.uid
  where p.requested and public.is_admin()
$$;
revoke all on function public.admin_requests() from public, anon;
grant execute on function public.admin_requests() to authenticated;

-- 6. Live updates to every phone
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'people') then
    alter publication supabase_realtime add table public.people;
  end if;
end $$;

select 'Lions Den setup complete' as result;
