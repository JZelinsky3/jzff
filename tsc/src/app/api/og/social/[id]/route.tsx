// The image on a social post. URL: /api/og/social/<post id>/
//
// Draws the `card` stored on the social_posts row (see lib/og/socialCard).
// The content is public NFL data or demo copy only, so the route is
// public, which it has to be: Threads fetches the image from here itself.
//
// A post that is filled on the day (the Drop Regret Index) has no card until
// then; it draws a placeholder so the admin preview isn't a broken image.

import { createAdminClient } from '@/lib/supabase/admin'
import { renderSocialCard } from '@/lib/og/socialCard'
import type { Card } from '@/lib/social/content'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('not found', { status: 404 })

  const db = createAdminClient()
  const { data } = await db.from('social_posts').select('card').eq('id', id).maybeSingle()
  if (!data) return new Response('not found', { status: 404 })
  return renderSocialCard((data.card as Card | null) ?? null)
}
