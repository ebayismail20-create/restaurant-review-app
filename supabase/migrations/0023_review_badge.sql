-- ============================================================
-- Public review badge: aggregate rating data for the embeddable
-- website widget (/embed/[slug]). Token-free and anon-readable —
-- it returns only NON-sensitive aggregates (average, count, star
-- distribution) + public branding, never individual private
-- feedback text. RLS is deny-all on the base tables, so this
-- SECURITY DEFINER function is the only public surface.
-- ============================================================
create or replace function public.get_review_badge(p_slug text)
returns table (
  brand_name   text,
  brand_color  text,
  logo_url     text,
  avg_rating   numeric,
  rated_count  integer,
  dist         integer[]   -- per-star counts [1★ .. 5★]
)
language sql
security definer
set search_path = ''
as $$
  select
    t.name,
    t.brand_color,
    t.logo_url,
    coalesce(round(avg(s.rating)::numeric, 2), 0),
    coalesce(count(s.rating), 0)::integer,
    array[
      count(*) filter (where s.rating = 1),
      count(*) filter (where s.rating = 2),
      count(*) filter (where s.rating = 3),
      count(*) filter (where s.rating = 4),
      count(*) filter (where s.rating = 5)
    ]::integer[]
  from public.tenants t
  left join public.submissions s
    on s.tenant_id = t.id and s.rating is not null
  where t.slug = p_slug
  group by t.id, t.name, t.brand_color, t.logo_url;
$$;
revoke all on function public.get_review_badge(text) from public;
grant execute on function public.get_review_badge(text) to anon, authenticated;
