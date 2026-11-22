-- Explicit hall allocations and assistant membership.
-- Run schema.sql first on a new project. On an existing project, run this only
-- after public.invites has been created.

do $$
begin
  if to_regclass('public.invites') is null then
    raise exception 'The base ShareHouse schema is missing public.invites. Run backend/supabase/schema.sql first, then rerun backend/supabase/hall-allocation.sql.';
  end if;
end
$$;

create table if not exists public.hall_allocations (
  id uuid primary key default gen_random_uuid(),
  "tenantId" text not null,
  name text not null,
  "assignmentColumn" text not null,
  "assignmentValue" text not null,
  "createdBy" uuid not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", name)
);

create index if not exists hall_allocations_tenant_idx
  on public.hall_allocations ("tenantId", name);
create unique index if not exists hall_allocations_assignment_value_uidx
  on public.hall_allocations ("tenantId", "assignmentColumn", "assignmentValue");

alter table public.invites add column if not exists "hallId" uuid;
create index if not exists invites_hall_active_idx
  on public.invites ("tenantId", "hallId", "isActive");

alter table public.hall_allocations enable row level security;
