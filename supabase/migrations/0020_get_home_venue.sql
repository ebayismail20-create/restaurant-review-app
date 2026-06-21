-- Branding for the bare "/" home/showcase route. Unlike get_venue (0019), this
-- takes NO table token: "/" is a single-venue showcase, not a table-gated guest
-- context, so there's no physical-presence proof to require. It returns only
-- public-safe branding (name, tagline, logo, color, routing threshold) plus the
-- enabled, linked platforms for the default (first-created) tenant — never a
-- table token. Submissions from "/" still ride the existing demo table token
-- (NEXT_PUBLIC_DEMO_TABLE_TOKEN), exactly as before; only the branding goes live.
create or replace function public.get_home_venue()
returns table (
  brand_name               text,
  tagline                  text,
  location_name            text,
  logo_url                 text,
  brand_color              text,
  public_review_min_rating smallint,
  platforms                jsonb
)
language sql
security definer
set search_path = ''
as $$
  select
    t.name, t.tagline, t.location_name, t.logo_url, t.brand_color,
    t.public_review_min_rating,
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
