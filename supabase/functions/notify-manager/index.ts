// notify-manager: deliver a submission's queued alerts across every channel
// the owner configured (email / SMS / WhatsApp).
//
// Invoked server-side by the Next API route after a manager-facing
// submission. Runs with the service-role key Supabase injects, so it reads
// the submission and updates the per-channel notifications log past RLS.
//
// submit_review enqueues one PENDING notification row per enabled channel
// (transactionally). This function loads those rows and dispatches each by
// its channel + destination, then records sent/failed per row. A channel
// with no provider configured records 'failed: no_<kind>_provider' so the
// pipeline stays observable. Re-invoking only touches still-pending rows.
//
// Secrets (set per Edge Function; each channel works independently):
//   email    -> RESEND_API_KEY, NOTIFY_FROM (optional)
//   sms      -> TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM
//   whatsapp -> TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
//              (e.g. "whatsapp:+14155238886")
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
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });

const safe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

type SendResult = { ok: boolean; error?: string };

async function sendEmail(to: string, subject: string, html: string, text: string): Promise<SendResult> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return { ok: false, error: 'no_email_provider' };
  const from = Deno.env.get('NOTIFY_FROM') ?? 'Loop Reviews <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  if (!res.ok) return { ok: false, error: `resend_${res.status}: ${(await res.text()).slice(0, 160)}` };
  return { ok: true };
}

async function sendTwilio(channel: 'sms' | 'whatsapp', to: string, body: string): Promise<SendResult> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = channel === 'whatsapp'
    ? Deno.env.get('TWILIO_WHATSAPP_FROM')
    : Deno.env.get('TWILIO_SMS_FROM');
  if (!sid || !token || !from) return { ok: false, error: `no_${channel}_provider` };
  const prefix = channel === 'whatsapp' ? 'whatsapp:' : '';
  const form = new URLSearchParams({ To: `${prefix}${to}`, From: from, Body: body });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  if (!res.ok) return { ok: false, error: `twilio_${res.status}: ${(await res.text()).slice(0, 160)}` };
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let payload: Payload;
  try { payload = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const submissionId = payload.submission_id;
  if (!submissionId) return json({ error: 'missing_submission_id' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Pending alerts queued for this submission (one per enabled channel).
  const { data: pending } = await admin
    .from('notifications')
    .select('id, channel, destination')
    .eq('submission_id', submissionId)
    .eq('status', 'pending');
  if (!pending || pending.length === 0) return json({ ok: true, skipped: 'no_pending' });

  // Load content once.
  const { data: sub } = await admin
    .from('submissions')
    .select('kind, rating, tag_keys, message, language, created_at, tenant_id, table_id')
    .eq('id', submissionId).maybeSingle();
  if (!sub) {
    await admin.from('notifications').update({ status: 'failed', error: 'submission_not_found' })
      .eq('submission_id', submissionId).eq('status', 'pending');
    return json({ ok: false, error: 'submission_not_found' });
  }
  const { data: tenant } = await admin.from('tenants').select('name').eq('id', sub.tenant_id).maybeSingle();
  let tableLabel = '-';
  if (sub.table_id) {
    const { data: tbl } = await admin.from('tables').select('label').eq('id', sub.table_id).maybeSingle();
    if (tbl?.label) tableLabel = tbl.label;
  }

  const venueName = tenant?.name ?? 'Your venue';
  const headline = KIND_HEADLINE[sub.kind] ?? 'New guest feedback';
  const urgent = sub.kind === 'alerted' || sub.kind === 'anon-message';
  const stars = sub.rating ? '★'.repeat(sub.rating) + '☆'.repeat(5 - sub.rating) : '—';
  const tags = (sub.tag_keys ?? []).map((k: string) => TAG_LABELS[k] ?? k).join(', ') || '—';
  const subject = `${urgent ? '🔴 ' : ''}${headline} — Table ${tableLabel} · ${venueName}`;

  // Compact text for SMS/WhatsApp.
  const shortText =
    `${urgent ? '🔴 ' : ''}${venueName} — Table ${tableLabel}\n` +
    `${stars}${tags !== '—' ? ' · ' + tags : ''}` +
    `${sub.message ? '\n“' + sub.message + '”' : ''}`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#2A1418">
      <h2 style="font-size:18px;margin:0 0 4px">${safe(headline)}</h2>
      <p style="color:#8a7a6e;margin:0 0 16px;font-size:13px">${safe(venueName)} · Table ${safe(tableLabel)} · ${new Date(sub.created_at).toLocaleString()}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#8a7a6e;width:90px">Rating</td><td style="padding:6px 0;color:#C9A961;font-size:16px">${stars}</td></tr>
        <tr><td style="padding:6px 0;color:#8a7a6e">Topics</td><td style="padding:6px 0">${safe(tags)}</td></tr>
        <tr><td style="padding:6px 0;color:#8a7a6e;vertical-align:top">Message</td><td style="padding:6px 0">${sub.message ? safe(sub.message) : '<em style=\"color:#8a7a6e\">(no message)</em>'}</td></tr>
        <tr><td style="padding:6px 0;color:#8a7a6e">Language</td><td style="padding:6px 0">${safe(sub.language)}</td></tr>
      </table>
    </div>`;
  const emailText = `${headline}\n${venueName} · Table ${tableLabel}\nRating: ${stars}\nTopics: ${tags}\nMessage: ${sub.message || '(none)'}`;

  // Dispatch each pending channel, recording its own status.
  const results = await Promise.all(pending.map(async (n) => {
    let r: SendResult;
    if (!n.destination) {
      r = { ok: false, error: 'no_destination' };
    } else if (n.channel === 'email') {
      r = await sendEmail(n.destination, subject, html, emailText);
    } else if (n.channel === 'sms' || n.channel === 'whatsapp') {
      r = await sendTwilio(n.channel, n.destination, shortText);
    } else {
      r = { ok: false, error: `unsupported_channel_${n.channel}` };
    }
    await admin.from('notifications').update({
      status: r.ok ? 'sent' : 'failed',
      error: r.ok ? null : r.error,
      sent_at: r.ok ? new Date().toISOString() : null,
    }).eq('id', n.id);
    return { channel: n.channel, ok: r.ok, error: r.error };
  }));

  return json({ ok: true, dispatched: results });
});
