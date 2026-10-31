// The tags a link preview reads, for every Pack Empire page. The card itself is
// /api/og/pack-empire. Pass whatever changes the picture in `image`, status
// included: scrapers cache by URL, so a challenge that's been played has to ask
// for a different address than the invite did.

import type { Metadata } from 'next'

const SITE = 'The Sunday Chronicle'

/** Bump on a redesign: scrapers hold a card by its URL for weeks. */
const CARD_VERSION = 2

export function peCard(params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams({ v: String(CARD_VERSION) })
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') q.set(k, String(v))
  return `/api/og/pack-empire/?${q}`
}

export function peMeta({
  title,
  description,
  card,
  alt,
  url,
  robots,
}: {
  title: string
  description: string
  card: Record<string, string | number | null | undefined>
  alt: string
  url?: string
  robots?: Metadata['robots']
}): Metadata {
  const image = peCard(card)
  return {
    title,
    description,
    ...(robots ? { robots } : {}),
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: {
      type: 'website',
      ...(url ? { url } : {}),
      title,
      description,
      siteName: SITE,
      images: [{ url: image, width: 1200, height: 630, alt }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}
