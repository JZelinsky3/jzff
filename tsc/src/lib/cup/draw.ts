// The League Cup draw: makes every league's Cup on draw day. Each league
// with a live season in the launch year and no Cup yet gets a league_cups
// row, seeded on the Cup Rating (ratingSeeds) through the seeding week.
//
// Run by .github/workflows/cron.yml (cup-draw): first just after the
// announced draw time, then again after the Wednesday refresh and on
// Thursday morning, for any league whose seeding week wasn't final yet.
// Nothing happens before CUP_LAUNCH.drawAt, so the bracket never appears
// ahead of the countdown, and nothing after DRAW_WINDOW_MS, so a league
// that never got its scores doesn't get a Cup whose first round is already
// played. A league's row is written once: the unique key and the "already
// has one" check make every run after the first a no-op for it.
//
// Leagues can be left out with `cup: false` in their season's settings
// (no UI yet; set by hand).

import { createAdminClient } from '@/lib/supabase/admin'
import { ratingSeeds, roundNames } from './bracket'
import { CUP_LAUNCH } from './launch'

// Draw-day plus four days: up to Sunday morning of round one's week.
const DRAW_WINDOW_MS = 4 * 24 * 60 * 60 * 1000

export type CupDrawResult = {
  // before: too early, nothing done. open: drawing. closed: too late.
  phase: 'before' | 'open' | 'closed'
  dry: boolean
  drawn: { slug: string; field: number; weeks: number[]; top: { seed: number; manager_id: string; rating: number | null }[] }[]
  // Not drawn yet, will be tried again on the next run.
  waiting: { slug: string; reason: string }[]
  // Never drawn by this job.
  skipped: { slug: string; reason: string }[]
  warnings: string[]
}

type Opts = {
  now?: number
  // Work out every league's draw but write nothing (any time: the window
  // is ignored, so it can be checked ahead of draw day).
  dry?: boolean
  // Only this league.
  slug?: string | null
  // Dry runs only: seed through this week instead of the launch's (to see
  // the draw as it would come out today, weeks before the seeding week).
  through?: number | null
}

export async function runCupDraw(opts: Opts = {}): Promise<CupDrawResult> {
  const now = opts.now ?? Date.now()
  const at = Date.parse(CUP_LAUNCH.drawAt)
  const phase: CupDrawResult['phase'] = now < at ? 'before' : now < at + DRAW_WINDOW_MS ? 'open' : 'closed'
  const out: CupDrawResult = { phase, dry: !!opts.dry, drawn: [], waiting: [], skipped: [], warnings: [] }
  if (phase !== 'open' && !opts.dry) return out
  const through = opts.dry && opts.through ? opts.through : CUP_LAUNCH.seededThrough

  const db = createAdminClient()
  const { data: seasons, error } = await db
    .from('seasons')
    .select('id, league_id, settings')
    .eq('year', CUP_LAUNCH.year)
    .eq('is_live', true)
  if (error) {
    out.warnings.push(`seasons: ${error.message}`)
    return out
  }
  const leagueIds = [...new Set((seasons ?? []).map((s) => s.league_id as string))]
  if (!leagueIds.length) return out
  const [{ data: leagues }, { data: cups }] = await Promise.all([
    db.from('leagues').select('id, slug').in('id', leagueIds),
    db.from('league_cups').select('league_id').eq('season_year', CUP_LAUNCH.year).in('league_id', leagueIds),
  ])
  const slugOf = new Map((leagues ?? []).map((l) => [l.id as string, l.slug as string]))
  const hasCup = new Set((cups ?? []).map((c) => c.league_id as string))

  for (const season of seasons ?? []) {
    const leagueId = season.league_id as string
    const slug = slugOf.get(leagueId) ?? leagueId
    if (opts.slug && slug !== opts.slug) continue
    const settings = (season.settings ?? {}) as Record<string, unknown>
    if (hasCup.has(leagueId)) {
      out.skipped.push({ slug, reason: 'already has a Cup this year' })
      continue
    }
    if (settings.cup === false) {
      out.skipped.push({ slug, reason: 'left out (settings.cup = false)' })
      continue
    }

    const { data: rows, error: gamesError } = await db
      .from('matchups')
      .select('week, manager_a_id, manager_b_id, score_a, score_b, is_playoff')
      .eq('season_id', season.id)
      .lte('week', through)
    if (gamesError) {
      out.waiting.push({ slug, reason: `matchups: ${gamesError.message}` })
      continue
    }
    // A settled week: every game has two real scores (the recap's test).
    const byWeek = new Map<number, { week: number; a: string; b: string; sa: number | null; sb: number | null }[]>()
    for (const g of rows ?? []) {
      if (g.is_playoff) continue
      const w = g.week as number
      byWeek.set(w, [
        ...(byWeek.get(w) ?? []),
        { week: w, a: g.manager_a_id as string, b: g.manager_b_id as string, sa: g.score_a == null ? null : Number(g.score_a), sb: g.score_b == null ? null : Number(g.score_b) },
      ])
    }
    const settled = (w: number) => {
      const list = byWeek.get(w) ?? []
      return list.length > 0 && list.every((g) => g.sa != null && g.sb != null && g.sa > 0 && g.sb > 0)
    }
    if (!settled(through)) {
      out.waiting.push({ slug, reason: `week ${through} not final` })
      continue
    }
    const weeks = [...byWeek.keys()].filter(settled).sort((a, b) => a - b)
    const counted = weeks.flatMap((w) => byWeek.get(w)!.map((g) => ({ week: g.week, a: g.a, b: g.b, sa: g.sa!, sb: g.sb! })))
    const seeds = ratingSeeds(counted)
    if (seeds.length < 4) {
      out.skipped.push({ slug, reason: `${seeds.length} teams, a Cup needs 4` })
      continue
    }
    if (weeks.length < through) {
      out.warnings.push(`${slug}: rated on weeks ${weeks.join(', ')} (the others aren't settled)`)
    }
    // The Cup's last round has to come before the league's playoffs, when
    // teams that are out stop having games (and so Cup scores).
    const finalWeek = CUP_LAUNCH.startWeek + roundNames(seeds.length).length - 1
    const playoffsFrom = Number(settings.playoff_week_start ?? NaN)
    if (Number.isFinite(playoffsFrom) && playoffsFrom > 0 && playoffsFrom <= finalWeek) {
      out.skipped.push({ slug, reason: `playoffs start week ${playoffsFrom}, before the Cup final (week ${finalWeek})` })
      continue
    }

    if (!opts.dry) {
      const { error: insertError } = await db.from('league_cups').upsert(
        {
          league_id: leagueId,
          season_year: CUP_LAUNCH.year,
          name: CUP_LAUNCH.name,
          start_week: CUP_LAUNCH.startWeek,
          seeded_through: CUP_LAUNCH.seededThrough,
          seeds,
        },
        { onConflict: 'league_id,season_year,start_week', ignoreDuplicates: true },
      )
      if (insertError) {
        out.waiting.push({ slug, reason: `insert: ${insertError.message}` })
        continue
      }
    }
    out.drawn.push({
      slug,
      field: seeds.length,
      weeks,
      top: seeds.slice(0, 3).map((s) => ({ seed: s.seed, manager_id: s.manager_id, rating: s.rating ?? null })),
    })
  }
  return out
}
