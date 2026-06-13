-- ============================================================
-- Loop guest-review schema
--
-- Trust model: the Next.js /api/submissions route is the ONLY writer.
-- It calls submit_review() (see 0002) using the anon key. RLS is enabled on
-- every table with NO anon/authenticated policies, so the public key can
-- read and write NOTHING directly — deny-by-default, the strongest posture.
-- ============================================================

create extension if not exists pgcrypto;

-- --- tenants: one row per restaurant -------------------------------------
create table public.tenants (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique,
  name                   text not null,
  location_name          text not null,
  google_review_url      text,
  tripadvisor_review_url text,
  created_at             timestamptz not null default now()
);
comment on table public.tenants is 'Restaurants using the review app. slug is the URL segment in /r/[slug]/[table].';

-- --- tables: physical tables within a tenant -----------------------------
-- Each table carries an unguessable token embedded in its printed QR URL.
-- A submission must present the matching token, which is how we stop anyone
-- who isn't physically at a table from spamming the manager.
create table public.tables (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  label       text not null,
  server_name text,
  token       text not null default encode(gen_random_bytes(24), 'hex'),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, label)
);
comment on column public.tables.token is 'Unguessable secret printed into the table QR URL; verified server-side on every submission. Revoke by setting active=false or rotating.';

-- --- submissions: the guest feedback itself ------------------------------
create table public.submissions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  table_id   uuid references public.tables (id) on delete set null,
  kind       text not null check (kind in ('posted','private','alerted','rated','anon-message')),
  rating     smallint check (rating between 1 and 5),
  tag_keys   text[] not null default '{}',
  message    text not null default '',
  language   text not null check (language in ('en','fi','sv')),
  session_id uuid not null,
  priority   text not null check (priority in ('urgent','normal','info')),
  ip_hash    text,
  created_at timestamptz not null default now()
);
create index submissions_tenant_created_idx on public.submissions (tenant_id, created_at desc);
create index submissions_tenant_priority_idx on public.submissions (tenant_id, priority, created_at desc);
create index submissions_ip_recent_idx on public.submissions (ip_hash, created_at desc);
comment on column public.submissions.priority is 'Derived server-side from kind/rating — never trusted from the client.';
comment on column public.submissions.ip_hash is 'HMAC of the client IP (salted, server-side). Never the raw IP. Used only for abuse rate-limiting.';

-- --- notifications: delivery log for manager alerts ----------------------
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  channel       text not null check (channel in ('email','push','sms','webhook')),
  status        text not null default 'pending' check (status in ('pending','sent','failed')),
  error         text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);
create index notifications_submission_idx on public.notifications (submission_id);

-- --- Lock everything down. Service role bypasses RLS; nobody else writes/reads.
alter table public.tenants       enable row level security;
alter table public.tables        enable row level security;
alter table public.submissions   enable row level security;
alter table public.notifications enable row level security;
-- (No policies created on purpose: default-deny for anon + authenticated.)
