-- ============================================================
-- Manager workflow: resolution state + internal notes.
--
-- Backward-compatible — the guest write path (submit_review, SECURITY DEFINER)
-- is untouched; these are owner-only, authenticated, tenant-scoped surfaces
-- consumed by the separate dashboard app.
-- ============================================================

-- Resolution flags on submissions.
alter table public.submissions
  add column if not exists resolved boolean not null default false,
  add column if not exists resolved_at timestamptz;

create index if not exists submissions_resolved_idx
  on public.submissions (tenant_id, resolved);

-- Owners may update ONLY the resolution columns (column-level grant), and only
-- on their own tenant's rows (RLS). Revoke any broad UPDATE first to be sure
-- a leaked authenticated token can't rewrite ratings/messages.
revoke update on public.submissions from authenticated;
grant update (resolved, resolved_at) on public.submissions to authenticated;

drop policy if exists submissions_own_update on public.submissions;
create policy submissions_own_update on public.submissions
  for update to authenticated
  using (tenant_id in (select public.current_tenant_ids()))
  with check (tenant_id in (select public.current_tenant_ids()));

-- Internal notes (manager-only; guests never have any read path to these).
create table if not exists public.submission_notes (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  author_id     uuid not null default auth.uid() references auth.users (id),
  body          text not null check (length(btrim(body)) > 0 and length(body) <= 2000),
  created_at    timestamptz not null default now()
);
create index if not exists submission_notes_submission_idx
  on public.submission_notes (submission_id, created_at);

alter table public.submission_notes enable row level security;

create policy notes_select on public.submission_notes
  for select to authenticated
  using (tenant_id in (select public.current_tenant_ids()));
create policy notes_insert on public.submission_notes
  for insert to authenticated
  with check (
    tenant_id in (select public.current_tenant_ids())
    and author_id = (select auth.uid())
  );
create policy notes_delete on public.submission_notes
  for delete to authenticated
  using (
    tenant_id in (select public.current_tenant_ids())
    and author_id = (select auth.uid())
  );
