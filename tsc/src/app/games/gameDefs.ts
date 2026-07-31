// The games, described once.
//
// The Games Page used to be a flat rail of POOLS — "Roster Roulette · the
// whole site", "Guess the Draft · the demo league", then one card per league per
// game. Two games in, that rail was mixing two different questions (which
// game? whose league?) into one list, and every league you owned appeared
// twice under names that only differed by a small tag.
//
// So it's two steps now: /games picks a GAME, /games/<game> picks a LEAGUE,
// and /games/<game>?pool=<id> plays it. A link with a pool on it still goes
// straight to the board, so nothing shared into a group chat changed.
//
// Each game declares which pools it can offer, because they genuinely differ:
// Roulette can be played site-wide and across a mixture of leagues, Guess the
// Draft can be neither (you can't name a stranger off their draft).

export type GameDef = {
  id: string
  /** Where the game lives. The lobby and the board are the same route. */
  href: string
  /** Masthead title, split so the second half can be set in italic. */
  title: string
  titleEm: string
  /** One line on the hub card. What the game IS, not how it's played. */
  short: string
  /** The same idea for a phone, in a breath. The desktop `short` runs to
      three clauses, which on a 390px card is five lines of body text before
      you reach the thing you tap. */
  pocket: string
  /** Two words for the phone card's footer chip. `access` is a sentence and
      filled the whole bottom of the card on its own. */
  pocketAccess: string
  /** The game's own colour. The phone hub shows both games at once with no
      hover, no rail and no room for chrome, so the only thing telling them
      apart is how they LOOK — this and the mark each card draws. */
  accent: string
  /** The longer pitch, shown once a game has been chosen. */
  blurb: string
  /** Three beats, in play order. Kept to a phrase each. */
  how: string[]
  /** Shown on the hub card's footer, so the ask is clear before the click. */
  access: string
  /** Whether the site-wide pool is meaningful for this game. */
  allowsSite: boolean
  /** Whether several leagues can be dealt as one pool. */
  allowsCombine: boolean
  /** Copy for the pool cards in the lobby. */
  demoBody: string
  leagueBody: string
}

export const ROSTER_ROULETTE: GameDef = {
  id: 'roulette',
  href: '/games/roulette/',
  title: 'Roster',
  titleEm: 'Roulette',
  short:
    'The wheel lands on somebody’s real team from a real season. Take one player off it, fill seven slots, and see whether the lineup goes 17-0.',
  pocket: 'Eight real teams. One player off each. Seven slots.',
  pocketAccess: 'No account',
  accent: '#e8c889',
  blurb:
    'Every almanac on this site is a pile of teams that actually existed. The wheel picks one of them at random, you take a single player, and it spins again. Eight spins, seven slots, one reroll if it deals you nothing you can use.',
  how: [
    'Spin, and the wheel lands on one manager’s season',
    'Take one player off that team into a slot he fits',
    'Fill the lineup, then play it against seventeen games',
  ],
  access: 'No account needed',
  allowsSite: true,
  allowsCombine: true,
  demoBody:
    'Seven seasons of one league, the way it feels when the wheel keeps landing on people you know. Real teams and real numbers, under the demo’s names.',
  leagueBody:
    'Every completed season your league has on the books, one squad per manager per year. Spins land on people you actually know.',
}

export const GUESS_THE_DRAFT: GameDef = {
  id: 'guess-the-draft',
  href: '/games/guess-the-draft/',
  title: 'Guess the',
  titleEm: 'Draft',
  short:
    'A draft from your league’s history with every name taken out. Say who made the picks and what year it was.',
  pocket: 'A draft with the name blacked out. Whose was it?',
  pocketAccess: 'Needs a league',
  // Terracotta against Roulette's brass. The two cards sit one above the
  // other on a phone and a shared gold made them read as one list.
  accent: '#e29278',
  blurb:
    'Eight drafts, each one a manager’s first eight picks from a season that actually happened, with the name and the year taken off the top. You answer twice, and both halves count: the players date the year, and the year narrows who was even in the league then.',
  how: [
    'Read eight picks with the name and the year stripped out',
    'Name the manager and date the season, locked in together',
    'A point for each, a third for getting both in one round',
  ],
  access: 'Best with a league of your own',
  allowsSite: false,
  allowsCombine: false,
  demoBody:
    'Eight drafts from seven seasons of one league. The quickest way to see what the game is before you point it at your own.',
  leagueBody:
    'Eight drafts pulled from every completed season on your books, with the names taken out. Managers you know, years you were there for.',
}

export const GAMES: GameDef[] = [ROSTER_ROULETTE, GUESS_THE_DRAFT]
