// Value engine orchestrator.
//
// Two ways to valuate a league:
//
//   1. CONSENSUS (default): run every applicable source for the league's
//      mode in parallel, blend each player's values across the sources that
//      have them (mean of available values). Tracks which sources
//      contributed so the UI can show "FC 9100 · Sleeper 9250" tooltips.
//
//   2. SINGLE SOURCE: pass {source: 'ktc-dynasty'} (or any provider id) to
//      force one source. Used by the live-toggle UI when a user wants to
//      spot-check a single grading service.
//
// Both modes blend in Sleeper-derived as a deep-bench floor so rookies and
// fringe players KTC/FC haven't graded still get a baseline value.

import { sleeperValueSource } from './sleeper'
import { fantasyCalcDynastySource, fantasyCalcRedraftSource } from './fantasycalc'
import { ktcDynastySource, isKtcConfigured } from './ktc'
import { dynastyProcessSource, isDynastyProcessConfigured } from './dynastyprocess'
import { fantasyProsDynastySource, fantasyProsRosSource, isFantasyProsConfigured } from './fantasypros'
import { espnRosSource, isEspnConfigured } from './espn'
import type { LeagueMode, LeagueValuationContext, PlayerValue, ProviderAttempt, ValueProviderId, ValueSource } from './types'

export type { LeagueMode, LeagueValuationContext, PlayerValue, ProviderAttempt, ValueProviderId } from './types'

export type ValuationOptions = {
  // 'consensus' (default) blends every available source. Any other value
  // forces that single provider; if it returns empty we fall back through
  // the normal preference order ending at Sleeper-derived.
  source?: ValueProviderId
}

export type ValuationResult = {
  // The provider that produced the values map. 'consensus' when blended.
  provider: ValueProviderId
  providerLabel: string
  // For single-source results we also track whether a fallback baseline was
  // blended underneath (Sleeper-derived for deep bench). For consensus this
  // is always null (every source already contributes).
  fallbackProvider: ValueProviderId | null
  fallbackLabel: string | null
  values: Map<string, PlayerValue>
  ctx: LeagueValuationContext
  attempts: ProviderAttempt[]
  // Sources that actually contributed to the result (consensus mode only).
  // `rescale` is set on non-anchor sources whose values were per-position
  // quantile-mapped into the anchor's coordinate frame. Null if the source
  // IS the anchor or if it wasn't rescaled (e.g. anchor was unavailable).
  contributingSources: Array<{
    provider: ValueProviderId
    label: string
    playerCount: number
    rescale: {
      kind: 'positional-quantile'
      positions: Record<string, { sourceCount: number; anchorCount: number; sourceMin: number; sourceMax: number; anchorMin: number; anchorMax: number }>
    } | null
  }>
  // Consensus only — the source used as the anchor for rescale.
  anchorProvider: ValueProviderId | null
}

const PROVIDER_LABELS: Record<ValueProviderId, string> = {
  'consensus': 'Consensus',
  'sleeper-derived': 'Sleeper search rank',
  'fantasycalc-dynasty': 'FantasyCalc · Dynasty',
  'fantasycalc-redraft': 'FantasyCalc · Redraft',
  'ktc-dynasty': 'KeepTradeCut · Dynasty',
  'dynastyprocess': 'DynastyProcess',
  'fantasypros-dynasty': 'FantasyPros · Dynasty',
  'fantasypros-ros': 'FantasyPros · ROS',
  'espn-ros': 'ESPN · ROS',
}

const SOURCE_BY_ID: Record<Exclude<ValueProviderId, 'consensus'>, ValueSource> = {
  'sleeper-derived': sleeperValueSource,
  'fantasycalc-dynasty': fantasyCalcDynastySource,
  'fantasycalc-redraft': fantasyCalcRedraftSource,
  'ktc-dynasty': ktcDynastySource,
  'dynastyprocess': dynastyProcessSource,
  'fantasypros-dynasty': fantasyProsDynastySource,
  'fantasypros-ros': fantasyProsRosSource,
  'espn-ros': espnRosSource,
}

// Per-mode source preference (also the consensus pool — everything in this
// list gets blended when the user picks Consensus).
function preferenceOrder(mode: LeagueMode): ValueSource[] {
  switch (mode) {
    case 'dynasty':
    case 'keeper':
      return [
        ktcDynastySource,
        fantasyCalcDynastySource,
        dynastyProcessSource,
        fantasyProsDynastySource,
        sleeperValueSource,
      ]
    case 'redraft':
      return [
        fantasyCalcRedraftSource,
        fantasyProsRosSource,
        espnRosSource,
        sleeperValueSource,
      ]
  }
}

async function tryAttempt(source: ValueSource, ctx: LeagueValuationContext): Promise<{ values: Map<string, PlayerValue>; attempt: ProviderAttempt }> {
  try {
    const values = await source.valueAll(ctx)
    const ok = values.size > 0
    return {
      values,
      attempt: {
        provider: source.id,
        label: PROVIDER_LABELS[source.id],
        ok,
        playerCount: values.size,
        message: ok ? undefined : 'empty result',
      },
    }
  } catch (e) {
    return {
      values: new Map(),
      attempt: {
        provider: source.id,
        label: PROVIDER_LABELS[source.id],
        ok: false,
        playerCount: 0,
        message: e instanceof Error ? e.message : String(e),
      },
    }
  }
}

function blendInto(primary: Map<string, PlayerValue>, fallback: Map<string, PlayerValue>): number {
  let added = 0
  for (const [pid, val] of fallback) {
    if (!primary.has(pid)) {
      primary.set(pid, val)
      added += 1
    }
  }
  return added
}

// ── Per-position quantile rescale ──────────────────────────────────────────
//
// Why: different value providers publish on different scales AND different
// shapes. KTC compresses elite players (Bijan/Gibbs/Chase all at 9990+) while
// FC spreads its top tier more. FP rank-decay produces a third curve. The
// shape mismatch is ALSO position-specific — FC tends to underrate TEs vs.
// the market, KTC overrates rookie WRs, etc. A simple global affine can't
// fix any of this.
//
// What: per source S and per position P, sort S's players at P by value, sort
// the anchor's players at P by value. Replace each S player's value with the
// anchor's value at the same *percentile* within position. Concretely, the
// #1 KTC RB becomes FC's #1 RB value, the median KTC RB becomes FC's median
// RB value, etc.
//
// Properties:
//   • Top-to-top matching by position — solves the elite-tier compression
//     problem that plain OLS regression toward the mean creates.
//   • Position-aware by construction — no separate "QB multiplier" step.
//   • Robust to shape differences — KTC's flat top tier maps onto FC's spread
//     top tier; ordering preserved, spacing matches the anchor.
//   • Works for source-only players (not in anchor): we compute their
//     percentile within source, then look up the anchor's value at the same
//     percentile. So a deep-bench player KTC has but FC doesn't still gets
//     mapped to a sensible FC-frame value.
//   • Percentiles fall out for free — saved on PlayerValue for the UI badge.
//
// Anchor: FantasyCalc (mode-correct variant). Native Sleeper IDs, market-
// priced, fresh daily. If FC fails entirely, per-position fallback to the
// non-Sleeper source with the most coverage at that position.
//
// Guards: skip a position if anchor has < MIN_ANCHOR_AT_POSITION players or
// source has < MIN_SOURCE_AT_POSITION — quantile mapping with too few points
// is noisy. Below the threshold the source's values for that position pass
// through unchanged.

const MIN_ANCHOR_AT_POSITION = 10
const MIN_SOURCE_AT_POSITION = 5
const ANALYZED_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const

type QuantileMap = {
  // Per-position summary used both to apply the rescale and to surface a
  // diagnostic ("WR rescaled: source range 100-9999 → anchor range 80-10231,
  // 184 source players mapped onto 178 anchor anchors").
  byPosition: Record<string, {
    sourceCount: number
    anchorCount: number
    sourceMin: number
    sourceMax: number
    anchorMin: number
    anchorMax: number
    // Sorted anchor values, descending. Used as the destination lookup
    // when applying the map to a source player.
    anchorSortedDesc: number[]
    // For each source value at this position, the rank within source. We
    // index by value (descending sort) when applying.
    sourceSortedDesc: number[]
  }>
}

function groupByPosition(values: Map<string, PlayerValue>): Map<string, PlayerValue[]> {
  const out = new Map<string, PlayerValue[]>()
  for (const pv of values.values()) {
    const pos = pv.position.toUpperCase()
    if (!(ANALYZED_POSITIONS as readonly string[]).includes(pos)) continue
    let arr = out.get(pos)
    if (!arr) { arr = []; out.set(pos, arr) }
    arr.push(pv)
  }
  return out
}

function buildQuantileMap(
  source: Map<string, PlayerValue>,
  anchor: Map<string, PlayerValue>,
): QuantileMap {
  const sourceByPos = groupByPosition(source)
  const anchorByPos = groupByPosition(anchor)
  const byPosition: QuantileMap['byPosition'] = {}
  for (const pos of ANALYZED_POSITIONS) {
    const sp = sourceByPos.get(pos) ?? []
    const ap = anchorByPos.get(pos) ?? []
    if (sp.length < MIN_SOURCE_AT_POSITION) continue
    if (ap.length < MIN_ANCHOR_AT_POSITION) continue
    const sourceSortedDesc = sp.map((p) => p.value).sort((a, b) => b - a)
    const anchorSortedDesc = ap.map((p) => p.value).sort((a, b) => b - a)
    byPosition[pos] = {
      sourceCount: sourceSortedDesc.length,
      anchorCount: anchorSortedDesc.length,
      sourceMin: sourceSortedDesc[sourceSortedDesc.length - 1],
      sourceMax: sourceSortedDesc[0],
      anchorMin: anchorSortedDesc[anchorSortedDesc.length - 1],
      anchorMax: anchorSortedDesc[0],
      sourceSortedDesc,
      anchorSortedDesc,
    }
  }
  return { byPosition }
}

// Apply a quantile map to a source's values. For each player, find their
// rank within source (descending), then look up the anchor's value at the
// equivalent percentile rank in anchor's distribution.
//
// Ties in source value get the same rank (first match) — we pick the largest
// such rank to be conservative (a flat KTC top tier maps to FC's top tier).
function applyQuantileMap(
  values: Map<string, PlayerValue>,
  map: QuantileMap,
): Map<string, PlayerValue> {
  const out = new Map<string, PlayerValue>()
  for (const [pid, pv] of values) {
    const pos = pv.position.toUpperCase()
    const m = map.byPosition[pos]
    if (!m) { out.set(pid, pv); continue }
    // Source rank by value, descending. binary-search for value position.
    // We treat ties by mapping to the FIRST (highest) anchor rank that
    // would hold this value, so a cluster of KTC=9999 all map to FC's top
    // values 1..n rather than all to FC's rank-1 value.
    const sIdx = lowerBoundDesc(m.sourceSortedDesc, pv.value)
    // Percentile = sIdx / (sourceCount - 1). Convert to anchor index.
    const denom = Math.max(1, m.sourceCount - 1)
    const pct = sIdx / denom
    const aIdx = Math.min(m.anchorCount - 1, Math.round(pct * (m.anchorCount - 1)))
    const remapped = m.anchorSortedDesc[aIdx]
    out.set(pid, { ...pv, value: remapped })
  }
  return out
}

// Find the index of the first entry equal to `value` in a descending-sorted
// array. Falls back to the closest index if exact match doesn't exist.
function lowerBoundDesc(arr: number[], value: number): number {
  let lo = 0, hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (arr[mid] > value) lo = mid + 1
    else hi = mid
  }
  return Math.min(arr.length - 1, lo)
}

// Pick the per-mode preferred anchor. Caller verifies it actually has data.
function preferredAnchor(mode: LeagueMode): ValueProviderId {
  return mode === 'redraft' ? 'fantasycalc-redraft' : 'fantasycalc-dynasty'
}

// ── Consensus blending ─────────────────────────────────────────────────────
//
// For each player that appears in ≥1 source, the consensus value is a
// WEIGHTED mean of (rescaled) values, with two filters applied first:
//
//   1. Sleeper-floor: if ≥1 market source covers the player, exclude
//      Sleeper-derived from the mean. Sleeper search-rank is a popularity
//      proxy, not a value signal — it adds noise when real market values
//      exist. It still feeds the consensus when NO market source has the
//      player (deep-bench / fringe players).
//
//   2. Outlier guard: when ≥3 sources cover the player, drop any source
//      whose value deviates from the median by more than OUTLIER_THRESHOLD
//      (40%). Catches scrape regressions (KTC returning 50 instead of 9997)
//      and per-source aberrations without harming the common case.
//      Defensive floor: never drop so many sources that <2 remain.
//
// Weights per source reflect reliability: FC has native Sleeper IDs and is
// market-priced; KTC and DP follow; FP is rank-decay (less precise); ESPN
// is a stub for now; Sleeper is popularity. Single tunable record.
//
// Each source's raw (pre-rescale) value AND dropped-by-outlier flag is
// preserved on `contributions[]` so the diagnostic UI can show the full
// blend story.

const SOURCE_WEIGHTS: Record<ValueProviderId, number> = {
  'consensus':             1.0,    // never appears as a contribution
  'fantasycalc-dynasty':   1.00,
  'fantasycalc-redraft':   1.00,
  'ktc-dynasty':           0.90,
  'dynastyprocess':        0.85,
  'fantasypros-dynasty':   0.70,
  'fantasypros-ros':       0.80,   // ROS is FP's relative strength
  'espn-ros':              0.70,
  'sleeper-derived':       0.50,   // weight set for completeness; only used as floor
}

// Commish source preference (Trade Desk drawer). EQUAL uses SOURCE_WEIGHTS
// as-is; the weighted modes tilt the blend toward FantasyCalc or
// DynastyProcess without silencing the other sources — a 1.5x/0.5x swing
// moves the pair to roughly a 75/25 split of their combined weight, which
// is what the drawer's copy promises.
function effectiveWeights(pref: 'EQUAL' | 'FC_WEIGHTED' | 'DP_WEIGHTED'): Record<ValueProviderId, number> {
  if (pref === 'FC_WEIGHTED') {
    return {
      ...SOURCE_WEIGHTS,
      'fantasycalc-dynasty': SOURCE_WEIGHTS['fantasycalc-dynasty'] * 1.5,
      'fantasycalc-redraft': SOURCE_WEIGHTS['fantasycalc-redraft'] * 1.5,
      'dynastyprocess':      SOURCE_WEIGHTS['dynastyprocess'] * 0.5,
    }
  }
  if (pref === 'DP_WEIGHTED') {
    return {
      ...SOURCE_WEIGHTS,
      'dynastyprocess':      SOURCE_WEIGHTS['dynastyprocess'] * 1.5,
      'fantasycalc-dynasty': SOURCE_WEIGHTS['fantasycalc-dynasty'] * 0.5,
      'fantasycalc-redraft': SOURCE_WEIGHTS['fantasycalc-redraft'] * 0.5,
    }
  }
  return SOURCE_WEIGHTS
}

// TE premium value adjustment. No public source prices TEP leagues
// directly, so we lift every TE's blended value by a flat multiplier —
// simple, monotonic (ordering within TE never changes), and sized to
// match how TEP market calculators shift mid-tier TE1s: MILD (+0.5/rec)
// ≈ +10%, FULL (+1.0/rec) ≈ +20%.
const TE_PREMIUM_MULT: Record<'NONE' | 'MILD' | 'FULL', number> = {
  NONE: 1.0,
  MILD: 1.10,
  FULL: 1.20,
}

function applyTePremium(values: Map<string, PlayerValue>, tePremium: 'NONE' | 'MILD' | 'FULL' | undefined): void {
  const mult = TE_PREMIUM_MULT[tePremium ?? 'NONE']
  if (mult === 1.0) return
  for (const pv of values.values()) {
    if (pv.position.toUpperCase() === 'TE') {
      pv.value = Math.round(pv.value * mult)
    }
  }
}

// Only drop a source when its value is more than 2x or less than 0.5x the
// median of peer sources for that player (threshold 1.00 = 100% deviation).
// The intent is catching scrape regressions (e.g. KTC silently returning 50
// instead of 9997), not arbitrating legitimate inter-source disagreement —
// that's what consensus is for. Empirically a 40% threshold fired on ~40%
// of players; 100% fires only on real ~2x errors.
const OUTLIER_THRESHOLD = 1.00
const OUTLIER_MIN_PEERS = 3

function consensusBlend(
  results: Array<{
    source: ValueSource
    values: Map<string, PlayerValue>          // rescaled values used in the mean
    rawValues: Map<string, PlayerValue>       // pre-rescale values for diagnostics
  }>,
  weights: Record<ValueProviderId, number> = SOURCE_WEIGHTS,
): Map<string, PlayerValue> {
  // First pass: collect every source's contribution per player so we can
  // run the Sleeper-floor + outlier filters with global knowledge.
  type Contribution = {
    sourceId: ValueProviderId
    value: number
    rawValue: number
    meta: PlayerValue
  }
  const byPlayer = new Map<string, Contribution[]>()
  for (const { source, values, rawValues } of results) {
    for (const [pid, pv] of values) {
      let arr = byPlayer.get(pid)
      if (!arr) { arr = []; byPlayer.set(pid, arr) }
      const raw = rawValues.get(pid)?.value ?? pv.value
      arr.push({ sourceId: source.id, value: pv.value, rawValue: raw, meta: pv })
    }
  }

  const out = new Map<string, PlayerValue>()
  for (const [pid, contribs] of byPlayer) {
    // 1. Sleeper-floor: prefer market sources when available.
    const market = contribs.filter((c) => c.sourceId !== 'sleeper-derived')
    const effective = market.length > 0 ? market : contribs

    // 2. Outlier guard against the median of effective contributors.
    const dropped = new Set<ValueProviderId>()
    let kept = effective
    if (effective.length >= OUTLIER_MIN_PEERS) {
      const sortedVals = [...effective].map((c) => c.value).sort((a, b) => a - b)
      const median = sortedVals[Math.floor(sortedVals.length / 2)]
      if (median > 0) {
        const candidate = effective.filter((c) => {
          const ok = Math.abs(c.value - median) / median <= OUTLIER_THRESHOLD
          if (!ok) dropped.add(c.sourceId)
          return ok
        })
        // Never drop so many sources that <2 remain.
        if (candidate.length >= 2) kept = candidate
        else dropped.clear()
      }
    }

    // 3. Weighted mean of kept values.
    let weightedSum = 0
    let weightTotal = 0
    for (const c of kept) {
      const w = weights[c.sourceId] ?? 1.0
      weightedSum += c.value * w
      weightTotal += w
    }
    const blended = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0

    // Contributions list shows ALL sources that had the player — including
    // those dropped by the outlier guard — so the diagnostic UI can
    // explain why the blend looks the way it does. (`dropped` flag is set
    // on outlier-rejected entries via the optional dropped field.)
    const contributions: NonNullable<PlayerValue['contributions']> = effective.map((c) => ({
      provider: c.sourceId,
      label: PROVIDER_LABELS[c.sourceId],
      value: c.value,
      ...(c.rawValue !== c.value ? { rawValue: c.rawValue } : {}),
    }))

    // Meta from the first effective source (preferenceOrder ordering means
    // the highest-confidence source comes first).
    const meta = effective[0].meta
    out.set(pid, {
      ...meta,
      value: blended,
      source: 'consensus',
      sourceCount: kept.length,
      contributions,
    })
    void dropped // currently unused on the response surface; kept for future diagnostic exposure
  }
  return out
}

export async function valuateLeague(ctx: LeagueValuationContext, opts: ValuationOptions = {}): Promise<ValuationResult> {
  const requested = opts.source ?? 'consensus'
  if (requested === 'consensus') {
    return valuateConsensus(ctx)
  }
  return valuateSingle(ctx, requested)
}

async function valuateConsensus(ctx: LeagueValuationContext): Promise<ValuationResult> {
  const sources = preferenceOrder(ctx.mode)
  const attemptedResults = await Promise.all(
    sources.map(async (src) => ({ source: src, ...(await tryAttempt(src, ctx)) })),
  )
  const attempts: ProviderAttempt[] = attemptedResults.map((r) => r.attempt)
  const nonEmpty = attemptedResults.filter((r) => r.values.size > 0)

  // ── Pick the anchor ────────────────────────────────────────────────
  // Prefer FantasyCalc (mode-correct variant). If FC didn't return data,
  // fall back to whichever non-Sleeper source has the largest coverage so we
  // still get rescaled blending across the remaining sources.
  const preferred = preferredAnchor(ctx.mode)
  const anchorEntry =
    nonEmpty.find((r) => r.source.id === preferred) ??
    nonEmpty
      .filter((r) => r.source.id !== 'sleeper-derived')
      .reduce<typeof nonEmpty[number] | null>(
        (best, cur) => (best == null || cur.values.size > best.values.size ? cur : best),
        null,
      )

  // ── Rescale every non-anchor source onto the anchor's coordinate frame ──
  type Prepared = {
    source: ValueSource
    values: Map<string, PlayerValue>      // rescaled (or raw if no anchor)
    rawValues: Map<string, PlayerValue>   // original, pre-rescale
    map: QuantileMap | null
  }
  const prepared: Prepared[] = []
  for (const r of nonEmpty) {
    if (!anchorEntry || r.source.id === anchorEntry.source.id) {
      prepared.push({ source: r.source, values: r.values, rawValues: r.values, map: null })
      continue
    }
    const map = buildQuantileMap(r.values, anchorEntry.values)
    if (Object.keys(map.byPosition).length === 0) {
      prepared.push({ source: r.source, values: r.values, rawValues: r.values, map: null })
    } else {
      prepared.push({ source: r.source, values: applyQuantileMap(r.values, map), rawValues: r.values, map })
    }
  }

  const values = consensusBlend(prepared.map((p) => ({
    source: p.source,
    values: p.values,
    rawValues: p.rawValues,
  })), effectiveWeights(ctx.sourcePreference ?? 'EQUAL'))

  // League-shape adjustments run after the blend so every source (and the
  // percentile badges) see the same adjusted frame.
  applyTePremium(values, ctx.tePremium)

  attachPercentiles(values)

  const contributingSources = prepared.map((p) => ({
    provider: p.source.id,
    label: PROVIDER_LABELS[p.source.id],
    playerCount: p.values.size,
    rescale: p.map
      ? {
          kind: 'positional-quantile' as const,
          positions: Object.fromEntries(
            Object.entries(p.map.byPosition).map(([pos, m]) => [pos, {
              sourceCount: m.sourceCount,
              anchorCount: m.anchorCount,
              sourceMin: m.sourceMin,
              sourceMax: m.sourceMax,
              anchorMin: m.anchorMin,
              anchorMax: m.anchorMax,
            }]),
          ),
        }
      : null,
  }))

  // Annotate the attempts list with the rescale outcome so the diagnostic
  // surface tells the full story (which source anchored, how each other
  // source was rescaled).
  if (anchorEntry) {
    for (const a of attempts) {
      const p = prepared.find((q) => q.source.id === a.provider)
      if (!p) continue
      const base = a.message ? `${a.message}; ` : ''
      if (p.source.id === anchorEntry.source.id) {
        a.message = `${base}anchor`
      } else if (p.map) {
        const positions = Object.keys(p.map.byPosition).join(',')
        a.message = `${base}positional-quantile remap (${positions})`
      } else {
        a.message = `${base}rescale skipped (no position met minimum overlap)`
      }
    }
  }

  return {
    provider: 'consensus',
    providerLabel: PROVIDER_LABELS['consensus'],
    fallbackProvider: null,
    fallbackLabel: null,
    values,
    ctx,
    attempts,
    contributingSources,
    anchorProvider: anchorEntry?.source.id ?? null,
  }
}

// ── Percentile annotation ──────────────────────────────────────────────────
//
// Runs after consensus blend. For each player, attaches a "rank-percentile"
// where LOWER = BETTER (the best player at a position is P1, the worst is
// P100). This is the opposite of statistical percentile convention but
// matches how fantasy managers think — "top 1%" is a small number, not a
// large one. UI labels these as "P1", "P12", "P99".
//
// Mutates the values in place — they were freshly built by consensusBlend
// so no external caller holds a reference.
function attachPercentiles(values: Map<string, PlayerValue>): void {
  const all = [...values.values()]
  // Sort descending by value: index 0 = best.
  all.sort((a, b) => b.value - a.value)
  const totalOverall = all.length
  all.forEach((p, i) => {
    // Rank-1 → P1, last → P100. Skip the "would round to 0" edge case so
    // even the top player is at least P1.
    p.percentileOverall = totalOverall > 1
      ? Math.max(1, Math.round(((i + 1) / totalOverall) * 100))
      : 1
  })
  // Per-position ranking.
  const byPos = new Map<string, PlayerValue[]>()
  for (const p of all) {
    const pos = p.position.toUpperCase()
    if (!(ANALYZED_POSITIONS as readonly string[]).includes(pos)) continue
    let arr = byPos.get(pos)
    if (!arr) { arr = []; byPos.set(pos, arr) }
    arr.push(p)
  }
  for (const arr of byPos.values()) {
    arr.sort((a, b) => b.value - a.value)
    const total = arr.length
    arr.forEach((p, i) => {
      p.percentilePosition = total > 1
        ? Math.max(1, Math.round(((i + 1) / total) * 100))
        : 1
    })
  }
}

async function valuateSingle(ctx: LeagueValuationContext, requested: Exclude<ValueProviderId, 'consensus'>): Promise<ValuationResult> {
  const attempts: ProviderAttempt[] = []
  const source = SOURCE_BY_ID[requested]
  let primary: { source: ValueSource; values: Map<string, PlayerValue> } | null = null
  if (source) {
    const r = await tryAttempt(source, ctx)
    attempts.push(r.attempt)
    if (r.values.size > 0) primary = { source, values: r.values }
  }
  // If the requested source returned empty, fall through normal preference
  // order so the page still has data to show.
  if (!primary) {
    for (const src of preferenceOrder(ctx.mode)) {
      if (src.id === requested) continue
      const r = await tryAttempt(src, ctx)
      attempts.push(r.attempt)
      if (r.values.size > 0) { primary = { source: src, values: r.values }; break }
    }
  }
  if (!primary) {
    return {
      provider: 'sleeper-derived',
      providerLabel: PROVIDER_LABELS['sleeper-derived'],
      fallbackProvider: null,
      fallbackLabel: null,
      values: new Map(),
      ctx,
      attempts,
      contributingSources: [],
      anchorProvider: null,
    }
  }
  // Blend Sleeper-derived as a deep-bench floor for single-source results
  // (skipped when Sleeper IS the primary).
  let fallbackProvider: ValueProviderId | null = null
  let fallbackLabel: string | null = null
  if (primary.source.id !== 'sleeper-derived') {
    const fb = await tryAttempt(sleeperValueSource, ctx)
    if (fb.values.size > 0) {
      const added = blendInto(primary.values, fb.values)
      if (added > 0) {
        fallbackProvider = 'sleeper-derived'
        fallbackLabel = PROVIDER_LABELS['sleeper-derived']
        attempts.push({
          provider: 'sleeper-derived',
          label: PROVIDER_LABELS['sleeper-derived'],
          ok: true,
          playerCount: added,
          message: `blended in for ${added} players not in primary`,
        })
      }
    }
  }
  applyTePremium(primary.values, ctx.tePremium)
  return {
    provider: primary.source.id,
    providerLabel: PROVIDER_LABELS[primary.source.id],
    fallbackProvider,
    fallbackLabel,
    values: primary.values,
    ctx,
    attempts,
    contributingSources: [{
      provider: primary.source.id,
      label: PROVIDER_LABELS[primary.source.id],
      playerCount: primary.values.size,
      rescale: null,
    }],
    anchorProvider: null,
  }
}

// Sleeper league.settings.type → our LeagueMode (0=redraft, 1=keeper, 2=dynasty).
// taxi_slots > 0 is a stronger dynasty signal even if `type` is missing.
export function detectMode(args: { type?: number | null; taxiSlots?: number | null }): LeagueMode {
  if ((args.taxiSlots ?? 0) > 0) return 'dynasty'
  if (args.type === 2) return 'dynasty'
  if (args.type === 1) return 'keeper'
  return 'redraft'
}

// Human-readable label. Consensus shows the source count in parentheses;
// single-source shows the provider and any blended fallback.
export function formatValuationLabel(result: ValuationResult): string {
  if (result.provider === 'consensus') {
    const n = result.contributingSources.length
    if (n === 0) return 'Consensus (no sources)'
    if (n === 1) return `Consensus (${result.contributingSources[0].label})`
    return `Consensus (${n} sources)`
  }
  if (result.fallbackLabel) {
    return `${result.providerLabel} + ${result.fallbackLabel.replace('Sleeper search rank', 'Sleeper baseline')}`
  }
  return result.providerLabel
}

// Sources available for a given league mode, used to build the live toggle.
// Includes 'configured' so the UI can disable / dim stub providers.
export type AvailableSource = {
  id: ValueProviderId
  label: string
  configured: boolean
  // Whether this source would actually return data in this mode. KTC dynasty
  // doesn't apply to redraft leagues, for example.
  applicable: boolean
}

export function availableSourcesForMode(mode: LeagueMode): AvailableSource[] {
  const dynastyConfigured = true                   // FantasyCalc always on
  const ktcConfigured = isKtcConfigured()
  const fpConfigured = isFantasyProsConfigured()
  const espnConfigured = isEspnConfigured()

  if (mode === 'redraft') {
    return [
      { id: 'consensus', label: 'Consensus', configured: true, applicable: true },
      { id: 'fantasycalc-redraft', label: PROVIDER_LABELS['fantasycalc-redraft'], configured: dynastyConfigured, applicable: true },
      { id: 'fantasypros-ros', label: PROVIDER_LABELS['fantasypros-ros'], configured: fpConfigured, applicable: true },
      { id: 'espn-ros', label: PROVIDER_LABELS['espn-ros'], configured: espnConfigured, applicable: true },
      { id: 'sleeper-derived', label: PROVIDER_LABELS['sleeper-derived'], configured: true, applicable: true },
    ]
  }
  return [
    { id: 'consensus', label: 'Consensus', configured: true, applicable: true },
    { id: 'fantasycalc-dynasty', label: PROVIDER_LABELS['fantasycalc-dynasty'], configured: dynastyConfigured, applicable: true },
    { id: 'ktc-dynasty', label: PROVIDER_LABELS['ktc-dynasty'], configured: ktcConfigured, applicable: true },
    { id: 'dynastyprocess', label: PROVIDER_LABELS['dynastyprocess'], configured: isDynastyProcessConfigured(), applicable: true },
    { id: 'fantasypros-dynasty', label: PROVIDER_LABELS['fantasypros-dynasty'], configured: fpConfigured, applicable: true },
    { id: 'sleeper-derived', label: PROVIDER_LABELS['sleeper-derived'], configured: true, applicable: true },
  ]
}

// Parse a ValueProviderId out of a URL search param, falling back to
// 'consensus' for any unknown / missing value.
export function parseSourceParam(raw: string | string[] | undefined): ValueProviderId {
  const s = Array.isArray(raw) ? raw[0] : raw
  if (!s) return 'consensus'
  const allIds: ValueProviderId[] = [
    'consensus', 'sleeper-derived',
    'fantasycalc-dynasty', 'fantasycalc-redraft',
    'ktc-dynasty', 'dynastyprocess',
    'fantasypros-dynasty', 'fantasypros-ros', 'espn-ros',
  ]
  return (allIds as string[]).includes(s) ? (s as ValueProviderId) : 'consensus'
}

// Surfaced to the UI so chapter pages can show what's configured.
export function providerConfigStatus() {
  return {
    fantasycalc: true,
    ktc: isKtcConfigured(),
    dynastyprocess: isDynastyProcessConfigured(),
    fantasypros: isFantasyProsConfigured(),
    espn: isEspnConfigured(),
    sleeper: true,
  }
}
