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
  "srcTenantId" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create unique index if not exists tenants_join_code_uidx
  on public.tenants ("joinCode")
  where "joinCode" is not null;
create index if not exists tenants_src_tenant_idx on public.tenants ("srcTenantId");

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  "tenantId" text,
  name text not null,
  email text,
  phone text not null default '',
  "passwordHash" text not null,
  role text not null check (role in ('super_admin', 'tenant_admin', 'assistant')),
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
  "paymentStatus" text not null default 'unpaid' check ("paymentStatus" in ('unpaid', 'pending', 'paid')),
  "paymentAmount" integer not null default 0,
  "paymentStudentCount" integer not null default 0,
  "paymentReference" text not null default '',
  "paymentUrl" text not null default '',
  "paymentPaidAt" timestamptz,
  "sheetHeaders" text[] not null default '{}',
  "originalFileName" text not null default '',
  "storedFileName" text not null default '',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists distributions_tenant_status_idx on public.distributions ("tenantId", status);
create index if not exists distributions_tenant_created_idx on public.distributions ("tenantId", "createdAt" desc);
create unique index if not exists distributions_payment_reference_uidx
  on public.distributions ("paymentReference")
  where "paymentReference" <> '';

create table if not exists public.campaign_payments (
  id uuid primary key default gen_random_uuid(),
  "tenantId" text not null,
  "distributionId" uuid not null,
  reference text not null unique,
  "studentCount" integer not null check ("studentCount" > 0),
  amount integer not null check (amount > 0),
  currency text not null default 'GHS' check (currency = 'GHS'),
  "paidAt" timestamptz not null default now(),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists campaign_payments_tenant_paid_idx
  on public.campaign_payments ("tenantId", "paidAt" desc);

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
  "assignmentColumn" text not null default '',
  "assignmentValues" text[] not null default '{}',
  "isActive" boolean not null default true,
  "lastUsedAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists invites_code_idx on public.invites (code);
create index if not exists invites_tenant_active_idx on public.invites ("tenantId", "isActive");
alter table public.invites add column if not exists "assignmentColumn" text not null default '';
alter table public.invites add column if not exists "assignmentValues" text[] not null default '{}';
alter table public.invites add column if not exists "hallId" uuid;

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
create index if not exists invites_hall_active_idx
  on public.invites ("tenantId", "hallId", "isActive");

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
  "sheetRow" jsonb not null default '{}'::jsonb,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists list_exceptions_tenant_status_idx
  on public.list_exceptions ("tenantId", "distributionId", status, "createdAt" desc);
alter table public.list_exceptions add column if not exists "sheetRow" jsonb not null default '{}'::jsonb;

create or replace function public.check_distribution_campaign_billing()
returns trigger
language plpgsql
as $$
declare
  current_count integer;
  should_check_activation boolean;
begin
  if new."paymentStatus" = 'pending' then
    select count(*)::integer into current_count
    from public.beneficiaries
    where "tenantId" = new."tenantId" and "distributionId" = new.id;
    if current_count = 0
      or new."paymentStudentCount" <> current_count
      or new."paymentAmount" <> current_count * 5 then
      raise exception using
        errcode = '23514',
        message = 'CAMPAIGN_BILLING_CONFLICT: Pending payment does not match the current student list.';
    end if;
  end if;

  if tg_op = 'INSERT' then
    should_check_activation := new.status = 'active';
  else
    should_check_activation := new.status = 'active' and old.status is distinct from 'active';
  end if;

  if should_check_activation
    and not (
      new."paymentStatus" = 'paid'
      and new."paymentReference" = ''
      and new."paymentStudentCount" = 0
      and new."paymentAmount" = 0
      and new."paymentPaidAt" is not null
    ) then
    select count(*)::integer into current_count
    from public.beneficiaries
    where "tenantId" = new."tenantId" and "distributionId" = new.id;
    if current_count = 0
      or new."paymentStatus" <> 'paid'
      or new."paymentStudentCount" <> current_count
      or new."paymentAmount" <> current_count * 5 then
      raise exception using
        errcode = '23514',
        message = 'CAMPAIGN_BILLING_CONFLICT: Campaign activation requires a matching paid student list.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists distributions_campaign_billing_guard on public.distributions;
create trigger distributions_campaign_billing_guard
before insert or update on public.distributions
for each row execute function public.check_distribution_campaign_billing();

create or replace function public.check_beneficiary_campaign_billing()
returns trigger
language plpgsql
as $$
declare
  tenant_id text;
  distribution_id uuid;
  distribution_status text;
  payment_status text;
begin
  if tg_op = 'DELETE' then
    tenant_id := old."tenantId";
    distribution_id := old."distributionId";
  else
    tenant_id := new."tenantId";
    distribution_id := new."distributionId";
  end if;

  select d.status, d."paymentStatus"
    into distribution_status, payment_status
  from public.distributions d
  where d.id = distribution_id and d."tenantId" = tenant_id
  for update;
  if not found then
    raise exception using
      errcode = '23514',
      message = 'CAMPAIGN_BILLING_CONFLICT: Student list is not attached to a valid campaign.';
  end if;
  if payment_status = 'pending' then
    raise exception using
      errcode = '23514',
      message = 'CAMPAIGN_BILLING_CONFLICT: Student list cannot change while payment is pending.';
  end if;
  if distribution_status = 'active' then
    if tg_op <> 'UPDATE'
      or new."tenantId" is distinct from old."tenantId"
      or new."distributionId" is distinct from old."distributionId"
      or new."studentIndex" is distinct from old."studentIndex" then
      raise exception using
        errcode = '23514',
        message = 'CAMPAIGN_BILLING_CONFLICT: Pause the campaign before changing its student list.';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists beneficiaries_campaign_billing_guard on public.beneficiaries;
create trigger beneficiaries_campaign_billing_guard
before insert or update or delete on public.beneficiaries
for each row execute function public.check_beneficiary_campaign_billing();

create or replace function public.check_collection_campaign_billing()
returns trigger
language plpgsql
as $$
declare
  distribution_status text;
  payment_status text;
  paid_student_count integer;
  payment_amount integer;
  payment_reference text;
  payment_paid_at timestamptz;
  current_count integer;
begin
  select d.status, d."paymentStatus", d."paymentStudentCount", d."paymentAmount",
         d."paymentReference", d."paymentPaidAt"
    into distribution_status, payment_status, paid_student_count, payment_amount,
         payment_reference, payment_paid_at
  from public.distributions d
  where d.id = new."distributionId" and d."tenantId" = new."tenantId"
  for update;
  if not found or distribution_status <> 'active' or payment_status <> 'paid' then
    raise exception using
      errcode = '23514',
      message = 'CAMPAIGN_BILLING_CONFLICT: Collections require an active, paid campaign.';
  end if;

  if not (
    payment_reference = ''
    and paid_student_count = 0
    and payment_amount = 0
    and payment_paid_at is not null
  ) then
    select count(*)::integer into current_count
    from public.beneficiaries
    where "tenantId" = new."tenantId" and "distributionId" = new."distributionId";
    if current_count = 0
      or paid_student_count <> current_count
      or payment_amount <> current_count * 5 then
      raise exception using
        errcode = '23514',
        message = 'CAMPAIGN_BILLING_CONFLICT: Collection campaign payment does not match its student list.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists collections_campaign_billing_guard on public.collections;
create trigger collections_campaign_billing_guard
before insert on public.collections
for each row execute function public.check_collection_campaign_billing();

alter table public.tenants enable row level security;
alter table public.users enable row level security;
alter table public.distributions enable row level security;
alter table public.campaign_payments enable row level security;
alter table public.beneficiaries enable row level security;
alter table public.collections enable row level security;
alter table public.invites enable row level security;
alter table public.hall_allocations enable row level security;
alter table public.sheet_uploads enable row level security;
alter table public.system_events enable row level security;
alter table public.collection_voids enable row level security;
alter table public.list_exceptions enable row level security;
