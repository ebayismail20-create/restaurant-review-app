'use client';

import { useEffect } from 'react';

/**
 * Catastrophic fallback. Rendered when an error escapes the root layout
 * itself — for example if layout.tsx throws during render, or if the
 * dictionaries / venue / types module fails to load. By the time we land
 * here, normal infrastructure (globals.css, next/font, the language dict,
 * even React context) may not be available.
 *
 * Constraints baked into the file:
 *  - It MUST render its own <html> and <body> tags. Next does NOT wrap
 *    global-error.tsx in the root layout, so we're fully responsible for
 *    the document shell.
 *  - No imports from app/lib/*. The whole point of this file is to be the
 *    last thing standing if those modules are the problem.
 *  - All styling is inline. globals.css may not be loaded.
 *  - English only. We can't safely call into the i18n dict here, and at
 *    this severity level a universally-understood "Try again" is the
 *    right priority. The brand colours are hard-coded so the page still
 *    feels like Bistro Nordic instead of an unstyled white error.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[app/global-error]', error);
    }
    // Catastrophic layer: report to Sentry INLINE, with no app/lib import —
    // the whole point of global-error is to stand even if those modules are
    // what broke. Mirrors lib/sentry's envelope, kept self-contained on
    // purpose. No-op when no DSN.
    try {
      const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
      if (dsn) {
        const u = new URL(dsn);
        const id = crypto.randomUUID().replace(/-/g, '');
        const url = `${u.protocol}//${u.host}/api/${u.pathname.replace(/^\//, '')}/envelope/?sentry_key=${u.username}&sentry_version=7`;
        const body =
          JSON.stringify({ event_id: id, sent_at: new Date().toISOString() }) + '\n' +
          JSON.stringify({ type: 'event' }) + '\n' +
          JSON.stringify({
            event_id: id,
            timestamp: Date.now() / 1000,
            platform: 'javascript',
            level: 'fatal',
            environment: process.env.NODE_ENV ?? 'production',
            exception: { values: [{ type: error.name || 'Error', value: error.message }] },
            tags: { runtime: 'browser', boundary: 'global' },
            extra: { stack: error.stack ?? null, digest: error.digest ?? null },
          });
        void fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-sentry-envelope' },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* never let the catastrophic-fallback reporting itself throw */
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          background: '#F5EDE0',
          color: '#2A1418',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          textAlign: 'center',
          gap: 12,
        }}
      >
        <h1
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: 28,
            fontWeight: 700,
            lineHeight: 1.15,
            margin: 0,
            letterSpacing: '-0.5px',
          }}
        >
          Something went wrong.
        </h1>
        <p
          style={{
            color: 'rgba(42,20,24,0.72)',
            margin: '0 0 12px',
            maxWidth: 320,
            lineHeight: 1.55,
            fontSize: 14,
          }}
        >
          Please try again — and if it keeps happening, ask a staff member
          and we&rsquo;ll pass your feedback to the manager directly.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '14px 32px',
            background: '#6B1F2A',
            color: '#F5EDE0',
            border: 'none',
            borderRadius: 999,
            fontSize: 14.5,
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '0.2px',
            boxShadow: '0 8px 20px -6px rgba(0,0,0,0.25)',
          }}
        >
          Try again
        </button>
        {error.digest ? (
          <p
            style={{
              marginTop: 24,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 11,
              color: 'rgba(42,20,24,0.6)',
              letterSpacing: '0.4px',
            }}
            aria-label={`Reference: ${error.digest}`}
          >
            Reference: {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
