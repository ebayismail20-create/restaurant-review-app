-- ============================================================
-- Realtime for the live dashboard. RLS still applies to postgres_changes, so
-- an owner only receives row changes they could SELECT (their own tenant's
-- feedback + notes).
--
-- REPLICA IDENTITY FULL is required: the realtime authorizer evaluates the
-- SELECT policy (tenant_id IN current_tenant_ids()) against the changed row in
-- the WAL, and needs tenant_id present. Without it, authorized subscribers
-- silently receive nothing. (Feedback volume per venue is low, so the extra
-- WAL is negligible.)
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'submissions'
  ) then
    alter publication supabase_realtime add table public.submissions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'submission_notes'
  ) then
    alter publication supabase_realtime add table public.submission_notes;
  end if;
end $$;

alter table public.submissions replica identity full;
alter table public.submission_notes replica identity full;
