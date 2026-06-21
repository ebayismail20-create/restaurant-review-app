-- Only surface platforms that actually have a link. A freshly-added platform
-- (or one whose URL was cleared) must not show a dead button to guests on the
-- 5-star screen. Owners configure these in the dashboard; this is the guard.
-- (Refines get_venue from 0006_branding_and_platforms — adds the URL filter.)
create or replace function public.get_venue(
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
       where p.tenant_id = t.id and p.enabled and coalesce(btrim(p.url), '') <> ''),
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
