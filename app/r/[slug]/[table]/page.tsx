import { notFound } from 'next/navigation';

import RestaurantReviewApp from '../../../guest-app';
import { getSupabase } from '../../../lib/supabase';
import { venueFromRow, type VenueRow } from '../../../lib/venue';

/**
 * Multi-tenant entry point: /r/[slug]/[table]?t=<token>
 *
 * The QR code printed for each physical table encodes this URL with the
 * table's unguessable token. We resolve the venue server-side via the
 * token-gated get_venue function (RLS stays deny-all; a wrong/guessed URL
 * returns no row → 404), then hand a fully-populated VenueContext to the
 * same guest flow that powers the demo "/" route.
 *
 * Security note: the token lives in the URL on purpose — that's the
 * physical-presence proof. Someone who didn't scan the table's code doesn't
 * have it, so they can neither see the venue nor post as that table.
 */
export default async function VenuePage({
  params,
  searchParams,
}: PageProps<'/r/[slug]/[table]'>) {
  const { slug, table } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === 'string' ? sp.t : '';
  if (!token) notFound();

  let rows: VenueRow[] | null = null;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('get_venue', {
      p_slug: slug,
      p_table_label: table,
      p_token: token,
    });
    if (error) throw error;
    // platforms comes back as Json from the RPC; VenueRow types it as
    // Platform[] (its actual shape), so cast through unknown.
    rows = data as unknown as VenueRow[];
  } catch (e) {
    // Misconfiguration (no Supabase env) or transport failure. Don't expose
    // internals to the guest — a 404 is the honest "this code didn't resolve".
    console.error('[r/[slug]/[table]] get_venue failed:', (e as Error).message);
    notFound();
  }

  if (!rows || rows.length === 0) notFound();

  const venue = venueFromRow(rows[0], slug, table, token);
  return <RestaurantReviewApp venue={venue} />;
}
