// Live pull audit: every filed Builder pack since a pool version, against the real
// dealer's rates for the same seeds. Usage: npx tsx live-audit.ts seasons-2026-10m
import { readFileSync } from 'node:fs'
import { newCaptainSeed } from '../../../src/lib/packEmpire/deal'
import { soloPack } from '../../../src/lib/packEmpire/solo'
import { playerById } from '../../../src/lib/packEmpire/pool'
import { RARITIES, SEED_ALPHABET, SLOT_COUNT, type Rarity } from '../../../src/lib/packEmpire/rules'

const env = Object.fromEntries(
  readFileSync(`${__dirname}/../../../.env.local`, 'utf8')
    .split('\n')
    .flatMap((l) => (l.match(/^([A-Z_]+)=(.*)$/) ? [[RegExp.$1, RegExp.$2.replace(/^"|"$/g, '')]] : []))
)
const pool = process.argv[2] ?? 'seasons-2026-10m'

type Row = { deal: string; slot: number; cards: string[]; kept: string; user_id: string }
async function main() {
const rows: Row[] = []
for (let from = 0; ; from += 1000) {
  const r = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/pe_binder_packs?select=deal,slot,cards,kept,user_id&source=eq.solo&pool=eq.${pool}`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Range: `${from}-${from + 999}` } }
  )
  const page = (await r.json()) as Row[]
  rows.push(...page)
  if (page.length < 1000) break
}

const zero = () => Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>
const seen = { ord: zero(), cap: zero() }
const kept = zero()
const packs = { ord: 0, cap: 0 }
const packsWith = { ord: zero(), cap: zero() }
let missing = 0
for (const r of rows) {
  // The captain's slot is the seed's ninth character (Builder seeds never carry the Versus shift).
  const kind = SEED_ALPHABET.indexOf(r.deal.replace(/^solo:/, '')[8]) === r.slot ? 'cap' : 'ord'
  packs[kind]++
  const got = new Set<Rarity>()
  for (const id of r.cards) {
    const p = playerById(id)
    if (!p) { missing++; continue }
    seen[kind][p.rarity]++
    got.add(p.rarity)
  }
  for (const g of got) packsWith[kind][g]++
  const k = playerById(r.kept)
  if (k) kept[k.rarity]++
}

// Expected: the same dealer, fresh seeds, greedy keeps (taken only stops repeats).
const N = 20000
const ex = { ord: zero(), cap: zero() }
const exWith = { ord: zero(), cap: zero() }
const exPacks = { ord: 0, cap: 0 }
for (let i = 0; i < N; i++) {
  const captain = i % SLOT_COUNT
  const seed = newCaptainSeed(captain)
  const taken: string[] = []
  for (let s = 0; s < SLOT_COUNT; s++) {
    const pack = soloPack(seed, captain, s, taken)
    const kind = s === captain ? 'cap' : 'ord'
    exPacks[kind]++
    const got = new Set<Rarity>()
    for (const c of pack) { ex[kind][c.rarity]++; got.add(c.rarity) }
    for (const g of got) exWith[kind][g]++
    taken.push(pack.reduce((a, b) => (b.score > a.score ? b : a)).id)
  }
}

const users = new Set(rows.map((r) => r.user_id)).size
const runs = new Set(rows.map((r) => r.deal)).size
console.log(`${pool}: ${rows.length} packs, ${runs} runs, ${users} players, ${missing} unknown ids`)
for (const kind of ['ord', 'cap'] as const) {
  const cards = packs[kind] * 5
  console.log(`\n${kind === 'ord' ? 'Ordinary' : 'Captain'} packs: ${packs[kind]} (${cards} cards)`)
  console.log('rarity        seen  expected   per-card seen/exp      packs holding one seen/exp')
  for (const r of RARITIES) {
    const pe = ex[kind][r] / (exPacks[kind] * 5)
    const we = exWith[kind][r] / exPacks[kind]
    const sd = Math.sqrt(cards * pe * (1 - pe))
    console.log(
      `${r.padEnd(12)} ${String(seen[kind][r]).padStart(5)}  ${(cards * pe).toFixed(1).padStart(8)} ±${sd.toFixed(1).padEnd(5)}  ${(100 * seen[kind][r] / cards).toFixed(2).padStart(6)}% / ${(100 * pe).toFixed(2).padStart(6)}%     ${(100 * packsWith[kind][r] / packs[kind]).toFixed(1).padStart(5)}% / ${(100 * we).toFixed(1)}%`
    )
  }
}
console.log('\nKept:', RARITIES.map((r) => `${r} ${kept[r]}`).join('  '))
}
main()
