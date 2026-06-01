// Deep chronicle aggregator for the Manager Hub.
//
// Builds on loadCareerSummary() (totals, rivalries, best/worst games) and
// pulls each linked league's exportLeague bundle so chapter pages can quote
// specific draft picks, signature playoff runs, weekly highs/lows, etc.
//
// Bundles are wrapped with unstable_cache keyed by league_id and share the
// `league-<id>` revalidation tag the sync route uses — so re-syncing a
// league invalidates the chronicle automatically.

import { unstable_cache } from 'next/cache'
import { exportLeague, type ExportBundle } from '@/lib/export/pams'
import { devCacheGet, devCacheSet } from '@/lib/devCache'
import { loadCareerSummary, type CareerSummary } from '@/lib/manager/career'
import { createClient } from '@/lib/supabase/server'

export type ChroniclePick = {
  leagueName: string
  leagueSlug: string
  year: number
  overall: number
  round: number
  roundPick: number
  player: string
  position: string | null
  nflTeam: string | null
  finalRank: number | null
  teamSize: number
}

export type ChronicleTitleRun = {
  leagueName: string
  leagueSlug: string
  year: number
  finish: 1 | 2
  finalRank: number
  regRecord: string
  playoffRecord: string
  playoffPf: number
  playoffPa: number
  totalPf: number
  highWeek: number | null
  highWeekScore: number | null
  titleOpponent: string | null
  titleScoreFor: number | null
  titleScoreAgainst: number | null
}

export type ChronicleSeasonBrief = {
  leagueName: string
  leagueSlug: string
  year: number
  teamName: string | null
  regRecord: string
  finalRank: number | null
  regRank: number | null
  champion: boolean
  runnerUp: boolean
  playoffs: boolean
  highWeek: number | null
  highWeekScore: number | null
  lowWeekScore: number | null
  avgPpg: number | null
  totalPf: number | null
}

export type ChronicleWeekly = {
  leagueName: string
  leagueSlug: string
  year: number
  week: number
  score: number
  opp: string | null
  oppScore: number | null
  result: 'W' | 'L' | 'T'
  isPlayoff: boolean
}

export type ChronicleStreak = {
  leagueName: string
  leagueSlug: string
  kind: 'win' | 'loss'
  length: number
  when: string
}

export type ChronicleH2H = {
  leagueName: string
  leagueSlug: string
  opponent: string
  regRecord: string
  playoffRecord: string
  totalGames: number
  totalRecord: string
}

export type CareerChronicle = CareerSummary & {
  picks: ChroniclePick[]
  titleRuns: ChronicleTitleRun[]
  seasonBriefs: ChronicleSeasonBrief[]
  weeklyHighs: ChronicleWeekly[]
  weeklyLows: ChronicleWeekly[]
  streaks: ChronicleStreak[]
  h2hPerLeague: ChronicleH2H[]
}

function getBundle(leagueId: string, slug: string): Promise<ExportBundle> {
  if (process.env.NODE_ENV !== 'production') {
    const key = `${leagueId}|${slug}`
    const hit = devCacheGet(key)
    if (hit) return Promise.resolve(hit)
    return exportLeague(leagueId, { slug }).then((b) => {
      devCacheSet(key, b)
      return b
    })
  }
  return unstable_cache(
    async () => exportLeague(leagueId, { slug }),
    ['pams-bundle', 'v46', leagueId, slug],
    { tags: [`league-${leagueId}`], revalidate: 3600 },
  )()
}

type ManagerFile = {
  user_id?: string
  name?: string
  reg_record?: string
  playoff_record?: string
  season_ledger?: Array<{
    year: number
    team_name: string | null
    final_rank: number | null
    reg_season_rank: number | null
    reg_record: string
    reg_pf: number
    reg_pa: number
    playoff_record: string
    playoff_games: number
    playoff_pf: number
    total_pf: number
    avg_ppg: number
    high_week_score: number
    low_week_score: number
    high_week?: number
  }>
  longest_win_streak: { length: number; when: string } | null
  longest_loss_streak: { length: number; when: string } | null
  h2h?: Array<{
    opp_name: string
    reg_record: string
    playoff_record: string
    total_record: string
    total_games: number
  }>
}

type DraftFile = {
  year: number
  team_count: number
  finishes: Record<string, number | null>
  picks: Array<{
    overall_pick: number
    round: number
    round_pick: number
    player_name: string
    position: string | null
    nfl_team: string | null
    manager_name: string | null
    user_id: string | null
  }>
}

type LeagueFile = {
  defending_champion?: { title_opponent_name?: string | null; title_score_for?: number | null; title_score_against?: number | null; year?: number } | null
}

export async function loadCareerChronicle(slug: string, ownerId: string): Promise<CareerChronicle | null> {
  const career = await loadCareerSummary(slug, ownerId)
  if (!career) return null

  const supabase = await createClient()
  const { data: links } = await supabase
    .from('career_links')
    .select('league_id, manager_external_id, league:leagues!inner(id, slug, name)')
    .eq('chronicle_id', career.chronicle.id)

  type LinkRow = { league_id: string; manager_external_id: string; league: { id: string; slug: string; name: string } }
  const linkRows = (links ?? []) as unknown as LinkRow[]

  const picks: ChroniclePick[] = []
  const titleRuns: ChronicleTitleRun[] = []
  const seasonBriefs: ChronicleSeasonBrief[] = []
  const weeklyHighs: ChronicleWeekly[] = []
  const weeklyLows: ChronicleWeekly[] = []
  const streaks: ChronicleStreak[] = []
  const h2hPerLeague: ChronicleH2H[] = []

  await Promise.all(
    linkRows.map(async (link) => {
      const leagueSummary = career.leagues.find((l) => l.leagueId === link.league_id)
      if (!leagueSummary || leagueSummary.status !== 'ready') return
      let bundle: ExportBundle
      try {
        bundle = await getBundle(link.league_id, link.league.slug)
      } catch {
        return
      }
      const me = link.manager_external_id

      // Per-manager file: season ledger, h2h, streaks.
      const mgrFile = bundle[`managers/${me}.json`] as ManagerFile | undefined
      if (mgrFile?.season_ledger) {
        for (const sl of mgrFile.season_ledger) {
          const finish = career.leagues.find((l) => l.leagueId === link.league_id)
            ?.finishes.find((f) => f.year === sl.year)
          const champ = finish?.champion ?? false
          const runner = !champ && (sl.final_rank === 2)
          seasonBriefs.push({
            leagueName: link.league.name,
            leagueSlug: link.league.slug,
            year: sl.year,
            teamName: sl.team_name,
            regRecord: sl.reg_record,
            finalRank: sl.final_rank,
            regRank: sl.reg_season_rank,
            champion: champ,
            runnerUp: runner,
            playoffs: finish?.madePlayoffs ?? sl.playoff_games > 0,
            highWeek: sl.high_week ?? null,
            highWeekScore: sl.high_week_score || null,
            lowWeekScore: sl.low_week_score || null,
            avgPpg: sl.avg_ppg || null,
            totalPf: sl.total_pf || null,
          })
        }
      }
      if (mgrFile?.longest_win_streak) {
        streaks.push({
          leagueName: link.league.name,
          leagueSlug: link.league.slug,
          kind: 'win',
          length: mgrFile.longest_win_streak.length,
          when: mgrFile.longest_win_streak.when,
        })
      }
      if (mgrFile?.longest_loss_streak) {
        streaks.push({
          leagueName: link.league.name,
          leagueSlug: link.league.slug,
          kind: 'loss',
          length: mgrFile.longest_loss_streak.length,
          when: mgrFile.longest_loss_streak.when,
        })
      }
      if (mgrFile?.h2h) {
        for (const row of mgrFile.h2h) {
          h2hPerLeague.push({
            leagueName: link.league.name,
            leagueSlug: link.league.slug,
            opponent: row.opp_name,
            regRecord: row.reg_record,
            playoffRecord: row.playoff_record,
            totalGames: row.total_games,
            totalRecord: row.total_record,
          })
        }
      }

      // Title runs: cross-reference each titleYears entry with the season brief.
      for (const yr of leagueSummary.titleYears) {
        const brief = mgrFile?.season_ledger?.find((s) => s.year === yr)
        if (!brief) continue
        const leagueJson = bundle['league.json'] as LeagueFile | undefined
        const defending = leagueJson?.defending_champion?.year === yr ? leagueJson.defending_champion : null
        titleRuns.push({
          leagueName: link.league.name,
          leagueSlug: link.league.slug,
          year: yr,
          finish: 1,
          finalRank: 1,
          regRecord: brief.reg_record,
          playoffRecord: brief.playoff_record || '0-0',
          playoffPf: brief.playoff_pf,
          playoffPa: 0,
          totalPf: brief.total_pf,
          highWeek: brief.high_week ?? null,
          highWeekScore: brief.high_week_score || null,
          titleOpponent: defending?.title_opponent_name ?? null,
          titleScoreFor: defending?.title_score_for ?? null,
          titleScoreAgainst: defending?.title_score_against ?? null,
        })
      }
      // Runner-up runs.
      for (const f of leagueSummary.finishes) {
        if (f.rank !== 2 || f.champion) continue
        const brief = mgrFile?.season_ledger?.find((s) => s.year === f.year)
        if (!brief) continue
        titleRuns.push({
          leagueName: link.league.name,
          leagueSlug: link.league.slug,
          year: f.year,
          finish: 2,
          finalRank: 2,
          regRecord: brief.reg_record,
          playoffRecord: brief.playoff_record || '0-0',
          playoffPf: brief.playoff_pf,
          playoffPa: 0,
          totalPf: brief.total_pf,
          highWeek: brief.high_week ?? null,
          highWeekScore: brief.high_week_score || null,
          titleOpponent: null,
          titleScoreFor: null,
          titleScoreAgainst: null,
        })
      }

      // Drafts: find every pick whose manager == me, attach my finish that year.
      for (const [k, v] of Object.entries(bundle)) {
        if (!k.startsWith('drafts/') || !k.endsWith('.json') || k === 'drafts/drafts_directory.json') continue
        const draft = v as DraftFile
        const finishKey = draft.picks.find((p) => p.user_id === me)?.manager_name ?? null
        for (const p of draft.picks) {
          if (p.user_id !== me) continue
          picks.push({
            leagueName: link.league.name,
            leagueSlug: link.league.slug,
            year: draft.year,
            overall: p.overall_pick,
            round: p.round,
            roundPick: p.round_pick,
            player: p.player_name,
            position: p.position,
            nflTeam: p.nfl_team,
            finalRank: finishKey ? (draft.finishes[finishKey] ?? null) : null,
            teamSize: draft.team_count,
          })
        }
      }

      // Weekly highs / lows from season_ledger — we already have one per season.
      if (mgrFile?.season_ledger) {
        for (const sl of mgrFile.season_ledger) {
          if (sl.high_week_score) {
            weeklyHighs.push({
              leagueName: link.league.name,
              leagueSlug: link.league.slug,
              year: sl.year,
              week: sl.high_week ?? 0,
              score: sl.high_week_score,
              opp: null,
              oppScore: null,
              result: 'W',
              isPlayoff: false,
            })
          }
          if (sl.low_week_score) {
            weeklyLows.push({
              leagueName: link.league.name,
              leagueSlug: link.league.slug,
              year: sl.year,
              week: 0,
              score: sl.low_week_score,
              opp: null,
              oppScore: null,
              result: 'L',
              isPlayoff: false,
            })
          }
        }
      }
    }),
  )

  // Sort the various lists for chapter pages.
  picks.sort((a, b) => a.year - b.year || a.overall - b.overall)
  titleRuns.sort((a, b) => b.year - a.year)
  seasonBriefs.sort((a, b) => b.year - a.year || a.leagueName.localeCompare(b.leagueName))
  weeklyHighs.sort((a, b) => b.score - a.score)
  weeklyLows.sort((a, b) => a.score - b.score)
  streaks.sort((a, b) => b.length - a.length)
  h2hPerLeague.sort((a, b) => b.totalGames - a.totalGames)

  return {
    ...career,
    picks,
    titleRuns,
    seasonBriefs,
    weeklyHighs: weeklyHighs.slice(0, 12),
    weeklyLows: weeklyLows.slice(0, 12),
    streaks,
    h2hPerLeague,
  }
}
