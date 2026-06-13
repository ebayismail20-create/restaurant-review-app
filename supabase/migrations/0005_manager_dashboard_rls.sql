-- ============================================================
-- Manager dashboard: authenticated, tenant-scoped read access.
--
-- The guest side is unchanged: anon has no table policies and writes only
-- through SECURITY DEFINER functions (which bypass RLS). This adds a SEPARATE
-- authenticated plane — a logged-in manager (Supabase Auth) can SELECT only
-- their own tenant's rows. Two trust planes on the same tables.
--
-- Demo manager account is created out-of-band (see README); it is not in this
-- migration because it carries a password.
-- ============================================================

create table public.tenant_members (
  user_id    uuid not null references auth.users (id) on delete cascade,
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  role       text not null default 'manager' check (role in ('manager','owner')),
  created_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);
alter table public.tenant_members enable row level security;

-- Tenants the current user manages. SECURITY DEFINER so the membership lookup
-- bypasses RLS (prevents recursive policy evaluation). Returns nothing for
-- anon (auth.uid() is null), so exposure is harmless.
create or replace function public.current_tenant_ids()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select tenant_id from public.tenant_members where user_id = (select auth.uid());
$$;
revoke all on function public.current_tenant_ids() from public;
grant execute on function public.current_tenant_ids() to authenticated;

-- Authenticated read policies, each scoped to the manager's tenants.
create policy members_self_read on public.tenant_members
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy tenants_own_read on public.tenants
  for select to authenticated
  using (id in (select public.current_tenant_ids()));

create policy tables_own_read on public.tables
  for select to authenticated
  using (tenant_id in (select public.current_tenant_ids()));

create policy submissions_own_read on public.submissions
  for select to authenticated
  using (tenant_id in (select public.current_tenant_ids()));

create policy notifications_own_read on public.notifications
  for select to authenticated
  using (
    submission_id in (
      select id from public.submissions
      where tenant_id in (select public.current_tenant_ids())
    )
  );
