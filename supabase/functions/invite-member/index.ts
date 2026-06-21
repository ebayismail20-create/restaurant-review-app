// invite-member: owner invites a teammate to the dashboard by email.
//
// Invoked from the dashboard with the owner's session. Authorizes via the
// caller's JWT (they must own a tenant), records the invite + role through the
// owner-gated add_team_member RPC, and — for a brand-new email — creates the
// account and sends Supabase's invite email with the service-role key (admin
// API), which never touches the browser. When the invitee clicks the link and
// sets a password, their email is confirmed and the claim trigger turns the
// pending invite into membership with the role chosen here.
//
// No extra secrets required: SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY are injected automatically. Optional: DASHBOARD_URL
// (fallback redirect target when the request has no Origin).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });

const ROLES = new Set(['owner', 'manager', 'staff']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  let body: { email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const email = (body.email ?? '').trim().toLowerCase();
  const role = body.role ?? 'staff';
  if (!EMAIL_RE.test(email)) return json({ error: 'invalid_email' }, 400);
  if (!ROLES.has(role)) return json({ error: 'invalid_role' }, 400);

  // Authorize: who is calling, and which tenant do they own?
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: 'unauthorized' }, 401);

  const { data: ownerTenants } = await userClient.rpc('current_owner_tenant_ids');
  const tenantId = Array.isArray(ownerTenants) ? ownerTenants[0] : null;
  if (!tenantId) return json({ error: 'not_authorized' }, 403);

  // Record the invite + role through the owner-gated RPC. Returns 'added' when
  // the email already has an account (immediate member, no email needed) or
  // 'invited' when it's new (a pending invite we now email).
  const { data: outcome, error: rpcErr } = await userClient.rpc('add_team_member', {
    p_tenant_id: tenantId,
    p_email: email,
    p_role: role,
  });
  if (rpcErr) return json({ error: rpcErr.message }, 400);

  if (outcome === 'added') {
    // They already had a Loop login; they now have access. Nothing to send.
    return json({ status: 'added' });
  }

  // New email → create the account and send the invite. The pending invite row
  // (just written by add_team_member) is claimed once they confirm.
  const venueName = await venueNameFor(url, serviceKey, tenantId);
  const redirectTo = req.headers.get('origin') ?? Deno.env.get('DASHBOARD_URL') ?? undefined;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { role, tenant_id: tenantId, venue_name: venueName, invited_by: userData.user.email },
    redirectTo,
  });
  if (invErr) {
    // e.g. SMTP not configured, or a race where the email already exists.
    return json({ status: 'invited_no_email', warning: invErr.message });
  }
  return json({ status: 'invited' });
});

async function venueNameFor(url: string, serviceKey: string, tenantId: string): Promise<string | null> {
  try {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data } = await admin.from('tenants').select('name').eq('id', tenantId).single();
    return data?.name ?? null;
  } catch {
    return null;
  }
}
