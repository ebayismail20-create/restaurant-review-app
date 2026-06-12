import type { MetadataRoute } from 'next';

/**
 * The review app is an on-table QR destination, not a public website.
 * Per-table URLs must never appear in search results, so the whole origin
 * is disallowed. The venue's marketing presence (and the Google Business
 * Profile this app funnels reviews to) is the indexable surface — not this.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}
