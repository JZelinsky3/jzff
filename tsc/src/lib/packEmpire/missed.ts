// A blind run in hindsight: how many packs you read right, and the best eleven
// that was there to take.
//
// The best eleven can't be read off the top card of each pack, because a blind
// run plays for chemistry, and because a man can turn up in two packs you
// passed him in and still only sign once. So it's a search over one card from
// each pack. 5^11 is 48 million lineups, but chemistry is sparse, so nearly all
// of them fall to the bound: the most a partial lineup could still reach.

import { chemistryPreview, personOf, type MissCard, type Missed, type Player } from './rules'

type Pack = { slot: number; cards: Player[]; kept: string }

/** Past this the search stops and keeps the best it has found. */
const MAX_STEPS = 2_000_000

const brief = ({ id, pid, name, pos, team, year, club, score, rarity, img }: Player): MissCard => ({
  id,
  pid,
  name,
  pos,
  team,
  year,
  club,
  score,
  rarity,
  img,
})

/** The highest score any one card from each pack can reach, and the card from
    each pack that gets there. Exact unless it runs out of steps; the run itself
    is a floor, so it can never come in under, and no `picks` means nothing beat it. */
export function bestEleven(packs: Player[][], floor = 0): { total: number; picks: string[] | null } {
  // The packs with the most riding on them first, which is where the bound bites.
  const order = packs
    .map((cards) => [...cards].sort((a, b) => b.score - a.score))
    .sort((a, b) => b[0].score - a[0].score)
  const cards = order.flat()
  const at = new Map<Player, number>(cards.map((c, i) => [c, i]))
  const bond = cards.map((a) => cards.map((b) => (a === b ? 0 : chemistryPreview(a, [b], true))))

  // The most chemistry a card could still pick up from each pack, halved
  // because both ends of a bond get counted.
  const ahead = cards.map((c) =>
    order.map((pack) => Math.max(0, ...pack.map((d) => bond[at.get(c) as number][at.get(d) as number])) / 2)
  )
  const reach = order.map((_, from) =>
    order.map((pack) =>
      pack.map((c) => {
        const mine = order.indexOf(pack)
        return c.score + ahead[at.get(c) as number].reduce((sum, v, p) => (p >= from && p !== mine ? sum + v : sum), 0)
      })
    )
  )

  let best = floor
  let picks: string[] | null = null
  let steps = 0
  const chosen: number[] = []
  const men = new Set<string>()

  const walk = (depth: number, total: number) => {
    if (depth === order.length) {
      if (total > best) {
        best = total
        const ids = chosen.map((i) => cards[i].id)
        picks = packs.map((pack) => pack.find((c) => ids.includes(c.id))?.id ?? '')
      }
      return
    }
    let bound = total
    for (let p = depth; p < order.length; p++) {
      let top = -Infinity
      order[p].forEach((c, n) => {
        const i = at.get(c) as number
        let v = reach[depth][p][n]
        for (const x of chosen) v += bond[i][x]
        if (v > top) top = v
      })
      bound += top
    }
    if (bound <= best) return
    const options = order[depth]
      .map((c) => {
        const i = at.get(c) as number
        return { c, i, gain: c.score + chosen.reduce((sum, x) => sum + bond[i][x], 0) }
      })
      .sort((a, b) => b.gain - a.gain)
    for (const { c, i, gain } of options) {
      if (++steps > MAX_STEPS) return
      const man = personOf(c)
      if (men.has(man)) continue
      men.add(man)
      chosen.push(i)
      walk(depth + 1, total + gain)
      chosen.pop()
      men.delete(man)
    }
  }
  walk(0, 0)
  return { total: best, picks }
}

/** `score` is the run itself: cards plus chemistry, before any Battles. */
export function missReport(packs: Pack[], score: number): Missed {
  const { total, picks } = bestEleven(packs.map((p) => p.cards), score)
  const rows = packs.map(({ slot, cards, kept }, i) => ({
    slot,
    kept,
    perfect: picks?.[i] || kept,
    cards: [...cards].sort((a, b) => b.score - a.score).map(brief),
  }))
  const hit = rows.filter((r) => (r.cards.find((c) => c.id === r.kept)?.score ?? 0) >= r.cards[0].score).length
  return { packs: packs.length, hit, score, perfect: total, rows }
}
