// Pack Empire, the rules.
//
// Ported from the standalone NFL MiniGames hub (April 2026), where every page
// carried its own copy of these numbers and two of the copies had drifted
// apart. One module now, import-free on purpose: the browser reads it to draw
// (rarity colours, the ladder, the formation, chemistry previews) and the
// server reads it to deal and to re-score, so the two can never disagree about
// what a pack is worth.
//
// What is NOT in here is the player pool (./pool.ts): single seasons, valued
// off their fantasy points. Everything below is the SCALE that pool fits: the
// score ranges, the rarity floors, the odds, the ladder.

// ============================================================
// Players and rarity
// ============================================================

export type Rarity = 'common' | 'rare' | 'dynasty' | 'transcendent' | 'immortal' | 'canton'

export const RARITIES: Rarity[] = ['common', 'rare', 'dynasty', 'transcendent', 'immortal', 'canton']

/** The rarities the odds tables know. Canton is a tier you see, not one that's
    dealt: a pack draws those seasons from the Immortal table (see tableRarity), so
    adding it moved no pack's odds and re-dealt nothing. */
export type TableRarity = Exclude<Rarity, 'canton'>

export function tableRarity(rarity: Rarity): TableRarity {
  return rarity === 'canton' ? 'immortal' : rarity
}

/** How many Canton cards exist, for the line under the reveal. The pool itself
    can't reach the browser. */
export const CANTON_CARDS = 10

/** The seven pools a pack can be drawn from. OT feeds both tackles, OG both
    guards, WR all three receivers. */
export type PoolKey = 'QB' | 'RB' | 'WR' | 'TE' | 'OT' | 'OG' | 'C'

export const POOL_KEYS: PoolKey[] = ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C']

/**
 * One card is one man's season: Cooper Kupp's 2021, not Cooper Kupp. The same
 * man can hold several cards, a different season and value on each.
 *
 * `pid`, `year` and `club` arrived with the season pool. Lineups banked before
 * it (league rosters, Mega Draft boards, Versus runs store whole cards) don't
 * carry them, so they are optional and every reader falls back to the id and
 * `team`.
 */
export type Player = {
  id: string
  /** The man, across all his seasons. */
  pid?: string
  name: string
  pos: PoolKey
  /** The franchise by its current name. Chemistry keys on this, so a 2000 St.
      Louis Ram and a 2021 Los Angeles Ram are teammates. */
  team: string
  /** The season. */
  year?: number
  /** The team as it was called that season: "St. Louis Rams". */
  club?: string
  /** Accolades score. The whole game is the sum of these. */
  score: number
  rarity: Rarity
  /** Short bullets printed on the card front: the stat line, then the points. */
  accolades: string[]
  /** Headshot cut-out, or null to fall back to the initial. */
  img: string | null
  /** Dealt face-hidden: Range and Ball Knower. See `BlindFace`. */
  blind?: BlindFace
  /** Dealt under a salary cap: what he costs, in $M. */
  salary?: number
}

/**
 * What the browser gets instead of a card's numbers on the two hard
 * difficulties. The value, rarity and stat lines never leave the server until
 * the lineup is locked, so a masked card's `score` is 0 and its `rarity` is a
 * placeholder ('common'), which is also what keeps every rarity tell (the glow
 * on a sealed pack, the shaking card back, the walkout) switched off.
 */
export type BlindFace = {
  level: 'range' | 'season'
  /** Range only: where the real value sits, somewhere inside. */
  lo?: number
  hi?: number
}

/** The man behind a card; a card from before the season pool is its own man. */
export function personOf(p: Pick<Player, 'id' | 'pid'>): string {
  return p.pid ?? p.id
}

/** "2021 Los Angeles Rams": what a card prints under the name. */
export function seasonLabel(p: Pick<Player, 'team' | 'year' | 'club'>): string {
  return p.year ? `${p.year} ${p.club ?? p.team}` : p.team
}

const LOGO_FILE: Record<string, string> = {
  'Arizona Cardinals': 'ari',
  'Atlanta Falcons': 'atl',
  'Baltimore Ravens': 'bal',
  'Buffalo Bills': 'buf',
  'Carolina Panthers': 'car',
  'Chicago Bears': 'chi',
  'Cincinnati Bengals': 'cin',
  'Cleveland Browns': 'cle',
  'Dallas Cowboys': 'dal',
  'Denver Broncos': 'den',
  'Detroit Lions': 'det',
  'Green Bay Packers': 'gb',
  'Houston Texans': 'hou',
  'Indianapolis Colts': 'ind',
  'Jacksonville Jaguars': 'jax',
  'Kansas City Chiefs': 'kc',
  'Las Vegas Raiders': 'lv',
  'Los Angeles Chargers': 'lac',
  'Los Angeles Rams': 'lar',
  'Miami Dolphins': 'mia',
  'Minnesota Vikings': 'min',
  'New England Patriots': 'ne',
  'New Orleans Saints': 'no',
  'New York Giants': 'nyg',
  'New York Jets': 'nyj',
  'Philadelphia Eagles': 'phi',
  'Pittsburgh Steelers': 'pit',
  'San Francisco 49ers': 'sf',
  'Seattle Seahawks': 'sea',
  'Tampa Bay Buccaneers': 'tb',
  'Tennessee Titans': 'ten',
  'Washington Commanders': 'wsh',
}

/** The team's logo for the card front. Keyed on the franchise, so every era
    wears today's logo: an Oiler carries the Titans', a '99 Ram the current Rams'. */
/** Each franchise's colours, for the Hall's banners: the deep one the cloth is
    dyed, then the trim. Keyed like LOGO_FILE, on the franchise's current name. */
export const TEAM_COLORS: Record<string, [string, string]> = {
  'Arizona Cardinals': ['#97233f', '#ffb612'],
  'Atlanta Falcons': ['#a71930', '#a5acaf'],
  'Baltimore Ravens': ['#241773', '#9e7c0c'],
  'Buffalo Bills': ['#00338d', '#c60c30'],
  'Carolina Panthers': ['#0085ca', '#101820'],
  'Chicago Bears': ['#0b162a', '#c83803'],
  'Cincinnati Bengals': ['#fb4f14', '#101820'],
  'Cleveland Browns': ['#311d00', '#ff3c00'],
  'Dallas Cowboys': ['#041e42', '#869397'],
  'Denver Broncos': ['#002244', '#fb4f14'],
  'Detroit Lions': ['#0076b6', '#b0b7bc'],
  'Green Bay Packers': ['#203731', '#ffb612'],
  'Houston Texans': ['#03202f', '#a71930'],
  'Indianapolis Colts': ['#002c5f', '#a2aaad'],
  'Jacksonville Jaguars': ['#006778', '#d7a22a'],
  'Kansas City Chiefs': ['#c8102e', '#ffb81c'],
  'Las Vegas Raiders': ['#1b1b1d', '#a5acaf'],
  'Los Angeles Chargers': ['#0080c6', '#ffc20e'],
  'Los Angeles Rams': ['#003594', '#ffa300'],
  'Miami Dolphins': ['#008e97', '#fc4c02'],
  'Minnesota Vikings': ['#4f2683', '#ffc62f'],
  'New England Patriots': ['#002244', '#c60c30'],
  'New Orleans Saints': ['#101820', '#d3bc8d'],
  'New York Giants': ['#0b2265', '#a71930'],
  'New York Jets': ['#125740', '#ffffff'],
  'Philadelphia Eagles': ['#004c54', '#a5acaf'],
  'Pittsburgh Steelers': ['#101820', '#ffb612'],
  'San Francisco 49ers': ['#aa0000', '#b3995d'],
  'Seattle Seahawks': ['#002244', '#69be28'],
  'Tampa Bay Buccaneers': ['#a71930', '#34302b'],
  'Tennessee Titans': ['#0c2340', '#4b92db'],
  'Washington Commanders': ['#5a1414', '#ffb612'],
}

export function teamLogo(p: Pick<Player, 'team'>): string | null {
  const file = LOGO_FILE[p.team]
  return file ? `/games/pack-empire/logos/${file}.webp` : null
}

/**
 * How each rarity looks. Unchanged from the original cards: these drive the
 * rarity effects (scan lines, crackle, plasma, the immortal arcs), and the
 * redesign that retuned them is the version that "looked off".
 */
export const RARITY_LOOK: Record<
  Rarity,
  { label: string; short: string; color: string; glow: string; art: string; shimmer: string }
> = {
  common: {
    label: 'Common',
    short: 'COM',
    color: '#c87840',
    glow: 'rgba(200,120,60,.6)',
    art: 'linear-gradient(150deg,#3d2210,#7a4820)',
    shimmer: '#a06030',
  },
  rare: {
    label: 'Rare',
    short: 'RARE',
    color: '#42c0f8',
    glow: 'rgba(66,192,248,.7)',
    art: 'linear-gradient(150deg,#062840,#104870)',
    shimmer: '#2890d8',
  },
  dynasty: {
    label: 'Dynasty',
    short: 'DYN',
    color: '#ffd700',
    glow: 'rgba(255,215,0,.8)',
    art: 'linear-gradient(150deg,#3a2800,#806010)',
    shimmer: '#c8a020',
  },
  transcendent: {
    label: 'Transcendent',
    short: 'TRN',
    color: '#e040ff',
    glow: 'rgba(224,64,255,.85)',
    art: 'linear-gradient(150deg,#280048,#6010b0)',
    shimmer: '#c020f0',
  },
  canton: {
    label: 'Canton',
    short: 'CAN',
    color: '#f4dfa4',
    glow: 'rgba(255,228,160,.85)',
    art: 'linear-gradient(150deg,#fffdf6,#d8cdb3)',
    shimmer: '#d9a93c',
  },
  immortal: {
    label: 'Immortal',
    short: 'IMM',
    color: '#28dc78',
    glow: 'rgba(40,220,120,.8)',
    art: 'linear-gradient(150deg,#021a0a,#04401a)',
    shimmer: '#20a050',
  },
}

/**
 * The value scale. A card's rarity is a function of its score and nothing
 * else; these are the floors the original data used (its own comment said
 * dynasty started at 1,500, its code said 1,600, and the code is what dealt
 * every pack).
 */
export const RARITY_FLOOR: Record<Rarity, number> = {
  common: 0,
  rare: 700,
  dynasty: 1600,
  transcendent: 2800,
  immortal: 4000,
  canton: 5200,
}

export function rarityForScore(score: number): Rarity {
  if (score >= RARITY_FLOOR.canton) return 'canton'
  if (score >= RARITY_FLOOR.immortal) return 'immortal'
  if (score >= RARITY_FLOOR.transcendent) return 'transcendent'
  if (score >= RARITY_FLOOR.dynasty) return 'dynasty'
  if (score >= RARITY_FLOOR.rare) return 'rare'
  return 'common'
}

// How a season becomes a score (scripts/pack-empire-pool builds the pool; this
// is for reading, nothing here runs it):
//
//   · Skill players: full PPR, 4 per passing TD. The rating is 65% points per
//     game and 35% total points over 14 games or the games he played, whichever
//     is more: from 14 games up that's points per game, and each game short
//     costs 2.5%. 1987 counts from 12, the strike season. Each position has a
//     fixed curve from rating to value (select_skill.CURVE), so no card's value
//     depends on any other card, and a new best-ever season just goes higher.
//   · Linemen: that season's honors plus what his offense did. First-team AP
//     All-Pro 10, second team 5, Pro Bowl 3, other selectors a little more,
//     then points, rushing and sacks allowed against that season's league.
//     The team's passing yards are printed on the card but don't score.
//
// Immortal and transcendent are the best seasons ever at the position; dynasty
// is about what the second- or third-best at the position does in a year, rare
// about what the tenth-best does, common everything under that.

// ============================================================
// Difficulty
// ============================================================

export type Difficulty = 'open' | 'range' | 'season' | 'cap'

export const DIFFICULTIES: Difficulty[] = ['open', 'range', 'season', 'cap']

/** Each difficulty is its own board: a blind 13,000 and an open 13,000 aren't
    the same number. `mode` is what game_runs files it under. */
export const DIFFICULTY_LOOK: Record<Difficulty, { label: string; line: string; mode: string }> = {
  open: {
    label: 'Standard',
    line: 'Every card face up: value, rarity and stats.',
    mode: 'offense',
  },
  range: {
    label: 'Range',
    line: 'A value range and the team. No rarity, no stats. Chemistry counts.',
    mode: 'offense-range',
  },
  season: {
    label: 'Ball Knower',
    line: 'Just the name and the season. No team, no value, no colours. Chemistry counts.',
    mode: 'offense-season',
  },
  cap: {
    label: 'Salary Cap',
    line: 'Cards face up, each with a salary, and a budget for all eleven. Chemistry counts.',
    mode: 'offense-cap',
  },
}

export function difficultyForMode(mode: string | null): Difficulty | null {
  return DIFFICULTIES.find((d) => DIFFICULTY_LOOK[d].mode === mode) ?? null
}

export function isDifficulty(v: unknown): v is Difficulty {
  return v === 'open' || v === 'range' || v === 'season' || v === 'cap'
}

/** The difficulties that hide a card's numbers until the lineup locks. */
export function isBlind(diff: Difficulty): boolean {
  return diff === 'range' || diff === 'season'
}

/**
 * The budget for all eleven, in $M: about 70% of what taking the top card in
 * every pack costs off your own packs, 60% off the richer shared ones. Set with
 * sim/hard-sim.ts: someone weighing price against value beats someone taking
 * the top card they can afford by 700 to 1,400, and chasing the best value per
 * dollar loses to both, so there's no one trick that solves it.
 */
export const SALARY_CAP = { own: 110, shared: 130 } as const

/** A signing is one of the cards you could use, at his salary if you can pay
    it. If you can't pay anyone's, the cheapest of them signs for nothing, so a
    pack can never leave a hole, it just leaves you the worst of it. Null means
    this card isn't on the table. Runs on both sides, so they always agree. */
export function signingPrice<T extends { id: string; salary?: number }>(card: T, usable: T[], left: number): number | null {
  const price = card.salary ?? 0
  if (price <= left) return price
  if (usable.some((c) => (c.salary ?? 0) <= left)) return null
  const cheapest = usable.reduce((a, b) => ((b.salary ?? 0) < (a.salary ?? 0) ? b : a))
  return cheapest.id === card.id ? 0 : null
}

/** Seconds on the Daily's clock for each pack, from the moment it's handed
    over: about 20 to read once it's ripped and flipped. */
export const DAILY_PACK_SECONDS = 25

/** Where a range's scale tops out. Above anything dealt: values have no ceiling
    now, and a card worth more than this widens its own range (see placeRange). */
export const VALUE_TOP = 6400

export const CAP_LINES = [
  'Every card has a salary, and you can only keep what you can pay for.',
  'A salary tracks a card’s value but can run well over or under it, so bargains are out there.',
  'You never see the next pack, so every dollar spent now is one you may want later.',
  'If you can’t afford anyone in a pack, its cheapest card signs for free.',
]

/** The two blind difficulties always play for chemistry, and so does an Even
    Versus, where chemistry is the whole game. */
export function chemistryCounts(diff: Difficulty, even = false): boolean {
  return even || diff !== 'open'
}

/** "Even · Range" on a Versus, or null for a plain Classic game. `bare` leaves
    out the mode's name, for a row already sitting under it. */
export function formatLine(format: 'classic' | 'even', difficulty: Difficulty, bare = false): string | null {
  const parts = [format === 'even' ? 'Even' : null, difficulty === 'open' ? null : DIFFICULTY_LOOK[difficulty].label].filter(Boolean)
  if (parts.length === 0) return null
  return bare ? parts.join(' · ') : `Versus · ${parts.join(' · ')}`
}

// ============================================================
// The eleven
// ============================================================

export type SlotKey = 'QB' | 'RB' | 'WR1' | 'WR2' | 'WR3' | 'TE' | 'LT' | 'LG' | 'C' | 'RG' | 'RT'

export type SlotDef = { key: SlotKey; label: string; short: string; pool: PoolKey }

/** Order matters: everything (lineups, picks, the formation) indexes this. */
export const SLOTS: SlotDef[] = [
  { key: 'QB', label: 'Quarterback', short: 'QB', pool: 'QB' },
  { key: 'RB', label: 'Running Back', short: 'HB', pool: 'RB' },
  { key: 'WR1', label: 'Wide Receiver', short: 'WR', pool: 'WR' },
  { key: 'WR2', label: 'Wide Receiver', short: 'WR', pool: 'WR' },
  { key: 'WR3', label: 'Wide Receiver', short: 'WR', pool: 'WR' },
  { key: 'TE', label: 'Tight End', short: 'TE', pool: 'TE' },
  { key: 'LT', label: 'Left Tackle', short: 'LT', pool: 'OT' },
  { key: 'LG', label: 'Left Guard', short: 'LG', pool: 'OG' },
  { key: 'C', label: 'Center', short: 'C', pool: 'C' },
  { key: 'RG', label: 'Right Guard', short: 'RG', pool: 'OG' },
  { key: 'RT', label: 'Right Tackle', short: 'RT', pool: 'OT' },
]

export const SLOT_COUNT = SLOTS.length

export function slotIndex(key: string): number {
  return SLOTS.findIndex((s) => s.key === key)
}

/** The open slot a card at this position takes: the first one left. Every
    slot at a position scores the same, so there's nothing to choose. */
export function slotForCard(pos: PoolKey, filled: Set<number>): number {
  return SLOTS.findIndex((s, i) => s.pool === pos && !filled.has(i))
}

/** The formation the field draws: line on top, receivers split wide, the
    backfield underneath. Indices into SLOTS. */
export const FORMATION = {
  line: [6, 7, 8, 9, 10],
  wrLeft: [2, 3],
  wrRight: [5, 4],
  backfield: [0, 1],
} as const

/** Pack art per pool, cropped from the original covers. */
export const PACK_ART: Record<PoolKey, string> = {
  QB: '/games/pack-empire/packs/qb.webp',
  RB: '/games/pack-empire/packs/rb.webp',
  WR: '/games/pack-empire/packs/wr.webp',
  TE: '/games/pack-empire/packs/te.webp',
  OT: '/games/pack-empire/packs/ot.webp',
  OG: '/games/pack-empire/packs/og.webp',
  C: '/games/pack-empire/packs/c.webp',
}

/** The Daily's mixed packs: any position can be in one. */
export const WILD_PACK_ART = '/games/pack-empire/packs/wild.webp'

export const POOL_LABEL: Record<PoolKey, string> = {
  QB: 'Quarterback',
  RB: 'Running Back',
  WR: 'Wide Receiver',
  TE: 'Tight End',
  OT: 'Tackle',
  OG: 'Guard',
  C: 'Center',
}

// ============================================================
// The ladder
// ============================================================

export type Tier = { min: number; label: string; color: string }

/** Highest first. The original printed an emoji beside each; the site
    doesn't use them, so a tier is its name, its colour and its rung. */
export const TIERS: Tier[] = [
  { min: 20001, label: 'GOAT Offense', color: '#ff5cd6' },
  { min: 17001, label: 'Hall of Fame', color: '#f4c06a' },
  { min: 14001, label: 'Super Bowl Dynasty', color: '#e8a84b' },
  { min: 11001, label: 'All-Pro Elite', color: '#6ba8c0' },
  { min: 8001, label: 'Pro Bowl Caliber', color: '#d0703c' },
  { min: 5001, label: 'Starter Quality', color: '#bfb5a0' },
  { min: 2001, label: 'Backup Unit', color: '#8d8473' },
  { min: 0, label: 'Practice Squad', color: '#a87420' },
]

export function tierFor(score: number): Tier {
  return TIERS.find((t) => score >= t.min) ?? TIERS[TIERS.length - 1]
}

/** 1 for the top rung, 8 for the bottom. */
export function tierRung(score: number): number {
  return TIERS.length - TIERS.indexOf(tierFor(score))
}

// ============================================================
// Packs
// ============================================================

export const PACK_SIZE = 5

export type Weights = Record<TableRarity, number>

/**
 * Empire Builder odds. These are weights PER CARD, not per rarity: every
 * player in the pool carries his rarity's weight, so the chance of an
 * immortal depends on how many immortals the pool holds as well as on the 1.
 * That is how the original dealt, and the rebuilt pool should be sized with
 * it in mind (see `packOdds` for the real figure off any pool).
 *
 * Tuned 2026-10-30: playing the best card from every pack reached GOAT 35% of
 * the time, and Joey wants a top rung you can't just tick off and leave. These
 * put that same perfect play at a median around 15.8k, about 7% GOAT and 25%
 * Hall of Fame, so sim/sim.ts is the check on any change here. The best card
 * in an ordinary pack is about 36% common, 41% rare, 19% dynasty, 4% transcendent.
 *
 * These are weights per card, read through cardWeight in ./pool.ts, which holds
 * each position to the mix they were tuned on: 399 common, 233 rare, 109 dynasty,
 * 59 transcendent, 33 immortal. So the pool can grow without touching any table
 * here, and more cards to collect doesn't change what a pack holds. (Dynasty took
 * a little extra off the ordinary table: that batch ran slightly stronger, which
 * had Hall of Fame at 26%.)
 */
export const SOLO_WEIGHTS: { normal: Weights; captain: Weights } = {
  normal: { common: 43.4, rare: 11.6, dynasty: 7.8, transcendent: 2.8, immortal: 0.7 },
  captain: { common: 4.3, rare: 14.8, dynasty: 33.5, transcendent: 21.5, immortal: 3.5 },
}

/**
 * One card in every pack is drawn off a second table, an unadvertised bonus:
 * the site prints the base odds only. It only moves commons up to rares, so it
 * has no say in how many dynasties and up get dealt. Note the captain's second
 * table trades immortals for transcendents; that is the original's number,
 * kept as found.
 */
export const SOLO_BOOSTED: { normal: Weights; captain: Weights } = {
  normal: { ...SOLO_WEIGHTS.normal, common: 41.2, rare: 14.2 },
  captain: { ...SOLO_WEIGHTS.captain, rare: 12.1, transcendent: 23.9, immortal: 1.4 },
}

/**
 * The real chance of each rarity on one ordinary draw, off an actual pool.
 * The hub used to print the raw weights as "base odds", which they are only
 * when every rarity holds the same number of players.
 */
export function packOdds<T extends { rarity: Rarity }>(pool: T[], weigh: (p: T) => number): Record<Rarity, number> {
  const mass: Record<Rarity, number> = { common: 0, rare: 0, dynasty: 0, transcendent: 0, immortal: 0, canton: 0 }
  for (const p of pool) mass[p.rarity] += weigh(p)
  const total = RARITIES.reduce((s, r) => s + mass[r], 0) || 1
  const out = { ...mass }
  for (const r of RARITIES) out[r] = mass[r] / total
  return out
}

/**
 * Shared packs, the ones two or more people see the same five cards in: an
 * Even Versus and the Daily. Richer than an ordinary pack, about 57% common,
 * 30% rare, 11% dynasty and 3% above that per card, so most packs hold a real
 * choice and picking the right card is the game. There's no captain table
 * under it in an Even Versus, and no second table anywhere.
 */
export const SHARED_WEIGHTS: Weights = { common: 26.2, rare: 23.6, dynasty: 18, transcendent: 6.4, immortal: 2.1 }

/** The Daily's reserve card, dealt only when nothing in a pack fits an open
    slot: replacement level on purpose, so filling wrong still costs you. */
export const RESERVE_WEIGHTS: Weights = { common: 56.1, rare: 32.6, dynasty: 0, transcendent: 0, immortal: 0 }

// ============================================================
// League Mode
// ============================================================

export type PackTier = 'standard_pack' | 'rising_pack' | 'prime_pack' | 'elite_drop'

export const PACK_TIERS: PackTier[] = ['standard_pack', 'rising_pack', 'prime_pack', 'elite_drop']

export const PACK_TIER_LABEL: Record<PackTier, string> = {
  standard_pack: 'Standard Pack',
  rising_pack: 'Rising Pack',
  prime_pack: 'Prime Pack',
  elite_drop: 'Elite Drop',
}

/** Each tier wears the colour of the rarity it chases. */
export const PACK_TIER_COLOR: Record<PackTier, string> = {
  standard_pack: '#42c0f8',
  rising_pack: '#ffd700',
  prime_pack: '#e040ff',
  elite_drop: '#28dc78',
}

/** Transcendent weights cut by a fifth with the 2026-10-30 pool, which holds
    nearly twice as many of them, so a pack is as likely to hold one as before. */
export const LEAGUE_WEIGHTS: Record<PackTier, Weights> = {
  standard_pack: { common: 44.6, rare: 15.5, dynasty: 12.2, transcendent: 6.4, immortal: 0.7 },
  rising_pack: { common: 28.9, rare: 20.3, dynasty: 16.3, transcendent: 9.6, immortal: 1.4 },
  prime_pack: { common: 15.7, rare: 23.6, dynasty: 18.8, transcendent: 12.7, immortal: 2.8 },
  elite_drop: { common: 11.4, rare: 16.8, dynasty: 22, transcendent: 17.5, immortal: 5.6 },
}

/** League packs have a second table too; in the original it only differs
    from the first by one point, on the Elite Drop's rares. Kept as found. */
export const LEAGUE_BOOSTED: Record<PackTier, Weights> = {
  ...LEAGUE_WEIGHTS,
  elite_drop: { ...LEAGUE_WEIGHTS.elite_drop, rare: 16.1 },
}

export const REGULAR_WEEKS = 8
export const MIN_LEAGUE_PLAYERS = 4
export const LEAGUE_SIZES = [4, 6, 8, 10, 12]

/**
 * Last week's rank buys this week's boosted pack. The winner of the week gets
 * the Elite Drop; the top fifth (at least two) a Prime Pack; the top half (at
 * least four) a Rising Pack; everyone else opens standard.
 */
export function packTierForRank(rank: number, total: number): PackTier {
  if (rank === 1) return 'elite_drop'
  if (rank <= Math.max(2, Math.ceil(total * 0.2))) return 'prime_pack'
  if (rank <= Math.max(4, Math.ceil(total * 0.5))) return 'rising_pack'
  return 'standard_pack'
}

/**
 * Packs on the board in a regular-season week if a player has locked someone
 * every week so far: eleven in week one, one fewer a week, never below four.
 * In practice a team opens one pack per unlocked slot, and this is the count
 * the schedule promises.
 */
export function packsForWeek(week: number): number {
  return Math.max(12 - week, 4)
}

/** Teams that reach the postseason. 'half' rounds down. */
export function playoffFieldSize(setting: string, members: number): number {
  if (setting === 'half') return Math.floor(members / 2)
  const n = parseInt(setting, 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, members) : Math.floor(members / 2)
}

/** The choices a commissioner gets for the playoff field at a league size. */
export function playoffOptions(maxPlayers: number): string[] {
  const top = Math.floor(maxPlayers / 2)
  const out = ['half']
  for (let n = 2; n < top; n++) out.push(String(n))
  return out
}

export type LeaguePhase = 'pregame' | 'regular' | 'gauntlet' | 'finals' | 'complete'

export const PHASE_LABEL: Record<LeaguePhase, string> = {
  pregame: 'Pregame',
  regular: 'Regular season',
  gauntlet: 'The Gauntlet',
  finals: 'The Final',
  complete: 'Season complete',
}

// ============================================================
// Mega Draft
// ============================================================

/** The shared board: 36 players, every position deep enough for both. */
export const MEGA_POOL_COUNTS: Record<PoolKey, number> = {
  QB: 4,
  RB: 4,
  WR: 8,
  TE: 4,
  OT: 6,
  OG: 6,
  C: 4,
}

export const MEGA_WEIGHTS: Weights = { common: 26.2, rare: 23.6, dynasty: 18, transcendent: 6.4, immortal: 2.1 }

export const MEGA_TOTAL_PICKS = SLOT_COUNT * 2

/** Snake order in pairs: P1 P2 P2 P1 P1 P2 P2 … */
export function megaPickOwner(pick: number): 0 | 1 {
  const pair = Math.floor(pick / 2)
  if (pair % 2 === 0) return pick % 2 === 0 ? 0 : 1
  return pick % 2 === 0 ? 1 : 0
}

/**
 * What a man is worth to the seat on the clock: his score, plus how far his
 * position falls off if they pass on him, which is the best one left there
 * once the other seat has filled its own slots. A deep position can wait; the
 * last good center can't. The CPU drafts by this, and the dealer plays it out
 * to check a board is fair.
 *
 * A position the other seat has filled can always wait: nobody can take him,
 * and everyone fills all eleven, so he'll still be there at the end. Passing
 * on him costs nothing, so he's worth next to nothing until the fight
 * elsewhere is down to scraps. Still scaled by score, so the best man at the
 * position goes first when the time comes.
 */
export function megaWorth(p: Player, left: Player[], rivalOpen: number): number {
  if (rivalOpen === 0) return 0.02 * p.score
  const rest = left
    .filter((q) => q.pos === p.pos && q.id !== p.id)
    .map((q) => q.score)
    .sort((a, b) => b - a)
  const fallback = rest.length ? rest[Math.min(rivalOpen, rest.length - 1)] : 0
  return p.score - fallback + 0.4 * p.score
}

// ============================================================
// Chemistry (League Mode)
// ============================================================

export const SYNERGY_POINTS = { medium: 250, conservative: 150 } as const

/**
 * The hard modes play for double. At League's numbers chemistry was worth a
 * few hundred a run, so a card's value decided every pick and an Even Versus
 * was tied more often than not; at double, someone drafting for it beats
 * someone taking the top card 74% of the time and loses 1% (sim/hard-sim.ts).
 * League Mode keeps its own numbers.
 */
export const HARD_CHEM = 2

/** Two men off the same team in the same season aren't just one franchise,
    they really played together: their bond doubles again. */
export const TEAMMATE_MULTIPLIER = 2

type SynergyTier = keyof typeof SYNERGY_POINTS

/** Same-team pairs that click. Keys are sorted position pairs. */
const BEST_BOND = SYNERGY_POINTS.medium * HARD_CHEM

/** Chemistry on the hard modes, in the words the key and the Daily print. */
export const CHEM_LINES = [
  `Two men from the same franchise add up to ${BEST_BOND.toLocaleString()}, when their positions work together: a quarterback and his receiver, a center and his guard.`,
  `Same team in the same season means they really played together, and that pays ${(BEST_BOND * TEAMMATE_MULTIPLIER).toLocaleString()}.`,
  'Two men from rival teams cost you points. The franchise is what counts, so the Oilers are the Titans.',
]

const SYNERGY: Record<string, SynergyTier> = {}
for (const [a, b, t] of [
  ['QB', 'WR', 'medium'],
  ['QB', 'TE', 'medium'],
  ['QB', 'OT', 'medium'],
  ['QB', 'C', 'medium'],
  ['OG', 'RB', 'medium'],
  ['C', 'RB', 'medium'],
  ['C', 'OG', 'medium'],
  ['C', 'OT', 'medium'],
  ['OG', 'OT', 'medium'],
  ['QB', 'RB', 'conservative'],
  ['QB', 'OG', 'conservative'],
  ['OT', 'RB', 'conservative'],
  ['WR', 'WR', 'conservative'],
  ['TE', 'OT', 'conservative'],
] as const) {
  SYNERGY[[a, b].sort().join('|')] = t
}

/**
 * What it costs to field two players from rival teams, by how closely their
 * positions work together. The original keyed one of these as 'C ||RB', with
 * a stray space, so a center and a back from rival teams never cost anything;
 * it is spelled right here.
 */
const RIVALRY_COST: Record<string, number> = {}
for (const [a, b, pts] of [
  ['QB', 'WR', -100],
  ['QB', 'TE', -100],
  ['QB', 'RB', -50],
  ['WR', 'WR', -75],
  ['RB', 'TE', -25],
  ['QB', 'OT', -100],
  ['QB', 'OG', -50],
  ['QB', 'C', -125],
  ['OT', 'RB', -50],
  ['OG', 'RB', -75],
  ['C', 'RB', -50],
  ['OG', 'OT', -50],
  ['C', 'OT', -50],
  ['C', 'OG', -50],
  ['OG', 'OG', -50],
] as const) {
  RIVALRY_COST[[a, b].sort().join('|')] = pts
}

/**
 * Rival teams. The original scored chemistry off one list and showed rivalries
 * off another, longer one; this is the longer one, so what a card says and
 * what the score does are the same thing.
 */
const RIVAL_PAIRS: [string, string][] = [
  ['New England Patriots', 'New York Jets'],
  ['New England Patriots', 'Buffalo Bills'],
  ['New England Patriots', 'Miami Dolphins'],
  ['Buffalo Bills', 'Miami Dolphins'],
  ['Buffalo Bills', 'New York Jets'],
  ['Miami Dolphins', 'New York Jets'],
  ['Baltimore Ravens', 'Pittsburgh Steelers'],
  ['Baltimore Ravens', 'Cleveland Browns'],
  ['Pittsburgh Steelers', 'Cleveland Browns'],
  ['Cincinnati Bengals', 'Pittsburgh Steelers'],
  ['Cincinnati Bengals', 'Baltimore Ravens'],
  ['Houston Texans', 'Tennessee Titans'],
  ['Indianapolis Colts', 'Tennessee Titans'],
  ['Jacksonville Jaguars', 'Tennessee Titans'],
  ['Houston Texans', 'Indianapolis Colts'],
  ['Kansas City Chiefs', 'Las Vegas Raiders'],
  ['Kansas City Chiefs', 'Los Angeles Chargers'],
  ['Las Vegas Raiders', 'Los Angeles Chargers'],
  ['Denver Broncos', 'Kansas City Chiefs'],
  ['Denver Broncos', 'Las Vegas Raiders'],
  ['Dallas Cowboys', 'Philadelphia Eagles'],
  ['Dallas Cowboys', 'New York Giants'],
  ['Dallas Cowboys', 'Washington Commanders'],
  ['Philadelphia Eagles', 'New York Giants'],
  ['Philadelphia Eagles', 'Washington Commanders'],
  ['New York Giants', 'Washington Commanders'],
  ['Green Bay Packers', 'Chicago Bears'],
  ['Green Bay Packers', 'Minnesota Vikings'],
  ['Chicago Bears', 'Minnesota Vikings'],
  ['Detroit Lions', 'Green Bay Packers'],
  ['Detroit Lions', 'Chicago Bears'],
  ['New Orleans Saints', 'Atlanta Falcons'],
  ['New Orleans Saints', 'Tampa Bay Buccaneers'],
  ['Atlanta Falcons', 'Tampa Bay Buccaneers'],
  ['Carolina Panthers', 'New Orleans Saints'],
  ['San Francisco 49ers', 'Seattle Seahawks'],
  ['San Francisco 49ers', 'Los Angeles Rams'],
  ['Seattle Seahawks', 'Los Angeles Rams'],
  ['Arizona Cardinals', 'San Francisco 49ers'],
  ['Arizona Cardinals', 'Seattle Seahawks'],
]

const RIVALS = new Set(RIVAL_PAIRS.map(([a, b]) => [a, b].sort().join('|')))

export function areRivals(teamA: string, teamB: string): boolean {
  if (teamA === teamB) return false
  return RIVALS.has([teamA, teamB].sort().join('|'))
}

export type ChemBond = {
  a: string
  b: string
  aName: string
  bName: string
  type: 'synergy' | 'rivalry'
  points: number
  reason: string
}

export type Chemistry = {
  bonds: ChemBond[]
  synergy: number
  rivalry: number
  total: number
}

type ChemPlayer = Pick<Player, 'id' | 'name' | 'pos' | 'team' | 'year'>

function bondFor(x: ChemPlayer, y: ChemPlayer, hard: boolean): ChemBond | null {
  // A Ball Knower card hides its team, and a blank never matches a blank.
  if (!x.team || !y.team) return null
  const pair = [x.pos, y.pos].sort().join('|')
  if (x.team === y.team) {
    const tier = SYNERGY[pair]
    if (!tier) return null
    const real = hard && !!x.year && x.year === y.year
    return {
      a: x.id,
      b: y.id,
      aName: x.name,
      bName: y.name,
      type: 'synergy',
      points: SYNERGY_POINTS[tier] * (hard ? HARD_CHEM : 1) * (real ? TEAMMATE_MULTIPLIER : 1),
      reason: real ? `${x.pos} and ${y.pos}, real teammates on the ${x.year} ${x.team}` : `${x.pos} and ${y.pos}, ${x.team}`,
    }
  }
  if (areRivals(x.team, y.team)) {
    const cost = RIVALRY_COST[pair]
    if (!cost) return null
    return {
      a: x.id,
      b: y.id,
      aName: x.name,
      bName: y.name,
      type: 'rivalry',
      points: cost * (hard ? HARD_CHEM : 1),
      reason: `${x.pos} and ${y.pos}, ${x.team} vs ${y.team}`,
    }
  }
  return null
}

export function chemistryFor(roster: ChemPlayer[], hard = false): Chemistry {
  const bonds: ChemBond[] = []
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const b = bondFor(roster[i], roster[j], hard)
      if (b) bonds.push(b)
    }
  }
  const synergy = bonds.filter((b) => b.type === 'synergy').reduce((s, b) => s + b.points, 0)
  const rivalry = bonds.filter((b) => b.type === 'rivalry').reduce((s, b) => s + b.points, 0)
  return { bonds, synergy, rivalry, total: synergy + rivalry }
}

/** What one candidate would add to a partial roster: the hint on a card in a
    league pack before it is taken. */
export function chemistryPreview(candidate: ChemPlayer, roster: ChemPlayer[], hard = false): number {
  let net = 0
  for (const p of roster) {
    if (p.id === candidate.id) continue
    const b = bondFor(candidate, p, hard)
    if (b) net += b.points
  }
  return net
}

// ============================================================
// Seeds
// ============================================================

/** No I, O, 0 or 1, so a seed read out loud survives. Upper case only: the
    shared runs route upper-cases every seed it is given. */
export const SEED_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/**
 * The captain a seed was signed for. Readable by anyone (it is the ninth
 * character); only the server can sign one, which is the part that matters.
 * An Even seed has no captain, its ninth character is past the last slot.
 */
export function captainFromSeed(seed: string): number | null {
  const i = SEED_ALPHABET.indexOf(seed[8] ?? '')
  return i >= 0 && i < SLOT_COUNT ? i : null
}

/** The ninth character of a seed with no captain: an Even Versus. */
export const EVEN_MARK = '9'

/** The tenth character of a sixteen-character seed. Seeds dealt before there
    were difficulties are fifteen characters, and those are all open. */
export const SEED_DIFF: Record<string, Difficulty> = { A: 'open', R: 'range', S: 'season', C: 'cap' }

export function difficultyFromSeed(seed: string): Difficulty {
  return seed.length === 16 ? (SEED_DIFF[seed[9]] ?? 'open') : 'open'
}

// ============================================================
// Helpers
// ============================================================

const SUFFIXES = new Set(['jr.', 'jr', 'sr.', 'sr', 'ii', 'iii', 'iv', 'v', 'vi'])

/** "Mahomes", "Pittman Jr." — what fits on a slot card. */
export function surname(name: string): string {
  const parts = name.trim().split(/\s+/)
  const last = parts[parts.length - 1]
  if (SUFFIXES.has(last.toLowerCase()) && parts.length >= 3) return `${parts[parts.length - 2]} ${last}`
  return last
}

/** "P. Mahomes" — what fits in a draft-board row. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name
  return `${parts[0][0]}. ${surname(name)}`
}

export function lineupScore(lineup: (Pick<Player, 'score'> | null)[]): number {
  return lineup.reduce((s, p) => s + (p?.score ?? 0), 0)
}

export function filledCount(lineup: (unknown | null)[]): number {
  return lineup.filter(Boolean).length
}
