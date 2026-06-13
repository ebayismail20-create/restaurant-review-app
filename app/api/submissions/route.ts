import { createHmac } from 'node:crypto';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { reviewRequestSchema } from '../../lib/submission-schema';
import { getSupabase } from '../../lib/supabase';

/**
 * POST /api/submissions — the one server endpoint that persists guest
 * feedback. Pipeline:
 *   1. Parse + zod-validate the body (shape, enums, length).
 *   2. Hash the client IP (salted HMAC, never stored raw) for abuse
 *      rate-limiting inside the DB function.
 *   3. Call submit_review() — a SECURITY DEFINER function that verifies the
 *      table token, resolves tenant/table, derives priority, and inserts.
 *      The anon key we use can do nothing else.
 *   4. Map DB errors to honest HTTP statuses without leaking which check
 *      failed (a bad token and a bad table both read as 403).
 *
 * Force the Node.js runtime: we use node:crypto for the IP HMAC.
 */
export const runtime = 'nodejs';

// A wrong/forged token, an unknown venue, or an inactive table are all
// "you're not allowed to post here" — collapse to one opaque 403 so probing
// the endpoint reveals nothing about which venues/tables exist.
const FORBIDDEN_DB_ERRORS = new Set([
  'invalid_venue',
  'invalid_table_token',
  'invalid_kind',
  'invalid_language',
  'invalid_rating',
]);

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  // Salt so the hash isn't a rainbow-table-able SHA of a /32. Falls back to a
  // build-stable constant if the salt env is unset (dev) — still non-reversible.
  const salt = process.env.SUBMISSION_IP_SALT ?? 'loop-review-dev-salt';
  return createHmac('sha256', salt).update(ip).digest('hex');
}

function clientIp(request: NextRequest): string | null {
  // x-forwarded-for is "client, proxy1, proxy2" — the first hop is the client.
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? null;
  return request.headers.get('x-real-ip');
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = reviewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const req = parsed.data;

  const ipHash = hashIp(clientIp(request));

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    console.error('[api/submissions]', (e as Error).message);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  const { data, error } = await supabase.rpc('submit_review', {
    p_slug: req.slug,
    p_table_label: req.table,
    p_token: req.token,
    p_kind: req.kind,
    p_rating: req.rating as number, // null is accepted by the function
    p_tag_keys: req.tagKeys,
    p_message: req.message,
    p_language: req.language,
    p_session_id: req.session,
    p_ip_hash: ipHash as string, // null is accepted by the function
  });

  if (error) {
    const code = error.message?.trim();
    if (code === 'rate_limited') {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
    if (code && FORBIDDEN_DB_ERRORS.has(code)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    // Unknown DB/transport failure — log server-side (Sentry in Phase 5),
    // return an opaque 500 so internals never reach the guest.
    console.error('[api/submissions] submit_review failed:', error.message);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  return NextResponse.json({ id: data }, { status: 201 });
}

// Anything other than POST is meaningless here.
export function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
