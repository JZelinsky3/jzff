// Redraft — the rules and the shapes.
//
// You are handed a real draft slot from a real season and asked to do better
// than the person who had it, knowing everything they didn't. Six players who
// were genuinely on the board, one pick, repeat. At the end your team's
// per-game scoring is set against the team that actually got made.
//
// Two modes, because they ask different questions:
//
//   round1  — the first round of one draft, every slot, you make them all.
//             The classic hindsight column: this is the round as it should
//             have gone. Your opponent is the round itself.
//   manager — one manager's whole draft, eight rounds of their real slots.
//             Your opponent is a person, which is the version worth arguing
//             about in a group chat.
//
// Both run on the same engine and differ only in which slots get dealt.
//
// The shortlist is what makes this a game rather than a quiz. Handing over the
// entire draft class would make every pick "name the best player of the year",
// answered once and then repeated. Six players who went within about thirty
// picks of each other is a real decision: they were valued the same at the
// time, and the only thing separating them is what happened next.
//
// Import-free on purpose, like the other rules files: the board is a client
// component and reads these constants and types.

export type RedraftMode = 'round1' | 'manager'

export const REDRAFT_MODES: RedraftMode[] = ['round1', 'manager']

export function isRedraftMode(v: string | null | undefined): v is RedraftMode {
  return v === 'round1' || v === 'manager'
}

/** Players offered at each slot, the real pick among them. */
export const SHORTLIST = 6

/** Picks dealt in manager mode. Eight rounds is where a fantasy roster stops
    being a starting lineup and starts being lottery tickets. */
export const MANAGER_PICKS = 8

/** Ceiling on round-one mode, for leagues that play with a lot of teams. A
    fourteen-slot round is a long sitting for a game meant to take a minute. */
export const MAX_ROUND1_PICKS = 12

/** A player who was on the board. */
export type RedraftCandidate = {
  key: string
  name: string
  pos: string
  nflTeam: string | null
  /** Sleeper id, used for the headshot. Null for anyone the rank files
      couldn't identify, which the board renders as a lettered disc. */
  playerId: string | null
  ppg: number
  fpts: number
  gp: number
  /** Positional finish that season, e.g. 3 for the RB3. */
  posRank: number
  /** Where they actually went in this draft. Revealed after the pick. */
  overallPick: number
  round: number
}

/** One turn on the clock. */
export type RedraftSlot = {
  key: string
  overallPick: number
  round: number
  /** Whose slot this is. In manager mode it's the same person every time. */
  slotManagerName: string
  slotTeamName: string | null
  candidates: RedraftCandidate[]
  /** The candidate actually taken here. Always one of `candidates`. */
  actualKey: string
}

export type RedraftDeal = {
  ok: true
  seed: string
  mode: RedraftMode
  pool: { id: string; label: string; sublabel: string; leagueSlug: string | null }
  year: number
  /** Manager mode only — whose draft you took over. */
  managerName: string | null
  teamName: string | null
  slots: RedraftSlot[]
  /** Which scoring the per-game numbers are on, shown so nobody argues. */
  profile: string
}

export type RedraftError = { ok: false; error: string; status: number }

/**
 * What a finished redraft is called.
 *
 * Keyed on the MARGIN in points per game rather than on a raw total, because
 * eight picks and twelve picks produce totals that can't be compared and the
 * margin is the only number that means the same thing in both modes.
 *
 * Losing is a real outcome here and the copy says so without needling. The
 * real drafters had a board, a clock and no idea what was coming; being level
 * with them is already the hindsight not paying off.
 */
export function grade(margin: number): { title: string; line: string } {
  if (margin >= 25) return { title: 'A different team entirely', line: 'You rebuilt the season and walked off with it.' }
  if (margin >= 12) return { title: 'Comfortably better', line: 'Hindsight used properly.' }
  if (margin >= 4) return { title: 'A clear win', line: 'You found the ones they missed.' }
  if (margin > 0) return { title: 'Just ahead', line: 'Close enough that one pick decided it.' }
  if (margin === 0) return { title: 'Dead level', line: 'Every point of hindsight, spent for nothing.' }
  if (margin >= -4) return { title: 'Just short', line: 'One pick the other way and you had it.' }
  if (margin >= -12) return { title: 'They had it right', line: 'The board was better than it looked.' }
  return { title: 'Worse, with hindsight', line: 'That takes some doing.' }
}
