import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { captureException } from '../../lib/sentry';

/**
 * CSP violation collector. Browsers POST here from the `report-uri` /
 * `report-to` directives (set in proxy.ts, production only). We log each
 * violation and forward it to Sentry (a no-op when no DSN), so policy
 * breakage in production is actually visible instead of silent. Always 204 —
 * the browser ignores the response body.
 *
 * Two payload shapes:
 *   report-uri      → { "csp-report": {...} }            (content-type application/csp-report)
 *   Reporting API   → [{ type, body: {...} }, …]          (content-type application/reports+json)
 */
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const reports: unknown[] = Array.isArray(payload)
      ? payload.map((r) => (r && typeof r === 'object' && 'body' in r ? r.body : r))
      : [(payload as Record<string, unknown>)['csp-report'] ?? payload];

    for (const raw of reports) {
      const r = (raw ?? {}) as Record<string, unknown>;
      const directive = String(r['violated-directive'] ?? r['effectiveDirective'] ?? 'unknown');
      const blocked = String(r['blocked-uri'] ?? r['blockedURL'] ?? '');
      console.warn(`[csp-report] ${directive} blocked ${blocked}`);
      captureException(new Error(`CSP violation: ${directive}`), {
        tags: { stage: 'csp', directive: directive.slice(0, 60) },
        extra: { report: r },
      });
    }
  } catch {
    /* malformed report — ignore, never error a beacon */
  }
  return new NextResponse(null, { status: 204 });
}

export function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
