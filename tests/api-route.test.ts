/**
 * Unit tests for the POST /api/submissions handler — the HTTP status mapping
 * that the guest client depends on (201 success, 429 rate-limited, 403 bad
 * token, 400 invalid). The DB function itself is covered live; here we mock
 * the Supabase RPC and assert the route translates its outcomes correctly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// Hoisted so the (hoisted) vi.mock factory can reference them.
const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));

vi.mock('../app/lib/supabase', () => ({
  getSupabase: () => ({ rpc, functions: { invoke } }),
}));

// Keep NextResponse real; neutralize after() so the post-response notification
// hook doesn't run outside a request scope.
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: () => {} };
});

import { POST } from '../app/api/submissions/route';

const valid = {
  slug: 'bistro-nordic',
  table: '12',
  token: 'tok-123',
  kind: 'alerted',
  rating: 1,
  tagKeys: ['food_bad'],
  message: 'cold food',
  language: 'en',
  session: '11111111-1111-4111-8111-111111111111',
};

function makeReq(body: unknown, opts: { badJson?: boolean } = {}): NextRequest {
  return {
    json: async () => {
      if (opts.badJson) throw new SyntaxError('bad json');
      return body;
    },
    headers: new Headers(),
  } as unknown as NextRequest;
}

describe('POST /api/submissions', () => {
  beforeEach(() => {
    rpc.mockReset();
    invoke.mockReset().mockResolvedValue({});
  });

  it('201 with id + request_id on success', async () => {
    rpc.mockResolvedValue({ data: 'sub-1', error: null });
    const res = await POST(makeReq(valid));
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.id).toBe('sub-1');
    expect(j.request_id).toBeTruthy();
  });

  it('429 when the DB function rate-limits', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'rate_limited' } });
    expect((await POST(makeReq(valid))).status).toBe(429);
  });

  it('403 (opaque "forbidden") on a bad token', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'invalid_table_token' } });
    const res = await POST(makeReq(valid));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
  });

  it('500 on an unknown DB error (internals not leaked)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'some_pg_error', code: 'XX000' } });
    const res = await POST(makeReq(valid));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('server_error');
  });

  it('400 on a schema-invalid body', async () => {
    const res = await POST(makeReq({ ...valid, language: 'de' }));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('400 on malformed JSON', async () => {
    expect((await POST(makeReq(null, { badJson: true }))).status).toBe(400);
  });
});
