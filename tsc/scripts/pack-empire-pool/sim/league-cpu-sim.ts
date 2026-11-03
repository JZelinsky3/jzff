// League Mode on the real dealer: whole regular seasons of CPU teams, under the
// rules as rebuilt on 2026-11-02 and under the old ones, to see whether a slow
// start can still come back. Every team plays as the CPU does.
//   Old: rich ordinary packs, a boosted pack for the top half only, locks for
//        the season, no mulligan, no twist.
//   New: Versus odds, a Standings Pack for everyone by last week's finish,
//        locks for LOCK_WEEKS, a mulligan for the bottom half of the table,
//        a weekly twist.
//   PACK_EMPIRE_SECRET=sim npx -y tsx --tsconfig tsconfig.json scripts/pack-empire-pool/sim/league-cpu-sim.ts 200 [teams]
import { dealPack } from '../../../src/lib/packEmpire/deal'
import { cpuBoostSlot, cpuDraft, cpuLock, expectedTop } from '../../../src/lib/packEmpire/leagueCpu'
import { ruleForWeek, weekScore } from '../../../src/lib/packEmpire/leagueWeek'
import {
  LEAGUE_ORDINARY,
  LOCK_WEEKS,
  PACK_TIERS,
  PACK_TIER_LABEL,
  REGULAR_WEEKS,
  SLOT_COUNT,
  STANDINGS_WEIGHTS,
  chemistryFor,
  lineupScore,
  mulliganForRank,
  packTierForRank,
  type PackTier,
  type Player,
  type Weights,
} from '../../../src/lib/packEmpire/rules'

const SEASONS = Number(process.argv[2] ?? 200)
const TEAMS = Number(process.argv[3] ?? 8)
/** MULL=week gives the mulligan to the bottom half of last week instead of the
    season table, which is how it was first tried: 31% came back, not 36%. */
const MULL_BY_TABLE = process.env.MULL !== 'week'
/** FLAT=1 adds a baseline with no packs, locks or mulligans: luck alone. */
const FLAT = process.env.FLAT === '1'

/** The tables League dealt off before the rebuild. */
const OLD: Record<PackTier, Weights> = {
  standard_pack: { common: 44.6, rare: 15.5, dynasty: 12.2, transcendent: 6.4, immortal: 0.7 },
  rising_pack: { common: 28.9, rare: 20.3, dynasty: 16.3, transcendent: 9.6, immortal: 1.4 },
  prime_pack: { common: 15.7, rare: 23.6, dynasty: 18.8, transcendent: 12.7, immortal: 2.8 },
  elite_drop: { common: 11.4, rare: 16.8, dynasty: 22, transcendent: 17.5, immortal: 5.6 },
}

const t0 = Date.now()
console.log('Average best card, by table (QB RB WR TE OT OG C):')
for (const t of ['ordinary', ...PACK_TIERS] as const) {
  const by = [0, 1, 2, 5, 6, 7, 8].map((s) => expectedTop(t, s).toFixed(0).padStart(5))
  console.log(`  ${(t === 'ordinary' ? 'Ordinary' : PACK_TIER_LABEL[t]).padEnd(13)} ${by.join(' ')}`)
}
console.log(`  (read in ${Date.now() - t0}ms)\n`)

type Lock = { slot: number; player: Player; until: number }
type Team = { locks: Lock[]; tier: PackTier; mulligan: boolean; total: number; weeks: number[] }

function play(isNew: boolean, s: number, flat = false) {
  const teams: Team[] = Array.from({ length: TEAMS }, () => ({ locks: [], tier: 'standard_pack', mulligan: false, total: 0, weeks: [] }))
  const ranks: number[][] = []
  for (let w = 1; w <= REGULAR_WEEKS; w++) {
    const ruleId = isNew ? ruleForWeek(`SIM${s}`, 1, 'regular', w).id : null
    const scores = teams.map((t, ti) => {
      const live = t.locks.filter((l) => l.until >= w)
      const lineup: (Player | null)[] = Array(SLOT_COUNT).fill(null)
      if (flat) live.length = 0
      for (const l of live) lineup[l.slot] = l.player
      const open = lineup.flatMap((p, i) => (p ? [] : [i]))
      const boosted = !flat && (isNew || t.tier !== 'standard_pack')
      const packSlot = boosted ? cpuBoostSlot(t.tier, open, ruleId) : -1
      const label = `sim:${isNew ? 'n' : 'o'}:${s}:${ti}:${w}`
      const tableFor = (slot: number) =>
        isNew
          ? slot === packSlot
            ? { normal: STANDINGS_WEIGHTS[t.tier], boosted: STANDINGS_WEIGHTS[t.tier] }
            : LEAGUE_ORDINARY
          : { normal: OLD[slot === packSlot ? t.tier : 'standard_pack'], boosted: OLD[slot === packSlot ? t.tier : 'standard_pack'] }
      const deal = (slot: number, now: (Player | null)[], extra: string[] = [], again = '') =>
        dealPack({
          label: label + again,
          slot,
          base: tableFor(slot).normal,
          boosted: tableFor(slot).boosted,
          exclude: [...now.filter((p): p is Player => !!p).map((p) => p.id), ...extra],
        })
      const week = cpuDraft({
        lineup,
        packSlot,
        tier: t.tier,
        ruleId,
        mulligan: isNew && !flat && t.mulligan,
        deal: (slot, now) => deal(slot, now),
        redeal: (slot, now, thrown) => deal(slot, now, thrown.map((p) => p.id), ':again'),
      })
      for (const pk of week.picks) lineup[pk.slot] = week.packs[pk.slot].find((p) => p.id === pk.id) ?? null
      const roster = lineup as Player[]
      const score = isNew ? weekScore(roster, packSlot, ruleId).total : lineupScore(roster) + chemistryFor(roster).total
      if (w < REGULAR_WEEKS) {
        const holding = isNew ? t.locks.filter((l) => l.until > w) : t.locks
        const keep = cpuLock(roster, new Set(holding.map((l) => l.slot)))
        t.locks = keep ? [...holding, { ...keep, until: isNew ? w + LOCK_WEEKS : 99 }] : holding
      }
      return score
    })
    const order = scores.map((sc, i) => ({ sc, i })).sort((a, b) => b.sc - a.sc)
    order.forEach(({ i }, r) => {
      teams[i].tier = packTierForRank(r + 1, TEAMS)
      teams[i].mulligan = mulliganForRank(r + 1, TEAMS)
    })
    teams.forEach((t, i) => {
      t.total += scores[i]
      t.weeks.push(scores[i])
    })
    if (MULL_BY_TABLE) {
      ;[...teams].sort((a, b) => b.total - a.total).forEach((t, r) => (t.mulligan = mulliganForRank(r + 1, TEAMS)))
    }
    const byTotal = teams.map((t, i) => ({ t: t.total, i })).sort((a, b) => b.t - a.t)
    const rank = Array(TEAMS)
    byTotal.forEach(({ i }, r) => (rank[i] = r + 1))
    ranks.push(rank)
  }
  return { teams, ranks }
}

for (const [isNew, flat] of [...(FLAT ? [[false, true]] : []), [false, false], [true, false]] as [boolean, boolean][]) {
  const t = Date.now()
  let wk1 = 0
  let wk8 = 0
  let comeback = 0
  let comebackOf = 0
  let leaderHeld = 0
  let gap = 0
  for (let s = 0; s < SEASONS; s++) {
    const { teams, ranks } = play(isNew, s, flat)
    wk1 += teams.reduce((a, x) => a + x.weeks[0], 0) / TEAMS
    wk8 += teams.reduce((a, x) => a + x.weeks[REGULAR_WEEKS - 1], 0) / TEAMS
    const final = ranks[REGULAR_WEEKS - 1]
    // Bottom half after two weeks, top half at the end.
    ranks[1].forEach((r, i) => {
      if (r > TEAMS / 2) {
        comebackOf++
        if (final[i] <= TEAMS / 2) comeback++
      }
    })
    if (final[ranks[1].indexOf(1)] === 1) leaderHeld++
    const totals = teams.map((x) => x.total).sort((a, b) => b - a)
    gap += (totals[0] - totals[TEAMS - 1]) / totals[TEAMS - 1]
  }
  console.log(`${flat ? 'LUCK ONLY' : isNew ? 'NEW' : 'OLD'} rules, ${SEASONS} seasons of ${TEAMS}:`)
  console.log(`  average week 1 ${(wk1 / SEASONS).toFixed(0)}, week 8 ${(wk8 / SEASONS).toFixed(0)}`)
  console.log(`  bottom half after week 2 who finish top half: ${((100 * comeback) / comebackOf).toFixed(0)}%`)
  console.log(`  leader after week 2 who finishes first: ${((100 * leaderHeld) / SEASONS).toFixed(0)}%`)
  console.log(`  first over last, season total: +${((100 * gap) / SEASONS).toFixed(0)}%`)
  console.log(`  ${((Date.now() - t) / SEASONS).toFixed(0)}ms a season\n`)
}
