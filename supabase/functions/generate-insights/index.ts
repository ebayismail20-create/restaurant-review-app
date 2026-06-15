// generate-insights: turn a venue's guest feedback into owner-ready insight
// (top strengths + improvement areas with concrete actions) using Claude.
//
// Invoked from the dashboard with the owner's session. Authorizes via the
// caller's JWT (current_tenant_ids), reads that tenant's feedback with the
// service-role key, calls the Anthropic API, and caches the result in
// ai_insights. Gated on ANTHROPIC_API_KEY — absent → returns {configured:false}
// so the dashboard degrades cleanly (same pattern as the notification providers).
//
// Secret: ANTHROPIC_API_KEY (required). Optional: ANTHROPIC_MODEL.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });

const TAG_LABELS: Record<string, string> = {
  food: 'Food', wait: 'Wait time', service: 'Service', clean: 'Cleanliness',
  ambiance: 'Ambiance', value: 'Value',
  food_bad: 'Food quality', service_bad: 'Poor service', wait_bad: 'Long wait',
  clean_bad: 'Not clean', price_bad: 'Overpriced', other_bad: 'Other',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  // Authorize: who is calling, and which tenant(s) do they own?
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return json({ error: 'unauthorized' }, 401);

  const { data: tenantIds } = await userClient.rpc('current_tenant_ids');
  const tenantId = Array.isArray(tenantIds) ? tenantIds[0] : null;
  if (!tenantId) return json({ error: 'no_tenant' }, 403);

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) {
    return json({
      configured: false,
      message: 'Set ANTHROPIC_API_KEY on this Edge Function to enable AI insights.',
    });
  }

  // Read the tenant's recent feedback with the service-role key.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data: subs } = await admin
    .from('submissions')
    .select('rating, tag_keys, message, created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(150);

  const rows = subs ?? [];
  if (rows.length === 0) return json({ error: 'no_data', message: 'No feedback yet to analyze.' });

  const rated = rows.filter((r) => r.rating != null);
  const avg = rated.length ? (rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length).toFixed(2) : 'n/a';
  const lines = rows
    .map((r) => {
      const tags = (r.tag_keys ?? []).map((k: string) => TAG_LABELS[k] ?? k).join(', ');
      return `- ${r.rating ?? '-'}★ [${tags || 'no tags'}]${r.message ? ` "${String(r.message).slice(0, 200)}"` : ''}`;
    })
    .join('\n');

  const system =
    'You are a seasoned restaurant operations analyst. From guest feedback, extract the most useful, concrete strengths and improvement areas. Be specific and actionable — reference what guests actually said and suggest realistic operational changes. Respond with ONLY valid JSON (no markdown, no prose) matching exactly: {"summary": string, "sentiment": "improving"|"steady"|"declining", "strengths": [{"title": string, "detail": string}], "improvements": [{"title": string, "detail": string, "action": string}]}. Up to 3 strengths and up to 3 improvements, ordered by importance.';
  const userMsg = `Venue feedback, last 90 days. Total ${rows.length}, average rating ${avg}/5.\n\n${lines}`;

  const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-6';
  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 1024, system, messages: [{ role: 'user', content: userMsg }] }),
  });
  if (!aiRes.ok) return json({ error: 'ai_error', detail: (await aiRes.text()).slice(0, 300) }, 502);

  const aiJson = await aiRes.json();
  const text = (aiJson?.content?.[0]?.text ?? '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    return json({ error: 'parse_error', raw: text.slice(0, 300) }, 502);
  }

  const { data: inserted, error: insErr } = await admin
    .from('ai_insights')
    .insert({ tenant_id: tenantId, window_days: 90, model, data: parsed, created_by: userId })
    .select('id, generated_at, window_days, model, data')
    .single();
  if (insErr) return json({ error: 'store_error', detail: insErr.message }, 500);

  return json({ configured: true, insight: inserted });
});
