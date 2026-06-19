import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getSupabase } from '../../lib/supabase';
import { CardView } from './CardView';

/**
 * Public venue "digital business card": /card/[slug]
 *
 * Branding + public review links, resolved by slug via the token-free
 * `get_card` function (returns only data already shown to guests). Meant to
 * sit on an NFC card or QR sticker the venue hands out. Unlike the per-table
 * review pages, this one is indexable/shareable — it's a marketing surface.
 */

interface CardRow {
  brand_name: string;
  tagline: string | null;
  location_name: string | null;
  logo_url: string | null;
  brand_color: string | null;
  platforms: unknown;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

async function fetchCard(slug: string): Promise<CardRow | null> {
  try {
    const { data, error } = await getSupabase().rpc('get_card', { p_slug: slug });
    if (error) throw error;
    return (data?.[0] as CardRow) ?? null;
  } catch (e) {
    console.error('[card] get_card failed:', (e as Error).message);
    return null;
  }
}

export async function generateMetadata({ params }: PageProps<'/card/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const card = await fetchCard(slug);
  if (!card) return { title: 'Loop' };
  return {
    title: `${card.brand_name} — Loop`,
    description: card.tagline ?? `Leave ${card.brand_name} a review`,
    // A business card is meant to be found and shared, unlike the table pages.
    robots: { index: true, follow: true },
  };
}

export default async function CardPage({ params }: PageProps<'/card/[slug]'>) {
  const { slug } = await params;
  const card = await fetchCard(slug);
  if (!card) notFound();

  const platforms = Array.isArray(card.platforms)
    ? (card.platforms as { kind: string; label: string; url: string }[])
    : [];

  return (
    <CardView
      card={{ ...card, platforms }}
      cardUrl={`${SITE_URL}/card/${slug}`}
    />
  );
}
