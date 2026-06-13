import { z } from 'zod';

import { SUBMISSION_KINDS, TAG_KEYS } from './types';

/**
 * Zod schema for the POST /api/submissions body. This is the first line of
 * defense — it rejects malformed input at the HTTP edge with clear errors
 * before anything touches the database. The database function re-validates
 * the security-critical bits (token, enums) authoritatively, so this is
 * defense in depth, not the only guard.
 *
 * Limits mirror the UI (600-char comment) and the DB constraints (rating
 * 1-5, known kinds/langs/tags) so a request that passes here cannot be
 * rejected by the DB for shape reasons — only for auth reasons (bad token).
 */
const MAX_MESSAGE = 600;

export const reviewRequestSchema = z.object({
  slug: z.string().min(1).max(128),
  table: z.string().min(1).max(64),
  token: z.string().min(1).max(128),
  kind: z.enum(SUBMISSION_KINDS),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable(),
  tagKeys: z.array(z.enum(TAG_KEYS)).max(TAG_KEYS.length),
  message: z.string().max(MAX_MESSAGE),
  language: z.enum(['en', 'fi', 'sv']),
  session: z.string().uuid(),
});

export type ReviewRequestInput = z.infer<typeof reviewRequestSchema>;
