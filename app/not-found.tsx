'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * 404 page. Common cause: a QR code was printed with the wrong slug or
 * table number, or someone typed the URL by hand and made a mistake.
 * Steer the guest to staff first; offer a back-to-start as a fallback.
 *
 * Same translation pattern as error.tsx — inline mini-dict, navigator
 * locale detection client-side. Kept independent of app/lib/dictionaries
 * so a 404 surface stays robust even if that module mis-exports.
 */

type Lang = 'en' | 'fi' | 'sv';

const NOT_FOUND_DICT: Record<Lang, { title: string; body: string; cta: string }> = {
  en: {
    title: "We couldn't\nfind that table.",
    body: 'The QR code might be from another venue, or the link was mistyped. Ask a staff member to scan again.',
    cta: 'Back to start',
  },
  fi: {
    title: 'Pöytää ei\nlöytynyt.',
    body: 'QR-koodi saattaa olla toiselta paikalta tai linkki on kirjoitettu väärin. Pyydä henkilökuntaa skannaamaan uudelleen.',
    cta: 'Aloita alusta',
  },
  sv: {
    title: 'Vi hittade\ninte bordet.',
    body: 'QR-koden kan vara från ett annat ställe, eller så är länken felskriven. Be personalen att skanna igen.',
    cta: 'Tillbaka till början',
  },
};

export default function NotFound() {
  const [lang, setLang] = useState<Lang>('en');

  // Language priority matches page.tsx and error.tsx: the guest's explicit
  // in-app choice (localStorage) wins over navigator.language. One-shot
  // setState on mount to avoid hydration mismatches.
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

  const t = NOT_FOUND_DICT[lang];

  return (
    <div className="error-shell" role="alert">
      <h1 className="rating-title" tabIndex={-1}>
        {t.title}
      </h1>
      <p className="reasons-sub">{t.body}</p>
      <Link href="/" className="btn-primary">
        {t.cta}
      </Link>
    </div>
  );
}
