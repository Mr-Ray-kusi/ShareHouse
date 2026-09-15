-- SRC campus halls. Run in the Supabase SQL Editor.
-- Sharing tables stay intact.

alter table public.tenants add column if not exists "srcTenantId" text;
create index if not exists tenants_src_tenant_idx on public.tenants ("srcTenantId");
