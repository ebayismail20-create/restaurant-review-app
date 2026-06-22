'use client';

/**
 * Guest review flow — the single client component that owns the entire
 * on-table experience. Any screen the guest sees comes from here.
 *
 * Collapsed flow (no separate welcome page):
 *  - The rating screen IS the entry point. Venue brand mark + table chip
 *    anchor at the top; tapping a star collapses them and reveals the
 *    smiley, the mood word, and the Continue button.
 *  - Continue routes by rating bucket: 5 → platforms, 3-4 → improve,
 *    1-2 → sorry.
 *  - Improve / sorry use progressive disclosure: the comment box appears
 *    after the first reason tag is picked. The sorry screen validates that
 *    at least one tag is chosen and the comment is non-empty before Send;
 *    the always-visible anonymous-contact button is the escape hatch.
 *  - Success overlay copy is keyed by outcome (posted / private / alerted /
 *    rated) with a status chip describing what actually happened.
 *
 * Structural invariants:
 *  - No `dangerouslySetInnerHTML`. Translations render as plain text; line
 *    breaks are encoded as "\n" and surfaced via CSS `white-space: pre-line`.
 *  - No module-level venue state. Venue data flows from `./lib/venue`.
 *  - Typed contracts end-to-end (`./lib/types`). `notifyManager` POSTs a
 *    typed `ReviewRequest` to /api/submissions, not `any`.
 *  - Network-opened platform links use `noopener,noreferrer`.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { TagIcon, type TagIconName } from './components/TagIcon';
import { i18n, format, type Dict } from './lib/dictionaries';
import {
  DEFAULT_LANG,
  isLang,
  isRating,
  type Lang,
  type Rating,
  type ReviewRequest,
  type Screen,
  type SubmissionKind,
  type SuccessKind,
  type TagKey,
} from './lib/types';
import {
  DEMO_VENUE,
  createSessionId,
  resolvePlatformUrl,
  type Platform,
  type PlatformKind,
  type VenueContext,
} from './lib/venue';

// --- Static visual config ---------------------------------------------------

interface FaceConfig {
  readonly eyeR: number;
  readonly eyeCy: number;
  readonly mouth: string;
}

const FACE_BY_RATING: Record<Rating, FaceConfig> = {
  1: { eyeR: 14, eyeCy: 90, mouth: 'M 70 155 Q 100 125 130 155' },
  2: { eyeR: 14, eyeCy: 90, mouth: 'M 75 150 Q 100 135 125 150' },
  3: { eyeR: 14, eyeCy: 95, mouth: 'M 80 140 Q 100 140 120 140' },
  4: { eyeR: 14, eyeCy: 90, mouth: 'M 75 135 Q 100 155 125 135' },
  5: { eyeR: 16, eyeCy: 88, mouth: 'M 70 135 Q 100 170 130 135' },
};

const NEUTRAL_FACE: FaceConfig = { eyeR: 14, eyeCy: 90, mouth: 'M 70 135 Q 100 165 130 135' };

const THEME_BY_RATING: Record<Rating, string> = {
  1: 'theme-bad',
  2: 'theme-bad',
  3: 'theme-meh',
  4: 'theme-good',
  5: 'theme-great',
};

/** Idle theme before (and after) a rating is chosen. */
const DEFAULT_THEME = 'theme-good';

/**
 * Which outcome a rating routes to on Continue. The flow has three buckets;
 * crossing between them invalidates any reason tags/comment already drafted
 * for the old bucket (see `setRating`). Adjusting within a bucket keeps them.
 */
type RatingBucket = 'sorry' | 'improve' | 'platforms';
// Routing depends on the venue's owner-set threshold `minPublic` (5 by default,
// or 4 if the owner opts in via the dashboard): ratings >= minPublic are invited
// to a public review; a 3★ gives private "where could we be better" feedback;
// 1-2★ reach the urgent private flow. The public option stays reachable for
// everyone (1-3★ via the "Share publicly" success-screen link), so we never gate
// it — the threshold only changes who is asked publicly *first*.
const bucketOf = (r: Rating, minPublic: number): RatingBucket =>
  r >= minPublic ? 'platforms' : r >= 3 ? 'improve' : 'sorry';

// Keep comments short enough to fit a push notification and stay out of spam territory.
const MAX_COMMENT = 600;

// Tag definitions. Keys are stable (used by the backend, analytics, and
// reporting); labels are resolved per-render from the current dictionary.
interface TagDef {
  readonly key: TagKey;
  readonly icon: TagIconName;
  readonly labelKey: keyof Dict;
}

const POSITIVE_TAGS: readonly TagDef[] = [
  { key: 'food', icon: 'food', labelKey: 'tag_food' },
  { key: 'wait', icon: 'wait', labelKey: 'tag_wait' },
  { key: 'service', icon: 'service', labelKey: 'tag_service' },
  { key: 'clean', icon: 'clean', labelKey: 'tag_clean' },
  { key: 'other', icon: 'other', labelKey: 'tag_other' },
  { key: 'value', icon: 'value', labelKey: 'tag_value' },
];

const NEGATIVE_TAGS: readonly TagDef[] = [
  { key: 'food_bad', icon: 'food', labelKey: 'tag_food_bad' },
  { key: 'service_bad', icon: 'service', labelKey: 'tag_service_bad' },
  { key: 'wait_bad', icon: 'wait', labelKey: 'tag_wait_bad' },
  { key: 'clean_bad', icon: 'clean', labelKey: 'tag_clean_bad' },
  { key: 'price_bad', icon: 'price', labelKey: 'tag_price_bad' },
  { key: 'other_bad', icon: 'other', labelKey: 'tag_other_bad' },
];

const STAR_PATH =
  'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';

// Step-2 rating recap: the stars the guest gave + a caption. Decorative (the
// rating was announced on step 1), so the star row is aria-hidden; the caption
// stays readable for context.
function RatingRecap({ rating, caption }: { rating: Rating | null; caption: string }) {
  return (
    <div className="rating-recap">
      <span className="recap-stars" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <svg key={n} className={`recap-star ${rating != null && rating >= n ? 'on' : ''}`} viewBox="0 0 24 24">
            <path d={STAR_PATH} />
          </svg>
        ))}
      </span>
      <span className="recap-cap">{caption}</span>
    </div>
  );
}

// Platform icons. Google and Tripadvisor get their brand marks; every other
// owner-added platform (Yelp, OpenTable, their website, anything) gets a clean
// generic globe so the card still looks intentional.
function PlatformIcon({ kind }: { kind: PlatformKind }) {
  if (kind === 'google') {
    return (
      <svg width="34" height="34" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
        <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z" />
        <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
      </svg>
    );
  }
  if (kind === 'tripadvisor') {
    return (
      <svg width="34" height="34" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <circle cx="24" cy="24" r="20" fill="#00AF87" />
        <circle cx="16" cy="22" r="6" fill="#fff" />
        <circle cx="32" cy="22" r="6" fill="#fff" />
        <circle cx="16" cy="22" r="2.5" fill="#1B1B1B" />
        <circle cx="32" cy="22" r="2.5" fill="#1B1B1B" />
      </svg>
    );
  }
  // Generic mark for any other owner-added platform.
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--button)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

// --- Component --------------------------------------------------------------

interface Props {
  /** Optional venue override for future multi-tenant routing. Defaults to the demo venue. */
  venue?: VenueContext;
}

export default function RestaurantReviewApp({ venue = DEMO_VENUE }: Props) {
  // ---- State ----
  const [currentScreen, setCurrentScreen] = useState<Screen>('rating');
  const [themeClass, setThemeClass] = useState<string>(DEFAULT_THEME);
  const [currentRating, setCurrentRating] = useState<Rating | null>(null);
  const [currentLang, setCurrentLang] = useState<Lang>(DEFAULT_LANG);
  const [selectedTags, setSelectedTags] = useState<ReadonlySet<TagKey>>(new Set());
  const [showSuccess, setShowSuccess] = useState<boolean>(false);
  // True only when the platforms screen was reached via the "Share publicly"
  // link AFTER private feedback was already submitted (so declining just
  // closes). False when 4-5★ guests land here as their primary step.
  const [platformsAfterSubmit, setPlatformsAfterSubmit] = useState<boolean>(false);
  const [successKind, setSuccessKind] = useState<SuccessKind>('posted');
  const [contactMessage, setContactMessage] = useState<string>('');
  const [commentImprove, setCommentImprove] = useState<string>('');
  const [commentSorry, setCommentSorry] = useState<string>('');
  // Sorry-screen validation. The comment box is hidden until a tag is
  // selected (progressive disclosure), so "pick at least one" has to be
  // surfaced separately if the guest taps Send before tagging. The comment
  // itself is OPTIONAL — selected tags alone are actionable signal, and
  // forcing prose at the angriest moment of the flow costs submissions.
  const [showTagsError, setShowTagsError] = useState<boolean>(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState<boolean>(false);

  // Lazy crypto-random session ID. One per guest visit; regenerated in resetApp().
  const [sessionId, setSessionId] = useState<string>(() => createSessionId());

  const improveTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sorryTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const contactTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // Success overlay refs — focus moves to the heading on open.
  const successHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const successDoneRef = useRef<HTMLButtonElement | null>(null);
  // Optional "share publicly too" link on the success overlay (private/alerted
  // paths) — part of the focus trap when present.
  const successShareRef = useRef<HTMLButtonElement | null>(null);

  // Star refs for roving-tabindex + arrow-key navigation. Index 0..4 maps to
  // ratings 1..5. Following the WAI-ARIA APG radiogroup pattern.
  const starRefs = useRef<Array<HTMLButtonElement | null>>([null, null, null, null, null]);

  // First negative-tag ref so submitSorry can move focus there when the
  // tag-required validation fires.
  const firstNegativeTagRef = useRef<HTMLButtonElement | null>(null);

  const dict = i18n[currentLang];

  // ---- Effects ----

  // Keep <html lang> in sync with the chosen language. Screen readers and
  // Safari's translate offer rely on this.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = currentLang;
    }
  }, [currentLang]);

  // One-shot bootstrap: detect browser locale + URL params.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // ?lang= explicitly wins over navigator.language.
    const params = new URLSearchParams(window.location.search);

    const langParam = params.get('lang');
    if (langParam && isLang(langParam)) {
      // Intentional one-shot setState: we cannot read navigator/location during
      // render in a client component without risking a hydration mismatch, and
      // this is the only way to apply the discovered defaults on first paint.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentLang(langParam);
    } else {
      // Priority: localStorage (returning guest) > navigator.language (first visit).
      let resolved: string | null = null;
      try {
        resolved = window.localStorage.getItem('bistro-lang');
      } catch { /* privacy mode */ }
      if (resolved && isLang(resolved)) {
        setCurrentLang(resolved);
      } else if (typeof navigator !== 'undefined') {
        const candidate = (navigator.language || '').slice(0, 2).toLowerCase();
        if (isLang(candidate)) {
          setCurrentLang(candidate);
        }
      }
    }
  }, []);

  // Move focus to the screen heading on transitions so screen-reader users
  // get oriented. Skipped on the very first mount.
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    // Deferred so focus lands after the enter animation.
    const t = window.setTimeout(() => {
      headingRef.current?.focus();
    }, 120);
    return () => window.clearTimeout(t);
  }, [currentScreen]);

  // Success overlay focus management.
  useEffect(() => {
    if (!showSuccess) return;
    const t = window.setTimeout(() => {
      successHeadingRef.current?.focus();
    }, 120);
    return () => window.clearTimeout(t);
  }, [showSuccess]);

  // Tab trap inside the success overlay. There are one or two focusable
  // controls (Done, and optionally "share publicly too") — cycle between them.
  const onOverlayKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!showSuccess) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        successDoneRef.current?.click();
        return;
      }
      if (e.key !== 'Tab') return;
      e.preventDefault();
      const focusables = [successShareRef.current, successDoneRef.current].filter(
        (el): el is HTMLButtonElement => el !== null,
      );
      if (focusables.length === 0) return;
      const idx = focusables.indexOf(document.activeElement as HTMLButtonElement);
      const nextIdx = e.shiftKey
        ? (idx <= 0 ? focusables.length - 1 : idx - 1)
        : (idx >= focusables.length - 1 ? 0 : idx + 1);
      focusables[nextIdx]?.focus();
    },
    [showSuccess],
  );

  // ---- Helpers ----

  const applyLang = useCallback((lang: Lang) => {
    setCurrentLang(lang);
    // Persist so returning guests keep their language choice.
    try {
      window.localStorage.setItem('bistro-lang', lang);
    } catch { /* privacy mode — silently skip */ }
  }, []);

  const goTo = useCallback((screen: Screen) => {
    // Dismiss on-screen keyboard and reset scroll so the next screen starts clean.
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
    // Rating + reason drafts deliberately PERSIST across navigation — the
    // big-app pattern: going Back never silently discards what the guest
    // already entered. The rating screen keeps its stars lit, the logo
    // collapsed, and Continue ready; reason tags + comment survive a
    // peek-and-return. Stale state is cleared only when it's genuinely
    // invalidated: a rating change that crosses outcome buckets (see
    // `setRating`) or a brand-new visit (see `resetApp`).
    setSendError(null);
    setCurrentScreen(screen);
  }, []);

  const goBack = useCallback(() => {
    if (currentScreen === 'improve' || currentScreen === 'sorry' || currentScreen === 'platforms') {
      goTo('rating');
    } else if (currentScreen === 'contact') {
      // Return to the sorry screen WITHOUT the goTo() reset. A guest who
      // typed half a complaint, peeked at the anonymous-contact option, and
      // came back must find their tags and comment exactly as they left
      // them — wiping an angry guest's draft is how you earn the public
      // 1-star review this product exists to prevent.
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      setSendError(null);
      setCurrentScreen('sorry');
    }
  }, [currentScreen, goTo]);

  /** Continue from the rating screen — routes by rating bucket. */
  const continueFromRating = useCallback(() => {
    if (!isRating(currentRating)) return;
    setPlatformsAfterSubmit(false); // a public-bound guest lands here as their primary step
    goTo(bucketOf(currentRating, venue.publicReviewMinRating));
  }, [currentRating, goTo, venue.publicReviewMinRating]);

  const setRating = useCallback((value: Rating) => {
    // Changing the rating ACROSS an outcome boundary (sorry ↔ improve ↔
    // platforms) invalidates any reason tags/comment drafted for the old
    // bucket — the chips shown differ — so clear them. Adjusting WITHIN a
    // bucket (1↔2, 3↔4) keeps the draft, since the same chips apply.
    const minPublic = venue.publicReviewMinRating;
    if (currentRating !== null && bucketOf(currentRating, minPublic) !== bucketOf(value, minPublic)) {
      setSelectedTags(new Set());
      setCommentImprove('');
      setCommentSorry('');
      setShowTagsError(false);
    }
    setCurrentRating(value);
    setThemeClass(THEME_BY_RATING[value]);
    // Micro haptic pulse — 10ms is barely perceptible but makes the star
    // tap feel premium on Android. No-ops on iOS / desktop.
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
  }, [currentRating, venue.publicReviewMinRating]);

  /**
   * Roving-tabindex stop for the star radiogroup. The stop lives on the
   * currently-selected star; if nothing is selected yet it lives on the
   * first star so keyboard users have an entry point.
   */
  const ratingTabStop: Rating = isRating(currentRating) ? currentRating : 1;

  /**
   * Star radiogroup keyboard handler — implements the WAI-ARIA APG
   * radiogroup pattern: arrow keys cycle through ratings (changing both
   * focus and selection), Home jumps to 1, End jumps to 5.
   */
  const onStarKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, current: Rating) => {
      let next: Rating | null = null;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          next = (current === 5 ? 1 : current + 1) as Rating;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          next = (current === 1 ? 5 : current - 1) as Rating;
          break;
        case 'Home':
          next = 1;
          break;
        case 'End':
          next = 5;
          break;
        default:
          return;
      }
      e.preventDefault();
      setRating(next);
      starRefs.current[next - 1]?.focus();
    },
    [setRating],
  );

  const toggleTag = useCallback(
    (key: TagKey, isOnSorry: boolean) => {
      // Any tag interaction clears the "pick a tag" validation.
      setShowTagsError(false);
      setSelectedTags((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        // Once at least one tag is chosen, the comment box reveals —
        // focus it and scroll it into view after the reveal animation.
        if (next.size > 0) {
          const target = isOnSorry ? sorryTextareaRef : improveTextareaRef;
          window.setTimeout(() => {
            target.current?.focus({ preventScroll: false });
            target.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 380);
        }
        return next;
      });
    },
    [],
  );

  /** Selected tags as stable machine keys, in canonical order. */
  const resolveTagKeys = useCallback(
    (keys: ReadonlySet<TagKey>): TagKey[] => {
      const allTags: readonly TagDef[] = [...POSITIVE_TAGS, ...NEGATIVE_TAGS];
      return allTags.filter((def) => keys.has(def.key)).map((def) => def.key);
    },
    [],
  );

  /**
   * Build the wire request for POST /api/submissions. Deliberately narrow:
   * the table token + slug authorize the post, but priority / timestamp /
   * tenant are all decided server-side and intentionally absent here.
   */
  const buildRequest = useCallback(
    (kind: SubmissionKind, extra?: { message?: string }): ReviewRequest => {
      const isNegative = isRating(currentRating) && currentRating <= 2;
      const contextualComment = isNegative ? commentSorry : commentImprove;
      const message =
        extra?.message !== undefined ? extra.message : contextualComment.trim();
      return {
        slug: venue.tenantId,
        table: venue.tableNumber,
        token: venue.tableToken,
        kind,
        rating: isRating(currentRating) ? currentRating : null,
        tagKeys: resolveTagKeys(selectedTags),
        message,
        language: currentLang,
        session: sessionId,
      };
    },
    [
      commentImprove,
      commentSorry,
      currentLang,
      currentRating,
      resolveTagKeys,
      selectedTags,
      sessionId,
      venue,
    ],
  );

  /**
   * Persist the submission via POST /api/submissions, resilient to flaky
   * restaurant Wi-Fi. Transient failures (the fetch throwing, or a 5xx) are
   * retried up to 3 attempts with backoff — smoothing over a network blip
   * while the guest is still on the screen. Permanent failures (4xx: bad
   * token, validation; 429: rate-limited) are NOT retried — they're surfaced
   * immediately so the guest isn't left waiting on something that can't
   * succeed. After the attempts are exhausted it throws, and the caller
   * shows dict.sendError with a manual retry.
   *
   * Chosen over the Service Worker Background Sync API on purpose: that's
   * Chromium-only (silently a no-op on iOS Safari, where a large share of
   * restaurant guests are), and the real failure mode here is a transient
   * blip while the guest is present — which in-place retry handles for
   * everyone.
   */
  const notifyManager = useCallback(async (req: ReviewRequest): Promise<void> => {
    const MAX_ATTEMPTS = 3;
    const BACKOFF_MS = [600, 1500]; // delay before attempt 2, then attempt 3
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => window.setTimeout(r, BACKOFF_MS[attempt - 1]));
      }
      try {
        const res = await fetch('/api/submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req),
        });
        if (res.ok) return;
        // 4xx (incl. 403 bad token / 400 invalid / 429 rate-limited) are
        // permanent for this request — don't waste the guest's time retrying.
        if (res.status < 500) {
          throw new Error(`submission rejected: ${res.status}`);
        }
        // 5xx → transient, fall through to retry.
        lastError = new Error(`submission failed: ${res.status}`);
      } catch (e) {
        // A thrown 4xx above must not be retried; re-throw it.
        if (e instanceof Error && e.message.startsWith('submission rejected:')) {
          throw e;
        }
        // Network error (offline / blip) — retry.
        lastError = e instanceof Error ? e : new Error('network error');
      }
    }
    throw lastError ?? new Error('submission failed');
  }, []);

  const showSuccessScreen = useCallback((kind: SuccessKind) => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    setSuccessKind(kind);
    setShowSuccess(true);
  }, []);

  // ---- Submit handlers ----

  /** 3-4★ private feedback. No validation — everything is optional. */
  const submitImprove = useCallback(async () => {
    setSendError(null);
    setSending(true);
    try {
      await notifyManager(buildRequest('private'));
      showSuccessScreen('private');
    } catch {
      setSendError(dict.sendError);
    } finally {
      setSending(false);
    }
  }, [buildRequest, dict, notifyManager, showSuccessScreen]);

  /**
   * 1-2★ urgent feedback. The comment textarea is hidden until the guest
   * picks at least one tag (progressive disclosure), so if Send is tapped
   * with no tags we surface a tag-level error first — pointing them at the
   * visible UI instead of an invisible textarea. The comment is optional:
   * tags alone are actionable, and demanding prose costs submissions.
   */
  const submitSorry = useCallback(async () => {
    if (selectedTags.size === 0) {
      setShowTagsError(true);
      firstNegativeTagRef.current?.focus();
      return;
    }
    setSendError(null);
    setSending(true);
    try {
      await notifyManager(buildRequest('alerted'));
      showSuccessScreen('alerted');
    } catch {
      setSendError(dict.sendError);
    } finally {
      setSending(false);
    }
  }, [buildRequest, dict, notifyManager, selectedTags, showSuccessScreen]);

  const resetApp = useCallback(() => {
    setShowSuccess(false);
    setSelectedTags(new Set());
    setCommentImprove('');
    setCommentSorry('');
    setShowTagsError(false);
    setSendError(null);
    setContactMessage('');
    setCurrentRating(null);
    setCurrentScreen('rating');
    setPlatformsAfterSubmit(false);
    setThemeClass(DEFAULT_THEME);
    // Fresh session ID — this is a new visit's submission from the guest's POV.
    setSessionId(createSessionId());
  }, []);

  /**
   * Copy tone on the platforms screen adapts to the rating:
   *  - 5★ → celebratory ("You made our day!", 🎉, "Last step").
   *  - 4★, or any 1-3★ guest who tapped "Share publicly" after private
   *    feedback → measured, neutral copy: no celebration, no presumption of
   *    delight. (Tone is rating-driven; the skip behaviour below is path-driven.)
   */
  const platformsMeasured = isRating(currentRating) && currentRating < 5;

  /**
   * The skip button ("Maybe next time"). If the guest already submitted private
   * feedback and is only here for the bonus public ask, declining just closes.
   * Otherwise they arrived as their primary step (a 4-5★ guest), so declining
   * still records their rating and shows a gracious thank-you — a 4★ who skips
   * is never lost. Logged in the background so a happy guest never waits on
   * flaky restaurant Wi-Fi.
   */
  const finishFromPlatforms = useCallback(() => {
    if (platformsAfterSubmit) {
      resetApp();
      return;
    }
    void notifyManager(buildRequest('rated')).catch(() => { /* best-effort */ });
    showSuccessScreen('rated');
  }, [platformsAfterSubmit, resetApp, buildRequest, notifyManager, showSuccessScreen]);

  /**
   * "Share publicly too" — from a private/alerted success screen, send the
   * guest to the (neutral-copy) platforms screen. The public review option is
   * offered to EVERY guest regardless of score; we never suppress it for low
   * ratings (review gating). Their private feedback is already submitted.
   */
  const sharePublicly = useCallback(() => {
    setShowSuccess(false);
    setPlatformsAfterSubmit(true); // already submitted; declining just closes
    goTo('platforms');
  }, [goTo]);

  // The platform card is a real <a href target="_blank"> (see the render), so the
  // browser does the navigating natively — that opens the review page reliably
  // even inside in-app/QR webviews and under strict popup blockers, where a
  // JS window.open() is silently dropped (the old "nothing happens" bug). This
  // handler just records the choice and advances the app; it must NOT
  // preventDefault, so the link still opens.
  const recordPlatformTap = useCallback(
    (platform: Platform) => {
      const { placeholder } = resolvePlatformUrl(platform);
      // Unconfigured platform: the href degrades to the platform home page. Note
      // it for devs only (warn, not error, so it doesn't spam guests' consoles).
      if (placeholder && process.env.NODE_ENV !== 'production') {
        console.warn(
          `[venue-config] ${platform.kind} link is not configured for tenant "${venue.tenantId}" — falling back to the platform home page.`,
        );
      }
      // Analytics ping is fire-and-forget; never blocks the outbound review.
      void notifyManager(
        buildRequest('posted', { message: `Chose platform: ${platform.kind}` }),
      ).catch(() => { /* never block the review for analytics */ });
      window.setTimeout(() => showSuccessScreen('posted'), 250);
    },
    [buildRequest, notifyManager, showSuccessScreen, venue.tenantId],
  );

  const openContact = useCallback(() => goTo('contact'), [goTo]);

  const submitContact = useCallback(async () => {
    const msg = contactMessage.trim();
    if (msg.length === 0) {
      contactTextareaRef.current?.focus();
      return;
    }
    setSendError(null);
    setSending(true);
    try {
      await notifyManager(buildRequest('anon-message', { message: msg }));
      setContactMessage('');
      showSuccessScreen('alerted');
    } catch {
      setSendError(dict.sendError);
    } finally {
      setSending(false);
    }
  }, [buildRequest, contactMessage, dict, notifyManager, showSuccessScreen]);

  // ---- Derived values ----

  const faceAttrs = useMemo(
    () => (isRating(currentRating) ? FACE_BY_RATING[currentRating] : NEUTRAL_FACE),
    [currentRating],
  );

  const ratingWord = isRating(currentRating) ? dict[`rate_${currentRating}` as const] : '';

  const isActive = (screen: Screen) => currentScreen === screen;

  /**
   * A screen is "inert" (un-tabbable, removed from a11y tree) when it is
   * not the active screen, OR when the success overlay is showing on top.
   */
  const isScreenInert = (screen: Screen) => !isActive(screen) || showSuccess;

  // Live-region copy for tag toggles.
  const tagsAnnouncement =
    selectedTags.size === 0
      ? ''
      : format(dict.tagsSelectedAnnouncement, { n: selectedTags.size });

  /**
   * Success-overlay copy keyed off successKind. The exhaustive switch lets
   * TypeScript flag any future SuccessKind additions that forget copy.
   */
  const successCopy: { title: string; msg: string } = (() => {
    switch (successKind) {
      case 'alerted':
        return { title: dict.successTitleAlerted, msg: dict.successMsgAlerted };
      case 'private':
        return { title: dict.successTitlePrivate, msg: dict.successMsgPrivate };
      case 'rated':
        return { title: dict.successTitleRated, msg: dict.successMsgRated };
      case 'posted':
        return { title: dict.successTitlePosted, msg: dict.successMsgPosted };
    }
  })();

  /**
   * Compliance: the public-review option must be reachable by EVERY guest, not
   * just high scorers — suppressing it for low ratings is "review gating",
   * which violates Google's review policy + the FTC 2024 review-suppression
   * rule. So after any private (3-4★) or alerted (1-2★ / anonymous) submission
   * we offer "share publicly", provided the venue configured a platform. Not on
   * 'posted' (already did) or 'rated' (already saw + declined the platforms
   * screen). It stays a small, quiet link so the primary Done leads — available
   * to all, but never pushed.
   */
  const showSharePublic =
    (successKind === 'private' || successKind === 'alerted') && venue.platforms.length > 0;

  // ---- Render ----

  return (
    <div className="device-frame">
      <div id="app" className={`app ${themeClass}`}>

        {/* SR-only polite live region for tag-toggle announcements. */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {tagsAnnouncement}
        </div>

        <div className="header">
          {currentScreen !== 'rating' && !showSuccess ? (
            <button
              type="button"
              className="icon-btn"
              onClick={goBack}
              aria-label={dict.back}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          ) : (
            <div style={{ width: 38 }} />
          )}
          <div className="lang-switch" role="group" aria-label={dict.langGroupLabel}>
            <button
              type="button"
              className="lang-btn"
              aria-pressed={currentLang === 'en'}
              aria-label={dict.langEnLabel}
              onClick={() => applyLang('en')}
            >
              EN
            </button>
            <button
              type="button"
              className="lang-btn"
              aria-pressed={currentLang === 'fi'}
              aria-label={dict.langFiLabel}
              onClick={() => applyLang('fi')}
            >
              FI
            </button>
            <button
              type="button"
              className="lang-btn"
              aria-pressed={currentLang === 'sv'}
              aria-label={dict.langSvLabel}
              onClick={() => applyLang('sv')}
            >
              SV
            </button>
          </div>
        </div>

        {/* ---------------- RATING (entry point) ---------------- */}
        {/*
          Three-zone layout: venue context anchored at the top (collapses on
          .rated via the :has() rule in globals.css), the headline + stars at
          the optical centre, Continue revealed at the bottom after a tap.
        */}
        <div
          id="screenRating"
          className={`screen ${isActive('rating') ? 'active' : ''}`}
          aria-hidden={isScreenInert('rating')}
          inert={isScreenInert('rating')}
        >
          <div className="venue-header">
            <div className="venue-brand">
              {venue.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={`venue-logo${venue.logoShape === 'round' ? ' is-round' : ''}`} src={venue.logoUrl} alt={venue.brandName} />
              ) : venue.brandColor ? (
                <span
                  className="venue-monogram"
                  style={{ background: venue.brandColor }}
                  aria-hidden="true"
                >
                  {venue.brandName.charAt(0)}
                </span>
              ) : null}
              {!venue.logoUrl || venue.showNameWithLogo ? (
                <span className="venue-brand-name">{venue.brandName}</span>
              ) : null}
              {venue.brandTag ? (
                <>
                  <span className="venue-flourish" aria-hidden="true" />
                  <span className="venue-brand-tag">{venue.brandTag}</span>
                </>
              ) : null}
            </div>
          </div>
          <div className={`rating-content ${currentRating ? 'rated' : ''}`} id="ratingContent">
            <div className="step-label">{dict.step1of2}</div>
            <h1
              ref={isActive('rating') ? headingRef : null}
              className="rating-title"
              tabIndex={-1}
            >
              {dict.ratingTitle}
            </h1>

            <div className="face-wrap" aria-hidden="true">
              <svg viewBox="0 0 200 200">
                <circle cx="70" cy={faceAttrs.eyeCy} r={faceAttrs.eyeR} fill="var(--text)" />
                <circle cx="130" cy={faceAttrs.eyeCy} r={faceAttrs.eyeR} fill="var(--text)" />
                <path
                  d={faceAttrs.mouth}
                  stroke="var(--text)"
                  strokeWidth="9"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </div>

            <div className="rating-word" aria-live="polite" key={currentRating ?? 'none'}>
              {ratingWord}
            </div>

            <div className={`stars ${isRating(currentRating) ? '' : 'invite'}`} role="radiogroup" aria-label={dict.ratingGroupLabel}>
              {[1, 2, 3, 4, 5].map((val) => {
                const n = val as Rating;
                const active = isRating(currentRating) && currentRating >= n;
                const isStop = n === ratingTabStop;
                return (
                  <button
                    type="button"
                    key={n}
                    ref={(el) => {
                      starRefs.current[n - 1] = el;
                    }}
                    className={`star ${active ? 'active' : ''}`}
                    onClick={() => setRating(n)}
                    onKeyDown={(e) => onStarKeyDown(e, n)}
                    role="radio"
                    aria-checked={currentRating === n}
                    aria-label={format(dict.starAriaLabel, { n })}
                    tabIndex={isStop ? 0 : -1}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </button>
                );
              })}
            </div>

            {/* Effort cue under the stars — the star sweep already signals the
                tap, so no separate "tap a star" line. Hidden on .rated. */}
            <div className="rating-cue" aria-hidden="true"><span className="dot" />{dict.effortCue}</div>

            <div className="rating-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={continueFromRating}
                disabled={!isRating(currentRating)}
                aria-label={
                  isRating(currentRating) ? dict.continue : dict.continueDisabledLabel
                }
              >
                <span>{dict.continue}</span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ---------------- IMPROVE (rating 3/4) ---------------- */}
        <div
          id="screenImprove"
          className={`screen ${isActive('improve') ? 'active' : ''} ${selectedTags.size > 0 ? 'has-selection' : ''}`}
          aria-hidden={isScreenInert('improve')}
          inert={isScreenInert('improve')}
        >
          <div className="reasons-wrap">
            {isRating(currentRating) ? (
              <RatingRecap rating={currentRating} caption={format(dict.youGaveStars, { n: currentRating })} />
            ) : null}
            <div className="reasons-header">
              <div className="step-label">{dict.step2of2}</div>
              <h2
                ref={isActive('improve') ? headingRef : null}
                className="reasons-title"
                tabIndex={-1}
              >
                {dict.improveTitle}
              </h2>
              <p className="reasons-sub">{dict.selectMultiple}</p>
            </div>

            <div className="tags" role="group" aria-label={dict.positiveTagsGroupLabel}>
              {POSITIVE_TAGS.map((tag) => (
                <button
                  type="button"
                  key={tag.key}
                  className="tag"
                  aria-pressed={selectedTags.has(tag.key)}
                  onClick={() => toggleTag(tag.key, false)}
                >
                  <span className="tag-icon" aria-hidden="true">
                    <TagIcon name={tag.icon} />
                  </span>
                  <span>{dict[tag.labelKey]}</span>
                </button>
              ))}
            </div>

            <div className="comment-wrap">
              <label className="sr-only" htmlFor="improveComment">
                {dict.commentLabel}
              </label>
              <textarea
                id="improveComment"
                ref={improveTextareaRef}
                className="comment"
                placeholder={dict.commentPh}
                value={commentImprove}
                onChange={(e) => setCommentImprove(e.target.value.slice(0, MAX_COMMENT))}
                maxLength={MAX_COMMENT}
              />
              <div className="comment-meta">
                <span />
                <span aria-hidden="true">{`${commentImprove.length}/${MAX_COMMENT}`}</span>
              </div>
              <p className="comment-privacy">{dict.commentPrivacy}</p>
            </div>
          </div>
          {sendError ? (
            <p role="alert" className="send-error">
              {sendError}
            </p>
          ) : null}
          <button
            type="button"
            className="btn-primary btn-full"
            onClick={submitImprove}
            disabled={sending}
            aria-busy={sending}
          >
            <span>{sending ? dict.sendRetry : dict.sendPrivate}</span>
            <svg
              className="btn-arrow"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
            <span className="btn-spinner" aria-hidden="true" />
          </button>
        </div>

        {/* ---------------- SORRY (rating 1/2) ---------------- */}
        <div
          id="screenSorry"
          className={`screen ${isActive('sorry') ? 'active' : ''} ${selectedTags.size > 0 ? 'has-selection' : ''}`}
          aria-hidden={isScreenInert('sorry')}
          inert={isScreenInert('sorry')}
        >
          <div className="reasons-wrap">
            <div className="sorry-heart" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>

            <div className="reasons-header">
              <div className="step-label">{dict.step2of2}</div>
              <h2
                ref={isActive('sorry') ? headingRef : null}
                className="reasons-title"
                tabIndex={-1}
              >
                {dict.sorryTitle}
              </h2>
              <p className="reasons-sub">{dict.sorrySub}</p>
            </div>

            {showTagsError ? (
              <p role="alert" id="sorryTagsError" className="tag-error">
                {dict.tagsRequired}
              </p>
            ) : null}
            <div
              className="tags"
              role="group"
              aria-label={dict.negativeTagsGroupLabel}
              aria-describedby={showTagsError ? 'sorryTagsError' : undefined}
            >
              {NEGATIVE_TAGS.map((tag, index) => (
                <button
                  type="button"
                  key={tag.key}
                  ref={index === 0 ? firstNegativeTagRef : null}
                  className="tag"
                  aria-pressed={selectedTags.has(tag.key)}
                  onClick={() => toggleTag(tag.key, true)}
                >
                  <span className="tag-icon" aria-hidden="true">
                    <TagIcon name={tag.icon} />
                  </span>
                  <span>{dict[tag.labelKey]}</span>
                </button>
              ))}
            </div>

            <div className="comment-wrap">
              <label className="sr-only" htmlFor="sorryComment">
                {dict.commentLabel}
              </label>
              <textarea
                id="sorryComment"
                ref={sorryTextareaRef}
                className="comment"
                placeholder={dict.commentPh}
                value={commentSorry}
                onChange={(e) => setCommentSorry(e.target.value.slice(0, MAX_COMMENT))}
                maxLength={MAX_COMMENT}
              />
              <div className="comment-meta">
                <span />
                <span aria-hidden="true">{`${commentSorry.length}/${MAX_COMMENT}`}</span>
              </div>
              <p className="comment-privacy">{dict.commentPrivacy}</p>
            </div>
          </div>
          {sendError ? (
            <p role="alert" className="send-error">
              {sendError}
            </p>
          ) : null}
          <button
            type="button"
            className="btn-primary btn-full"
            onClick={submitSorry}
            disabled={sending}
            aria-busy={sending}
          >
            <span>{sending ? dict.sendRetry : dict.sendPrivate}</span>
            <svg
              className="btn-arrow"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
            <span className="btn-spinner" aria-hidden="true" />
          </button>

          <div className="contact-inline-divider">{dict.orLabel}</div>

          <button type="button" className="contact-inline" onClick={openContact}>
            <span className="contact-inline-dot" aria-hidden="true" />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>{dict.fabLabel}</span>
          </button>
        </div>

        {/* ---------------- PLATFORMS (rating 4-5, + "share publicly" bonus) ---------------- */}
        <div
          id="screenPlatforms"
          className={`screen ${isActive('platforms') ? 'active' : ''}`}
          aria-hidden={isScreenInert('platforms')}
          inert={isScreenInert('platforms')}
        >
          <div className="platforms-content">
            {/* "Last step" label only on the 5★ happy path. For a 4★ (or a
                1-3★ guest sharing publicly too) the tone stays measured — no
                step label, no presumption they were delighted. */}
            {!platformsMeasured ? (
              <>
                <div className="step-label">{dict.lastStep}</div>
                {isRating(currentRating) ? (
                  <RatingRecap rating={currentRating} caption={format(dict.youGaveStars, { n: currentRating })} />
                ) : null}
              </>
            ) : null}
            <h2
              ref={isActive('platforms') ? headingRef : null}
              className="platforms-title"
              tabIndex={-1}
            >
              {platformsMeasured ? dict.platformsTitleNeutral : dict.platformsTitle}
            </h2>
            <p className="platforms-sub">
              {platformsMeasured ? dict.platformsSubNeutral : dict.platformsSub}
            </p>

            {/* The platforms the owner configured in the dashboard, in order.
                Google/Tripadvisor get brand marks; anything else gets a clean
                generic icon. */}
            {venue.platforms.map((platform, index) => (
              <a
                key={`${platform.kind}-${platform.url}`}
                href={resolvePlatformUrl(platform).url}
                target="_blank"
                rel="noopener noreferrer"
                // The first (owner-ordered) platform is the primary CTA — given
                // visual weight so the happy guest has one obvious place to go
                // instead of a menu to choose from.
                className={`platform-card ${index === 0 ? 'platform-card-primary' : ''}`}
                data-platform={platform.kind}
                onClick={() => recordPlatformTap(platform)}
              >
                <div className="platform-icon" aria-hidden="true">
                  <PlatformIcon kind={platform.kind} />
                </div>
                <div className="platform-info">
                  <div className="platform-name">{platform.label}</div>
                  <div className="platform-action">{dict.platformCardCta}</div>
                </div>
                <span className="platform-cta" aria-hidden="true">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </span>
              </a>
            ))}

            {/* Calm nudge to beat the blank-Google-box that kills posts on the
                platform's side, where our funnel can't follow. */}
            <div className="platforms-starter">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>{dict.reviewStarterHint}</span>
            </div>

            <button type="button" className="skip" onClick={finishFromPlatforms}>
              {dict.skipReview}
            </button>
          </div>
        </div>

        {/* ---------------- SUCCESS OVERLAY ---------------- */}
        <div
          className={`success ${showSuccess ? 'show' : ''}`}
          role="status"
          aria-live="polite"
          aria-hidden={!showSuccess}
          inert={!showSuccess}
          onKeyDown={onOverlayKeyDown}
        >
          <div className="success-mark" aria-hidden="true">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="success-title" ref={successHeadingRef} tabIndex={-1}>
            {successCopy.title}
          </h2>
          <p className="success-msg">{successCopy.msg}</p>
          <div className="success-cta">
            <button
              type="button"
              className="btn-primary"
              onClick={resetApp}
              ref={successDoneRef}
            >
              <span>{dict.done}</span>
            </button>
            {showSharePublic ? (
              <button
                type="button"
                className="success-share"
                onClick={sharePublicly}
                ref={successShareRef}
              >
                <span>{dict.sharePublicAlso}</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>

        {/* ---------------- CONTACT (anonymous message) ---------------- */}
        <div
          id="screenContact"
          className={`screen contact-screen ${isActive('contact') ? 'active' : ''}`}
          aria-hidden={isScreenInert('contact')}
          inert={isScreenInert('contact')}
        >
          <div className="anon-badge">
            <span className="dot" aria-hidden="true" />
            <span>{dict.anonBadge}</span>
          </div>

          <h2
            ref={isActive('contact') ? headingRef : null}
            className="reasons-title contact-title"
            tabIndex={-1}
          >
            {dict.contactTitle}
          </h2>
          <p className="reasons-sub">{dict.contactSub}</p>
          <p className="anon-privacy-note">{dict.anonPrivacyNote}</p>

          <div className="comment-wrap" style={{ marginTop: '12px' }}>
            <label className="sr-only" htmlFor="contactComment">
              {dict.contactLabel}
            </label>
            <textarea
              id="contactComment"
              ref={contactTextareaRef}
              className="comment tall"
              placeholder={dict.contactPh}
              value={contactMessage}
              onChange={(e) => setContactMessage(e.target.value.slice(0, MAX_COMMENT))}
              maxLength={MAX_COMMENT}
            />
            <div className="comment-meta">
              <span />
              <span aria-hidden="true">{`${contactMessage.length}/${MAX_COMMENT}`}</span>
            </div>
          </div>
          {sendError ? (
            <p role="alert" className="send-error">
              {sendError}
            </p>
          ) : null}
          <button
            type="button"
            className="btn-primary btn-full"
            onClick={submitContact}
            disabled={sending || contactMessage.trim().length === 0}
            aria-busy={sending}
          >
            <span>{sending ? dict.sendRetry : dict.contactSend}</span>
            <svg
              className="btn-arrow"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
            <span className="btn-spinner" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
