// Name aliases for value-source → Sleeper matching.
//
// Some value sources publish a player under a nickname or shortened first
// name (Hollywood Brown, Bam Knight, Chig Okonkwo) while Sleeper's player
// dictionary uses the canonical form (Marquise Brown, Zonovan Knight,
// Chigoziem Okonkwo). The name-match in each source file would otherwise
// fail and the player would silently drop out of that source's contribution
// to the consensus blend.
//
// Each entry says: "if this source emits {alias}, treat it as Sleeper's
// {canonical}." Position is part of the key (some players share names) and
// must match the position both sides use.
//
// To add a new alias, drop a line in NAME_ALIASES. The matcher in each
// source picks it up automatically on the next request.

export const NAME_ALIASES: ReadonlyArray<{
  alias: string
  canonical: string
  position: string
}> = [
  { alias: 'Bam Knight',      canonical: 'Zonovan Knight',    position: 'RB' },
  { alias: 'Hollywood Brown', canonical: 'Marquise Brown',    position: 'WR' },
  // Sleeper actually has him as "Chig Okonkwo" — KTC emits the full
  // "Chigoziem Okonkwo", so we register the long form as the alias.
  { alias: 'Chigoziem Okonkwo', canonical: 'Chig Okonkwo',    position: 'TE' },
  { alias: 'Chip Trayanum',   canonical: 'DeaMonte Trayanum', position: 'RB' },
  { alias: 'Gabriel Davis',   canonical: 'Gabe Davis',        position: 'WR' },
  { alias: 'Matthew Hibner',  canonical: 'Matt Hibner',       position: 'TE' },
]

// Walks the alias list and, for each pair, registers a lookup entry for the
// alias name pointing at the same Sleeper ID as the canonical name. No-op if
// the canonical isn't in the lookup (Sleeper doesn't know the player yet).
//
// `keyFn` is the source's own name normalizer — passed in so each source can
// keep its existing nameKey impl without dragging this file into its
// internals.
export function applyNameAliases(
  lookup: Map<string, string>,
  keyFn: (name: string, position: string) => string,
): void {
  for (const { alias, canonical, position } of NAME_ALIASES) {
    const canonicalKey = keyFn(canonical, position)
    const sid = lookup.get(canonicalKey)
    if (!sid) continue
    const aliasKey = keyFn(alias, position)
    if (!lookup.has(aliasKey)) lookup.set(aliasKey, sid)
  }
}
