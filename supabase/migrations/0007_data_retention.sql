-- ============================================================
-- Data retention / minimization (GDPR — the demo venue is in the EU).
--
-- Guest feedback can contain free text + a hashed IP. We keep those
-- personal-data-bearing fields only as long as useful for follow-up, then
-- scrub them while retaining the anonymous rating/tags for trend analytics.
-- Whole rows are hard-deleted after a year.
--
-- Windows (adjust here, or `select cron.unschedule('purge-old-feedback')`
-- to disable):
--   90 days  → scrub `message` + `ip_hash`   (matches the in-app promise)
--   365 days → delete the row entirely
-- ============================================================

create extension if not exists pg_cron;

create or replace function public.purge_old_feedback()
returns void
language sql
security definer
set search_path = ''
as $$
  -- Data minimization: drop free text + IP hash after 90 days, keep the
  -- anonymous rating/tags/timestamp so the manager's trends stay intact.
  update public.submissions
     set message = '', ip_hash = null
   where created_at < now() - interval '90 days'
     and (message <> '' or ip_hash is not null);

  -- Full delete after a year.
  delete from public.submissions
   where created_at < now() - interval '365 days';
$$;
revoke all on function public.purge_old_feedback() from public;

-- Run daily at 03:17 UTC (quiet hours). cron.schedule upserts by name.
select cron.schedule('purge-old-feedback', '17 3 * * *', $$ select public.purge_old_feedback(); $$);
