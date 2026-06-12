# Loop — guest-review SaaS · session log

Bistro Nordic / Helsinki demo. Single-page Next.js 16 app at `/`, on-table QR target. Multi-tenant routing (`/r/[slug]/[table]`) is queued but the v1 demo is single-venue.

---

## ⚠ Outstanding — fix before next session

**`app/page.tsx` is currently broken.** File grew to 1364 lines through unattributed edits; JSX tags don't balance. `tsc` fails:

```
app/page.tsx(691,6): error TS17008: JSX element 'div' has no corresponding closing tag.
app/page.tsx(1341,8): error TS17008: JSX element 'div' has no corresponding closing tag.
app/page.tsx(1360,10): error TS17008: JSX element 'div' has no corresponding closing tag.
app/page.tsx(1365,5): error TS1005: '/' expected.
```

The error appears after edits made between the "lift step-label out of rating-content" change and the latest spacing pass. Diagnose:

```bash
git diff HEAD app/page.tsx | head -200      # see what changed
git log --oneline app/page.tsx | head -10   # find a known-good commit
```

The CSS spacing changes from this session (in `app/globals.css`) are sound and don't depend on the page.tsx breakage — they'll work as soon as the JSX is fixed.

---

## What shipped this session

### Phase 1.2 — Welcome→Rating collapse *(completed earlier, refined this session)*

Welcome screen merged into the rating screen. Venue brand mark + table chip live inline. One fewer route.

### Phase 1.3 — Accessibility pass (WCAG 2.1 AA)

- **Contrast:** `--text-soft` raised 0.65 → 0.72 alpha across all four themes (theme-bad, theme-meh were sitting at ~4.0:1, now clear 4.5:1). Step-label moved from `--accent` (gold, fails AA on theme-meh) to `--text-soft`.
- **Stars:** roving tabindex + arrow-key navigation per WAI-ARIA APG radiogroup pattern. Tab lands on the currently-rated star, arrows cycle and update both focus and selection.
- **Inert offscreen:** `inert` attribute on inactive screens (modern equivalent of removing the subtree from the a11y tree). Same applies during success overlay so it focus-traps without manual key handling.
- **Success overlay:** focus moves to title on open, Tab trap re-focuses Done, Escape soft-dismisses. Round-trips focus back to rating heading on dismiss.
- **Tag groups:** `role="group"` with translated names (`positiveTagsGroupLabel` / `negativeTagsGroupLabel`).
- **Live regions:** SR-only `aria-live="polite"` for tag count changes.
- **Disabled Continue:** `aria-label` swaps to `continueDisabledLabel` so SR users hear the affordance instead of just "dimmed".
- **Touch targets:** `lang-btn` bumped from 32 → 44px on coarse pointers.
- **Sorry-screen comment originally always-visible** to avoid keyboard/SR phantom-error trap (later reverted to progressive disclosure with proper validation — see UX iterations below).

### Phase 1.4 — PWA polish

- **Icons** generated reproducibly via `scripts/generate-icons.py` (Bistro Nordic burgundy field, gold serif "B", hairline cream ring): `icon-192.png`, `icon-512.png` (purpose any), `icon-maskable-512.png` (62% safe area for circular Android masks), `apple-icon.png` (180×180 full-bleed for iOS), `app/favicon.ico` (multi-res 16/32/48). Gold-on-burgundy verified at 5.04:1 AA contrast.
- **Manifest** moved from `public/manifest.json` → `app/manifest.ts` (typed). Added `id`, `scope`, `lang`, `dir`, `categories`, `display_override` ladder, separate maskable icon entry.
- **Service worker** (`public/sw.js`): bumped `CACHE_VERSION` to v3, precaches `/offline.html`, `/manifest.webmanifest`, all four icons. Network-first for navigations (per-table URLs must never be cross-served between guests), cache-first for static assets.
- **Install prompt** (`app/components/InstallPrompt.tsx`): captures `beforeinstallprompt` for Android Chromium, falls back to iOS Safari hint copy. Sits inside success overlay so it doesn't interrupt review flow. Self-hides when standalone or dismissed.
- **Standalone display mode** drops the fake phone frame.

### Phase 1.5 — Mobile UX + CSS cleanup

- **Dead tokens removed:** `--brand-primary`, `-secondary`, `-accent`, `-ink`, `-muted`, `--radius-lg`, `-md`, `-sm`. Last consumer (`--brand-muted` on `.platform-arrow`) swapped to `--text-soft`.
- **New tokens that earned their place:** `--touch: 44px`, `--radius-pill: 50px`, `--ease-out`, `--ease-back`. Replace previous magic numbers / inline cubic-beziers throughout.
- **Dead CSS removed:** `body.kbd-open .device-frame` (no JS toggled it). Replaced via `interactiveWidget: 'resizes-content'` on the Next 16 viewport export.
- **Mobile UX hardening:** `touch-action: manipulation` + `user-select: none` on every interactive control. `overscroll-behavior: none` on body (kills pull-to-refresh). `overscroll-behavior: contain` on `.screen`. Six `:hover` rules wrapped in `@media (hover: hover)` (fixes iOS Safari sticky-hover bug).
- **Merged duplicate media queries** (display-mode standalone vs max-width 768).

#### Phase 1.5 follow-up — fold tightening

iPhone-14 contact-sheet test showed sorry-screen Send button below iPhone SE fold. Tightened:
- Sorry heart 64×64 → 48×48
- Comment textarea min-height 200 → 140
- `.reasons-header` margin-bottom 24 → 16
- Rating-screen rhythm: venue-header 22 → 16, rating-title 32 → 22, rating-word 24 → 18, stars 36 → 24, rating-actions margin-top 28 → 20

Now every primary CTA above iPhone SE fold (375×667) without scrolling.

### Phase 1.6 — Security headers (production-grade)

- **Nonce-based CSP via `proxy.ts`** (Next 16 renamed `middleware.ts` → `proxy.ts`): per-request UUID nonce, `script-src 'self' 'nonce-…' 'strict-dynamic'`. No `'unsafe-inline'` for scripts. Trade-off: forces dynamic rendering but the page is largely static post-hydration anyway.
- **Static headers in `next.config.ts`** (don't depend on per-request values): HSTS (2yr preload), X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy (deny every powerful feature), COOP same-origin, CORP same-origin, X-Permitted-Cross-Domain-Policies none.
- **`app/layout.tsx`**: async, reads nonce from `headers()` and passes to the SW-registration `<Script>`. Next attaches the same nonce to its own framework / hydration scripts automatically.

### Phase 1.7 — Error boundaries

- **`app/error.tsx`** — segment error boundary. Uses brand classes (`.btn-primary` etc.) since root layout still renders. Self-contained mini-dict in EN / FI / SV (deliberately doesn't import `app/lib/dictionaries.ts` because that's a plausible source of the very error). Surfaces `error.digest` in monospace footer for diagnostics.
- **`app/not-found.tsx`** — branded 404 with back-to-start link.
- **`app/global-error.tsx`** *(new)* — catastrophic fallback when error escapes the root layout. Renders own `<html>`/`<body>`, no imports from `app/lib/*`, all styling inline, English only — built to work even if everything else is rubble.
- **`app/globals.css`** — small `.error-shell` block for the segment-level pages.

---

## Bug fixes

### "Maybe next time" claimed "Review posted!"

5★ → tap **Continue** → tap **Maybe next time** showed the success overlay claiming `Review posted!` / `Thanks for sharing publicly`. Two real bugs:
- **Honesty:** the guest explicitly opted out and didn't share anywhere.
- **Data loss:** the sorry path didn't even send the rating to the manager.

Fixed by adding a fourth `SuccessKind: 'rated'` in `app/lib/types.ts` with honest copy ("Thank you for the rating" / "5-star rating saved"), and making `finishFromPlatforms` actually call `notifyManager(buildPayload('rated'))` so the manager sees the 5★ rating even without a public review. Translated EN / FI / SV.

### Language switch didn't refresh success overlay (artifact preview only)

The vanilla-JS preview set `textContent` once at show-time and never re-read on language change. Added `refreshSuccess()` helper called from `applyDict()`. The actual React app handled this correctly via `successCopy` reading reactively from `dict`.

### "Anonymous" + "respond personally" contradiction *(open question)*

Sorry-screen sub said *"the manager will respond personally"* but the contact-anonymous path explicitly has no name/email. Discussed two paths forward (neutral copy vs. table-conditional). User hadn't picked one before the session moved on. Recommend **Option A** (neutral, works in every case): change sub to *"Tell us what happened. The manager sees this right away."* and `successMsgAlerted` to *"Your message is on the manager's phone now. They'll act on it right away."* — promise is action, not reply, true whether the guest is still at the table or already at the door.

---

## Copy / UX iterations

- **Time-neutral headline.** `"How was your visit tonight?"` → `"How was your visit?"`. The "tonight" failed at lunch service. EN / FI / SV all dropped.
- **Rating ladder rewritten** for fine-dining brand voice: Disappointing / Underwhelming / Pretty good / Wonderful / Exceptional (was Disappointing / Below average / Okay / Great / Excellent).
- **Sorry sub trimmed** from 109 → 60 chars: *"Tell us what happened. The manager will respond personally."* Drops the redundant "Your experience matters" reassurance (title already does it) and the implicit "reads every word" detail.
- **Platform CTA reframed** from transactional ("make our day") to community ("Help future guests find us.").
- **Success copy honest about what actually happened.** "Review posted!" → "Thank you for sharing" (we can't verify the post, only the gesture). "Manager has been alerted" → "The manager is on it" (less corporate).

### Three-zone rating-screen layout

The rating screen evolved over several iterations:

1. **Phase 1.4 baseline:** everything centred as one cluster (venue + step + title + face + word + stars + Continue). Title and venue felt grouped.
2. **Lift `.venue-header` out of `.rating-content`** so it anchors at the top of `.screen`. Used `:has(.rating-content.rated)` selector to keep the collapse-on-rated animation working.
3. **Collapse hidden cluster items to zero height** instead of just opacity: 0. Stars no longer sit beneath ~170px of reserved-but-invisible layout. Tap a star and face / word / Continue animate in with their natural heights via `max-height` + `margin` transitions.
4. **Lift `.step-label` out** alongside `.venue-header`. Step indicator joins the top context cluster — same role as the table chip ("you're at table 12, step 1 of 2"). Headline becomes the sole focal point of `.rating-content`.
5. **Single layout mode** for both rated/unrated states (was mode-switching from `flex-start + 18% padding` to `center + 8px`, causing layout shift on tap). `justify-content: center` always; collapsed items contribute zero height so the visible group naturally centres in both states.
6. **`gap: 8` removed** from `.rating-content` — was leaking ~24px phantom spacing between the visible title and stars while three collapsed items sat between them at zero height.
7. **`.step-label` collapses on `.rated`** alongside venue-header so the rating cluster gets full breathing room when expanded.

### Sorry-screen progressive disclosure

Comment textarea hidden until a tag is picked (matches improve-screen pattern). Phantom-error trap avoided via tag-required validation: tap Send with zero tags → inline `role="alert"` error pointing to the tag group, focus moves to first tag. The contact-inline button below the divider is the always-visible escape hatch for guests whose complaint doesn't fit any tag.

---

## Files touched this session

- `app/page.tsx` — **currently broken**, see top of this doc.
- `app/layout.tsx` — async, nonce wiring for `<Script>`, `interactiveWidget: 'resizes-content'`, removed redundant `metadata.icons.icon` and `metadata.manifest`.
- `app/globals.css` — most of the spacing / token / interaction work lives here.
- `app/lib/types.ts` — added `'rated'` to `SuccessKind`.
- `app/lib/dictionaries.ts` — copy rewrites EN / FI / SV, new keys (`continueDisabledLabel`, `ratingGroupLabel`, `positiveTagsGroupLabel`, `negativeTagsGroupLabel`, `tagsSelectedAnnouncement`, `tagsRequired`, `installCta`, `installIosHint`, `installDismiss`, `installAriaLabel`, success* / alertChip* for `rated`).
- `app/components/InstallPrompt.tsx` *(new)*.
- `app/error.tsx`, `app/not-found.tsx`, `app/global-error.tsx` *(new)*.
- `app/manifest.ts` *(new)*.
- `proxy.ts` *(new — at project root)*.
- `next.config.ts` — security headers, `/sw.js` cache headers.
- `public/sw.js` — bumped to v3, expanded precache list, dropped orphan `eslint-disable`.
- `public/icon-{192,512}.png`, `public/icon-maskable-512.png`, `public/apple-icon.png`, `app/favicon.ico` — generated via `scripts/generate-icons.py`.
- `scripts/generate-icons.py` *(new)*.

Files removed: `public/manifest.json` (superseded by `app/manifest.ts`).

---

## Next planned

**Phase 2 — Backend (Supabase, API, notifications).** Will require widening CSP `connect-src` in `proxy.ts` to include the Supabase project URL, replacing the mocked `notifyManager` with a real `fetch('/api/submissions')`, and wiring the manager-phone push notification path. Search the codebase for `PHASE-2:` markers — the spots that need to change are already flagged.

**Other Phase 1 tasks still pending in TASKS.md:**
- Phase 3 — Operator dashboard
- Phase 4 — Business layer (pricing, billing, onboarding)
- Phase 5 — Go-to-market readiness

---

*Generated from session 2026-04-25/26.*
