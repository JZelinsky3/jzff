// Sunday Live orchestrator.
//
// Pulls the league row from Supabase, dispatches to the right platform for live
// sides, layers WP / Sweat / NFL games / wire / ticker / inactives / stacks on
// top, persists a snapshot (debounced), and returns the full SlLeague payload
// every component reads from.

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentWeek } from '@/lib/liveSeason'
import { sleeper } from '@/lib/platforms/sleeper'
import { fetchScoreboard, fetchNflNews, normTeam, type NflGame, type NflArticle } from '@/lib/nflLive'
import type { LoadOptions, LoadResult, Platform, SlLeague, SlMatchup, SlNflGame, SlSide, WireEvent, InactiveAlert, StackUnit, TickerBoard, TickerEntry, TickerScope } from './types'
import { platformFor, type PlatformLeagueRef } from './platforms'
import { winProbA, deriveProgress } from './wp'
import { sweatIndex } from './sweat'
import { detectMoments } from './moments'
import { readLatestFrame, writeFrame } from './snapshots'
import { attachPickems } from './pickems'
import { buildPowerPulse } from './powerPulse'

const POLL_MS = 30 * 1000

export async function loadSundayLive(slug: string, opts: LoadOptions = {}): Promise<LoadResult> {
  const db = createAdminClient()
  const { data: leagueRow } = await db
    .from('leagues')
    .select('id, name, platform, slug')
    .eq('slug', slug)
    .maybeSingle()
  if (!leagueRow) return { ok: false, reason: 'League not found' }

  const { data: seasonRow } = await db
    .from('seasons')
    .select('external_id, year, settings')
    .eq('league_id', leagueRow.id)
    .eq('is_live', true)
    .maybeSingle()
  if (!seasonRow) {
    return { ok: false, reason: 'No live season configured for this league.' }
  }

  // Determine week: demo override → settings.current_week → calendar derivation.
  const week = opts.demo?.week ?? resolveCurrentWeek(seasonRow.settings as Record<string, unknown>)
  const year = opts.demo?.year ?? (seasonRow.year as number)
  if (week == null || week < 1) {
    return { ok: false, reason: 'Live week not yet set for this season.' }
  }

  const externalLeagueId = seasonRow.external_id as string | null
  if (!externalLeagueId) return { ok: false, reason: 'Live league id missing.' }

  // Roster positions are needed to label starter slots. Sleeper-only for now.
  let rosterPositions: string[] = []
  if (leagueRow.platform === 'sleeper') {
    const lg = await sleeper.league(externalLeagueId)
    rosterPositions = ((lg as unknown as { roster_positions?: string[] })?.roster_positions ?? [])
  }

  const ref: PlatformLeagueRef = {
    leagueId: leagueRow.id as string,
    externalLeagueId,
    ownerId: null,
    name: leagueRow.name as string,
    week,
    rosterPositions,
  }
  const frame = await platformFor(leagueRow.platform as Platform).fetchFrame(ref)
  if (!frame.supported) {
    return { ok: false, reason: frame.reason }
  }

  // Cross-reference data (live, but cheap).
  const [scoreboard, news] = await Promise.all([
    fetchScoreboard().catch(() => ({ games: [] as NflGame[], week: null, season: null, fetchedAt: new Date().toISOString() })),
    fetchNflNews().catch(() => ({ articles: [] as NflArticle[], fetchedAt: new Date().toISOString() })),
  ])

  // Sunday progress: fraction of starters whose games are not pre-game.
  const allStarters = frame.sides.flatMap((s) => s.players.filter((p) => p.isStarter))
  const finishedStarters = allStarters.filter((p) => p.game?.state === 'final').length
  const liveStarters = allStarters.filter((p) => p.game?.state === 'live').length
  const progress = opts.demo
    ? opts.demo.progress
    : deriveProgress(finishedStarters, allStarters.length, liveStarters / Math.max(1, allStarters.length))

  // Pair sides into matchups.
  const sidesByMatchup = new Map<number, SlSide[]>()
  for (const s of frame.sides) {
    const mid = frame.rosterIdToMatchup[s.rosterId]
    if (mid == null) continue
    const list = sidesByMatchup.get(mid) ?? []
    list.push(s)
    sidesByMatchup.set(mid, list)
  }

  const matchups: SlMatchup[] = []
  for (const [matchupId, rs] of sidesByMatchup.entries()) {
    if (rs.length !== 2) continue
    rs.sort((x, y) => x.rosterId - y.rosterId)
    const [aRaw, bRaw] = rs
    const status = matchupStatus(aRaw, bRaw)
    const wp = winProbA({
      scoreA: aRaw.score,
      scoreB: bRaw.score,
      projA: aRaw.projected,
      projB: bRaw.projected,
      progress,
    })
    const a: SlSide = { ...aRaw, wp }
    const b: SlSide = { ...bRaw, wp: 1 - wp }
    const closeness = Math.abs(a.score - b.score)
    const sweat = sweatIndex({
      closeness,
      wp,
      progress,
      playersRemainingA: a.playersRemaining,
      playersRemainingB: b.playersRemaining,
      status,
    })
    matchups.push({
      matchupId,
      status,
      a,
      b,
      closeness,
      sweatIndex: sweat,
      pickems: null,            // Phase 5
      stack: deriveStacks(a, b),
    })
  }
  // Sort by sweat first, then live before pre before final.
  matchups.sort((x, y) => {
    const statusRank = (m: SlMatchup) => (m.status === 'live' ? 0 : m.status === 'pre' ? 1 : 2)
    return statusRank(x) - statusRank(y) || y.sweatIndex - x.sweatIndex
  })

  // Attach pickems badges (silent no-op if no pickems data or name match miss).
  await attachPickems(slug, matchups).catch(() => undefined)

  // Top-5 power pulse — silent no-op if rankings unavailable.
  const powerPulse = await buildPowerPulse(slug, matchups).catch(() => [])

  // NFL game strip with rostered-player annotations.
  const rosteredByTeam = new Map<string, { onField: string[]; redZone: string[] }>()
  for (const s of frame.sides) {
    for (const p of s.players) {
      if (!p.isStarter || !p.team) continue
      const slot = rosteredByTeam.get(p.team) ?? { onField: [], redZone: [] }
      if (p.game?.onField) slot.onField.push(p.name)
      if (p.game?.inRedZone) slot.redZone.push(p.name)
      rosteredByTeam.set(p.team, slot)
    }
  }
  const nflGames: SlNflGame[] = scoreboard.games.map((g) => {
    const annotsHome = rosteredByTeam.get(g.home.abbr ?? '') ?? { onField: [], redZone: [] }
    const annotsAway = rosteredByTeam.get(g.away.abbr ?? '') ?? { onField: [], redZone: [] }
    const onField = [...annotsHome.onField, ...annotsAway.onField]
    const redZone = [...annotsHome.redZone, ...annotsAway.redZone]
    return {
      id: g.id,
      state: g.state === 'in' ? 'live' : g.state === 'post' ? 'final' : 'pre',
      short: g.shortDetail,
      date: g.date,
      homeAbbr: g.home.abbr,
      awayAbbr: g.away.abbr,
      homeFull: g.home.name,
      awayFull: g.away.name,
      homeScore: g.home.score,
      awayScore: g.away.score,
      possessionAbbr: g.possessionAbbr,
      isRedZone: g.isRedZone,
      lastPlay: g.lastPlay,
      downDistance: g.downDistance,
      broadcast: g.broadcast,
      onFieldLeagueStarters: onField,
      redZoneLeagueStarters: redZone,
      hasLeagueStarter: onField.length + redZone.length > 0 || rosteredByTeam.has(g.home.abbr ?? '') || rosteredByTeam.has(g.away.abbr ?? ''),
    }
  })
  // Rostered-player games first.
  nflGames.sort((a, b) => Number(b.hasLeagueStarter) - Number(a.hasLeagueStarter))

  // Wire — current poll only; load.ts persists no event history (snapshot diff
  // in moments.ts handles cross-poll continuity).
  const wire = buildWire(matchups, nflGames, news.articles, frame.sides)

  // Ticker top performers.
  const ticker = buildTicker(frame.sides)

  // Inactives radar.
  const inactives = buildInactives(frame.sides)

  // League-wide stacks across every matchup.
  const stacks = matchups.flatMap((m) => m.stack).sort((a, b) => b.combined - a.combined).slice(0, 6)

  // Phase derivation.
  const phase = derivePhase(matchups, progress)

  const draftFrame: SlLeague = {
    league: {
      id: leagueRow.id as string,
      slug,
      name: leagueRow.name as string,
      platform: leagueRow.platform as Platform,
      week,
      year,
      liveQuality: frame.liveQuality,
      phase,
    },
    matchups,
    nflGames,
    wire,
    moments: [],            // populated immediately below
    ticker,
    inactives,
    stacks,
    powerPulse,
    halftimeReport: null,
    meta: {
      fetchedAt: new Date().toISOString(),
      pollMs: POLL_MS,
      demo: opts.demo ?? null,
    },
  }

  // Big Moments — diff against the last persisted frame.
  const prevFrame = await readLatestFrame(leagueRow.id as string, year, week).catch(() => null)
  draftFrame.moments = detectMoments(draftFrame, prevFrame, wire)

  // Persist (debounced) unless caller asked to skip.
  if (!opts.noSnapshot && !opts.demo) {
    await writeFrame(leagueRow.id as string, year, week, draftFrame).catch(() => {})
  }

  return { ok: true, league: draftFrame }
}

function matchupStatus(a: SlSide, b: SlSide): SlMatchup['status'] {
  const sides = [a, b]
  const anyLive = sides.some((s) => s.players.some((p) => p.isStarter && p.game?.state === 'live'))
  if (anyLive) return 'live'
  const allFinal = sides.every((s) => s.players.filter((p) => p.isStarter).every((p) => p.game?.state === 'final' || !p.game))
  if (allFinal && (a.score > 0 || b.score > 0)) return 'final'
  return 'pre'
}

function deriveStacks(a: SlSide, b: SlSide): StackUnit[] {
  const out: StackUnit[] = []
  for (const side of [a, b]) {
    const byTeam = new Map<string, { qb: typeof side.players[number] | null; rec: typeof side.players[number][] }>()
    for (const p of side.players) {
      if (!p.isStarter || !p.team) continue
      const slot = byTeam.get(p.team) ?? { qb: null, rec: [] }
      if (p.position === 'QB') slot.qb = p
      else if (p.position === 'WR' || p.position === 'TE' || p.position === 'RB') slot.rec.push(p)
      byTeam.set(p.team, slot)
    }
    for (const [team, slot] of byTeam.entries()) {
      if (!slot.qb || slot.rec.length === 0) continue
      const players = [slot.qb, ...slot.rec].map((p) => ({ name: p.name, position: p.position ?? '', points: p.points }))
      const combined = players.reduce((s, p) => s + p.points, 0)
      out.push({ ownerName: side.ownerName, team, players, combined })
    }
  }
  return out.sort((x, y) => y.combined - x.combined)
}

function derivePhase(matchups: SlMatchup[], progress: number): SlLeague['league']['phase'] {
  if (matchups.length === 0) return 'idle'
  const live = matchups.some((m) => m.status === 'live')
  if (live) return 'live'
  const allFinal = matchups.every((m) => m.status === 'final')
  if (allFinal) return 'finished'
  if (progress < 0.05) return 'pre-kickoff'
  return 'idle'
}

function buildWire(
  matchups: SlMatchup[],
  nflGames: SlNflGame[],
  articles: NflArticle[],
  sides: SlSide[],
): WireEvent[] {
  const out: WireEvent[] = []

  // Kickoffs + finals from the NFL strip.
  for (const g of nflGames) {
    if (g.state === 'live' && g.homeScore + g.awayScore === 0) {
      out.push({
        key: `kick-${g.id}`,
        at: new Date().toISOString(),
        kind: 'kickoff',
        headline: `KICKOFF · ${g.awayAbbr} @ ${g.homeAbbr}`,
        detail: null,
        affiliation: g.hasLeagueStarter ? 'league' : 'nfl',
      })
    }
    if (g.state === 'final') {
      out.push({
        key: `final-${g.id}`,
        at: new Date().toISOString(),
        kind: 'final',
        headline: `FINAL · ${g.awayAbbr} ${g.awayScore} @ ${g.homeAbbr} ${g.homeScore}`,
        detail: null,
        affiliation: g.hasLeagueStarter ? 'league' : 'nfl',
      })
    }
  }

  // Inactives (started by someone).
  for (const s of sides) {
    for (const p of s.players) {
      if (!p.isStarter) continue
      const st = (p.injuryStatus || '').toLowerCase()
      if (st.startsWith('out') || st === 'ir' || st === 'pup' || st.startsWith('sus')) {
        out.push({
          key: `inactive-${p.playerId}`,
          at: new Date().toISOString(),
          kind: 'inactive',
          headline: `${p.name} ruled ${p.injuryStatus} — started by ${s.ownerName}`,
          detail: null,
          affiliation: 'league',
        })
      }
    }
  }

  // ESPN news that mentions a rostered player.
  const rosterByName = new Map<string, string>()
  for (const s of sides) for (const p of s.players) rosterByName.set(normName(p.name), s.ownerName)
  for (const a of articles.slice(0, 20)) {
    const hit = a.athletes.find((n) => rosterByName.has(normName(n)))
    if (!hit) continue
    out.push({
      key: `news-${a.id}`,
      at: a.published || new Date().toISOString(),
      kind: 'note',
      headline: a.headline,
      detail: `${hit} · ${rosterByName.get(normName(hit)) ?? ''}`,
      affiliation: 'league',
    })
  }

  void matchups
  out.sort((a, b) => b.at.localeCompare(a.at))
  return out.slice(0, 50)
}

const normName = (s: string) =>
  s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()

function buildTicker(sides: SlSide[]): TickerBoard {
  type Row = TickerEntry & { _pos: string | null; _started: boolean }
  const all: Row[] = []
  for (const s of sides) {
    for (const p of s.players) {
      all.push({
        rank: 0,
        playerId: p.playerId,
        name: p.name,
        team: p.team,
        position: p.position,
        points: p.points,
        projDelta: p.points - p.projected,
        startedByOwner: p.isStarter ? s.ownerName : null,
        benchedByOwner: p.isStarter ? null : s.ownerName,
        freeAgent: false,
        _pos: p.position,
        _started: p.isStarter,
      })
    }
  }
  const overall = topBy(all, () => true)
  const board: TickerBoard = {
    all: overall,
    qb:    topBy(all, (r) => r._pos === 'QB'),
    rb:    topBy(all, (r) => r._pos === 'RB'),
    wr:    topBy(all, (r) => r._pos === 'WR'),
    te:    topBy(all, (r) => r._pos === 'TE'),
    k:     topBy(all, (r) => r._pos === 'K'),
    def:   topBy(all, (r) => r._pos === 'DEF'),
    bench: topBy(all, (r) => !r._started),
    duds:  topBy(all, (r) => r._started, true),
  }
  for (const key of Object.keys(board) as TickerScope[]) {
    board[key] = board[key].map((r) => ({
      rank: r.rank,
      playerId: r.playerId,
      name: r.name,
      team: r.team,
      position: r.position,
      points: r.points,
      projDelta: r.projDelta,
      startedByOwner: r.startedByOwner,
      benchedByOwner: r.benchedByOwner,
      freeAgent: r.freeAgent,
    }))
  }
  return board

  function topBy<T extends Row>(arr: T[], pred: (r: T) => boolean, asc = false): T[] {
    // 30 per scope — the bottom ticker slices to its visible window; the
    // /players/ leaderboard renders the full set.
    const out = arr.filter(pred).sort((x, y) => asc ? x.points - y.points : y.points - x.points).slice(0, 30)
    return out.map((r, i) => ({ ...r, rank: i + 1 }))
  }
}

function buildInactives(sides: SlSide[]): InactiveAlert[] {
  const out: InactiveAlert[] = []
  for (const s of sides) {
    for (const p of s.players) {
      const st = p.injuryStatus
      if (!st) continue
      const u = st.toLowerCase()
      if (u === 'healthy' || u === 'active' || u === 'na') continue
      out.push({
        name: p.name,
        position: p.position,
        team: p.team,
        ownerName: s.ownerName,
        status: st,
        isStarter: p.isStarter,
      })
    }
  }
  out.sort((a, b) => Number(b.isStarter) - Number(a.isStarter) || a.name.localeCompare(b.name))
  return out
}

void normTeam // referenced for type-checking the import chain
