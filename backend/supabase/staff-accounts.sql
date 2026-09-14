-- Hall-admin / hall-president account fields.
-- Run in the Supabase SQL Editor after porter-lodge.sql.

alter table public.users add column if not exists "passwordPlain" text not null default '';
alter table public.users add column if not exists "createdByRole" text not null default '';
alter table public.users add column if not exists "approvedAt" timestamptz;
