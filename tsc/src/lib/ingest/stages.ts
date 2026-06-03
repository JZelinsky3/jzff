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
// NOT every platform supports every stage:
//   - NFL.com lineups are skipped at the platform level (their history
//     endpoint doesn't preserve per-week roster state). The `lineups`
//     flag is honored by the other three platforms.
//   - The `trades` stage is honored by all four platforms (Sleeper had
//     trades from day one; ESPN / Yahoo / NFL.com were added later).

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
