// Which draft a season's picks should be read from — the typed surface.
//
// The implementation is in ./canonicalDraft.mjs, not here, so that
// scripts/build-minigame-benchmark.mjs can import the same rule on bare node
// with no TypeScript loader. That script builds its own copy of the squad pool
// to calibrate the 17-0 bar, and a private copy of this rule is precisely how
// the app and the bar drift apart. See the .mjs for the full reasoning.
//
// Every reader of `draft_picks` that joins through `drafts` must go through
// this: src/lib/export/pams.ts (the Draft Annual), the presentation tree,
// Roster Roulette's pool, Guess the Draft's deck, and the benchmark builder.

import {
  isCuratedDraft as isCuratedDraftImpl,
  canonicalDraftBySeason as canonicalDraftBySeasonImpl,
  canonicalDraftIds as canonicalDraftIdsImpl,
} from './canonicalDraft.mjs'

export type DraftIdentity = {
  id: string
  season_id: string
  external_id?: string | null
}

/** Hand-authored drafts are written with a `curated-` external id. */
export const isCuratedDraft = isCuratedDraftImpl as (draft: {
  external_id?: string | null
}) => boolean

/**
 * The one draft per season that picks should be read from.
 *
 * `pickCounts` maps draft id to how many picks it holds, and is optional:
 * callers that have already loaded the picks can pass it to break ties
 * between two scraped drafts, and callers that haven't can leave it out and
 * still get the curated rule plus a stable answer.
 */
export const canonicalDraftBySeason = canonicalDraftBySeasonImpl as <T extends DraftIdentity>(
  drafts: readonly T[],
  pickCounts?: ReadonlyMap<string, number>
) => Map<string, T>

/** The same answer as a set of draft ids, for filtering a pile of picks. */
export const canonicalDraftIds = canonicalDraftIdsImpl as <T extends DraftIdentity>(
  drafts: readonly T[],
  pickCounts?: ReadonlyMap<string, number>
) => Set<string>
