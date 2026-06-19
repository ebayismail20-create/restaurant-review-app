-- ============================================================
-- Onboarding: owners manage their tables (for QR / NFC), and a public venue
-- "digital business card" page reads branding by slug.
-- ============================================================

-- Owners may create/rename/toggle/delete their own tables, but NEVER set or
-- change the per-table `token` (server-generated physical-presence proof) or
-- move a table to another tenant. Column-level grants enforce the columns;
-- RLS enforces the tenant.
revoke insert, update on public.tables from authenticated;
grant insert (tenant_id, label, server_name, active) on public.tables to authenticated;
grant update (label, server_name, active) on public.tables to authenticated;

drop policy if exists tables_own_insert on public.tables;
create policy tables_own_insert on public.tables
  for insert to authenticated
  with check (tenant_id in (select public.current_tenant_ids()));

drop policy if exists tables_own_update on public.tables;
create policy tables_own_update on public.tables
  for update to authenticated
  using (tenant_id in (select public.current_tenant_ids()))
  with check (tenant_id in (select public.current_tenant_ids()));

drop policy if exists tables_own_delete on public.tables;
create policy tables_own_delete on public.tables
  for delete to authenticated
  using (tenant_id in (select public.current_tenant_ids()));

-- Public venue card: branding + review platforms by slug, no token. Only data
-- already shown to guests; no submissions, no tokens.
create or replace function public.get_card(p_slug text)
returns table (
  brand_name    text,
  tagline       text,
  location_name text,
  logo_url      text,
  brand_color   text,
  platforms     jsonb
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    t.name,
    t.tagline,
    t.location_name,
    t.logo_url,
    t.brand_color,
    coalesce((
      select jsonb_agg(jsonb_build_object('kind', p.kind, 'label', p.label, 'url', p.url) order by p.sort_order)
      from public.tenant_platforms p
      where p.tenant_id = t.id and p.enabled
    ), '[]'::jsonb)
  from public.tenants t
  where t.slug = p_slug;
$$;
revoke all on function public.get_card(text) from public;
grant execute on function public.get_card(text) to anon, authenticated;
