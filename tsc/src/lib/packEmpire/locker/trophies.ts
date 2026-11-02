// The Trophy Case: things worth doing, and what they pay. Plain data, so the page, the
// server and the nav's badge all read the same list.
//
// A trophy reads one number off a player's stats. A case is a set of trophies with a
// card at the end of it, and that card is the point: it comes out of the Vault, the
// seasons that aren't in any pack, so finishing a case is the only way to own one. Each
// game gets a case of its own, and one for the collection runs across all of them, so a
// new game is a new row on TROPHY_CASES and some numbers for it to report at the end of
// a match. It needs nothing else from here.

import type { Rarity } from '../rules'

export type TrophyReward = { kind: 'faab'; n: number } | { kind: 'pack'; pack: string } | { kind: 'card'; id: string }

export type Trophy = { id: string; title: string; line: string; stat: string; need: number; reward: TrophyReward }

export type TrophyCase = { id: string; title: string; line: string; card: string; trophies: Trophy[] }

export type TrophyStats = Record<string, number>

const faab = (n: number): TrophyReward => ({ kind: 'faab', n })
const pack = (id: string): TrophyReward => ({ kind: 'pack', pack: id })

export const TROPHY_CASES: TrophyCase[] = [
  {
    id: 'field-general',
    title: 'Field General',
    line: 'Everything a good season looks like.',
    card: 'rb-priest-holmes-2003',
    trophies: [
      { id: 'fg-first', title: 'First Snap', line: 'Win a game.', stat: 'fg.wins', need: 1, reward: faab(25) },
      { id: 'fg-ten', title: 'Making The Roster', line: 'Win 10 games.', stat: 'fg.wins', need: 10, reward: faab(50) },
      { id: 'fg-fifty', title: 'Franchise Tag', line: 'Win 50 games.', stat: 'fg.wins', need: 50, reward: pack('shop') },
      { id: 'fg-hundred', title: 'Century Club', line: 'Win 100 games.', stat: 'fg.wins', need: 100, reward: pack('boost') },
      { id: 'fg-goals', title: 'Game Manager', line: 'Meet 50 goals.', stat: 'fg.goals', need: 50, reward: faab(100) },
      { id: 'fg-forms', title: 'Full Playbook', line: 'Finish a game with 3 formations on.', stat: 'fg.forms3', need: 1, reward: faab(50) },
      { id: 'fg-lane', title: 'Depth Chart', line: 'Get 8 cards in one lane.', stat: 'fg.fullLane', need: 1, reward: faab(75) },
      { id: 'fg-ot', title: 'Sudden Death', line: 'Win in overtime.', stat: 'fg.ot', need: 1, reward: faab(50) },
      { id: 'fg-flip', title: 'Final Tally', line: 'Win a game after the tally flips a lane your way.', stat: 'fg.flip', need: 1, reward: pack('shop') },
      { id: 'fg-streak', title: 'Hot Streak', line: 'Win 5 in a row.', stat: 'fg.bestStreak', need: 5, reward: pack('shop') },
      { id: 'fg-event', title: 'Theme Week', line: 'Win 10 event games.', stat: 'fg.wins.event', need: 10, reward: pack('shop') },
      { id: 'fg-friend', title: 'Bragging Rights', line: 'Beat a friend 5 times.', stat: 'fg.wins.friend', need: 5, reward: pack('boost') },
    ],
  },
  {
    id: 'all-pro',
    title: 'All-Pro',
    line: 'The hard ones. Only an All-Pro CPU counts.',
    card: 'rb-ladainian-tomlinson-2003',
    trophies: [
      { id: 'ap-first', title: 'Took Down An All-Pro', line: 'Beat the All-Pro CPU.', stat: 'fg.wins.all-pro', need: 1, reward: faab(100) },
      { id: 'ap-ten', title: 'Pro Bowler', line: 'Beat the All-Pro CPU 10 times.', stat: 'fg.wins.all-pro', need: 10, reward: pack('trophy') },
      { id: 'ap-fifty', title: 'First-Team All-Pro', line: 'Beat the All-Pro CPU 50 times.', stat: 'fg.wins.all-pro', need: 50, reward: pack('trophy') },
      { id: 'ap-sweep', title: 'Sweep', line: 'Take all three lanes from the All-Pro CPU.', stat: 'fg.sweeps.all-pro', need: 1, reward: pack('theme-legends') },
      { id: 'ap-streak', title: 'Dynasty', line: 'Beat the All-Pro CPU 5 in a row.', stat: 'fg.bestStreak.all-pro', need: 5, reward: pack('trophy') },
      { id: 'ap-undrafted', title: 'Undrafted', line: 'Beat the All-Pro CPU with nothing above a Rare in your deck.', stat: 'fg.undrafted', need: 1, reward: pack('boost-theme-legends') },
    ],
  },
  {
    id: 'collection',
    title: 'The Collection',
    line: 'Counts every card you own, whichever game it came from.',
    card: 'te-travis-kelce-2022',
    trophies: [
      { id: 'cl-open-ten', title: 'Fresh Wrapper', line: 'Open 10 packs.', stat: 'packs', need: 10, reward: faab(25) },
      { id: 'cl-open-fifty', title: 'Pack Rat', line: 'Open 50 packs.', stat: 'packs', need: 50, reward: pack('shop') },
      { id: 'cl-open-200', title: 'Hobby Box', line: 'Open 200 packs.', stat: 'packs', need: 200, reward: pack('trophy') },
      { id: 'cl-own-100', title: 'Binder Started', line: 'Own 100 different cards.', stat: 'cards', need: 100, reward: faab(50) },
      { id: 'cl-own-300', title: 'Binder Filling', line: 'Own 300 different cards.', stat: 'cards', need: 300, reward: pack('shop') },
      { id: 'cl-own-500', title: 'Half The League', line: 'Own 500 different cards.', stat: 'cards', need: 500, reward: pack('boost') },
      { id: 'cl-teams', title: 'All 32', line: 'Own a card from every team.', stat: 'teams', need: 32, reward: faab(75) },
      { id: 'cl-top', title: 'Rare Air', line: 'Own a Transcendent or better.', stat: 'top', need: 1, reward: faab(50) },
      { id: 'cl-faab', title: 'Cap Space', line: 'Earn $1,000 FAAB.', stat: 'faab', need: 1000, reward: pack('theme-legends') },
    ],
  },
]

export const trophyById = (id: string) => TROPHY_CASES.flatMap((c) => c.trophies).find((t) => t.id === id) ?? null
export const trophyCaseById = (id: string) => TROPHY_CASES.find((c) => c.id === id) ?? null

/** A trophy's progress, capped at what it needs. */
export const trophyProgress = (t: Trophy, stats: TrophyStats) => Math.min(t.need, stats[t.stat] ?? 0)
export const trophyDone = (t: Trophy, stats: TrophyStats) => (stats[t.stat] ?? 0) >= t.need
export const caseDone = (c: TrophyCase, stats: TrophyStats) => c.trophies.every((t) => trophyDone(t, stats))

/** How many rewards are sitting there waiting to be picked up. */
export function trophiesWaiting(stats: TrophyStats, claimed: string[]): number {
  const held = new Set(claimed)
  return TROPHY_CASES.reduce((sum, c) => sum + c.trophies.filter((t) => !held.has(t.id) && trophyDone(t, stats)).length + (!held.has(c.id) && caseDone(c, stats) ? 1 : 0), 0)
}

const TOP: Rarity[] = ['transcendent', 'immortal', 'canton']

/** The stats that come straight off what someone owns, so they're never out of step. */
export function collectionStats(cards: { rarity: Rarity; team: string }[]): TrophyStats {
  return { cards: cards.length, teams: new Set(cards.map((c) => c.team)).size, top: cards.filter((c) => TOP.includes(c.rarity)).length }
}
