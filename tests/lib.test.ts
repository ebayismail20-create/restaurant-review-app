import { describe, expect, it } from 'vitest';

import { format, i18n } from '../app/lib/dictionaries';
import { isLang, isRating } from '../app/lib/types';
import {
  DEMO_VENUE,
  createSessionId,
  resolvePlatformUrl,
  venueFromRow,
  type VenueRow,
} from '../app/lib/venue';

describe('type guards', () => {
  it('isRating accepts exactly 1-5', () => {
    expect(isRating(1)).toBe(true);
    expect(isRating(5)).toBe(true);
    expect(isRating(0)).toBe(false);
    expect(isRating(6)).toBe(false);
    expect(isRating(null)).toBe(false);
    expect(isRating(undefined)).toBe(false);
    expect(isRating(3.5)).toBe(false);
  });

  it('isLang accepts exactly en/fi/sv', () => {
    expect(isLang('en')).toBe(true);
    expect(isLang('fi')).toBe(true);
    expect(isLang('sv')).toBe(true);
    expect(isLang('de')).toBe(false);
    expect(isLang('')).toBe(false);
    expect(isLang(null)).toBe(false);
  });
});

describe('i18n dictionaries', () => {
  const langs = Object.keys(i18n) as Array<keyof typeof i18n>;
  const referenceKeys = Object.keys(i18n.en).sort();

  it('covers en, fi, sv', () => {
    expect(langs.sort()).toEqual(['en', 'fi', 'sv']);
  });

  it.each(langs)('%s has every key, every value non-empty', (lang) => {
    const dict = i18n[lang];
    expect(Object.keys(dict).sort()).toEqual(referenceKeys);
    for (const [key, value] of Object.entries(dict)) {
      expect(value, `${lang}.${key} must be a non-empty string`).toBeTypeOf('string');
      expect(value.length, `${lang}.${key} must not be empty`).toBeGreaterThan(0);
    }
  });

  it('templated keys keep their placeholders in every language', () => {
    for (const lang of langs) {
      expect(i18n[lang].starAriaLabel).toContain('{n}');
      expect(i18n[lang].tagsSelectedAnnouncement).toContain('{n}');
    }
  });
});

describe('format()', () => {
  it('replaces known placeholders', () => {
    expect(format('Table {table} · Server: {server}', { table: '12', server: 'Anna' })).toBe(
      'Table 12 · Server: Anna',
    );
  });

  it('leaves unknown placeholders visible for QA', () => {
    expect(format('Hello {missing}', {})).toBe('Hello {missing}');
  });

  it('stringifies numbers', () => {
    expect(format('{n} selected', { n: 3 })).toBe('3 selected');
  });
});

describe('resolvePlatformUrl', () => {
  it('passes real owner links through untouched', () => {
    const r = resolvePlatformUrl({ kind: 'google', label: 'Google', url: 'https://g.example/r' });
    expect(r).toEqual({ url: 'https://g.example/r', placeholder: false });
  });

  it('falls back to a real home page for unconfigured PLACEHOLDER links', () => {
    const r = resolvePlatformUrl({
      kind: 'tripadvisor',
      label: 'Tripadvisor',
      url: 'https://www.tripadvisor.com/UserReviewEdit-PLACEHOLDER',
    });
    expect(r.placeholder).toBe(true);
    expect(r.url).toMatch(/^https:\/\//);
    expect(r.url).not.toContain('PLACEHOLDER');
  });
});

describe('venue config', () => {
  it('createSessionId returns unique UUID-shaped ids', () => {
    const a = createSessionId();
    const b = createSessionId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('DEMO_VENUE ships a platforms array', () => {
    expect(Array.isArray(DEMO_VENUE.platforms)).toBe(true);
    expect(DEMO_VENUE.platforms.length).toBeGreaterThan(0);
  });
});

describe('venueFromRow', () => {
  const row: VenueRow = {
    brand_name: 'Cafe Aalto',
    tagline: 'Bakery · Turku',
    location_name: 'Cafe Aalto · Turku',
    logo_url: null,
    brand_color: '#123456',
    server_name: 'Eero',
    public_review_min_rating: 5,
    show_name_with_logo: false,
    platforms: [
      { kind: 'google', label: 'Google', url: 'https://g.example/review' },
      { kind: 'yelp', label: 'Yelp', url: 'https://yelp.example/review' },
    ],
  };

  it('maps a DB row + URL coordinates into a VenueContext', () => {
    const v = venueFromRow(row, 'cafe-aalto', '5', 'tok123');
    expect(v).toMatchObject({
      tenantId: 'cafe-aalto',
      brandName: 'Cafe Aalto',
      brandTag: 'Bakery · Turku',
      tableNumber: '5',
      tableToken: 'tok123',
      brandColor: '#123456',
      logoUrl: null,
    });
    expect(v.platforms).toHaveLength(2);
    expect(v.platforms[0]).toEqual({ kind: 'google', label: 'Google', url: 'https://g.example/review' });
  });

  it('tolerates a null tagline and a missing platforms array', () => {
    const v = venueFromRow(
      { ...row, tagline: null, server_name: null, platforms: undefined as never },
      's',
      '1',
      't',
    );
    expect(v.brandTag).toBe('');
    expect(v.platforms).toEqual([]);
  });
});
