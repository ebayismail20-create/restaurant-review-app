import type { Metadata, Viewport } from 'next';
import { Inter, Cormorant_Garamond } from 'next/font/google';
import { headers } from 'next/headers';
import Script from 'next/script';
import './globals.css';

// Keep font weights minimal — every weight = an extra font file over the wire.
// Re-audit these when we touch design tokens in Phase 3.
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

const cormorant = Cormorant_Garamond({
  variable: '--font-cormorant',
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  // Absolute-URL base for any OG/canonical metadata. Set NEXT_PUBLIC_SITE_URL
  // in the deployment environment; localhost keeps dev builds warning-free.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Bistro Nordic Review',
  description: 'Real-time guest feedback system for Bistro Nordic',
  // Per-table QR URLs are private surfaces — search engines must not index
  // them (a Google hit for "Bistro Nordic review" should land on the venue's
  // marketing site or GBP profile, never on table 12's feedback form).
  robots: {
    index: false,
    follow: false,
  },
  // Next 16 auto-detects:
  //   app/favicon.ico  → <link rel="icon">
  //   app/manifest.ts  → <link rel="manifest" href="/manifest.webmanifest">
  // Only the apple-touch-icon needs an explicit pointer because
  // app/apple-icon.png as a route convention would conflict with the
  // public/ asset we generated for direct browser fetching.
  icons: {
    apple: '/apple-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Bistro Review',
    statusBarStyle: 'black-translucent',
  },
  other: {
    // Android PWA hint — Next has no first-class field for this.
    'mobile-web-app-capable': 'yes',
  },
};

// Next 16: viewport moves to its own export and can only live in server components.
export const viewport: Viewport = {
  themeColor: '#6B1F2A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,       // Do not block pinch-zoom — WCAG 1.4.4.
  viewportFit: 'cover',  // Enables safe-area-inset-* for notched devices.
  // When the soft keyboard opens on iOS / Android, shrink the layout
  // viewport instead of overlaying it. The comment textarea on the sorry
  // and contact screens stays in view without us having to track keyboard
  // height in JS. Replaces the dead kbd-open / VisualViewport approach.
  interactiveWidget: 'resizes-content',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Per-request nonce minted by proxy.ts. Attached to <Script> tags so the
  // strict CSP allows the SW-registration inline script to execute.
  // Falls back to undefined during edge cases where the proxy didn't run
  // (e.g. statically built error pages); next/script handles undefined
  // by simply omitting the nonce attribute.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html
      lang="en"
      className={`${inter.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#1a1112]">
        <noscript>
          <p
            style={{
              padding: '24px',
              textAlign: 'center',
              color: '#F5EDE0',
              fontSize: '15px',
              lineHeight: 1.5,
            }}
          >
            This feedback form needs JavaScript. Please enable it, or ask your
            server for a comment card — we&rsquo;d still love to hear from you.
          </p>
        </noscript>
        {children}
        {/*
          Service worker registration — PRODUCTION ONLY. A cache-first SW in
          development serves stale assets and fights the dev server's own
          hot reloading. Using next/script with afterInteractive keeps it out
          of the critical path; the nonce prop attaches the per-request CSP
          nonce so this inline script is allowed under the strict policy
          from proxy.ts.
        */}
        {process.env.NODE_ENV === 'production' ? (
          <Script id="sw-register" strategy="afterInteractive" nonce={nonce}>
            {`if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {
      // SW registration failures are non-fatal. We surface them in Sentry later (Phase 5).
    });
  });
}`}
          </Script>
        ) : null}
      </body>
    </html>
  );
}
