import { redirect } from 'next/navigation';

import { createClient } from '../lib/supabase/server';

/**
 * Manager dashboard — server-rendered, auth-gated, tenant-scoped.
 *
 * Auth: getClaims() verifies the session from the cookie; no manager → /login.
 * Data: every query runs as the authenticated manager, so RLS scopes rows to
 * their tenant automatically. There is no tenant id in this code — the
 * database decides what this user may see.
 */

// Manager-facing English labels for the stable tag keys.
const TAG_LABELS: Record<string, string> = {
  food: 'Food', wait: 'Wait time', service: 'Service', clean: 'Cleanliness',
  ambiance: 'Ambiance', value: 'Value',
  food_bad: 'Food quality', service_bad: 'Poor service', wait_bad: 'Long wait',
  clean_bad: 'Not clean', price_bad: 'Overpriced', other_bad: 'Other',
};

const KIND_LABEL: Record<string, string> = {
  alerted: 'Urgent', private: 'Private', 'anon-message': 'Anonymous',
  rated: 'Rating', posted: 'Public review',
};

const PRIORITY_RANK: Record<string, number> = { urgent: 0, normal: 1, info: 2 };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

async function signOut() {
  'use server';
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) redirect('/login');

  // Tenant name (RLS returns only the manager's tenant).
  const { data: tenants } = await supabase.from('tenants').select('name').limit(1);
  const tenantName = tenants?.[0]?.name ?? 'Your venue';

  // Recent feedback, scoped by RLS to this manager's tenant.
  const { data: rows } = await supabase
    .from('submissions')
    .select('id, kind, rating, tag_keys, message, language, priority, created_at, tables(label)')
    .order('created_at', { ascending: false })
    .limit(100);

  const submissions = (rows ?? [])
    .slice()
    .sort((a, b) => {
      const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
      if (pr !== 0) return pr;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const urgentCount = submissions.filter((s) => s.priority === 'urgent').length;

  return (
    <div className="dash">
      <header className="dash-header">
        <div>
          <h1 className="dash-title">{tenantName}</h1>
          <p className="dash-subtitle">Guest feedback</p>
        </div>
        <form action={signOut}>
          <button type="submit" className="dash-signout">Sign out</button>
        </form>
      </header>

      <div className="dash-stats">
        <div className="dash-stat">
          <span className="dash-stat-num">{submissions.length}</span>
          <span className="dash-stat-label">Recent</span>
        </div>
        <div className={`dash-stat ${urgentCount > 0 ? 'dash-stat-urgent' : ''}`}>
          <span className="dash-stat-num">{urgentCount}</span>
          <span className="dash-stat-label">Need attention</span>
        </div>
      </div>

      {submissions.length === 0 ? (
        <div className="dash-empty">
          <p>No feedback yet.</p>
          <p className="dash-empty-sub">Submissions from your tables will appear here.</p>
        </div>
      ) : (
        <ul className="dash-list">
          {submissions.map((s) => (
            <li key={s.id} className={`dash-card priority-${s.priority}`}>
              <div className="dash-card-top">
                <span className={`dash-badge badge-${s.priority}`}>
                  {KIND_LABEL[s.kind] ?? s.kind}
                </span>
                <span className="dash-rating" aria-label={s.rating ? `${s.rating} stars` : 'no rating'}>
                  {s.rating ? '★'.repeat(s.rating) + '☆'.repeat(5 - s.rating) : '—'}
                </span>
                <span className="dash-meta">
                  {(s.tables as { label: string } | null)?.label
                    ? `Table ${(s.tables as { label: string }).label} · `
                    : ''}
                  {timeAgo(s.created_at)} · {s.language.toUpperCase()}
                </span>
              </div>
              {s.tag_keys.length > 0 ? (
                <div className="dash-tags">
                  {s.tag_keys.map((k) => (
                    <span key={k} className="dash-tag">{TAG_LABELS[k] ?? k}</span>
                  ))}
                </div>
              ) : null}
              {s.message ? <p className="dash-message">{s.message}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
