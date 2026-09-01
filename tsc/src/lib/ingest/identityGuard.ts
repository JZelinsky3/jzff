// Refuse to hand a season over to a different set of managers.
//
// What this exists to prevent, from weekly-depression on 2026-08-30: a league
// with seven years of NFL.com history had an ESPN source attached (the exact
// migration we recommend now that NFL.com is gone). ESPN's members are a
// different identity space, so the ingest created 14 new manager rows, and
// then, doing its normal job, replaced 2021-2026 with standings belonging to
// those new rows and pruned every matchup that referenced the old ones. The
// league now has 19 real names owning 2014-2020 and 14 machine names
// (ESPNFAN31562102, {C221D6B2-...}) owning 2021-2026, with no link between
// them, so its all-time records are split in half.
//
// A re-import that shares no managers at all with what is already stored is
// not a refresh, it is a different league landing on top of this one. That is
// always worth stopping to ask about, so the ingest skips the season and says
// why instead of overwriting it.
//
// Escape hatch: set `allow_identity_replace: true` in the LEAGUE's settings
// (leagues.settings jsonb) to proceed anyway. It is deliberately not a UI
// toggle: the honest fix for a platform migration is to reconcile the two sets
// of managers, and a checkbox labelled "overwrite my history" would get
// clicked.

export type IdentityVerdict =
  | { ok: true }
  | { ok: false; existing: number; incoming: number; reason: string }

type MinimalDb = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => Promise<{ data: Array<{ manager_id: string }> | null }>
    }
  }
}

/**
 * Checks whether writing `incomingManagerIds` into `seasonId` would replace a
 * season owned by an entirely different set of managers.
 *
 * Any overlap at all is treated as the same league: a roster changes, people
 * leave, and a season that shares even one manager is a normal re-sync. Only a
 * complete disjoint set is refused.
 */
export async function checkSeasonIdentity(
  db: unknown,
  seasonId: string,
  incomingManagerIds: Iterable<string>,
  opts?: { allowReplace?: boolean }
): Promise<IdentityVerdict> {
  const incoming = new Set(incomingManagerIds)
  if (incoming.size === 0) return { ok: true }
  if (opts?.allowReplace) return { ok: true }

  let existingRows: Array<{ manager_id: string }> | null = null
  try {
    const res = await (db as MinimalDb)
      .from('manager_seasons')
      .select('manager_id')
      .eq('season_id', seasonId)
    existingRows = res.data
  } catch {
    // A guard that cannot read is a guard that must not block a sync.
    return { ok: true }
  }

  const existing = new Set((existingRows ?? []).map((r) => r.manager_id))
  if (existing.size === 0) return { ok: true }

  for (const id of incoming) {
    if (existing.has(id)) return { ok: true }
  }

  return {
    ok: false,
    existing: existing.size,
    incoming: incoming.size,
    reason: 'no manager in common with what is already stored',
  }
}

/** Sync-report line for a season the guard refused. */
export function identityWarning(year: number | string, verdict: Extract<IdentityVerdict, { ok: false }>): string {
  return (
    `Season ${year}: skipped. The ${verdict.incoming} managers this source returned share ` +
    `nothing with the ${verdict.existing} already stored for that season (${verdict.reason}), ` +
    `so writing it would have replaced the season's history with a different set of people. ` +
    `Reconcile the managers first, or set allow_identity_replace on the league to override.`
  )
}
