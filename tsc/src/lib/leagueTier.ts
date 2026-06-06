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
      return 'UDFA · Limited'
  }
}

// Is this league subject to UDFA feature locks? True for tier == 'udfa'
// — applied immediately, no testing-window grace. Comp, paid, and the
// trial slot ('test') all bypass so the trial league still works as a
// preview of paid.
export async function isLeagueLocked(
  leagueId: string,
  ownerId: string | null,
): Promise<boolean> {
  const tier = await resolveLeagueTier(leagueId, ownerId)
  return tier === 'udfa'
}

// Paths within /leagues/<slug>/ that a UDFA league hides behind the
// "Locked — upgrade to unlock" placeholder. Matched against the
// resolved template path (relative to TEMPLATE_ROOT), not the URL.
const UDFA_LOCKED_PAGE_PATTERNS: RegExp[] = [
  // Live-season HUB stays open so UDFA users can see the chapter index,
  // but every page underneath it is locked. Pattern explicitly excludes
  // `live-season/index.html` (the hub) — every other resolved template
  // path inside the live-season directory (matchup-preview/index.html,
  // pickems/index.html, etc.) still matches. nav.js then disables the
  // hub's card clicks for UDFA leagues so the entry tiles preview-only.
  /^live-season\/(?!index\.html$).+/,
  /^draft(\/|$)/,
  /^records\.html$/,
  // NOTE: seasons/season.html was previously locked, but the per-season
  // JSON (data/seasons/<year>.json) is already part of the normal sync
  // bundle and the seasons index needs to stay open anyway, so there's
  // no extra cost to letting UDFA viewers see the individual seasons.
]

// Data files that should 404 for UDFA viewers. Locked pages won't fetch
// these (they get the placeholder template), but the unlocked pages
// (manager.html, etc.) might try and we want to fall back gracefully —
// e.g. manager_dna 404 already triggers the locked-DNA card in the
// existing template.
const UDFA_LOCKED_DATA_PATTERNS: RegExp[] = [
  /^data\/record_book\.json$/,
  /^data\/manager_dna\.json$/,
  /^data\/manager_highs\.json$/,
  /^data\/drafts\//,
  /^data\/h2h_matrix\.json$/,
  /^data\/current_form\.json$/,
  /^data\/matchup_preview\.json$/,
  /^data\/best_coach\.json$/,
  /^data\/records_watch\.json$/,
  /^data\/milestones\.json$/,
  // NOTE: data/seasons/<year>.json stays open even though seasons/season.html
  // is locked — the seasons index page pulls each year's JSON to render the
  // featured-per-year cards the user wants UDFA to keep seeing. Page-level
  // lock on season.html is what enforces "can't open an individual season".
]

export type LockKind = 'page' | 'data' | null
export function classifyLockedPath(file: string, locked: boolean): LockKind {
  if (!locked) return null
  for (const re of UDFA_LOCKED_PAGE_PATTERNS) if (re.test(file)) return 'page'
  for (const re of UDFA_LOCKED_DATA_PATTERNS) if (re.test(file)) return 'data'
  return null
}
