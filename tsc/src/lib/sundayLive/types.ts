// Shared types for Sunday Live v2.
//
// One shape per league per poll cycle. Server-built, JSON-serializable,
// consumed identically by SSR (first paint) and the client poll hook
// (subsequent polls). Components read from this — nothing fetches its own.

export type Platform = 'sleeper' | 'espn' | 'yahoo' | 'nfl'

// "live"  → real-time polling fully wired (Sleeper today)
// "best"  → live polling works but is best-effort (ESPN/Yahoo private leagues)
// "stale" → no live feed available; rendering last ingest snapshot
export type LiveQuality = 'live' | 'best' | 'stale'

export type GameState = 'pre' | 'live' | 'final'

// ── Matchup ──────────────────────────────────────────────────────────────────

export type SlPlayer = {
  playerId: string
  name: string
  team: string | null         // canonical NFL abbr
  position: string | null     // QB/RB/WR/TE/K/DEF
  slot: string | null         // lineup slot label when isStarter
  points: number              // live points scored
  projected: number           // pre-game projection (frozen at lock)
  isStarter: boolean
  injuryStatus: string | null // Sleeper status (Out/Doubtful/Questionable/IR/...)
  // Game context — derived from NFL scoreboard cross-reference.
  game: {
    state: GameState
    quarterClock: string | null  // e.g. "Q3 4:18"
    onField: boolean             // player's team has possession right now
    inRedZone: boolean
  } | null
}

export type SlSide = {
  rosterId: number
  ownerId: string | null
  ownerName: string
  teamName: string
  avatarUrl: string | null
  score: number
  projected: number
  wp: number              // [0, 1]
  playersRemaining: number // starters whose games haven't ended
  players: SlPlayer[]
}

export type SlMatchup = {
  matchupId: number
  status: GameState
  // Side A is *always* the lower roster_id so the "side A vs side B" ordering
  // is stable across polls (otherwise the hero card flickers).
  a: SlSide
  b: SlSide
  closeness: number       // |a.score - b.score|
  // Derived & cached on the frame so the client never recomputes.
  sweatIndex: number      // 0..100
  pickems: PickemsBadge | null
  stack: StackUnit[]      // QB→pass-catcher units inside this matchup
}

// ── Pickems ──────────────────────────────────────────────────────────────────

// "pctA" is the % of voters that picked side A. Variants are mutually exclusive,
// the renderer picks the most-interesting badge per card.
export type PickemsBadge = {
  pctA: number               // 0..100
  totalVotes: number
  variant: 'split' | 'coin-flip' | 'upset-alert' | 'consensus-cold'
  // For upset alert: the underdog is currently leading
  underdogLeading?: boolean
}

// ── Stacks ───────────────────────────────────────────────────────────────────

export type StackUnit = {
  ownerName: string
  team: string                // NFL team abbr
  players: { name: string; position: string; points: number }[]
  combined: number
}

// ── NFL games strip ──────────────────────────────────────────────────────────

export type SlNflGame = {
  id: string
  state: GameState
  short: string              // "Q3 4:18" / "FINAL" / "1:00 PM ET"
  date: string               // ISO kickoff time — drives time-window grouping
  homeAbbr: string | null
  awayAbbr: string | null
  homeFull: string           // full team name for the games page
  awayFull: string
  homeScore: number
  awayScore: number
  possessionAbbr: string | null
  isRedZone: boolean
  lastPlay: string | null    // shown on /games page
  downDistance: string | null
  broadcast: string | null   // "CBS", "FOX", ...
  // Rostered-player annotations: every starter from this league whose NFL team
  // is in this game. Used to sort the strip + render the ON FIELD/RED ZONE chip.
  onFieldLeagueStarters: string[]   // player names currently on the field
  redZoneLeagueStarters: string[]
  hasLeagueStarter: boolean
}

// ── The Wire ─────────────────────────────────────────────────────────────────

export type WireKind =
  | 'kickoff'      // game starts
  | 'td'           // rostered scoring play
  | 'fg'           // rostered FG
  | 'injury'       // injury status change
  | 'inactive'     // pre-game OUT, started by someone
  | 'big-moment'   // wave/surge/earthquake — see Moments below
  | 'final'        // game finishes
  | 'note'         // general info

export type WireEvent = {
  key: string                // stable across polls; dedupe in client
  at: string                 // ISO timestamp
  kind: WireKind
  // One-line broadcast-style copy. Pre-rendered server-side.
  headline: string
  // Optional second-line context (the manager/team affected, etc.).
  detail: string | null
  // Affiliation — drives the colored left rule on the row.
  affiliation: 'league' | 'nfl' | null
}

// ── Big Moments (frame-to-frame WP swings) ───────────────────────────────────

export type MomentTier = 'wave' | 'surge' | 'earthquake'

export type Moment = {
  id: string                 // stable: matchupId + at
  matchupId: number
  at: string                 // ISO
  tier: MomentTier
  wpBefore: number           // for side A
  wpAfter: number
  side: 'a' | 'b'            // which side gained the swing
  cause: string              // "Bijan 18yd TD vs ATL"
  // Italic-serif broadcast caption ("the surge that broke the dam").
  caption: string | null
}

// ── Bottom ticker top-performers ─────────────────────────────────────────────

export type TickerScope = 'all' | 'qb' | 'rb' | 'wr' | 'te' | 'k' | 'def' | 'bench' | 'duds'

export type TickerEntry = {
  rank: number               // 1..10
  playerId: string
  name: string
  team: string | null
  position: string | null
  points: number
  projDelta: number          // points - projected
  // Annotations for the renderer:
  // - started: this player IS a starter for someone in this league
  // - benched: this player is on a bench in this league (BENCH tab)
  // - fa:      this player isn't rostered in this league at all
  startedByOwner: string | null
  benchedByOwner: string | null
  freeAgent: boolean
}

export type TickerBoard = Record<TickerScope, TickerEntry[]>

// ── Inactives radar ──────────────────────────────────────────────────────────

export type InactiveAlert = {
  name: string
  position: string | null
  team: string | null
  ownerName: string
  status: string             // "Out", "Questionable", ...
  isStarter: boolean
}

// ── League-wide ──────────────────────────────────────────────────────────────

export type PowerPulseRow = {
  rank: number              // current overall power rank
  teamName: string
  ownerName: string
  // Live result for THIS week's matchup. Null if no matchup found
  // (e.g. bye week, name match miss).
  liveResult: 'leading' | 'trailing' | 'tied' | null
  // Cumulative wins so far this season, if the rankings have a record.
  wins: number
  losses: number
}

export type SlLeague = {
  league: {
    id: string
    slug: string
    name: string
    platform: Platform
    week: number
    year: number
    liveQuality: LiveQuality
    // If we're between Sundays / off-week, surfaces this in chrome:
    phase: 'pre-kickoff' | 'live' | 'finished' | 'idle'
  }
  matchups: SlMatchup[]
  nflGames: SlNflGame[]
  wire: WireEvent[]
  moments: Moment[]
  ticker: TickerBoard
  inactives: InactiveAlert[]
  stacks: StackUnit[]        // top stacks across the entire league
  powerPulse: PowerPulseRow[] // top-5 by current power ranking + live result
  // Set by load.ts on first frame only; nullable so polls don't keep regenerating.
  // Phase 5 will populate this.
  halftimeReport: string | null
  // Debug + diagnostics. The Wire's "since kickoff" stripe pulls from here.
  meta: {
    fetchedAt: string        // ISO; the moment this frame was built
    pollMs: number           // recommended poll interval
    demo: { year: number; week: number; progress: number } | null
  }
}

// ── Snapshots (Supabase frame storage) ───────────────────────────────────────

// One row per (league, year, week, taken_at). Payload is the full SlLeague at
// that moment. Used for: WP sparkline reconstruction, Big Moment diffing, and
// the Sunday Live Archive (frozen permalink renders).
export type SlFrameRow = {
  id: string
  league_id: string
  year: number
  week: number
  taken_at: string
  payload: SlLeague
}

// ── Load result envelope ─────────────────────────────────────────────────────

export type LoadResult =
  | { ok: true; league: SlLeague }
  | { ok: false; reason: string }

export type LoadOptions = {
  // Override the live week/progress for offseason demo. Null = real-time.
  demo?: { year: number; week: number; progress: number } | null
  // If true, skip snapshot write (useful for SSR's first paint where the
  // client poll will write the next frame).
  noSnapshot?: boolean
}
