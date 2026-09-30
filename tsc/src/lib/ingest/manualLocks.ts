// Which stages of a season were entered by hand, and so must survive syncs.
//
// The importer (/league/<slug>/import) writes ordinary manager_seasons,
// matchups and draft rows, which every ingest would otherwise happily replace
// on the next sync: standings and lineups are deleted and rewritten per season,
// and a platform that no longer serves an old season answers with nothing,
// which is exactly how the NFL.com sunset erased history in August 2026.
//
// A row in manual_imports means "a person typed this in; the platform does not
// have it". Ingests consult this before the destructive part of each stage and
// leave locked stages alone. Drafts are already safe by a different mechanism
// (curated- external ids, see canonicalDraft) but are included so the rule
// reads the same everywhere.
//
// 'podium' is the season's champion / runner-up (/ third place) typed in on
// their own. Ingests write champion and runner-up on every sync, often null
// for a year the platform never finished, so a locked podium is skipped there.

export type ManualLock = 'standings' | 'drafts' | 'matchups' | 'podium'

type MinimalDb = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => Promise<{ data: Array<{ kind: string }> | null }>
    }
  }
}

/**
 * Stages of `seasonId` that were hand-entered. Returns an empty set on any
 * error: a sync that cannot read the lock table should still sync, and the
 * worst case is the behavior we had before this existed.
 */
export async function manualLocks(db: unknown, seasonId: string): Promise<Set<ManualLock>> {
  try {
    const { data } = await (db as MinimalDb)
      .from('manual_imports')
      .select('kind')
      .eq('season_id', seasonId)
    const locks = new Set<ManualLock>()
    for (const row of data ?? []) {
      if (row.kind === 'standings' || row.kind === 'drafts' || row.kind === 'matchups' || row.kind === 'podium') {
        locks.add(row.kind)
      }
    }
    return locks
  } catch {
    return new Set<ManualLock>()
  }
}

/** Warning text for the sync report, so a skipped stage is never silent. */
export function manualLockWarning(year: number | string, kind: ManualLock): string {
  if (kind === 'podium') return `Season ${year}: the champion was entered by hand, so the sync left it as it is.`
  const what = kind === 'standings' ? 'standings' : kind === 'drafts' ? 'draft' : 'matchups'
  return `Season ${year}: ${what} were entered by hand, so the sync left them as they are.`
}

/**
 * The season's headline ids as an ingest should write them: without champion
 * and runner-up when the podium was typed in by hand.
 */
export function headlinePatch(
  locks: Set<ManualLock>,
  ids: { champion: string | null; runnerUp: string | null; regularSeasonWinner: string | null },
): Record<string, string | null> {
  const patch: Record<string, string | null> = { regular_season_winner_id: ids.regularSeasonWinner }
  if (!locks.has('podium')) {
    patch.champion_manager_id = ids.champion
    patch.runner_up_manager_id = ids.runnerUp
  }
  return patch
}
