import { createAdminClient } from '@/lib/supabase/admin'
import {
  getUserSubscription,
  isCompUser,
  isSubscriptionActive,
} from '@/lib/stripe'

// Tier classification for a specific league instance — used by both the
// public-almanac advisory strip and the admin hub badge so the two stay
// in sync. The trial slot is owner-wide and lives on the *earliest*
// league per owner.
//
//   'comp'  → owner has a comp grant or is a lifetime user
//   'test'  → owner's earliest league (their one free trial slot)
//   'paid'  → non-trial league owned by a paid (active sub) user
//   'udfa'  → non-trial league owned by a free-tier user
export type LeagueTier = 'comp' | 'test' | 'paid' | 'udfa'

export async function resolveLeagueTier(
  leagueId: string,
  ownerId: string | null,
): Promise<LeagueTier> {
  if (!ownerId) return 'paid'
  if (await isCompUser(ownerId)) return 'comp'

  const db = createAdminClient()
  const { data: firstRow } = await db
    .from('leagues')
    .select('id')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (firstRow?.id === leagueId) return 'test'

  const sub = await getUserSubscription(ownerId)
  return isSubscriptionActive(sub) ? 'paid' : 'udfa'
}

// Human-readable label for the tier badge (uppercase, short).
export function tierBadgeLabel(tier: LeagueTier): string {
  switch (tier) {
    case 'comp':
      return 'Comp · Unlimited'
    case 'test':
      return 'Trial League'
    case 'paid':
      return 'Paid Plan'
    case 'udfa':
      return 'UDFA · Free'
  }
}
