import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '../database.types';

/**
 * Browser Supabase client for the MANAGER dashboard only. Uses the public
 * NEXT_PUBLIC_* env (safe to ship: it's the anon/publishable key). The guest
 * flow does NOT use this — guests never talk to Supabase from the browser.
 *
 * createBrowserClient is a singleton internally, so calling this repeatedly
 * is cheap.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
