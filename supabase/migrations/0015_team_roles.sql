-- ============================================================
-- Team roles: owner / manager / staff. tenant_members.role already exists;
-- this enforces it in RLS (the real security layer, not just the UI).
--   owner   → everything incl. Settings (branding / platforms / channels)
--   manager → + table/QR setup, analytics, etc. (no Settings)
--   staff   → read + resolve/notes only (handle feedback); no config writes
-- Reads and resolve/notes stay open to all members (current_tenant_ids).
-- ============================================================

-- Allow the three roles the dashboard enforces (the original check predates
-- 'manager' / 'staff').
alter table public.tenant_members drop constraint if exists tenant_members_role_check;
alter table public.tenant_members
  add constraint tenant_members_role_check check (role in ('owner', 'manager', 'staff'));

create or replace function public.current_owner_tenant_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select tenant_id from public.tenant_members
  where user_id = (select auth.uid()) and role = 'owner';
$$;
revoke all on function public.current_owner_tenant_ids() from public, anon;
grant execute on function public.current_owner_tenant_ids() to authenticated;

create or replace function public.current_manager_tenant_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select tenant_id from public.tenant_members
  where user_id = (select auth.uid()) and role in ('owner', 'manager');
$$;
revoke all on function public.current_manager_tenant_ids() from public, anon;
grant execute on function public.current_manager_tenant_ids() to authenticated;

-- Settings → owner only.
drop policy if exists tenants_own_update on public.tenants;
create policy tenants_own_update on public.tenants for update to authenticated
  using (id in (select public.current_owner_tenant_ids()))
  with check (id in (select public.current_owner_tenant_ids()));

drop policy if exists platforms_insert on public.tenant_platforms;
create policy platforms_insert on public.tenant_platforms for insert to authenticated
  with check (tenant_id in (select public.current_owner_tenant_ids()));
drop policy if exists platforms_update on public.tenant_platforms;
create policy platforms_update on public.tenant_platforms for update to authenticated
  using (tenant_id in (select public.current_owner_tenant_ids()))
  with check (tenant_id in (select public.current_owner_tenant_ids()));
drop policy if exists platforms_delete on public.tenant_platforms;
create policy platforms_delete on public.tenant_platforms for delete to authenticated
  using (tenant_id in (select public.current_owner_tenant_ids()));

drop policy if exists channels_insert on public.tenant_notification_channels;
create policy channels_insert on public.tenant_notification_channels for insert to authenticated
  with check (tenant_id in (select public.current_owner_tenant_ids()));
drop policy if exists channels_update on public.tenant_notification_channels;
create policy channels_update on public.tenant_notification_channels for update to authenticated
  using (tenant_id in (select public.current_owner_tenant_ids()))
  with check (tenant_id in (select public.current_owner_tenant_ids()));
drop policy if exists channels_delete on public.tenant_notification_channels;
create policy channels_delete on public.tenant_notification_channels for delete to authenticated
  using (tenant_id in (select public.current_owner_tenant_ids()));

-- Table / QR setup → owner + manager.
drop policy if exists tables_own_insert on public.tables;
create policy tables_own_insert on public.tables for insert to authenticated
  with check (tenant_id in (select public.current_manager_tenant_ids()));
drop policy if exists tables_own_update on public.tables;
create policy tables_own_update on public.tables for update to authenticated
  using (tenant_id in (select public.current_manager_tenant_ids()))
  with check (tenant_id in (select public.current_manager_tenant_ids()));
drop policy if exists tables_own_delete on public.tables;
create policy tables_own_delete on public.tables for delete to authenticated
  using (tenant_id in (select public.current_manager_tenant_ids()));

create or replace function public.rotate_table_token(p_table_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  update public.tables set token = encode(extensions.gen_random_bytes(24), 'hex')
   where id = p_table_id and tenant_id in (select public.current_manager_tenant_ids())
  returning token into v_token;
  if v_token is null then raise exception 'not_authorized' using errcode = 'P0001'; end if;
  return v_token;
end; $$;
revoke all on function public.rotate_table_token(uuid) from public, anon;
grant execute on function public.rotate_table_token(uuid) to authenticated;
