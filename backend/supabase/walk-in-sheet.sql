-- Store walk-in students with the same Excel columns as the hall list.
-- Run in the Supabase SQL Editor on existing projects.

alter table public.list_exceptions add column if not exists "sheetRow" jsonb not null default '{}'::jsonb;
