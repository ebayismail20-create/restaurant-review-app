import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import type { Database } from '../database.types';

/**
 * Cookie-aware server Supabase client for the manager dashboard. Reads the
 * session from request cookies so RLS sees the logged-in manager (auth.uid())
 * and scopes queries to their tenant. Create a fresh one per request.
 *
 * Separate from lib/supabase.ts (getSupabase): that one is the anon,
 * session-less client the guest API route uses to call submit_review. This
 * one carries the manager's auth session.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll from a Server Component is a no-op; the proxy refreshes
            // the session cookie on every request instead.
          }
        },
      },
    },
  );
}
