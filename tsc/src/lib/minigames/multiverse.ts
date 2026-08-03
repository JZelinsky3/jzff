// The Multiverse Draft — the rules and the wire shapes.
//
// Every player on the board is three players. A card is one man who was
// rostered in this league in at least three completed seasons, carrying three
// of those seasons picked at random, each with what he actually scored per
// game that year in the league's own scoring. 2019 Lamar sits next to 2025
// Bijan and both are on offer in the same round.
//
// Draft seven, then play fourteen weeks. Each week every one of your seven
// independently rolls one of his three seasons, so the team you built has a
// range rather than a number, and the fourteen opponents are other teams
// drafted off the same pool who roll their own.
//
// Two things here were settled by simulation on pams before a line of this
// was written, and both are load-bearing:
//
//  · The rolls are INDEPENDENT per player, not a shared league-wide year.
//    A shared year was tested — including the form that keeps cross-era
//    flavour, where one universe INDEX is drawn per week and each man plays
//    his own season sitting at that index — and it came out identical to
//    independent rolls to the decimal. Independent is simpler, so it wins.
//
//  · The opponent is the FIELD, not a real historical score. Against real
//    weekly scores from the archive, roster variance is worth ±0.5 points of
//    win rate, i.e. nothing: a real fantasy team's week swings with an SD
//    near 25 and a drafted seven swings near 7, so the opponent's noise
//    drowns yours entirely and the game collapses into "take the biggest
//    average". Against other drafted teams the lever switches on — measured
//    at +2.5 points of win rate for a volatile underdog and −1.9 for a
//    volatile favourite, the sign flipping exactly where it should. That is
//    the whole reason the schedule is fourteen bot drafts and not fourteen
//    rows out of `matchups`.
//
// Import-free on purpose, like the other rules files: the board is a client
// component and reads these constants and types in the browser.

export type MvPosition = 'QB' | 'RB' | 'WR' | 'TE'

export type MvSlotDef = {
  id: string
  label: string
  accepts: MvPosition[]
}

export const SLOTS: MvSlotDef[] = [
  { id: 'QB', label: 'QB', accepts: ['QB'] },
  { id: 'RB1', label: 'RB', accepts: ['RB'] },
  { id: 'RB2', label: 'RB', accepts: ['RB'] },
  { id: 'WR1', label: 'WR', accepts: ['WR'] },
  { id: 'WR2', label: 'WR', accepts: ['WR'] },
  { id: 'TE', label: 'TE', accepts: ['TE'] },
  { id: 'FLEX', label: 'FLEX', accepts: ['RB', 'WR', 'TE'] },
]

/** One round per slot. */
export const ROUNDS = SLOTS.length

/** Cards offered each round. Five is enough that a round is a decision and
    few enough that the whole board fits a phone without scrolling past it. */
export const CARDS_PER_ROUND = 5

/** Weeks in the season, and opponents on the slate — one each. */
export const WEEKS = 14

/** Seasons dealt per card in a league with enough history. */
export const TIMELINES = 3

/** …and in a league with only two or three completed seasons, where three
    would leave almost nobody eligible. A two-timeline card is a coin flip
    rather than a die, which is a thinner game but still a game. */
export const TIMELINES_SHORT = 2

/** A league needs this many completed seasons to deal three timelines. */
export const FULL_HISTORY_SEASONS = 4

/** Wins that make the postseason. Eight of fourteen: a winning record, and
    the number the whole draft is quietly aiming at. */
export const PLAYOFF_LINE = 8

/** One season of one player, as dealt. The position in the array IS the
    universe index, and it is shuffled per card so a man's best year is
    equally likely to sit in any of the three. */
export type MvTimeline = {
  year: number
  ppg: number
  gp: number
  /** Positional finish that season, e.g. 4 for the RB4. */
  posRank: number
}

export type MvCard = {
  key: string
  name: string
  pos: MvPosition
  /** Sleeper id for the headshot. Null renders a lettered disc. */
  playerId: string | null
  timelines: MvTimeline[]
  /** Average of the timelines. What the card is worth on paper. */
  mean: number
  /** Best minus worst. The card's whole personality in one number. */
  spread: number
}

export type MvRound = {
  round: number
  cards: MvCard[]
}

/** One week's opponent: a team drafted off the same pool, which rolls its own
    timelines. `ppg` is public before the draft, `score` is not. */
export type MvOpponent = {
  week: number
  name: string
  teamName: string | null
  /** What they are worth on paper. This is the slate you draft against. */
  ppg: number
  /** What they actually put up, once the week is played. */
  score: number
  roster: MvCard[]
  /** Which timeline fired for each man on their roster this week. */
  fired: number[]
}

export type MultiverseDeal = {
  ok: true
  seed: string
  pool: { id: string; label: string; sublabel: string; leagueSlug: string | null }
  /** Which scoring the per-game numbers are on, shown so nobody argues. */
  profile: string
  /** Completed seasons the cards were drawn from. */
  years: number[]
  /** 2 or 3. Every card in a deal carries the same number. */
  timelines: number
  rounds: MvRound[]
  /**
   * The dice, dealt with the board: `rolls[slotIndex][week]` is the timeline
   * index that fires for whoever ends up in that slot.
   *
   * Rolled per SLOT rather than per card because the board is dealt in one
   * response, before anybody has drafted anything. Keying the dice to the
   * seven slots makes a run reproducible from its seed no matter who gets
   * picked, which is what lets a shared link play the identical season and
   * what would let a leaderboard re-score a submitted run later.
   */
  rolls: number[][]
  schedule: MvOpponent[]
}

export type MultiverseError = { ok: false; error: string; status: number }

/** Points a roster puts up in one week, given the dealt dice. */
export function weekScore(
  roster: (MvCard | null)[],
  rolls: number[][],
  week: number
): number {
  let total = 0
  for (let slot = 0; slot < roster.length; slot++) {
    const card = roster[slot]
    if (!card) continue
    const idx = (rolls[slot]?.[week] ?? 0) % card.timelines.length
    total += card.timelines[idx]?.ppg ?? 0
  }
  return Math.round(total * 10) / 10
}

/**
 * What a card actually gave you across the season.
 *
 * The whole point of the recap: a card dealt 21.0 / 12.0 / 18.0 is not worth
 * 17.0 to you, it is worth whatever the dice made it worth. If the 12 came up
 * seven times out of fourteen he was a 15.8, and the three numbers on the
 * front of the card never said so.
 */
export function realized(
  card: MvCard,
  rolls: number[][],
  slot: number,
  weeks: number
): { ppg: number; counts: number[]; total: number } {
  const counts = new Array(card.timelines.length).fill(0)
  let total = 0
  for (let w = 0; w < weeks; w++) {
    const idx = (rolls[slot]?.[w] ?? 0) % card.timelines.length
    counts[idx] += 1
    total += card.timelines[idx]?.ppg ?? 0
  }
  return {
    ppg: Math.round((total / weeks) * 10) / 10,
    counts,
    total: Math.round(total * 10) / 10,
  }
}

/**
 * What a finished season is called.
 *
 * Keyed on wins, and the postseason line is named in the copy rather than
 * implied, because eight is the number you were drafting towards and the
 * board should say so when you miss it by one.
 */
export function grade(wins: number): { title: string; line: string } {
  if (wins >= 13) return { title: 'A season they will talk about', line: 'Every universe broke your way and you had built for all of them.' }
  if (wins >= 11) return { title: 'Ran away with it', line: 'The draft did that, not the dice.' }
  if (wins >= 9) return { title: 'Comfortably in', line: 'Built well, and never really in trouble.' }
  if (wins === PLAYOFF_LINE) return { title: 'In, on the line', line: 'Eight wins and not one to spare.' }
  if (wins === PLAYOFF_LINE - 1) return { title: 'Missed by one', line: 'One week where the wrong season came up.' }
  if (wins >= 5) return { title: 'Short of it', line: 'The slate was there to be beaten and the roster could not do it.' }
  if (wins >= 3) return { title: 'A long fourteen weeks', line: 'Too many of these cards were only good in one universe.' }
  return { title: 'Nothing came up', line: 'Drafted for a version of the season that never arrived.' }
}
