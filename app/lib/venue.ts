// Venue context. In Phase 1.2 this will be populated from a dynamic route
// /r/[slug]/[table]/[server?] and fetched server-side. For now it's a typed
// default that we can trace and replace.

export interface VenueContext {
  tenantId: string;       // stable slug used for DB lookups
  locationName: string;   // display name
  tableNumber: string;    // display label for the table
  serverName: string;     // display label for the server
  // Brand-specific config will live here in Phase 1.2 (review links, colors, etc.)
  platformUrls: {
    google: string;       // full Google "write a review" URL for this venue
    tripadvisor: string;  // Tripadvisor write-review URL
  };
}

/**
 * Safety net for unconfigured tenants: if a platform URL still contains the
 * PLACEHOLDER marker at click time, the guest is sent to the platform's home
 * page instead of a 404. openPlatform() logs the misconfiguration so it
 * surfaces in monitoring, but the guest experience degrades gracefully.
 */
export const PLATFORM_FALLBACK_URLS: VenueContext['platformUrls'] = {
  google: 'https://www.google.com/maps',
  tripadvisor: 'https://www.tripadvisor.com',
};

// TODO(phase-1.2): remove this default when dynamic routing lands.
// Right now it's the demo-only Bistro Nordic config so existing screens render.
export const DEMO_VENUE: VenueContext = {
  tenantId: 'bistro-nordic',
  locationName: 'Bistro Nordic · Helsinki',
  tableNumber: '12',
  serverName: 'Anna',
  platformUrls: {
    // These are placeholders — in production these must be real venue-specific URLs.
    // Google: https://search.google.com/local/writereview?placeid=<PLACE_ID>
    google: 'https://search.google.com/local/writereview?placeid=PLACEHOLDER',
    tripadvisor: 'https://www.tripadvisor.com/UserReviewEdit-PLACEHOLDER',
  },
};


/**
 * Generate a fresh, cryptographically-random session ID for a submission.
 * Called at submit time, not at module load. Safe under concurrent guests.
 */
export function createSessionId(): string {
  // crypto.randomUUID is available in all evergreen browsers and Node 19+.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for the rare ancient browser — still crypto-random via getRandomValues.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
