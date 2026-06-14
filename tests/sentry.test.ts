import { afterEach, describe, expect, it, vi } from 'vitest';

// The sentry module reads NEXT_PUBLIC_SENTRY_DSN at import time, so each test
// stubs the env and re-imports a fresh copy.
async function loadSentry(dsn?: string) {
  vi.resetModules();
  if (dsn === undefined) vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
  else vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', dsn);
  return import('../app/lib/sentry');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('sentry — disabled (no DSN)', () => {
  it('is a no-op: flags off, no fetch, never throws', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
    const s = await loadSentry(undefined);
    expect(s.sentryEnabled).toBe(false);
    expect(s.SENTRY_ORIGIN).toBeNull();
    expect(() => s.captureException(new Error('boom'))).not.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('sentry — enabled', () => {
  const DSN = 'https://abc123@o42.ingest.sentry.io/7';

  it('exposes the ingest origin and enabled flag', async () => {
    const s = await loadSentry(DSN);
    expect(s.sentryEnabled).toBe(true);
    expect(s.SENTRY_ORIGIN).toBe('https://o42.ingest.sentry.io');
  });

  it('POSTs a well-formed envelope to the ingest endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
    const s = await loadSentry(DSN);
    s.captureException(new Error('kaboom'), { tags: { stage: 'test' }, extra: { foo: 'bar' } });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe(
      'https://o42.ingest.sentry.io/api/7/envelope/?sentry_key=abc123&sentry_version=7',
    );
    const lines = String((init as RequestInit).body).split('\n');
    expect(lines).toHaveLength(3); // envelope header, item header, event
    expect(JSON.parse(lines[1])).toEqual({ type: 'event' });
    const event = JSON.parse(lines[2]);
    expect(event.exception.values[0]).toMatchObject({ type: 'Error', value: 'kaboom' });
    expect(event.tags).toMatchObject({ stage: 'test' });
    expect(event.extra).toMatchObject({ foo: 'bar' });
    expect(event.level).toBe('error');
  });

  it('ignores a malformed DSN (stays disabled)', async () => {
    const s = await loadSentry('not-a-valid-dsn');
    expect(s.sentryEnabled).toBe(false);
  });
});
