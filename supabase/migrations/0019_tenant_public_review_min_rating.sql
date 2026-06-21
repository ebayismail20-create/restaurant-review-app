-- Owner-controlled routing threshold: which ratings are invited to leave a
-- PUBLIC review (Google/Tripadvisor/etc). Default 5 = the original behaviour
-- (only 5★ → public; 3-4★ → private feedback). An owner can set it to 4 from
-- the dashboard to also send satisfied 4★ guests to the public review screen.
-- Constrained to 4 or 5; 1-3★ always keep the private path either way, so the
-- public option is never gated away from unhappy guests.
alter table public.tenants
  add column if not exists public_review_min_rating smallint not null default 5;
alter table public.tenants drop constraint if exists tenants_public_review_min_rating_check;
alter table public.tenants
  add constraint tenants_public_review_min_rating_check check (public_review_min_rating in (4, 5));

-- Owners read + write the setting from the dashboard (RLS still scopes to their
-- own tenant; this just adds the column to the column-level grant set).
grant select (public_review_min_rating), update (public_review_min_rating)
  on public.tenants to authenticated;

-- get_venue now returns the threshold so the guest app can route by it.
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
  platforms                jsonb
)
language sql
security definer
set search_path = ''
as $$
  select
    t.name, t.tagline, t.location_name, t.logo_url, t.brand_color, tb.server_name,
    t.public_review_min_rating,
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
