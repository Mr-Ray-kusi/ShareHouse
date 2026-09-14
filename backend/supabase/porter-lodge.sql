-- Additive Porter Lodge / room-key module.
-- Run in the Supabase SQL Editor after the base schema.
-- Does not drop or rewrite sharing tables.

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
    and pg_get_constraintdef(con.oid) ilike '%tenant_admin%';
  if constraint_name is not null then
    execute format('alter table public.users drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('super_admin', 'tenant_admin', 'assistant', 'hall_admin', 'porter'));

alter table public.tenants add column if not exists "lodgeJoinCode" text;

create unique index if not exists tenants_lodge_join_code_uidx
  on public.tenants ("lodgeJoinCode")
  where "lodgeJoinCode" is not null;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  "tenantId" text not null,
  "roomNumber" text not null,
  "keyStatus" text not null default 'in_lodge' check ("keyStatus" in ('in_lodge', 'out')),
  "outOccupantId" uuid,
  "outOccupantName" text not null default '',
  "outStudentIndex" text not null default '',
  "outStaffId" uuid,
  "outStaffName" text not null default '',
  "outShift" text not null default '',
  "outAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", "roomNumber")
);

create index if not exists rooms_tenant_status_idx on public.rooms ("tenantId", "keyStatus");
create index if not exists rooms_tenant_number_idx on public.rooms ("tenantId", "roomNumber");

create table if not exists public.occupants (
  id uuid primary key default gen_random_uuid(),
  "tenantId" text not null,
  "roomId" uuid not null,
  "roomNumber" text not null,
  "fullName" text not null,
  "studentIndex" text not null,
  phone text not null default '',
  cohort text not null default 'continuing' check (cohort in ('fresher', 'continuing')),
  "searchText" text not null default '',
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", "roomId", "studentIndex")
);

create index if not exists occupants_tenant_room_idx on public.occupants ("tenantId", "roomId", "isActive");
create index if not exists occupants_tenant_search_idx on public.occupants ("tenantId", "searchText");
create index if not exists occupants_tenant_index_idx on public.occupants ("tenantId", "studentIndex");

create table if not exists public.porter_invites (
  id uuid primary key default gen_random_uuid(),
  "tenantId" text not null,
  code text not null,
  label text not null default '',
  "passwordHash" text not null,
  "passwordPlain" text not null default '',
  "createdBy" uuid not null,
  "porterId" uuid,
  "porterName" text not null default '',
  "isActive" boolean not null default true,
  "lastUsedAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists porter_invites_code_idx on public.porter_invites (code);
create index if not exists porter_invites_tenant_active_idx on public.porter_invites ("tenantId", "isActive");

create table if not exists public.shift_rosters (
  id uuid primary key default gen_random_uuid(),
  "tenantId" text not null,
  "rosterDate" date not null,
  "morningPorterIds" jsonb not null default '[]'::jsonb,
  "eveningPorterIds" jsonb not null default '[]'::jsonb,
  "createdBy" uuid,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", "rosterDate")
);

create index if not exists shift_rosters_tenant_date_idx on public.shift_rosters ("tenantId", "rosterDate" desc);

create table if not exists public.key_movements (
  id uuid primary key default gen_random_uuid(),
  "tenantId" text not null,
  "roomId" uuid,
  "roomNumber" text not null,
  "occupantId" uuid,
  "studentName" text not null default '',
  "studentIndex" text not null default '',
  action text not null check (action in ('in', 'out', 'failed')),
  "staffId" uuid not null,
  "staffName" text not null,
  shift text not null check (shift in ('morning', 'evening')),
  note text not null default '',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists key_movements_tenant_created_idx
  on public.key_movements ("tenantId", "createdAt" desc);
create index if not exists key_movements_room_created_idx
  on public.key_movements ("tenantId", "roomId", "createdAt" desc);
create index if not exists key_movements_action_created_idx
  on public.key_movements ("tenantId", action, "createdAt" desc);

alter table public.rooms enable row level security;
alter table public.occupants enable row level security;
alter table public.porter_invites enable row level security;
alter table public.shift_rosters enable row level security;
alter table public.key_movements enable row level security;
