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
import { fantasyProsRosSource, isFantasyProsConfigured } from './fantasypros'
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
  contributingSources: Array<{ provider: ValueProviderId; label: string; playerCount: number }>
}

const PROVIDER_LABELS: Record<ValueProviderId, string> = {
  'consensus': 'Consensus',
  'sleeper-derived': 'Sleeper search rank',
  'fantasycalc-dynasty': 'FantasyCalc · Dynasty',
  'fantasycalc-redraft': 'FantasyCalc · Redraft',
  'ktc-dynasty': 'KeepTradeCut · Dynasty',
  'fantasypros-ros': 'FantasyPros · ROS',
  'espn-ros': 'ESPN · ROS',
}

const SOURCE_BY_ID: Record<Exclude<ValueProviderId, 'consensus'>, ValueSource> = {
  'sleeper-derived': sleeperValueSource,
  'fantasycalc-dynasty': fantasyCalcDynastySource,
  'fantasycalc-redraft': fantasyCalcRedraftSource,
  'ktc-dynasty': ktcDynastySource,
  'fantasypros-ros': fantasyProsRosSource,
  'espn-ros': espnRosSource,
}

// Per-mode source preference (also the consensus pool — everything in this
// list gets blended when the user picks Consensus).
function preferenceOrder(mode: LeagueMode): ValueSource[] {
  switch (mode) {
    case 'dynasty':
    case 'keeper':
      return [ktcDynastySource, fantasyCalcDynastySource, sleeperValueSource]
    case 'redraft':
      return [fantasyProsRosSource, espnRosSource, fantasyCalcRedraftSource, sleeperValueSource]
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

// ── Consensus blending ─────────────────────────────────────────────────────
//
// For each player that appears in ≥1 source, the consensus value is the MEAN
// of the values from sources that have them. Each contributing source's raw
// value is preserved on `contributions[]` so the UI can show the breakdown.
//
// We do NOT downweight singleton coverage (player in 1 source but not 3) —
// the source count is exposed via `sourceCount` so the UI can mark thin
// coverage if desired.
//
// All current sources output on a ~0-10000 scale by design, so simple
// arithmetic mean is honest. If we add a source on a different scale later,
// it should be normalized to the same range inside its own implementation.
function consensusBlend(results: Array<{ source: ValueSource; values: Map<string, PlayerValue> }>): Map<string, PlayerValue> {
  type Slot = { sum: number; count: number; meta: PlayerValue | null; contributions: PlayerValue['contributions'] }
  const slots = new Map<string, Slot>()
  for (const { source, values } of results) {
    for (const [pid, pv] of values) {
      let slot = slots.get(pid)
      if (!slot) {
        slot = { sum: 0, count: 0, meta: null, contributions: [] }
        slots.set(pid, slot)
      }
      slot.sum += pv.value
      slot.count += 1
      // Prefer the meta (name/position/team/age) from the FIRST source that
      // had this player — earlier sources are higher quality.
      if (!slot.meta) slot.meta = pv
      slot.contributions!.push({ provider: source.id, label: PROVIDER_LABELS[source.id], value: pv.value })
    }
  }
  const out = new Map<string, PlayerValue>()
  for (const [pid, slot] of slots) {
    if (!slot.meta) continue
    out.set(pid, {
      ...slot.meta,
      value: Math.round(slot.sum / slot.count),
      source: 'consensus',
      sourceCount: slot.count,
      contributions: slot.contributions,
    })
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
  const values = consensusBlend(nonEmpty)
  const contributingSources = nonEmpty.map((r) => ({
    provider: r.source.id,
    label: PROVIDER_LABELS[r.source.id],
    playerCount: r.values.size,
  }))
  return {
    provider: 'consensus',
    providerLabel: PROVIDER_LABELS['consensus'],
    fallbackProvider: null,
    fallbackLabel: null,
    values,
    ctx,
    attempts,
    contributingSources,
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
  return {
    provider: primary.source.id,
    providerLabel: PROVIDER_LABELS[primary.source.id],
    fallbackProvider,
    fallbackLabel,
    values: primary.values,
    ctx,
    attempts,
    contributingSources: [{ provider: primary.source.id, label: PROVIDER_LABELS[primary.source.id], playerCount: primary.values.size }],
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
    'ktc-dynasty', 'fantasypros-ros', 'espn-ros',
  ]
  return (allIds as string[]).includes(s) ? (s as ValueProviderId) : 'consensus'
}

// Surfaced to the UI so chapter pages can show what's configured.
export function providerConfigStatus() {
  return {
    fantasycalc: true,
    ktc: isKtcConfigured(),
    fantasypros: isFantasyProsConfigured(),
    espn: isEspnConfigured(),
    sleeper: true,
  }
}
