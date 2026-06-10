// Trade Desk Settings — Phase 2 of the Trade Desk build.
//
// Stored as JSONB on leagues.trade_desk_settings. The shape is intentionally
// override-only: every field is nullable, and a null/undefined value means
// "use the engine's auto-detected fallback." That keeps the column small,
// lets commishes touch only what they care about, and avoids drift when the
// auto-detect logic improves.
//
// Validation lives here (Zod) so both the GET fallback path and the POST
// write path apply the same rules. The drawer's editable form (in
// /pams-template/assets/js/trade-desk-settings.js) is the only intended
// writer, but anything posting to the API is held to the same shape.

import { z } from 'zod'
import type { LeagueMode } from '@/lib/values'

// ── The override shape ────────────────────────────────────────────────────
//
// Every key is OPTIONAL because every key is overrideable independently.
// Roster slot counts use a record so we can add new slot types later
// (e.g. WRT, DST) without bumping the column shape.

export const RosterSlotsSchema = z.object({
  QB:    z.number().int().min(0).max(8).optional(),
  RB:    z.number().int().min(0).max(8).optional(),
  WR:    z.number().int().min(0).max(8).optional(),
  TE:    z.number().int().min(0).max(8).optional(),
  FLEX:  z.number().int().min(0).max(6).optional(),
  SF:    z.number().int().min(0).max(4).optional(),
  K:     z.number().int().min(0).max(4).optional(),
  DEF:   z.number().int().min(0).max(4).optional(),
  BENCH: z.number().int().min(0).max(40).optional(),
  IR:    z.number().int().min(0).max(20).optional(),
  TAXI:  z.number().int().min(0).max(20).optional(),
}).partial()
export type RosterSlots = z.infer<typeof RosterSlotsSchema>

export const TradeDeskSettingsSchema = z.object({
  // Override the auto-detected dynasty/redraft/keeper classification.
  modeOverride:
    z.enum(['dynasty', 'redraft', 'keeper']).nullable().optional(),

  // Override the 1QB vs Superflex classification (auto-detected from
  // roster_positions on Sleeper; not detectable on ESPN/Yahoo today).
  lineupType:
    z.enum(['1QB', 'SUPERFLEX']).nullable().optional(),

  // PPR variant. Sleeper exposes the exact rec value but we expose this
  // as a friendly enum because FantasyCalc's API only accepts 0/0.5/1.
  scoringProfile:
    z.enum(['STANDARD', 'HALF', 'PPR']).nullable().optional(),

  // TE Premium multiplier. None / Mild (+0.5) / Full (+1.0). Used by the
  // Analyzer's value adjustment step in Phase 3.
  tePremium:
    z.enum(['NONE', 'MILD', 'FULL']).nullable().optional(),

  // Number of teams. Almost always auto-detected correctly; this exists
  // so commishes can correct it for leagues whose total_rosters is stale
  // (mid-expansion / contraction seasons).
  teamCount:
    z.number().int().min(4).max(32).nullable().optional(),

  // Per-position starter slot overrides. Auto-detection works for
  // Sleeper; ESPN/Yahoo commishes may need to fill these in.
  rosterSlots: RosterSlotsSchema.nullable().optional(),

  // Which value source should the Analyzer weight more heavily.
  // 'EQUAL' is the default consensus blend; FC and DP weighted shift
  // toward 75/25 on whichever side the commish prefers.
  valueSourcePreference:
    z.enum(['EQUAL', 'FC_WEIGHTED', 'DP_WEIGHTED']).nullable().optional(),

  // Trade deadline week. Auto-detected from Sleeper (settings.trade_deadline);
  // the other platforms don't expose it, so this override is the only way
  // ESPN / NFL.com / Yahoo leagues get deadline awareness on the desk.
  // null = auto-detect, 0 = league has no deadline, 1–18 = that NFL week.
  tradeDeadlineWeek:
    z.number().int().min(0).max(18).nullable().optional(),

  // Provenance — set automatically by the POST route so the drawer can
  // show "Last confirmed by X on Y" and the first-load nudge knows to
  // dismiss itself.
  confirmedAt: z.string().datetime().nullable().optional(),
  confirmedBy: z.string().uuid().nullable().optional(),
}).strict()

export type TradeDeskSettings = z.infer<typeof TradeDeskSettingsSchema>

// ── Defaults + parsing ────────────────────────────────────────────────────
//
// EMPTY_SETTINGS is what a brand-new league sees in the drawer: every
// override unset, no confirmation timestamp. The drawer should render this
// the same as a NULL column value — there is nothing to "edit" yet, only
// to fill in.

export const EMPTY_SETTINGS: TradeDeskSettings = {
  modeOverride: null,
  lineupType: null,
  scoringProfile: null,
  tePremium: null,
  teamCount: null,
  rosterSlots: null,
  valueSourcePreference: null,
  tradeDeadlineWeek: null,
  confirmedAt: null,
  confirmedBy: null,
}

// Tolerant parser used when reading the JSONB column back. Anything that
// can't be coerced into a valid TradeDeskSettings falls back to
// EMPTY_SETTINGS rather than throwing, so a malformed row doesn't 500
// the drawer.
export function parseSettings(raw: unknown): TradeDeskSettings {
  if (raw == null) return EMPTY_SETTINGS
  const result = TradeDeskSettingsSchema.safeParse(raw)
  if (!result.success) return EMPTY_SETTINGS
  return { ...EMPTY_SETTINGS, ...result.data }
}

// Strict parser used on the POST path. Throws (well, returns the Zod
// error) on invalid input so the route handler can surface it as a 400.
export function validateSettingsForWrite(raw: unknown):
  | { ok: true; value: Omit<TradeDeskSettings, 'confirmedAt' | 'confirmedBy'> }
  | { ok: false; error: string } {
  // The client should never send provenance fields — those are stamped
  // server-side. Strip them before validation to avoid spoofing.
  if (raw && typeof raw === 'object') {
    const stripped = { ...(raw as Record<string, unknown>) }
    delete stripped.confirmedAt
    delete stripped.confirmedBy
    raw = stripped
  }
  const result = TradeDeskSettingsSchema.safeParse(raw)
  if (!result.success) {
    return { ok: false, error: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }
  }
  // Drop the provenance fields from the returned value too — they belong
  // to the route's write step, not the caller's payload.
  const { confirmedAt: _ca, confirmedBy: _cb, ...rest } = result.data
  return { ok: true, value: rest }
}

// ── Auto-detect context (Phase 2 stub) ────────────────────────────────────
//
// What the engine would auto-detect for a league if there were no
// overrides. Right now we expose only what TSC already has cheap access
// to via the existing tradeFloor / sleeper paths. The Analyzer in
// Phase 3 will call this and then layer overrides on top via
// `mergeEffective`.
//
// For Phase 2 the drawer doesn't actually read this — it shows the
// overrides only, with "leave blank to auto-detect" hints. Wiring this
// into the drawer is a Phase 3 nice-to-have.

export type AutoDetected = {
  mode: LeagueMode | null
  lineupType: '1QB' | 'SUPERFLEX' | null
  teamCount: number | null
  // Friendly aliases for the engine's qbStarters concept (1 or 2). Null
  // when the platform doesn't expose roster_positions (ESPN / Yahoo).
  qbStarters: 1 | 2 | null
}

export const EMPTY_AUTODETECT: AutoDetected = {
  mode: null,
  lineupType: null,
  teamCount: null,
  qbStarters: null,
}

// ── The merge (consumed by Phase 3 Analyzer) ──────────────────────────────
//
// Override wins where defined; auto-detect fills in the rest. Falls back
// to safe defaults (1QB redraft) if both are null so the caller never has
// to deal with null modes.

export type EffectiveSettings = {
  mode: LeagueMode
  lineupType: '1QB' | 'SUPERFLEX'
  qbStarters: 1 | 2
  teamCount: number
  scoringProfile: 'STANDARD' | 'HALF' | 'PPR'
  tePremium: 'NONE' | 'MILD' | 'FULL'
  rosterSlots: RosterSlots
  valueSourcePreference: 'EQUAL' | 'FC_WEIGHTED' | 'DP_WEIGHTED'
}

export function mergeEffective(
  overrides: TradeDeskSettings,
  detected: AutoDetected,
): EffectiveSettings {
  const lineupType = overrides.lineupType ?? detected.lineupType ?? '1QB'
  return {
    mode: overrides.modeOverride ?? detected.mode ?? 'redraft',
    lineupType,
    qbStarters: lineupType === 'SUPERFLEX' ? 2 : (detected.qbStarters ?? 1),
    teamCount: overrides.teamCount ?? detected.teamCount ?? 12,
    scoringProfile: overrides.scoringProfile ?? 'PPR',
    tePremium: overrides.tePremium ?? 'NONE',
    rosterSlots: overrides.rosterSlots ?? {},
    valueSourcePreference: overrides.valueSourcePreference ?? 'EQUAL',
  }
}
