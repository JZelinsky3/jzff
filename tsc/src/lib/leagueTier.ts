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
// preview of paid. This boolean is used by the sync/cron entry points
// to decide whether to even bother refreshing data — Rookie subs are
// still 'paid' here because we DO want to sync their data; the Rookie
// page-level lock kicks in below at request time, not at sync time.
export async function isLeagueLocked(
  leagueId: string,
  ownerId: string | null,
): Promise<boolean> {
  const tier = await resolveLeagueTier(leagueId, ownerId)
  return tier === 'udfa'
}

// Layered page/data lock at view time. Returns the *reason* a viewer
// is gated on this league, so the route handler can pick the right
// pattern list:
//
//   'udfa'   → UDFA pattern list (broad — live subpages, draft,
//              record book). Free-tier league.
//   'rookie' → Veteran-only pattern list (narrow — best coach, manager
//              DNA, trade grader). Owner is on the Rookie paid plan,
//              so they have most of the site but not the Veteran tier
//              features documented in PLAN_FEATURES.
//   null     → no lock. Comp grants, trial slot, and Veteran/All-Pro
//              subs all see the full site.
export type LockReason = 'udfa' | 'rookie' | null
export async function getLockReason(
  leagueId: string,
  ownerId: string | null,
): Promise<LockReason> {
  const tier = await resolveLeagueTier(leagueId, ownerId)
  if (tier === 'udfa') return 'udfa'
  if (tier === 'comp' || tier === 'test') return null
  // 'paid' — defer to the actual Stripe tier. tier1 (Rookie) gates the
  // Veteran-only pages; tier2/tier3 unlock everything.
  if (!ownerId) return null
  const sub = await getUserSubscription(ownerId)
  if (isSubscriptionActive(sub) && sub?.tier === 'tier1') return 'rookie'
  return null
}

// Paths within /leagues/<slug>/ that a UDFA league hides behind the
// "Locked — upgrade to unlock" placeholder. Matched against the
// resolved template path (relative to TEMPLATE_ROOT), not the URL.
const UDFA_LOCKED_PAGE_PATTERNS: RegExp[] = [
  // Live-season HUB stays open so UDFA users can see the chapter index,
  // but every page underneath it is locked. Pattern explicitly excludes
  // `live/index.html` (the hub) — every other resolved template
  // path inside the live directory (matchup-preview/index.html,
  // pickems/index.html, etc.) still matches. nav.js then disables the
  // hub's card clicks for UDFA leagues so the entry tiles preview-only.
  /^live\/(?!index\.html$).+/,
  // Sunday Live (paid feature, top-level chapter outside live/).
  /^sunday-live(\/|$)/,
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
  // All-Time Team pool rides the same gate as draft data — the page it
  // feeds (managers/all-time.html) renders a locked plate on 404.
  /^data\/all_time_pool\.json$/,
  // Mock Room ghost book: draft/mock.html is already page-locked via the
  // ^draft pattern above, but gate the tendencies JSON too so a direct
  // fetch can't sidestep the page lock.
  /^data\/mock_draft\.json$/,
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

// Veteran-only pages — locked for Rookie (tier1) paid subs. The cards
// for these features carry a "Veteran" ribbon on the live hub,
// so the hub stays accessible and only the destinations gate. Weekly
// Recap isn't here because it's not a built page yet (status="pro-soon"
// on the hub).
const VETERAN_LOCKED_PAGE_PATTERNS: RegExp[] = [
  /^live\/best-coach(\/|$)/,
  /^live\/manager-dna(\/|$)/,
  /^live\/trades(\/|$)/,
]

// Data files for the Veteran-only features. 404 these on Rookie so
// the locked page card on manager.html (which falls back to the DNA-
// locked card on JSON 404) keeps working there too.
const VETERAN_LOCKED_DATA_PATTERNS: RegExp[] = [
  /^data\/best_coach\.json$/,
  /^data\/manager_dna\.json$/,
]

export type LockKind = 'page' | 'data' | null
export function classifyLockedPath(file: string, reason: LockReason): LockKind {
  if (reason === 'udfa') {
    for (const re of UDFA_LOCKED_PAGE_PATTERNS) if (re.test(file)) return 'page'
    for (const re of UDFA_LOCKED_DATA_PATTERNS) if (re.test(file)) return 'data'
    return null
  }
  if (reason === 'rookie') {
    for (const re of VETERAN_LOCKED_PAGE_PATTERNS) if (re.test(file)) return 'page'
    for (const re of VETERAN_LOCKED_DATA_PATTERNS) if (re.test(file)) return 'data'
    return null
  }
  return null
}
