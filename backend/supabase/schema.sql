-- ShareHouse schema for Supabase Postgres.
-- Run once in the Supabase SQL Editor (Dashboard → SQL → New query).

create extension if not exists pgcrypto;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  "tenantId" text not null unique,
  name text not null,
  "schoolName" text not null,
  "adminName" text not null,
  "adminEmail" text not null,
  "adminPhone" text not null,
  "subscriptionPlan" text not null check ("subscriptionPlan" in ('hall', 'src')),
  "subscriptionFee" integer not null,
  "isActive" boolean not null default false,
  "expiryDate" timestamptz not null,
  "paystackCustomerCode" text not null default '',
  "paystackReference" text not null default '',
  "lastPaymentAt" timestamptz,
  "joinCode" text,
  "lodgeJoinCode" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create unique index if not exists tenants_join_code_uidx
  on public.tenants ("joinCode")
  where "joinCode" is not null;
create unique index if not exists tenants_lodge_join_code_uidx
  on public.tenants ("lodgeJoinCode")
  where "lodgeJoinCode" is not null;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  "tenantId" text,
  name text not null,
  email text,
  phone text not null default '',
  "passwordHash" text not null,
  role text not null check (role in ('super_admin', 'tenant_admin', 'assistant', 'hall_admin', 'porter')),
  "isActive" boolean not null default true,
  "inviteId" uuid,
  "refreshTokens" jsonb not null default '[]'::jsonb,
  "lastLogin" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create unique index if not exists users_email_uidx
  on public.users (email)
  where email is not null;
create index if not exists users_tenant_role_idx on public.users ("tenantId", role);

create table if not exists public.distributions (
  id uuid primary key default gen_random_uuid(),
  "tenantId" text not null,
  title text not null,
  description text not null default '',
  "itemName" text not null default '',
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'cancelled')),
  "startDate" timestamptz,
  "endDate" timestamptz,
  "createdBy" uuid not null,
  "beneficiaryCount" integer not null default 0,
  "receivedCount" integer not null default 0,
  "sheetHeaders" text[] not null default '{}',
  "originalFileName" text not null default '',
  "storedFileName" text not null default '',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists distributions_tenant_status_idx on public.distributions ("tenantId", status);
create index if not exists distributions_tenant_created_idx on public.distributions ("tenantId", "createdAt" desc);

create table if not exists public.beneficiaries (
  id uuid primary key default gen_random_uuid(),
  "tenantId" text not null,
  "distributionId" uuid not null,
  "studentIndex" text not null,
  "fullName" text not null,
  level text not null default '',
  phone text not null default '',
  "sheetRow" jsonb not null default '{}'::jsonb,
  "searchText" text not null default '',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", "distributionId", "studentIndex")
);

create index if not exists beneficiaries_search_idx on public.beneficiaries ("tenantId", "distributionId", "searchText");
create extension if not exists pg_trgm;
create index if not exists beneficiaries_search_trgm_idx
  on public.beneficiaries using gin ("searchText" gin_trgm_ops);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  "tenantId" text not null,
  "distributionId" uuid not null,
  "beneficiaryId" uuid not null,
  "assistantId" uuid not null,
  "studentIndex" text not null,
  "beneficiaryName" text not null,
  "assistantName" text not null,
  "collectedAt" timestamptz not null default now(),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("distributionId", "beneficiaryId")
);

create index if not exists collections_tenant_collected_idx on public.collections ("tenantId", "collectedAt" desc);
create index if not exists collections_tenant_dist_collected_idx
  on public.collections ("tenantId", "distributionId", "collectedAt" desc);
create index if not exists collections_assistant_idx
  on public.collections ("tenantId", "assistantId", "collectedAt" desc);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  "tenantId" text not null,
  code text not null,
  label text not null default '',
  "passwordHash" text not null,
  "passwordPlain" text not null default '',
  "distributionId" uuid,
  "createdBy" uuid not null,
  "assistantId" uuid,
  "assistantName" text not null default '',
  "isActive" boolean not null default true,
  "lastUsedAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists invites_code_idx on public.invites (code);
create index if not exists invites_tenant_active_idx on public.invites ("tenantId", "isActive");

create table if not exists public.sheet_uploads (
  id uuid primary key default gen_random_uuid(),
  "tenantId" text not null,
  "tenantName" text not null default '',
  "schoolName" text not null default '',
  "distributionId" uuid not null,
  "distributionTitle" text not null default '',
  "originalFileName" text not null,
  "storedFileName" text not null,
  "mimeType" text not null default '',
  size integer not null default 0,
  "uploadedBy" uuid,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists sheet_uploads_created_idx on public.sheet_uploads ("createdAt" desc);
create index if not exists sheet_uploads_tenant_idx on public.sheet_uploads ("tenantId");

create table if not exists public.system_events (
  id uuid primary key default gen_random_uuid(),
  pillar text not null default 'health' check (pillar in ('health', 'behavior', 'funnel', 'audience')),
  name text not null,
  path text not null default '',
  method text not null default '',
  status integer not null default 0,
  "durationMs" integer not null default 0,
  value double precision not null default 0,
  message text not null default '',
  metric text not null default '',
  term text not null default '',
  "tenantId" text not null default '',
  role text not null default '',
  device text not null default '',
  browser text not null default '',
  channel text not null default '',
  country text not null default '',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists system_events_created_idx on public.system_events ("createdAt" desc);
create index if not exists system_events_name_created_idx on public.system_events (name, "createdAt" desc);
create index if not exists system_events_pillar_idx on public.system_events (pillar);

create table if not exists public.collection_voids (
  id uuid primary key default gen_random_uuid(),
  "tenantId" text not null,
  "distributionId" uuid not null,
  "beneficiaryId" uuid not null,
  "collectionId" uuid,
  "studentIndex" text not null default '',
  "beneficiaryName" text not null default '',
  "originalAssistantId" uuid,
  "originalAssistantName" text not null default '',
  "originalCollectedAt" timestamptz,
  "voidedBy" uuid not null,
  "voidedByName" text not null default '',
  reason text not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists collection_voids_tenant_dist_idx
  on public.collection_voids ("tenantId", "distributionId", "createdAt" desc);

create table if not exists public.list_exceptions (
  id uuid primary key default gen_random_uuid(),
  "tenantId" text not null,
  "distributionId" uuid not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  "studentIndex" text not null default '',
  "fullName" text not null,
  level text not null default '',
  phone text not null default '',
  reason text not null,
  "photoFileName" text not null default '',
  "photoMimeType" text not null default '',
  "requestedBy" uuid not null,
  "requestedByName" text not null default '',
  "reviewedBy" uuid,
  "reviewedByName" text not null default '',
  "reviewNote" text not null default '',
  "beneficiaryId" uuid,
  "markedOnApprove" boolean not null default false,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists list_exceptions_tenant_status_idx
  on public.list_exceptions ("tenantId", "distributionId", status, "createdAt" desc);

alter table public.tenants enable row level security;
alter table public.users enable row level security;
alter table public.distributions enable row level security;
alter table public.beneficiaries enable row level security;
alter table public.collections enable row level security;
alter table public.invites enable row level security;
alter table public.sheet_uploads enable row level security;
alter table public.system_events enable row level security;
alter table public.collection_voids enable row level security;
alter table public.list_exceptions enable row level security;

-- Porter lodge tables live in porter-lodge.sql so existing sharing tables stay untouched.
