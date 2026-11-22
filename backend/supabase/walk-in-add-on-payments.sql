-- Incremental payments for SRC-approved walk-in additions.
-- Run after campaign-billing.sql on existing projects.

alter table public.list_exceptions
  add column if not exists "addonPaymentId" uuid;

alter table public.list_exceptions
  drop constraint if exists list_exceptions_status_check;
alter table public.list_exceptions
  add constraint list_exceptions_status_check
  check (status in ('pending', 'payment_pending', 'approved', 'rejected', 'cancelled'));

create table if not exists public.campaign_addon_payments (
  id uuid primary key default gen_random_uuid(),
  "tenantId" text not null,
  "distributionId" uuid not null,
  reference text not null unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  "exceptionIds" uuid[] not null,
  "studentCount" integer not null check ("studentCount" > 0),
  amount integer not null check (amount > 0),
  currency text not null default 'GHS' check (currency = 'GHS'),
  "reviewedBy" uuid not null,
  "reviewedByName" text not null default '',
  "paymentUrl" text not null default '',
  "paidAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists campaign_addon_payments_tenant_created_idx
  on public.campaign_addon_payments ("tenantId", "createdAt" desc);
create unique index if not exists campaign_addon_payments_distribution_pending_idx
  on public.campaign_addon_payments ("distributionId")
  where status = 'pending';
alter table public.campaign_addon_payments enable row level security;

create or replace function public.guard_campaign_addon_distribution_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.campaign_addon_payments
    where "distributionId" = old.id and status = 'pending'
  ) and (
    new.status is distinct from old.status
    or new."paymentStatus" is distinct from old."paymentStatus"
    or new."paymentAmount" is distinct from old."paymentAmount"
    or new."paymentStudentCount" is distinct from old."paymentStudentCount"
  ) then
    raise exception using
      errcode = '23514',
      message = 'CAMPAIGN_BILLING_CONFLICT: A walk-in payment is in progress. Complete or release it before changing the campaign.';
  end if;
  return new;
end;
$$;

drop trigger if exists distributions_addon_payment_guard on public.distributions;
create trigger distributions_addon_payment_guard
before update on public.distributions
for each row execute function public.guard_campaign_addon_distribution_change();

create or replace function public.guard_campaign_addon_beneficiary_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  old_pending boolean := false;
  new_pending boolean := false;
begin
  if tg_op <> 'INSERT' then
    select exists (
      select 1 from public.campaign_addon_payments
      where "tenantId" = old."tenantId"
        and "distributionId" = old."distributionId"
        and status = 'pending'
    ) into old_pending;
  end if;
  if tg_op <> 'DELETE' then
    select exists (
      select 1 from public.campaign_addon_payments
      where "tenantId" = new."tenantId"
        and "distributionId" = new."distributionId"
        and status = 'pending'
    ) into new_pending;
  end if;
  if old_pending or new_pending then
    raise exception using
      errcode = '23514',
      message = 'CAMPAIGN_BILLING_CONFLICT: A walk-in payment is in progress. Complete or release it before changing the student list.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists beneficiaries_addon_payment_guard on public.beneficiaries;
create trigger beneficiaries_addon_payment_guard
before insert or update or delete on public.beneficiaries
for each row execute function public.guard_campaign_addon_beneficiary_change();

create or replace function public.reserve_campaign_addon_payment(
  p_tenant_id text,
  p_distribution_id uuid,
  p_exception_ids uuid[],
  p_reference text,
  p_reviewed_by uuid,
  p_reviewed_by_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  distribution_row public.distributions%rowtype;
  payment_id uuid;
  requested_count integer;
  matching_count integer;
begin
  requested_count := coalesce(array_length(p_exception_ids, 1), 0);
  if requested_count = 0 or requested_count > 500
    or (select count(distinct selected.id) from unnest(p_exception_ids) as selected(id)) <> requested_count then
    raise exception using errcode = '22023', message = 'Select between 1 and 500 distinct walk-in requests.';
  end if;

  select * into distribution_row
  from public.distributions
  where id = p_distribution_id and "tenantId" = p_tenant_id
  for update;
  if not found or distribution_row.status <> 'active'
    or distribution_row."paymentStatus" <> 'paid' then
    raise exception using errcode = '23514', message = 'Walk-in additions require an active, paid campaign.';
  end if;

  select count(*) into matching_count
  from public.list_exceptions
  where id = any(p_exception_ids)
    and "tenantId" = p_tenant_id
    and "distributionId" = p_distribution_id
    and status = 'pending';
  if matching_count <> requested_count then
    raise exception using errcode = '23514', message = 'One or more selected requests are no longer waiting for payment.';
  end if;

  if exists (
    select 1
    from public.list_exceptions
    where id = any(p_exception_ids)
    group by upper(trim("studentIndex"))
    having count(*) > 1
  ) or exists (
    select 1
    from public.list_exceptions e
    join public.beneficiaries b
      on b."tenantId" = p_tenant_id
      and b."distributionId" = p_distribution_id
      and upper(trim(b."studentIndex")) = upper(trim(e."studentIndex"))
    where e.id = any(p_exception_ids)
  ) then
    raise exception using errcode = '23514', message = 'A selected student is duplicated or already on the campaign list.';
  end if;

  insert into public.campaign_addon_payments (
    "tenantId", "distributionId", reference, "exceptionIds", "studentCount",
    amount, "reviewedBy", "reviewedByName"
  ) values (
    p_tenant_id, p_distribution_id, p_reference, p_exception_ids, requested_count,
    requested_count * 5, p_reviewed_by, coalesce(p_reviewed_by_name, '')
  ) returning id into payment_id;

  update public.list_exceptions
  set status = 'payment_pending',
      "addonPaymentId" = payment_id,
      "updatedAt" = now()
  where id = any(p_exception_ids)
    and "tenantId" = p_tenant_id
    and "distributionId" = p_distribution_id
    and status = 'pending';

  get diagnostics matching_count = row_count;
  if matching_count <> requested_count then
    raise exception using errcode = '23514', message = 'Selected requests changed while payment was being prepared.';
  end if;

  return payment_id;
end;
$$;

create or replace function public.cancel_campaign_addon_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.campaign_addon_payments
  set status = 'failed', "paymentUrl" = '', "updatedAt" = now()
  where id = p_payment_id and status = 'pending';
  if not found then return; end if;

  update public.list_exceptions
  set status = 'pending', "addonPaymentId" = null, "updatedAt" = now()
  where "addonPaymentId" = p_payment_id and status = 'payment_pending';
end;
$$;

create or replace function public.complete_campaign_addon_payment(
  p_reference text,
  p_tenant_id text,
  p_distribution_id uuid,
  p_student_count integer,
  p_amount integer,
  p_paid_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  payment_row public.campaign_addon_payments%rowtype;
  distribution_row public.distributions%rowtype;
  request_count integer;
  current_count integer;
begin
  select * into payment_row
  from public.campaign_addon_payments
  where reference = p_reference
  for update;
  if not found then return null; end if;

  if payment_row.status = 'paid' then
    return payment_row."distributionId";
  end if;
  if payment_row.status <> 'pending'
    or payment_row."tenantId" <> p_tenant_id
    or payment_row."distributionId" <> p_distribution_id
    or payment_row."studentCount" <> p_student_count
    or payment_row.amount <> p_amount
    or payment_row.amount <> payment_row."studentCount" * 5 then
    raise exception using errcode = '23514', message = 'Payment does not match the reserved walk-in requests.';
  end if;

  select * into distribution_row
  from public.distributions
  where id = payment_row."distributionId" and "tenantId" = payment_row."tenantId"
  for update;
  if not found or distribution_row.status <> 'active'
    or distribution_row."paymentStatus" <> 'paid' then
    raise exception using errcode = '23514', message = 'The campaign is no longer active and paid.';
  end if;

  select count(*) into request_count
  from public.list_exceptions
  where id = any(payment_row."exceptionIds")
    and "tenantId" = payment_row."tenantId"
    and "distributionId" = payment_row."distributionId"
    and status = 'payment_pending'
    and "addonPaymentId" = payment_row.id;
  if request_count <> payment_row."studentCount" then
    raise exception using errcode = '23514', message = 'The reserved walk-in requests have changed.';
  end if;

  update public.campaign_addon_payments
  set status = 'paid',
      "paidAt" = coalesce(p_paid_at, now()),
      "updatedAt" = now()
  where id = payment_row.id;

  if exists (
    select 1
    from public.list_exceptions e
    join public.beneficiaries b
      on b."tenantId" = payment_row."tenantId"
      and b."distributionId" = payment_row."distributionId"
      and upper(trim(b."studentIndex")) = upper(trim(e."studentIndex"))
    where e.id = any(payment_row."exceptionIds")
  ) then
    raise exception using errcode = '23514', message = 'A selected student is already on the campaign list.';
  end if;

  update public.distributions
  set status = 'draft', "updatedAt" = now()
  where id = distribution_row.id and "tenantId" = distribution_row."tenantId";

  insert into public.beneficiaries (
    "tenantId", "distributionId", "studentIndex", "fullName", level, phone, "sheetRow", "searchText"
  )
  select
    payment_row."tenantId",
    payment_row."distributionId",
    upper(trim(e."studentIndex")),
    e."fullName",
    e.level,
    e.phone,
    coalesce(e."sheetRow", '{}'::jsonb),
    lower(concat_ws(' ', e."studentIndex", e."fullName", e.level, e.phone, e."sheetRow"::text))
  from public.list_exceptions e
  where e.id = any(payment_row."exceptionIds")
    and e."addonPaymentId" = payment_row.id
    and e.status = 'payment_pending';

  update public.list_exceptions e
  set status = 'approved',
      "reviewedBy" = payment_row."reviewedBy",
      "reviewedByName" = payment_row."reviewedByName",
      "reviewNote" = 'Added after SRC payment.',
      "beneficiaryId" = b.id,
      "updatedAt" = now()
  from public.beneficiaries b
  where e.id = any(payment_row."exceptionIds")
    and e."addonPaymentId" = payment_row.id
    and e.status = 'payment_pending'
    and b."tenantId" = payment_row."tenantId"
    and b."distributionId" = payment_row."distributionId"
    and upper(trim(b."studentIndex")) = upper(trim(e."studentIndex"));

  select count(*) into current_count
  from public.beneficiaries
  where "tenantId" = payment_row."tenantId"
    and "distributionId" = payment_row."distributionId";

  update public.distributions
  set status = 'active',
      "paymentStatus" = 'paid',
      "paymentStudentCount" = current_count,
      "paymentAmount" = current_count * 5,
      "paymentReference" = '',
      "paymentUrl" = '',
      "paymentPaidAt" = coalesce(p_paid_at, now()),
      "beneficiaryCount" = current_count,
      "updatedAt" = now()
  where id = payment_row."distributionId"
    and "tenantId" = payment_row."tenantId";

  return payment_row."distributionId";
end;
$$;

revoke all on function public.reserve_campaign_addon_payment(text, uuid, uuid[], text, uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_campaign_addon_payment(uuid) from public, anon, authenticated;
revoke all on function public.complete_campaign_addon_payment(text, text, uuid, integer, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.guard_campaign_addon_distribution_change() from public, anon, authenticated;
revoke all on function public.guard_campaign_addon_beneficiary_change() from public, anon, authenticated;
grant execute on function public.reserve_campaign_addon_payment(text, uuid, uuid[], text, uuid, text) to service_role;
grant execute on function public.cancel_campaign_addon_payment(uuid) to service_role;
grant execute on function public.complete_campaign_addon_payment(text, text, uuid, integer, integer, timestamptz) to service_role;
