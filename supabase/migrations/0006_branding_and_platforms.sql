-- ============================================================
-- Owner-configurable branding + review platforms.
--
-- Branding (logo, brand color) and the set of review platforms (which ones,
-- in what order, with what links) are owner-managed in the dashboard and
-- read by the guest app via get_venue. The guest app hardcodes nothing.
-- ============================================================

alter table public.tenants
  add column if not exists logo_url    text,
  add column if not exists brand_color text;

create table public.tenant_platforms (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  kind       text not null check (kind in (
               'google','tripadvisor','yelp','facebook','opentable','instagram','website','other')),
  label      text not null,
  url        text not null,
  sort_order int  not null default 0,
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);
create index tenant_platforms_tenant_idx on public.tenant_platforms (tenant_id, sort_order);
alter table public.tenant_platforms enable row level security;

-- Managers manage their own venue's platforms from the dashboard (tenant-
-- scoped CRUD). The guest path reads them via get_venue (SECURITY DEFINER),
-- which bypasses RLS.
create policy platforms_select on public.tenant_platforms
  for select to authenticated using (tenant_id in (select public.current_tenant_ids()));
create policy platforms_insert on public.tenant_platforms
  for insert to authenticated with check (tenant_id in (select public.current_tenant_ids()));
create policy platforms_update on public.tenant_platforms
  for update to authenticated using (tenant_id in (select public.current_tenant_ids()))
  with check (tenant_id in (select public.current_tenant_ids()));
create policy platforms_delete on public.tenant_platforms
  for delete to authenticated using (tenant_id in (select public.current_tenant_ids()));

-- Seed the demo venue's platforms + a brand color (burgundy monogram).
insert into public.tenant_platforms (tenant_id, kind, label, url, sort_order)
select t.id, 'google', 'Google', t.google_review_url, 1
from public.tenants t where t.slug = 'bistro-nordic' and t.google_review_url is not null;
insert into public.tenant_platforms (tenant_id, kind, label, url, sort_order)
select t.id, 'tripadvisor', 'Tripadvisor', t.tripadvisor_review_url, 2
from public.tenants t where t.slug = 'bistro-nordic' and t.tripadvisor_review_url is not null;
update public.tenants set brand_color = '#6B1F2A' where slug = 'bistro-nordic';

-- get_venue now returns branding + the enabled platforms (as JSON), replacing
-- the old fixed google/tripadvisor return columns. Still token-gated.
drop function if exists public.get_venue(text, text, text);
create function public.get_venue(
  p_slug        text,
  p_table_label text,
  p_token       text
)
returns table (
  brand_name    text,
  tagline       text,
  location_name text,
  logo_url      text,
  brand_color   text,
  server_name   text,
  platforms     jsonb
)
language sql
security definer
set search_path = ''
as $$
  select
    t.name, t.tagline, t.location_name, t.logo_url, t.brand_color, tb.server_name,
    coalesce(
      (select jsonb_agg(
                jsonb_build_object('kind', p.kind, 'label', p.label, 'url', p.url)
                order by p.sort_order, p.created_at)
       from public.tenant_platforms p
       where p.tenant_id = t.id and p.enabled),
      '[]'::jsonb
    ) as platforms
  from public.tables tb
  join public.tenants t on t.id = tb.tenant_id
  where t.slug = p_slug
    and tb.label = p_table_label
    and tb.token = p_token
    and tb.active = true;
$$;
revoke all on function public.get_venue(text, text, text) from public;
grant execute on function public.get_venue(text, text, text) to anon, authenticated;
