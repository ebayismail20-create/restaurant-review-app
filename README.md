# Loop — guest review app (Bistro Nordic demo)

On-table QR feedback flow for restaurants. A guest scans the code at their
table, rates the visit (1–5 stars), and is routed by outcome:

- **5★** → public review prompts (Google / Tripadvisor / Facebook)
- **3–4★** → private "what could we improve" feedback to the manager
- **1–2★** → urgent "what went wrong" flow, plus an anonymous
  contact-the-manager escape hatch

Single-venue demo (Bistro Nordic · Helsinki) in EN / FI / SV. Multi-tenant
routing (`/r/[slug]/[table]`) is planned — see `PHASE-2:` markers in the code.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript strict**
- Tailwind directives + a hand-written design system in `app/globals.css`
- PWA: typed manifest (`app/manifest.ts`), service worker (`public/sw.js`,
  registered in production only), offline fallback
- Security: nonce-based CSP via `proxy.ts`, full static header suite in
  `next.config.ts`

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

- `notifyManager` is a mock — submissions are not persisted until the
  Phase 2 backend (`/api/submissions` + Supabase) lands. Success copy is
  worded to avoid promising delivery SLAs until then.
- `DEMO_VENUE.platformUrls` are placeholders; clicks fall back to platform
  home pages and log a config error. Set real per-venue URLs before launch.
- No production telemetry yet (Sentry planned alongside the backend).
