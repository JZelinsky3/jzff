// Granular ingest stages. Each platform's ingest accepts an optional
// `stages` object that gates which heavy stages run. Omitted = run all
// (the default, "Sync now" behavior). When a stage is `false`, the ingest
// skips that block — useful when the commissioner only wants to refresh
// trades after the trade deadline, or pull updated draft results without
// re-fetching every week's matchups.
//
// The "league structure" preamble (managers, seasons, manager_seasons)
// always runs because downstream stages need the manager-id mapping. It's
// cheap so we never gate it.
//
// All four platforms (Sleeper, ESPN, Yahoo, NFL.com) honor every stage.
// NFL.com lineups were originally skipped because we built the URL with
// `statWeek=N` instead of `week=N` — the former only repaints stat columns
// while the latter actually swaps the roster snapshot. Once the URL was
// fixed the gamecenter scrape returns real per-week bench/starter data.

export type IngestStages = {
  matchups?: boolean
  drafts?: boolean
  lineups?: boolean
  trades?: boolean
}

// Resolve a partial stages object to a full record with explicit booleans.
// Omitted = `true` (the "all stages" default that preserves today's Sync
// now behavior). Pass `undefined` for the same effect as `{}`.
export function resolveStages(stages: IngestStages | undefined): Required<IngestStages> {
  return {
    matchups: stages?.matchups ?? true,
    drafts: stages?.drafts ?? true,
    lineups: stages?.lineups ?? true,
    trades: stages?.trades ?? true,
  }
}

// The set of stage keys the UI exposes. Used by the source-row picker so
// adding a new stage in one place lights it up across all four platforms.
export const STAGE_KEYS = ['matchups', 'drafts', 'lineups', 'trades'] as const
export type StageKey = (typeof STAGE_KEYS)[number]

// Optional year window for one ingest request. The chunked sync button
// walks a long-history source a few seasons per request so no single
// request has to fit the whole range under the Vercel function cap; each
// ingest intersects this window with its source's own season range and
// quietly skips when the intersection is empty.
export type IngestYearRange = { from?: number; to?: number }

// Intersect a source's own [start, end] season range with a request-level
// year window. Returns null when the intersection is empty (this source has
// nothing to do for this chunk).
export function intersectRange(
  start: number | undefined,
  end: number | undefined,
  range: IngestYearRange | undefined,
): { start: number | undefined; end: number | undefined } | null {
  let s = start
  let e = end
  if (range?.from != null) s = s == null ? range.from : Math.max(s, range.from)
  if (range?.to != null) e = e == null ? range.to : Math.min(e, range.to)
  if (s != null && e != null && s > e) return null
  return { start: s, end: e }
}
