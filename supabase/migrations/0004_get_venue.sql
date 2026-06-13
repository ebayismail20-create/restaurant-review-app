-- ============================================================
-- Multi-tenant venue resolution.
--
-- Adds a per-tenant tagline and a token-gated get_venue() read used by the
-- /r/[slug]/[table] route to resolve a physical table's display context.
-- Returns rows ONLY when the table token matches (the guest holds it via the
-- QR URL), so a guessed/shared URL with a wrong token resolves to nothing
-- and the route 404s. RLS stays deny-all; this is the only read path.
-- ============================================================

alter table public.tenants add column if not exists tagline text;
update public.tenants set tagline = 'Fine dining · Helsinki' where slug = 'bistro-nordic';

create or replace function public.get_venue(
  p_slug        text,
  p_table_label text,
  p_token       text
)
returns table (
  brand_name             text,
  tagline                text,
  location_name          text,
  google_review_url      text,
  tripadvisor_review_url text,
  server_name            text
)
language sql
security definer
set search_path = ''
as $$
  select t.name, t.tagline, t.location_name,
         t.google_review_url, t.tripadvisor_review_url, tb.server_name
  from public.tables tb
  join public.tenants t on t.id = tb.tenant_id
  where t.slug = p_slug
    and tb.label = p_table_label
    and tb.token = p_token
    and tb.active = true;
$$;

revoke all on function public.get_venue(text, text, text) from public;
grant execute on function public.get_venue(text, text, text) to anon, authenticated;
