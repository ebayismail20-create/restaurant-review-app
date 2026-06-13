import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Per-request security proxy. Generates a fresh nonce, builds a strict
 * Content-Security-Policy bound to that nonce, forwards both to the page
 * render, and refreshes the manager auth session on dashboard routes.
 *
 * Why nonce-based instead of static `'unsafe-inline'`?
 *  - Next.js streams inline <script> tags for hydration data, chunk
 *    preloading, and font preloads. Without a nonce, those scripts only
 *    execute when the policy allows `'unsafe-inline'` — which voids most
 *    of CSP's protection against injected XSS payloads.
 *  - `'nonce-…' 'strict-dynamic'` is the OWASP CSP3 recommendation: only
 *    scripts carrying our per-request nonce execute, and any scripts
 *    THEY load inherit trust automatically. No CDN allowlist needed.
 *
 * Trade-off: every page is dynamically rendered (a fresh nonce per
 * request). For a guest review app where the surface is one route, this
 * is fine — we don't gain meaningful CDN caching since the page is
 * largely static post-hydration anyway, and table-side QR scans don't
 * compound enough load to need edge caching.
 *
 */

const SCRIPT_SELF = "'self'";
const NONE = "'none'";

// Supabase origin, for the manager dashboard's browser ↔ Supabase auth/data
// calls. The guest flow still never calls Supabase from the browser, but
// allowing one known, trusted origin in connect-src globally is simpler than
// a per-path CSP and costs the guest path nothing meaningful.
const SUPABASE_ORIGIN = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
})();

function buildCsp(nonce: string, isDev: boolean, allowSupabase: boolean): string {
  const directives: Record<string, readonly string[]> = {
    // Default fallback for any directive we don't explicitly set.
    'default-src': [SCRIPT_SELF],

    // Scripts: only same-origin OR carrying this request's nonce.
    // 'strict-dynamic' transitions trust to scripts loaded by trusted
    // scripts, which is how Next's chunk loader works. In dev, React
    // uses eval() for source-map magic, hence 'unsafe-eval'.
    'script-src': [
      SCRIPT_SELF,
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],

    // Styles: same-origin + nonce. In dev, Next's HMR re-injects styles
    // dynamically without nonces, so we need 'unsafe-inline' there.
    // Production builds emit hashed CSS files only, no inline overrides.
    'style-src': [
      SCRIPT_SELF,
      `'nonce-${nonce}'`,
      ...(isDev ? ["'unsafe-inline'"] : []),
    ],

    // style="" ATTRIBUTES need their own directive. CSP spec rule: when a
    // nonce/hash is present in style-src, 'unsafe-inline' there is ignored —
    // and nonces can never apply to attributes. Without this directive every
    // React style={{...}} prop (status bar layout, global-error.tsx) is
    // silently dropped. Attribute styles are a far weaker injection vector
    // than <style> elements (no url() exfil in modern browsers), so allowing
    // them while keeping element styles nonce-locked is the right trade.
    'style-src-attr': ["'unsafe-inline'"],

    // Inline tag-icon and brand SVGs are encoded as data: URIs.
    // blob: only allowed in dev for HMR error overlay screenshots.
    'img-src': [SCRIPT_SELF, 'data:', ...(isDev ? ['blob:'] : [])],

    // next/font self-hosts every font file under /_next/static/media/.
    'font-src': [SCRIPT_SELF],

    // Guest submissions POST to our own /api/submissions (same-origin), so
    // guest pages stay locked to 'self' — the browser never calls Supabase
    // there. Only the manager surfaces (dashboard/login) talk to Supabase
    // from the browser, so the Supabase origin is added just for those.
    // ws:/wss: are for Next's HMR socket in dev.
    'connect-src': [
      SCRIPT_SELF,
      ...(allowSupabase && SUPABASE_ORIGIN ? [SUPABASE_ORIGIN] : []),
      ...(isDev ? ['ws:', 'wss:'] : []),
    ],

    // Hard locks. We never iframe, never get iframed, never use plugins.
    'frame-src': [NONE],
    'frame-ancestors': [NONE],
    'object-src': [NONE],

    // Form posts and <base href> can only target our own origin —
    // closes a class of phishing redirects.
    'form-action': [SCRIPT_SELF],
    'base-uri': [SCRIPT_SELF],

    // PWA surfaces: manifest + service worker + any future <video>.
    'manifest-src': [SCRIPT_SELF],
    'worker-src': [SCRIPT_SELF],
    'media-src': [SCRIPT_SELF],

    // Auto-upgrade any accidental http:// reference to https://. Empty
    // value directive — serialized below as the bare key.
    'upgrade-insecure-requests': [],
  };

  return Object.entries(directives)
    .map(([key, vals]) => (vals.length === 0 ? key : `${key} ${vals.join(' ')}`))
    .join('; ');
}

export async function proxy(request: NextRequest) {
  // crypto.randomUUID is universally available in the Edge runtime. We
  // base64 it because raw UUIDs contain hyphens, which are valid in CSP
  // but make some Web Application Firewalls nervous. Buffer is polyfilled
  // by Next on Edge.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';

  // Only the manager surfaces need Supabase in connect-src; guest pages stay
  // tight ('self').
  const path = request.nextUrl.pathname;
  const isManagerPath = path.startsWith('/dashboard') || path.startsWith('/login');
  const csp = buildCsp(nonce, isDev, isManagerPath);

  // Forward the nonce to server components via a request header so
  // app/layout.tsx can attach it to <Script> tags. The CSP itself is
  // duplicated onto the request so that Next's renderer can parse it
  // and auto-attach the nonce to framework-emitted scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Refresh the manager auth session on dashboard surfaces only. This keeps
  // the Supabase cookie fresh (and lets server components read the session)
  // without adding an auth round-trip to every guest page load. Following
  // the canonical @supabase/ssr middleware pattern, threading our nonce
  // headers through the recreated response.
  if (
    isManagerPath &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request: { headers: requestHeaders } });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );
    // getClaims validates + refreshes the token from the cookie. Do not run
    // other logic between client creation and this call (ssr requirement).
    await supabase.auth.getClaims();
  }

  // The browser-facing CSP — same value, set on the (possibly recreated)
  // response.
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

/**
 * Skip the proxy on responses that don't need a CSP:
 *  - api routes (Phase 2 will mount its own per-route CSP if needed)
 *  - _next/static, _next/image: hashed bundles, no script execution surface
 *  - favicon.ico, manifest.webmanifest: not HTML
 *  - sw.js, offline.html: SW already has bespoke headers in next.config
 *  - prefetches identified by next-router-prefetch / purpose=prefetch
 *    headers — skipping these prevents nonce churn across hover-prefetch
 *    and the eventual navigation that re-renders with a new nonce.
 *
 * Static image assets like /icon-192.png aren't in this list because
 * adding CSP to a PNG response is harmless (browsers don't execute
 * scripts inside images) and it keeps the matcher simple.
 */
export const config = {
  matcher: [
    {
      source:
        '/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
