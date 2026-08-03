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
  /** One word, for the phone's dock.
   *
   * Seven destinations share 390px down there, so the label gets about six
   * characters before it starts eating its neighbour. It's the word people
   * actually use for the game rather than an abbreviation of the masthead —
   * "Wheel", not "Roster R.". */
  shortName: string
  /** The whole pitch, in a breath. ONE line, on every hub — the cards used
      to carry a three-clause version of this plus the three how-to-play
      beats, which at five games was a wall of identical prose nobody read.
      The long pitch is `blurb`, on the game's own page. */
  tagline: string
  /** Two words for the hub card's footer chip. */
  accessTag: string
  /** The game's own colour. Both hubs show every game at once, so the thing
      telling them apart is how they LOOK — this and the mark each card
      draws (see ./GameMark). It carries through to the game's own board as
      --accent on the page wrap. */
  accent: string
  /** The longer pitch, shown once a game has been chosen. */
  blurb: string
  /** Three beats, in play order. Kept to a phrase each. */
  how: string[]
  /** Whether the site-wide pool is meaningful for this game. */
  allowsSite: boolean
  /** Whether several leagues can be dealt as one pool. */
  allowsCombine: boolean
  /** Whether the demo league can back this game.
   *
   * Not a taste call — the static demo tree carries drafts and standings but
   * no week-by-week schedule, so the games that ask about a single result
   * have nothing to read there. When the demo export grows matchups this
   * turns true for The Gauntlet and Over/Under and nothing else changes. */
  allowsDemo: boolean
  /** Whether `<href>board/` exists yet.
   *
   * A run only reaches a board if the server can re-score it, and the run
   * verifier is written per game — only Roulette's exists. Until the other
   * four have one, their lobbies must not offer a board link: an empty board
   * is a disappointment, a 404 is a bug report. */
  hasBoard: boolean
  /** Copy for the pool cards in the lobby. */
  demoBody: string
  leagueBody: string
}

export const ROSTER_ROULETTE: GameDef = {
  id: 'roulette',
  href: '/games/roulette/',
  title: 'Roster',
  titleEm: 'Roulette',
  shortName: 'Wheel',
  // Ends on the question, not on a count of slots. "Seven slots" is a rule;
  // the card has one line to give somebody a reason to tap, and the reason is
  // the record. The mark above draws the wheel, so the line doesn't have to.
  tagline: 'Eight real teams. One player off each. Can you go 17-0?',
  accessTag: 'No account',
  accent: '#e8c889',
  blurb:
    'Every almanac on this site is a pile of teams that actually existed. The wheel picks one of them at random, you take a single player, and it spins again. Eight spins, seven slots, one reroll if it deals you nothing you can use.',
  how: [
    'Spin, and the wheel lands on one manager’s season',
    'Take one player off that team into a slot he fits',
    'Fill the lineup, then play it against seventeen games',
  ],
  allowsSite: true,
  allowsCombine: true,
  allowsDemo: true,
  hasBoard: true,
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
  shortName: 'Guess',
  tagline: 'A draft with the name blacked out. Whose was it?',
  accessTag: 'Needs a league',
  // Terracotta against Roulette's brass. The two cards sit one above the
  // other on a phone and a shared gold made them read as one list.
  accent: '#e29278',
  blurb:
    'Eight drafts, each one a manager’s first eight picks from a season that actually happened, with the name and the year taken off the top. You answer twice, and both halves count: the players date the year, and the year narrows who was even in the league then.',
  how: [
    'Read eight picks with the name and the year stripped out',
    'Name the manager and date the season, locked in together',
    'Three for the manager, one for the year, one more for both',
  ],
  allowsSite: false,
  allowsCombine: false,
  allowsDemo: true,
  hasBoard: false,
  demoBody:
    'Eight drafts from seven seasons of one league. The quickest way to see what the game is before you point it at your own.',
  leagueBody:
    'Eight drafts pulled from every completed season on your books, with the names taken out. Managers you know, years you were there for.',
}

export const THE_GAUNTLET: GameDef = {
  id: 'gauntlet',
  href: '/games/gauntlet/',
  title: 'The',
  titleEm: 'Gauntlet',
  shortName: 'Streak',
  tagline: 'Two teams. One week. Who won?',
  accessTag: 'Needs a league',
  // Steel blue against Roulette's brass and Guess the Draft's terracotta.
  // Warm colours read as invitations and this is the game where you lose.
  accent: '#8fb3d6',
  blurb:
    'One question at a time, and always the same question. Two teams from your league met in a real week of a real season, and you get their names and nothing else. Say who won. Get it right and you are asked again. Get it wrong and the run is over, so the only number this game keeps is how far you got.',
  how: [
    'Two teams and the week they met. No records, no hints',
    'Call the winner, then see the scores and where they stood',
    'One wrong ends the run, so the score is how long you lasted',
  ],
  allowsSite: false,
  allowsCombine: false,
  // The demo tree publishes standings but no schedule. Said plainly in the
  // dealer too, so a hand-typed ?pool=demo gets a reason rather than a stall.
  allowsDemo: false,
  hasBoard: false,
  demoBody: '',
  leagueBody:
    'Every game your league has ever played, one at a time, in an order nobody can revise. Needs one completed season and nothing else.',
}

export const OVER_UNDER: GameDef = {
  id: 'over-under',
  href: '/games/over-under/',
  title: 'The',
  titleEm: 'Over/Under',
  shortName: 'Line',
  tagline: 'Ten real weeks. Ten lines. Over or under?',
  accessTag: 'Needs a league',
  // Violet, to stay clear of the brass, the terracotta and the Gauntlet's
  // steel. Four games on one phone screen and the mark is only half the
  // difference between them.
  accent: '#c9a9ea',
  blurb:
    'Every line on this board is hung near what the team actually scored, so none of them are free. You get the team, the week and the number, and nothing else until you call it. Ten calls, and the only question that matters is whether you can beat a coin over ten.',
  how: [
    'A real team from a real week, and a line to beat',
    'Call it over or under, then see what they actually put up',
    'Ten calls, and five is what guessing gets you',
  ],
  allowsSite: false,
  allowsCombine: false,
  // Lines are scaled to one league's scoring spread, and the demo tree has no
  // week-by-week scores to measure that spread from.
  allowsDemo: false,
  hasBoard: false,
  demoBody: '',
  leagueBody:
    'Every week your league has ever played, priced against how much your scores actually move. Needs one completed season and nothing else.',
}

export const REDRAFT: GameDef = {
  id: 'redraft',
  href: '/games/redraft/',
  title: 'The',
  titleEm: 'Redraft',
  shortName: 'Redraft',
  tagline: 'A real draft slot. Pick again, with hindsight.',
  accessTag: 'Needs a league',
  // Sage, and the last of the five that reads clearly against the others.
  accent: '#9ec8a8',
  blurb:
    'You are on the clock at a real pick from a real draft, looking at six players who were genuinely still on the board. Take one, and find out what they did that year. Do it for a whole draft and your team gets set against the one that actually got built, per game, in your league’s own scoring.',
  how: [
    'You get a real slot: whole draft, or the whole first round',
    'Six players who were actually there. Take one',
    'Your team against theirs, per game, when it’s done',
  ],
  allowsSite: false,
  allowsCombine: false,
  // The demo tree ships its drafts, so this one IS playable signed-out —
  // unlike the two games that need a week-by-week schedule.
  allowsDemo: true,
  hasBoard: false,
  demoBody:
    'Seven drafts from one league, and every player’s real season behind them. The quickest way to see the game before pointing it at your own.',
  leagueBody:
    'Your own drafts, board by board, with hindsight you did not have at the time. Needs your drafts to have come across from your platform.',
}

export const MULTIVERSE_DRAFT: GameDef = {
  id: 'multiverse',
  href: '/games/multiverse/',
  title: 'The Multiverse',
  titleEm: 'Draft',
  shortName: 'Multi',
  tagline: 'Every player is three players. Draft seven, play fourteen weeks.',
  accessTag: 'Needs a league',
  // Teal, and the last colour that reads clearly against the brass, the
  // terracotta, the steel, the violet and the sage. It carries onto a board
  // that is deliberately not the navy the other five share — see
  // multiverse.module.css.
  accent: '#5fc9bd',
  blurb:
    'Every card on the board is one player carrying three of the seasons your league actually rostered him for, each with what he really scored per game that year. Take him and you take all three: every week he rolls one of them, so 2019 Lamar and 2025 Bijan can end up on the same team and neither is a fixed number. Seven slots, fourteen weeks, and eight wins makes the postseason.',
  how: [
    'Five cards a round, each one a player in three different seasons',
    'Fill seven slots knowing what every card can and cannot give you',
    'Play fourteen weeks where each man rolls one of his years',
  ],
  allowsSite: false,
  allowsCombine: false,
  // The demo tree ships seven drafts, and this game never asks about a
  // week-by-week schedule — its opponents are drafted rather than remembered
  // — so unlike The Gauntlet and the Over/Under it is playable signed-out.
  allowsDemo: true,
  hasBoard: true,
  demoBody:
    'Seven seasons of one league, so most of the good players carry three of them. The quickest way to see what a card looks like before pointing it at your own.',
  leagueBody:
    'Your own league, and players you watched for years, each one dealt three of the seasons you had him. Needs two completed seasons, and reads best with four or more.',
}

export const GAMES: GameDef[] = [
  ROSTER_ROULETTE,
  GUESS_THE_DRAFT,
  THE_GAUNTLET,
  OVER_UNDER,
  REDRAFT,
  MULTIVERSE_DRAFT,
]
