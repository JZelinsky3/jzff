// Trade Desk Finder — candidate-trade generation engine.
//
// Shared by two rooms:
//   • The Finder (live/trades/finder/) — user picks their team plus
//     players to shop (or targets to acquire) and we sweep every other
//     roster for packages worth proposing.
//   • The Rumor Mill (live/trades/mocks/) — fully autonomous weekly
//     mock trades; same math, no user input, seeded by the week key so a
//     given week renders the same column for everyone.
//
// Everything is built on the Analyzer's existing primitives: consensus
// values from valuateLeague() and marginal STARTER-value impact from
// depth.ts. A candidate only surfaces when the asking team's starting
// lineup actually improves — raw asset value alone never qualifies a
// trade, mirroring the Analyzer's grading philosophy.
//
// Combinatorics are bounded in three stages so the sweep stays inside a
// single request budget:
//   1. pools are trimmed to the top-valued QB/RB/WR/TE on each roster
//   2. packages outside a raw-value fairness band are pruned before any
//      depth math runs (a 2-for-1 where the sides are 3x apart is never
//      getting accepted, no point simulating it)
//   3. survivors are sorted by value-closeness PLUS a need bonus —
//      packages that send into the partner's weak positions or pull from
//      the user's weak positions jump the queue, because those are where
//      mutual wins live — and only the best EVAL_BUDGET get the full
//      league-depth recompute.

import type { AnalyzerLeagueData, AnalyzerPlayer } from './analyzer'
import {
  computeLeagueDepth,
  snapshotAfterTrade,
  depthDelta,
  sumStarters,
  type LeagueDepthSnapshot,
  type PositionKey,
  type TeamDepthDelta,
} from './depth'
import type { PlayerValue } from '@/lib/values'

// ── Public types ─────────────────────────────────────────────────────────

export type FinderMode = 'shop' | 'target'

// Positions the finder trades in. K/DEF are excluded for the same reason
// the Analyzer hides them — no value source prices them.
export const FINDER_POSITIONS: PositionKey[] = ['QB', 'RB', 'WR', 'TE']

export type FairnessTier = 'win-win' | 'fair' | 'longshot'

export type CandidatePlayer = {
  id: string
  name: string
  position: string | null
  team: string | null
  value: number
  // Season-to-date position rank under PPR scoring (e.g. "RB12"). Stamped
  // by the mocks route after candidate generation; left null when the
  // ranker couldn't resolve the player (deep bench, K/DEF in many leagues).
  rank?: string | null
}

export type FinderCandidate = {
  partnerOwnerId: string
  partnerName: string
  // From the asking team's perspective.
  sends: CandidatePlayer[]
  receives: CandidatePlayer[]
  rawSendValue: number
  rawReceiveValue: number
  // Marginal starting-lineup impact, same metric the Analyzer grades on.
  userGain: number
  userGainPct: number
  partnerGain: number
  partnerGainPct: number
  fairness: FairnessTier
  // Top rank movements for each side (position, before, after).
  userMovements: TeamDepthDelta['rankMovements']
  partnerMovements: TeamDepthDelta['rankMovements']
  hash: string
}

// A variant is the same core deal plus extra pieces — "…and they throw
// in Shaheed." addedSends/addedReceives are the deltas vs the base, so
// the UI can render them as toggleable add-on pills with their own math.
export type FinderVariant = FinderCandidate & {
  addedSends: CandidatePlayer[]
  addedReceives: CandidatePlayer[]
}

// One board slot: a minimal core trade plus up to MAX_VARIANTS expanded
// versions of it. Groups candidates that share a partner and a core so
// "Monty+Odunze for Ladd+Caleb" and the same deal +Shaheed don't burn
// two slots.
export type FinderDeal = {
  partnerOwnerId: string
  partnerName: string
  base: FinderCandidate
  variants: FinderVariant[]
}

export type FindTradesArgs = {
  data: AnalyzerLeagueData
  values: Map<string, PlayerValue>
  userOwnerId: string
  mode: FinderMode
  // shop: ids on the user's roster they're willing to move.
  // target: ids on OTHER rosters they want to acquire.
  selected: string[]
  // Position filter, mode-dependent:
  //   shop   — "improve at": the headline piece received must play here
  //            and the user's depth here must actually get better.
  //   target — "trade away from": positions the user has surplus at; the
  //            headline piece of every offer is built from them.
  improvePositions?: PositionKey[]
  // Max players per side of a package (1–3). Default 2.
  maxPerSide?: number
  limit?: number
}

// ── Tuning knobs ─────────────────────────────────────────────────────────

// Raw-value fairness band: min(side)/max(side) must be at least this
// before a package earns a depth simulation.
const RAW_RATIO_FLOOR = 0.68
// Full league-depth recomputes allowed per request.
const EVAL_BUDGET = 1400
// Partner starter-value damage beyond this % means they'd never accept.
const PARTNER_FLOOR_PCT = -0.06
// Pool sizes (top-N by value) per roster.
const PARTNER_POOL = 12
const USER_POOL = 14
// Add-on variants carried per board slot. Variants only exist when the
// sweep independently kept the expanded package — base-only deals are
// normal and expected.
const MAX_VARIANTS = 3

// Rumor Mill publish bands: neither side may lose more than this share of
// its own starting-lineup value, and one side must gain at least this
// much. Both are PERCENTAGES of that team's starters, not raw points.
//
// They replace a raw -10 / +15. A full league's starters sum to roughly
// 34,000, so those constants worked out to -0.03% and +0.04% — in effect
// "neither side may lose a single point", a bar only a handful of
// perfectly complementary roster pairs in any league can clear. That, not
// the weekly seed, is why three trades kept printing the same four teams:
// the candidate pool genuinely had nobody else in it. The Finder, for
// comparison, calls a partner losing 2.5% a fair deal.
const MILL_LOSS_FLOOR_PCT = -0.0075
const MILL_WINNER_PCT = 0.005

// ── Small helpers ────────────────────────────────────────────────────────

function combos<T>(items: T[], maxSize: number): T[][] {
  const out: T[][] = []
  const rec = (start: number, cur: T[]) => {
    if (cur.length > 0) out.push([...cur])
    if (cur.length >= maxSize) return
    for (let i = start; i < items.length; i++) {
      cur.push(items[i])
      rec(i + 1, cur)
      cur.pop()
    }
  }
  rec(0, [])
  return out
}

export function tradeHash(sends: string[], receives: string[]): string {
  return [...sends].sort().join('+') + '>' + [...receives].sort().join('+')
}

// Classify how plausible a deal is for the partner. Lineup impact is the
// primary signal, but a raw-value overpay rescues a longshot: managers —
// dynasty ones especially — accept "my starter for a value surplus" deals
// all the time even when the package doesn't crack their lineup today.
//
// pileForStud — the partner is giving up ONE player for a multi-piece
// package. Raw value is exactly the misleading signal there (bench
// filler sums big but starts nobody), so the overpay rescue is OFF and
// the damage floor tightens: the pile must come close to replacing the
// stud's lineup impact or the deal doesn't print at all.
function fairnessTier(
  partnerGain: number,
  partnerGainPct: number,
  partnerRawIn: number,    // raw value the partner receives
  partnerRawOut: number,   // raw value the partner gives up
  pileForStud: boolean,
): FairnessTier | null {
  if (partnerGain >= 0) return 'win-win'
  if (pileForStud) {
    // Stricter bands than the general case — this branch must run BEFORE
    // the general fair band or "stud for headliner + bench filler" deals
    // sneak through it at -2%.
    if (partnerGainPct >= -0.015) return 'fair'
    return partnerGainPct >= -0.03 ? 'longshot' : null
  }
  if (partnerGainPct >= -0.025) return 'fair'
  if (partnerGainPct >= PARTNER_FLOOR_PCT) {
    // Overpay rescue only applies to modest lineup damage — it should
    // sweeten a near-miss, not whitewash a cratered lineup.
    return partnerRawIn >= partnerRawOut * 1.08 && partnerGainPct >= -0.04
      ? 'fair'
      : 'longshot'
  }
  return null
}

function shapeCandidatePlayer(
  pid: string,
  players: Record<string, AnalyzerPlayer>,
  values: Map<string, PlayerValue>,
): CandidatePlayer {
  const p = players[pid]
  return {
    id: pid,
    name: p?.name ?? `#${pid}`,
    position: p?.position ?? null,
    team: p?.team ?? null,
    value: values.get(pid)?.value ?? 0,
  }
}

// Top-N tradeable (valued, QB/RB/WR/TE) player ids on a roster, value desc.
function tradeablePool(
  playerIds: string[],
  players: Record<string, AnalyzerPlayer>,
  values: Map<string, PlayerValue>,
  topN: number,
  positions?: PositionKey[],
): Array<{ id: string; value: number; position: PositionKey }> {
  const wanted = positions ?? FINDER_POSITIONS
  const pool: Array<{ id: string; value: number; position: PositionKey }> = []
  for (const pid of playerIds) {
    const pos = (players[pid]?.position ?? '').toUpperCase() as PositionKey
    if (!wanted.includes(pos)) continue
    const v = values.get(pid)?.value ?? 0
    if (v <= 0) continue
    pool.push({ id: pid, value: v, position: pos })
  }
  pool.sort((a, b) => b.value - a.value)
  return pool.slice(0, topN)
}

function sumValues(ids: string[], values: Map<string, PlayerValue>): number {
  let t = 0
  for (const id of ids) t += values.get(id)?.value ?? 0
  return t
}

// Did this trade improve the user at one of the requested positions?
// Either the league rank got better or the starter value at the slot rose.
function improvesAt(delta: TeamDepthDelta, positions: PositionKey[]): boolean {
  for (const pos of positions) {
    const b = delta.before.byPosition[pos]
    const a = delta.after.byPosition[pos]
    if (a.leagueRank < b.leagueRank) return true
    if (a.starterValue > b.starterValue + 1) return true
  }
  return false
}

// ── Roster-spot cost ─────────────────────────────────────────────────────
//
// Rosters run at capacity, so a trade that nets a team extra bodies isn't
// free: someone gets cut to make room, and the cut is the team's worst
// remaining player. We charge that player's value against the team's gain.
//
// Capacity is each team's CURRENT count of QB/RB/WR/TE players — counting
// only tradeable positions sidesteps the K/DEF question entirely (a
// league with kickers and one without both net out the same), so no
// commish setting is needed. Net-negative-body trades charge nothing;
// the freed roster spot is waiver-add upside we leave unpriced.

function rosterSpotPenalty(
  preIds: string[],
  postIds: string[],
  players: Record<string, AnalyzerPlayer>,
  values: Map<string, PlayerValue>,
): number {
  const isTradeablePos = (pid: string) => {
    const pos = (players[pid]?.position ?? '').toUpperCase() as PositionKey
    return FINDER_POSITIONS.includes(pos)
  }
  const preCount = preIds.filter(isTradeablePos).length
  const postCount = postIds.filter(isTradeablePos).length
  const over = postCount - preCount
  if (over <= 0) return 0
  const postValues = postIds
    .filter(isTradeablePos)
    .map((pid) => values.get(pid)?.value ?? 0)
    .sort((a, b) => a - b)
  let penalty = 0
  for (let i = 0; i < over && i < postValues.length; i++) penalty += postValues[i]
  return penalty
}

// ── Core sweep ───────────────────────────────────────────────────────────

type RawCandidate = {
  partnerOwnerId: string
  sends: string[]
  receives: string[]
  sendValue: number
  receiveValue: number
  ratio: number
  // ratio + need bonus; decides who gets a depth simulation first.
  priority: number
}

type EvalContext = {
  data: AnalyzerLeagueData
  values: Map<string, PlayerValue>
  baseline: LeagueDepthSnapshot
  userOwnerId: string
}

function evaluate(ctx: EvalContext, c: RawCandidate): {
  userDelta: TeamDepthDelta
  partnerDelta: TeamDepthDelta
  userGain: number
  userGainPct: number
  partnerGain: number
  partnerGainPct: number
} {
  const after = snapshotAfterTrade(
    ctx.data.rosters, ctx.data.players, ctx.values, ctx.data.effective,
    ctx.userOwnerId, c.partnerOwnerId, c.sends, c.receives,
  )
  const userDelta = depthDelta(ctx.baseline, after, ctx.userOwnerId)
  const partnerDelta = depthDelta(ctx.baseline, after, c.partnerOwnerId)
  const userBefore = sumStarters(userDelta.before)
  const partnerBefore = sumStarters(partnerDelta.before)

  // Roster-spot cost: whichever side nets extra bodies pays for the cuts
  // they'd have to make. This is what prices junk throw-ins honestly —
  // a bench TE that starts nobody adds 0 starter value AND forces a cut.
  const userRoster = ctx.data.rosters.find((r) => r.ownerId === ctx.userOwnerId)!
  const partnerRoster = ctx.data.rosters.find((r) => r.ownerId === c.partnerOwnerId)!
  const sendSet = new Set(c.sends)
  const receiveSet = new Set(c.receives)
  const userPost = userRoster.playerIds.filter((id) => !sendSet.has(id)).concat(c.receives)
  const partnerPost = partnerRoster.playerIds.filter((id) => !receiveSet.has(id)).concat(c.sends)
  const userPenalty = rosterSpotPenalty(userRoster.playerIds, userPost, ctx.data.players, ctx.values)
  const partnerPenalty = rosterSpotPenalty(partnerRoster.playerIds, partnerPost, ctx.data.players, ctx.values)

  const userGain = sumStarters(userDelta.after) - userBefore - userPenalty
  const partnerGain = sumStarters(partnerDelta.after) - partnerBefore - partnerPenalty
  return {
    userDelta,
    partnerDelta,
    userGain,
    userGainPct: userBefore > 0 ? userGain / userBefore : 0,
    partnerGain,
    partnerGainPct: partnerBefore > 0 ? partnerGain / partnerBefore : 0,
  }
}

export function findTrades(args: FindTradesArgs): FinderDeal[] {
  const { data, values, userOwnerId, mode } = args
  const maxPerSide = Math.min(Math.max(args.maxPerSide ?? 2, 1), 3)
  const limit = Math.min(Math.max(args.limit ?? 10, 1), 25)
  const improvePositions = (args.improvePositions ?? []).filter(
    (p): p is PositionKey => FINDER_POSITIONS.includes(p),
  )

  const user = data.rosters.find((r) => r.ownerId === userOwnerId)
  if (!user) return []

  const baseline = computeLeagueDepth(data.rosters, data.players, values, data.effective)
  const ctx: EvalContext = { data, values, baseline, userOwnerId }

  // Bottom-half positions per team. Mutual wins come from surplus-for-need
  // swaps, so candidates that route players into a weak position get an
  // eval-priority bonus over pure value-mirror packages.
  const half = Math.ceil(data.rosters.length / 2)
  const weakCache = new Map<string, Set<PositionKey>>()
  const weakAt = (ownerId: string): Set<PositionKey> => {
    let set = weakCache.get(ownerId)
    if (!set) {
      set = new Set<PositionKey>()
      const snap = baseline.byOwnerId[ownerId]
      for (const pos of FINDER_POSITIONS) {
        if (snap && snap.byPosition[pos].leagueRank > half) set.add(pos)
      }
      weakCache.set(ownerId, set)
    }
    return set
  }
  const posOf = (pid: string): PositionKey =>
    (data.players[pid]?.position ?? '').toUpperCase() as PositionKey

  // Stage 1+2 — enumerate raw candidates inside the fairness band.
  const raw: RawCandidate[] = []
  const pushPruned = (partnerOwnerId: string, sends: string[], receives: string[]) => {
    const sendValue = sumValues(sends, values)
    const receiveValue = sumValues(receives, values)
    if (sendValue <= 0 || receiveValue <= 0) return
    const ratio = Math.min(sendValue, receiveValue) / Math.max(sendValue, receiveValue)
    if (ratio < RAW_RATIO_FLOOR) return
    // Same-position 1-for-1s need a fantasy reason to exist. Swapping a
    // healthy RB straight up for a clearly better healthy RB is a trade
    // nobody makes — the side giving the better player is just
    // downgrading at his own position. Keep them only when the values
    // are near-even (a genuine challenge swap) or one of the players is
    // banged up (buy-low / sell-now logic). Cross-position 1-for-1s are
    // untouched — those are need-for-need by definition. Bye-week
    // justification would slot in here too once schedule data is wired.
    //
    // Shop mode only: in target mode the user explicitly asked for this
    // player, so the straight swap is the natural opening offer — the
    // fairness tier labels how light it is.
    if (mode === 'shop' && sends.length === 1 && receives.length === 1) {
      const sPos = posOf(sends[0])
      if (sPos === posOf(receives[0])) {
        const injured =
          !!data.players[sends[0]]?.injuryStatus ||
          !!data.players[receives[0]]?.injuryStatus
        if (!injured && ratio < 0.92) return
      }
    }
    const userWeak = weakAt(userOwnerId)
    const partnerWeak = weakAt(partnerOwnerId)
    const priority = ratio
      + (receives.some((id) => userWeak.has(posOf(id))) ? 0.07 : 0)
      + (sends.some((id) => partnerWeak.has(posOf(id))) ? 0.07 : 0)
    raw.push({ partnerOwnerId, sends, receives, sendValue, receiveValue, ratio, priority })
  }

  if (mode === 'shop') {
    const userSet = new Set(user.playerIds)
    const chips = args.selected.filter((id) => userSet.has(id)).slice(0, 8)
    if (chips.length === 0) return []
    const sendCombos = combos(chips, maxPerSide)
    for (const partner of data.rosters) {
      if (partner.ownerId === userOwnerId) continue
      const pool = tradeablePool(partner.playerIds, data.players, values, PARTNER_POOL)
      for (const recv of combos(pool, maxPerSide)) {
        // "Improve at X" means the HEADLINE piece coming back plays X —
        // the highest-valued player received, not a throw-in. (The
        // improvesAt() check after the sim still verifies the position
        // actually got better.)
        if (improvePositions.length > 0) {
          let best = recv[0]
          for (const e of recv) if (e.value > best.value) best = e
          if (!improvePositions.includes(best.position)) continue
        }
        const receives = recv.map((e) => e.id)
        for (const sends of sendCombos) {
          pushPruned(partner.ownerId, sends, receives)
        }
      }
    }
  } else {
    // target — selected ids live on other rosters; group them per owner
    // and build send packages from the user's own tradeable pool.
    const targetsByOwner = new Map<string, string[]>()
    for (const pid of args.selected.slice(0, 8)) {
      const owner = data.rosters.find(
        (r) => r.ownerId !== userOwnerId && r.playerIds.includes(pid),
      )
      if (!owner) continue
      const list = targetsByOwner.get(owner.ownerId) ?? []
      list.push(pid)
      targetsByOwner.set(owner.ownerId, list)
    }
    if (targetsByOwner.size === 0) return []
    const userPool = tradeablePool(user.playerIds, data.players, values, USER_POOL)
    // "Trade away from": the filter chips name the positions the user has
    // surplus at, so every offer must LEAD with a player from them —
    // mirror of shop mode's headline rule.
    const sendCombos: string[][] = []
    for (const sc of combos(userPool, maxPerSide)) {
      if (improvePositions.length > 0) {
        let best = sc[0]
        for (const e of sc) if (e.value > best.value) best = e
        if (!improvePositions.includes(best.position)) continue
      }
      sendCombos.push(sc.map((e) => e.id))
    }
    for (const [partnerOwnerId, targets] of targetsByOwner) {
      for (const recvSet of combos(targets, Math.min(maxPerSide, targets.length))) {
        for (const sends of sendCombos) {
          // Never offer back a player we're also asking for (impossible
          // anyway — different rosters — but cheap to assert).
          pushPruned(partnerOwnerId, sends, recvSet)
        }
      }
    }
  }

  // Stage 3 — depth-simulate the best-priority survivors only.
  raw.sort((a, b) => b.priority - a.priority)
  const toEval = raw.slice(0, EVAL_BUDGET)

  const seen = new Set<string>()
  const out: FinderCandidate[] = []
  for (const c of toEval) {
    const hash = tradeHash(c.sends, c.receives)
    if (seen.has(hash)) continue
    seen.add(hash)

    const ev = evaluate(ctx, c)
    // The whole point: the user's starting lineup must get better. In
    // target mode we tolerate a small dip — the user explicitly wants
    // those players and may pay a premium — but never an outright gutting.
    if (mode === 'shop' && ev.userGain <= 5) continue
    // Target mode tolerates a real dip in SUMMED starter value — that's
    // what consolidation is. Trading two startable players for the stud
    // always reads negative on the sum even when it's the right move
    // (you're buying ceiling and a roster spot). Capping the dip at -3%
    // filtered out every fair offer and left only the junk-filler ones,
    // so the floor sits at -6% and partner fairness does the ranking.
    if (mode === 'target' && ev.userGainPct < -0.06) continue
    // The position filter only means "improve here" in shop mode — in
    // target mode it means "build the offer from here" and was already
    // enforced at send-combo enumeration.
    if (mode === 'shop' && improvePositions.length > 0 && !improvesAt(ev.userDelta, improvePositions)) continue
    // From the partner's seat: they receive what the user sends. When
    // the user sends a pile for a single player, the partner is the
    // stud-giver — apply the quantity-for-quality rules.
    const pileForStud = c.receives.length === 1 && c.sends.length >= 2
    const fairness = fairnessTier(
      ev.partnerGain, ev.partnerGainPct, c.sendValue, c.receiveValue, pileForStud,
    )
    if (!fairness) continue

    const partner = data.rosters.find((r) => r.ownerId === c.partnerOwnerId)!
    out.push({
      partnerOwnerId: c.partnerOwnerId,
      partnerName: partner.teamName ?? partner.ownerName,
      sends: c.sends.map((id) => shapeCandidatePlayer(id, data.players, values)),
      receives: c.receives.map((id) => shapeCandidatePlayer(id, data.players, values)),
      rawSendValue: c.sendValue,
      rawReceiveValue: c.receiveValue,
      userGain: ev.userGain,
      userGainPct: ev.userGainPct,
      partnerGain: ev.partnerGain,
      partnerGainPct: ev.partnerGainPct,
      fairness,
      userMovements: ev.userDelta.rankMovements.slice(0, 3),
      partnerMovements: ev.partnerDelta.rankMovements.slice(0, 3),
      hash,
    })
  }

  // Plausibility first, size of the win second. Sorting purely by user
  // gain buried every realistic deal under longshots (max user gain ≈ max
  // partner loss — the top of that list always hugged the -6% floor), so
  // the board prints likely-yes deals, then worth-asking, then longshots;
  // within a tier, biggest user gain wins.
  const tierRank: Record<FairnessTier, number> = { 'win-win': 0, 'fair': 1, 'longshot': 2 }
  out.sort((a, b) => {
    const t = tierRank[a.fairness] - tierRank[b.fairness]
    if (t !== 0) return t
    const score = (x: FinderCandidate) =>
      mode === 'shop'
        ? x.userGain
        : x.userGain + Math.min(x.partnerGain, 0) * 1.2
    return score(b) - score(a)
  })

  // ── Group near-duplicate packages into one board slot ──────────────
  //
  // Many survivors are the same core deal with extra pieces bolted on.
  // Process candidates smallest-package-first so the minimal core
  // becomes the base; any later candidate that is a superset of a base
  // (same partner, both sides) attaches to it as an add-on variant
  // instead of burning its own slot.
  const displayRank = new Map<string, number>(out.map((c, i) => [c.hash, i]))
  const bySize = [...out].sort((a, b) => {
    const sz = (x: FinderCandidate) => x.sends.length + x.receives.length
    return sz(a) - sz(b) || displayRank.get(a.hash)! - displayRank.get(b.hash)!
  })
  const idsOf = (list: CandidatePlayer[]) => new Set(list.map((p) => p.id))
  const isSubset = (small: CandidatePlayer[], big: Set<string>) =>
    small.every((p) => big.has(p.id))
  const addedVs = (c: FinderCandidate, base: FinderCandidate) => {
    const baseSendIds = idsOf(base.sends)
    const baseReceiveIds = idsOf(base.receives)
    return {
      addedSends: c.sends.filter((p) => !baseSendIds.has(p.id)),
      addedReceives: c.receives.filter((p) => !baseReceiveIds.has(p.id)),
    }
  }

  const groups: FinderDeal[] = []
  for (const c of bySize) {
    const cSends = idsOf(c.sends)
    const cReceives = idsOf(c.receives)
    let attached = false
    for (const g of groups) {
      if (g.partnerOwnerId !== c.partnerOwnerId) continue
      if (!isSubset(g.base.sends, cSends) || !isSubset(g.base.receives, cReceives)) continue
      g.variants.push({ ...c, ...addedVs(c, g.base) })
      attached = true
      break
    }
    if (!attached) {
      groups.push({
        partnerOwnerId: c.partnerOwnerId,
        partnerName: c.partnerName,
        base: c,
        variants: [],
      })
    }
  }

  // Re-root: when every variant shares a common extra piece (all three
  // pills said "+ X + Chuba Hubbard"), and the family also contains the
  // candidate that adds ONLY the common piece, promote that candidate to
  // the base — the shared player belongs in the trade proper, and the
  // pills collapse to the genuinely optional players.
  for (const g of groups) {
    let rerooted = true
    while (rerooted && g.variants.length >= 2) {
      rerooted = false
      const idSets = g.variants.map(
        (v) => new Set([...v.addedSends, ...v.addedReceives].map((p) => p.id)),
      )
      let common = [...idSets[0]]
      for (const ids of idSets.slice(1)) {
        common = common.filter((id) => ids.has(id))
      }
      if (common.length === 0) break
      const commonSet = new Set(common)
      const target = g.variants.find((v) => {
        const ids = [...v.addedSends, ...v.addedReceives].map((p) => p.id)
        return ids.length === commonSet.size && ids.every((id) => commonSet.has(id))
      })
      if (!target) break
      const { addedSends: _as, addedReceives: _ar, ...newBase } = target
      g.base = newBase
      g.variants = g.variants
        .filter((v) => v.hash !== target.hash)
        .map((v) => ({ ...v, ...addedVs(v, g.base) }))
      rerooted = true
    }
    // A pill is one player, full stop — multi-piece expansions that
    // survive re-rooting are too noisy to read as "add-ons."
    g.variants = g.variants
      .filter((v) => v.addedSends.length + v.addedReceives.length === 1)
      .sort((a, b) => displayRank.get(a.hash)! - displayRank.get(b.hash)!)
      .slice(0, MAX_VARIANTS)
  }
  groups.sort((a, b) => displayRank.get(a.base.hash)! - displayRank.get(b.base.hash)!)

  // Variety guard: don't let one partner roster monopolize the board.
  const perPartner = new Map<string, number>()
  const final: FinderDeal[] = []
  for (const g of groups) {
    const n = perPartner.get(g.partnerOwnerId) ?? 0
    if (n >= 3) continue
    perPartner.set(g.partnerOwnerId, n + 1)
    final.push(g)
    if (final.length >= limit) break
  }
  return final
}

// ── Rumor Mill — autonomous weekly mock trades ───────────────────────────

export type MockTradeSide = {
  ownerId: string
  name: string
  avatarUrl: string | null
  sends: CandidatePlayer[]
  gain: number
  gainPct: number
  movements: TeamDepthDelta['rankMovements']
}

export type MockTrade = {
  hash: string
  tag: 'blockbuster' | 'win-win' | 'depth-swap'
  teamA: MockTradeSide
  teamB: MockTradeSide
  // Filled in by the route's Groq pass; deterministic fallbacks here.
  headline: string
  blurb: string
}

// Deterministic PRNG so a (league, week) pair always generates the same
// column — every league member sees the same rumors to argue about.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

// Deterministic column copy, used whenever the Groq pass fails.
//
// This has to read like a column and not like one sentence printed three
// times. An AI failure is silent by design (every caller degrades quietly),
// so a page of identical blurbs is the only symptom anyone ever sees, and
// it reads as a broken page rather than a degraded one. Each line is built
// from that trade's own rank movements and the opener rotates with the slot.
function fallbackBlurb(a: MockTradeSide, b: MockTradeSide, slot: number): string {
  const namesA = a.sends.map((p) => p.name).join(' + ')
  const namesB = b.sends.map((p) => p.name).join(' + ')

  const opener =
    slot % 3 === 0
      ? `${a.name} puts ${namesA} on the block and ${b.name} answers with ${namesB}.`
      : slot % 3 === 1
        ? `The desk has ${namesB} going to ${a.name}, with ${namesA} heading back.`
        : `${b.name} would be moving ${namesB} here, and ${namesA} is the package that gets it done.`

  // Lead with whichever side actually climbs the league at a position —
  // that's the part of the deal worth arguing about.
  const climb = [a, b]
    .flatMap((side) => side.movements.map((m) => ({ side, m })))
    .filter((x) => x.m.after < x.m.before)
    .sort((x, y) => (x.m.after - x.m.before) - (y.m.after - y.m.before))[0]
  const movement = climb
    ? ` ${climb.side.name} goes from ${ordinal(climb.m.before)} to ${ordinal(climb.m.after)} at ${climb.m.position}.`
    : ''

  const ledger = (side: MockTradeSide) =>
    `${side.name} ${side.gain >= 0 ? 'gains' : 'gives up'} ${Math.abs(Math.round(side.gain))}`
  return `${opener}${movement} On starter value, ${ledger(a)} and ${ledger(b)}.`
}

export type GenerateMocksArgs = {
  data: AnalyzerLeagueData
  values: Map<string, PlayerValue>
  // (leagueId + weekKey) — drives the PRNG and therefore which pairs get
  // explored first, so different weeks naturally surface different deals.
  seedKey: string
  // Trade hashes already published in past weeks; never repeat one.
  excludeHashes: Set<string>
  // ownerId → how heavily to discount that team for having appeared in a
  // recent column (1 = last column, decaying to 0). Excluding repeat
  // HASHES alone was never enough: the same two rosters kept winning the
  // ranking with a slightly different player attached, so the column read
  // as the same four teams every week.
  recentOwners?: Map<string, number>
  count?: number
}

export function generateMockTrades(args: GenerateMocksArgs): MockTrade[] {
  const { data, values } = args
  const want = Math.min(Math.max(args.count ?? 4, 3), 5)
  const rand = mulberry32(hashSeed(args.seedKey))

  const rosters = data.rosters.filter((r) => r.playerIds.length > 0)
  if (rosters.length < 2) return []
  const baseline = computeLeagueDepth(data.rosters, data.players, values, data.effective)

  // All unordered pairs, shuffled by the weekly seed, capped.
  const pairs: Array<[number, number]> = []
  for (let i = 0; i < rosters.length; i++)
    for (let j = i + 1; j < rosters.length; j++) pairs.push([i, j])
  for (let i = pairs.length - 1; i > 0; i--) {
    const k = Math.floor(rand() * (i + 1))
    ;[pairs[i], pairs[k]] = [pairs[k], pairs[i]]
  }
  // Consider every pair in a normal-sized league.
  //
  // This was 24, which in a 12-team league is barely a third of the 66
  // possible pairings. Combined with the deliberately strict publish
  // filters below, an unlucky weekly seed could sample 24 pairs that
  // happened to contain no publishable deal and the Mill printed an empty
  // column. Widening the sample changes nothing about WHICH deals qualify
  // (every filter below is untouched), it just stops the seed from hiding
  // the ones that do. The per-pair eval budget still bounds the work.
  const samplePairs = pairs.slice(0, 80)

  // League-wide single-player value line — a trade headlined by a player
  // above it reads as a blockbuster.
  //
  // This was the 85th percentile, which in a 12-team league is roughly the
  // 27th-most-valuable player. Since the Mill only ever shops each roster's
  // top 7, nearly every candidate cleared that line and every trade on the
  // column printed the BLOCKBUSTER tag. The 96th is about the top 7
  // leaguewide: genuinely the players whose name in a rumor is the story.
  const allValues = rosters
    .flatMap((r) => r.playerIds)
    .map((id) => values.get(id)?.value ?? 0)
    .filter((v) => v > 0)
    .sort((a, b) => a - b)
  const blockbusterLine =
    allValues.length > 0 ? allValues[Math.floor(allValues.length * 0.96)] : Infinity

  // Weekly spotlight draw. Every roster gets a seeded weight for this
  // column, and deals involving high-weight rosters get a nudge up the
  // board. Without it the ranking below is a pure function of the current
  // rosters, so whichever two teams have the most fixable lineups won
  // every single week and the seed changed nothing about who appeared.
  const spotlight = new Map<string, number>()
  for (const r of rosters) spotlight.set(r.ownerId, rand())
  const recentOwners = args.recentOwners ?? new Map<string, number>()

  // A second seeded draw, one per PAIRING. Drawing this per candidate
  // instead hands the lottery to whichever pairing produced the most
  // candidates: two rosters that fit together in forty different ways get
  // forty tickets, and the best of forty draws beats a well-matched pair
  // that only fits one way. Per pairing, every candidate between the same
  // two teams shares a ticket and quality picks which of them runs.
  const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`)
  const pairDraw = new Map<string, number>()
  for (let i = 0; i < rosters.length; i++) {
    for (let j = i + 1; j < rosters.length; j++) {
      pairDraw.set(pairKey(rosters[i].ownerId, rosters[j].ownerId), rand())
    }
  }

  type Scored = {
    a: typeof rosters[number]
    b: typeof rosters[number]
    sends: string[]      // a → b
    receives: string[]   // b → a
    gainA: number; gainAPct: number
    gainB: number; gainBPct: number
    movA: TeamDepthDelta['rankMovements']
    movB: TeamDepthDelta['rankMovements']
    mutual: number
    blockbuster: boolean
    hash: string
  }
  const scored: Scored[] = []
  const seen = new Set<string>()

  for (const [i, j] of samplePairs) {
    const a = rosters[i]
    const b = rosters[j]
    const poolA = tradeablePool(a.playerIds, data.players, values, 7)
    const poolB = tradeablePool(b.playerIds, data.players, values, 7)
    const combosA = combos(poolA.map((e) => e.id), 2)
    const combosB = combos(poolB.map((e) => e.id), 2)
    let evals = 0
    for (const sends of combosA) {
      const sendVal = sumValues(sends, values)
      if (sendVal <= 0) continue
      for (const receives of combosB) {
        // Per-pair budget. Raised from 70: the Mill was reliably printing 2
        // deals against a target of 3-5, and this cap was throwing away
        // candidates before they were ever scored. Like the pair-sample
        // width above, this changes only how many combinations get LOOKED
        // at, never the bar they have to clear, so the column can't fill up
        // with worse trades. Measured at ~5s per generation, once a week
        // per league, and cached after.
        if (evals >= 160) break
        const recvVal = sumValues(receives, values)
        if (recvVal <= 0) continue
        const ratio = Math.min(sendVal, recvVal) / Math.max(sendVal, recvVal)
        if (ratio < 0.78) continue
        const hash = tradeHash(sends, receives)
        if (seen.has(hash) || args.excludeHashes.has(hash)) continue
        seen.add(hash)
        evals += 1

        const after = snapshotAfterTrade(
          data.rosters, data.players, values, data.effective,
          a.ownerId, b.ownerId, sends, receives,
        )
        const dA = depthDelta(baseline, after, a.ownerId)
        const dB = depthDelta(baseline, after, b.ownerId)
        const beforeA = sumStarters(dA.before)
        const beforeB = sumStarters(dB.before)
        // Same roster-spot cost the Finder charges — an uneven mock that
        // nets one side extra bodies pays for the forced cuts.
        const sendSet = new Set(sends)
        const receiveSet = new Set(receives)
        const aPost = a.playerIds.filter((id) => !sendSet.has(id)).concat(receives)
        const bPost = b.playerIds.filter((id) => !receiveSet.has(id)).concat(sends)
        const penA = rosterSpotPenalty(a.playerIds, aPost, data.players, values)
        const penB = rosterSpotPenalty(b.playerIds, bPost, data.players, values)
        const gainA = sumStarters(dA.after) - beforeA - penA
        const gainB = sumStarters(dB.after) - beforeB - penB
        // The Mill only publishes deals both sides could plausibly say
        // yes to — at least one side clearly wins and the other is no
        // worse than roughly even.
        const pctA = beforeA > 0 ? gainA / beforeA : 0
        const pctB = beforeB > 0 ? gainB / beforeB : 0
        if (Math.min(pctA, pctB) < MILL_LOSS_FLOOR_PCT) continue
        if (Math.max(pctA, pctB) <= MILL_WINNER_PCT) continue
        const maxPiece = Math.max(
          ...sends.map((id) => values.get(id)?.value ?? 0),
          ...receives.map((id) => values.get(id)?.value ?? 0),
        )
        scored.push({
          a, b, sends, receives,
          gainA, gainAPct: pctA,
          gainB, gainBPct: pctB,
          movA: dA.rankMovements.slice(0, 3),
          movB: dB.rankMovements.slice(0, 3),
          // Mutual benefit as a PERCENTAGE of each side's starting lineup,
          // not raw starter value. A full league's starters sum to ~34k, so
          // the raw number scales with how big a roster already is: the
          // same 1.5% improvement prints as 585 for one team and 300 for
          // another, and ranking on that quietly reserved the column for
          // whichever rosters happened to carry the largest bases.
          mutual: Math.min(pctA, pctB),
          blockbuster: maxPiece >= blockbusterLine,
          hash,
        })
      }
    }
  }

  // ── Ranking ─────────────────────────────────────────────────────────
  //
  // Everything still in `scored` already cleared the publish bands above
  // (neither side down more than MILL_LOSS_FLOOR_PCT, one side up more
  // than MILL_WINNER_PCT), so every candidate here is a deal the Mill is
  // happy to print. That matters: rotating among them costs no quality,
  // it only changes WHICH publishable deal runs.
  //
  // Quality enters the score as a PERCENTILE of the field rather than a
  // normalised magnitude. Min-max normalisation leaves the distribution
  // whatever shape it had, and in a real league that shape is a long tail:
  // a handful of deals sit near the top and everything else bunches near
  // zero, so no per-week draw could ever reorder the leaders. A percentile
  // is uniform by construction, so a deal in the 70th percentile with a
  // good weekly draw can outrank a 95th with a poor one.
  const byMutual = [...scored].sort((x, y) => x.mutual - y.mutual)
  const quality = new Map<Scored, number>()
  byMutual.forEach((s, i) => {
    quality.set(s, byMutual.length > 1 ? i / (byMutual.length - 1) : 1)
  })

  // Weight budget, all on the same 0–1 scale as the quality percentile:
  //   blockbuster  +0.08  the fun ones still get a thumb on the scale
  //   spotlight    +0.30  seeded per-team draw, rotates the cast weekly
  //   pairing      +0.35  seeded per-pairing draw, rotates the matchups
  //   recency      −0.45  a team that just ran has to be clearly better
  //
  // The blockbuster thumb is deliberately light. The figure it replaces
  // was a flat +40 against a raw spread of several hundred, i.e. about 7%
  // of the range; carrying that intent across to the 0–1 scale keeps the
  // tag meaning something. Anything heavier and the ranking simply selects
  // for star names, and every deal on the column prints BLOCKBUSTER.
  const rankScore = (s: Scored) =>
    (quality.get(s) ?? 0)
    + (s.blockbuster ? 0.08 : 0)
    + ((spotlight.get(s.a.ownerId) ?? 0) + (spotlight.get(s.b.ownerId) ?? 0)) / 2 * 0.30
    + (pairDraw.get(pairKey(s.a.ownerId, s.b.ownerId)) ?? 0) * 0.35
    - Math.max(recentOwners.get(s.a.ownerId) ?? 0, recentOwners.get(s.b.ownerId) ?? 0) * 0.45

  const ranked = scored
    .map((s) => ({ s, score: rankScore(s) }))
    .sort((x, y) => y.score - x.score)
    .map((e) => e.s)

  // Diversity. A player appears in at most one mock, and teams are dealt
  // out in two passes: the first lets every roster appear ONCE, so a
  // three-deal column introduces six different teams. Only if that pass
  // can't fill the slate do we come back around and allow a second
  // appearance. The old single pass capped teams at 2 with no preference
  // for fresh ones, so the top-ranked rosters took two slots each and
  // three trades routinely printed just four teams.
  const teamUse = new Map<string, number>()
  const usedPlayers = new Set<string>()
  const pickedHashes = new Set<string>()
  const picked: Scored[] = []
  for (const maxPerTeam of [1, 2]) {
    for (const s of ranked) {
      if (picked.length >= want) break
      if (pickedHashes.has(s.hash)) continue
      if ((teamUse.get(s.a.ownerId) ?? 0) >= maxPerTeam) continue
      if ((teamUse.get(s.b.ownerId) ?? 0) >= maxPerTeam) continue
      if ([...s.sends, ...s.receives].some((id) => usedPlayers.has(id))) continue
      picked.push(s)
      pickedHashes.add(s.hash)
      teamUse.set(s.a.ownerId, (teamUse.get(s.a.ownerId) ?? 0) + 1)
      teamUse.set(s.b.ownerId, (teamUse.get(s.b.ownerId) ?? 0) + 1)
      for (const id of [...s.sends, ...s.receives]) usedPlayers.add(id)
    }
    if (picked.length >= want) break
  }

  return picked.map((s, slot) => {
    const sideA: MockTradeSide = {
      ownerId: s.a.ownerId,
      name: s.a.teamName ?? s.a.ownerName,
      avatarUrl: s.a.avatarUrl,
      sends: s.sends.map((id) => shapeCandidatePlayer(id, data.players, values)),
      gain: s.gainA, gainPct: s.gainAPct, movements: s.movA,
    }
    const sideB: MockTradeSide = {
      ownerId: s.b.ownerId,
      name: s.b.teamName ?? s.b.ownerName,
      avatarUrl: s.b.avatarUrl,
      sends: s.receives.map((id) => shapeCandidatePlayer(id, data.players, values)),
      gain: s.gainB, gainPct: s.gainBPct, movements: s.movB,
    }
    const tag: MockTrade['tag'] = s.blockbuster
      ? 'blockbuster'
      : s.mutual > 0 ? 'win-win' : 'depth-swap'
    const headA = sideA.sends[0]?.name ?? '?'
    const headB = sideB.sends[0]?.name ?? '?'
    return {
      hash: s.hash,
      tag,
      teamA: sideA,
      teamB: sideB,
      // Deterministic fallbacks — the route overwrites these with Groq
      // copy when the call succeeds.
      headline: `${headB} for ${headA}?`,
      blurb: fallbackBlurb(sideA, sideB, slot),
    }
  })
}
