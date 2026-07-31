// Which draft a season's picks should be read from — the implementation.
//
// Plain .mjs on purpose, and this is the whole reason: scripts/ runs on bare
// node with no TypeScript loader, so a rule that lived only in a .ts file
// could not be shared with the benchmark builder. That builder having its own
// private copy of the pool logic is exactly how the app and the 17-0 bar
// drifted apart in the first place, so the rule gets one home that both sides
// can actually import.
//
// The typed surface lives next door in ./canonicalDraft.ts, which re-exports
// these with proper signatures for the app.
//
// ── Why any of this exists ────────────────────────────────────────────────
//
// A season can carry more than one `drafts` row. The case it exists for is a
// hand-authored upload sitting alongside the platform's own scrape of the same
// year: pams 2019 has `curated-2019` (Joey's upload, the good one) and `2019`
// (the NFL.com sync, the bad one), both with 210 picks and different players.
//
// The ingesters already know curated drafts are special — all four delete with
// `.not('external_id', 'like', 'curated-%')` so a re-sync can't wipe an
// upload. Nothing on the read side knew, so every consumer picked its own
// winner and they disagreed with each other, which is why the same season
// showed different picks on different pages.
//
// Ranking, in order:
//   1. curated beats scraped, always. An upload is a deliberate correction of
//      what the platform returned.
//   2. more picks beats fewer, when the caller knows the counts. A partial
//      import is the other reason a second row shows up.
//   3. lower id, as a last resort. Arbitrary, but STABLE — the point is that
//      two readers never disagree, not that either answer is better.

/** Hand-authored drafts are written with a `curated-` external id. */
export function isCuratedDraft(draft) {
  return String(draft?.external_id ?? '').startsWith('curated-')
}

function beats(candidate, held, pickCounts) {
  const curated = Number(isCuratedDraft(candidate)) - Number(isCuratedDraft(held))
  if (curated !== 0) return curated > 0

  if (pickCounts) {
    const picks = (pickCounts.get(candidate.id) ?? 0) - (pickCounts.get(held.id) ?? 0)
    if (picks !== 0) return picks > 0
  }

  return candidate.id < held.id
}

/**
 * The one draft per season that picks should be read from.
 *
 * `pickCounts` maps draft id to how many picks it holds, and is optional:
 * callers that have already loaded the picks can pass it to break ties between
 * two scraped drafts, and callers that haven't can leave it out and still get
 * the curated rule plus a stable answer.
 */
export function canonicalDraftBySeason(drafts, pickCounts) {
  const best = new Map()
  for (const draft of drafts) {
    const held = best.get(draft.season_id)
    if (!held || beats(draft, held, pickCounts)) best.set(draft.season_id, draft)
  }
  return best
}

/** The same answer as a set of draft ids, for filtering a pile of picks. */
export function canonicalDraftIds(drafts, pickCounts) {
  return new Set([...canonicalDraftBySeason(drafts, pickCounts).values()].map((d) => d.id))
}
