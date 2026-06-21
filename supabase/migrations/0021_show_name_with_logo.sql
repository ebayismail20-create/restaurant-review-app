-- Owner option: when a logo is uploaded, also show the venue name as text below
-- it. Default false → the logo (usually a wordmark) stands alone, which is the
-- current behaviour. An owner whose logo is an icon (no name in it) flips this
-- on so guests still see the venue name. Without a logo the name always shows
-- regardless, so this flag only changes anything when a logo is present.
alter table public.tenants
  add column if not exists show_name_with_logo boolean not null default false;

grant select (show_name_with_logo), update (show_name_with_logo)
  on public.tenants to authenticated;

-- get_venue (table-gated) returns the flag so the per-table QR route honours it.
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
  platforms                jsonb
)
language sql
security definer
set search_path = ''
as $$
  select
    t.name, t.tagline, t.location_name, t.logo_url, t.brand_color, tb.server_name,
    t.public_review_min_rating, t.show_name_with_logo,
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

-- get_home_venue ("/" route) does the same.
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
  platforms                jsonb
)
language sql
security definer
set search_path = ''
as $$
  select
    t.name, t.tagline, t.location_name, t.logo_url, t.brand_color,
    t.public_review_min_rating, t.show_name_with_logo,
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
