// The Cup: a knockout side tournament inside a league's regular season.
//
// The rules, which the page prints in plain words:
//   • Seeds are the Cup Rating when the Cup is made (scoring, record, form
//     and schedule; see ratingSeeds), frozen on the league_cups row so the
//     draw never reshuffles. Twelve teams at most: the top twelve, or
//     everyone in a smaller league. (pams' 2026 Milk Cup came before the
//     rating and was seeded on the standings; its rows carry no rating.)
//   • The bracket is the next power of two up from the field, so the top
//     seeds get byes when a league isn't 8 or 16 teams. Standard seeding
//     order: 1 meets the lowest seed left, and 1 and 2 can only meet in the
//     final.
//   • Each round is one week. A team's real score that week is its Cup
//     score, whoever it plays in the league.
//   • A tie goes to the higher seed.
//
// Pure: every input comes in as an argument, so the page, both image routes
// and the almanac strip build the same bracket from the same rows.

export type CupSeedRow = {
  seed: number
  manager_id: string
  w: number
  l: number
  t: number
  pf: number
  // Points against, points a game over the last three weeks, and the Cup
  // Rating the seed came from (50 = league average). Absent on Cups seeded
  // on the standings, before the rating.
  pa?: number
  form?: number
  rating?: number
}

export type CupEntrant = {
  seed: number
  managerId: string
  name: string
  team: string | null
  record: string
}

export type CupSide =
  | { kind: 'team'; entrant: CupEntrant; score: number | null }
  // Not decided yet. `options` names the two teams that can still get here
  // when the game feeding this spot already has both of them; otherwise empty.
  | { kind: 'tbd'; options: string[] }

// upcoming: the week hasn't started. live: it's this week. waiting: the week
// is over but its scores aren't final yet (or an earlier round isn't).
export type CupMatchState = 'upcoming' | 'live' | 'waiting' | 'final'

export type CupMatch = {
  id: string
  round: number
  // Position in the full round, byes included (0-based). Layout keys off it.
  slot: number
  week: number
  a: CupSide
  b: CupSide
  state: CupMatchState
  winner: 'a' | 'b' | null
  // Level on points, settled on seed.
  tiebreak: boolean
  // How many seed lines the winner was below the loser (0 = no upset).
  upsetBy: number
  // The two also play each other in the league that week.
  sameGame: boolean
}

export type CupRound = {
  round: number
  week: number
  name: string
  short: string
  // Slots in the full round, byes included: size / 2^(round+1).
  slots: number
  matches: CupMatch[]
  // Teams that skip this round (only ever round one).
  byes: CupEntrant[]
}

export type CupBracket = {
  size: number
  field: number
  rounds: CupRound[]
  startWeek: number
  finalWeek: number
  status: 'before' | 'running' | 'done'
  // The round being played or up next; null once the Cup is decided.
  currentRound: number | null
  champion: CupEntrant | null
  runnerUp: CupEntrant | null
}

export function bracketSize(field: number): number {
  let size = 2
  while (size < field) size *= 2
  return size
}

// 1 v 16, 8 v 9, 4 v 13, 5 v 12, 2 v 15, 7 v 10, 3 v 14, 6 v 11 for 16, and
// the same shape at every size: each seed's opponent is (slots + 1 - seed).
export function seedOrder(size: number): number[] {
  let order = [1, 2]
  while (order.length < size) {
    const n = order.length * 2
    order = order.flatMap((s) => [s, n + 1 - s])
  }
  return order
}

// Round names from how many places are left in the round. Round one of a
// bracket with byes is "First round", not "Round of 16" in a 12-team league.
export function roundNames(field: number): { name: string; short: string }[] {
  const size = bracketSize(field)
  const out: { name: string; short: string }[] = []
  for (let slots = size, r = 0; slots >= 2; slots /= 2, r++) {
    if (slots === 2) out.push({ name: 'Final', short: 'Final' })
    else if (slots === 4) out.push({ name: 'Semifinals', short: 'Semis' })
    else if (slots === 8) out.push({ name: 'Quarterfinals', short: 'Quarters' })
    else if (r === 0 && field < size) out.push({ name: 'First round', short: 'Round 1' })
    else out.push({ name: `Round of ${slots}`, short: `Last ${slots}` })
  }
  return out
}

// An upset is a win from four or more seed lines down (Joey, 2026-10-15): a
// 9 beating a 7 is barely one, an 11 beating a 7 is. Every "Upset" tag (the
// tickets, the reveal, the recap) and the Called the Upset stamp read this.
export const UPSET_GAP = 4
// A bigger one again: the Giant Killer stamp.
export const GIANT_KILLER_GAP = 6

export function recordStr(w: number, l: number, t: number): string {
  return t ? `${w}-${l}-${t}` : `${w}-${l}`
}

// Twelve teams at most. A bigger league sends its top twelve; a smaller one
// sends everybody.
export const CUP_MAX_FIELD = 12

// The Cup Rating: the seeds aren't the standings, so the draw isn't known
// before it's made. Four parts, all from the weekly scores every league has
// (a free league syncs nothing else: no lineups, no projections):
//   scoring    50%  points scored a game
//   record     30%  win rate, a tie half a win
//   form       10%  points a game over the last three weeks
//   schedule   10%  points scored against you a game: a tough draw of
//                   opponents, which a record alone punishes
// Each part is measured as distance from the league average in the
// league's own spread (a z-score), so the size of a gap counts: 140 a game
// against 130 is a big gap in a league that runs 120 to 140, a small one in
// a league that runs 90 to 160, and one runaway scorer doesn't squash
// everyone else together the way a best-to-worst scale would. Shown with
// 50 as the league average and 20 points to one spread.
// Backtested on 290 past seasons (2026-10-16), rated after week 7 against
// how teams did from week 8 on: rank correlation with later scoring .368
// (standings .323), with later wins .262 (standings .221). Scoring alone
// predicts better than record alone (.363 against .289), hence its weight;
// all-play record, top-score weeks and steadiness added nothing. It moves a
// seed 1.2 places from the standings on average and gives a different top
// seed in about 40% of seasons.
export const CUP_RATING_WEIGHTS = { scoring: 0.5, record: 0.3, form: 0.1, schedule: 0.1 } as const

// Seeds from a run of finished games, by the Cup Rating (then win rate,
// points for, and id so the order is stable). Everyone is rated against
// everyone; the field is then capped at CUP_MAX_FIELD (the launch preview
// passes Infinity to see the teams just outside).
export function ratingSeeds(games: { week: number; a: string; b: string; sa: number; sb: number }[], limit: number = CUP_MAX_FIELD): CupSeedRow[] {
  const rows = new Map<string, { w: number; l: number; t: number; pf: number; pa: number; weeks: [number, number][] }>()
  const row = (id: string) => {
    let r = rows.get(id)
    if (!r) rows.set(id, (r = { w: 0, l: 0, t: 0, pf: 0, pa: 0, weeks: [] }))
    return r
  }
  for (const g of games) {
    const a = row(g.a)
    const b = row(g.b)
    a.pf += g.sa
    a.pa += g.sb
    b.pf += g.sb
    b.pa += g.sa
    a.weeks.push([g.week, g.sa])
    b.weeks.push([g.week, g.sb])
    if (g.sa > g.sb) {
      a.w++
      b.l++
    } else if (g.sa < g.sb) {
      b.w++
      a.l++
    } else {
      a.t++
      b.t++
    }
  }
  const list = [...rows.entries()].map(([id, r]) => {
    const n = r.w + r.l + r.t
    const last3 = [...r.weeks].sort((x, y) => y[0] - x[0]).slice(0, 3)
    return {
      id,
      r,
      pct: n ? (r.w + r.t / 2) / n : 0,
      ppg: n ? r.pf / n : 0,
      papg: n ? r.pa / n : 0,
      form: last3.length ? last3.reduce((sum, [, x]) => sum + x, 0) / last3.length : 0,
    }
  })
  // Distance from the league average in standard deviations (everyone
  // level: 0 each).
  const zOf = (pick: (x: (typeof list)[number]) => number) => {
    const v = list.map(pick)
    const mean = v.reduce((sum, x) => sum + x, 0) / (v.length || 1)
    const sd = Math.sqrt(v.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (v.length || 1))
    return (x: (typeof list)[number]) => (sd ? (pick(x) - mean) / sd : 0)
  }
  const sco = zOf((x) => x.ppg)
  const rec = zOf((x) => x.pct)
  const frm = zOf((x) => x.form)
  const sch = zOf((x) => x.papg)
  const W = CUP_RATING_WEIGHTS
  const rated = list.map((x) => {
    const z = W.scoring * sco(x) + W.record * rec(x) + W.form * frm(x) + W.schedule * sch(x)
    return { ...x, z, rating: Math.max(0, Math.min(100, 50 + 20 * z)) }
  })
  return rated
    .sort((a, b) => b.z - a.z || b.pct - a.pct || b.r.pf - a.r.pf || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((x, i) => ({
      seed: i + 1,
      manager_id: x.id,
      w: x.r.w,
      l: x.r.l,
      t: x.r.t,
      pf: Math.round(x.r.pf * 100) / 100,
      pa: Math.round(x.r.pa * 100) / 100,
      form: Math.round(x.form * 100) / 100,
      rating: Math.round(x.rating * 10) / 10,
    }))
}

// Where each team sits in the plain standings (win rate, then points for):
// 1-based, by manager id. The preview shows how far the rating moved them.
export function standingsPlaces(games: { a: string; b: string; sa: number; sb: number }[]): Map<string, number> {
  const rows = new Map<string, { w: number; n: number; pf: number }>()
  for (const g of games) {
    for (const [id, mine, theirs] of [
      [g.a, g.sa, g.sb],
      [g.b, g.sb, g.sa],
    ] as const) {
      const r = rows.get(id) ?? { w: 0, n: 0, pf: 0 }
      r.n++
      r.pf += mine
      r.w += mine > theirs ? 1 : mine === theirs ? 0.5 : 0
      rows.set(id, r)
    }
  }
  const order = [...rows.entries()].sort(([ia, a], [ib, b]) => b.w / b.n - a.w / a.n || b.pf - a.pf || ia.localeCompare(ib))
  return new Map(order.map(([id], i) => [id, i + 1]))
}

type Node = { e: CupEntrant } | { m: CupMatch } | null

export function buildBracket(args: {
  seeds: CupSeedRow[]
  nameOf: (managerId: string) => { name: string; team: string | null }
  startWeek: number
  // null when the season has no calendar (an old, finished season).
  currentWeek: number | null
  // The team's points that week, or null when there's no game on record.
  scoreOf: (managerId: string, week: number) => number | null
  // Every game that week has two real scores.
  weekFinal: (week: number) => boolean
  opponentOf: (managerId: string, week: number) => string | null
}): CupBracket {
  const { startWeek, currentWeek } = args
  const seeds = [...args.seeds].sort((x, y) => x.seed - y.seed)
  const field = seeds.length
  const size = bracketSize(field)
  const names = roundNames(field)
  const entrants = new Map<number, CupEntrant>()
  for (const s of seeds) {
    const who = args.nameOf(s.manager_id)
    entrants.set(s.seed, { seed: s.seed, managerId: s.manager_id, name: who.name, team: who.team, record: recordStr(s.w, s.l, s.t) })
  }

  const side = (node: Exclude<Node, null>, week: number): CupSide => {
    if ('e' in node) {
      const raw = args.scoreOf(node.e.managerId, week)
      // A zero is an unplayed week on every platform, not a real score.
      return { kind: 'team', entrant: node.e, score: raw != null && raw > 0 ? raw : null }
    }
    const { a, b } = node.m
    return { kind: 'tbd', options: a.kind === 'team' && b.kind === 'team' ? [a.entrant.name, b.entrant.name] : [] }
  }

  let nodes: Node[] = seedOrder(size).map((s) => (entrants.has(s) ? { e: entrants.get(s)! } : null))
  const rounds: CupRound[] = []
  for (let r = 0; nodes.length >= 2; r++) {
    const week = startWeek + r
    const matches: CupMatch[] = []
    const byes: CupEntrant[] = []
    const next: Node[] = []
    for (let i = 0; i < nodes.length; i += 2) {
      const A = nodes[i]
      const B = nodes[i + 1]
      if (!A || !B) {
        const only = A ?? B
        if (only && 'e' in only) byes.push(only.e)
        next.push(only)
        continue
      }
      const a = side(A, week)
      const b = side(B, week)
      const teams = a.kind === 'team' && b.kind === 'team'
      const past = currentWeek == null || week < currentWeek
      let state: CupMatchState
      if (teams && past && args.weekFinal(week)) state = 'final'
      else if (currentWeek != null && week > currentWeek) state = 'upcoming'
      else if (currentWeek != null && week === currentWeek) state = 'live'
      else state = 'waiting'

      let winner: CupMatch['winner'] = null
      let tiebreak = false
      let upsetBy = 0
      let sameGame = false
      if (a.kind === 'team' && b.kind === 'team') {
        sameGame = args.opponentOf(a.entrant.managerId, week) === b.entrant.managerId
        if (state === 'final') {
          const sa = a.score ?? 0
          const sb = b.score ?? 0
          if (sa === sb) tiebreak = true
          winner = sa > sb ? 'a' : sb > sa ? 'b' : a.entrant.seed < b.entrant.seed ? 'a' : 'b'
          const w = winner === 'a' ? a.entrant : b.entrant
          const l = winner === 'a' ? b.entrant : a.entrant
          upsetBy = Math.max(0, w.seed - l.seed)
        }
      }
      const m: CupMatch = { id: `r${r}s${i / 2}`, round: r, slot: i / 2, week, a, b, state, winner, tiebreak, upsetBy, sameGame }
      matches.push(m)
      const won = winner ? (winner === 'a' ? a : b) : null
      next.push(won && won.kind === 'team' ? { e: won.entrant } : { m })
    }
    rounds.push({ round: r, week, name: names[r].name, short: names[r].short, slots: nodes.length / 2, matches, byes })
    nodes = next
  }

  const final = rounds[rounds.length - 1]?.matches[0] ?? null
  let champion: CupEntrant | null = null
  let runnerUp: CupEntrant | null = null
  if (final?.winner && final.a.kind === 'team' && final.b.kind === 'team') {
    champion = final.winner === 'a' ? final.a.entrant : final.b.entrant
    runnerUp = final.winner === 'a' ? final.b.entrant : final.a.entrant
  }
  const open = rounds.find((r) => r.matches.some((m) => m.state !== 'final'))
  const anyFinal = rounds.some((r) => r.matches.some((m) => m.state === 'final'))
  const status = champion ? 'done' : !anyFinal && (currentWeek == null || currentWeek < startWeek) ? 'before' : 'running'
  return {
    size,
    field,
    rounds,
    startWeek,
    finalWeek: startWeek + rounds.length - 1,
    status,
    currentRound: champion ? null : open?.round ?? null,
    champion,
    runnerUp,
  }
}

// The few lines worth telling once games are in: the top Cup score, the
// closest game, the biggest upset. Each needs a finished game.
export type CupNotes = {
  top: { name: string; score: number; round: string } | null
  closest: { winner: string; loser: string; margin: number; round: string } | null
  upset: { winner: string; ws: number; loser: string; ls: number; by: number; round: string } | null
}

export function cupNotes(b: CupBracket): CupNotes {
  let top: CupNotes['top'] = null
  let closest: CupNotes['closest'] = null
  let upset: CupNotes['upset'] = null
  for (const r of b.rounds) {
    for (const m of r.matches) {
      if (m.state !== 'final' || m.a.kind !== 'team' || m.b.kind !== 'team') continue
      for (const s of [m.a, m.b]) {
        if (s.score != null && (!top || s.score > top.score)) top = { name: s.entrant.name, score: s.score, round: r.name }
      }
      const w = m.winner === 'a' ? m.a : m.b
      const l = m.winner === 'a' ? m.b : m.a
      const margin = Math.round(((w.score ?? 0) - (l.score ?? 0)) * 100) / 100
      if (!closest || margin < closest.margin) closest = { winner: w.entrant.name, loser: l.entrant.name, margin, round: r.name }
      if (m.upsetBy >= UPSET_GAP && (!upset || m.upsetBy > upset.by)) {
        upset = { winner: w.entrant.name, ws: w.score ?? 0, loser: l.entrant.name, ls: l.score ?? 0, by: m.upsetBy, round: r.name }
      }
    }
  }
  return { top, closest, upset }
}

// One line for the almanac strip and the hub card, from weeks alone (no
// scores needed): where the Cup is this week.
export function cupWeekLabel(args: { field: number; startWeek: number; currentWeek: number | null }): string | null {
  const { field, startWeek, currentWeek } = args
  if (currentWeek == null) return null
  const names = roundNames(field)
  const finalWeek = startWeek + names.length - 1
  if (currentWeek < startWeek - 1 || currentWeek > finalWeek + 1) return null
  if (currentWeek < startWeek) return `Round one is week ${startWeek}`
  if (currentWeek > finalWeek) return 'The Cup is decided'
  const r = names[currentWeek - startWeek]
  return r.name === 'Final' ? 'The final is this week' : `${r.name} this week`
}
