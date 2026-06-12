import { describe, expect, it } from 'vitest';

import { format, i18n } from '../app/lib/dictionaries';
import { isLang, isRating } from '../app/lib/types';
import { DEMO_VENUE, PLATFORM_FALLBACK_URLS, createSessionId } from '../app/lib/venue';

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
      expect(i18n[lang].tableChip).toContain('{table}');
      expect(i18n[lang].tableChip).toContain('{server}');
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

describe('venue config', () => {
  it('provides a fallback URL for every platform', () => {
    for (const key of Object.keys(DEMO_VENUE.platformUrls) as Array<
      keyof typeof DEMO_VENUE.platformUrls
    >) {
      expect(PLATFORM_FALLBACK_URLS[key]).toMatch(/^https:\/\//);
      expect(PLATFORM_FALLBACK_URLS[key]).not.toContain('PLACEHOLDER');
    }
  });

  it('createSessionId returns unique UUID-shaped ids', () => {
    const a = createSessionId();
    const b = createSessionId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
