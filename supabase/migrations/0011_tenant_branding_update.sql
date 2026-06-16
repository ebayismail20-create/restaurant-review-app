-- ============================================================
-- Let owners edit their venue's branding from the dashboard. Column-level
-- grant + RLS so they can change ONLY branding fields, ONLY on their tenant —
-- never slug/id (which anchor the public QR URLs) or other tenants' rows.
-- (Review platforms + notification channels already have tenant-scoped CRUD
-- from migrations 0006 / 0008.)
-- ============================================================
revoke update on public.tenants from authenticated;
grant update (name, tagline, location_name, logo_url, brand_color)
  on public.tenants to authenticated;

drop policy if exists tenants_own_update on public.tenants;
create policy tenants_own_update on public.tenants
  for update to authenticated
  using (id in (select public.current_tenant_ids()))
  with check (id in (select public.current_tenant_ids()));
