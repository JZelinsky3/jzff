// Field General on the real pool: how far apart the CPU levels sit, what a signature is
// worth, and whether a rule change moved the game.
//   PACK_EMPIRE_SECRET=sim npx -y tsx --tsconfig tsconfig.json scripts/pack-empire-pool/sim/fg-sim.ts levels 600
//   PACK_EMPIRE_SECRET=sim npx -y tsx --tsconfig tsconfig.json scripts/pack-empire-pool/sim/fg-sim.ts sigs 600
//   PACK_EMPIRE_SECRET=sim npx -y tsx --tsconfig tsconfig.json scripts/pack-empire-pool/sim/fg-sim.ts game 600
//
// Bots can't measure fun, only how the numbers lean, so tune by play first.
import { CALLS } from '../../../src/lib/packEmpire/locker/calls'
import { dealCpuDeck, dealLockerPack } from '../../../src/lib/packEmpire/locker/deal'
import {
  CPU_LEVELS,
  applyDrive,
  cpuPlays,
  fgResult,
  isOver,
  newMatch,
  playProblem,
  rng,
  type CpuLevelId,
  type FgMatch,
  type Lookup,
  type Play,
} from '../../../src/lib/packEmpire/locker/fieldGeneral'
import { LOCKER_PACKS, autoDeck, lockerGame } from '../../../src/lib/packEmpire/locker/rules'
import { SIGNATURES } from '../../../src/lib/packEmpire/locker/signatures'
import { POOL, playerById } from '../../../src/lib/packEmpire/pool'
import { POOL_KEYS, type Player, type Rarity } from '../../../src/lib/packEmpire/rules'

const [mode = 'levels', count = '400'] = process.argv.slice(2)
const N = Number(count)
const byId: Lookup = (id) => playerById(id)
const RULE = lockerGame('field-general')!.deck
const ALL = POOL_KEYS.flatMap((k) => POOL[k])
const CALL_IDS = CALLS.filter((c) => !['keep', 'move'].includes(c.does.kind)).map((c) => c.id)

/** A real player's cards after this many packs: the starter, then fives. */
function collection(rnd: () => number, packs: number): Player[] {
  const owned = new Map<string, Player>()
  for (const c of dealLockerPack(LOCKER_PACKS.starter, rnd)) owned.set(c.id, c)
  for (let i = 0; i < packs; i++) for (const c of dealLockerPack(LOCKER_PACKS.daily, rnd, new Set(owned.keys()))) owned.set(c.id, c)
  return [...owned.values()]
}

const threeCalls = (rnd: () => number) => [...CALL_IDS].sort(() => rnd() - 0.5).slice(0, 3)

type Tally = { a: number; b: number; draw: number; drives: number; goalsA: number; goalsB: number; ot: number; flips: number }
const blank = (): Tally => ({ a: 0, b: 0, draw: 0, drives: 0, goalsA: 0, goalsB: 0, ot: 0, flips: 0 })

function play(deckA: string[], deckB: string[], levelA: CpuLevelId, levelB: CpuLevelId, seed: number, t: Tally) {
  // Half the games each way round, since a seat's plays are drawn first.
  const swap = seed % 2 === 1
  const decks: [string[], string[]] = swap ? [deckB, deckA] : [deckA, deckB]
  const levels: [CpuLevelId, CpuLevelId] = swap ? [levelB, levelA] : [levelA, levelB]
  let m: FgMatch = newMatch(decks, seed, byId)
  while (!isOver(m)) {
    const plays = [0, 1].map((at) => {
      const p = cpuPlays(m, at as 0 | 1, byId, null, rng(seed + m.drive * 101 + at), CPU_LEVELS[levels[at]])
      const wrong = playProblem(m, at as 0 | 1, p, byId, null)
      if (wrong) throw new Error(`${levels[at]} drive ${m.drive}: ${wrong} ${JSON.stringify(p)}`)
      return p
    }) as [Play[], Play[]]
    m = applyDrive(m, plays, byId, null)
  }
  const r = fgResult(m, byId, null)
  const winner = r.winner === null ? null : swap ? 1 - r.winner : r.winner
  if (winner === 0) t.a++
  else if (winner === 1) t.b++
  else t.draw++
  t.drives++
  t.goalsA += m.goalsMet[swap ? 1 : 0].length
  t.goalsB += m.goalsMet[swap ? 0 : 1].length
  if (m.overtime) t.ot++
  t.flips += r.lanes.filter((l, i) => Math.sign(l.totals[0] - l.totals[1]) !== Math.sign(r.before[i][0] - r.before[i][1])).length
}

const pct = (n: number, of: number) => `${((n / of) * 100).toFixed(1)}%`

function levels() {
  const rnd = rng(11)
  // Your deck against the CPU's, the way the server deals it: what changes with level
  // is the CPU's brain and deck. The other seat stands in for you, playing at `you`.
  for (const stage of [0, 8, 30]) {
    const row: string[] = []
    for (const [you, cpu] of [['pro', 'rookie'], ['rookie', 'pro'], ['pro', 'pro'], ['all-pro', 'pro'], ['pro', 'all-pro'], ['all-pro', 'all-pro'], ['all-pro', 'rookie'], ['rookie', 'all-pro']] as [CpuLevelId, CpuLevelId][]) {
      const t = blank()
      for (let i = 0; i < N; i++) {
        const deck = autoDeck(collection(rnd, stage), RULE)
        const cpuDeck = dealCpuDeck(rnd, null, deck, cpu)
        play([...deck.map((c) => c.id), ...threeCalls(rnd)], [...cpuDeck.map((c) => c.id), ...threeCalls(rnd)], you, cpu, i * 7 + 1, t)
      }
      row.push(`${you} vs ${cpu} ${pct(t.a, N)}`)
    }
    console.log(`after ${stage} packs:`, row.join(' | '))
  }
}

function game() {
  const rnd = rng(13)
  for (const lv of ['rookie', 'pro', 'all-pro'] as CpuLevelId[]) {
    const t = blank()
    for (let i = 0; i < N; i++) {
      const a = autoDeck(collection(rnd, 12), RULE)
      const b = autoDeck(collection(rnd, 12), RULE)
      play([...a.map((c) => c.id), ...threeCalls(rnd)], [...b.map((c) => c.id), ...threeCalls(rnd)], lv, lv, i * 3 + 2, t)
    }
    console.log(`${lv} mirror: seat a ${pct(t.a, N)}, goals a game ${((t.goalsA + t.goalsB) / (2 * N)).toFixed(2)} each, OT ${pct(t.ot, N)}, draws ${pct(t.draw, N)}, tally flips ${(t.flips / N).toFixed(2)} a game`)
  }
}

/** A deck of the middle of the game, with room for one star. */
function midDeck(rnd: () => number, star: Player | null): Player[] {
  const pick = (r: Rarity, n: number, out: Player[]) => {
    const list = ALL.filter((c) => c.rarity === r && !out.some((x) => (x.pid ?? x.id) === (c.pid ?? c.id)) && (!star || (star.pid ?? star.id) !== (c.pid ?? c.id)))
    return [...list].sort(() => rnd() - 0.5).slice(0, n)
  }
  const out: Player[] = star ? [star] : []
  for (const [r, n] of [['dynasty', 3], ['rare', 3], ['common', 5]] as [Rarity, number][]) out.push(...pick(r, n, out))
  while (out.length < 12) out.push(...pick('common', 1, out))
  return out.slice(0, 12)
}

/** What a signature is worth: the same star, with the signature on and off, against a
    deck with a generic card of its cost in the slot. */
function sigs() {
  const rnd = rng(17)
  const groups: [Rarity, string, string][] = []
  for (const [r, table] of Object.entries(SIGNATURES) as [Rarity, Record<string, { title: string }>][]) {
    for (const g of Object.keys(table)) groups.push([r, g, table[g].title])
  }
  for (const [rarity, group, title] of groups) {
    const stars = ALL.filter((c) => c.rarity === rarity && (group === 'OL' ? ['OT', 'OG', 'C'].includes(c.pos) : c.pos === group))
    if (!stars.length) continue
    const run = () => {
      const t = blank()
      for (let i = 0; i < N; i++) {
        const star = stars[Math.floor(rnd() * stars.length)]
        const a = midDeck(rnd, star)
        const b = midDeck(rnd, null)
        play([...a.map((c) => c.id), ...threeCalls(rnd)], [...b.map((c) => c.id), ...threeCalls(rnd)], 'all-pro', 'all-pro', i * 5 + 3, t)
      }
      return t.a / N
    }
    const on = run()
    const table = SIGNATURES[rarity] as Record<string, unknown>
    const saved = table[group]
    delete table[group]
    const off = run()
    table[group] = saved
    console.log(`${rarity.padEnd(13)}${group.padEnd(3)} ${title.padEnd(16)} on ${pct(on, 1).padStart(6)}  off ${pct(off, 1).padStart(6)}  worth ${((on - off) * 100).toFixed(1).padStart(5)}`)
  }
}

const started = Date.now()
if (mode === 'levels') levels()
else if (mode === 'sigs') sigs()
else game()
console.log(`${((Date.now() - started) / 1000).toFixed(0)}s`)
