// Value engine orchestrator.
//
// Tries each league mode's preferred ValueSource in order, takes the first
// one that returns players, then BLENDS Sleeper-derived values in for any
// player the primary source doesn't cover (deep bench, rookies KTC hasn't
// graded, etc.). The result: nobody on a roster shows as $0 unless they're
// genuinely inactive everywhere.

import { sleeperValueSource } from './sleeper'
import { fantasyCalcDynastySource, fantasyCalcRedraftSource } from './fantasycalc'
import { ktcDynastySource, isKtcConfigured } from './ktc'
import { fantasyProsRosSource, isFantasyProsConfigured } from './fantasypros'
import { espnRosSource, isEspnConfigured } from './espn'
import type { LeagueMode, LeagueValuationContext, PlayerValue, ProviderAttempt, ValueProviderId, ValueSource } from './types'

export type { LeagueMode, LeagueValuationContext, PlayerValue, ProviderAttempt, ValueProviderId } from './types'

export type ValuationResult = {
  // The provider that produced the PRIMARY values. If we fell back through
  // empty sources to Sleeper-derived, this reflects what actually populated
  // the map.
  provider: ValueProviderId
  providerLabel: string
  // Same as `provider` unless we BLENDED a fallback over the top — in that
  // case the fallback id sits here.
  fallbackProvider: ValueProviderId | null
  fallbackLabel: string | null
  values: Map<string, PlayerValue>
  ctx: LeagueValuationContext
  // Diagnostic trail: every provider tried, in order, with hit counts.
  attempts: ProviderAttempt[]
}

const PROVIDER_LABELS: Record<ValueProviderId, string> = {
  'sleeper-derived': 'Sleeper search rank',
  'fantasycalc-dynasty': 'FantasyCalc · Dynasty',
  'fantasycalc-redraft': 'FantasyCalc · Redraft',
  'ktc-dynasty': 'KeepTradeCut · Dynasty',
  'fantasypros-ros': 'FantasyPros · ROS',
  'espn-ros': 'ESPN · ROS',
}

// Provider preference per league mode. Higher-quality / mode-specific sources
// first; Sleeper-derived is the floor that always succeeds.
function preferenceOrder(mode: LeagueMode): ValueSource[] {
  switch (mode) {
    case 'dynasty':
      return [ktcDynastySource, fantasyCalcDynastySource, sleeperValueSource]
    case 'keeper':
      // Treat keeper closer to dynasty — long-term value still matters.
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

// Merge `fallback` values into `primary` for any playerId primary is missing.
// Players already in primary keep their primary value (provider precedence).
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

export async function valuateLeague(ctx: LeagueValuationContext): Promise<ValuationResult> {
  const sources = preferenceOrder(ctx.mode)
  const attempts: ProviderAttempt[] = []

  let primarySource: ValueSource | null = null
  let primaryValues: Map<string, PlayerValue> = new Map()
  for (const src of sources) {
    const r = await tryAttempt(src, ctx)
    attempts.push(r.attempt)
    if (r.values.size > 0) {
      primarySource = src
      primaryValues = r.values
      break
    }
  }
  // If even Sleeper-derived was empty (shouldn't happen in practice), fall
  // through with an empty map — Trade Desk / Scout already show graceful
  // empty states.
  if (!primarySource) {
    return {
      provider: 'sleeper-derived',
      providerLabel: PROVIDER_LABELS['sleeper-derived'],
      fallbackProvider: null,
      fallbackLabel: null,
      values: new Map(),
      ctx,
      attempts,
    }
  }

  // Blend Sleeper-derived as a fallback so deep-bench players who aren't in
  // KTC/FC still get a baseline value. Skip the blend when Sleeper-derived
  // IS the primary (no point doubling up).
  let fallbackProvider: ValueProviderId | null = null
  let fallbackLabel: string | null = null
  if (primarySource.id !== 'sleeper-derived') {
    const fb = await tryAttempt(sleeperValueSource, ctx)
    if (fb.values.size > 0) {
      const added = blendInto(primaryValues, fb.values)
      if (added > 0) {
        fallbackProvider = 'sleeper-derived'
        fallbackLabel = PROVIDER_LABELS['sleeper-derived']
        // Record the blend as an extra attempt for transparency.
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
    provider: primarySource.id,
    providerLabel: PROVIDER_LABELS[primarySource.id],
    fallbackProvider,
    fallbackLabel,
    values: primaryValues,
    ctx,
    attempts,
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

// Human-readable label for a valuation result. If a fallback was blended,
// surface that so users understand they're seeing a mixed signal (e.g.
// "FantasyCalc · Dynasty + Sleeper baseline").
export function formatValuationLabel(result: ValuationResult): string {
  if (result.fallbackLabel) {
    return `${result.providerLabel} + ${result.fallbackLabel.replace('Sleeper search rank', 'Sleeper baseline')}`
  }
  return result.providerLabel
}

// Surfaced to the UI so chapter pages can show what's configured.
export function providerConfigStatus() {
  return {
    fantasycalc: true,               // always on (public API)
    ktc: isKtcConfigured(),
    fantasypros: isFantasyProsConfigured(),
    espn: isEspnConfigured(),
    sleeper: true,                   // always on (baseline)
  }
}
