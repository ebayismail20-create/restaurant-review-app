// Venue context. Populated server-side from the dynamic route
// /r/[slug]/[table]?t=token (see app/r/[slug]/[table]/page.tsx), or the
// DEMO_VENUE default on the bare "/" route. Everything the guest UI shows
// about the venue comes from here, so the same component serves any tenant.

/** Review platforms an owner can configure (in the dashboard). */
export type PlatformKind =
  | 'google'
  | 'tripadvisor'
  | 'yelp'
  | 'facebook'
  | 'opentable'
  | 'instagram'
  | 'website'
  | 'other';

export interface Platform {
  kind: PlatformKind;
  label: string; // display name, e.g. "Google" or a custom "Our Instagram"
  url: string;   // the owner-supplied review link
}

export interface VenueContext {
  tenantId: string;       // stable slug used for DB lookups (matches tenants.slug)
  brandName: string;      // venue name shown in the header (e.g. "Bistro Nordic")
  brandTag: string;       // tagline under the name (e.g. "Fine dining · Helsinki")
  locationName: string;   // longer display name, used in submission context
  tableNumber: string;    // display label for the table (matches tables.label)
  // Branding the owner sets in the dashboard. Null → the guest app falls back
  // to the plain brand-name treatment / mood-theme accent.
  logoUrl: string | null;
  brandColor: string | null; // hex; tints the monogram tile when no logo image
  // When a logo image is set, also show the text venue name beneath it. Default
  // false (the logo is usually the wordmark, so the name would be redundant).
  // An owner whose logo is an icon flips this on so guests still see the name.
  // Ignored when there's no logo — the name always shows in that case.
  showNameWithLogo: boolean;
  // Logo frame shape the owner picked: 'plate' (rounded card with a gold
  // hairline) or 'round' (circular badge). Only affects how a logo is framed.
  logoShape: 'plate' | 'round';
  // Per-table capability token. In production this rides in the QR URL and
  // is rendered into the page server-side; the guest's browser is meant to
  // hold it. It is NOT a server secret — it only authorizes posting AS this
  // one table, and is revocable/rotatable per table.
  tableToken: string;
  // The review platforms this venue chose to show, in display order. Empty is
  // valid (a venue that only collects private feedback).
  platforms: Platform[];
  // Lowest star rating routed to the PUBLIC review screen. 5 (default) = only
  // 5★ guests are invited publicly (3-4★ → private). An owner can set 4 in the
  // dashboard to also send satisfied 4★ guests public. 1-3★ always stay
  // private regardless, so the public option is never gated from unhappy guests.
  publicReviewMinRating: number;
}

/** Shape returned by the get_venue DB function (one row when token matches). */
export interface VenueRow {
  brand_name: string;
  tagline: string | null;
  location_name: string;
  logo_url: string | null;
  brand_color: string | null;
  server_name: string | null;
  public_review_min_rating: number | null;
  show_name_with_logo: boolean | null;
  logo_shape: string | null;
  platforms: Platform[]; // jsonb array from the function
}

/**
 * Map a get_venue row + the URL coordinates into a VenueContext. The slug,
 * table label, and token come from the request (not the DB row), since they
 * are the caller's coordinates; everything else is venue data.
 */
export function venueFromRow(
  row: VenueRow,
  slug: string,
  tableLabel: string,
  token: string,
): VenueContext {
  return {
    tenantId: slug,
    brandName: row.brand_name,
    brandTag: row.tagline ?? '',
    locationName: row.location_name,
    tableNumber: tableLabel,
    logoUrl: row.logo_url,
    brandColor: row.brand_color,
    showNameWithLogo: row.show_name_with_logo ?? false,
    logoShape: row.logo_shape === 'round' ? 'round' : 'plate',
    tableToken: token,
    platforms: Array.isArray(row.platforms) ? row.platforms : [],
    // Default to 5 (original behaviour) if the column is somehow absent.
    publicReviewMinRating: row.public_review_min_rating ?? 5,
  };
}

/**
 * Safety net for unconfigured platforms: if a review URL still contains the
 * PLACEHOLDER marker at click time, the guest is sent to the platform's home
 * page instead of a 404. Real owner-supplied links never match, so they pass
 * through untouched. openPlatform() resolves this and notes it for devs.
 */
const PLATFORM_HOME: Partial<Record<PlatformKind, string>> = {
  google: 'https://www.google.com/maps',
  tripadvisor: 'https://www.tripadvisor.com',
  yelp: 'https://www.yelp.com',
  facebook: 'https://www.facebook.com',
  opentable: 'https://www.opentable.com',
  instagram: 'https://www.instagram.com',
};

/** Resolve a platform's outbound URL, falling back if it's an unconfigured placeholder. */
export function resolvePlatformUrl(p: Platform): { url: string; placeholder: boolean } {
  if (p.url.includes('PLACEHOLDER')) {
    return { url: PLATFORM_HOME[p.kind] ?? 'https://www.google.com', placeholder: true };
  }
  return { url: p.url, placeholder: false };
}

// Default venue for the bare "/" route — the single-venue demo. Real tenants
// arrive through /r/[slug]/[table] and never touch this.
export const DEMO_VENUE: VenueContext = {
  tenantId: 'bistro-nordic',
  brandName: 'Bistro Nordic',
  brandTag: 'Fine dining · Helsinki',
  locationName: 'Bistro Nordic · Helsinki',
  tableNumber: '12',
  logoUrl: null,
  // Demo brand color → a burgundy "B" monogram. A real tenant sets its own
  // (or uploads a logo) in the dashboard.
  brandColor: '#6B1F2A',
  showNameWithLogo: false,
  logoShape: 'plate',
  // Seeded table token, supplied via env so the secret stays out of git.
  // Empty in environments that haven't configured it → submissions fail
  // closed (403) rather than silently succeeding.
  tableToken: process.env.NEXT_PUBLIC_DEMO_TABLE_TOKEN ?? '',
  // Placeholders — in production these are real, owner-configured links.
  platforms: [
    { kind: 'google', label: 'Google', url: 'https://search.google.com/local/writereview?placeid=PLACEHOLDER' },
    { kind: 'tripadvisor', label: 'Tripadvisor', url: 'https://www.tripadvisor.com/UserReviewEdit-PLACEHOLDER' },
  ],
  // Original behaviour: only 5★ are invited to a public review.
  publicReviewMinRating: 5,
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
