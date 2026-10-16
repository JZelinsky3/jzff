// Cup stamps: honours collected across Cups, inked like a rubber stamp on
// the Cup's cream paper. Three sets: the ones you earn with your picks (the
// bracket challenge), the ones your team earns by playing, and three for
// laughs.
//
// Nothing is stored. Every stamp is worked out again from the frozen seeds,
// the week's scores and cup_picks, so a rule change reaches every past Cup
// at once and a corrected score corrects the stamps with it.
//
// Pure, and safe to import on the client (the page draws the catalogue from
// STAMPS): the loader that feeds it lives in history.ts.

import { GIANT_KILLER_GAP, UPSET_GAP, type CupBracket, type CupEntrant, type CupMatch } from './bracket'

export type StampId =
  | 'every-game'
  | 'perfect-round'
  | 'called-upset'
  | 'against-crowd'
  | 'called-it'
  | 'perfect-cup'
  | 'challenge-winner'
  | 'champion'
  | 'finalist'
  | 'giant-killer'
  | 'cinderella'
  | 'cup-high'
  | 'close-shave'
  | 'double'
  | 'repeat'
  | 'bye-and-out'
  | 'traitor'
  | 'jinxed'

// pick: round seal. team: rectangular postmark. fun: oval. A different
// shape per set, so a stamp book reads by structure, not just colour.
export type StampSet = 'pick' | 'team' | 'fun'

// The colour says how many times you've earned it, all-time: bronze, then
// silver, then gold (Joey, 2026-10-16). Each stamp has its own counts, set
// by how often it can come up, so a common one (an upset called, a close
// win) takes years to reach gold and a rare one (a title) doesn't need ten.
export type StampTier = 'bronze' | 'silver' | 'gold'
export const TIER_NAMES: Record<StampTier, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' }

export type StampDef = {
  id: StampId
  name: string
  set: StampSet
  how: string
  // Times earned for bronze, silver, gold.
  tiers: [number, number, number]
}

// Under this margin a win is a Close Shave.
export const CLOSE_SHAVE_PTS = 3
// Against the Crowd: right on a pick fewer than this share of pickers made,
// once at least CROWD_MIN have picked the game.
const CROWD_SHARE = 0.25
const CROWD_MIN = 3

export const STAMPS: StampDef[] = [
  { id: 'every-game', name: 'Every Game', set: 'pick', how: 'Pick every game in a Cup.', tiers: [1, 3, 6] },
  { id: 'perfect-round', name: 'Perfect Round', set: 'pick', how: 'Get every pick right in a round.', tiers: [1, 4, 8] },
  { id: 'called-upset', name: 'Called the Upset', set: 'pick', how: `Pick an upset by ${UPSET_GAP} or more seeds and be right.`, tiers: [1, 5, 10] },
  { id: 'against-crowd', name: 'Against the Crowd', set: 'pick', how: 'Be right on a pick less than a quarter of the league made.', tiers: [1, 5, 10] },
  { id: 'called-it', name: 'Called It', set: 'pick', how: 'Pick the champion before round one.', tiers: [1, 2, 4] },
  { id: 'perfect-cup', name: 'Perfect Cup', set: 'pick', how: 'Every pick right, every round, in one Cup.', tiers: [1, 2, 3] },
  { id: 'challenge-winner', name: 'Challenge Winner', set: 'pick', how: 'Win the bracket challenge.', tiers: [1, 2, 4] },
  { id: 'champion', name: 'Champion', set: 'team', how: 'Win the Cup.', tiers: [1, 2, 4] },
  { id: 'finalist', name: 'Finalist', set: 'team', how: 'Reach the final and lose it.', tiers: [1, 3, 5] },
  { id: 'giant-killer', name: 'Giant Killer', set: 'team', how: `Beat a team seeded ${GIANT_KILLER_GAP} or more spots higher.`, tiers: [1, 3, 6] },
  { id: 'cinderella', name: 'Cinderella', set: 'team', how: 'Reach the semifinals from the bottom third of the seeds.', tiers: [1, 2, 3] },
  { id: 'cup-high', name: 'Cup High', set: 'team', how: 'Put up the top score of the whole Cup.', tiers: [1, 2, 4] },
  { id: 'close-shave', name: 'Close Shave', set: 'team', how: `Win a game by less than ${CLOSE_SHAVE_PTS} points.`, tiers: [1, 5, 10] },
  { id: 'double', name: 'The Double', set: 'team', how: 'Win the Cup and the league title in the same season.', tiers: [1, 2, 3] },
  { id: 'repeat', name: 'Repeat', set: 'team', how: 'Win the Cup two years running.', tiers: [1, 2, 3] },
  { id: 'bye-and-out', name: 'Bye and Out', set: 'fun', how: 'Get a bye, then lose your first game.', tiers: [1, 2, 4] },
  { id: 'traitor', name: 'Traitor', set: 'fun', how: 'Pick against your own team.', tiers: [1, 5, 10] },
  { id: 'jinxed', name: 'Jinxed', set: 'fun', how: 'Your champion pick goes out in their first game.', tiers: [1, 3, 5] },
]

export const STAMP_BY_ID = new Map(STAMPS.map((s) => [s.id, s]))

export function stampTier(def: StampDef, count: number): StampTier | null {
  if (count >= def.tiers[2]) return 'gold'
  if (count >= def.tiers[1]) return 'silver'
  if (count >= def.tiers[0]) return 'bronze'
  return null
}

// How many more for the next colour, or null at gold.
export function nextTier(def: StampDef, count: number): { tier: StampTier; need: number } | null {
  if (count < def.tiers[0]) return { tier: 'bronze', need: def.tiers[0] - count }
  if (count < def.tiers[1]) return { tier: 'silver', need: def.tiers[1] - count }
  if (count < def.tiers[2]) return { tier: 'gold', need: def.tiers[2] - count }
  return null
}

export const STAMP_SETS: { set: StampSet; name: string }[] = [
  { set: 'pick', name: 'Picking' },
  { set: 'team', name: 'Playing' },
  { set: 'fun', name: 'For Laughs' },
]

export type StampAward = {
  stamp: StampId
  // The person: a manager profile id, or the manager id for a team with no
  // profile. Picks are already keyed by profile.
  person: string
  name: string
  cupId: string
  year: number
  // The round it was earned in (the reveal shows that round's). Null for
  // the ones only the whole Cup can settle: Every Game, Perfect Cup,
  // Challenge Winner, Cup High, The Double.
  round: number | null
  week: number | null
  // One line on what happened.
  note: string
}

export type StampPick = { profileId: string; round: number; slot: number; picked: string }

export type StampCupInput = {
  cup: { id: string; year: number }
  bracket: CupBracket
  picks: StampPick[]
  // Team (manager id) to person.
  personOf: (managerId: string) => string
  nameOf: (person: string) => string
  points: number[]
  championBonus: number
  // The season's league champion (manager id), once the season has one.
  leagueChampion: string | null
}

type TeamSide = { entrant: CupEntrant; score: number | null }

function pts(n: number): string {
  return n.toFixed(2)
}

function decided(m: CupMatch): { w: TeamSide; l: TeamSide } | null {
  if (m.state !== 'final' || !m.winner || m.a.kind !== 'team' || m.b.kind !== 'team') return null
  return m.winner === 'a' ? { w: m.a, l: m.b } : { w: m.b, l: m.a }
}

// Bracket-challenge points per picker, by the page's own scoring: a right
// pick is worth its round's points, a right champion pick the bonus.
export function challengePoints(bracket: CupBracket, picks: StampPick[], points: number[], championBonus: number): Map<string, number> {
  const at = new Map<string, CupMatch>()
  for (const r of bracket.rounds) for (const m of r.matches) at.set(`${r.round}:${m.slot}`, m)
  const out = new Map<string, number>()
  for (const p of picks) {
    let got = 0
    if (p.round === -1) {
      if (bracket.champion && bracket.champion.managerId === p.picked) got = championBonus
    } else {
      const g = at.get(`${p.round}:${p.slot}`)
      const d = g ? decided(g) : null
      if (d && d.w.entrant.managerId === p.picked) got = points[p.round] ?? 1
    }
    out.set(p.profileId, (out.get(p.profileId) ?? 0) + got)
  }
  return out
}

// Every stamp in every Cup given, oldest Cup first (Repeat looks back a year).
export function cupStamps(cups: StampCupInput[]): StampAward[] {
  const out: StampAward[] = []
  const sorted = [...cups].sort((x, y) => x.cup.year - y.cup.year)
  let prev: { year: number; champ: string } | null = null
  for (const c of sorted) {
    out.push(...oneCup(c))
    const champ = c.bracket.champion
    if (champ) {
      const who = c.personOf(champ.managerId)
      if (prev && prev.year === c.cup.year - 1 && prev.champ === who) {
        const last = c.bracket.rounds[c.bracket.rounds.length - 1]!
        out.push({ stamp: 'repeat', person: who, name: c.nameOf(who), cupId: c.cup.id, year: c.cup.year, round: last.round, week: last.week, note: `Won ${prev.year} and ${c.cup.year}` })
      }
      prev = { year: c.cup.year, champ: who }
    } else prev = null
  }
  return out
}

function oneCup(c: StampCupInput): StampAward[] {
  const { bracket, picks } = c
  const out: StampAward[] = []
  const give = (stamp: StampId, person: string, m: { round: number; week: number } | null, note: string) =>
    out.push({ stamp, person, name: c.nameOf(person), cupId: c.cup.id, year: c.cup.year, round: m?.round ?? null, week: m?.week ?? null, note })

  const gamePicks = picks.filter((p) => p.round >= 0)
  const champPicks = picks.filter((p) => p.round === -1)
  const picksAt = new Map<string, StampPick[]>()
  for (const p of gamePicks) picksAt.set(`${p.round}:${p.slot}`, [...(picksAt.get(`${p.round}:${p.slot}`) ?? []), p])
  const pickers = [...new Set(gamePicks.map((p) => p.profileId))]

  // Each person's own team in this Cup.
  const teamOf = new Map<string, string>()
  const entrants = [
    ...bracket.rounds[0]!.byes,
    ...bracket.rounds[0]!.matches.flatMap((m) => [m.a, m.b]).flatMap((s) => (s.kind === 'team' ? [s.entrant] : [])),
  ]
  for (const e of entrants) teamOf.set(c.personOf(e.managerId), e.managerId)
  const byes = new Set(bracket.rounds[0]!.byes.map((e) => e.managerId))

  // ── Game by game ──
  for (const r of bracket.rounds) {
    for (const m of r.matches) {
      const d = decided(m)
      if (!d) continue
      const { w, l } = d
      const vs = `${w.entrant.name} (${w.entrant.seed}) over ${l.entrant.name} (${l.entrant.seed})`
      const ps = picksAt.get(`${r.round}:${m.slot}`) ?? []
      const right = ps.filter((p) => p.picked === w.entrant.managerId)

      if (m.upsetBy >= UPSET_GAP) for (const p of right) give('called-upset', p.profileId, m, vs)
      if (ps.length >= CROWD_MIN && right.length > 0 && right.length / ps.length < CROWD_SHARE) {
        for (const p of right) give('against-crowd', p.profileId, m, `${vs}, ${right.length} of ${ps.length} picked it`)
      }
      for (const p of ps) {
        const own = teamOf.get(p.profileId)
        if (!own || (own !== w.entrant.managerId && own !== l.entrant.managerId) || p.picked === own) continue
        give('traitor', p.profileId, m, `Picked ${own === w.entrant.managerId ? l.entrant.name : w.entrant.name} to beat them`)
      }

      if (m.upsetBy >= GIANT_KILLER_GAP) give('giant-killer', c.personOf(w.entrant.managerId), m, `Beat ${l.entrant.name} (${l.entrant.seed}) as the ${w.entrant.seed} seed`)
      const margin = Math.round(((w.score ?? 0) - (l.score ?? 0)) * 100) / 100
      if (margin < CLOSE_SHAVE_PTS) give('close-shave', c.personOf(w.entrant.managerId), m, m.tiebreak ? `Tied ${l.entrant.name}, through on seed` : `Beat ${l.entrant.name} by ${pts(margin)}`)
      if (r.round === 1 && byes.has(l.entrant.managerId)) give('bye-and-out', c.personOf(l.entrant.managerId), m, `Lost to ${w.entrant.name} after the bye`)
    }

    // A round with two or more games, all of them settled.
    if (r.matches.length >= 2 && r.matches.every((m) => decided(m))) {
      for (const who of pickers) {
        const mine = r.matches.map((m) => ({ m, p: (picksAt.get(`${r.round}:${m.slot}`) ?? []).find((p) => p.profileId === who) }))
        if (mine.every(({ m, p }) => p && p.picked === decided(m)!.w.entrant.managerId)) {
          give('perfect-round', who, { round: r.round, week: r.week }, `${r.name}, ${r.matches.length} for ${r.matches.length}`)
        }
      }
    }
  }

  // ── Cinderella: into the semifinals from the bottom third ──
  const semis = bracket.rounds.findIndex((r) => r.name === 'Semifinals')
  if (semis > 0) {
    const cut = Math.ceil((bracket.field * 2) / 3)
    const from = bracket.rounds[semis - 1]!
    for (const m of bracket.rounds[semis]!.matches) {
      for (const s of [m.a, m.b]) {
        if (s.kind === 'team' && s.entrant.seed > cut) give('cinderella', c.personOf(s.entrant.managerId), from, `Into the semifinals as the ${s.entrant.seed} seed`)
      }
    }
  }

  // ── Champion picks ──
  const firstGame = (managerId: string) => {
    for (const r of bracket.rounds) {
      for (const m of r.matches) {
        if ((m.a.kind === 'team' && m.a.entrant.managerId === managerId) || (m.b.kind === 'team' && m.b.entrant.managerId === managerId)) return m
      }
    }
    return null
  }
  const nameOfTeam = new Map(entrants.map((e) => [e.managerId, e.name]))
  for (const p of champPicks) {
    const g = firstGame(p.picked)
    const d = g ? decided(g) : null
    if (g && d && d.l.entrant.managerId === p.picked) give('jinxed', p.profileId, g, `Picked ${nameOfTeam.get(p.picked) ?? 'a team'}, out in the ${bracket.rounds[g.round]!.name.toLowerCase()}`)
  }

  // ── The whole Cup ──
  const champ = bracket.champion
  if (bracket.status !== 'done' || !champ) return out
  const last = bracket.rounds[bracket.rounds.length - 1]!
  const final = decided(last.matches[0]!)!
  give('champion', c.personOf(champ.managerId), last, `Beat ${final.l.entrant.name} in the final, ${pts(final.w.score ?? 0)} to ${pts(final.l.score ?? 0)}`)
  if (bracket.runnerUp) give('finalist', c.personOf(bracket.runnerUp.managerId), last, `Lost the final to ${final.w.entrant.name}`)
  for (const p of champPicks) if (p.picked === champ.managerId) give('called-it', p.profileId, last, `Picked ${champ.name} to win it`)

  const games = bracket.rounds.flatMap((r) => r.matches)
  let top = 0
  for (const m of games) for (const s of [m.a, m.b]) if (s.kind === 'team' && (s.score ?? 0) > top) top = s.score ?? 0
  if (top > 0) {
    for (const r of bracket.rounds) {
      for (const m of r.matches) {
        for (const s of [m.a, m.b]) if (s.kind === 'team' && s.score === top) give('cup-high', c.personOf(s.entrant.managerId), null, `${pts(top)} in the ${r.name.toLowerCase()}`)
      }
    }
  }

  for (const who of pickers) {
    const mine = games.map((m) => (picksAt.get(`${m.round}:${m.slot}`) ?? []).find((p) => p.profileId === who))
    if (!mine.every(Boolean)) continue
    give('every-game', who, null, `All ${games.length} games picked`)
    if (mine.every((p, i) => p!.picked === decided(games[i]!)!.w.entrant.managerId)) give('perfect-cup', who, null, `${games.length} for ${games.length}`)
  }

  const board = challengePoints(bracket, picks, c.points, c.championBonus)
  const best = Math.max(0, ...board.values())
  if (best > 0) for (const [who, n] of board) if (n === best) give('challenge-winner', who, null, `${n} points`)

  if (c.leagueChampion && c.personOf(c.leagueChampion) === c.personOf(champ.managerId)) give('double', c.personOf(champ.managerId), null, `Cup and league title, ${c.cup.year}`)
  return out
}
