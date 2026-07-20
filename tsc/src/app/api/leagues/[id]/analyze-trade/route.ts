// POST /api/leagues/[id]/analyze-trade
//
// Phase 3 round 2: value totals + rubric grades + positional depth +
// AI narrative (Groq, JSON-strict).
//
// Body:
//   { teamA: ownerId, teamB: ownerId,
//     sends:    [playerId, ...],  // team A sends
//     receives: [playerId, ...] } // team A receives
//
// Returns:
//   { teamA, teamB, delta, deltaPct, mode, format, depth, narrative }
//
// Grade Lock: the rubric determines the grade deterministically from
// the value delta. The Groq prompt is told the grades as facts and
// asked only for the narrative + per-team verdicts. The narrative
// CANNOT flip the winner.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { loadAnalyzerData } from '@/lib/tradeDesk/analyzer'
import {
  computeLeagueDepth,
  snapshotAfterTrade,
  depthDelta,
  sumStarters,
  type TeamDepthDelta,
} from '@/lib/tradeDesk/depth'
import { valuateLeague } from '@/lib/values'
import { getProjectionsForYear, sumPpg } from '@/lib/values/projections'
import { groqChatJson, GroqError } from '@/lib/groq'

// Groq call ~1-3s + depth compute ~50ms + Sleeper roster fetch ~700ms;
// 30s gives plenty of headroom for retries on rate limits.
export const maxDuration = 30

const Body = z.object({
  teamA:    z.string().min(1),
  teamB:    z.string().min(1),
  sends:    z.array(z.string().min(1)).min(1).max(40),
  receives: z.array(z.string().min(1)).min(1).max(40),
})

// ── Rubric ──────────────────────────────────────────────────────────────
//
// Each side is graded on its OWN score, not a mirror of the other side's:
//
//   sideScore = 0.5 * ownGainPct + 0.5 * relativeDeltaPct
//
//   ownGainPct       — the side's marginal starting-lineup change vs its
//                      own pre-trade starter value ("did my lineup improve?")
//   relativeDeltaPct — the gap between the two sides' marginal gains,
//                      normalized to average pre-trade starter value
//                      ("did I beat the other side of the table?")
//
// Blending the two lets mutual wins grade as mutual wins — both sides can
// print B+/B+ when both lineups genuinely improve — while a lopsided deal
// still splits (A vs C). The old rubric graded one mirrored delta and
// could never award both sides above B, which contradicted the Grader's
// own calibration ("mutual wins are real").
function gradeForScore(p: number): string {
  if (p >= 0.18)  return 'A+'
  if (p >= 0.12)  return 'A'
  if (p >= 0.05)  return 'A-'
  if (p >= 0.02)  return 'B+'
  if (p >  -0.02) return 'B'
  if (p >  -0.05) return 'B-'
  if (p >  -0.08) return 'C+'
  if (p >  -0.12) return 'C'
  if (p >  -0.16) return 'C-'
  if (p >  -0.20) return 'D'
  return 'F'
}

// Fallback verdict used when Groq fails / rate-limits. Deterministic;
// gives the UI something to render so a Groq outage doesn't break the
// page.
function fallbackVerdict(deltaPct: number, perspective: 'sender' | 'receiver'): string {
  const pct = perspective === 'sender' ? -deltaPct : deltaPct
  const abs = Math.abs(pct)
  if (abs < 0.03)              return 'Essentially even on consensus value.'
  if (pct > 0 && abs < 0.08)   return 'A slight value win on paper.'
  if (pct > 0 && abs < 0.15)   return 'Comes out ahead on raw value.'
  if (pct > 0)                 return 'Clear value haul — wins on paper.'
  if (abs < 0.08)              return 'Gives up a touch of value.'
  if (abs < 0.15)              return 'Loses noticeably on value.'
  return 'Loses badly on raw value.'
}

// ── Groq prompt builders ────────────────────────────────────────────────

type SidePromptCtx = {
  teamName: string
  receivedValue: number
  sentValue: number
  received: Array<{ name: string; position: string | null; value: number }>
  sent:     Array<{ name: string; position: string | null; value: number }>
  grade: string
  depth: TeamDepthDelta
  starterBefore: number
  starterAfter: number
  marginalGain: number
  marginalGainPct: number
}
type PromptCtx = {
  leagueName: string
  mode: 'dynasty' | 'redraft' | 'keeper'
  format: { lineupType: string; scoringProfile: string; tePremium: string; teamCount: number }
  delta: number
  deltaPct: number
  teamA: SidePromptCtx
  teamB: SidePromptCtx
}

function fmtMovements(d: TeamDepthDelta): string {
  if (d.rankMovements.length === 0) return 'no league-rank movement.'
  const parts = d.rankMovements.slice(0, 3).map((m) => {
    const arrow = m.delta < 0 ? '↑' : '↓'   // delta<0 = better rank
    return `${m.position} ${m.before}→${m.after} ${arrow}${Math.abs(m.delta)}`
  })
  return parts.join(', ')
}

function buildAnalyzerPrompt(ctx: PromptCtx): { system: string; user: string } {
  const typeNote =
    ctx.mode === 'dynasty'
      ? 'DYNASTY league — long-term player value, draft picks, and youth weighted heavily.'
      : ctx.mode === 'keeper'
      ? 'KEEPER league — both rest-of-season production AND keeper value matter.'
      : 'REDRAFT league — only current-season production matters.'

  const winner =
    ctx.delta > 0 ? ctx.teamA.teamName :
    ctx.delta < 0 ? ctx.teamB.teamName : null

  const system = [
    'You are a trade analyst for The Sunday Chronicle — a fantasy football league archive. The Analyzer evaluates HYPOTHETICAL trades a manager is considering, not completed ones. Your job is the narrative around a grade that has already been determined by hard value math; you do not assign the grade.',
    '',
    typeNote,
    '',
    'GRADE LOCK — the grades you receive in the user message are FACTS, not suggestions. Each side\'s grade comes from a deterministic rubric on that side\'s score: 0.5 x (its own starting-lineup change %) + 0.5 x (the marginal gap between the two sides). Bands: >=+18% A+ · +12..18% A · +5..12% A- · +2..5% B+ · -2..+2% B · -5..-2% B- · -8..-5% C+ · -12..-8% C · -16..-12% C- · -20..-16% D · below -20% F.',
    '',
    'Because the rubric blends each side\'s own lineup change with the relative gap, grades do NOT have to mirror. A deal where both lineups improve can print B+/B+ or A-/B+; a lopsided one prints A/C. Write the narrative to match the pairing you are given.',
    '',
    'IMPORTANT — the grade is NOT raw asset value delta. It is built on the change in each team\'s STARTING LINEUP value (sum of best starters at QB/RB/WR/TE including FLEX + SF), before vs after the trade. This naturally captures:',
    '  • Position scarcity — a 4th elite WR added to a team that starts 2 displaces nothing and earns ~0 marginal value, even if his asset value is huge.',
    '  • Real team need — patching a weak position is worth far more than padding a strong one.',
    '  • Package deal nerf — 3-for-1s where the team getting 3 only counts whichever of them cracks the starter tier; the team sending the elite player loses a real starter and gets nothing back to replace him.',
    '',
    'Do NOT propose different grades. Your narrative MUST be consistent with the grades shown. When one grade is clearly higher, that team improved more; when both grades sit in the B+/A range, frame it as a deal both sides should take.',
    '',
    'WRITING THE NARRATIVE — 4 to 6 sentences total. Follow these rules:',
    '',
    '1. Lead with the most interesting observation: a player\'s situation, an age/contention-window mismatch, a positional scarcity, an opportunity cost — anything except a verdict statement. NEVER start with "X wins this trade" or any variation.',
    '',
    '2. EXPLAIN WHY the grades came out the way they did. Reference consensus value totals, positional rank movements (e.g. "Team A jumps from WR rank 5 to WR rank 3"), age curves (dynasty), or roster fit. Be specific.',
    '',
    '3. Acknowledge meaningful positional shifts. If a team got worse at a position by trade but had elite depth there, say so. If they patched a weakness, say so.',
    '',
    '4. Vary sentence structure. Do not use the same opening template twice across runs.',
    '',
    'BANNED PHRASES — never write any of these:',
    '• "won this trade" / "won the trade" / "got the better end"',
    '• "primarily due to" / "primarily because"',
    '• "added depth" or "addressed a need" as the entire reason',
    '• "solid move" / "great trade for both" / "win-win" / "fair deal" as the verdict',
    '• Any sentence whose only purpose is to restate who received whom',
    '• The em dash character. Never use an em dash anywhere; use commas, periods, or parentheses instead.',
    '',
    'PER-TEAM VERDICTS — one sentence each. The verdict is the takeaway tagline for that team (e.g. "Wins big on consensus value but skews older at WR" or "Loses real value for a positional bet that probably doesn\'t pay off"). NOT another grade — that\'s already determined.',
    '',
    'OUTPUT: strict JSON only — no prose before/after, no markdown fences. Shape:',
    '{ "narrative": "<4-6 sentences>", "teamA_verdict": "<one sentence>", "teamB_verdict": "<one sentence>" }',
  ].join('\n')

  const fmtSide = (s: SidePromptCtx, sideLabel: 'A' | 'B') => {
    const receivedList = s.received.length === 0
      ? '    (nothing)'
      : s.received.map((p) => `    - ${p.name} (${p.position ?? '?'}) · value ${Math.round(p.value)}`).join('\n')
    const sentList = s.sent.length === 0
      ? '    (nothing)'
      : s.sent.map((p) => `    - ${p.name} (${p.position ?? '?'}) · value ${Math.round(p.value)}`).join('\n')
    const marginalSign = s.marginalGain >= 0 ? '+' : ''
    return [
      `Team ${sideLabel} — ${s.teamName} (grade ${s.grade}):`,
      `  Sends (raw asset value ${Math.round(s.sentValue)}):`,
      sentList,
      `  Receives (raw asset value ${Math.round(s.receivedValue)}):`,
      receivedList,
      `  STARTING LINEUP VALUE: ${Math.round(s.starterBefore)} → ${Math.round(s.starterAfter)}  (marginal ${marginalSign}${Math.round(s.marginalGain)}, ${(s.marginalGainPct * 100).toFixed(1)}%)`,
      `  Overall roster rank: ${s.depth.before.overallLeagueRank}→${s.depth.after.overallLeagueRank} (composite ${s.depth.before.compositeStrength.toFixed(1)} → ${s.depth.after.compositeStrength.toFixed(1)})`,
      `  Positional rank movements: ${fmtMovements(s.depth)}`,
    ].join('\n')
  }

  const user = [
    `League: ${ctx.leagueName} (${ctx.format.teamCount}-team ${ctx.format.lineupType} ${ctx.format.scoringProfile}${ctx.format.tePremium !== 'NONE' ? ' · TE Premium ' + ctx.format.tePremium : ''})`,
    `Mode: ${ctx.mode}`,
    '',
    `MARGINAL STARTER-VALUE DELTA (Team A perspective): ${ctx.delta >= 0 ? '+' : ''}${Math.round(ctx.delta)} (${(ctx.deltaPct * 100).toFixed(1)}%)`,
    `Side that improves their starting lineup more: ${winner ?? 'EVEN'}`,
    '',
    fmtSide(ctx.teamA, 'A'),
    '',
    fmtSide(ctx.teamB, 'B'),
  ].join('\n')

  return { system, user }
}

type NarrativeOut = {
  narrative: string
  teamA_verdict: string
  teamB_verdict: string
}

async function runNarrative(ctx: PromptCtx): Promise<{ ok: true; data: NarrativeOut } | { ok: false; error: string }> {
  const apiKey = process.env.GROQ_API_KEY_TRADES || process.env.GROQ_API_KEY
  if (!apiKey) return { ok: false, error: 'GROQ_API_KEY not configured' }
  try {
    const { system, user } = buildAnalyzerPrompt(ctx)
    const result = await groqChatJson<NarrativeOut>({
      apiKey,
      model: process.env.GROQ_MODEL_TRADE ?? 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user },
      ],
      temperature: 0.55,
    })
    // Belt-and-braces: ensure required fields present.
    if (typeof result.data?.narrative !== 'string' ||
        typeof result.data?.teamA_verdict !== 'string' ||
        typeof result.data?.teamB_verdict !== 'string') {
      return { ok: false, error: 'narrative response shape mismatch' }
    }
    return { ok: true, data: result.data }
  } catch (e) {
    if (e instanceof GroqError) {
      return { ok: false, error: `groq ${e.message.slice(0, 200)}` }
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Route handler ───────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') },
      { status: 400 },
    )
  }
  const body = parsed.data
  if (body.teamA === body.teamB) {
    return NextResponse.json({ error: 'teamA and teamB must differ' }, { status: 400 })
  }

  // ?year=YYYY — load that past season's roster (matches the rosters
  // endpoint). Frontend echoes whichever year picker the user selected.
  const yearParam = new URL(req.url).searchParams.get('year')
  const year = yearParam ? Number(yearParam) : undefined

  // Load league rosters + effective settings.
  const load = await loadAnalyzerData(id, {
    lookupBy: 'id',
    year: Number.isFinite(year) ? year : undefined,
  })
  if (!load.ok) {
    const err = load.error
    switch (err.kind) {
      case 'not-found':
        return NextResponse.json({ error: 'league not found' }, { status: 404 })
      case 'unsupported-platform':
        return NextResponse.json(
          { error: 'unsupported-platform', platform: err.platform },
          { status: 409 },
        )
      case 'no-live-id':
        return NextResponse.json({ error: 'no-live-id' }, { status: 409 })
      case 'sleeper-failed':
      case 'espn-failed':
      case 'nfl-failed':
      case 'yahoo-failed':
        return NextResponse.json({ error: err.kind, message: err.message }, { status: 502 })
      case 'yahoo-not-connected':
        return NextResponse.json({ error: 'yahoo-not-connected' }, { status: 409 })
    }
  }
  const data = load.data
  const teamA = data.rosters.find(r => r.ownerId === body.teamA)
  const teamB = data.rosters.find(r => r.ownerId === body.teamB)
  if (!teamA || !teamB) {
    return NextResponse.json({ error: 'team not in league' }, { status: 400 })
  }
  const teamAPlayerSet = new Set(teamA.playerIds)
  const teamBPlayerSet = new Set(teamB.playerIds)
  for (const pid of body.sends) {
    if (!teamAPlayerSet.has(pid)) {
      return NextResponse.json({ error: `player ${pid} not on Team A roster` }, { status: 400 })
    }
  }
  for (const pid of body.receives) {
    if (!teamBPlayerSet.has(pid)) {
      return NextResponse.json({ error: `player ${pid} not on Team B roster` }, { status: 400 })
    }
  }

  // Value engine in the league's effective context.
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

  function buildSide(playerIds: string[]) {
    let total = 0
    const list = playerIds.map(pid => {
      const meta = data.players[pid]
      const val = valuation.values.get(pid)
      const value = val ? val.value : 0
      total += value
      return {
        playerId: pid,
        name: meta?.name ?? `#${pid}`,
        position: meta?.position ?? null,
        value,
        // Surfaced for the analyzer UI badge (e.g. "WR · P92"). Position is
        // the more useful number in a trade context — overall is informational.
        percentilePosition: val?.percentilePosition ?? null,
        percentileOverall: val?.percentileOverall ?? null,
      }
    })
    list.sort((a, b) => b.value - a.value)
    return { list, total }
  }
  const aReceives = buildSide(body.receives)
  const aSends    = buildSide(body.sends)

  // Raw asset delta — kept for transparency (UI shows it next to the
  // marginal impact) but no longer drives the grade. A package of 3
  // bench players might have a high raw value yet zero marginal impact
  // because none of them crack the starter tier.
  const rawDelta = aReceives.total - aSends.total
  const rawDenom = Math.max(aReceives.total, aSends.total)
  const rawDeltaPct = rawDenom > 0 ? rawDelta / rawDenom : 0

  // Positional depth: snapshot before, snapshot after, deltas for both teams.
  const beforeDepth = computeLeagueDepth(data.rosters, data.players, valuation.values, data.effective)
  const afterDepth  = snapshotAfterTrade(
    data.rosters, data.players, valuation.values, data.effective,
    body.teamA, body.teamB, body.sends, body.receives,
  )
  const teamADepth = depthDelta(beforeDepth, afterDepth, body.teamA)
  const teamBDepth = depthDelta(beforeDepth, afterDepth, body.teamB)

  // ── Grade driver: marginal starter-value impact ─────────────────
  //
  // What changed for each team's STARTING LINEUP after the swap. This
  // is the metric that actually captures position scarcity + team need:
  //
  //   • A 4th elite WR added to a team that starts 2 displaces nothing
  //     in the starter tier → marginalGain ≈ 0 even if the player's
  //     consensus value is huge.
  //
  //   • Adding a top-12 RB to a team starting one weak RB pushes a
  //     bench guy out of the starter slot → marginal gain equals the
  //     full new player's value minus the displaced bench guy's value.
  //
  //   • Package deals (3-for-1) get nerfed automatically: the team
  //     receiving 3 only counts whichever of them crack the starter
  //     tier; the team sending the elite player loses a real starter.
  //
  // The grade rubric runs on the DIFFERENCE between the two teams'
  // marginal gains, normalized against the average pre-trade starter
  // value so percentages stay comparable across leagues of any size.
  const beforeA = sumStarters(teamADepth.before)
  const afterA  = sumStarters(teamADepth.after)
  const beforeB = sumStarters(teamBDepth.before)
  const afterB  = sumStarters(teamBDepth.after)

  // ── Real projected lineup PPG ──────────────────────────────────────
  //
  // Sum each team's starter PPG from Sleeper's RotoWire-backed season
  // projections for QB / RB / WR / TE / FLEX / SF starters. K and DEF
  // get a flat +14 ppg combined offset (per the analyzer's design —
  // K/DEF aren't graded, aren't tradeable in this analyzer's scope, and
  // their per-game variance is too small to matter for trade decisions).
  //
  // Best-effort: if the projections endpoint fails, return null and the
  // UI falls back to the crude value→ppg proxy.
  const projYear =
    Number.isFinite(year) ? Number(year) : new Date().getFullYear()
  const projections = await getProjectionsForYear(projYear).catch(
    () => ({ ppgByPid: {}, year: projYear, rowCount: 0 }),
  )
  const K_DEF_FLAT_PPG = 14
  const hasProjections = projections.rowCount > 0
  function lineupPpg(ids: string[]): number | null {
    if (!hasProjections) return null
    // Filter out K / DEF starters — their projections come from the
    // flat offset, not the Sleeper feed.
    const skill = ids.filter((pid) => {
      const pos = (data.players[pid]?.position ?? '').toUpperCase()
      return pos !== 'K' && pos !== 'DEF'
    })
    const skillPpg = sumPpg(skill, data.effective.scoringProfile, projections)
    return Math.round((skillPpg + K_DEF_FLAT_PPG) * 10) / 10
  }
  const projPpgBeforeA = lineupPpg(teamADepth.before.starterIds)
  const projPpgAfterA  = lineupPpg(teamADepth.after.starterIds)
  const projPpgBeforeB = lineupPpg(teamBDepth.before.starterIds)
  const projPpgAfterB  = lineupPpg(teamBDepth.after.starterIds)
  const marginalA = afterA - beforeA
  const marginalB = afterB - beforeB
  const marginalAPct = beforeA > 0 ? marginalA / beforeA : 0
  const marginalBPct = beforeB > 0 ? marginalB / beforeB : 0

  // Delta is Team A's perspective relative to Team B. Normalized
  // against the average pre-trade starter value across both teams so
  // a +400 marginal gap is graded the same in a high-scoring league
  // as in a low-scoring one.
  const marginalDelta    = marginalA - marginalB
  const avgPreStarter    = (beforeA + beforeB) / 2 || 1
  const marginalDeltaPct = marginalDelta / avgPreStarter

  // Per-side score: own lineup change + relative gap, equal weight (see
  // the rubric comment above). Grades can land B+/B+ on a genuine mutual
  // win instead of being forced to mirror.
  const sideScoreA = 0.5 * marginalAPct + 0.5 * marginalDeltaPct
  const sideScoreB = 0.5 * marginalBPct - 0.5 * marginalDeltaPct
  const teamAGrade = gradeForScore(sideScoreA)
  const teamBGrade = gradeForScore(sideScoreB)

  // Re-expose as deltaPct so the existing prompt + UI fields stay
  // wired without renames. raw* fields stay distinct.
  const delta    = marginalDelta
  const deltaPct = marginalDeltaPct

  // Groq narrative — best-effort. Falls back to deterministic verdicts
  // on failure so the page still renders something useful.
  const narrativeResult = await runNarrative({
    leagueName: data.leagueName,
    mode: data.effective.mode,
    format: {
      lineupType: data.effective.lineupType,
      scoringProfile: data.effective.scoringProfile,
      tePremium: data.effective.tePremium,
      teamCount: data.effective.teamCount,
    },
    delta,
    deltaPct,
    teamA: {
      teamName: teamA.teamName ?? teamA.ownerName,
      receivedValue: aReceives.total,
      sentValue: aSends.total,
      received: aReceives.list,
      sent: aSends.list,
      grade: teamAGrade,
      depth: teamADepth,
      starterBefore: beforeA,
      starterAfter:  afterA,
      marginalGain:  marginalA,
      marginalGainPct: marginalAPct,
    },
    teamB: {
      teamName: teamB.teamName ?? teamB.ownerName,
      receivedValue: aSends.total,    // Team B receives what A sends
      sentValue: aReceives.total,
      received: aSends.list,
      sent: aReceives.list,
      grade: teamBGrade,
      depth: teamBDepth,
      starterBefore: beforeB,
      starterAfter:  afterB,
      marginalGain:  marginalB,
      marginalGainPct: marginalBPct,
    },
  })

  const narrative = narrativeResult.ok
    ? narrativeResult.data.narrative
    : null
  const teamAVerdict = narrativeResult.ok
    ? narrativeResult.data.teamA_verdict
    : fallbackVerdict(deltaPct, 'receiver')
  const teamBVerdict = narrativeResult.ok
    ? narrativeResult.data.teamB_verdict
    : fallbackVerdict(-deltaPct, 'receiver')
  const narrativeError = narrativeResult.ok ? null : narrativeResult.error

  return NextResponse.json({
    // Grade driver — kept named `delta` / `deltaPct` for backward
    // compat. These are the MARGINAL starter-value figures now, not
    // raw asset deltas.
    delta,
    deltaPct,
    // Raw asset delta — purely informational. Sum of player consensus
    // values on each side of the trade.
    rawDelta,
    rawDeltaPct,
    mode: data.effective.mode,
    format: {
      lineupType: data.effective.lineupType,
      scoringProfile: data.effective.scoringProfile,
      tePremium: data.effective.tePremium,
      teamCount: data.effective.teamCount,
    },
    narrative,
    narrativeError,
    teamA: {
      ownerId: body.teamA,
      grade: teamAGrade,
      verdict: teamAVerdict,
      total: aReceives.total,
      received: aReceives.list,
      sentTotal: aSends.total,
      sent: aSends.list,
      depth: teamADepth,
      starterBefore: beforeA,
      starterAfter:  afterA,
      marginalGain:  marginalA,
      marginalGainPct: marginalAPct,
      // Real projected lineup ppg (sum of starter RotoWire projections
      // from Sleeper + flat +14 DEF/K). Null when the projections feed
      // failed — JS falls back to the value→ppg proxy.
      projPpgBefore: projPpgBeforeA,
      projPpgAfter:  projPpgAfterA,
    },
    teamB: {
      ownerId: body.teamB,
      grade: teamBGrade,
      verdict: teamBVerdict,
      total: aSends.total,
      received: aSends.list,
      sentTotal: aReceives.total,
      sent: aReceives.list,
      depth: teamBDepth,
      starterBefore: beforeB,
      starterAfter:  afterB,
      marginalGain:  marginalB,
      marginalGainPct: marginalBPct,
      projPpgBefore: projPpgBeforeB,
      projPpgAfter:  projPpgAfterB,
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
