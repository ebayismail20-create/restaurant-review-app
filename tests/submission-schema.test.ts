import { describe, expect, it } from 'vitest';

import { reviewRequestSchema } from '../app/lib/submission-schema';

const valid = {
  slug: 'bistro-nordic',
  table: '12',
  token: 'a'.repeat(48),
  kind: 'alerted' as const,
  rating: 1 as const,
  tagKeys: ['food_bad', 'wait_bad'] as const,
  message: 'Cold food.',
  language: 'en' as const,
  session: '11111111-1111-4111-8111-111111111111',
};

describe('reviewRequestSchema', () => {
  it('accepts a well-formed request', () => {
    expect(reviewRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a null rating (e.g. anon-message)', () => {
    const r = reviewRequestSchema.safeParse({ ...valid, kind: 'anon-message', rating: null });
    expect(r.success).toBe(true);
  });

  it('rejects unknown kinds', () => {
    expect(reviewRequestSchema.safeParse({ ...valid, kind: 'spam' }).success).toBe(false);
  });

  it('rejects out-of-range ratings', () => {
    expect(reviewRequestSchema.safeParse({ ...valid, rating: 6 }).success).toBe(false);
    expect(reviewRequestSchema.safeParse({ ...valid, rating: 0 }).success).toBe(false);
  });

  it('rejects unknown tag keys', () => {
    expect(reviewRequestSchema.safeParse({ ...valid, tagKeys: ['food_bad', 'evil'] }).success).toBe(
      false,
    );
  });

  it('rejects unknown languages', () => {
    expect(reviewRequestSchema.safeParse({ ...valid, language: 'de' }).success).toBe(false);
  });

  it('rejects a non-UUID session', () => {
    expect(reviewRequestSchema.safeParse({ ...valid, session: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects an over-long message', () => {
    expect(reviewRequestSchema.safeParse({ ...valid, message: 'x'.repeat(601) }).success).toBe(
      false,
    );
  });

  it('rejects missing required fields', () => {
    const { token: _omit, ...withoutToken } = valid;
    void _omit;
    expect(reviewRequestSchema.safeParse(withoutToken).success).toBe(false);
  });
});
