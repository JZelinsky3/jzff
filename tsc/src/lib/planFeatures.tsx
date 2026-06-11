import { TIER_LABELS, TIER_LIMITS, type Tier } from '@/lib/stripe'

// Canonical feature list shared by the pricing comparison table (in
// /pricing/plans) and the Free / UDFA card (on both /pricing and
// /pricing/plans). Single source of truth — adding/removing a feature
// here updates both surfaces. `includedFree` is what UDFA actually gets;
// `included` is the paid tier matrix.
export type PlanFeature = {
  label: string
  detail: string | ((t: Tier) => string)
  // Optional Free-tier-specific blurb. When the feature is *partially*
  // available on UDFA — e.g. "League archive" gets standings + rivalries
  // but not full season walks or drafts — describe what UDFA actually
  // gets here. If omitted, the Free card uses `detail` directly.
  detailFree?: string
  included: Record<Tier, boolean>
  includedFree: boolean
}

export const PLAN_FEATURES: PlanFeature[] = [
  {
    label: 'League archive',
    detail: 'Standings, season archives, drafts, records, manager dossiers, rivalries.',
    detailFree: 'All-time standings, basic manager records, and head-to-head rivalry tallies.',
    included: { tier1: true, tier2: true, tier3: true },
    includedFree: true,
  },
  {
    label: 'Every platform',
    detail: 'Sleeper, ESPN, NFL.com, and Yahoo. Stitch a league together across all of them.',
    included: { tier1: true, tier2: true, tier3: true },
    includedFree: true,
  },
  {
    label: 'In-season auto-sync',
    detail: 'Standings + weekly matchups refresh automatically through the playoffs.',
    included: { tier1: true, tier2: true, tier3: true },
    includedFree: false,
  },
  {
    label: "Pick'ems & Power Rankings",
    detail: "Weekly pick'em board and power-ranking ballots, scored automatically.",
    included: { tier1: true, tier2: true, tier3: true },
    includedFree: false,
  },
  {
    label: '7-day free trial',
    detail: 'Every plan. Cancel anytime before the trial ends, no charge.',
    included: { tier1: true, tier2: true, tier3: true },
    includedFree: false,
  },
  {
    label: 'Weekly recaps',
    detail: "A short written recap of each week's slate, drawn from your league's data.",
    included: { tier1: false, tier2: true, tier3: true },
    includedFree: false,
  },
  {
    label: 'Trade recaps',
    detail: 'A recap of every trade when it happens, plus a four-week revisit checking how it actually played out.',
    included: { tier1: false, tier2: true, tier3: true },
    includedFree: false,
  },
  {
    label: 'Manager DNA',
    detail: 'Every manager auto-classified into an archetype: Trade Hawk, Coin-Flipper, Set-and-Forget, and more, based on their actual transactions, lineups, and draft history.',
    included: { tier1: false, tier2: true, tier3: true },
    includedFree: false,
  },
  {
    label: 'Best Coach Board',
    detail: 'Every starting lineup graded against its optimal version. Season-long efficiency standings plus a running tally of the worst single-week benchings.',
    included: { tier1: false, tier2: true, tier3: true },
    includedFree: false,
  },
  {
    label: 'Multiple leagues',
    // For the per-tier comparison this resolves to the tier's exact cap;
    // for the Free card we use the static free-tier blurb below.
    detail: (t) => {
      const n = TIER_LIMITS[t]
      if (n === 1) return '1 league.'
      return `Up to ${n} on ${TIER_LABELS[t].name}.`
    },
    included: { tier1: false, tier2: true, tier3: true },
    includedFree: false,
  },
  {
    label: 'Early access',
    detail: 'Every new feature lands on All-Pro first.',
    included: { tier1: false, tier2: false, tier3: true },
    includedFree: false,
  },
  {
    label: 'Sunday Live',
    detail: 'First look at the live game-day companion.',
    included: { tier1: false, tier2: false, tier3: true },
    includedFree: false,
  },
  {
    label: 'Manager Hub',
    detail: 'Your whole career, every league, one book. Coming soon.',
    included: { tier1: false, tier2: false, tier3: true },
    includedFree: false,
  },
]

// Static Free-tier blurb for the 'Multiple leagues' row — the per-tier
// `detail` function above doesn't apply (UDFA has no tier).
export const FREE_MULTIPLE_LEAGUES_DETAIL = `Up to ${TIER_LIMITS.tier2} on ${TIER_LABELS.tier2.name}, more on ${TIER_LABELS.tier3.name}.`
