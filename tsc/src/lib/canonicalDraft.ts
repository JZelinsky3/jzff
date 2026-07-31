// Which draft a season's picks should be read from.
//
// A season can carry more than one `drafts` row. The case this exists for is
// a hand-authored upload sitting alongside the platform's own scrape of the
// same year: pams 2019 has `curated-2019` (Joey's upload, the good one) and
// `2019` (the NFL.com sync, the bad one), both with 210 picks.
//
// The ingesters already know curated drafts are special — all four delete
// with `.not('external_id', 'like', 'curated-%')` so a re-sync can't wipe an
// upload. Nothing on the read side knew, so every consumer picked its own
// winner and they disagreed: the Draft Annual applied the rule, the
// presentation tree read BOTH drafts at once, Roster Roulette took whichever
// row won a race on overall pick, and Blind Item preferred the draft with
// more picks (a coin flip when both have 210). That is why the same season
// showed different picks on different pages.
//
// So the rule lives here now, once, and every reader goes through it.
//
// Ranking, in order:
//   1. curated beats scraped, always. An upload is a deliberate correction
//      of what the platform returned.
//   2. more picks beats fewer, when the caller knows the counts. A partial
//      import is the other reason a second row shows up.
//   3. lower id, as a last resort. Arbitrary, but STABLE — the point is that
//      two pages never disagree, not that either answer is better.

export type DraftIdentity = {
  id: string
  season_id: string
  external_id?: string | null
}

/** Hand-authored drafts are written with a `curated-` external id. */
export function isCuratedDraft(draft: { external_id?: string | null }): boolean {
  return String(draft.external_id ?? '').startsWith('curated-')
}

/**
 * The one draft per season that picks should be read from.
 *
 * `pickCounts` maps draft id to how many picks it holds, and is optional:
 * callers that have already loaded the picks can pass it to break ties
 * between two scraped drafts, and callers that haven't can leave it out and
 * still get the curated rule plus a stable answer.
 */
export function canonicalDraftBySeason<T extends DraftIdentity>(
  drafts: readonly T[],
  pickCounts?: ReadonlyMap<string, number>
): Map<string, T> {
  const best = new Map<string, T>()
  for (const draft of drafts) {
    const held = best.get(draft.season_id)
    if (!held || beats(draft, held, pickCounts)) best.set(draft.season_id, draft)
  }
  return best
}

/** The same answer as a set of draft ids, for filtering a pile of picks. */
export function canonicalDraftIds<T extends DraftIdentity>(
  drafts: readonly T[],
  pickCounts?: ReadonlyMap<string, number>
): Set<string> {
  return new Set([...canonicalDraftBySeason(drafts, pickCounts).values()].map((d) => d.id))
}

function beats<T extends DraftIdentity>(
  candidate: T,
  held: T,
  pickCounts?: ReadonlyMap<string, number>
): boolean {
  const curated = Number(isCuratedDraft(candidate)) - Number(isCuratedDraft(held))
  if (curated !== 0) return curated > 0

  if (pickCounts) {
    const picks = (pickCounts.get(candidate.id) ?? 0) - (pickCounts.get(held.id) ?? 0)
    if (picks !== 0) return picks > 0
  }

  return candidate.id < held.id
}
