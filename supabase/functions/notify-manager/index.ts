// notify-manager: delivers a queued manager alert for one submission.
//
// Invoked server-side by the Next API route after a manager-facing
// submission. Runs with the service-role key Supabase injects automatically,
// so it can read the submission and update the notifications log past RLS —
// none of that privilege ever touches the Next app.
//
// Abuse-safe: it only acts on a genuinely PENDING email notification for the
// given submission, and always sends to the tenant's stored manager_email
// (a caller cannot redirect the alert or forge content). Re-invoking for an
// already-sent submission is a no-op.
//
// Real delivery needs a RESEND_API_KEY function secret. Without it, the
// notification is recorded 'failed' with a clear reason — the pipeline still
// runs and stays observable.
//
// Deploy: supabase functions deploy notify-manager   (or via the MCP).
// Secrets: RESEND_API_KEY (required for delivery), NOTIFY_FROM (optional).
import { createClient } from 'jsr:@supabase/supabase-js@2';

type Payload = { submission_id?: string };

const TAG_LABELS: Record<string, string> = {
  food: 'Food', wait: 'Wait time', service: 'Service', clean: 'Cleanliness',
  ambiance: 'Ambiance', value: 'Value',
  food_bad: 'Food quality', service_bad: 'Poor service', wait_bad: 'Long wait',
  clean_bad: 'Not clean', price_bad: 'Overpriced', other_bad: 'Other',
};

const KIND_HEADLINE: Record<string, string> = {
  alerted: 'Urgent: a guest needs attention',
  private: 'New private feedback',
  'anon-message': 'Anonymous message to the manager',
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const submissionId = payload.submission_id;
  if (!submissionId) return json({ error: 'missing_submission_id' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Only a genuinely pending email alert for this submission is actionable.
  const { data: note } = await admin
    .from('notifications')
    .select('id, status')
    .eq('submission_id', submissionId)
    .eq('channel', 'email')
    .eq('status', 'pending')
    .maybeSingle();
  if (!note) return json({ ok: true, skipped: 'no_pending_notification' });

  const fail = async (reason: string) => {
    await admin.from('notifications').update({ status: 'failed', error: reason }).eq('id', note.id);
    return json({ ok: false, error: reason });
  };

  // Load the submission + its tenant/table for routing + content.
  const { data: sub } = await admin
    .from('submissions')
    .select('kind, rating, tag_keys, message, language, created_at, tenant_id, table_id')
    .eq('id', submissionId)
    .maybeSingle();
  if (!sub) return await fail('submission_not_found');

  const { data: tenant } = await admin
    .from('tenants')
    .select('name, manager_email, manager_name')
    .eq('id', sub.tenant_id)
    .maybeSingle();
  if (!tenant?.manager_email) return await fail('no_manager_email');

  let tableLabel = '-';
  if (sub.table_id) {
    const { data: tbl } = await admin.from('tables').select('label').eq('id', sub.table_id).maybeSingle();
    if (tbl?.label) tableLabel = tbl.label;
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) return await fail('no_email_provider_configured');

  // Compose.
  const stars = sub.rating ? '★'.repeat(sub.rating) + '☆'.repeat(5 - sub.rating) : '—';
  const tags = (sub.tag_keys ?? []).map((k: string) => TAG_LABELS[k] ?? k).join(', ') || '—';
  const headline = KIND_HEADLINE[sub.kind] ?? 'New guest feedback';
  const urgent = sub.kind === 'alerted' || sub.kind === 'anon-message';
  const subject = `${urgent ? '🔴 ' : ''}${headline} — Table ${tableLabel} · ${tenant.name}`;
  const safe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#2A1418">
      <h2 style="font-size:18px;margin:0 0 4px">${safe(headline)}</h2>
      <p style="color:#8a7a6e;margin:0 0 16px;font-size:13px">${safe(tenant.name)} · Table ${safe(tableLabel)} · ${new Date(sub.created_at).toLocaleString()}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#8a7a6e;width:90px">Rating</td><td style="padding:6px 0;color:#C9A961;font-size:16px">${stars}</td></tr>
        <tr><td style="padding:6px 0;color:#8a7a6e">Topics</td><td style="padding:6px 0">${safe(tags)}</td></tr>
        <tr><td style="padding:6px 0;color:#8a7a6e;vertical-align:top">Message</td><td style="padding:6px 0">${sub.message ? safe(sub.message) : '<em style=\"color:#8a7a6e\">(no message)</em>'}</td></tr>
        <tr><td style="padding:6px 0;color:#8a7a6e">Language</td><td style="padding:6px 0">${safe(sub.language)}</td></tr>
      </table>
    </div>`;
  const text = `${headline}\n${tenant.name} · Table ${tableLabel}\nRating: ${stars}\nTopics: ${tags}\nMessage: ${sub.message || '(none)'}\nLanguage: ${sub.language}`;

  const from = Deno.env.get('NOTIFY_FROM') ?? 'Loop Reviews <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [tenant.manager_email], subject, html, text }),
  });

  if (!res.ok) {
    const body = await res.text();
    return await fail(`resend_${res.status}: ${body.slice(0, 200)}`);
  }

  await admin.from('notifications')
    .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
    .eq('id', note.id);
  return json({ ok: true, sent: true });
});
