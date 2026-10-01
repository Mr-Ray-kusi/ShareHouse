-- Assistant list sections (Level, Hall, or another Excel column).
-- Run in the Supabase SQL Editor on existing projects.

alter table public.invites add column if not exists "assignmentColumn" text not null default '';
alter table public.invites add column if not exists "assignmentValues" text[] not null default '{}';
