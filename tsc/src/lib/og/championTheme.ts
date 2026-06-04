// Pick a thematic "crown" for a season champion based on how they won it.
//
// Same shape as `pickRivalryTheme`: stats → theme → variant emoji.
// Variants stay deterministic on (year + champion id) so the same champion
// always shows the same crown — re-renders never shuffle the imagery.

export type ChampionInput = {
  year: number
  championOwnerId: string | null
  championRegSeasonRank: number | null
  championWins: number
  championLosses: number
  totalTeams: number
  isJuggernaut: boolean       // won regular season AND playoffs
  isBackToBack: boolean       // same champion as immediately prior year
  isThreepeatPlus: boolean    // ≥3 consecutive
  isFirstTimeChamp: boolean   // never won before this league
}

export type ChampionThemeKey =
  | 'threepeat'
  | 'dynasty'
  | 'coronation'
  | 'juggernaut'
  | 'underdog'
  | 'champion'

export type ChampionTheme = {
  key: ChampionThemeKey
  label: string
  accent: string
  // single emoji rather than a pair — champions are one team
  glyphs: ReadonlyArray<string>
}

export const CHAMPION_THEMES: Record<ChampionThemeKey, ChampionTheme> = {
  threepeat: {
    key: 'threepeat',
    label: 'THREEPEAT',
    accent: '#a78bfa',
    glyphs: ['👑', '🔱', '⚜️'],
  },
  dynasty: {
    key: 'dynasty',
    label: 'DYNASTY',
    accent: '#c084fc',
    glyphs: ['👑', '🏛️', '⚜️'],
  },
  coronation: {
    key: 'coronation',
    label: 'CORONATION',
    accent: '#e8c889',
    glyphs: ['👑', '🎉', '✨'],
  },
  juggernaut: {
    key: 'juggernaut',
    label: 'JUGGERNAUT',
    accent: '#fbbf24',
    glyphs: ['⚡', '🔥', '🦾'],
  },
  underdog: {
    key: 'underdog',
    label: 'UNDERDOG',
    accent: '#fb7185',
    glyphs: ['🐺', '🛡️', '🏹'],
  },
  champion: {
    key: 'champion',
    label: 'CHAMPION',
    accent: '#e8c889',
    glyphs: ['🏆', '🥇', '🎖️'],
  },
}

function hashStringToInt(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function pickChampionTheme(input: ChampionInput): { theme: ChampionTheme; glyph: string } {
  const theme = CHAMPION_THEMES[pickChampionThemeKey(input)]
  const seed = `${input.year}|${input.championOwnerId ?? 'unknown'}`
  const idx = hashStringToInt(seed) % theme.glyphs.length
  return { theme, glyph: theme.glyphs[idx] }
}

function pickChampionThemeKey(input: ChampionInput): ChampionThemeKey {
  // Priority: rare/dramatic wins first, defaults last.
  if (input.isThreepeatPlus) return 'threepeat'
  if (input.isBackToBack) return 'dynasty'
  if (input.isJuggernaut) return 'juggernaut'

  // Underdog: lower half of regular season standings still won the title.
  if (
    input.championRegSeasonRank !== null &&
    input.totalTeams > 0 &&
    input.championRegSeasonRank > Math.floor(input.totalTeams / 2)
  ) {
    return 'underdog'
  }

  if (input.isFirstTimeChamp) return 'coronation'
  return 'champion'
}
