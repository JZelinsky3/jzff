// FantasyPros ValueSource — Phase 4 stub.
//
// FantasyPros' rankings sit behind their API key gate. We scaffold the
// source so plugging in the real fetch is a single function body. Until
// FP_API_KEY is set in the env, this returns an empty map and the
// orchestrator falls through to the next source.
//
// Two real options when ready:
//   1. Set FP_API_KEY to a paid API plan key (cleanest).
//   2. Point FP_RANKINGS_URL at a self-hosted scraper output. Same shape
//      contract as the KTC source — array of { name, position, value }.
//
// Player ID matching uses the same name-normalization pass the KTC source
// uses (FP doesn't publish Sleeper IDs).

import type { LeagueValuationContext, PlayerValue, ValueSource } from './types'

export function isFantasyProsConfigured(): boolean {
  return Boolean(process.env.FP_API_KEY?.trim() || process.env.FP_RANKINGS_URL?.trim())
}

export const fantasyProsRosSource: ValueSource = {
  id: 'fantasypros-ros',
  async valueAll(_ctx: LeagueValuationContext): Promise<Map<string, PlayerValue>> {
    void _ctx
    // Stub: real impl would mirror the KTC source — fetch, parse, normalize
    // names, look up Sleeper IDs, emit PlayerValue rows.
    return new Map()
  },
}
