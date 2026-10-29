// Pack Empire, the rules.
//
// Ported from the standalone NFL MiniGames hub (April 2026), where every page
// carried its own copy of these numbers and two of the copies had drifted
// apart. One module now, import-free on purpose: the browser reads it to draw
// (rarity colours, the ladder, the formation, chemistry previews) and the
// server reads it to deal and to re-score, so the two can never disagree about
// what a pack is worth.
//
// What is NOT in here is the player pool. Who gets which value is being
// rebuilt from scratch; see ./pool.ts. Everything below is the SCALE that pool
// has to fit: the score ranges, the rarity floors, the odds, the ladder.

// ============================================================
// Players and rarity
// ============================================================

export type Rarity = 'common' | 'rare' | 'dynasty' | 'transcendent' | 'immortal'

export const RARITIES: Rarity[] = ['common', 'rare', 'dynasty', 'transcendent', 'immortal']

/** The seven pools a pack can be drawn from. OT feeds both tackles, OG both
    guards, WR all three receivers. */
export type PoolKey = 'QB' | 'RB' | 'WR' | 'TE' | 'OT' | 'OG' | 'C'

export const POOL_KEYS: PoolKey[] = ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C']

export type Player = {
  id: string
  name: string
  pos: PoolKey
  team: string
  /** Accolades score. The whole game is the sum of these. */
  score: number
  rarity: Rarity
  /** Short bullets printed on the card front. */
  accolades: string[]
  /** Headshot cut-out, or null to fall back to the initial. */
  img: string | null
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
    short: 'RAR',
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
 * The value scale the rebuilt pool has to fit. A player's rarity is a
 * function of his score and nothing else; these are the floors the original
 * data used (its own comment said dynasty started at 1,500, its code said
 * 1,600, and the code is what dealt every pack).
 */
export const RARITY_FLOOR: Record<Rarity, number> = {
  common: 0,
  rare: 700,
  dynasty: 1600,
  transcendent: 2800,
  immortal: 4000,
}

export function rarityForScore(score: number): Rarity {
  if (score >= RARITY_FLOOR.immortal) return 'immortal'
  if (score >= RARITY_FLOOR.transcendent) return 'transcendent'
  if (score >= RARITY_FLOOR.dynasty) return 'dynasty'
  if (score >= RARITY_FLOOR.rare) return 'rare'
  return 'common'
}

/**
 * How the original pool turned a career into a score. Kept here as the brief
 * for the rebuild rather than as code anything runs: the new values should
 * land on the same scale (a solid starter around 600, a perennial Pro Bowler
 * past 1,600, an all-time great past 4,000) or every tier on the ladder moves.
 */
export const ACCOLADE_POINTS: { award: string; points: string }[] = [
  { award: 'Pro Bowl', points: '+80 each' },
  { award: 'AP Second-Team All-Pro', points: '+100 each' },
  { award: 'AP First-Team All-Pro', points: '+220 each' },
  { award: 'Super Bowl ring', points: '+150 each' },
  { award: 'Super Bowl MVP', points: '+300' },
  { award: 'League MVP', points: '+420 each' },
  { award: 'Offensive Player of the Year', points: '+260' },
  { award: 'Offensive Rookie of the Year', points: '+120' },
  { award: 'Rushing or receiving title', points: '+120 each' },
  { award: 'Major record or milestone', points: '+80 to +180' },
]

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
  { min: 20001, label: 'GOAT Offense', color: '#e040ff' },
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

export type Weights = Record<Rarity, number>

/**
 * Empire Builder odds. These are weights PER CARD, not per rarity: every
 * player in the pool carries his rarity's weight, so the chance of an
 * immortal depends on how many immortals the pool holds as well as on the 1.
 * That is how the original dealt, and the rebuilt pool should be sized with
 * it in mind (see `packOdds` for the real figure off any pool).
 */
export const SOLO_WEIGHTS: { normal: Weights; captain: Weights } = {
  normal: { common: 45, rare: 27, dynasty: 17, transcendent: 10, immortal: 1 },
  captain: { common: 5, rare: 22, dynasty: 41, transcendent: 27, immortal: 5 },
}

/**
 * One card in every pack is drawn off a second table. Note the captain's
 * second table trades immortals for transcendents; that is the original's
 * number, kept as found.
 */
export const SOLO_BOOSTED: { normal: Weights; captain: Weights } = {
  normal: { ...SOLO_WEIGHTS.normal, common: 40, rare: 38 },
  captain: { ...SOLO_WEIGHTS.captain, rare: 18, transcendent: 30, immortal: 2 },
}

/**
 * The real chance of each rarity on one ordinary draw, off an actual pool.
 * The hub used to print the raw weights as "base odds", which they are only
 * when every rarity holds the same number of players.
 */
export function packOdds(pool: { rarity: Rarity }[], weights: Weights): Record<Rarity, number> {
  const mass: Record<Rarity, number> = { common: 0, rare: 0, dynasty: 0, transcendent: 0, immortal: 0 }
  for (const p of pool) mass[p.rarity] += weights[p.rarity]
  const total = RARITIES.reduce((s, r) => s + mass[r], 0) || 1
  const out = { ...mass }
  for (const r of RARITIES) out[r] = mass[r] / total
  return out
}

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

export const LEAGUE_WEIGHTS: Record<PackTier, Weights> = {
  standard_pack: { common: 51, rare: 23, dynasty: 15, transcendent: 10, immortal: 1 },
  rising_pack: { common: 33, rare: 30, dynasty: 20, transcendent: 15, immortal: 2 },
  prime_pack: { common: 18, rare: 35, dynasty: 23, transcendent: 20, immortal: 4 },
  elite_drop: { common: 13, rare: 25, dynasty: 27, transcendent: 27, immortal: 8 },
}

/** League packs have a second table too; in the original it only differs
    from the first by one point, on the Elite Drop's rares. Kept as found. */
export const LEAGUE_BOOSTED: Record<PackTier, Weights> = {
  ...LEAGUE_WEIGHTS,
  elite_drop: { ...LEAGUE_WEIGHTS.elite_drop, rare: 24 },
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

export const MEGA_WEIGHTS: Weights = { common: 30, rare: 35, dynasty: 22, transcendent: 10, immortal: 3 }

export const MEGA_TOTAL_PICKS = SLOT_COUNT * 2

/** Snake order in pairs: P1 P2 P2 P1 P1 P2 P2 … */
export function megaPickOwner(pick: number): 0 | 1 {
  const pair = Math.floor(pick / 2)
  if (pair % 2 === 0) return pick % 2 === 0 ? 0 : 1
  return pick % 2 === 0 ? 1 : 0
}

// ============================================================
// Chemistry (League Mode)
// ============================================================

export const SYNERGY_POINTS = { medium: 250, conservative: 150 } as const

type SynergyTier = keyof typeof SYNERGY_POINTS

/** Same-team pairs that click. Keys are sorted position pairs. */
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

type ChemPlayer = Pick<Player, 'id' | 'name' | 'pos' | 'team'>

function bondFor(x: ChemPlayer, y: ChemPlayer): ChemBond | null {
  const pair = [x.pos, y.pos].sort().join('|')
  if (x.team === y.team) {
    const tier = SYNERGY[pair]
    if (!tier) return null
    return {
      a: x.id,
      b: y.id,
      aName: x.name,
      bName: y.name,
      type: 'synergy',
      points: SYNERGY_POINTS[tier],
      reason: `${x.pos} and ${y.pos}, ${x.team}`,
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
      points: cost,
      reason: `${x.pos} and ${y.pos}, ${x.team} vs ${y.team}`,
    }
  }
  return null
}

export function chemistryFor(roster: ChemPlayer[]): Chemistry {
  const bonds: ChemBond[] = []
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const b = bondFor(roster[i], roster[j])
      if (b) bonds.push(b)
    }
  }
  const synergy = bonds.filter((b) => b.type === 'synergy').reduce((s, b) => s + b.points, 0)
  const rivalry = bonds.filter((b) => b.type === 'rivalry').reduce((s, b) => s + b.points, 0)
  return { bonds, synergy, rivalry, total: synergy + rivalry }
}

/** What one candidate would add to a partial roster: the hint on a card in a
    league pack before it is taken. */
export function chemistryPreview(candidate: ChemPlayer, roster: ChemPlayer[]): number {
  let net = 0
  for (const p of roster) {
    if (p.id === candidate.id) continue
    const b = bondFor(candidate, p)
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
 */
export function captainFromSeed(seed: string): number | null {
  const i = SEED_ALPHABET.indexOf(seed[8] ?? '')
  return i >= 0 && i < SLOT_COUNT ? i : null
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
