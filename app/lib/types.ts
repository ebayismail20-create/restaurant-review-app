// Central type definitions for the review app.
// Keeping these in one place prevents drift as we add features and move to multi-tenant.

export type Lang = 'en' | 'fi' | 'sv';
export const DEFAULT_LANG: Lang = 'en';

export type Rating = 1 | 2 | 3 | 4 | 5;

export type Screen =
  | 'rating'
  | 'improve'
  | 'sorry'
  | 'platforms'
  | 'contact';

/**
 * Kinds of successful guest outcomes. Each maps to a distinct success copy +
 * payload kind so the manager-facing analytics can tell apart "5★ skipped
 * the public review" from "5★ went to Google to post" — the rating is the
 * same but the operator follow-up is different.
 *
 *  - posted   The guest tapped a platform card. We opened Google / TA / FB
 *             in a new tab; they may or may not have posted there.
 *  - private  3-4★ private feedback sent to the manager inbox.
 *  - alerted  1-2★ urgent alert routed to the manager's phone.
 *  - rated    5★ guest rated us but tapped "Maybe next time" instead of
 *             going to a platform. Honest copy; we do NOT claim a public
 *             review happened. Still useful signal for the manager.
 */
export type SuccessKind = 'posted' | 'private' | 'alerted' | 'rated';

export type Priority = 'urgent' | 'normal' | 'info';

export type SubmissionKind = SuccessKind | 'anon-message';

export type TagKey =
  | 'food' | 'wait' | 'service' | 'clean' | 'ambiance' | 'value'
  | 'food_bad' | 'service_bad' | 'wait_bad' | 'clean_bad' | 'price_bad' | 'other_bad';

/**
 * The payload that gets sent to the backend when a guest submits feedback.
 * This is the contract — any change here is a breaking change for the API.
 */
export interface SubmissionPayload {
  kind: SubmissionKind;
  rating: Rating | null;
  tags: string[];          // human-readable labels, already translated
  tagKeys: TagKey[];       // stable machine keys, independent of language
  message: string;
  language: Lang;
  table: string;
  server: string;
  tenantId: string;
  location: string;
  session: string;         // crypto.randomUUID(), generated at visit time
  timestamp: string;       // ISO 8601
  priority: Priority;
}

/**
 * Helper to check if a number is a valid Rating. Use this as a type guard
 * before indexing Rating-keyed maps.
 */
export function isRating(n: number | null | undefined): n is Rating {
  return n === 1 || n === 2 || n === 3 || n === 4 || n === 5;
}

/**
 * Helper to check if a string is a valid Lang.
 */
export function isLang(s: string | null | undefined): s is Lang {
  return s === 'en' || s === 'fi' || s === 'sv';
}

