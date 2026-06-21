import GuestApp from './guest-app';
import { getSupabase } from './lib/supabase';
import { DEMO_VENUE, type Platform, type VenueContext } from './lib/venue';

/**
 * Home / showcase route ("/").
 *
 * This used to render a fully hardcoded DEMO_VENUE. Now it pulls the default
 * tenant's LIVE branding (name, tagline, logo, color, routing, platforms) from
 * the token-free get_home_venue function, so whatever an owner sets in the
 * dashboard shows up here immediately — the same guest UI the per-table QR
 * route (/r/[slug]/[table]) renders.
 *
 * The table identity + capability token still come from DEMO_VENUE (the seeded
 * demo table), so submissions from "/" behave exactly as before; only the
 * branding goes live. If the DB is unreachable or unseeded, we fall back to the
 * full DEMO_VENUE rather than failing the page.
 *
 * force-dynamic: branding must reflect the latest dashboard save on every load,
 * never a build-time snapshot.
 */
export const dynamic = 'force-dynamic';

interface HomeVenueRow {
  brand_name: string;
  tagline: string | null;
  location_name: string;
  logo_url: string | null;
  brand_color: string | null;
  public_review_min_rating: number | null;
  show_name_with_logo: boolean | null;
  platforms: Platform[];
}

export default async function Home() {
  let venue: VenueContext = DEMO_VENUE;
  try {
    const { data, error } = await getSupabase().rpc('get_home_venue');
    if (error) throw error;
    const row = (data as unknown as HomeVenueRow[])?.[0];
    if (row) {
      venue = {
        ...DEMO_VENUE, // keep the demo table label + token for submissions
        brandName: row.brand_name,
        brandTag: row.tagline ?? '',
        locationName: row.location_name,
        logoUrl: row.logo_url,
        brandColor: row.brand_color,
        showNameWithLogo: row.show_name_with_logo ?? false,
        platforms:
          Array.isArray(row.platforms) && row.platforms.length > 0
            ? row.platforms
            : DEMO_VENUE.platforms,
        publicReviewMinRating: row.public_review_min_rating ?? 5,
      };
    }
  } catch (e) {
    // Unconfigured/unreachable DB → keep the static demo rather than 500.
    console.error('[/] get_home_venue failed, using demo venue:', (e as Error).message);
  }

  return <GuestApp venue={venue} />;
}
