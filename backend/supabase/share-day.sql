-- Additive migration for existing ShareHouse databases.
-- Run in the Supabase SQL Editor after the base schema.

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

alter table public.collection_voids enable row level security;
alter table public.list_exceptions enable row level security;
