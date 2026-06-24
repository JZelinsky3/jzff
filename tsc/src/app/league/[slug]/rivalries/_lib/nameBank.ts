// Curated bank of fantasy-football rivalry titles. Shared by the public
// /rivalries/new form and the setup wizard's rivalry step so both pick from
// the same pool and produce the same deterministic suggestions.

export const RIVALRY_NAME_BANK: readonly string[] = [
  // Original conflict/feud lexicon
  'The Border War',
  'Civil War',
  'Battle Royale',
  'The Grudge Match',
  'The Reckoning',
  'The Vendetta',
  'Blood Feud',
  'The Iron Bowl',
  'The Bloodbath',
  'Holy War',
  'Cold War',
  'Bad Blood',
  'The Inferno',
  'Last Stand',
  'Heavyweight Bout',
  'The Cage Match',
  'The Cauldron',
  'The Crucible',
  'The Gauntlet',
  'The Hatchet',
  'War Games',
  'The Standoff',
  'Endgame',
  'The Brawl',
  'The Spectacle',
  'The Powder Keg',
  'The Tinderbox',
  'The Eruption',
  'The Crusade',
  'The Showdown',

  // Combat-sport venue names — every fantasy rivalry should feel a little
  // like a fight night.
  'Mortal Kombat',
  'Thunderdome',
  'The Octagon',
  'Steel Cage',
  'Hell in a Cell',
  'The Pit',
  'The Squared Circle',
  'The Slugfest',
  'The Donnybrook',
  'The Throwdown',
  'The Rumble',

  // Apocalypse / mythic — bigger stakes for the bigger games.
  'Clash of the Titans',
  'Ragnarok',
  'Armageddon',
  'The Apocalypse',
  'Doomsday',
  'Scorched Earth',
  'The Onslaught',
  'The Maelstrom',
  'The Last Dance',
  'Total War',
  'Trial by Combat',

  // Trench-warfare framings — slow burn, attritional rivalries.
  'The Trenches',
  'The Frontline',
  'The Siege',
  'The Long War',

  // Bowl-game tradition — leans into the league-pageantry feel.
  'The Backyard Brawl',
  'The Egg Bowl',
  'The Iron Skillet',
  'The Toilet Bowl',
  'The Hate Bowl',
  'The Spite Bowl',
  'The Pride Bowl',

  // Templated picks — the pair's names star in the title. Mixed in sparingly
  // so the bank still reads as varied even when a league has 10+ auto-named
  // rivalries.
  '{A} vs {B}: The Reckoning',
  '{A} vs {B}: Endgame',
  'The Battle of {A} and {B}',
  '{A}-{B} War',
  'The {A}-{B} Throwdown',
  'The {A}-{B} Stakes',
  '{A} & {B}: Mortal Enemies',
] as const

function lastWord(s: string): string {
  const parts = s.trim().split(/\s+/)
  return parts[parts.length - 1] || s
}

// Deterministic 32-bit hash. Same string in → same number out, across runs
// and machines. Seed name selection with the sorted manager-pair id so
// (A, B) and (B, A) propose the same name.
function hash32(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return h
}

// Returns a rivalry name from the bank, deterministic per manager pair,
// skipping any names already taken in this league. Falls back to "X vs Y
// Bowl" if every name is taken (~30+ rivalries in one league).
export function pickRivalryName(
  managerA: string,
  managerB: string,
  aName: string,
  bName: string,
  taken: Set<string>,
): string {
  const seedKey = [managerA, managerB].sort().join('|')
  const start = Math.abs(hash32(seedKey)) % RIVALRY_NAME_BANK.length
  for (let i = 0; i < RIVALRY_NAME_BANK.length; i++) {
    const tpl = RIVALRY_NAME_BANK[(start + i) % RIVALRY_NAME_BANK.length]!
    const candidate = tpl
      .replaceAll('{A}', lastWord(aName))
      .replaceAll('{B}', lastWord(bName))
    if (!taken.has(candidate.trim().toLowerCase())) return candidate
  }
  return `${lastWord(aName)} vs ${lastWord(bName)} Bowl`
}
