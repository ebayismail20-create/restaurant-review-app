/**
 * Minimal, dependency-free Sentry capture.
 *
 * Instead of the full @sentry/nextjs SDK (heavy, ships to every guest's
 * phone, and its build plugin conflicts with Turbopack), this posts events
 * straight to Sentry's stable envelope ingest endpoint. It runs identically
 * in Node (server) and the browser, and is a complete no-op when no DSN is
 * configured — no network, no cost.
 *
 * Set NEXT_PUBLIC_SENTRY_DSN to enable. A Sentry DSN is public by design
 * (it normally ships in client bundles), so one public var covers both
 * server and client. Errors appear as issues in your Sentry project.
 *
 * Trade-off vs the SDK: no automatic breadcrumbs, performance traces, or
 * source-map symbolication — just the exception (type, message, stack) plus
 * the context we attach. That's the 90% of value for "catch failed
 * submissions and crashes" while keeping this app lean.
 */

interface Dsn {
  ingestUrl: string; // full envelope endpoint incl. sentry_key
  origin: string; // for CSP connect-src
}

function parseDsn(raw: string | undefined): Dsn | null {
  if (!raw) return null;
  try {
    // https://<publicKey>@<host>/<projectId>
    const u = new URL(raw);
    const publicKey = u.username;
    const projectId = u.pathname.replace(/^\//, '');
    if (!publicKey || !projectId) return null;
    const origin = `${u.protocol}//${u.host}`;
    const ingestUrl =
      `${origin}/api/${projectId}/envelope/?sentry_key=${publicKey}&sentry_version=7`;
    return { ingestUrl, origin };
  } catch {
    return null;
  }
}

const DSN = parseDsn(process.env.NEXT_PUBLIC_SENTRY_DSN);

/** The Sentry ingest origin, for adding to CSP connect-src. Null when unset. */
export const SENTRY_ORIGIN: string | null = DSN?.origin ?? null;

/** Whether Sentry capture is active. */
export const sentryEnabled = DSN !== null;

function eventId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

type Extra = Record<string, unknown>;

/**
 * Report an error to Sentry. Fire-and-forget; never throws and never blocks
 * the caller. Safe to call when disabled (returns immediately).
 */
export function captureException(
  error: unknown,
  context?: { tags?: Record<string, string>; extra?: Extra },
): void {
  if (!DSN) return;
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const id = eventId();
    const isServer = typeof window === 'undefined';

    const event = {
      event_id: id,
      timestamp: Date.now() / 1000,
      platform: isServer ? 'node' : 'javascript',
      level: 'error',
      environment: process.env.NODE_ENV ?? 'production',
      exception: {
        values: [{ type: err.name || 'Error', value: err.message || String(error) }],
      },
      tags: { runtime: isServer ? 'server' : 'browser', ...context?.tags },
      extra: { stack: err.stack ?? null, ...context?.extra },
    };

    const body =
      JSON.stringify({ event_id: id, sent_at: new Date().toISOString() }) +
      '\n' +
      JSON.stringify({ type: 'event' }) +
      '\n' +
      JSON.stringify(event);

    void fetch(DSN.ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body,
      // keepalive lets the report survive an unload/crash on the client.
      keepalive: !isServer,
    }).catch(() => { /* telemetry must never surface to the user */ });
  } catch {
    /* never let error reporting throw */
  }
}
