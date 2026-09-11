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
import { groqChatJson, GroqError, DEFAULT_GROQ_MODEL } from '@/lib/groq'
import { sleeper } from '@/lib/platforms/sleeper'
import { buildCurrentRanks } from '@/lib/positionRanks'
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
  // Internal cache + vote key ("2026-W37"), an ISO CALENDAR week. Never
  // render this: ISO week 37 is NFL week 1, and printing it on the column
  // made the Mill look like it was stuck in a nonexistent week 37.
  weekKey: string
  // NFL week the column belongs to, for the dateline. Null in the
  // offseason or when Sleeper's clock can't be read.
  nflWeek?: number | null
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
// buildCurrentRanks picks the source: season-to-date stats once week 1 is
// in the books, the consensus draft board before that. Ranking off a
// partial week 1 made these chips contradict the value printed beside
// them.
// Current NFL week for the column's dateline. Null out of season, so the
// stamp falls back to the date rather than printing a week that isn't
// being played.
async function currentNflWeek(): Promise<number | null> {
  try {
    const clock = await sleeper.state()
    if (!clock) return null
    const inSeason = clock.season_type === 'regular' || clock.season_type === 'post'
    if (!inSeason) return null
    const wk = Number(clock.week)
    return Number.isFinite(wk) && wk > 0 ? wk : null
  } catch {
    return null
  }
}

async function stampPositionRanks(
  trades: MockTrade[],
  effective?: { scoringProfile?: string; qbStarters?: number },
): Promise<void> {
  try {
    const ranks = await buildCurrentRanks({
      scoring: DEFAULT_PPR_SCORING,
      draftScoring: effective?.scoringProfile === 'HALF' ? 'half' : 'ppr',
      qbStarters: effective?.qbStarters ?? 1,
    })
    if (ranks.size === 0) return
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

  const redraft = mode === 'redraft'
  const system = [
    'You are the rumor columnist for The Sunday Chronicle, a fantasy football league paper. Each week you publish "The Rumor Mill", a column of MOCK trades the desk cooked up for league members to argue about. These trades have NOT happened; they are proposals invented by the value engine.',
    '',
    `League mode: ${mode}.`,
    redraft
      ? 'REDRAFT. This league lasts ONE season and resets completely afterward, so next year does not exist here. Age, youth, upside beyond this season, draft capital, "years of control", rebuilding and contention windows are all MEANINGLESS and must never appear. Every manager is trying to make the playoffs this season, every season, so nobody is a buyer, a seller, or tanking. Do not say a player is young, old, ascending or declining; the only question is who scores more points between now and the end of this season.'
      : 'DYNASTY/KEEPER. Rosters carry across seasons, so age, long-term upside, draft picks and a manager\'s timeline are all fair game and worth naming when the deal turns on them.',
    '',
    'NEVER WRITE THE NEGATIVE SPACE, AND NEVER EXPLAIN THE LEAGUE TO THE LEAGUE. The rules above are guidance for YOU. The reader is a manager in this league and has not seen them. When a factor does not apply, leave it out silently: never write that something is irrelevant, does not matter, or is a non-factor, and never write "in a redraft league", "in this format" or "since rosters reset". Write only what he could not already know.',
    '',
    'For each trade you receive, write:',
    '  • headline, a punchy tabloid-style header, 4–9 words. Vary the construction across trades (question, declaration, tease). Use player or team names. Do not put quotation marks inside the headline text.',
    '  • blurb, 2–3 sentences selling WHY the desk mocked this deal: who patches what hole, who is buying a window, what the risk is. Reference the starter-value gains and rank movements you are given. Playful but sharp; never neutral filler.',
    '',
    'RANKS AND TIERS ARE GIVEN, NOT GUESSED. Every player is listed with his consensus position rank (WR2 = the 2nd-most-valuable WR on the market) and his market value. A LOWER rank number and a HIGHER value mean the BETTER player, always. Tier language must follow those numbers: ranks 1-12 at a position are elite starters, 13-24 are solid starters, 25-48 are filler, 49+ are depth. Never call a player "mid-tier" or "a downgrade" when the player he is being compared to ranks below him. If the two sides swap players at the same position, the better-ranked one is the better piece, and the side receiving him is the side getting the upgrade.',
    '',
    'DIRECTION. Each trade below spells out, for BOTH teams, what they GIVE UP and what they RECEIVE. Read the right line: a player on a team\'s GIVES UP list is leaving that roster and is already on it today; a player on its RECEIVES list is arriving from the other team.',
    '• THE HEADLINE IS THE EASIEST ONE TO GET BACKWARDS. "Nacua heads to the Predators" is only true if Nacua is on the Predators\' RECEIVES line. If he is on their GIVES UP line he is ALREADY THEIRS and he is leaving. Before writing any headline of the form "<player> to <team>", check that the player appears on that team\'s RECEIVES list.',
    '• "Flips", "ships", "sends", "moves on from", "gives up", "deals away" and "parts with" describe a player LEAVING, so they only apply to that team\'s GIVES UP list. "Lands", "adds", "acquires", "gets" and "comes away with" describe one ARRIVING, so they only apply to its RECEIVES list.',
    '',
    'PLAIN VERBS. Use lands, adds, gets, acquires, sends, gives up. Do NOT reach for showy synonyms: "snaps up", "scoops up", "snags", "nabs", "snares", "poaches", "swipes", "reels in", "hauls in", "pries away", "plucks", "swoops for" and "inks" are all banned. If a reader has to stop and work out what a verb means, it was the wrong verb.',
    '',
    'NAME A RANK ONCE. A player leaving one team is arriving at the other; the lists already say that, so cite a position rank at most once per player and refer to him in words the second time ("the receiver they gave up"). Name an exact rank only for a player who will actually start: past roughly the top 24 at a position, say what his role is instead of printing a number nobody needs.',
    '',
    'BANNED: "win-win", "no-brainer", "blockbuster alert", "look no further", restating the player lists without analysis, and the em dash character (use commas, periods, or parentheses instead).',
    '',
    'OUTPUT: strict, valid JSON only, every key and string value double-quoted: { "trades": [ { "headline": "...", "blurb": "..." }, ... ] }, exactly one entry per trade, same order as given.',
  ].join('\n')

  // Position rank goes in the prompt, not just on the chip. The column kept
  // calling a WR2 a "mid-tier" piece next to a WR3 because the model only
  // ever saw a raw value number and invented the tier language around it.
  const fmtPlayer = (p: { name: string; position?: string | null; value: number; rank?: string | null }) =>
    `${p.name} (${p.rank ? `${p.rank}, ` : ''}${p.position ?? '?'} · value ${Math.round(p.value)})`

  // Both directions are spelled out per team. The prompt used to list only
  // what each side SENDS and left the model to work out that A's sends are
  // B's arrivals, which it regularly got backwards: one headline announced
  // a player "heads to" the team he was actually leaving.
  const user = trades.map((t, i) => [
    `Trade ${i + 1} [${t.tag}]:`,
    `  ${t.teamA.name} GIVES UP: ${t.teamA.sends.map(fmtPlayer).join(', ')}`,
    `  ${t.teamA.name} RECEIVES: ${t.teamB.sends.map(fmtPlayer).join(', ')}`,
    `  ${t.teamB.name} GIVES UP: ${t.teamB.sends.map(fmtPlayer).join(', ')}`,
    `  ${t.teamB.name} RECEIVES: ${t.teamA.sends.map(fmtPlayer).join(', ')}`,
    `  ${t.teamA.name} starter-value ${t.teamA.gain >= 0 ? 'gain' : 'loss'}: ${Math.round(t.teamA.gain)} (${(t.teamA.gainPct * 100).toFixed(1)}%) · ${fmtMovements(t.teamA.movements)}`,
    `  ${t.teamB.name} starter-value ${t.teamB.gain >= 0 ? 'gain' : 'loss'}: ${Math.round(t.teamB.gain)} (${(t.teamB.gainPct * 100).toFixed(1)}%) · ${fmtMovements(t.teamB.movements)}`,
  ].join('\n')).join('\n\n')

  try {
    const result = await groqChatJson<z.infer<typeof BlurbsOut>>({
      apiKey,
      model: process.env.GROQ_MODEL_TRADE ?? DEFAULT_GROQ_MODEL,
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
      // Columns stored before nflWeek existed have no dateline; fill it in
      // on read so old rows don't fall back to the raw date.
      existing.payload.nflWeek ??= await currentNflWeek()
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
        nflWeek: await currentNflWeek(),
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
      scoringProfile: data.effective.scoringProfile,
      tePremium: data.effective.tePremium,
      sourcePreference: data.effective.valueSourcePreference,
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

  await stampPositionRanks(trades, data.effective)

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
    nflWeek: await currentNflWeek(),
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
