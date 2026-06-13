# Loop — guest review app (Bistro Nordic demo)

On-table QR feedback flow for restaurants. A guest scans the code at their
table, rates the visit (1–5 stars), and is routed by outcome:

- **5★** → public review prompts (Google / Tripadvisor)
- **3–4★** → private "what could we improve" feedback to the manager
- **1–2★** → urgent "what went wrong" flow, plus an anonymous
  contact-the-manager escape hatch

EN / FI / SV. Guest entry points:

- `/` — the single-venue demo (Bistro Nordic · Helsinki, via `DEMO_VENUE`).
- `/r/[slug]/[table]?t=<token>` — **multi-tenant**. The QR printed for each
  physical table encodes this URL with the table's unguessable token. The
  venue (brand, tagline, platform URLs, server) is resolved server-side via
  the token-gated `get_venue` function; a wrong/guessed URL 404s. One
  deployment serves every tenant.

Manager side:

- `/login` + `/dashboard` — Supabase Auth (email/password). A manager sees
  only their own tenant's feedback, enforced by Postgres RLS (the dashboard
  code contains no tenant id — the database decides). Urgent items sort to
  the top. Demo login: `manager@bistronordic.test` / `LoopDemo1234`.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript strict**
- Tailwind directives + a hand-written design system in `app/globals.css`
- **Supabase** (Postgres) backend — submissions persist via a single
  `/api/submissions` route → `submit_review` SECURITY DEFINER function
- PWA: typed manifest (`app/manifest.ts`), service worker (`public/sw.js`,
  registered in production only), offline fallback
- Security: nonce-based CSP via `proxy.ts`, full static header suite in
  `next.config.ts`

## Backend

Guest feedback is written through one path, designed so a leaked public key
buys an attacker nothing:

```
client  ──POST /api/submissions──▶  route.ts  ──rpc submit_review()──▶  Postgres
        (ReviewRequest: token,        (zod validate,                   (SECURITY DEFINER:
         slug, kind, rating, …)        hash IP, call RPC)               verify token, derive
                                                                        priority, insert)
```

- **RLS is deny-all** on every table. The anon/publishable key can only
  `EXECUTE submit_review` — it can read or write no table directly.
- The DB function is the sole writer: it verifies the per-table token,
  resolves tenant/table, derives `priority` and `created_at`, and rate-limits
  by hashed IP. Client-supplied priority/tenant are impossible to forge
  because they aren't part of the request.
- The service-role key is intentionally **not** used anywhere.

Schema lives in the Supabase project (`tenants`, `tables`, `submissions`,
`notifications`) and is version-controlled in `supabase/migrations/`.
Regenerate `app/lib/database.types.ts` after schema changes.

### Manager alerts

Manager-facing submissions (1–2★ urgent, 3–4★ private, anonymous messages)
enqueue a `notifications` row **inside the same transaction** as the
submission — if feedback saves, the alert is guaranteed queued. The
`notify-manager` Edge Function (`supabase/functions/notify-manager`) does the
send: it runs with the service-role key Supabase injects, so that privilege
never enters the Next app. The API route invokes it server-side after a
manager-facing submission; failures leave the row `pending`/`failed` and
never affect the guest's confirmation.

To turn on real email delivery, set two secrets on the Edge Function (no app
redeploy needed):

```bash
supabase secrets set RESEND_API_KEY=re_xxx        # required
supabase secrets set NOTIFY_FROM="Loop <reviews@yourdomain>"  # optional; defaults to Resend onboarding
```

and set each tenant's `manager_email`. Until then the pipeline runs and
records `failed: no_email_provider_configured` so it stays observable.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest (unit + flow integration tests in tests/)
npm run lint
npm run build      # production build (dynamic rendering — per-request CSP nonce)
```

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SITE_URL` for
deployed environments.

## Layout

```
app/page.tsx            the entire guest flow (single client component)
app/lib/types.ts        shared contracts incl. SubmissionPayload (the API contract)
app/lib/dictionaries.ts typed EN/FI/SV copy — every key required in every language
app/lib/venue.ts        venue context; DEMO_VENUE until multi-tenant routing lands
app/components/         presentational pieces (tag icons)
proxy.ts                per-request CSP nonce + security headers
tests/                  vitest suites (lib units + review-flow integration)
```

## Known gaps (deliberate, tracked)

- **Manager notification delivery** isn't built yet — submissions persist to
  the DB, but no email/push goes out (the `notifications` table is ready for
  it). Until that lands, success copy avoids promising a response SLA.
- `DEMO_VENUE.platformUrls` / the seeded tenant rows are placeholders; clicks
  fall back to platform home pages and log a config error. Set real per-venue
  URLs before launch.
- No production telemetry yet (Sentry planned).
- Dashboard is read-only triage (v1) — no reply/resolve actions yet.
- Demo manager account is seeded directly in the DB; production onboarding
  (invite flow, leaked-password protection) is not built.
