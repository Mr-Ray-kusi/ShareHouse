-- Campaign-level billing: 5 pesewas (GHS 0.05) per student.
-- Run in the Supabase SQL Editor before deploying the campaign billing API.

alter table public.distributions
  add column if not exists "paymentStatus" text not null default 'unpaid'
    check ("paymentStatus" in ('unpaid', 'pending', 'paid')),
  add column if not exists "paymentAmount" integer not null default 0,
  add column if not exists "paymentStudentCount" integer not null default 0,
  add column if not exists "paymentReference" text not null default '',
  add column if not exists "paymentUrl" text not null default '',
  add column if not exists "paymentPaidAt" timestamptz;

-- Let already-live campaigns finish, but require a new payment before they can
-- be activated again. Their prior subscription payments are not campaign payments.
update public.distributions d
set "paymentStatus" = 'paid',
    "paymentStudentCount" = 0,
    "paymentAmount" = 0,
    "paymentPaidAt" = coalesce(d."updatedAt", now())
where d.status = 'active'
  and d."paymentStatus" = 'unpaid';

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

alter table public.campaign_payments enable row level security;
