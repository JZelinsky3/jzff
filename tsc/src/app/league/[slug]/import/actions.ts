'use server'

// Writes hand-entered season data. The client parses the pasted text for its
// preview, but this re-parses the same raw text server-side and writes from
// that: the browser is a display, not a source of truth.
//
// Everything written here is an ordinary row (manager_seasons, matchups,
// drafts + draft_picks) so every page that already reads a season reads these
// too with no special-casing. What marks it as hand-entered is a manual_imports
// row, which is what the ingests consult before replacing a stage. See
// src/lib/ingest/manualLocks.ts.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'
import {
  parseImport,
  nameKey,
  type ImportKind,
  type StandingsRow,
  type DraftRow,
  type MatchupRow,
} from '@/lib/manualImport'

type Result<T> = ({ ok: true } & T) | { ok: false; error: string }

async function assertWriteAccess(leagueId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not signed in.' }
  const { data: league } = await supabase
    .from('leagues')
    .select('id, owner_id, slug')
    .eq('id', leagueId)
    .maybeSingle()
  if (!league) return { ok: false as const, error: 'League not found.' }
  if (league.owner_id !== user.id) {
    const { data: member } = await supabase
      .from('league_members')
      .select('role')
      .eq('league_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!member || !['owner', 'editor'].includes(member.role)) {
      if (!(await isSiteAdmin(user.id))) return { ok: false as const, error: 'No write access.' }
    }
  }
  return { ok: true as const, slug: league.slug, userId: user.id }
}

// Resolves the season row for `year`, creating it when the league has no such
// year yet — the common case for history the platform never gave us.
async function resolveSeason(db: ReturnType<typeof createAdminClient>, leagueId: string, year: number) {
  const { data: existing } = await db
    .from('seasons')
    .select('id, champion_manager_id, runner_up_manager_id, regular_season_winner_id')
    .eq('league_id', leagueId)
    .eq('year', year)
    .maybeSingle()
  if (existing) return existing
  const { data: created, error } = await db
    .from('seasons')
    .insert({ league_id: leagueId, year, external_id: `manual-${year}` })
    .select('id, champion_manager_id, runner_up_manager_id, regular_season_winner_id')
    .single()
  if (error || !created) throw new Error(`Could not create the ${year} season: ${error?.message}`)
  return created
}

/**
 * Maps every imported team name to a manager id.
 *
 * `mapping` comes from the form: name → an existing manager id, or the literal
 * 'new' to create one. A name with no entry is an error rather than a guess,
 * because attributing a season to the wrong manager is the one mistake this
 * feature must never make quietly.
 */
async function resolveManagers(
  db: ReturnType<typeof createAdminClient>,
  leagueId: string,
  names: string[],
  mapping: Record<string, string>
): Promise<{ byName: Map<string, string>; created: number }> {
  const byName = new Map<string, string>()
  let created = 0
  for (const name of names) {
    const choice = mapping[nameKey(name)] ?? mapping[name]
    if (!choice) throw new Error(`"${name}" is not matched to a manager yet.`)
    if (choice !== 'new') { byName.set(nameKey(name), choice); continue }
    // A manual manager still needs a stable external_id: it is the unique key
    // per league, and it keeps a second import of the same name idempotent.
    const externalId = `manual-${nameKey(name)}`
    const { data: existing } = await db
      .from('managers')
      .select('id')
      .eq('league_id', leagueId)
      .eq('external_id', externalId)
      .maybeSingle()
    if (existing) { byName.set(nameKey(name), existing.id); continue }
    const { data: row, error } = await db
      .from('managers')
      .insert({ league_id: leagueId, external_id: externalId, display_name: name, team_name: name })
      .select('id')
      .single()
    if (error || !row) throw new Error(`Could not create a manager for "${name}": ${error?.message}`)
    byName.set(nameKey(name), row.id)
    created++
  }
  return { byName, created }
}

async function recordImport(
  db: ReturnType<typeof createAdminClient>,
  args: { leagueId: string; seasonId: string; kind: ImportKind; rowCount: number; userId: string; note: string | null }
) {
  await db.from('manual_imports').upsert(
    {
      league_id: args.leagueId,
      season_id: args.seasonId,
      kind: args.kind,
      row_count: args.rowCount,
      note: args.note,
      created_by: args.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'season_id,kind' }
  )
}

export async function commitManualImport(input: {
  leagueId: string
  year: number
  kind: ImportKind
  text: string
  /** nameKey(team name) → manager id, or 'new' to create a manager. */
  mapping: Record<string, string>
  note?: string
}): Promise<Result<{ written: number; managersCreated: number; issues: string[] }>> {
  const access = await assertWriteAccess(input.leagueId)
  if (!access.ok) return access

  const year = Math.trunc(input.year)
  if (!Number.isFinite(year) || year < 1980 || year > 2100) {
    return { ok: false, error: 'Pick a season year between 1980 and 2100.' }
  }

  const parsed = parseImport(input.kind, input.text)
  if (parsed.rows.length === 0) {
    return { ok: false, error: 'Nothing to import: no usable rows were found in that text.' }
  }

  const db = createAdminClient()
  try {
    const season = await resolveSeason(db, input.leagueId, year)
    const { byName, created } = await resolveManagers(db, input.leagueId, parsed.teamNames, input.mapping)
    const idFor = (team: string) => {
      const id = byName.get(nameKey(team))
      if (!id) throw new Error(`"${team}" is not matched to a manager.`)
      return id
    }

    let written = 0

    if (parsed.kind === 'standings') {
      const rows = parsed.rows as StandingsRow[]
      // Last row wins for a repeated team, which is what the parser warned about.
      const byManager = new Map<string, Record<string, unknown>>()
      for (const r of rows) {
        const managerId = idFor(r.team)
        byManager.set(managerId, {
          season_id: season.id,
          manager_id: managerId,
          team_name: r.team,
          wins: r.wins,
          losses: r.losses,
          ties: r.ties,
          points_for: r.pointsFor ?? 0,
          points_against: r.pointsAgainst ?? 0,
          final_rank: r.finalRank,
          regular_rank: r.regularRank,
        })
      }
      await db.from('manager_seasons').delete().eq('season_id', season.id)
      const { error } = await db.from('manager_seasons').insert([...byManager.values()])
      if (error) throw new Error(`Writing standings failed: ${error.message}`)
      written = byManager.size

      // A season only counts as completed once it has a champion (see the
      // history pages' completed-season rule), so fill the headline ids from
      // the finishes given. Never null one out: a blank column here means
      // "not stated", not "nobody won".
      const patch: Record<string, string> = {}
      const champ = rows.find((r) => r.finalRank === 1)
      const second = rows.find((r) => r.finalRank === 2)
      const regular = rows.find((r) => r.regularRank === 1)
      if (champ) patch.champion_manager_id = idFor(champ.team)
      if (second) patch.runner_up_manager_id = idFor(second.team)
      if (regular) patch.regular_season_winner_id = idFor(regular.team)
      if (Object.keys(patch).length > 0) {
        await db.from('seasons').update(patch).eq('id', season.id)
      }
    }

    if (parsed.kind === 'matchups') {
      const rows = parsed.rows as MatchupRow[]
      // Same deterministic a/b ordering the platform ingests use (smaller uuid
      // first), so these rows share one upsert key with anything synced later
      // and matchup ids stay stable.
      const byKey = new Map<string, Record<string, unknown>>()
      for (const r of rows) {
        let a = idFor(r.teamA)
        let b = idFor(r.teamB)
        let sa = r.scoreA
        let sb = r.scoreB
        if (a === b) continue
        if (a > b) { [a, b] = [b, a]; [sa, sb] = [sb, sa] }
        byKey.set(`${r.week}|${a}|${b}`, {
          season_id: season.id,
          week: r.week,
          manager_a_id: a,
          manager_b_id: b,
          score_a: sa,
          score_b: sb,
          is_playoff: r.isPlayoff,
          is_championship: r.isChampionship,
        })
      }
      const { error } = await db.from('matchups').upsert([...byKey.values()], {
        onConflict: 'season_id,week,manager_a_id,manager_b_id',
      })
      if (error) throw new Error(`Writing matchups failed: ${error.message}`)
      written = byKey.size
    }

    if (parsed.kind === 'drafts') {
      const rows = parsed.rows as DraftRow[]
      // One curated draft per season. The 'curated-' prefix is what makes it
      // outrank a scraped draft everywhere (see lib/canonicalDraft) and what
      // keeps every ingest from deleting it.
      const externalId = `curated-manual-${year}`
      await db.from('drafts').delete().eq('season_id', season.id).eq('external_id', externalId)
      const rounds = rows.reduce((max, r) => Math.max(max, r.round), 0)
      const { data: draftRow, error: draftErr } = await db
        .from('drafts')
        .insert({ season_id: season.id, external_id: externalId, draft_type: 'manual', rounds })
        .select('id')
        .single()
      if (draftErr || !draftRow) throw new Error(`Writing the draft failed: ${draftErr?.message}`)

      const byPick = new Map<number, Record<string, unknown>>()
      for (const r of rows) {
        byPick.set(r.pick, {
          draft_id: draftRow.id,
          round: r.round,
          pick: r.pick,
          manager_id: idFor(r.team),
          player_name: r.player,
          position: r.position,
          nfl_team: r.nflTeam,
        })
      }
      const { error } = await db.from('draft_picks').insert([...byPick.values()])
      if (error) throw new Error(`Writing draft picks failed: ${error.message}`)
      written = byPick.size
    }

    await recordImport(db, {
      leagueId: input.leagueId,
      seasonId: season.id,
      kind: parsed.kind,
      rowCount: written,
      userId: access.userId,
      note: input.note?.trim() || null,
    })

    revalidatePath(`/league/${access.slug}/import`)
    revalidatePath(`/league/${access.slug}`)
    return {
      ok: true,
      written,
      managersCreated: created,
      issues: parsed.issues.map((i) => (i.line ? `Line ${i.line}: ${i.message}` : i.message)),
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Import failed.' }
  }
}

/** Drops a hand-entered stage and its lock, so a platform sync can own it again. */
export async function removeManualImport(input: {
  leagueId: string
  seasonId: string
  kind: ImportKind
  deleteRows: boolean
}): Promise<Result<unknown>> {
  const access = await assertWriteAccess(input.leagueId)
  if (!access.ok) return access
  const db = createAdminClient()

  if (input.deleteRows) {
    if (input.kind === 'standings') await db.from('manager_seasons').delete().eq('season_id', input.seasonId)
    if (input.kind === 'matchups') await db.from('matchups').delete().eq('season_id', input.seasonId)
    if (input.kind === 'drafts') {
      await db.from('drafts').delete().eq('season_id', input.seasonId).like('external_id', 'curated-manual-%')
    }
  }
  await db.from('manual_imports').delete().eq('season_id', input.seasonId).eq('kind', input.kind)
  revalidatePath(`/league/${access.slug}/import`)
  return { ok: true }
}
