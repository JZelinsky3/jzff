// GET /api/leagues/[id]/trade-desk/mocks
//
// The Rumor Mill's data endpoint. Fully autonomous: the first request of
// each ISO week generates 3–5 mock trades for the league (seeded by the
// week key so regeneration is deterministic), writes them to
// trade_desk_mock_trades, and every later request that week reads the
// stored row back. No cron required — a league nobody visits generates
// nothing, which is exactly the right amount of work.
//
// Uniqueness across weeks: every published trade's player-id hash is
// stored on the row; generation excludes all hashes from the trailing
// 10 weeks so the Mill never reruns a deal it already printed.
//
// Groq writes the headline + blurb for each mock in one JSON call.
// Failures fall back to the deterministic copy baked into the engine so
// the page always renders.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadAnalyzerData } from '@/lib/tradeDesk/analyzer'
import { getDeadlineStatus } from '@/lib/tradeDesk/deadline'
import { generateMockTrades, type MockTrade } from '@/lib/tradeDesk/finder'
import { valuateLeague } from '@/lib/values'
import { groqChatJson, GroqError } from '@/lib/groq'
import { sleeper } from '@/lib/platforms/sleeper'
import { computePositionRanks } from '@/lib/positionRanks'
import { DEFAULT_PPR_SCORING } from '@/lib/scoring'

// Roster fetch + valuation + ~1.4k bounded depth sims + one Groq call.
export const maxDuration = 60

// ISO-8601 week key, UTC. Thursday-anchored per the standard so the key
// flips on Monday — a fresh column lands at the top of every week.
function isoWeekKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

type MocksPayload = {
  weekKey: string
  generatedAt: string
  leagueName: string
  // Season the rosters came from (e.g. '2025'). Differs from the current
  // year when the offseason fallback served last season's final rosters —
  // the Analyzer handoff passes it as ?year= so the player chips fill in.
  season?: string
  trades: MockTrade[]
  narrativeSource: 'ai' | 'fallback'
  // Trade deadline has passed for this season — no column gets printed.
  deskClosed?: true
  deadlineWeek?: number | null
}

// Sign/Shred tallies live in their own table (they keep moving after the
// column is stored), so reads stitch them in at response time.
async function withVotes(
  db: ReturnType<typeof createAdminClient>,
  leagueId: string,
  payload: MocksPayload,
) {
  const { data: rows } = await db
    .from('trade_desk_mock_votes')
    .select('trade_hash, sign_count, shred_count')
    .eq('league_id', leagueId)
    .eq('week_key', payload.weekKey)
  const votes: Record<string, { sign: number; shred: number }> = {}
  for (const r of rows ?? []) {
    votes[r.trade_hash] = { sign: r.sign_count, shred: r.shred_count }
  }
  return { ...payload, votes }
}

// Stamp position rank on every CandidatePlayer in a slate. Used by both
// the fresh-generation and cache-hit paths so old cached payloads still
// pick up rank pills retroactively. PPR scoring is the default — per-
// league scoring translation is a follow-up.
//   • In-season → cumulative rank through the current NFL week.
//   • Offseason → previous season's FINAL (Wk 18) rank, so the slate
//     still reads with meaningful context.
async function stampPositionRanks(trades: MockTrade[]): Promise<void> {
  try {
    const clock = await sleeper.state()
    if (!clock) return
    const inSeason = clock.season_type === 'regular' || clock.season_type === 'post'
    const rankSeason = inSeason ? Number(clock.season) : Number(clock.season) - 1
    const rankWeek = inSeason ? (Number(clock.week) || 17) : 18
    if (!rankSeason || rankWeek < 1) return
    const ranks = await computePositionRanks({
      season: rankSeason,
      throughWeek: rankWeek,
      scoring: DEFAULT_PPR_SCORING,
    })
    const annotate = (p: { id: string; rank?: string | null }) => {
      const r = ranks.get(p.id)
      if (r) p.rank = r
    }
    for (const t of trades) {
      t.teamA.sends.forEach(annotate)
      t.teamB.sends.forEach(annotate)
    }
  } catch {
    // Ranks are decorative — fall through if stats fetch hiccups.
  }
}

// ── Groq copy pass ───────────────────────────────────────────────────────

const BlurbsOut = z.object({
  trades: z.array(z.object({
    headline: z.string().min(1),
    blurb: z.string().min(1),
  })),
})

function fmtMovements(m: MockTrade['teamA']['movements']): string {
  if (m.length === 0) return 'no rank movement'
  return m.map((x) => `${x.position} ${x.before}→${x.after}`).join(', ')
}

async function writeBlurbs(leagueName: string, mode: string, trades: MockTrade[]): Promise<MockTrade[] | null> {
  const apiKey = process.env.GROQ_API_KEY_TRADES || process.env.GROQ_API_KEY
  if (!apiKey) return null

  const system = [
    'You are the rumor columnist for The Sunday Chronicle, a fantasy football league paper. Each week you publish "The Rumor Mill" — a column of MOCK trades the desk cooked up for league members to argue about. These trades have NOT happened; they are proposals invented by the value engine.',
    '',
    `League mode: ${mode}.`,
    '',
    'For each trade you receive, write:',
    '  • headline — a punchy tabloid-style header, 4–9 words. Vary the construction across trades (question, declaration, tease). Use player or team names. Do not put quotation marks inside the headline text.',
    '  • blurb — 2–3 sentences selling WHY the desk mocked this deal: who patches what hole, who is buying a window, what the risk is. Reference the starter-value gains and rank movements you are given. Playful but sharp; never neutral filler.',
    '',
    'BANNED: "win-win", "no-brainer", "blockbuster alert", "look no further", restating the player lists without analysis.',
    '',
    'OUTPUT strict, valid JSON only — every key and string value double-quoted: { "trades": [ { "headline": "...", "blurb": "..." }, ... ] } — exactly one entry per trade, same order as given.',
  ].join('\n')

  const user = trades.map((t, i) => [
    `Trade ${i + 1} [${t.tag}]:`,
    `  ${t.teamA.name} sends: ${t.teamA.sends.map((p) => `${p.name} (${p.position ?? '?'} · ${Math.round(p.value)})`).join(', ')}`,
    `  ${t.teamB.name} sends: ${t.teamB.sends.map((p) => `${p.name} (${p.position ?? '?'} · ${Math.round(p.value)})`).join(', ')}`,
    `  ${t.teamA.name} starter-value ${t.teamA.gain >= 0 ? 'gain' : 'loss'}: ${Math.round(t.teamA.gain)} (${(t.teamA.gainPct * 100).toFixed(1)}%) · ${fmtMovements(t.teamA.movements)}`,
    `  ${t.teamB.name} starter-value ${t.teamB.gain >= 0 ? 'gain' : 'loss'}: ${Math.round(t.teamB.gain)} (${(t.teamB.gainPct * 100).toFixed(1)}%) · ${fmtMovements(t.teamB.movements)}`,
  ].join('\n')).join('\n\n')

  try {
    const result = await groqChatJson<z.infer<typeof BlurbsOut>>({
      apiKey,
      model: process.env.GROQ_MODEL_TRADE ?? 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `League: ${leagueName}\n\n${user}` },
      ],
      temperature: 0.8,
      maxTokens: 1600,
    })
    const parsed = BlurbsOut.safeParse(result.data)
    if (!parsed.success || parsed.data.trades.length !== trades.length) return null
    return trades.map((t, i) => ({
      ...t,
      headline: parsed.data.trades[i].headline,
      blurb: parsed.data.trades[i].blurb,
    }))
  } catch (e) {
    if (e instanceof GroqError) return null
    return null
  }
}

// ── Route handler ────────────────────────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const db = createAdminClient()

  // ── DEV ONLY — remove before release ──────────────────────────────────
  // ?reroll=1 regenerates THIS week's column with a fresh seed, wipes the
  // week's vote tallies, and stores the new slate. Lets us test new mocks
  // (including voting on them — the column persists, so hashes validate)
  // without waiting for the ISO week to flip. The exclusion list already
  // contains the outgoing column's hashes, so a reroll always prints
  // different deals.
  const reroll = new URL(req.url).searchParams.get('reroll') === '1'
  // ── end DEV ONLY ──────────────────────────────────────────────────────

  const weekKey = isoWeekKey()

  // Fast path: this week's column already exists. A stored EMPTY column
  // doesn't count — that's what a transient roster/value hiccup leaves
  // behind, and regenerating is bounded work, so let it retry.
  // (Rerolls skip straight to generation — DEV ONLY.)
  if (!reroll) {
    const { data: existing } = await db
      .from('trade_desk_mock_trades')
      .select('payload')
      .eq('league_id', id)
      .eq('week_key', weekKey)
      .maybeSingle<{ payload: MocksPayload }>()
    if (existing?.payload && existing.payload.trades.length > 0) {
      // Re-stamp ranks on cached payloads — older rows were generated
      // before the rank pipeline existed and have empty rank fields.
      // The stamp is a single Sleeper stats fetch (cached for an hour),
      // so doing it per request is cheap.
      await stampPositionRanks(existing.payload.trades)
      return NextResponse.json(await withVotes(db, id, existing.payload), {
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    // Deadline check — once trades can't happen this season, the Mill
    // prints a closed notice instead of mocking deals nobody can make.
    // Simulated slates skip this (they're a test tool).
    const deadline = await getDeadlineStatus(id)
    if (deadline.known && deadline.closed) {
      const { data: league } = await db
        .from('leagues')
        .select('name')
        .eq('id', id)
        .maybeSingle<{ name: string }>()
      const closedPayload: MocksPayload = {
        weekKey,
        generatedAt: new Date().toISOString(),
        leagueName: league?.name ?? '',
        trades: [],
        narrativeSource: 'fallback',
        deskClosed: true,
        deadlineWeek: deadline.deadlineWeek ?? null,
      }
      return NextResponse.json(closedPayload, {
        headers: { 'Cache-Control': 'no-store' },
      })
    }
  }

  // Generate. Load rosters + values exactly like the Analyzer does.
  let load = await loadAnalyzerData(id, { lookupBy: 'id' })

  // Redraft leagues roll over with EMPTY rosters until the new draft, so
  // an offseason visit would find nothing to mock. Fall back to the
  // previous season's final rosters — same data the Analyzer's year
  // picker serves. Dynasty/keeper rosters persist, so this never fires
  // for them in practice.
  if (load.ok && load.data.rosters.every((r) => r.playerIds.length === 0)) {
    const prevYear = Number(load.data.season) - 1
    if (Number.isFinite(prevYear)) {
      const prev = await loadAnalyzerData(id, { lookupBy: 'id', year: prevYear })
      if (prev.ok && prev.data.rosters.some((r) => r.playerIds.length > 0)) {
        load = prev
      }
    }
  }

  if (!load.ok) {
    const err = load.error
    const status =
      err.kind === 'not-found' ? 404 :
      err.kind === 'sleeper-failed' || err.kind === 'espn-failed' ||
      err.kind === 'nfl-failed' || err.kind === 'yahoo-failed' ? 502 : 409
    return NextResponse.json({ error: err.kind }, { status })
  }
  const data = load.data

  let valuation: Awaited<ReturnType<typeof valuateLeague>>
  try {
    valuation = await valuateLeague({
      mode: data.effective.mode,
      qbStarters: data.effective.qbStarters,
      teamCount: data.effective.teamCount,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'valuation failed', message: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }

  // Never reprint a deal from the trailing 10 weeks.
  const excludeHashes = new Set<string>()
  const { data: pastRows } = await db
    .from('trade_desk_mock_trades')
    .select('trade_hashes')
    .eq('league_id', id)
    .order('created_at', { ascending: false })
    .limit(10)
  for (const r of pastRows ?? []) {
    for (const h of (r.trade_hashes as string[]) ?? []) excludeHashes.add(h)
  }

  let trades = generateMockTrades({
    data,
    values: valuation.values,
    // Reroll salts the seed so the regenerated column differs — DEV ONLY.
    seedKey: `${id}|${weekKey}${reroll ? '|r' + Date.now() : ''}`,
    excludeHashes,
  })

  await stampPositionRanks(trades)

  let narrativeSource: MocksPayload['narrativeSource'] = 'fallback'
  if (trades.length > 0) {
    const withBlurbs = await writeBlurbs(data.leagueName, data.effective.mode, trades)
    if (withBlurbs) {
      trades = withBlurbs
      narrativeSource = 'ai'
    }
  }

  const payload: MocksPayload = {
    weekKey,
    generatedAt: new Date().toISOString(),
    leagueName: data.leagueName,
    season: data.season,
    trades,
    narrativeSource,
  }

  // ── DEV ONLY — remove before release ──────────────────────────────────
  // A reroll replaces the column, so the outgoing slate's tallies go too.
  if (reroll) {
    await db
      .from('trade_desk_mock_votes')
      .delete()
      .eq('league_id', id)
      .eq('week_key', weekKey)
  }
  // ── end DEV ONLY ──────────────────────────────────────────────────────

  // Publish. Upsert (not insert) because the fast path lets a stored
  // EMPTY column through for regeneration — the fresh column replaces it.
  // Two overlapping first-of-the-week requests both upsert, but the
  // seeded PRNG means they generated identical trades; only the Groq
  // copy could differ, and last-write-wins settles that. Failures (e.g.
  // migration not applied yet) still serve the generated column — it
  // just won't persist.
  await db
    .from('trade_desk_mock_trades')
    .upsert(
      {
        league_id: id,
        week_key: weekKey,
        payload,
        trade_hashes: trades.map((t) => t.hash),
      },
      { onConflict: 'league_id,week_key' },
    )

  return NextResponse.json(await withVotes(db, id, payload), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
