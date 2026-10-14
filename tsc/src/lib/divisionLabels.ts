// Short labels for division (conference) badges: "W" and "S" for Whole and
// Skim. Shared by the recap paper and the Progress Report so a league's
// badges read the same everywhere.
//
// Words every name shares ("Division", "KFL") are dropped first, then the
// first letter if that tells them apart, else the first letter of each
// word ("TFC East" -> "TE"), else the division's number.
export function divisionLabels(names: string[]): string[] {
  const split = names.map((n) => n.split(/[\s.\-]+/).filter(Boolean))
  const shared = new Set(split[0].filter((w) => split.every((ws) => ws.some((x) => x.toLowerCase() === w.toLowerCase()))).map((w) => w.toLowerCase()))
  const kept = split.map((ws) => {
    const k = ws.filter((w) => !shared.has(w.toLowerCase()) && !/^the$/i.test(w))
    return k.length ? k : ws
  })
  const distinct = (xs: string[]) => new Set(xs).size === xs.length && xs.every(Boolean)
  const first = kept.map((ws) => ws[0].charAt(0).toUpperCase())
  if (distinct(first)) return first
  const initials = kept.map((ws) => ws.map((w) => w.charAt(0).toUpperCase()).join('').slice(0, 3))
  if (distinct(initials)) return initials
  return names.map((_, i) => String(i + 1))
}
