-- ============================================================
-- AI Insights cache. The generate-insights Edge Function (service role) calls
-- Claude and writes a row here; the dashboard reads the latest, RLS-scoped.
-- Owners can read their tenant's insights but never write directly.
-- ============================================================
create table if not exists public.ai_insights (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  generated_at timestamptz not null default now(),
  window_days  int not null default 90,
  model        text,
  data         jsonb not null,
  created_by   uuid
);
create index if not exists ai_insights_tenant_idx
  on public.ai_insights (tenant_id, generated_at desc);

alter table public.ai_insights enable row level security;

-- Read-only for owners (their tenant). Writes happen only via the Edge
-- Function using the service-role key, which bypasses RLS — so there is
-- deliberately no INSERT/UPDATE policy for authenticated users.
create policy ai_insights_select on public.ai_insights
  for select to authenticated
  using (tenant_id in (select public.current_tenant_ids()));
