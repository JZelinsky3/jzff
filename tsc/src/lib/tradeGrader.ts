// Trade grader — pulls a trade from the DB, asks Groq to grade each side,
// and writes the result into trade_grades.
//
// Phase 2 scope:
//   • Initial grade (at trade detection)
//   • Triggered manually via /api/leagues/[id]/grade-trades (admin button)
//   • Single Groq call per trade, gets grades for ALL sides at once (cheaper
//     than one call per side)
//   • League type (redraft/keeper/dynasty) flows into the system prompt so
//     the model knows whether to weight rest-of-season vs. long-term value
//
// Out of scope for Phase 2 (Phase 3+):
//   • 4-week revisit job
//   • Auto-grading on ingest
//   • Position-need context (the model gets the asset list but not rosters)

import { createAdminClient } from '@/lib/supabase/admin'
import { groqChatJson, GroqError } from '@/lib/groq'

const MODEL = 'llama-3.3-70b-versatile'

// Valid letter grades. Used both in the prompt (so the model knows what to
// return) and at parse time to reject hallucinated grades like "B--".
const VALID_GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'] as const
type Grade = typeof VALID_GRADES[number]

export type GradeResult = {
  trade_id: string
  graded_sides: number
  warnings: string[]
}

// One-trade grade. Returns graded_sides=0 with a warning if the call fails
// or the trade is malformed; never throws (callers loop over many trades and
// shouldn't be killed by one bad one).
export async function gradeTrade(tradeId: string): Promise<GradeResult> {
  const db = createAdminClient()
  const warnings: string[] = []

  // 1. Load trade + sides + manager display + league type.
  const { data: trade, error: tErr } = await db
    .from('trades')
    .select('id, league_id, season_id, week, executed_at, platform, leagues!inner(league_type), seasons!inner(year)')
    .eq('id', tradeId)
    .maybeSingle()
  if (tErr || !trade) {
    warnings.push(`load trade ${tradeId}: ${tErr?.message ?? 'not found'}`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  const { data: sides, error: sErr } = await db
    .from('trade_sides')
    .select('id, manager_id, assets, managers!inner(display_name, team_name)')
    .eq('trade_id', tradeId)
  if (sErr || !sides || sides.length < 2) {
    warnings.push(`load sides for trade ${tradeId}: ${sErr?.message ?? 'fewer than 2 sides'}`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  const league = Array.isArray(trade.leagues) ? trade.leagues[0] : trade.leagues
  const season = Array.isArray(trade.seasons) ? trade.seasons[0] : trade.seasons
  const leagueType = (league?.league_type as 'redraft' | 'keeper' | 'dynasty') ?? 'redraft'
  const seasonYear = season?.year ?? null

  // 2. Build the prompt.
  const prompt = buildPrompt({
    leagueType,
    seasonYear,
    week: trade.week ?? null,
    sides: sides.map((s) => {
      const mgr = Array.isArray(s.managers) ? s.managers[0] : s.managers
      return {
        side_id: s.id as string,
        manager_name: (mgr?.team_name as string | null) || (mgr?.display_name as string) || 'Manager',
        assets: (s.assets as Array<Record<string, unknown>>) ?? [],
      }
    }),
  })

  // 3. Call Groq.
  const apiKey = process.env.GROQ_API_KEY_TRADES || process.env.GROQ_API_KEY
  if (!apiKey) {
    warnings.push('GROQ_API_KEY_TRADES (or GROQ_API_KEY) not set')
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  let parsed: { sides: Array<{ side_id: string; grade: string; blurb: string }> }
  try {
    const result = await groqChatJson<typeof parsed>({
      apiKey,
      model: MODEL,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: 0.4,
      maxTokens: 600,
    })
    parsed = result.data
  } catch (e) {
    const msg = e instanceof GroqError ? e.message : (e as Error).message
    warnings.push(`groq call for trade ${tradeId}: ${msg}`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  if (!parsed?.sides || !Array.isArray(parsed.sides)) {
    warnings.push(`trade ${tradeId}: model returned no sides array`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  // 4. Upsert grades. Match by side_id; reject grades the model invented.
  const sideIds = new Set(sides.map((s) => s.id as string))
  let graded = 0
  for (const g of parsed.sides) {
    if (!sideIds.has(g.side_id)) {
      warnings.push(`trade ${tradeId}: model returned grade for unknown side ${g.side_id}`)
      continue
    }
    if (!(VALID_GRADES as readonly string[]).includes(g.grade)) {
      warnings.push(`trade ${tradeId}: invalid grade "${g.grade}" for side ${g.side_id}`)
      continue
    }
    const blurb = (g.blurb ?? '').toString().trim().slice(0, 600)
    const { error: upErr } = await db.from('trade_grades').upsert(
      {
        trade_side_id: g.side_id,
        grade: g.grade as Grade,
        blurb,
        model: `groq:${MODEL}`,
        graded_at: new Date().toISOString(),
      },
      { onConflict: 'trade_side_id' },
    )
    if (upErr) {
      warnings.push(`upsert grade for side ${g.side_id}: ${upErr.message}`)
      continue
    }
    graded++
  }

  return { trade_id: tradeId, graded_sides: graded, warnings }
}

// Grade up to `limit` ungraded trades for a league, newest first. Returns
// aggregate counts + warnings. Caller is responsible for permission checks.
//
// We grade serially (not in parallel) for two reasons:
//   1. Groq's free tier rate-limits per second; bursts cause 429s.
//   2. The UI shows a single counter, so sequential is easier to reason about.
export async function gradeUngradedForLeague(args: {
  leagueId: string
  limit: number
  seasonYear?: number | null
}): Promise<{ scanned: number; graded: number; warnings: string[] }> {
  const db = createAdminClient()
  const warnings: string[] = []

  // Find trades that have at least one ungraded side. We pull all sides for
  // a league via an inner join and then collapse to distinct trade_ids; this
  // is cheaper than a NOT EXISTS subquery and lets us stop after `limit`.
  let q = db
    .from('trades')
    .select('id, executed_at, season_id, seasons!inner(year)')
    .eq('league_id', args.leagueId)
    .eq('status', 'completed')
    .order('executed_at', { ascending: false })
  if (args.seasonYear != null) {
    q = q.eq('seasons.year', args.seasonYear)
  }

  const { data: candidateTrades, error: cErr } = await q.limit(Math.max(limit_cap(args.limit) * 4, 50))
  if (cErr || !candidateTrades) {
    warnings.push(`load candidate trades: ${cErr?.message ?? 'no data'}`)
    return { scanned: 0, graded: 0, warnings }
  }

  // Filter to trades that have any ungraded sides (i.e. trade_sides without
  // a matching trade_grades row). One round-trip per candidate keeps the
  // query simple; could be batched later if needed.
  const ungraded: string[] = []
  for (const t of candidateTrades) {
    if (ungraded.length >= limit_cap(args.limit)) break
    const { data: sides } = await db
      .from('trade_sides')
      .select('id, trade_grades(trade_side_id)')
      .eq('trade_id', t.id)
    if (!sides) continue
    const anyMissing = sides.some((s) => {
      const grades = s.trade_grades as unknown
      const arr = Array.isArray(grades) ? grades : grades ? [grades] : []
      return arr.length === 0
    })
    if (anyMissing) ungraded.push(t.id as string)
  }

  // Grade each ungraded trade.
  let graded = 0
  for (const tradeId of ungraded) {
    const r = await gradeTrade(tradeId)
    graded += r.graded_sides > 0 ? 1 : 0
    warnings.push(...r.warnings)
  }

  return { scanned: candidateTrades.length, graded, warnings }
}

// ─── Prompt builder ──────────────────────────────────────────────────────

type PromptArgs = {
  leagueType: 'redraft' | 'keeper' | 'dynasty'
  seasonYear: number | null
  week: number | null
  sides: Array<{
    side_id: string
    manager_name: string
    assets: Array<Record<string, unknown>>
  }>
}

function buildPrompt(args: PromptArgs): { system: string; user: string } {
  const typeNote =
    args.leagueType === 'dynasty'
      ? 'This is a DYNASTY league — weight long-term player value, draft picks (especially early-round), and youth heavily. Rest-of-season production matters less than future seasons.'
      : args.leagueType === 'keeper'
      ? 'This is a KEEPER league — players retained from year to year. Weight both rest-of-season production AND keeper value (cheap young talent is more valuable).'
      : 'This is a REDRAFT league — only current-season value matters. Players reset every year. Draft picks (if present) are for next year only.'

  const system =
    [
      'You are an expert fantasy football trade analyst.',
      'You will be given a completed trade between two or more managers.',
      'Grade each side from A+ to F using these grades only: A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F.',
      'For each side, write a single concise blurb (under 220 characters) explaining the grade. Focus on the strongest reason for the grade — do not summarize the entire trade.',
      typeNote,
      'Be willing to give strong grades when warranted. Avoid hedging with mid-range B/C grades for everything. Most trades have a clear winner.',
      'Output STRICT JSON only — no prose before or after, no markdown fences.',
    ].join(' ')

  const sidesText = args.sides
    .map((s, idx) => {
      const assets = s.assets.length === 0
        ? '  (nothing)'
        : s.assets.map((a) => `  - ${formatAsset(a)}`).join('\n')
      return `Side ${idx + 1} — ${s.manager_name} (side_id: ${s.side_id}) received:\n${assets}`
    })
    .join('\n\n')

  const user =
    [
      `League type: ${args.leagueType}`,
      args.seasonYear != null ? `Season: ${args.seasonYear}` : null,
      args.week != null ? `Week: ${args.week}` : null,
      '',
      sidesText,
      '',
      'Return JSON with this exact shape:',
      '{',
      '  "sides": [',
      args.sides.map((s) => `    {"side_id": "${s.side_id}", "grade": "<letter>", "blurb": "<one short sentence>"}`).join(',\n'),
      '  ]',
      '}',
    ]
      .filter((line) => line !== null)
      .join('\n')

  return { system, user }
}

function formatAsset(a: Record<string, unknown>): string {
  const kind = a.kind as string
  if (kind === 'player') {
    const name = (a.name as string) || `Player ${a.player_id}`
    const pos = (a.position as string) || '—'
    const team = (a.team as string) || '?'
    return `${pos} ${name} (${team})`
  }
  if (kind === 'pick') {
    const year = a.season_year as number
    const round = a.round as number
    return `${year} ${ordinal(round)} round pick`
  }
  if (kind === 'faab') {
    return `$${a.amount} FAAB`
  }
  return `unknown asset (${kind})`
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

// Cap the per-request batch size so a single button click can't run away
// with Vercel's serverless timeout. Caller-supplied limit is clamped here.
function limit_cap(n: number): number {
  return Math.max(1, Math.min(50, n))
}
