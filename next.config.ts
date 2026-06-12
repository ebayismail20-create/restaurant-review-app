import type { NextConfig } from 'next';

/**
 * Static security headers applied to every response.
 *
 * The Content-Security-Policy header is intentionally NOT here — it lives
 * in proxy.ts where it can carry a per-request nonce. Headers below are
 * static (they don't depend on the request) so we set them once at the
 * Next layer to avoid the dynamic-rendering tax for non-HTML responses.
 *
 * Together with the nonce-based CSP, these line up against:
 *  - clickjacking (X-Frame-Options + frame-ancestors in proxy.ts)
 *  - MIME-sniff XSS (X-Content-Type-Options)
 *  - referrer leakage to third parties (Referrer-Policy)
 *  - powerful-feature abuse via untrusted iframe / extension (Permissions-Policy)
 *  - process-isolation attacks like Spectre (COOP / CORP)
 *  - protocol downgrade (Strict-Transport-Security)
 */
const securityHeaders = [
  {
    // 2-year HSTS with preload-readiness. Submit to hstspreload.org
    // before changing this — once preloaded, removing HSTS takes months.
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    // Block MIME-type sniffing that could turn an uploaded image into
    // an executed script.
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    // Belt for the suspenders — frame-ancestors in CSP is the modern
    // equivalent, but X-Frame-Options is still honored by older browsers.
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    // Don't leak the path/query of the previous Bistro Nordic page when
    // the guest follows a Google review link out. strict-origin-when-
    // cross-origin sends only the origin (https://bistronordic.example)
    // to other sites, the full URL stays same-origin.
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    // Deny every powerful Permissions-Policy feature we don't use.
    // Adding a feature later means flipping `()` to `(self)` for that
    // one entry — much safer than starting permissive and locking down.
    key: 'Permissions-Policy',
    value:
      'accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), cross-origin-isolated=(), display-capture=(), document-domain=(), encrypted-media=(), execution-while-not-rendered=(), execution-while-out-of-viewport=(), fullscreen=(), geolocation=(), gyroscope=(), keyboard-map=(), magnetometer=(), microphone=(), midi=(), navigation-override=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), sync-xhr=(), usb=(), web-share=(), xr-spatial-tracking=()',
  },
  {
    // Process-isolate the page from cross-origin openers (e.g. when a
    // guest taps the Google review platform card and we open the review
    // page in a new tab — that tab can no longer reach window.opener
    // back into the Bistro Nordic context). Combined with noopener on
    // window.open, this is belt-and-suspenders against tabnabbing.
    key: 'Cross-Origin-Opener-Policy',
    value: 'same-origin',
  },
  {
    // Block other origins from loading Bistro Nordic resources via
    // <img>, <script>, etc. PWA install on the same origin still works.
    key: 'Cross-Origin-Resource-Policy',
    value: 'same-origin',
  },
  {
    // Legacy Adobe cross-domain policy — there's no scenario where a
    // Flash/Acrobat client should bridge to our origin.
    key: 'X-Permitted-Cross-Domain-Policies',
    value: 'none',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // Do not leak "X-Powered-By: Next.js".
  // Hide the floating dev-tools indicator (route/bundler badge). Build and
  // runtime errors still surface as overlays.
  devIndicators: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Service worker must never be cached by intermediaries or the browser,
        // and its scope needs to extend to the full origin.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
