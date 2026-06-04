// Pick a thematic "fight scene" for a rivalry based on its stats.
//
// The system answers two questions:
//   1) What KIND of rivalry is this? (lopsided / balanced / explosive / etc)
//   2) Within that category, which character pair do we render?
//
// (1) is a stat → theme mapping so the art carries product meaning — a
// blowout rivalry doesn't get the same imagery as a deadlocked one.
//
// (2) picks a character pair deterministically from the rivalry id, so the
// SAME rivalry always shows the SAME fight (users associate the imagery as
// "theirs"), while DIFFERENT rivalries naturally vary across the league.
//
// v2 uses Twemoji character pairs as placeholders. The theme + variant
// system is set up so we can swap in commissioned/AI-generated character
// art later without changing call sites — just edit THEMES.

export type RivalrySide = {
  name: string
  wins: number
  avg_ppg: number
  playoff_record: string
}

export type RivalrySummary = {
  id: string
  total_meetings: number
  first_meeting_year: number | null
  is_deadlocked: boolean
  manager_a: RivalrySide
  manager_b: RivalrySide
}

export type ThemeKey =
  | 'kaiju'
  | 'david_goliath'
  | 'mirror'
  | 'gladiators'
  | 'ancient_feud'
  | 'wild_west'
  | 'duelists'

export type Theme = {
  key: ThemeKey
  label: string
  accent: string
  pairs: ReadonlyArray<readonly [string, string]>
}

export const THEMES: Record<ThemeKey, Theme> = {
  kaiju: {
    key: 'kaiju',
    label: 'KAIJU CLASH',
    accent: '#ef4444',
    pairs: [['🐉', '🦍'], ['🦖', '🤖'], ['🐙', '🦅'], ['🐲', '🦏']],
  },
  david_goliath: {
    key: 'david_goliath',
    label: 'DAVID & GOLIATH',
    accent: '#e8c889',
    pairs: [['🗿', '🛡️'], ['🐻', '🏹'], ['🐘', '🐭'], ['🦣', '⚔️']],
  },
  mirror: {
    key: 'mirror',
    label: 'MIRROR MATCH',
    accent: '#9ca3af',
    pairs: [['🥷', '🥷'], ['🤺', '🤺'], ['🥊', '🥊'], ['♟️', '♟️']],
  },
  gladiators: {
    key: 'gladiators',
    label: 'GLADIATORS',
    accent: '#dc2626',
    pairs: [['⚔️', '🛡️'], ['🦁', '🐂'], ['🏹', '🗡️']],
  },
  ancient_feud: {
    key: 'ancient_feud',
    label: 'ANCIENT FEUD',
    accent: '#e8c889',
    pairs: [['🧙', '🐲'], ['👑', '⚔️'], ['🏰', '🗡️'], ['🦅', '🐍']],
  },
  wild_west: {
    key: 'wild_west',
    label: 'WILD WEST',
    accent: '#d97706',
    pairs: [['🤠', '🐎'], ['🌵', '💀'], ['🐺', '🦬']],
  },
  duelists: {
    key: 'duelists',
    label: 'DUELISTS',
    accent: '#dc2626',
    pairs: [['🥊', '🎯'], ['🃏', '🎲'], ['🏈', '⚡'], ['🎭', '⚔️']],
  },
}

// Cheap deterministic hash so id → variant pick is stable across renders.
// Same rivalry id always lands on the same character pair, even if THEMES
// reorders. (Reordering inside a theme will shift; deletion + add at end is safe.)
function hashStringToInt(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Convert a playoff_record string ("2-1-0") to total games.
function playoffGames(rec: string | null | undefined): number {
  if (!rec) return 0
  const parts = rec.split('-').map((n) => Number(n))
  return parts.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0)
}

export type ThemeContext = {
  // Earliest first-meeting year across all the league's rivalries.
  // Lets us decide whether THIS rivalry is the league's "oldest feud" —
  // a relative title that only makes sense with the cohort.
  oldestFirstMeetingYear: number | null
  // Median combined PPG across all the league's rivalries. Anything well
  // above this gets the kaiju treatment.
  medianCombinedPpg: number
}

export function buildThemeContext(all: RivalrySummary[]): ThemeContext {
  const firstYears = all
    .map((r) => r.first_meeting_year)
    .filter((y): y is number => typeof y === 'number')
  const oldestFirstMeetingYear = firstYears.length > 0 ? Math.min(...firstYears) : null

  const combined = all
    .filter((r) => r.total_meetings > 0)
    .map((r) => r.manager_a.avg_ppg + r.manager_b.avg_ppg)
    .sort((a, b) => a - b)
  const medianCombinedPpg = combined.length > 0
    ? combined[Math.floor(combined.length / 2)]
    : 220

  return { oldestFirstMeetingYear, medianCombinedPpg }
}

export function pickRivalryTheme(rv: RivalrySummary, ctx: ThemeContext): { theme: Theme; pair: readonly [string, string] } {
  const theme = THEMES[pickThemeKey(rv, ctx)]
  const idx = hashStringToInt(rv.id) % theme.pairs.length
  return { theme, pair: theme.pairs[idx] }
}

function pickThemeKey(rv: RivalrySummary, ctx: ThemeContext): ThemeKey {
  // No data → just call it a duel.
  if (rv.total_meetings === 0) return 'duelists'

  const gap = Math.abs(rv.manager_a.wins - rv.manager_b.wins)
  const combinedPpg = rv.manager_a.avg_ppg + rv.manager_b.avg_ppg
  const totalPlayoffGames = playoffGames(rv.manager_a.playoff_record) + playoffGames(rv.manager_b.playoff_record)

  // Priority order matters: more specific / dramatic themes win over the
  // generic ones. A 4-win blowout that's also high-scoring should read
  // as David & Goliath, not Kaiju.

  // Mirror match: same wins, played enough to be meaningful.
  if (rv.is_deadlocked && rv.total_meetings >= 4) return 'mirror'

  // Lopsided: 3+ win gap.
  if (gap >= 3) return 'david_goliath'

  // Gladiator-tier: meaningful playoff history (any side has 2+ postseason meetings).
  if (totalPlayoffGames >= 2) return 'gladiators'

  // League's oldest feud (must be older than median by at least 2 years to qualify).
  if (
    ctx.oldestFirstMeetingYear !== null &&
    rv.first_meeting_year !== null &&
    rv.first_meeting_year === ctx.oldestFirstMeetingYear &&
    rv.total_meetings >= 6
  ) {
    return 'ancient_feud'
  }

  // High-scoring slugfest: combined PPG clearly above the league median.
  if (combinedPpg >= ctx.medianCombinedPpg + 15) return 'kaiju'

  // Newer, scrappier rivalry.
  if (rv.first_meeting_year !== null && rv.total_meetings <= 3) return 'wild_west'

  return 'duelists'
}
