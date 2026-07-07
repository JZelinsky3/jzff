// Offseason demo simulator.
//
// Demo mode replays a historical week, but Sleeper hands back FINAL points and
// the offseason ESPN scoreboard has no games, so without help every player
// reads pre/final and the page never looks alive. This module rewinds a
// finished week to any progress point 0..1:
//
//   - each NFL team is assigned a kickoff window (early / late / night)
//   - team game completion derives from `progress` vs that window
//   - player points = finalPoints * smoothstep(completion + per-player jitter)
//   - game state, quarter clocks, on-field and red-zone flags are synthesized
//   - a synthetic NFL scoreboard is built from the rostered teams
//
// Everything is seeded from stable strings (player ids, team abbrs) so a given
// (week, progress) renders identically on every poll, and nudging progress
// animates the whole page deterministically. Applied by load.ts ONLY when
// opts.demo is set; the real live path never touches this file.

import type { SlSide, SlPlayer, SlMatchup } from './types'
import type { NflGame } from '@/lib/nflLive'
import { decideVariant } from './pickems'

export type DemoSim = { sides: SlSide[]; games: NflGame[] }

// ── Seeded helpers ───────────────────────────────────────────────────────────

// FNV-1a → [0, 1). Stable across processes; good enough spread for jitter.
function hash01(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 0xffffffff
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const smoothstep = (t: number) => t * t * (3 - 2 * t)
const round1 = (n: number) => Math.round(n * 10) / 10

// ── Kickoff windows ──────────────────────────────────────────────────────────
// offset = where in the 0..1 progress span the game kicks off; span = how much
// of the progress range one game occupies. Weighted like a real Sunday:
// most games early, a late window, one night game.

type Window = { offset: number; span: number }

function windowForTeam(team: string, week: number): Window {
  const r = hash01(`win:${week}:${team}`)
  if (r < 0.6) return { offset: 0.0, span: 0.55 }    // 1:00 slate
  if (r < 0.9) return { offset: 0.3, span: 0.55 }    // 4:25 slate
  return { offset: 0.62, span: 0.38 }                 // night game
}

function completionFor(win: Window, progress: number): number {
  // progress 1 must finish even the night game, hence the 1.02 headroom.
  return clamp01((progress * 1.02 - win.offset) / win.span)
}

// ── Clock synthesis ──────────────────────────────────────────────────────────

function clockFor(c: number): { period: number; clock: string; short: string } {
  const q = Math.min(4, Math.floor(c * 4) + 1)
  const intoQ = c * 4 - (q - 1)
  const secsLeft = Math.max(0, Math.round((1 - intoQ) * 15 * 60))
  const mm = Math.floor(secsLeft / 60)
  const ss = String(secsLeft % 60).padStart(2, '0')
  const clock = `${mm}:${ss}`
  return { period: q, clock, short: `Q${q} ${clock}` }
}

const KICKOFF_LABEL: Record<number, string> = { 0: '1:00 PM ET', 1: '4:25 PM ET', 2: '8:20 PM ET' }

function kickoffLabel(win: Window): string {
  return win.offset === 0 ? KICKOFF_LABEL[0] : win.offset < 0.5 ? KICKOFF_LABEL[1] : KICKOFF_LABEL[2]
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function simulateDemo(
  sides: SlSide[],
  demo: { year: number; week: number; progress: number },
): DemoSim {
  const { week, progress } = demo

  // Collect every NFL team rostered this week; each gets a window + completion.
  const teams = new Set<string>()
  for (const s of sides) for (const p of s.players) if (p.team) teams.add(p.team)

  const winByTeam = new Map<string, Window>()
  const compByTeam = new Map<string, number>()
  for (const t of teams) {
    const w = windowForTeam(t, week)
    winByTeam.set(t, w)
    compByTeam.set(t, completionFor(w, progress))
  }

  const simSides: SlSide[] = sides.map((s) => {
    const players: SlPlayer[] = s.players.map((p) => simPlayer(p))
    const starters = players.filter((p) => p.isStarter)
    const score = round1(starters.reduce((sum, p) => sum + p.points, 0))
    const projected = round1(starters.reduce((sum, p) => sum + Math.max(p.projected, p.points), 0))
    const playersRemaining = starters.filter((p) => p.game != null && p.game.state !== 'final').length
    return { ...s, players, score, projected, playersRemaining }
  })

  return { sides: simSides, games: buildGames() }

  function simPlayer(p: SlPlayer): SlPlayer {
    const finalPts = p.points
    // Historical weeks often lack projections; synthesize a plausible one so
    // projDelta boards and pace math have something to chew on.
    const projected = p.projected > 0
      ? p.projected
      : round1(Math.max(1, finalPts * (0.7 + 0.6 * hash01(`proj:${p.playerId}`))))

    if (!p.team) {
      // No NFL team resolved: leave untouched but freeze as final at progress 1.
      return { ...p, projected, game: null }
    }

    const c = compByTeam.get(p.team) ?? 0
    const win = winByTeam.get(p.team)!

    if (c <= 0) {
      return {
        ...p,
        points: 0,
        projected,
        game: { state: 'pre', quarterClock: kickoffLabel(win), onField: false, inRedZone: false },
      }
    }
    if (c >= 1) {
      return {
        ...p,
        points: round1(finalPts),
        projected,
        game: { state: 'final', quarterClock: 'FINAL', onField: false, inRedZone: false },
      }
    }

    // Live: accrue points along a per-player curve around the team completion.
    const jitter = (hash01(`acc:${p.playerId}`) - 0.5) * 0.3
    const accrual = smoothstep(clamp01(c + jitter))
    const points = round1(finalPts * accrual)
    const { short } = clockFor(c)
    // On-field flags re-seed per quarter bucket so they move as progress moves.
    const bucket = Math.floor(c * 8)
    const fieldRoll = hash01(`fld:${p.playerId}:${bucket}`)
    const onField = fieldRoll < 0.08
    const inRedZone = onField && fieldRoll < 0.03
    return {
      ...p,
      points,
      projected,
      game: { state: 'live', quarterClock: short, onField, inRedZone },
    }
  }

  function buildGames(): NflGame[] {
    // Pair the rostered teams into fake games (we don't know real opponents,
    // and for a demo it doesn't matter). Stable pairing: sort by seeded key.
    const list = [...teams].sort((a, b) => hash01(`pair:${week}:${a}`) - hash01(`pair:${week}:${b}`))
    const games: NflGame[] = []
    for (let i = 0; i + 1 < list.length; i += 2) {
      games.push(makeGame(list[i], list[i + 1], i))
    }
    if (list.length % 2 === 1) {
      games.push(makeGame(list[list.length - 1], 'BYE', list.length))
    }
    return games

    function makeGame(homeAbbr: string, awayAbbr: string, idx: number): NflGame {
      const win = winByTeam.get(homeAbbr) ?? { offset: 0, span: 0.55 }
      const c = compByTeam.get(homeAbbr) ?? 0
      const state: NflGame['state'] = c <= 0 ? 'pre' : c >= 1 ? 'post' : 'in'
      const { period, clock, short } = clockFor(clamp01(c))
      const base = (t: string) => Math.floor(smoothstep(clamp01(c)) * (17 + hash01(`pts:${week}:${t}`) * 20))
      const homeScore = c <= 0 ? 0 : base(homeAbbr)
      const awayScore = c <= 0 ? 0 : base(awayAbbr)
      const rollPoss = hash01(`poss:${week}:${homeAbbr}:${Math.floor(c * 8)}`)
      const teamSide = (abbr: string, homeAway: 'home' | 'away', score: number) => ({
        abbr,
        name: abbr,
        short: abbr,
        logo: null,
        color: null,
        score,
        homeAway,
        record: null,
      })
      return {
        id: `demo-${week}-${idx}`,
        state,
        completed: state === 'post',
        shortDetail: state === 'pre' ? kickoffLabel(win) : state === 'post' ? 'FINAL' : short,
        detail: state === 'pre' ? kickoffLabel(win) : state === 'post' ? 'Final' : short,
        clock,
        period,
        date: new Date().toISOString(),
        home: teamSide(homeAbbr, 'home', homeScore),
        away: teamSide(awayAbbr, 'away', awayScore),
        possessionAbbr: state === 'in' ? (rollPoss < 0.5 ? homeAbbr : awayAbbr) : null,
        isRedZone: state === 'in' && rollPoss < 0.18,
        lastPlay: null,
        downDistance: state === 'in' ? (rollPoss < 0.33 ? '3rd & 4' : rollPoss < 0.66 ? '1st & 10' : '2nd & 7') : null,
        broadcast: win.offset === 0 ? 'CBS' : win.offset < 0.5 ? 'FOX' : 'NBC',
      }
    }
  }
}

// ── Demo ballots ─────────────────────────────────────────────────────────────
// The pickems system has no weeks for a replayed/showcase season, so demo
// frames synthesize a ballot: every manager in the frame votes on every game,
// leaning toward the projected favorite. Seeded so a given (league, week)
// always produces the same electorate. Never runs on the live path.

export function synthesizeDemoPickems(matchups: SlMatchup[], seed: string): void {
  const voters = [
    ...new Set(matchups.flatMap((m) => [m.a.ownerName, m.b.ownerName])),
  ].filter(Boolean)
  if (voters.length === 0) return
  for (const m of matchups) {
    if (m.pickems) continue
    // Favorite lean: a big projection gap reads ~80/20, dead even reads 50/50.
    // Clamped away from 0/1 so no fabricated ballot is ever unanimous-by-math;
    // there is always a contrarian or two, like a real league.
    const lean = Math.min(0.8, Math.max(0.2, 0.5 + (m.a.projected - m.b.projected) / 90))
    const votersA: string[] = []
    const votersB: string[] = []
    for (const v of voters) {
      const r = hash01(`ballot:${seed}:${m.matchupId}:${v}`)
      if (r < lean) votersA.push(v)
      else votersB.push(v)
    }
    const total = votersA.length + votersB.length
    if (total === 0) continue
    m.pickems = decideVariant((votersA.length / total) * 100, total, m)
    m.pickems.votersA = votersA
    m.pickems.votersB = votersB
  }
}
