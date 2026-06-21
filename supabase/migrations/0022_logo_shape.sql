-- Owner option: the logo frame shape. 'plate' (default) keeps the current soft
-- rounded card with a gold hairline; 'round' renders a circular badge. Lets an
-- owner pick what suits their mark — a circular emblem vs a wide wordmark.
alter table public.tenants
  add column if not exists logo_shape text not null default 'plate';
alter table public.tenants drop constraint if exists tenants_logo_shape_check;
alter table public.tenants
  add constraint tenants_logo_shape_check check (logo_shape in ('plate', 'round'));

grant select (logo_shape), update (logo_shape) on public.tenants to authenticated;

-- get_venue + get_home_venue surface the shape so the guest app can render it.
drop function if exists public.get_venue(text, text, text);
create function public.get_venue(
  p_slug        text,
  p_table_label text,
  p_token       text
)
returns table (
  brand_name               text,
  tagline                  text,
  location_name            text,
  logo_url                 text,
  brand_color              text,
  server_name              text,
  public_review_min_rating smallint,
  show_name_with_logo      boolean,
  logo_shape               text,
  platforms                jsonb
)
language sql
security definer
set search_path = ''
as $$
  select
    t.name, t.tagline, t.location_name, t.logo_url, t.brand_color, tb.server_name,
    t.public_review_min_rating, t.show_name_with_logo, t.logo_shape,
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

drop function if exists public.get_home_venue();
create function public.get_home_venue()
returns table (
  brand_name               text,
  tagline                  text,
  location_name            text,
  logo_url                 text,
  brand_color              text,
  public_review_min_rating smallint,
  show_name_with_logo      boolean,
  logo_shape               text,
  platforms                jsonb
)
language sql
security definer
set search_path = ''
as $$
  select
    t.name, t.tagline, t.location_name, t.logo_url, t.brand_color,
    t.public_review_min_rating, t.show_name_with_logo, t.logo_shape,
    coalesce(
      (select jsonb_agg(
                jsonb_build_object('kind', p.kind, 'label', p.label, 'url', p.url)
                order by p.sort_order, p.created_at)
       from public.tenant_platforms p
       where p.tenant_id = t.id and p.enabled and coalesce(btrim(p.url), '') <> ''),
      '[]'::jsonb
    ) as platforms
  from public.tenants t
  order by t.created_at
  limit 1;
$$;
revoke all on function public.get_home_venue() from public;
grant execute on function public.get_home_venue() to anon, authenticated;
