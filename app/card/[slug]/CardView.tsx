'use client';

import { useCallback } from 'react';

interface Platform {
  kind: string;
  label: string;
  url: string;
}
interface Card {
  brand_name: string;
  tagline: string | null;
  location_name: string | null;
  logo_url: string | null;
  brand_color: string | null;
  platforms: Platform[];
}

/**
 * The venue "digital business card" — a public, shareable page meant to live on
 * an NFC card or QR sticker. Branding + one-tap links to leave a public review,
 * plus a "Save contact" vCard. (Distinct from the on-table review QR, which
 * carries a per-table token; this card is a marketing/contact artifact and
 * sends straight to the public review pages.)
 */
/** Pick black or white for readable text on a given hex background (WCAG-ish). */
function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return L > 0.45 ? '#2a1418' : '#ffffff';
}

export function CardView({ card, cardUrl }: { card: Card; cardUrl: string }) {
  const accent = card.brand_color || '#6B1F2A';
  const onAccent = readableOn(accent);
  const platforms = Array.isArray(card.platforms) ? card.platforms : [];

  const saveContact = useCallback(() => {
    const esc = (s: string) => s.replace(/[\n,;\\]/g, (m) => '\\' + m);
    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${esc(card.brand_name)}`,
      `ORG:${esc(card.brand_name)}`,
      card.tagline ? `TITLE:${esc(card.tagline)}` : '',
      card.location_name ? `ADR;TYPE=WORK:;;${esc(card.location_name)};;;;` : '',
      `URL:${cardUrl}`,
      card.tagline ? `NOTE:${esc(card.tagline)}` : '',
      'END:VCARD',
    ].filter(Boolean).join('\r\n');
    const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${card.brand_name.replace(/[^\w]+/g, '-').toLowerCase()}.vcf`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [card, cardUrl]);

  return (
    <div className="card-page" style={{ ['--accent' as string]: accent, ['--on-accent' as string]: onAccent }}>
      <main className="card-shell">
        <div className="card-brandmark">
          {card.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.logo_url} alt={card.brand_name} />
          ) : (
            <span className="card-monogram" style={{ background: accent }}>{card.brand_name.charAt(0)}</span>
          )}
        </div>

        <h1 className="card-name">{card.brand_name}</h1>
        {card.tagline ? <p className="card-tagline">{card.tagline}</p> : null}
        {card.location_name ? <p className="card-location">{card.location_name}</p> : null}

        {platforms.length ? (
          <>
            <div className="card-divider"><span>Leave a review</span></div>
            <div className="card-actions">
              {platforms.map((p) => (
                <a key={`${p.kind}-${p.url}`} className="card-btn" href={p.url} target="_blank" rel="noopener noreferrer" data-kind={p.kind}>
                  <span>{p.label}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </a>
              ))}
            </div>
          </>
        ) : null}

        <button className="card-save" onClick={saveContact}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /><path d="M19 8v6M22 11h-6" />
          </svg>
          Save contact
        </button>

        <p className="card-footer">Powered by Loop</p>
      </main>
    </div>
  );
}
