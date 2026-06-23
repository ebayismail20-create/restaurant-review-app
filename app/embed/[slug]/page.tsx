import { getSupabase } from '../../lib/supabase';

/**
 * Public, embeddable review badge — drop it on a venue's website via
 * <iframe src="…/embed/[slug]">. Shows ONLY non-sensitive aggregates
 * (average rating, count, star distribution) + public branding; never
 * individual private feedback. Framing is allowed for this path only
 * (see proxy.ts). Live data → force-dynamic.
 */
export const dynamic = 'force-dynamic';

interface BadgeRow {
  brand_name: string;
  brand_color: string | null;
  logo_url: string | null;
  avg_rating: number | string;
  rated_count: number;
  dist: number[];
}

const STAR =
  'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z';

export default async function ReviewBadge({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let row: BadgeRow | null = null;
  try {
    // get_review_badge isn't in the generated RPC types yet; the function is
    // validated server-side, so we call it loosely-typed here.
    const { data } = await getSupabase().rpc('get_review_badge' as never, {
      p_slug: slug,
    } as never);
    row = (data as unknown as BadgeRow[] | null)?.[0] ?? null;
  } catch {
    row = null;
  }

  const avg = row ? Number(row.avg_rating) : 0;
  const count = row?.rated_count ?? 0;
  const dist = row?.dist ?? [0, 0, 0, 0, 0];
  const maxDist = Math.max(1, ...dist);
  const rounded = Math.round(avg);
  const accent = row?.brand_color || '#6B1F2A';

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
        fontFamily: 'var(--font-inter), system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 360,
          boxSizing: 'border-box',
          border: '1px solid rgba(42,20,24,0.10)',
          borderRadius: 18,
          padding: '22px 24px',
          boxShadow: '0 14px 30px -16px rgba(42,20,24,0.18)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          {row?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.logo_url} alt="" style={{ width: 34, height: 34, objectFit: 'contain', borderRadius: 8 }} />
          ) : null}
          <span style={{ fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: 18, fontWeight: 600, color: '#2A1418' }}>
            {row?.brand_name ?? 'Reviews'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: 46, fontWeight: 600, color: '#2A1418', lineHeight: 1 }}>
            {count ? avg.toFixed(1) : '—'}
          </span>
          <span style={{ display: 'inline-flex', gap: 2 }} aria-hidden="true">
            {[1, 2, 3, 4, 5].map((n) => (
              <svg key={n} width={18} height={18} viewBox="0 0 24 24">
                <path d={STAR} fill={n <= rounded ? '#C9A961' : 'none'} stroke="#C9A961" strokeWidth={n <= rounded ? 1 : 1.5} strokeLinejoin="round" />
              </svg>
            ))}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: 'rgba(42,20,24,0.6)', marginTop: 6 }}>
          Based on {count} review{count === 1 ? '' : 's'}
        </div>

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[5, 4, 3, 2, 1].map((s) => {
            const c = dist[s - 1] ?? 0;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 26, fontSize: 11.5, color: 'rgba(42,20,24,0.6)' }}>{s}★</span>
                <span style={{ flex: 1, height: 7, borderRadius: 50, background: 'rgba(42,20,24,0.08)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${Math.round((c / maxDist) * 100)}%`, background: s >= 4 ? accent : '#C9A961', borderRadius: 50 }} />
                </span>
                <span style={{ width: 24, textAlign: 'right', fontSize: 11, color: 'rgba(42,20,24,0.6)' }}>{c}</span>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(42,20,24,0.08)', textAlign: 'center', fontSize: 10.5, letterSpacing: 0.5, color: 'rgba(42,20,24,0.45)' }}>
          Powered by Loop
        </div>
      </div>
    </div>
  );
}
