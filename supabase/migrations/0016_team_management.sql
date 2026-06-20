-- ============================================================
-- Owner-managed team. Owners add members by email, change roles, and remove
-- members from the dashboard. If the email already has an account they're
-- added immediately; otherwise a pending invite is stored and auto-claimed
-- when they sign up. All mutations are owner-only and tenant-scoped, enforced
-- in SECURITY DEFINER functions (they read auth.users, which the client can't).
-- Builds on the owner/manager/staff roles from 0015_team_roles.
-- ============================================================

create table if not exists public.tenant_invites (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  email      text not null,
  role       text not null check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);
create index if not exists tenant_invites_tenant_idx on public.tenant_invites (tenant_id);
alter table public.tenant_invites enable row level security;

-- Owners see + cancel their tenant's pending invites. Inserts happen via the
-- add_team_member function (definer), so there is no INSERT policy.
create policy invites_select on public.tenant_invites for select to authenticated
  using (tenant_id in (select public.current_owner_tenant_ids()));
create policy invites_delete on public.tenant_invites for delete to authenticated
  using (tenant_id in (select public.current_owner_tenant_ids()));

-- List members with their email (any member of the tenant may view the team).
-- SECURITY DEFINER because authenticated clients cannot read auth.users.
create or replace function public.list_team_members(p_tenant_id uuid)
returns table (user_id uuid, email text, role text)
language sql security definer set search_path = '' stable as $$
  select m.user_id, u.email::text, m.role
  from public.tenant_members m
  join auth.users u on u.id = m.user_id
  where m.tenant_id = p_tenant_id
    and p_tenant_id in (select public.current_tenant_ids())
  order by case m.role when 'owner' then 0 when 'manager' then 1 else 2 end, u.email;
$$;

-- Add by email: existing account → member now; otherwise a pending invite.
create or replace function public.add_team_member(p_tenant_id uuid, p_email text, p_role text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_email text := lower(btrim(p_email));
begin
  if p_tenant_id not in (select public.current_owner_tenant_ids()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_role not in ('owner', 'manager', 'staff') then
    raise exception 'invalid_role' using errcode = 'P0001';
  end if;
  select id into v_uid from auth.users where lower(email) = v_email;
  if v_uid is not null then
    insert into public.tenant_members (user_id, tenant_id, role)
    values (v_uid, p_tenant_id, p_role)
    on conflict (user_id, tenant_id) do update set role = excluded.role;
    return 'added';
  else
    insert into public.tenant_invites (tenant_id, email, role)
    values (p_tenant_id, v_email, p_role)
    on conflict (tenant_id, email) do update set role = excluded.role;
    return 'invited';
  end if;
end; $$;

create or replace function public.set_team_role(p_tenant_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_tenant_id not in (select public.current_owner_tenant_ids()) then raise exception 'not_authorized' using errcode = 'P0001'; end if;
  if p_user_id = (select auth.uid()) then raise exception 'cannot_change_self' using errcode = 'P0001'; end if;
  if p_role not in ('owner', 'manager', 'staff') then raise exception 'invalid_role' using errcode = 'P0001'; end if;
  update public.tenant_members set role = p_role where tenant_id = p_tenant_id and user_id = p_user_id;
end; $$;

create or replace function public.remove_team_member(p_tenant_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_tenant_id not in (select public.current_owner_tenant_ids()) then raise exception 'not_authorized' using errcode = 'P0001'; end if;
  if p_user_id = (select auth.uid()) then raise exception 'cannot_remove_self' using errcode = 'P0001'; end if;
  delete from public.tenant_members where tenant_id = p_tenant_id and user_id = p_user_id;
end; $$;

-- Claim pending invites when a matching email signs up.
create or replace function public.claim_team_invites()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tenant_members (user_id, tenant_id, role)
  select new.id, i.tenant_id, i.role from public.tenant_invites i where lower(i.email) = lower(new.email)
  on conflict (user_id, tenant_id) do update set role = excluded.role;
  delete from public.tenant_invites where lower(email) = lower(new.email);
  return new;
end; $$;
drop trigger if exists on_auth_user_created_claim_invites on auth.users;
create trigger on_auth_user_created_claim_invites
  after insert on auth.users for each row execute function public.claim_team_invites();

-- Trigger-only: never callable via the REST API (the trigger still fires
-- regardless of the EXECUTE grant).
revoke all on function public.claim_team_invites() from public, anon, authenticated;

revoke all on function public.list_team_members(uuid) from public, anon;
revoke all on function public.add_team_member(uuid, text, text) from public, anon;
revoke all on function public.set_team_role(uuid, uuid, text) from public, anon;
revoke all on function public.remove_team_member(uuid, uuid) from public, anon;
grant execute on function public.list_team_members(uuid) to authenticated;
grant execute on function public.add_team_member(uuid, text, text) to authenticated;
grant execute on function public.set_team_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;
