-- Drop leftover Porter Lodge and staff-account columns/tables.
-- Sharing tables stay intact. Run in the Supabase SQL Editor.

drop table if exists public.key_movements cascade;
drop table if exists public.shift_rosters cascade;
drop table if exists public.porter_invites cascade;
drop table if exists public.occupants cascade;
drop table if exists public.rooms cascade;

drop index if exists tenants_lodge_join_code_uidx;
alter table public.tenants drop column if exists "lodgeJoinCode";

alter table public.users drop column if exists "passwordPlain";
alter table public.users drop column if exists "createdByRole";
alter table public.users drop column if exists "approvedAt";

delete from public.users
where role in ('hall_admin', 'porter');

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'users'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%role%';
  if constraint_name is not null then
    execute format('alter table public.users drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('super_admin', 'tenant_admin', 'assistant'));
