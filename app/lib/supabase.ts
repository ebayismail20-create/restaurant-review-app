import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

/**
 * Server-side Supabase client, created lazily on first use.
 *
 * Uses the PUBLISHABLE (anon) key on purpose, not the service-role key:
 *   - The only thing the anon role is granted is EXECUTE on the
 *     `submit_review` SECURITY DEFINER function. It can read/write no table
 *     directly (RLS is deny-all). So even though this key is public-safe,
 *     a leak buys an attacker nothing beyond what the public form already
 *     allows — and we never ship the dangerous service-role secret.
 *   - All authority (token check, tenant resolution, priority derivation)
 *     lives inside the database function, so the client privilege level is
 *     irrelevant to correctness.
 *
 * Lazy init matters: `next build` imports the API route to collect it, but a
 * build must not require live credentials. We validate env on first request,
 * not at module load, so CI can build without secrets while a real request
 * without config fails loudly.
 *
 * This module must only be imported from server code (the API route): it
 * reads non-NEXT_PUBLIC env vars.
 */

let client: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase is not configured: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY. ' +
        'See .env.example.',
    );
  }

  client = createClient<Database>(url, key, {
    auth: {
      // No user sessions: this is an anonymous, server-to-database client.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return client;
}
