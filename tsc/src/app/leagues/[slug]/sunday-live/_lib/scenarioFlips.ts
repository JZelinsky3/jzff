// Scenario Machine permalinks. Flips ride the address bar as ?flips=3A,7B
// (matchupId + scenario winner), so a member can text the league their
// doomsday scenario and it loads pre-flipped. Shared by the server page
// (initial parse) and the machine (rewrites on every tap); no 'use client'
// here so both sides can import it.

export type ScenarioFlips = Record<number, 'A' | 'B'>

export function parseFlips(raw: string | null | undefined): ScenarioFlips {
  const out: ScenarioFlips = {}
  if (!raw) return out
  for (const tok of raw.split(',')) {
    const m = /^(\d{1,4})(A|B)$/.exec(tok.trim())
    if (m) out[Number(m[1])] = m[2] as 'A' | 'B'
  }
  return out
}

export function serializeFlips(flips: ScenarioFlips): string {
  return Object.entries(flips)
    .map(([id, w]) => `${id}${w}`)
    .join(',')
}
