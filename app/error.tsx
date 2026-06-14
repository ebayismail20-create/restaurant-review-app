'use client';

import { useEffect, useState } from 'react';

import { captureException } from './lib/sentry';

/**
 * Segment-level error boundary. Rendered when any descendant in the route
 * tree throws during render or in an effect. The root layout still renders
 * around this — body, fonts, globals.css are all available — so we can
 * use brand classes directly. Catastrophic failures that take out the
 * layout itself fall through to global-error.tsx instead.
 *
 * Translation strategy:
 *   We do NOT import app/lib/dictionaries.ts here because that module is
 *   a plausible source of the very error we're catching (e.g. a typo in a
 *   key would surface here). The mini-dict below is enough for the three
 *   lines an error page actually needs and keeps this file self-sufficient.
 *
 * Logging:
 *   In dev we console.error so the failure shows up in the terminal Next
 *   prints. In prod we leave a hook for Phase 5's Sentry integration —
 *   `error.digest` is the stable fingerprint Next assigns at build time
 *   so the same crash deduplicates cleanly across reports.
 */

type Lang = 'en' | 'fi' | 'sv';

const ERROR_DICT: Record<Lang, {
  title: string;
  body: string;
  cta: string;
  ref: string;
}> = {
  en: {
    title: 'Something interrupted\nyour visit.',
    body: "Don't worry — your feedback wasn't sent yet. Try again, or wave a server over and we'll take it directly.",
    cta: 'Try again',
    ref: 'Reference',
  },
  fi: {
    title: 'Jokin keskeytti\nvierailusi.',
    body: 'Ei hätää — palautteesi ei vielä lähtenyt. Yritä uudelleen tai pyydä tarjoilija paikalle, niin otamme palautteesi suoraan vastaan.',
    cta: 'Yritä uudelleen',
    ref: 'Viite',
  },
  sv: {
    title: 'Något avbröt\nditt besök.',
    body: 'Oroa dig inte — din feedback skickades inte än. Försök igen, eller vinka åt en servitör så tar vi emot den direkt.',
    cta: 'Försök igen',
    ref: 'Referens',
  },
};

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [lang, setLang] = useState<Lang>('en');

  // Language priority matches page.tsx: the guest's explicit in-app choice
  // (persisted to localStorage) wins over navigator.language. A Finn who
  // tapped FI should not get an English error page just because their
  // phone OS is set to en-US. Same one-shot setState pattern as page.tsx —
  // we can't read navigator/localStorage during render without risking a
  // hydration mismatch.
  useEffect(() => {
    let candidate: string | null = null;
    try {
      candidate = window.localStorage.getItem('bistro-lang');
    } catch { /* privacy mode */ }
    if (!candidate && typeof navigator !== 'undefined') {
      candidate = (navigator.language || '').slice(0, 2).toLowerCase();
    }
    if (candidate === 'fi' || candidate === 'sv') {
      // Intentional one-shot setState — see comment block above.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLang(candidate);
    }
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[app/error]', error);
    }
    captureException(error, { tags: { boundary: 'segment' }, extra: { digest: error.digest } });
  }, [error]);

  const t = ERROR_DICT[lang];

  return (
    <div className="error-shell" role="alert">
      <h1 className="rating-title" tabIndex={-1}>
        {t.title}
      </h1>
      <p className="reasons-sub">{t.body}</p>
      <button type="button" className="btn-primary" onClick={reset}>
        {t.cta}
      </button>
      {error.digest ? (
        <p className="error-digest" aria-label={`${t.ref}: ${error.digest}`}>
          {t.ref}: {error.digest}
        </p>
      ) : null}
    </div>
  );
}
