import { createHmac } from 'node:crypto';

import { after, NextResponse } from 'next/server';
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

  // Fire the manager alert AFTER the response is sent (Next's after()). The
  // alert is already durably enqueued by submit_review, so the guest never
  // waits on the email pipeline — their confirmation is instant, and the
  // Edge Function invoke runs post-response. No-op for positive kinds.
  after(() => triggerNotification(supabase, req.kind, data));

  return NextResponse.json({ id: data }, { status: 201 });
}

// Kinds that page the manager. Mirrors the enqueue condition in the
// submit_review DB function: urgent complaints, private feedback, and
// anonymous messages each queue a pending alert this set should drain.
const MANAGER_FACING = new Set(['alerted', 'private', 'anon-message']);

/**
 * Trigger delivery of the alert that submit_review already queued. The Edge
 * Function does the privileged send; we invoke it server-side with the anon
 * key (the browser never calls it, so connect-src is unchanged).
 *
 * Failures are non-fatal: the notification row stays 'pending' and can be
 * re-driven later, and the guest's submission is already saved. We await so
 * the invocation fires before a serverless function can freeze, but swallow
 * everything so it can't affect the 201.
 */
async function triggerNotification(
  supabase: ReturnType<typeof getSupabase>,
  kind: string,
  submissionId: string,
): Promise<void> {
  if (!MANAGER_FACING.has(kind)) return;
  try {
    await supabase.functions.invoke('notify-manager', {
      body: { submission_id: submissionId },
    });
  } catch (e) {
    console.error('[api/submissions] notify-manager invoke failed:', (e as Error).message);
  }
}

// Anything other than POST is meaningless here.
export function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
