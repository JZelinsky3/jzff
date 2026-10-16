// The Cup Hall of Fame: every Cup a league has played, read as one history.
// The champions engraved year by year, each manager's Cup career, the Cup's
// own records, and the bracket challenge all-time.
//
// Pure: it reads what lib/cup/history.ts (or the demo, lib/cup/demo.ts)
// already loads, so nothing new is stored. A Cup that's still running counts
// for what it has settled: its finished games go in the records and the
// careers, and its band stays unengraved until the final.

import { UPSET_GAP, type CupBracket, type CupEntrant, type CupMatch } from './bracket'
import { CHAMPION_BONUS, roundPoints } from './extras'
import type { LeagueCups } from './history'
import { challengePoints, STAMP_BY_ID, stampTier } from './stamps'

// How far a team got in one Cup: won it, lost the final, out in the
// semifinals, the quarterfinals, or earlier; still alive; not in it.
export type HallFinish = 'W' | 'F' | 'SF' | 'QF' | 'R1' | 'IN'

export type HallBand = {
  year: number
  href: string
  state: CupBracket['status']
  field: number
  champion: { name: string; seed: number; team: string | null } | null
  runnerUp: { name: string; seed: number } | null
  // The final's score, winner first.
  final: [number, number] | null
  // The champion's run, round by round (a bye is a row with no opponent).
  path: { round: string; opp: string | null; oppSeed: number | null; mine: number | null; theirs: number | null }[]
  // A Cup still being played: the round on now and who is left.
  round: { name: string; week: number } | null
  alive: { name: string; seed: number }[]
}

export type HallManager = {
  person: string
  name: string
  // In the newest Cup's field.
  current: boolean
  cups: number
  w: number
  l: number
  pf: number
  games: number
  ppg: number | null
  titles: number
  finals: number
  semis: number
  byes: number
  upsets: number
  // One entry per Cup year (oldest first); null when they weren't in it.
  years: ({ year: number; seed: number; finish: HallFinish } | null)[]
  stamps: number
}

export type HallRecord = {
  id: string
  label: string
  value: string
  unit: string
  who: string
  line: string
}

export type HallPicker = {
  person: string
  name: string
  points: number
  correct: number
  decided: number
  // Champion picks that came good, and bracket challenges won.
  calledIt: number
  wins: number
  stamps: number
  kinds: number
  gold: number
}

export type CupHall = {
  name: string
  since: number | null
  years: number[]
  bands: HallBand[]
  managers: HallManager[]
  records: HallRecord[]
  pickers: HallPicker[]
  stampsTotal: number
  // Settled Cup games across every Cup.
  gamesPlayed: number
}

type Team = Extract<CupMatch['a'], { kind: 'team' }>

function teamSide(m: CupMatch, side: 'a' | 'b'): Team | null {
  const s = m[side]
  return s.kind === 'team' ? s : null
}

function entrantsOf(b: CupBracket): CupEntrant[] {
  const out = new Map<string, CupEntrant>()
  const r0 = b.rounds[0]
  if (!r0) return []
  for (const m of r0.matches) for (const s of [m.a, m.b]) if (s.kind === 'team') out.set(s.entrant.managerId, s.entrant)
  for (const e of r0.byes) out.set(e.managerId, e)
  return [...out.values()].sort((x, y) => x.seed - y.seed)
}

// Rounds from the end: the final is 0, the semifinals 1, and so on.
function finishFor(roundsFromEnd: number): HallFinish {
  return roundsFromEnd === 0 ? 'F' : roundsFromEnd === 1 ? 'SF' : roundsFromEnd === 2 ? 'QF' : 'R1'
}

const pts = (n: number) => n.toFixed(2)
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

export function buildCupHall(lc: LeagueCups, hrefBase: string): CupHall {
  const cups = lc.cups
  const years = cups.map((c) => c.view.cup.season_year)
  const newest = cups[cups.length - 1]
  const newestField = new Set(newest ? entrantsOf(newest.view.bracket).map((e) => lc.personOf(e.managerId)) : [])

  const managers = new Map<string, HallManager>()
  const man = (person: string): HallManager => {
    let m = managers.get(person)
    if (!m) {
      m = {
        person,
        name: lc.nameOf(person),
        current: newestField.has(person),
        cups: 0,
        w: 0,
        l: 0,
        pf: 0,
        games: 0,
        ppg: null,
        titles: 0,
        finals: 0,
        semis: 0,
        byes: 0,
        upsets: 0,
        years: years.map(() => null),
        stamps: 0,
      }
      managers.set(person, m)
    }
    return m
  }

  type Game = { year: number; round: string; roundIdx: number; w: Team; l: Team; upsetBy: number }
  const games: Game[] = []
  const bands: HallBand[] = []

  cups.forEach(({ view }, yi) => {
    const b = view.bracket
    const year = view.cup.season_year
    const n = b.rounds.length
    const entrants = entrantsOf(b)
    const finish = new Map<string, HallFinish>()
    for (const e of entrants) {
      const m = man(lc.personOf(e.managerId))
      m.cups++
      finish.set(e.managerId, 'IN')
    }
    for (const e of b.rounds[0]?.byes ?? []) man(lc.personOf(e.managerId)).byes++

    for (const r of b.rounds) {
      for (const g of r.matches) {
        const a = teamSide(g, 'a')
        const c = teamSide(g, 'b')
        if (g.state !== 'final' || !g.winner || !a || !c) continue
        const w = g.winner === 'a' ? a : c
        const l = g.winner === 'a' ? c : a
        finish.set(l.entrant.managerId, finishFor(n - 1 - r.round))
        games.push({ year, round: r.name, roundIdx: r.round, w, l, upsetBy: g.upsetBy })
        for (const [side, won] of [
          [w, true],
          [l, false],
        ] as const) {
          const m = man(lc.personOf(side.entrant.managerId))
          if (won) m.w++
          else m.l++
          m.pf += side.score ?? 0
          m.games++
        }
        if (g.upsetBy >= UPSET_GAP) man(lc.personOf(w.entrant.managerId)).upsets++
      }
    }
    if (b.champion) finish.set(b.champion.managerId, 'W')
    for (const e of entrants) {
      const m = man(lc.personOf(e.managerId))
      const f = finish.get(e.managerId) ?? 'IN'
      m.years[yi] = { year, seed: e.seed, finish: f }
      if (f === 'W') m.titles++
      if (f === 'W' || f === 'F') m.finals++
      if (f === 'W' || f === 'F' || f === 'SF') m.semis++
    }

    // The band.
    const last = b.rounds[n - 1]?.matches[0]
    let final: HallBand['final'] = null
    const path: HallBand['path'] = []
    if (b.champion && last?.winner) {
      const w = teamSide(last, last.winner)
      const l = teamSide(last, last.winner === 'a' ? 'b' : 'a')
      if (w && l) final = [w.score ?? 0, l.score ?? 0]
      for (const r of b.rounds) {
        if (r.byes.some((e) => e.managerId === b.champion!.managerId)) {
          path.push({ round: r.short, opp: null, oppSeed: null, mine: null, theirs: null })
          continue
        }
        for (const g of r.matches) {
          const a = teamSide(g, 'a')
          const c = teamSide(g, 'b')
          if (!a || !c) continue
          const mine = a.entrant.managerId === b.champion.managerId ? a : c.entrant.managerId === b.champion.managerId ? c : null
          if (!mine) continue
          const opp = mine === a ? c : a
          path.push({ round: r.short, opp: opp.entrant.name, oppSeed: opp.entrant.seed, mine: mine.score, theirs: opp.score })
        }
      }
    }
    const cur = b.currentRound != null ? b.rounds[b.currentRound]! : null
    bands.push({
      year,
      href: `${hrefBase}?year=${year}`,
      state: b.status,
      field: b.field,
      champion: b.champion ? { name: b.champion.name, seed: b.champion.seed, team: b.champion.team } : null,
      runnerUp: b.runnerUp ? { name: b.runnerUp.name, seed: b.runnerUp.seed } : null,
      final,
      path,
      round: cur ? { name: cur.name, week: cur.week } : null,
      alive: entrants.filter((e) => finish.get(e.managerId) === 'IN').map((e) => ({ name: e.name, seed: e.seed })),
    })
  })

  for (const m of managers.values()) m.ppg = m.games ? Math.round((m.pf / m.games) * 100) / 100 : null
  for (const s of lc.stamps) {
    const m = managers.get(s.person)
    if (m) m.stamps++
  }

  // The register: titles, then finals, semifinals, wins, scoring. The
  // league's current field first, alumni below them.
  const register = [...managers.values()].sort(
    (x, y) =>
      Number(y.current) - Number(x.current) ||
      y.titles - x.titles ||
      y.finals - x.finals ||
      y.semis - x.semis ||
      y.w - x.w ||
      (y.ppg ?? 0) - (x.ppg ?? 0) ||
      x.name.localeCompare(y.name),
  )

  return {
    name: newest?.view.cup.name ?? 'The Cup',
    since: years[0] ?? null,
    years,
    bands,
    managers: register,
    records: records(games, register, bands, lc),
    pickers: pickers(lc),
    stampsTotal: lc.stamps.length,
    gamesPlayed: games.length,
  }

  function records(list: Game[], reg: HallManager[], bnds: HallBand[], l: LeagueCups): HallRecord[] {
    const out: HallRecord[] = []
    const at = (g: Game) => `${g.year} ${g.round.toLowerCase()}`
    const margin = (g: Game) => (g.w.score ?? 0) - (g.l.score ?? 0)
    if (!list.length) return out
    const sides = list.flatMap((g) => [
      { g, s: g.w, opp: g.l, won: true },
      { g, s: g.l, opp: g.w, won: false },
    ])
    const high = [...sides].sort((x, y) => (y.s.score ?? 0) - (x.s.score ?? 0))[0]!
    out.push({ id: 'high', label: 'Highest Cup Score', value: pts(high.s.score ?? 0), unit: 'Points', who: high.s.entrant.name, line: `${at(high.g)}, ${high.won ? 'beat' : 'lost to'} ${high.opp.entrant.name}` })
    const big = [...list].sort((x, y) => margin(y) - margin(x))[0]!
    out.push({ id: 'blowout', label: 'Biggest Win', value: pts(margin(big)), unit: 'Point margin', who: big.w.entrant.name, line: `${at(big)}, over ${big.l.entrant.name}` })
    const close = [...list].sort((x, y) => margin(x) - margin(y))[0]!
    out.push({ id: 'closest', label: 'Closest Game', value: pts(margin(close)), unit: 'Point margin', who: close.w.entrant.name, line: `${at(close)}, over ${close.l.entrant.name}` })
    const upset = [...list].sort((x, y) => y.upsetBy - x.upsetBy || margin(y) - margin(x))[0]!
    if (upset.upsetBy > 0) {
      out.push({ id: 'upset', label: 'Biggest Upset', value: String(upset.upsetBy), unit: 'Seeds apart', who: upset.w.entrant.name, line: `${ordinal(upset.w.entrant.seed)} seed over the ${ordinal(upset.l.entrant.seed)}, ${at(upset)}` })
    }
    const lowWin = [...list].sort((x, y) => (x.w.score ?? 0) - (y.w.score ?? 0))[0]!
    out.push({ id: 'lowwin', label: 'Lowest Score to Win', value: pts(lowWin.w.score ?? 0), unit: 'Points', who: lowWin.w.entrant.name, line: `${at(lowWin)}, over ${lowWin.l.entrant.name}` })

    // Straight Cup wins, across Cups (a bye doesn't count either way).
    let streak = { n: 0, person: '', from: 0, to: 0 }
    const run = new Map<string, { n: number; from: number }>()
    const ordered = [...list].sort((x, y) => x.year - y.year || x.roundIdx - y.roundIdx)
    for (const g of ordered) {
      const wp = l.personOf(g.w.entrant.managerId)
      const lp = l.personOf(g.l.entrant.managerId)
      const cur = run.get(wp)
      const next = cur ? { n: cur.n + 1, from: cur.from } : { n: 1, from: g.year }
      run.set(wp, next)
      run.delete(lp)
      if (next.n > streak.n) streak = { n: next.n, person: wp, from: next.from, to: g.year }
    }
    if (streak.n >= 2) {
      out.push({ id: 'streak', label: 'Longest Win Streak', value: String(streak.n), unit: 'Cup wins in a row', who: l.nameOf(streak.person), line: streak.from === streak.to ? `in ${streak.from}` : `${streak.from} to ${streak.to}` })
    }
    const mostWins = [...reg].sort((x, y) => y.w - x.w || (y.ppg ?? 0) - (x.ppg ?? 0))[0]
    if (mostWins && mostWins.w > 0) {
      out.push({ id: 'wins', label: 'Most Cup Wins', value: String(mostWins.w), unit: 'Wins', who: mostWins.name, line: `${mostWins.w}-${mostWins.l} in ${mostWins.cups} ${mostWins.cups === 1 ? 'Cup' : 'Cups'}` })
    }
    const minGames = 3
    const ppg = reg.filter((m) => m.games >= minGames).sort((x, y) => (y.ppg ?? 0) - (x.ppg ?? 0))[0]
    if (ppg) out.push({ id: 'ppg', label: 'Best Cup Scoring', value: (ppg.ppg ?? 0).toFixed(1), unit: 'Points a game', who: ppg.name, line: `${ppg.games} Cup games` })
    const cinderella = bnds.filter((b) => b.champion).sort((x, y) => (y.champion?.seed ?? 0) - (x.champion?.seed ?? 0))[0]
    if (cinderella?.champion && cinderella.champion.seed > 1) {
      out.push({ id: 'cinderella', label: 'Lowest Seed to Win', value: String(cinderella.champion.seed), unit: 'Seed', who: cinderella.champion.name, line: `the ${cinderella.year} Cup` })
    }
    return out
  }
}

// The bracket challenge, all time: points, picks right, champion calls,
// challenges won, and the stamp books.
function pickers(lc: LeagueCups): HallPicker[] {
  const rows = new Map<string, HallPicker>()
  const row = (person: string) => {
    let r = rows.get(person)
    if (!r) {
      r = { person, name: lc.nameOf(person), points: 0, correct: 0, decided: 0, calledIt: 0, wins: 0, stamps: 0, kinds: 0, gold: 0 }
      rows.set(person, r)
    }
    return r
  }
  for (const { view, picks } of lc.cups) {
    const b = view.bracket
    const points = challengePoints(b, picks, roundPoints(b.rounds.length), CHAMPION_BONUS)
    for (const [person, n] of points) row(person).points += n
    const at = new Map<string, CupMatch>()
    for (const r of b.rounds) for (const m of r.matches) at.set(`${r.round}:${m.slot}`, m)
    for (const p of picks) {
      if (p.round < 0) continue
      const m = at.get(`${p.round}:${p.slot}`)
      if (!m || m.state !== 'final' || !m.winner) continue
      const w = teamSide(m, m.winner)
      const r = row(p.profileId)
      r.decided++
      if (w && w.entrant.managerId === p.picked) r.correct++
    }
  }
  const count = new Map<string, Map<string, number>>()
  for (const s of lc.stamps) {
    const r = row(s.person)
    r.stamps++
    if (s.stamp === 'called-it') r.calledIt++
    if (s.stamp === 'challenge-winner') r.wins++
    const c = count.get(s.person) ?? new Map<string, number>()
    c.set(s.stamp, (c.get(s.stamp) ?? 0) + 1)
    count.set(s.person, c)
  }
  for (const [person, c] of count) {
    const r = row(person)
    r.kinds = c.size
    r.gold = [...c.entries()].filter(([id, n]) => {
      const def = STAMP_BY_ID.get(id as never)
      return def ? stampTier(def, n) === 'gold' : false
    }).length
  }
  return [...rows.values()]
    .filter((r) => r.points > 0 || r.decided > 0 || r.stamps > 0)
    .sort((x, y) => y.points - x.points || y.wins - x.wins || y.correct - x.correct || x.name.localeCompare(y.name))
}
