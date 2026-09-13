// Trade grader — pulls a trade from the DB, asks Groq to grade each side,
// and writes the result into trade_grades + trades.ai_summary.
//
// Two flows live here:
//   • gradeTrade / gradeUngradedForLeague — initial grading. One Groq call
//     produces a combined summary + per-side letter grades.
//   • revisitTrade / revisitForLeague — the 4-week verdict pass. Calls Groq
//     a second time with the original grade + summary as context, asks
//     "does this still hold up?", and writes revisit_grade / revisit_summary.
//
// Cross-platform: asset player ids are resolved to Sleeper ids up front
// (direct for Sleeper trades, name+position match for ESPN/Yahoo/NFL), so
// the consensus value engine + roster context attach on every platform.
// Value anchoring runs on the SAME consensus engine as the Analyzer /
// Finder / Rumor Mill (valuateLeague), calibrated to the league's
// effective Trade Desk settings.
//
// Out of scope (Phase 3+):
//   • Auto-grading on ingest + Vercel cron for scheduled grading
//   • Real performance data fed into the revisit prompt (player stats over
//     the 4 weeks since trade); without that, the revisit is a fresh-eyes
//     review of the same context

import { createAdminClient } from '@/lib/supabase/admin'
import { groqChatJson, GroqError, DEFAULT_GROQ_MODEL } from '@/lib/groq'
import { getSleeperValuesForPlayerIds, type PlayerValue } from '@/lib/playerValues'
import { computePositionRanks, stampRanks, buildNameLookup, nameKey } from '@/lib/positionRanks'
import { DEFAULT_PPR_SCORING } from '@/lib/scoring'
import { loadAnalyzerData, type AnalyzerLeagueData, type AnalyzerRoster } from '@/lib/tradeDesk/analyzer'
import { lineupValue, gradeStarter, DEFAULT_SLOTS, type HubLineupSlots } from '@/lib/hub/analyzer'
import { parseSettings, mergeEffective, type EffectiveSettings } from '@/lib/tradeDesk/settings'
import { valuateLeague, type PlayerValue as ConsensusValue, type LeagueMode } from '@/lib/values'
import { effectivePackageValue } from '@/lib/hub/verdict'
import { resolveCurrentWeek } from '@/lib/liveSeason'

// Same env override the Analyzer + Rumor Mill use, so one var upgrades the
// whole desk's writing model at once.
const MODEL = process.env.GROQ_MODEL_TRADE ?? DEFAULT_GROQ_MODEL

// Grading starts at 2026 and never runs backwards.
//
// Everything from 2025 and earlier is imported history: those deals happened
// before the league was on TSC, the roster and injury context that made them
// make sense is gone, and an AI verdict stapled on years later is worth
// nothing to the people who made them. Any pre-2026 grade in the database is
// a leftover from testing the feature against old seasons, not something to
// reproduce.
//
// Enforced inside gradeTrade/revisitTrade rather than only in the callers'
// queries, so a manual backfill, a force re-grade, or some future caller
// can't route around it. The queries filter too, but only to avoid loading
// candidates that would be refused anyway.
// Scrub dashes the model was told not to use.
//
// The system prompt bans the em dash explicitly and the model still emits
// it ("contention windows—Goodhead buying a younger asset"). A prompt is a
// request; this is the guarantee. Em and en dashes both become commas,
// which is what they were standing in for, and doubled hyphens go with
// them. Run on every summary before it is stored, so nothing reaches the
// page without passing through here.
export function stripDashes(text: string): string {
  return text
    // Spaced dash acting as a clause break: " — " → ", "
    .replace(/\s*[\u2014\u2013]\s*/g, ', ')
    // ASCII stand-in for the same thing.
    .replace(/\s*--\s*/g, ', ')
    // A comma may now sit next to punctuation that already ended the clause.
    .replace(/,\s*([,.;:!?])/g, '$1')
    .replace(/\s+,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Which prompt rules did this summary actually break?
//
// The system prompt bans these outright and the model breaks them anyway:
// across four consecutive gradings of the same trade it produced "the age
// and contention-window mismatch" and "while the added Jakobi Meyers" in a
// redraft league, both explicitly forbidden. Instructions are a request.
// Detecting the violation and spending one more call is the enforcement.
//
// Dynasty vocabulary is only a violation in REDRAFT, where the roster
// resets and youth is worth nothing. In dynasty it is the correct analysis.
export type SummaryCheckOpts = {
  // Tokens identifying pieces each side RECEIVED in this trade: surnames
  // and rank labels ("Nabers", "WR13").
  receivedTokens?: string[]
  // Exact side names. A fragment of one of these is a violation: "Kyle's"
  // for "Kyle's Foreskin" names a different team in a league with two
  // Kyles, and the reader can't tell which.
  sideNames?: string[]
  // Every rank label in the trade, flagged when the player is deep enough
  // that printing his exact rank is false precision.
  rankLabels?: Array<{ label: string; deep: boolean }>
  // The grades that will actually be stored, by side name. The prose has to
  // argue THESE. Before this existed the clamp could correct an inverted
  // grade after the model had already written a paragraph arguing the
  // opposite, and the page shipped "IsAAcShake wins this trade" sitting next
  // to a higher grade for tinfoil99. A grade and its own explanation
  // disagreeing in public is worse than either being wrong alone.
  finalGrades?: Array<{ name: string; grade: string }>
  // The week the trade happened, null for preseason. Standings language is
  // only legitimate once a record exists to talk about.
  week?: number | null
  // Per-position, per-side: the best piece that side received at a position
  // against the best piece it gave up there. The model wrote that one side
  // "gave up the better WR" when the WR it received outranked and outvalued
  // the one it sent, which is the worst kind of error here: confidently
  // stated, and contradicted by the numbers printed on the same page.
  positionSwaps?: PositionSwap[]
}

// Which side of a same-position swap got the better player. Built from the
// consensus values the anchor itself is computed from, so a violation is a
// contradiction of the trade's own data, not a matter of opinion.
export type PositionSwap = {
  // Manager/team name, exactly as the prompt names the side.
  side: string
  // 'WR', 'RB', 'TE', 'QB'.
  pos: string
  received: SwapPiece
  gave: SwapPiece
  // 'received' = this side improved at the position, 'gave' = it gave up the
  // better player, 'even' = the two are close enough that either reading is
  // defensible.
  better: 'received' | 'gave' | 'even'
}

export type SwapPiece = {
  name: string
  rank: string | null
  value: number
  injured: boolean
}

// Words that name a position in prose. Used to tie a claim in a sentence to
// a computed swap. "back" alone is deliberately absent: "takes back", "the
// back end of the roster" and "back-to-back" all contain it.
const POSITION_NOUNS: Record<string, string[]> = {
  QB: ['quarterback', 'quarterbacks', 'qb', 'qbs', 'passer'],
  RB: ['running back', 'running backs', 'runningback', 'rb', 'rbs', 'rusher', 'backfield'],
  WR: ['receiver', 'receivers', 'wideout', 'wideouts', 'wr', 'wrs', 'pass catcher', 'pass catchers', 'pass-catcher'],
  TE: ['tight end', 'tight ends', 'te', 'tes'],
}

// Verbs that point out of a roster, and verbs that point into one. Same
// vocabulary the DIRECTION rules in the prompt police, reused here so a
// claim can be read as "gave the better X" or "got the better X".
const GAVE_VERBS = /\b(gave|gives|giving|given|sent|sends|sending|shipped|ships|shipping|flipped|flips|dealt|deals|parted|parts|surrendered|surrenders|traded away|trades away|moved on from|moves on from|cashed in|out the door)\b/i
const GOT_VERBS = /\b(gets|got|getting|lands|landed|adds|added|acquires|acquired|receives|received|picks up|picked up|takes back|took back|comes away with|came away with|walks off with|buys|bought|brings in|brought in)\b/i
const SUPERIOR = /\b(better|best|stronger|superior|more valuable|higher[- ]ranked|higher[- ]valued)\b/i
const INFERIOR = /\b(downgrade|step down|worse|lesser|weaker)\b/i

// Does this write-up print a letter grade? Exported so the verdict pass,
// which runs no corrective loop of its own, can at least report one.
export function hasLetterGradeInProse(text: string): boolean {
  return LETTER_GRADE_PATTERNS.some((re) => re.test(text))
}

// A letter grade written into the prose. The grades are printed directly
// above the write-up, so "the stronger package (B+)" tells the reader
// something he is already looking at, in the ugliest possible way.
//
// The signed forms are matched case-sensitively and bare letters only in
// grade-shaped phrases, because "a B" and "a C" are cheap false positives
// and a wrong violation costs a Groq call to "fix" copy that was fine.
const LETTER_GRADE_PATTERNS: RegExp[] = [
  // "(B+)", "(b-)", "( A )" — a grade parked in parentheses.
  /\(\s*[A-DFa-df]\s*[+-]?\s*\)/,
  // "B+", "A-" loose in a sentence. The sign makes it unambiguous.
  /(?<![A-Za-z0-9])[A-DF][+-](?![A-Za-z0-9])/,
  // "a B package", "the C side", "an A haul".
  /\b(?:an?|the)\s+[A-DF][+-]?\s+(?:grade|mark|package|haul|side|deal|return|verdict|trade|write-?up)\b/,
  // "grade of B", "graded a C+", "earns a B". The trailing class rules out
  // "earned a D/ST" and "earns a D-line role", where the letter is the start
  // of a word rather than a grade.
  /\b(?:grade[sd]?|graded out at|earns|earned)\s+(?:of\s+|as\s+an?\s+|an?\s+)?[A-DF][+-]?(?![A-Za-z0-9/-])/,
]

export function summaryViolations(
  text: string,
  leagueType: string,
  opts: SummaryCheckOpts = {},
): string[] {
  const {
    receivedTokens = [],
    sideNames = [],
    rankLabels = [],
    finalGrades = [],
    week = null,
    positionSwaps = [],
  } = opts
  const out: string[] = []
  const t = text.toLowerCase()

  // "already had Tee Higgins" / "already stocked with a WR13" about a piece
  // acquired IN this trade. The roster context is rewound to pre-trade so
  // the data no longer suggests it, but the model still says it, and it is
  // the most confusing thing it can get wrong: it inverts who gave up whom.
  //
  // Matched on "already" near any token that identifies an incoming piece,
  // rather than on a verb list. The first version keyed off
  // had/has/held/rostered/featured and missed "already STOCKED with a
  // WR13", which also swapped the name for the rank label. Tokens are
  // therefore both surnames AND rank labels, and any verb counts.
  //
  // "already deep at WR" with no specific piece named stays legal: that is
  // real pre-trade context and the prompt asks for it.
  for (const token of receivedTokens) {
    const t2 = token.trim()
    if (t2.length < 3) continue
    const esc = t2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`already[^.]{0,70}\\b${esc}\\b`, 'i').test(text)) {
      out.push(`said a side "already" had ${t2}, which they RECEIVED in this trade`)
    }
  }

  if (/[\u2014\u2013]/.test(text)) out.push('used an em/en dash')
  if (/while the (added|acquired|included)\b/.test(t)) {
    out.push('used a "while the added X" clause to tack on a second player')
  }

  // Gesturing at the verdict instead of stating it. Naming a winner is
  // encouraged now; these are the genteel substitutes that say a side came
  // out ahead without ever saying so.
  const HEDGES = [
    'higher mark', 'lower mark', 'better mark',
    'better end of', 'the better of it', 'the nod',
    'ahead on paper', 'edges it out', 'edges out',
    'right side of the ledger', 'comes out on top on balance',
  ]
  // The prose must name the side that actually holds the best grade. The
  // model writes grades and summary in one breath, and the clamp may then
  // correct a grade it got backwards; without this check the corrected
  // number ships beside the original argument for the other side.
  if (finalGrades.length > 1) {
    const ranked = [...finalGrades].sort((a, b) => GRADE_SCALE.indexOf(b.grade) - GRADE_SCALE.indexOf(a.grade))
    const top = ranked[0]
    const tied = ranked.filter((g) => g.grade === top.grade).length > 1
    if (!tied) {
      for (const loser of ranked.slice(1)) {
        // "<loser> wins/won this trade" in any spacing, with the winner's
        // name absent from the same clause.
        const esc = loser.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const claimsWin = new RegExp(`${esc}[^.]{0,60}?\\b(wins|won|takes|came away with|comes away with)\\b[^.]{0,40}?\\b(this trade|the trade|the deal)\\b`, 'i')
        if (claimsWin.test(text)) {
          out.push(
            `wrote that ${loser.name} won the trade, but the stored grades are ` +
            `${ranked.map((g) => `${g.name} ${g.grade}`).join(', ')}; the summary must argue the grade ${top.name} actually received`,
          )
        }
      }
    }
  }

  // A letter grade in the prose. Checked before anything else about the
  // sentence because it is unconditional: there is no context in which the
  // write-up should contain one.
  if (hasLetterGradeInProse(text)) {
    out.push(
      'printed a letter grade in the write-up (e.g. "the stronger package (B+)"); ' +
      'the grades are displayed directly above this text, so never write a letter grade in the prose',
    )
  }

  // Who got the better player at a position, checked against the values.
  //
  // Scoped to sentences naming exactly ONE side: a sentence mentioning both
  // managers can attach its verb to either of them, and a false violation
  // costs a corrective Groq call on copy that was already right.
  if (positionSwaps.length > 0 && sideNames.length > 0) {
    const sentences = text.split(/(?<=[.!?])\s+/)
    for (const sentence of sentences) {
      const named = sideNames.filter((n) => n && sentence.toLowerCase().includes(n.toLowerCase()))
      if (named.length !== 1) continue
      const who = named[0]
      const gaveClaim = GAVE_VERBS.test(sentence)
      const gotClaim = GOT_VERBS.test(sentence)
      // Both directions in one sentence ("sent two picks and landed a WR1")
      // makes the claim unattributable. Leave it alone.
      if (gaveClaim === gotClaim) continue

      for (const swap of positionSwaps) {
        if (swap.side.toLowerCase() !== who.toLowerCase()) continue
        if (swap.better === 'even') continue
        const nouns = POSITION_NOUNS[swap.pos] ?? [swap.pos.toLowerCase()]
        const mentionsPos = nouns.some((n) =>
          new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(sentence))
        if (!mentionsPos) continue

        const said = (piece: SwapPiece) =>
          `${piece.name}${piece.rank ? ` (${piece.rank}, value ${piece.value})` : ` (value ${piece.value})`}`
        // "gave up the better WR" / "a downgrade at receiver" while the data
        // says the incoming player is the better one.
        if (gaveClaim && swap.better === 'received' && (SUPERIOR.test(sentence) || INFERIOR.test(sentence))) {
          out.push(
            `wrote that ${who} gave up the better ${swap.pos} or came out worse there, but ${said(swap.received)} ` +
            `is the ${swap.pos} ${who} RECEIVED and he outranks and outvalues ${said(swap.gave)}, the one ${who} sent away`,
          )
        }
        // "lands the better receiver" while the data says the opposite.
        if (gotClaim && swap.better === 'gave' && SUPERIOR.test(sentence)) {
          out.push(
            `wrote that ${who} got the better ${swap.pos}, but ${said(swap.received)} is what ${who} received and ` +
            `${said(swap.gave)}, the one ${who} gave up, is the better player`,
          )
        }
      }
    }
  }

  const hedged = HEDGES.filter((h) => t.includes(h))
  if (hedged.length > 0) {
    out.push(
      `described the verdict instead of stating it (${hedged.join(', ')}); ` +
      'say plainly who wins the trade or takes the higher grade',
    )
  }

  // Rank labels. Two failures, both of which read as padding:
  //   \u2022 the same rank printed twice, once for the side that got the player
  //     and once for the side that gave him up, which the lists already say
  //   \u2022 an exact rank for a player too deep to start, where the number is
  //     precision about nothing
  // "(rank RB12)" — the word "rank" inside the parentheses is noise. The
  // reader can see RB12 is a rank. Caught here rather than left to the prompt
  // because it appeared in every sentence of both write-ups at once, which is
  // exactly the kind of tic a deterministic check kills for good.
  if (/\(\s*rank\s+[A-Za-z]{1,3}\d+\s*\)/i.test(text)) {
    out.push('wrote "(rank RB12)" style parentheses; drop the word "rank" and write "(RB12)", or fold it into the noun as "a busted TE2"')
  }

  for (const { label, deep } of rankLabels) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const hits = text.match(new RegExp(`\\b${esc}\\b`, 'gi'))
    if (!hits) continue
    if (hits.length > 1) {
      out.push(`printed the rank "${label}" ${hits.length} times; name a player's rank once, on the side that received him`)
    }
    if (deep) {
      out.push(`cited the exact rank "${label}" for a player who will not start; describe the role instead (e.g. "a bench receiver who won't crack the lineup")`)
    }
  }
  // Negative space. The prompt tells the model which factors don't count in
  // this league; the model then writes that down ("while the age gap is
  // irrelevant in redraft..."). The reader never saw the instructions, so a
  // clause about what does NOT matter is pure filler, and in practice it
  // isn't even attached to a player.
  const NON_FACTOR: Array<[RegExp, string]> = [
    [/\birrelevant\b/i, 'irrelevant'],
    [/\bmoot\b/i, 'moot'],
    [/\bnon-?factor\b/i, 'non-factor'],
    [/\b(does|do)(n'?t| not)\s+(really\s+)?(matter|count|apply)\b/i, "doesn't matter"],
    [/\bmatters?\s+(little|less|not)\b/i, 'matters little'],
    [/\b(worth|means)\s+nothing\b/i, 'worth nothing'],
    [/\bno\s+(premium|bearing|impact here)\b/i, 'no premium'],
    [/\bsetting\s+aside\b/i, 'setting aside'],
    [/\bregardless\s+of\s+(age|youth|upside)\b/i, 'regardless of age'],
  ]
  // Showy acquisition verbs. All of these are direction-correct, so the
  // DIRECTION rules never catch them; they're just dressed up. "Snaps up"
  // is the one that prompted this: if the reader has to stop and work out
  // what the verb means, it was the wrong verb.
  const SHOWY_VERBS = [
    /\bsnap(s|ped)?\s+up\b/i, /\bscoop(s|ed)?\s+up\b/i, /\bnab(s|bed)?\b/i,
    /\breel(s|ed)?\s+in\b/i, /\bhaul(s|ed)?\s+in\b/i, /\bpr(y|ies|ied)\s+away\b/i,
    /\bpluck(s|ed)?\b/i, /\bswoop(s|ed)?\b/i, /\bink(s|ed)\b/i,
    /\bsnag(s|ged)?\b/i, /\bsnare(s|d)?\b/i, /\bpoach(es|ed)?\b/i,
    /\bswipe(s|d)\b/i,
  ]
  if (SHOWY_VERBS.some((re) => re.test(text))) {
    out.push('used a showy acquisition verb (snaps up / nabs / reels in / similar); use lands, adds, gets or acquires')
  }

  const nonFactor = NON_FACTOR.filter(([re]) => re.test(text)).map(([, label]) => label)
  if (nonFactor.length > 0) {
    out.push(
      `wrote about a factor that does NOT apply (${nonFactor.join(', ')}); ` +
      'leave an inapplicable factor out silently instead of writing a clause negating it',
    )
  }

  // Explaining the league's own format back to a manager who plays in it.
  if (/\b(in|for)\s+(a\s+|this\s+)?(redraft|dynasty|keeper)\s+(league|format|setup)/i.test(text)
      || /\bin\s+this\s+format\b/i.test(text)
      || /\brosters?\s+reset\b/i.test(text)) {
    out.push('explained the league format back to the reader; he already knows what league he is in')
  }

  if (leagueType === 'redraft') {
    // Intent framing. Every manager in a one-year league is trying to make
    // the playoffs every season, and the season resets afterward, so nobody
    // is tanking or rebuilding and there are no buyers and sellers. Calling
    // one side's trade "a playoff push" implies the other side isn't
    // chasing the same thing, which is never true here.
    //
    // Standings language is legal from week 7 on, where a record exists and
    // is fed to the model. Before that (and in the preseason, where week is
    // null) any of it is invention.
    const STANDINGS_TALK = [
      /\bplayoff push\b/i, /\bpostseason push\b/i, /\bmaking a push\b/i,
      /\bwin-?now\b/i, /\bgoing for it\b/i, /\ball-?in\b/i,
      /\bbuyers?\b/i, /\bsellers?\b/i, /\bpunting\b/i, /\btanking\b/i,
      /\bplayoff (spot|berth|hopes|picture|race|position)\b/i,
      /\bin the hunt\b/i, /\bseeding\b/i, /\bbubble\b/i,
    ]
    const standingsHits = STANDINGS_TALK.filter((re) => re.test(text))
    if (standingsHits.length > 0) {
      const when = week == null ? 'a preseason trade' : `a week ${week} trade`
      if (week == null || week < STANDINGS_TALK_FROM_WEEK) {
        out.push(
          `framed ${when} around playoff positioning; every manager in this league is chasing ` +
          `the playoffs every year, and before week ${STANDINGS_TALK_FROM_WEEK} there is no record to argue from`,
        )
      }
    }

    // Deliberately NOT 'upside': in redraft that means this week's ceiling,
    // which is exactly the right thing to talk about. Only terms that are
    // meaningless without a next season belong here.
    const dynastyTerms = [
      'younger', 'youth', 'youthful', 'ascending', 'age curve',
      // "age gap" / "age difference" slipped past the original list, which
      // is how "while the age gap is irrelevant in redraft" got printed.
      'age gap', 'age difference', 'age profile',
      'contention window', 'long-term', 'long term', 'win-now', 'rebuilding',
      'future value', 'years of control',
    ]
    const hits = dynastyTerms.filter((w) => t.includes(w))
    if (hits.length > 0) {
      out.push(`used dynasty reasoning in a redraft league (${hits.join(', ')})`)
    }
  }
  // Half a team name. Checked by blanking every full, correct mention
  // first, then looking for any distinctive word of that name still
  // loose in the text.
  const norm = (x: string) => x.replace(/[\u2018\u2019]/g, "'")
  let residue = norm(text)
  for (const name of sideNames) {
    const full = norm(name).trim()
    if (!full) continue
    residue = residue.replace(new RegExp(full.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
  }
  for (const name of sideNames) {
    const words = norm(name).trim().split(/\s+/).filter((w) => w.replace(/[^a-z']/gi, '').length >= 3)
    if (words.length < 2) continue
    for (const w of words) {
      const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(`\\b${esc}`, 'i').test(residue)) {
        out.push(`used a fragment of a team name ("${w}") instead of the full "${name}"`)
        break
      }
    }
  }

  return out
}

// Before this week a redraft trade has no standings story. Everyone is 0-0
// or close to it, everyone is trying to make the playoffs, and "X is making
// a playoff push" says nothing except that the model needed a sentence.
export const STANDINGS_TALK_FROM_WEEK = 7

export const FIRST_GRADED_SEASON = 2026

// Each manager's record through the week BEFORE a trade, plus where that
// put them in the league. The grader had no standings data at all, which
// did not stop the model from writing that one side was pushing for the
// playoffs off a preseason deal. Regular-season games only: a playoff
// result can't precede an in-season trade anyway, and counting them would
// mix two different things.
type RecordLine = { w: number; l: number; t: number; pf: number; rank: number; of: number }

async function loadRecordsBefore(
  db: ReturnType<typeof createAdminClient>,
  seasonId: string,
  week: number | null,
): Promise<Map<string, RecordLine>> {
  const out = new Map<string, RecordLine>()
  if (week == null || week < STANDINGS_TALK_FROM_WEEK) return out

  const { data } = await db
    .from('matchups')
    .select('manager_a_id, manager_b_id, score_a, score_b')
    .eq('season_id', seasonId)
    .eq('is_playoff', false)
    .lt('week', week)
  if (!data || data.length === 0) return out

  const tally = new Map<string, { w: number; l: number; t: number; pf: number }>()
  const bump = (id: string) => {
    let r = tally.get(id)
    if (!r) { r = { w: 0, l: 0, t: 0, pf: 0 }; tally.set(id, r) }
    return r
  }
  for (const m of data) {
    const a = m.manager_a_id as string
    const b = m.manager_b_id as string
    const sa = m.score_a as number | null
    const sb = m.score_b as number | null
    // An unplayed or unscored matchup contributes nothing. Treating a null
    // as a zero would hand somebody a loss they never played.
    if (sa == null || sb == null) continue
    const ra = bump(a)
    const rb = bump(b)
    ra.pf += sa
    rb.pf += sb
    if (sa > sb) { ra.w += 1; rb.l += 1 }
    else if (sb > sa) { rb.w += 1; ra.l += 1 }
    else { ra.t += 1; rb.t += 1 }
  }

  // Rank by wins, then points for, the way almost every fantasy platform
  // breaks a tie.
  const ordered = [...tally.entries()].sort((x, y) =>
    y[1].w - x[1].w || y[1].pf - x[1].pf)
  ordered.forEach(([id, r], i) => {
    out.set(id, { ...r, rank: i + 1, of: ordered.length })
  })
  return out
}

function formatRecord(r: RecordLine): string {
  const wl = r.t > 0 ? `${r.w}-${r.l}-${r.t}` : `${r.w}-${r.l}`
  return `${wl}, ${ordinal(r.rank)} of ${r.of} by record`
}

// A verdict lands four weeks after the week the trade happened, not four
// weeks after the grade was written. Grading time is an artifact of when the
// cron ran, so every trade from a given week gets its verdict on the same
// week this way, which is what makes the verdict desk read like a scheduled
// column rather than a trickle.
export const REVISIT_LAG_WEEKS = 4

// Is this trade's verdict week here yet?
//
// Preseason trades carry no week and sit at week 0, so their verdicts land in
// week 4, the week before a week-1 trade's. Shared by the daily cron and the
// manual per-league revisit tool so "due" means one thing in both.
export function verdictIsDue(args: {
  tradeWeek: number | null
  seasonIsLive: boolean
  seasonSettings: Record<string, unknown> | null | undefined
}): boolean {
  const tradeWeek = typeof args.tradeWeek === 'number' && args.tradeWeek > 0 ? args.tradeWeek : 0
  const dueWeek = tradeWeek + REVISIT_LAG_WEEKS

  // A season that is no longer live has finished: there is nothing left to
  // wait for, so any outstanding verdict is due.
  if (!args.seasonIsLive) return true

  const current = resolveCurrentWeek(args.seasonSettings ?? {})
  // No resolvable week means no schedule to judge against. Wait rather than
  // guess, so a misconfigured season doesn't hand out early verdicts.
  if (current == null) return false
  return current >= dueWeek
}

type TradePlatform = 'sleeper' | 'espn' | 'yahoo' | 'nfl'

// Everything the prompt formatter needs to describe a player asset with
// real market context, regardless of which platform the trade came from.
// All maps are keyed by SLEEPER id — resolveSleeperId translates each
// asset first.
type ValueBundle = {
  // Consensus market values from the same engine the Analyzer / Finder /
  // Rumor Mill run on. Empty map when valuation failed (prompt degrades
  // to "(no value data)").
  consensus: Map<string, ConsensusValue>
  // "RB7"-style labels derived from consensus ordering within position.
  rankLabels: Map<string, string>
  // Sleeper metadata rows (age / injury status) — cheap secondary lookup.
  meta: Map<string, PlayerValue>
}

// Resolve a player asset to its Sleeper id. Sleeper trades store Sleeper
// ids natively; ESPN / Yahoo / NFL trades store platform-native ids, so we
// fall back to the same name+position match the rank stamper uses. Returns
// null when the asset can't be resolved (deep bench, defense in a weird
// format) — the prompt then shows the asset without value data.
function resolveSleeperId(
  a: Record<string, unknown>,
  platform: TradePlatform,
  nameLookup: Map<string, string> | null,
): string | null {
  if (a.kind !== 'player') return null
  const pid = typeof a.player_id === 'string' ? a.player_id : null
  if (platform === 'sleeper') return pid
  const name = typeof a.name === 'string' ? a.name : null
  const position = typeof a.position === 'string' ? a.position : null
  if (!name || !nameLookup) return null
  // Position-qualified first; bare-name fallback covers assets with no
  // position stored (retired players in old archives) — buildNameLookup
  // only registers bare names when they're unique, so this can't mismatch.
  if (position) {
    const exact = nameLookup.get(nameKey(name, position))
    if (exact) return exact
  }
  return nameLookup.get(nameKey(name, '')) ?? null
}

// "RB7"-style position rank labels from the consensus value ordering.
// Mirrors how the Analyzer's percentile badges are derived, but as a rank
// integer, which reads better in prose.
function consensusRankLabels(values: Map<string, ConsensusValue>): Map<string, string> {
  const byPos = new Map<string, Array<{ id: string; value: number }>>()
  for (const [pid, pv] of values) {
    const pos = pv.position.toUpperCase()
    if (!['QB', 'RB', 'WR', 'TE'].includes(pos)) continue
    const arr = byPos.get(pos) ?? []
    arr.push({ id: pid, value: pv.value })
    byPos.set(pos, arr)
  }
  const out = new Map<string, string>()
  for (const [pos, arr] of byPos) {
    arr.sort((a, b) => b.value - a.value)
    arr.forEach((e, i) => out.set(e.id, `${pos}${i + 1}`))
  }
  return out
}

// One-line positional depth summary per trade side, built from the
// Analyzer's cross-platform roster loader — works for Sleeper, ESPN,
// Yahoo, and NFL.com alike (the loader translates every roster to Sleeper
// ids). Summaries reflect the CURRENT roster, not the at-trade roster;
// the prompt discloses that caveat.
//
// Returns Map<side_id, summary>. Sides whose manager can't be matched to
// a live roster just get no summary line.
// Roster context for each side, rewound to BEFORE this trade.
//
// data.rosters is the CURRENT roster, and for a trade that has already
// executed that means the players acquired in it are sitting on the
// receiving team. Handed to the model as "Current roster", it read them as
// pre-existing depth and wrote things like "Goodhead already had a top-13
// WR" about the exact player he had just traded for, then docked him for
// buying a position he was supposedly already deep at.
//
// Rewinding is what makes the line mean what the prompt says it means:
// drop what this side received, add back what it sent.
function buildRosterSummaries(args: {
  data: AnalyzerLeagueData
  sides: Array<{
    side_id: string
    manager_external_id: string | null
    receivedIds: string[]
    sentIds: string[]
  }>
  bundle: ValueBundle
}): Map<string, string> {
  const POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const
  const out = new Map<string, string>()
  for (const side of args.sides) {
    if (!side.manager_external_id) continue
    const roster: AnalyzerRoster | undefined = args.data.rosters.find(
      (r) => r.ownerId === side.manager_external_id,
    )
    if (!roster || roster.playerIds.length === 0) continue

    const received = new Set(side.receivedIds)
    const preTrade = roster.playerIds.filter((pid) => !received.has(pid))
    for (const pid of side.sentIds) {
      if (!preTrade.includes(pid)) preTrade.push(pid)
    }

    const byPos = new Map<string, Array<{ value: number; label: string }>>()
    for (const pid of preTrade) {
      const p = args.data.players[pid]
      const pos = (p?.position ?? '').toUpperCase()
      if (!(POSITIONS as readonly string[]).includes(pos)) continue
      const value = args.bundle.consensus.get(pid)?.value ?? 0
      const rank = args.bundle.rankLabels.get(pid)
      const arr = byPos.get(pos) ?? []
      arr.push({ value, label: `${p?.name ?? pid}${rank ? ` (${rank})` : ''}` })
      byPos.set(pos, arr)
    }

    const fragments: string[] = []
    for (const pos of POSITIONS) {
      const arr = byPos.get(pos) ?? []
      arr.sort((a, b) => b.value - a.value)
      if (arr.length === 0) {
        fragments.push(`${pos}: none`)
        continue
      }
      const top = arr.slice(0, 3).map((p) => p.label)
      const more = arr.length > 3 ? ` +${arr.length - 3}` : ''
      fragments.push(`${pos}(${arr.length}): ${top.join(', ')}${more}`)
    }
    out.set(side.side_id, fragments.join(' | '))
  }
  return out
}

// Valid letter grades. Used both in the prompt (so the model knows what to
// return) and at parse time to reject hallucinated grades like "B--".
const VALID_GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'] as const
type Grade = typeof VALID_GRADES[number]

export type GradeResult = {
  trade_id: string
  graded_sides: number
  warnings: string[]
}

// Everything a grading pass needs to know about one trade, gathered once.
//
// gradeTrade and regradeTrade both work from this. The letters-only regrade
// exists exactly because the write-up is expensive and often already good, so
// it has to land on the SAME anchors the full pass uses. A second copy of this
// loading logic would drift, and the two flows would start grading the same
// trade differently without anyone noticing.
type GradingContext = {
  leagueType: 'redraft' | 'keeper' | 'dynasty'
  seasonYear: number
  tradeWeek: number | null
  // The write-up currently on the page, so a letters-only regrade can check
  // whether the prose still argues the grades it is about to store.
  aiSummary: string | null
  sides: Array<{
    side_id: string
    manager_name: string
    assets: Array<Record<string, unknown>>
    roster_summary: string | null
    record: string | null
  }>
  bundle: ValueBundle
  sidByAsset: Map<Record<string, unknown>, string>
  anchorRosterCtx: AnchorRosterCtx | null
  anchors: Map<string, GradeAnchor>
  // Everything summaryViolations needs except the grades themselves, which
  // aren't known until the model (or the anchor) has produced them.
  lint: SummaryCheckOpts
}

async function loadGradingContext(
  db: ReturnType<typeof createAdminClient>,
  tradeId: string,
  warnings: string[],
): Promise<GradingContext | null> {
  // 1. Load trade + sides + manager display + league type. We also pull
  // seasons.external_id (the platform's league ID for that season) so the
  // roster-context lookup can hit the right Sleeper league for historical
  // trades.
  const { data: trade, error: tErr } = await db
    .from('trades')
    .select('id, league_id, season_id, week, executed_at, platform, ai_summary, leagues!inner(league_type, trade_desk_settings), seasons!inner(year, external_id)')
    .eq('id', tradeId)
    .maybeSingle()
  if (tErr || !trade) {
    warnings.push(`load trade ${tradeId}: ${tErr?.message ?? 'not found'}`)
    return null
  }

  const { data: sides, error: sErr } = await db
    .from('trade_sides')
    .select('id, manager_id, assets, managers!inner(display_name, team_name, external_id)')
    .eq('trade_id', tradeId)
  if (sErr || !sides || sides.length < 2) {
    warnings.push(`load sides for trade ${tradeId}: ${sErr?.message ?? 'fewer than 2 sides'}`)
    return null
  }

  const league = Array.isArray(trade.leagues) ? trade.leagues[0] : trade.leagues
  const season = Array.isArray(trade.seasons) ? trade.seasons[0] : trade.seasons
  const leagueType = (league?.league_type as 'redraft' | 'keeper' | 'dynasty') ?? 'redraft'
  const seasonYear = season?.year ?? null
  const platform = ((trade.platform as string | null) ?? 'sleeper') as TradePlatform

  if (seasonYear == null || seasonYear < FIRST_GRADED_SEASON) {
    warnings.push(`trade ${tradeId}: season ${seasonYear ?? 'unknown'} is before ${FIRST_GRADED_SEASON}, not graded`)
    return null
  }

  // 2. Resolve every player asset to a Sleeper id so value data attaches
  // on ALL platforms — ESPN/Yahoo/NFL trades store platform-native ids
  // that would otherwise miss every lookup.
  const nameLookup = platform === 'sleeper' ? null : await buildNameLookup()
  const sidByAsset = new Map<Record<string, unknown>, string>()
  const resolvedIds: string[] = []
  for (const s of sides) {
    for (const a of (s.assets as Array<Record<string, unknown>>) ?? []) {
      const sid = resolveSleeperId(a, platform, nameLookup)
      if (sid) {
        sidByAsset.set(a, sid)
        resolvedIds.push(sid)
      }
    }
  }

  // 3. League context + consensus values — the SAME engine the Analyzer /
  // Finder / Rumor Mill run on, calibrated to the league's effective
  // settings (mode, superflex, scoring, TE premium, source preference).
  // loadAnalyzerData also gives us cross-platform rosters for the depth
  // summaries. Every step is best-effort: a failure degrades the prompt,
  // never blocks the grade.
  let effective: EffectiveSettings
  let analyzerData: AnalyzerLeagueData | null = null
  const load = await loadAnalyzerData(trade.league_id as string, { lookupBy: 'id' })
  if (load.ok) {
    analyzerData = load.data
    effective = load.data.effective
  } else {
    warnings.push(`league context: ${load.error.kind}, grading without roster context`)
    effective = mergeEffective(parseSettings(league?.trade_desk_settings), {
      mode: leagueType as LeagueMode,
      lineupType: null,
      teamCount: null,
      qbStarters: null,
      tePremium: null,
    })
  }

  let consensus = new Map<string, ConsensusValue>()
  try {
    const valuation = await valuateLeague(
      {
        mode: effective.mode,
        qbStarters: effective.qbStarters,
        teamCount: effective.teamCount,
        scoringProfile: effective.scoringProfile,
        tePremium: effective.tePremium,
        sourcePreference: effective.valueSourcePreference,
      },
      // Live pull, not the 6h browse cache. Trades are usually made ON news,
      // so pricing one off a pre-news snapshot doesn't just lose nuance, it
      // argues the wrong side. Memoized per run in lib/values/cache, so the
      // 40 calls a full grading run makes cost one fetch per provider.
      { fresh: true },
    )
    consensus = valuation.values
    // A provider dropping out changes the blend, which moves the anchor,
    // which moves the grade. Surface it rather than letting a trade quietly
    // grade off four sources today and five tomorrow.
    for (const a of valuation.attempts) {
      if (!a.ok) warnings.push(`value source ${a.label} contributed nothing (${a.message ?? 'no reason given'}); the anchor was blended without it`)
    }
  } catch (e) {
    warnings.push(`consensus values: ${(e as Error).message}`)
  }

  // No values at all means every provider failed. The prompt would still
  // produce a confident, readable grade off roster context alone, and that
  // grade is permanent. Bail instead: the trade stays ungraded and the next
  // daily run picks it up once the providers are answering again.
  if (consensus.size === 0) {
    warnings.push(`trade ${tradeId}: no consensus values available, not graded (will retry next run)`)
    return null
  }

  const bundle: ValueBundle = {
    consensus,
    rankLabels: consensusRankLabels(consensus),
    meta: await getSleeperValuesForPlayerIds(resolvedIds),
  }

  const rosterSummaries = analyzerData
    ? buildRosterSummaries({
        data: analyzerData,
        sides: sides.map((s) => {
          const mgr = Array.isArray(s.managers) ? s.managers[0] : s.managers
          const own = ((s.assets as Array<Record<string, unknown>>) ?? [])
            .map((a) => sidByAsset.get(a))
            .filter((x): x is string => !!x)
          // What this side SENT is what every other side received.
          const others = sides
            .filter((o) => o.id !== s.id)
            .flatMap((o) => ((o.assets as Array<Record<string, unknown>>) ?? []))
            .map((a) => sidByAsset.get(a))
            .filter((x): x is string => !!x)
          return {
            side_id: s.id as string,
            manager_external_id: (mgr?.external_id as string | null) ?? null,
            receivedIds: own,
            sentIds: others,
          }
        }),
        bundle,
      })
    : new Map<string, string>()

  // Roster context for the lineup-basis anchor. Built from the same
  // analyzerData the prose summaries use, so when the write-up can describe
  // a roster the grade is computed against that roster too.
  const anchorRosterCtx: AnchorRosterCtx | null = analyzerData
    ? (() => {
        const bySide = new Map<string, { after: string[]; received: string[]; sent: string[] }>()
        for (const s of sides) {
          const mgr = Array.isArray(s.managers) ? s.managers[0] : s.managers
          const ext = (mgr?.external_id as string | null) ?? null
          if (!ext) continue
          const roster = analyzerData.rosters.find((r) => r.ownerId === ext)
          if (!roster || roster.playerIds.length === 0) continue
          const own = ((s.assets as Array<Record<string, unknown>>) ?? [])
            .map((a) => sidByAsset.get(a))
            .filter((x): x is string => !!x)
          const others = sides
            .filter((o) => o.id !== s.id)
            .flatMap((o) => ((o.assets as Array<Record<string, unknown>>) ?? []))
            .map((a) => sidByAsset.get(a))
            .filter((x): x is string => !!x)
          bySide.set(s.id as string, { after: roster.playerIds, received: own, sent: others })
        }
        return bySide.size > 0 ? { slots: DEFAULT_SLOTS, bySide } : null
      })()
    : null

  // Records as they stood going into this trade. Empty before week 7 by
  // design, so the model can't reach for a standings angle that doesn't
  // exist yet.
  const tradeWeek = (trade.week as number | null) ?? null
  const records = await loadRecordsBefore(db, trade.season_id as string, tradeWeek)

  const ctxSides = sides.map((s) => {
    const mgr = Array.isArray(s.managers) ? s.managers[0] : s.managers
    const rec = records.get(s.manager_id as string)
    return {
      side_id: s.id as string,
      manager_name: (mgr?.team_name as string | null) || (mgr?.display_name as string) || 'Manager',
      assets: (s.assets as Array<Record<string, unknown>>) ?? [],
      roster_summary: rosterSummaries.get(s.id as string) ?? null,
      record: rec ? formatRecord(rec) : null,
    }
  })

  const anchors = computeGradeAnchors(ctxSides, bundle, sidByAsset, anchorRosterCtx)

  // Always report the anchor, even when nothing is wrong. This is the number
  // the whole grade is built on and it never appeared anywhere a human could
  // read it, so "why did this side lose?" was unanswerable from the outside.
  //
  // It is labelled as a STARTING POINT because it is not the stored grade:
  // the model may move a notch or two off it, and reading this line as the
  // final letters (then finding different ones on the page) is a trap it set
  // more than once. Every flow that writes grades also reports what it wrote.
  {
    const parts = ctxSides.map((s) => {
      const a = anchors.get(s.side_id)
      if (!a) return `${s.manager_name} no anchor`
      const how = a.detail ?? `package ${Math.round(a.eff)}`
      return `${s.manager_name} ${a.grade} (${how}${a.confident ? '' : ', low confidence'})`
    })
    const basis = anchors.values().next().value?.basis ?? 'package'
    warnings.push(`anchor, the starting point before the model moves off it [${basis} basis]: ${parts.join('  |  ')}`)
  }

  // Surname + rank label for every incoming piece, so the factual check
  // catches both "already had Nabers" and "already stocked with a WR13".
  const receivedTokens = ctxSides.flatMap((sd) =>
    sd.assets
      .filter((a) => a.kind === 'player')
      .flatMap((a) => {
        const toks: string[] = []
        const nm = typeof a.name === 'string' ? a.name.trim() : ''
        const last = nm.split(/\s+/).slice(-1)[0]
        if (last && last.length >= 3) toks.push(last)
        const sid = sidByAsset.get(a)
        const rank = sid ? bundle.rankLabels.get(sid) : undefined
        if (rank) toks.push(rank)
        return toks
      }),
  )

  // Every rank label in the deal, deduped, with the ones past DEEP_RANK
  // flagged. The threshold matches the tier reference in the prompt
  // (49+ is deep depth / waiver), and it's deliberately conservative:
  // a WR35 can still be a flex start, so only numbers that can't be a
  // starter anywhere get called out.
  const DEEP_RANK = 48
  const rankLabels = [...new Set(
    ctxSides.flatMap((sd) =>
      sd.assets
        .filter((a) => a.kind === 'player')
        .map((a) => {
          const sid = sidByAsset.get(a)
          return sid ? bundle.rankLabels.get(sid) : undefined
        })
        .filter((r): r is string => !!r),
    ),
  )].map((label) => {
    const n = Number(label.replace(/^[A-Za-z]+/, ''))
    return { label, deep: Number.isFinite(n) && n > DEEP_RANK }
  })

  return {
    leagueType,
    seasonYear,
    tradeWeek,
    aiSummary: (trade.ai_summary as string | null) ?? null,
    sides: ctxSides,
    bundle,
    sidByAsset,
    anchorRosterCtx,
    anchors,
    lint: {
      receivedTokens,
      sideNames: ctxSides.map((s) => s.manager_name).filter(Boolean),
      rankLabels,
      week: tradeWeek,
      positionSwaps: computePositionSwaps(ctxSides, bundle, sidByAsset),
    },
  }
}

// One-trade grade. Returns graded_sides=0 with a warning if the call fails
// or the trade is malformed; never throws (callers loop over many trades and
// shouldn't be killed by one bad one).
export async function gradeTrade(tradeId: string): Promise<GradeResult> {
  const db = createAdminClient()
  const warnings: string[] = []

  const ctx = await loadGradingContext(db, tradeId, warnings)
  if (!ctx) return { trade_id: tradeId, graded_sides: 0, warnings }

  const { leagueType, seasonYear, tradeWeek, sides, bundle, sidByAsset, anchors } = ctx

  // Build the prompt off the loaded context.
  const prompt = buildPrompt({
    leagueType,
    seasonYear,
    week: tradeWeek,
    tradeId,
    sides,
    bundle,
    sidByAsset,
    rosterCtx: ctx.anchorRosterCtx,
  })

  // Call Groq.
  const apiKey = process.env.GROQ_API_KEY_TRADES || process.env.GROQ_API_KEY
  if (!apiKey) {
    warnings.push('GROQ_API_KEY_TRADES (or GROQ_API_KEY) not set')
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  // Shared by the clamp (which runs before the prose is validated) and the
  // writer below, so the grades the linter checked are exactly the grades
  // that get stored.
  const sideIds = new Set(sides.map((s) => s.side_id))
  const modelGrades = new Map<string, string>()

  let parsed: { summary: string; sides: Array<{ side_id: string; grade: string }> }
  try {
    const result = await groqChatJson<typeof parsed>({
      apiKey,
      model: MODEL,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      // Temperature 0.55 — high enough to break out of formulaic openings
      // and produce varied vocabulary; low enough that grade calibration
      // stays anchored. Lower values produced "X won this trade because..."
      // openings every time. The variety it buys is in the PROSE; the
      // grades are pinned by the anchors in the prompt, and the seed below
      // keeps a re-grade of an unchanged trade from resampling into a
      // different answer entirely.
      temperature: 0.55,
      seed: hashTradeId(tradeId),
      maxTokens: 2500,
    })
    parsed = result.data

    // ── The model may move notches. It may NOT reorder the sides. ──────────
    //
    // The anchor is computed from the consensus values of what each side
    // received, so its ORDERING is a fact about the trade: the side holding
    // the more valuable package is ahead, full stop. How far ahead is a
    // judgement call the model is allowed to shade by a notch or two. Which
    // side is ahead is not.
    //
    // This is enforced here, in code, because three separate rounds of prompt
    // rules failed to stop the same inversion. An injured star would be marked
    // down in his live market value, the anchor would price that correctly,
    // and the model would then dock the same side AGAIN for the injury it had
    // just read on the player line, flipping the result:
    //
    //   anchor:  Charlie B+   Isaac B      (Charlie's package worth ~10% more)
    //   model:   Charlie B    Isaac B+     (exactly inverted, one notch each)
    //
    // A prompt is a request. This is the guarantee. Any side the model placed
    // below a side the anchor put beneath it is reset to its own anchor grade,
    // which restores the true ordering while leaving every non-contradictory
    // adjustment the model made intact.
    const gradeRank = (g: string) => GRADE_SCALE.indexOf(g)
    modelGrades.clear()
    for (const g of parsed.sides) {
      if (sideIds.has(g.side_id) && (VALID_GRADES as readonly string[]).includes(g.grade)) {
        modelGrades.set(g.side_id, g.grade)
      }
    }
    const inverted = new Set<string>()
    for (const [idA, gA] of modelGrades) {
      for (const [idB, gB] of modelGrades) {
        if (idA === idB) continue
        const aA = anchors.get(idA)?.grade
        const aB = anchors.get(idB)?.grade
        if (!aA || !aB) continue
        // A is anchored strictly above B, but the model put A at or below B.
        if (gradeRank(aA) > gradeRank(aB) && gradeRank(gA) <= gradeRank(gB)) {
          inverted.add(idA)
          inverted.add(idB)
        }
      }
    }
    for (const id of inverted) {
      const anchor = anchors.get(id)?.grade
      if (!anchor) continue
      warnings.push(
        `trade ${tradeId}: side ${id} graded ${modelGrades.get(id)} against an anchor of ${anchor}, ` +
        'which reversed the value ordering; reset to the anchor',
      )
      modelGrades.set(id, anchor)
    }

    // Keep correcting until the copy is clean, up to a small cap.
    //
    // One retry wasn't enough: the corrected answer kept reintroducing
    // "already had a WR13" and half team names, and a single pass meant
    // whatever came back second got stored regardless. Each attempt is
    // told exactly what it broke, and the last clean answer wins. Two
    // extra calls is an acceptable ceiling on a job that runs once per
    // trade, and most trades never spend even one.
    const MAX_FIXUPS = 2
    // The warning used to fire from INSIDE the loop, on the last iteration,
    // BEFORE that iteration's retry had run. So it reported the state after
    // one fixup while claiming two, and the final rewrite, the one actually
    // stored, was never checked at all. The result was warnings about copy
    // that the very next call had already cleaned up: a summary saved with
    // each rank printed exactly once, filed under "printed the rank WR13 2
    // times". Check after the loop instead, and report how many fixups truly
    // ran, so a warning always describes the text that got saved.
    const checkSummary = () => summaryViolations(
      String(parsed?.summary ?? ''), leagueType,
      {
        ...ctx.lint,
        finalGrades: sides
          .map((sd) => ({ name: sd.manager_name, grade: modelGrades.get(sd.side_id) ?? '' }))
          .filter((g) => g.name && g.grade),
      },
    )
    let violations = checkSummary()
    let fixupsRun = 0
    for (let fix = 0; fix < MAX_FIXUPS && violations.length > 0; fix++) {
      try {
        const retry = await groqChatJson<typeof parsed>({
          apiKey,
          model: MODEL,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
            { role: 'assistant', content: JSON.stringify(parsed) },
            {
              role: 'user',
              content:
                `That response broke these rules: ${violations.join('; ')}. ` +
                'Rewrite the summary so it breaks none of them. Use each side\'s ' +
                'exact full name every time. This is a copy fix only: return the ' +
                'grades you already gave, unchanged. Same strict JSON shape.' +
                // The stored grades are already final by this point; the clamp
                // may have corrected one. Say so plainly, or the rewrite keeps
                // arguing the verdict the model originally reached.
                ` The grades on record for this trade are: ${sides
                  .map((sd) => `${sd.manager_name} ${modelGrades.get(sd.side_id) ?? '?'}`)
                  .join(', ')}. Your summary must explain THOSE grades. If it currently argues that a different side won, that is the error to fix. Never print those letters in the summary itself.`,
            },
          ],
          temperature: 0.35,
          seed: hashTradeId(tradeId),
          maxTokens: 2500,
        })
        if (!retry.data?.summary) break
        parsed = retry.data
        fixupsRun++
      } catch {
        break // Keep the best answer so far; imperfect, not broken.
      }
      violations = checkSummary()
    }
    if (violations.length > 0) {
      warnings.push(
        `summary still imperfect after ${fixupsRun} fixup${fixupsRun === 1 ? '' : 's'}: ${violations.join('; ')}`,
      )
    }
  } catch (e) {
    const msg = e instanceof GroqError ? e.message : (e as Error).message
    warnings.push(`groq call for trade ${tradeId}: ${msg}`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  if (!parsed?.sides || !Array.isArray(parsed.sides)) {
    warnings.push(`trade ${tradeId}: model returned no sides array`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  // Write the trade-level summary first (one row update, not per-side).
  const summary = stripDashes((parsed.summary ?? '').toString()).slice(0, 1500)
  if (summary) {
    const { error: sumErr } = await db
      .from('trades')
      .update({
        ai_summary: summary,
        ai_summary_model: `groq:${MODEL}`,
        ai_summary_at: new Date().toISOString(),
      })
      .eq('id', tradeId)
    if (sumErr) warnings.push(`update ai_summary for ${tradeId}: ${sumErr.message}`)
  } else {
    warnings.push(`trade ${tradeId}: model returned no summary`)
  }

  for (const g of parsed.sides) {
    if (!sideIds.has(g.side_id)) {
      warnings.push(`trade ${tradeId}: model returned grade for unknown side ${g.side_id}`)
    } else if (!(VALID_GRADES as readonly string[]).includes(g.grade)) {
      warnings.push(`trade ${tradeId}: invalid grade "${g.grade}" for side ${g.side_id}`)
    }
  }

  // Write one row per SIDE, not one per grade the model returned.
  //
  // It used to iterate the model's array, which meant a fixup retry that came
  // back naming only one side left the other side's row exactly as it was: a
  // grade from a previous run, sitting on the page beside a write-up and a
  // warnings list that both described the new one. Every side the trade has
  // gets written, and a side the model never graded falls back to its anchor
  // rather than keeping a stale letter.
  let graded = 0
  const stored = new Map<string, string>()
  for (const s of sides) {
    const grade = modelGrades.get(s.side_id) ?? anchors.get(s.side_id)?.grade
    if (!grade) {
      warnings.push(`trade ${tradeId}: no grade and no anchor for ${s.manager_name}, left as it was`)
      continue
    }
    if (!modelGrades.has(s.side_id)) {
      warnings.push(`trade ${tradeId}: the model returned no usable grade for ${s.manager_name}, stored its anchor ${grade}`)
    }
    const { error: upErr } = await db.from('trade_grades').upsert(
      {
        trade_side_id: s.side_id,
        // Post-clamp value, so a reversed ordering never reaches the page.
        grade: grade as Grade,
        blurb: null,
        model: `groq:${MODEL}`,
        graded_at: new Date().toISOString(),
      },
      { onConflict: 'trade_side_id' },
    )
    if (upErr) {
      warnings.push(`upsert grade for side ${s.side_id}: ${upErr.message}`)
      continue
    }
    stored.set(s.side_id, grade)
    graded++
  }

  // What actually reached the page. The anchor line above is a starting
  // point, not a result, and reading it as the grades (then finding different
  // letters on the trade) is a trap worth closing with one more line.
  if (stored.size > 0) {
    warnings.push(
      `stored grades, these are what the page shows: ${sides
        .filter((s) => stored.has(s.side_id))
        .map((s) => `${s.manager_name} ${stored.get(s.side_id)}`)
        .join('  |  ')}`,
    )
  }

  return { trade_id: tradeId, graded_sides: graded, warnings }
}

// Re-letter a trade without touching the write-up, and without calling Groq.
//
// The prose is the expensive part and it is usually the part that is already
// right: re-running the whole grade to nudge a letter burns tokens rewriting
// a paragraph nobody asked to change, and the rewrite comes back different
// every time. This recomputes the grades from the anchors, which are pure
// arithmetic over the current consensus values, stores them, and leaves
// ai_summary exactly where it was.
//
// The one thing it cannot do is notice that the existing prose now argues for
// different letters, so it checks: the stored write-up is run back through
// the same linter with the new grades, and any contradiction comes out as a
// warning telling you this trade does need a real re-grade after all.
export async function regradeTrade(tradeId: string): Promise<GradeResult> {
  const db = createAdminClient()
  const warnings: string[] = []

  const ctx = await loadGradingContext(db, tradeId, warnings)
  if (!ctx) return { trade_id: tradeId, graded_sides: 0, warnings }

  const { sides, anchors } = ctx

  // What the page shows right now, so the warning can say what moved.
  const { data: existing } = await db
    .from('trade_grades')
    .select('trade_side_id, grade')
    .in('trade_side_id', sides.map((s) => s.side_id))
  const before = new Map<string, string>(
    (existing ?? []).map((r) => [r.trade_side_id as string, r.grade as string]),
  )

  let graded = 0
  const stored = new Map<string, string>()
  for (const s of sides) {
    const grade = anchors.get(s.side_id)?.grade
    if (!grade) {
      warnings.push(`trade ${tradeId}: no anchor for ${s.manager_name}, grade left as it was`)
      continue
    }
    const { error: upErr } = await db.from('trade_grades').upsert(
      {
        trade_side_id: s.side_id,
        grade: grade as Grade,
        blurb: null,
        // Tagged so a grade the model never saw can't be mistaken for one it
        // wrote. The basis says which anchor produced it.
        model: `anchor:${anchors.get(s.side_id)?.basis ?? 'package'}`,
        graded_at: new Date().toISOString(),
      },
      { onConflict: 'trade_side_id' },
    )
    if (upErr) {
      warnings.push(`upsert grade for side ${s.side_id}: ${upErr.message}`)
      continue
    }
    stored.set(s.side_id, grade)
    graded++
  }

  if (stored.size > 0) {
    warnings.push(
      `re-lettered, these are what the page shows: ${sides
        .filter((s) => stored.has(s.side_id))
        .map((s) => {
          const now = stored.get(s.side_id)
          const was = before.get(s.side_id)
          return `${s.manager_name} ${now}${was && was !== now ? ` (was ${was})` : ''}`
        })
        .join('  |  ')}`,
    )
  }

  // Does the write-up still argue these letters?
  if (ctx.aiSummary) {
    const violations = summaryViolations(ctx.aiSummary, ctx.leagueType, {
      ...ctx.lint,
      finalGrades: sides
        .map((s) => ({ name: s.manager_name, grade: stored.get(s.side_id) ?? '' }))
        .filter((g) => g.name && g.grade),
    })
    if (violations.length > 0) {
      warnings.push(
        `the write-up on this trade was kept as is and it now breaks: ${violations.join('; ')}. ` +
        'Re-grade it if any of that is about the verdict rather than the wording.',
      )
    }
  } else {
    warnings.push(`trade ${tradeId}: no write-up on this trade, only the letters were set`)
  }

  return { trade_id: tradeId, graded_sides: graded, warnings }
}

// Revisit a previously-graded trade. Re-runs the LLM with the original
// summary + per-side grades as context, asks if the original verdict holds
// up. Writes revisit_summary / revisit_model / revisited_at on `trades`
// and revisit_grade on each `trade_grades` row.
//
// In Phase 2 we don't have player-performance data over the 4 weeks since
// the trade, so the revisit is essentially a fresh-eyes second opinion.
// Phase 3 will inject real stats and make this meaningful.
export async function revisitTrade(tradeId: string): Promise<GradeResult> {
  const db = createAdminClient()
  const warnings: string[] = []

  const { data: trade, error: tErr } = await db
    .from('trades')
    .select('id, league_id, week, ai_summary, platform, leagues!inner(league_type, trade_desk_settings), seasons!inner(year, external_id)')
    .eq('id', tradeId)
    .maybeSingle()
  if (tErr || !trade) {
    warnings.push(`load trade ${tradeId}: ${tErr?.message ?? 'not found'}`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  if (!trade.ai_summary) {
    warnings.push(`trade ${tradeId}: no initial grade, grade it before revisiting`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  const { data: sides, error: sErr } = await db
    .from('trade_sides')
    .select('id, manager_id, assets, managers!inner(display_name, team_name, external_id), trade_grades(grade)')
    .eq('trade_id', tradeId)
  if (sErr || !sides || sides.length < 2) {
    warnings.push(`load sides for trade ${tradeId}: ${sErr?.message ?? 'fewer than 2 sides'}`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  const league = Array.isArray(trade.leagues) ? trade.leagues[0] : trade.leagues
  const season = Array.isArray(trade.seasons) ? trade.seasons[0] : trade.seasons
  const leagueType = (league?.league_type as 'redraft' | 'keeper' | 'dynasty') ?? 'redraft'

  if (season?.year == null || season.year < FIRST_GRADED_SEASON) {
    warnings.push(`trade ${tradeId}: season ${season?.year ?? 'unknown'} is before ${FIRST_GRADED_SEASON}, not revisited`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  // Resolve asset ids cross-platform (same path as gradeTrade) and pull
  // consensus values. Revisits intentionally skip the live roster fetch
  // (the original summary already encoded that picture); valuateLeague is
  // provider-cached so it adds little latency to batch runs. Effective
  // settings come from the stored trade_desk_settings + league_type, no
  // roster round-trips.
  const revisitPlatform = ((trade.platform as string | null) ?? 'sleeper') as TradePlatform
  const revisitLookup = revisitPlatform === 'sleeper' ? null : await buildNameLookup()
  const sidByAsset = new Map<Record<string, unknown>, string>()
  const resolvedIds: string[] = []
  for (const s of sides) {
    for (const a of (s.assets as Array<Record<string, unknown>>) ?? []) {
      const sid = resolveSleeperId(a, revisitPlatform, revisitLookup)
      if (sid) {
        sidByAsset.set(a, sid)
        resolvedIds.push(sid)
      }
    }
  }

  const effective = mergeEffective(parseSettings(league?.trade_desk_settings), {
    mode: leagueType as LeagueMode,
    lineupType: null,
    teamCount: null,
    qbStarters: null,
    tePremium: null,
  })
  let consensus = new Map<string, ConsensusValue>()
  try {
    const valuation = await valuateLeague(
      {
        mode: effective.mode,
        qbStarters: effective.qbStarters,
        teamCount: effective.teamCount,
        scoringProfile: effective.scoringProfile,
        tePremium: effective.tePremium,
        sourcePreference: effective.valueSourcePreference,
      },
      // Same reasoning as gradeTrade: a revisit's whole job is to say what
      // the market thinks NOW, so a cached "now" is the one thing it can't use.
      { fresh: true },
    )
    consensus = valuation.values
    // A provider dropping out changes the blend, which moves the anchor,
    // which moves the grade. Surface it rather than letting a trade quietly
    // grade off four sources today and five tomorrow.
    for (const a of valuation.attempts) {
      if (!a.ok) warnings.push(`value source ${a.label} contributed nothing (${a.message ?? 'no reason given'}); the anchor was blended without it`)
    }
  } catch (e) {
    warnings.push(`consensus values: ${(e as Error).message}`)
  }
  if (consensus.size === 0) {
    warnings.push(`trade ${tradeId}: no consensus values available, not revisited (will retry next run)`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }
  const bundle: ValueBundle = {
    consensus,
    rankLabels: consensusRankLabels(consensus),
    meta: await getSleeperValuesForPlayerIds(resolvedIds),
  }
  const rosterSummaries = new Map<string, string>()

  const sidePayload = sides.map((s) => {
    const mgr = Array.isArray(s.managers) ? s.managers[0] : s.managers
    const grades = Array.isArray(s.trade_grades) ? s.trade_grades : s.trade_grades ? [s.trade_grades] : []
    const originalGrade = (grades[0]?.grade as string | null) ?? null
    return {
      side_id: s.id as string,
      manager_name: (mgr?.team_name as string | null) || (mgr?.display_name as string) || 'Manager',
      assets: (s.assets as Array<Record<string, unknown>>) ?? [],
      original_grade: originalGrade,
      roster_summary: rosterSummaries.get(s.id as string) ?? null,
    }
  })

  const prompt = buildRevisitPrompt({
    leagueType,
    seasonYear: season?.year ?? null,
    week: trade.week ?? null,
    originalSummary: trade.ai_summary as string,
    sides: sidePayload,
    bundle,
    sidByAsset,
  })

  const apiKey = process.env.GROQ_API_KEY_TRADES || process.env.GROQ_API_KEY
  if (!apiKey) {
    warnings.push('GROQ_API_KEY_TRADES (or GROQ_API_KEY) not set')
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  let parsed: { summary: string; sides: Array<{ side_id: string; grade: string }> }
  try {
    const result = await groqChatJson<typeof parsed>({
      apiKey,
      model: MODEL,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: 0.55,
      // Offset from the initial-grade seed so a revisit isn't just the
      // first write-up resampled with the same roll.
      seed: (hashTradeId(tradeId) ^ 0x5e71517) >>> 0,
      maxTokens: 2500,
    })
    parsed = result.data
  } catch (e) {
    const msg = e instanceof GroqError ? e.message : (e as Error).message
    warnings.push(`groq revisit for trade ${tradeId}: ${msg}`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  if (!parsed?.sides || !Array.isArray(parsed.sides)) {
    warnings.push(`trade ${tradeId}: revisit returned no sides array`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  const now = new Date().toISOString()
  const summary = stripDashes((parsed.summary ?? '').toString()).slice(0, 1500)
  // No corrective pass on the revisit, so this is a report rather than a fix:
  // the verdict sits beside the same letters the initial grade does, and a
  // grade written into the sentence is the one thing it must never contain.
  if (summary && hasLetterGradeInProse(summary)) {
    warnings.push(`trade ${tradeId}: the verdict write-up prints a letter grade in the prose; run it again`)
  }
  if (summary) {
    const { error: sumErr } = await db
      .from('trades')
      .update({
        revisit_summary: summary,
        revisit_model: `groq:${MODEL}`,
        revisited_at: now,
      })
      .eq('id', tradeId)
    if (sumErr) warnings.push(`update revisit_summary for ${tradeId}: ${sumErr.message}`)
  } else {
    warnings.push(`trade ${tradeId}: revisit returned no summary`)
  }

  const sideIds = new Set(sides.map((s) => s.id as string))
  let revised = 0
  for (const g of parsed.sides) {
    if (!sideIds.has(g.side_id)) {
      warnings.push(`trade ${tradeId}: revisit grade for unknown side ${g.side_id}`)
      continue
    }
    if (!(VALID_GRADES as readonly string[]).includes(g.grade)) {
      warnings.push(`trade ${tradeId}: invalid revisit grade "${g.grade}" for side ${g.side_id}`)
      continue
    }
    // Update — the row should already exist from the initial grade. If it
    // doesn't (edge case), we skip rather than partially fabricating one.
    const { error: upErr, count } = await db
      .from('trade_grades')
      .update({ revisit_grade: g.grade, revisited_at: now }, { count: 'exact' })
      .eq('trade_side_id', g.side_id)
    if (upErr) {
      warnings.push(`update revisit_grade for side ${g.side_id}: ${upErr.message}`)
      continue
    }
    if ((count ?? 0) === 0) {
      warnings.push(`side ${g.side_id} has no initial grade row, skipping revisit`)
      continue
    }
    revised++
  }

  // Stamp `rank_now` on each side's player assets — the 4-week verdict
  // snapshot. computePositionRanks fetches Sleeper weekly stats up to
  // (trade.week + 4) and ranks within position, same as ingest does for
  // rank_at_trade. Default PPR scoring is used here regardless of the
  // league's actual ruleset; matching exact custom scoring is a follow-up
  // when we surface platform-specific scoring extraction.
  if (trade.week && season?.year) {
    const verdictWeek = Math.min(18, Number(trade.week) + 4)
    const platform = (trade.platform as 'sleeper' | 'espn' | 'yahoo' | 'nfl') ?? 'sleeper'
    try {
      const ranks = await computePositionRanks({
        season: Number(season.year),
        throughWeek: verdictWeek,
        scoring: DEFAULT_PPR_SCORING,
      })
      for (const s of sides) {
        const original = (s.assets as Array<Record<string, unknown>>) ?? []
        const stamped = await stampRanks(original, { ranks, platform, field: 'rank_now' })
        const { error: stampErr } = await db
          .from('trade_sides')
          .update({ assets: stamped })
          .eq('id', s.id as string)
        if (stampErr) {
          warnings.push(`stamp rank_now for side ${s.id}: ${stampErr.message}`)
        }
      }
    } catch (e) {
      warnings.push(`revisit ranks for trade ${tradeId}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { trade_id: tradeId, graded_sides: revised, warnings }
}

// Run revisits on graded trades that don't yet have a revisit. `eligibleOnly`
// (default true) restricts to trades graded ≥ 4 weeks ago — production mode.
// Pass false to revisit anything graded, for testing.
export async function revisitForLeague(args: {
  leagueId: string
  limit: number
  eligibleOnly?: boolean
}): Promise<{ scanned: number; revisited: number; warnings: string[] }> {
  const db = createAdminClient()
  const warnings: string[] = []
  const limit = limit_cap(args.limit)

  // Candidates: trades with an ai_summary (i.e. initially graded) and no
  // revisit yet, newest first.
  const q = db
    .from('trades')
    .select('id, ai_summary_at, revisited_at, week, seasons!inner(year, is_live, settings)')
    .eq('league_id', args.leagueId)
    .eq('status', 'completed')
    .not('ai_summary', 'is', null)
    .is('revisited_at', null)
    .gte('seasons.year', FIRST_GRADED_SEASON)
    .order('ai_summary_at', { ascending: false })

  const { data: rows, error } = await q.limit(limit * 2)
  if (error || !rows) {
    warnings.push(`load revisit candidates: ${error?.message ?? 'no data'}`)
    return { scanned: 0, revisited: 0, warnings }
  }

  // Same due rule the cron uses (trade week + 4), not age-since-grading.
  const eligible = (args.eligibleOnly ?? true)
    ? rows.filter((r) => {
        const season = Array.isArray(r.seasons) ? r.seasons[0] : r.seasons
        return verdictIsDue({
          tradeWeek: r.week as number | null,
          seasonIsLive: !!season?.is_live,
          seasonSettings: season?.settings as Record<string, unknown> | null,
        })
      })
    : rows

  const targets = eligible.slice(0, limit).map((r) => r.id as string)

  const PER_CALL_DELAY_MS = 5000
  let revisited = 0
  for (let i = 0; i < targets.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, PER_CALL_DELAY_MS))
    const r = await revisitTrade(targets[i])
    revisited += r.graded_sides > 0 ? 1 : 0
    warnings.push(...r.warnings)
  }

  return { scanned: rows.length, revisited, warnings }
}

// Grade up to `limit` ungraded trades for a league, newest first. Returns
// aggregate counts + warnings. Caller is responsible for permission checks.
//
// `force` re-grades trades that already have grades (overwrites existing rows
// via upsert). Useful when you've tuned the prompt and want to refresh the
// archive without wiping the table by hand.
//
// We grade serially (not in parallel) for two reasons:
//   1. Groq's free tier rate-limits per second; bursts cause 429s.
//   2. The UI shows a single counter, so sequential is easier to reason about.
export async function gradeUngradedForLeague(args: {
  leagueId: string
  limit: number
  seasonYear?: number | null
  force?: boolean
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
    .gte('seasons.year', FIRST_GRADED_SEASON)
    .order('executed_at', { ascending: false })
  if (args.seasonYear != null) {
    // An explicit season below the floor asks for something we won't do.
    // Say so instead of silently returning "0 graded", which reads like the
    // season had no ungraded trades.
    if (args.seasonYear < FIRST_GRADED_SEASON) {
      warnings.push(`season ${args.seasonYear} is before ${FIRST_GRADED_SEASON}; grading only runs from ${FIRST_GRADED_SEASON} on`)
      return { scanned: 0, graded: 0, warnings }
    }
    q = q.eq('seasons.year', args.seasonYear)
  }

  const { data: candidateTrades, error: cErr } = await q.limit(Math.max(limit_cap(args.limit) * 4, 50))
  if (cErr || !candidateTrades) {
    warnings.push(`load candidate trades: ${cErr?.message ?? 'no data'}`)
    return { scanned: 0, graded: 0, warnings }
  }

  // Pick which trades to grade. In force mode, take the first `limit` trades
  // by recency (re-grade everything). Otherwise filter to trades that have at
  // least one ungraded side.
  const ungraded: string[] = []
  if (args.force) {
    for (const t of candidateTrades) {
      if (ungraded.length >= limit_cap(args.limit)) break
      ungraded.push(t.id as string)
    }
  } else {
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
  }

  // Grade each ungraded trade. Pace at ~5s/call to stay under Groq's free
  // tier 12k TPM ceiling (each call is ~900 tokens). Skip the delay on the
  // first call so the user sees fast first feedback. The Groq client also
  // retries on 429, so the worst case here is slower, not failing.
  const PER_CALL_DELAY_MS = 5000
  let graded = 0
  for (let i = 0; i < ungraded.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, PER_CALL_DELAY_MS))
    const r = await gradeTrade(ungraded[i])
    graded += r.graded_sides > 0 ? 1 : 0
    warnings.push(...r.warnings)
  }

  return { scanned: candidateTrades.length, graded, warnings }
}

// Re-letter the `limit` most recent trades in a league, newest first, keeping
// every write-up. No Groq call, so no pacing delay and no token spend: the
// grades come straight off the anchors.
export async function regradeLettersForLeague(args: {
  leagueId: string
  limit: number
  seasonYear?: number | null
}): Promise<{ scanned: number; graded: number; warnings: string[] }> {
  const db = createAdminClient()
  const warnings: string[] = []

  let q = db
    .from('trades')
    .select('id, executed_at, seasons!inner(year)')
    .eq('league_id', args.leagueId)
    .eq('status', 'completed')
    .gte('seasons.year', FIRST_GRADED_SEASON)
    .order('executed_at', { ascending: false })
  if (args.seasonYear != null) {
    if (args.seasonYear < FIRST_GRADED_SEASON) {
      warnings.push(`season ${args.seasonYear} is before ${FIRST_GRADED_SEASON}; grading only runs from ${FIRST_GRADED_SEASON} on`)
      return { scanned: 0, graded: 0, warnings }
    }
    q = q.eq('seasons.year', args.seasonYear)
  }

  const { data: candidateTrades, error: cErr } = await q.limit(limit_cap(args.limit))
  if (cErr || !candidateTrades) {
    warnings.push(`load candidate trades: ${cErr?.message ?? 'no data'}`)
    return { scanned: 0, graded: 0, warnings }
  }

  let graded = 0
  for (const t of candidateTrades) {
    const r = await regradeTrade(t.id as string)
    graded += r.graded_sides > 0 ? 1 : 0
    warnings.push(...r.warnings)
  }

  return { scanned: candidateTrades.length, graded, warnings }
}

// ─── Prompt builder ──────────────────────────────────────────────────────

// Deterministic per-trade lead angle. Rotating the opening angle is the
// single biggest lever against every archive write-up sounding the same:
// the model reliably obeys "open from THIS angle," and hashing the trade
// id means re-grades keep the same angle while neighboring trades on the
// page get different ones.
const LEAD_ANGLES = [
  'the age and contention-window mismatch between the two sides',
  'the opportunity cost: what the stronger side had to give up to get this done',
  'positional scarcity: which position in this league is hardest to fill, and how this deal moves it',
  'the riskiest player in the deal (injury history, role uncertainty, age cliff) and what happens if that bet fails',
  'roster fit: how each headline piece slots into, or duplicates, its new team\'s depth chart',
  'market timing: who bought low, who sold high, and whether it was the right moment',
  'the throw-in piece everyone will ignore, and whether it quietly swings the deal',
  'what each manager is telling the league about their season by making this trade',
]

function hashTradeId(tradeId: string): number {
  let h = 2166136261
  for (let i = 0; i < tradeId.length; i++) {
    h ^= tradeId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pickLeadAngle(tradeId: string): string {
  return LEAD_ANGLES[hashTradeId(tradeId) % LEAD_ANGLES.length]
}

// ── Deterministic grade anchors ──────────────────────────────────────────
//
// The model used to derive every grade from scratch, so re-grading an
// unchanged trade could return C- one run and B+ the next while the other
// side sat still. Temperature and a seed alone only freeze the sampling;
// they don't give the model a stable read to freeze onto. This does: each
// side gets a starting grade computed from the consensus values of what it
// received, identical on every run, and the prompt limits how far the model
// may move off it.
const GRADE_SCALE = [
  'F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+',
]
// An even split grades B+ on both sides. Managers don't make trades they
// think are bad, so the scale deliberately leaves three notches above that
// point and nine below it.
const EVEN_GRADE_INDEX = 9

// Consolidation is priced by the SAME curve the Analyzer uses.
//
// This used to be a local weighting, PIECE_WEIGHTS = [1, 0.6, 0.35, 0.2],
// while lib/hub/verdict priced the identical idea at [1.0, 0.9, 0.78, 0.66]
// with an elite-peak premium on top. Two curves, one question, and they
// disagreed hard enough to name different winners for the same trade off
// the same consensus values:
//
//   Charlie  Williams 4729 + Bowers 4521 + Flowers 3763 + Diggs 1074
//   Isaac    Henry 6345 + Olave 4880 + Goedert 736
//
//   raw:       Charlie 14087   Isaac 11961   (Charlie +2126)
//   old curve: Charlie  8973   Isaac  9531   -> Isaac wins
//   analyzer:  Charlie 12442   Isaac 11399   -> Charlie wins
//
// The old curve was the wrong one. Discounting the third piece to 35% of
// face value treats a startable WR17 as near-worthless in a league that
// starts three wideouts, so any side receiving depth lost on arrival no
// matter how good the depth was. The Analyzer's curve calls itself "a
// nudge, not a hammer" and is the one that matches how a lineup actually
// works, so the grader defers to it and the two features stop contradicting
// each other in public.
function weighPackage(values: number[]): number {
  return effectivePackageValue(
    values.map((value, i) => ({ id: String(i), name: '', position: '', value })),
  )
}

// `eff` is the consolidation-adjusted package value this grade came from.
// Carried out purely so a grading run can SHOW its work: the anchor was
// previously invisible, which meant a disagreement about why a trade graded
// the way it did could only be settled by guessing at the inputs.
// How much of the raw starter-value swing carries into the grade. 1.0 is
// the Analyzer's own sensitivity; lower compresses toward the middle. See
// the note at the grading call for why a grade is damped and a quick
// what-if in the Analyzer is not.
const LINEUP_SENSITIVITY = 0.5

type GradeAnchor = { grade: string; confident: boolean; eff: number; basis: 'lineup' | 'package'; detail?: string }

// Roster context for the LINEUP basis. Without it the anchor falls back to
// raw package value, which is the measure that caused the whole problem:
// it counts a WR38 you will never start as real value received.
export type AnchorRosterCtx = {
  slots: HubLineupSlots
  // side_id -> the roster as it stands AFTER the trade, and the ids that
  // came in / went out, so the pre-trade lineup can be reconstructed.
  bySide: Map<string, { after: string[]; received: string[]; sent: string[] }>
}

function computeGradeAnchors(
  sides: Array<{ side_id: string; assets: Array<Record<string, unknown>> }>,
  bundle: ValueBundle,
  sidByAsset: Map<Record<string, unknown>, string>,
  rosterCtx?: AnchorRosterCtx | null,
): Map<string, GradeAnchor> {
  const out = new Map<string, GradeAnchor>()

  // ── LINEUP BASIS (preferred) ────────────────────────────────────────────
  //
  // The question a trade grade should answer is "did this make the team you
  // actually field better", not "did more value change hands". Those come
  // apart constantly: a WR38 is worth real market value and yet never enters
  // a lineup, so counting him credits a side for a player who scores nothing
  // for them, while an elite TE replacing a TE13 in the one TE slot is worth
  // far more to a roster than the raw gap between two numbers suggests.
  //
  // Package value graded a trade B+/B that the Analyzer, which has always
  // used this lineup lens, called decisive. Two tools on the same page
  // disagreeing about the same trade was the symptom; measuring two
  // different things was the cause. Both now ask the same question, on the
  // same optimal-lineup fill, and grade it on the same rubric. The grader
  // earns its keep on the DEPTH of the write-up, not by reaching a different
  // verdict.
  if (rosterCtx && rosterCtx.bySide.size === sides.length) {
    let usable = true
    const staged: Array<{ side_id: string; pct: number; before: number; after: number }> = []
    for (const s of sides) {
      const r = rosterCtx.bySide.get(s.side_id)
      if (!r || r.after.length === 0) { usable = false; break }
      const received = new Set(r.received)
      const before = r.after.filter((id) => !received.has(id))
      for (const id of r.sent) if (!before.includes(id)) before.push(id)
      const beforeVal = lineupValue(before, bundle.consensus, rosterCtx.slots)
      const afterVal = lineupValue(r.after, bundle.consensus, rosterCtx.slots)
      if (beforeVal <= 0) { usable = false; break }
      staged.push({ side_id: s.side_id, pct: (afterVal - beforeVal) / beforeVal, before: beforeVal, after: afterVal })
    }
    if (usable) {
      for (const st of staged) {
        // Same rubric the Analyzer locks its grades to, so the two agree by
        // construction rather than by coincidence of tuning, but damped.
        //
        // The delta is a swing in the MARKET VALUE of your starters, and
        // value is not linear in points. Losing an elite TE for a
        // replacement one is a big value drop and a much smaller weekly
        // scoring drop, because the replacement still plays and still
        // scores. Graded raw, that read as a C for a side that had merely
        // gotten worse, on a permanent public record of somebody's trade.
        // Halving the swing keeps the ordering and the shape exactly as the
        // Analyzer has them while pulling the letters back toward the middle
        // where real trades live. The Analyzer stays the sharper instrument;
        // it costs nothing to be wrong there.
        out.set(st.side_id, {
          grade: gradeStarter(st.pct * LINEUP_SENSITIVITY),
          confident: true,
          eff: st.after,
          basis: 'lineup',
          detail: `starters ${Math.round(st.before)} -> ${Math.round(st.after)}, ${(st.pct * 100).toFixed(1)}% raw / ${(st.pct * LINEUP_SENSITIVITY * 100).toFixed(1)}% graded`,
        })
      }
      return out
    }
  }
  // ── PACKAGE BASIS (fallback) ────────────────────────────────────────────
  // Only when rosters are unavailable: an imported archive, a manager who
  // can't be matched to a live roster, a failed roster fetch.
  const weights: number[] = []
  // Picks have no consensus value and some players don't resolve. A side
  // holding either is being weighed on partial information, so its anchor
  // is advisory and the prompt lets the model move further off it.
  const partial: boolean[] = []

  for (const s of sides) {
    const vals: number[] = []
    let missing = false
    for (const a of s.assets) {
      if (a.kind !== 'player') { missing = true; continue }
      const sid = sidByAsset.get(a)
      const cv = sid ? bundle.consensus.get(sid) : undefined
      if (!cv) { missing = true; continue }
      vals.push(cv.value)
    }
    weights.push(weighPackage(vals))
    partial.push(missing || vals.length === 0)
  }

  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return out
  const mean = total / sides.length

  sides.forEach((s, i) => {
    // ratio 1 means this side took an even share of the value on the table.
    const ratio = weights[i] / mean
    const d = (ratio - 1) / sides.length
    // Asymmetric slope: three notches of headroom above B+ against nine
    // below it, so the losing side falls faster than the winner climbs and
    // the bottom of the scale stays reachable at all.
    //
    // The UP slope used to be 7, which was not a calibration choice so much
    // as an accident. d is already quartered on the way in (it is half the
    // value gap, then divided by side count), so a slope of 7 meant the
    // winning side needed a 29% edge to gain a single letter while the
    // losing side dropped one at 12%. The visible symptom was every lopsided
    // trade grading as "the loser lost a notch" with the winner pinned at
    // B+ forever, no matter how far ahead he was.
    //
    // At 20 the winner moves a letter at a 10% gap. The gap between sides at
    // a few reference points, against the Analyzer on the same values:
    //
    //          gap    analyzer   old (7/16)   now (20/40)
    //          10%      A-/C       B+/B+         A-/B
    //          20%      A+/F       B+/B          A-/B-
    //          40%      A+/F       A-/B-         A/C
    //
    // Deliberately still flatter than the Analyzer at the extremes. The
    // Analyzer is an exploratory tool where an F costs nothing; a grade is a
    // permanent public record of somebody's trade, and handing out an F for
    // a 20% value gap is a harsher claim than the data supports.
    const UP_SLOPE = 7
    const DOWN_SLOPE = 16
    const notches = d >= 0 ? Math.round(d * UP_SLOPE) : Math.round(d * DOWN_SLOPE)
    const idx = Math.max(0, Math.min(GRADE_SCALE.length - 1, EVEN_GRADE_INDEX + notches))
    out.set(s.side_id, { grade: GRADE_SCALE[idx], confident: !partial[i], eff: weights[i], basis: 'package' })
  })
  return out
}

type PromptArgs = {
  leagueType: 'redraft' | 'keeper' | 'dynasty'
  seasonYear: number | null
  week: number | null
  tradeId: string
  sides: Array<{
    side_id: string
    manager_name: string
    assets: Array<Record<string, unknown>>
    // W-L and league position going into this trade. Null in the preseason
    // and before STANDINGS_TALK_FROM_WEEK, which is what keeps the model
    // from arguing standings that don't exist yet.
    record?: string | null
    // One-line positional depth summary for the side's current roster.
    // Null when the manager couldn't be matched to a live roster or the
    // roster fetch failed.
    roster_summary: string | null
  }>
  // Roster context for the lineup-basis anchor. When present the ANCHOR
  // GRADE shown to the model is the same lineup-based number the clamp
  // enforces, so the prompt and the guarantee can never disagree.
  rosterCtx?: AnchorRosterCtx | null
  // Consensus values + rank labels + Sleeper meta, keyed by Sleeper id;
  // sidByAsset translates each asset object to its Sleeper id.
  bundle: ValueBundle
  sidByAsset: Map<Record<string, unknown>, string>
}

function buildPrompt(args: PromptArgs): { system: string; user: string } {
  const typeNote =
    args.leagueType === 'dynasty'
      ? 'This is a DYNASTY league: weight long-term player value, draft picks (especially early-round), and youth heavily. Rest-of-season production matters less than future seasons.'
      : args.leagueType === 'keeper'
      ? 'This is a KEEPER league: players retained from year to year. Weight both rest-of-season production AND keeper value (cheap young talent is more valuable).'
      : [
          'This is a REDRAFT league: rosters reset every year and nobody keeps anyone.',
          'Because of that, a player\'s age and long-term upside are WORTH NOTHING here. Acquiring a 23-year-old instead of a 27-year-old is not an advantage: the team only has him for this season either way.',
          'NEVER credit or penalise a side for youth, age, "upside", "ascending", "win-now vs rebuilding", "contention window", or "long-term value". Those are dynasty concepts and do not exist in this league.',
          'Age is worth mentioning ONLY as a durability or workload risk for the current season, and only when the player line actually flags an injury.',
          'Grade purely on who scores more fantasy points for the rest of THIS season.',
        ].join(' ')

  // Calibration matters: without explicit anchors the model tends to grade
  // every trade as a blowout (A on one side, D/F on the other). Real fantasy
  // trades cluster in the B range because managers don't make trades they
  // think are obviously bad. Give the model a target distribution.
  //
  // Recap quality matters too: without an explicit ban list and worked
  // examples, the model defaults to "X won this trade because..." every
  // time. The summary is a grading RATIONALE, not a play-by-play.
  const system =
    [
      'You are an experienced fantasy football trade analyst writing for a league archive. The summary you write is a GRADING RATIONALE: it must explain WHY the grades came out the way they did, not just restate who received what.',
      typeNote,
      '',
      'GRADING SCALE (use only these grades): A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F.',
      '',
      'START FROM THE ANCHOR. Each side below carries an ANCHOR GRADE, computed from the consensus market values of what that side received, with pieces past the best one discounted (a lineup starts a fixed number of players). The anchor is the same on every run.',
      // "an injury on the player line" used to be listed here as a reason to
      // move off the anchor. It was double-counting and it inverted trades:
      // the consensus values are pulled LIVE at grading time, so an injured
      // player is already marked down in the very number the anchor is built
      // from. Letting the model dock the side a second time for the same
      // fact meant the manager who acquired the higher-valued package could
      // still be graded the loser, which is what happened the first time the
      // injury detail got loud enough for the model to notice it.
      '• Begin at the anchor and move off it only for a reason you can name in the write-up: roster fit, or positional scarcity in this league.',
      // Stated HERE, at the movement decision, not only down in the injury
      // section. When the ban lived only beside the player lines the model
      // obeyed its letter and broke it anyway, re-describing the same dock as
      // scarcity: "eases the tight TE market by swapping an injured TE2 for a
      // modest TE16", which calls giving away the better player a gain.
      '• AN INJURY IS NEVER ONE OF THOSE REASONS. The market value and position rank on each line are pulled live and are ALREADY marked down for any injury, so the anchor has priced it in full. You may not cite "he is hurt", "sidelined", "out", "injury risk", "the only healthy option at the position", or a thinner position caused by an injury, as grounds for calling one package weaker or moving a grade. That double-charges the side and it is the single most common way this write-up goes wrong.',
      '• SHEDDING AN INJURED PLAYER IS NOT A GAIN. A side that gave away the higher-ranked player got the worse end of that swap, hurt or not. Never present trading TE2 away for TE16 as relief, an upgrade, or a market being eased.',
      '• High-confidence anchor: you may move that side ONE notch, up or down. Low-confidence anchor: TWO notches.',
      '• Never re-derive a grade from scratch and never exceed the allowed movement. The same trade graded twice must produce the same grades, so if nothing in the data justifies moving, return the anchor.',
      '',
      'GRADE CALIBRATION (value-anchored):',
      '• Use the consensus market value and position rank on each player line as your primary anchor. Values sit on a roughly 0-10000 scale blended from FantasyCalc, KeepTradeCut, DynastyProcess, and FantasyPros, calibrated to this league\'s format. Lower rank number = more valuable player.',
      '• A trade with very small rank gaps between sides is roughly even: both sides earn comparable grades.',
      '• A trade where one side acquires meaningfully better-ranked players earns a higher grade for that side.',
      '• When BOTH sides acquired top-24 positional starters they can use, BOTH sides can earn A-range grades. Mutual wins are real. A/A is a correct grade for a trade where both teams hit a real need without losing value.',
      '• Grades on opposing sides do NOT need to mirror. A trade can be A-/B (clear winner + the other side still got fair value), A/A (both sides won), or A/C (one side significantly stole value).',
      '• Use D / D- / F ONLY when a side got dramatically worse players (huge rank gap) without addressing positional scarcity.',
      '• Don\'t default to B+/B for everything just because trades "should be balanced." If the data shows a real gap, grade accordingly.',
      '',
      'WRITING THE RATIONALE. 3 to 4 sentences total. Follow these rules:',
      '',
    '1. NEVER OPEN with "The X won this trade", "X won the trade", or any variation of who-won-the-trade as the first line. The user message names a LEAD ANGLE for this specific write-up: open from that angle, then broaden into the full rationale. This is a rule about the OPENING SENTENCE ONLY. Once you are past it, naming the winner outright is expected.',
      '',
      // The recap kept ending on a sentence that restated the sentence before
      // it and then read the grades back out: "IsAAcShake comes away with the
      // stronger overall package, and tinfoil99's haul falls short of the
      // anchor value. tinfoil99 gets the lower grade and IsAAcShake the
      // higher grade." The letters are printed next to the write-up, so the
      // last clause is the reader being told what he is already looking at.
      '1b. SAY WHO WON EXACTLY ONCE, AND NEVER RESTATE THE GRADES. The letter grades are displayed beside this write-up. Do NOT end with a sentence that maps sides to grades ("X gets the lower grade", "Y earns the higher mark", "hence the B"), and do NOT close by rephrasing a verdict you already delivered. If your final sentence would survive being deleted without the reader losing information, delete it. Spend the last sentence on something only you can add: the risk the winning side took on, what the losing side still solved, what to watch next.',
      '',
      '1c. NEVER MENTION THE ANCHOR. "Falls short of the anchor value" is internal machinery leaking into the page. The reader has never heard of the anchor. Say a package is worth less, not that it missed a number he cannot see.',
      '',
      // The letters are rendered in large type immediately above this prose on
      // the page. "the stronger package (B+)" is the write-up reading the
      // scoreboard back to somebody who is looking at the scoreboard.
      '1d. NEVER WRITE A LETTER GRADE IN THE PROSE. No "(B+)", no "an A- haul", no "the stronger package (B+)", no "earns a B". The letter grades are printed directly above your write-up in large type, so putting them in the sentence is redundant and it reads cheap. Describe the packages in words and let the letters speak for themselves.',
      '',
      'NEVER WRITE THE NEGATIVE SPACE. These instructions tell you which factors do not apply in this league. That is guidance for YOU. The reader has not seen it and does not need it. When a factor does not apply, LEAVE IT OUT SILENTLY. Never write a clause announcing that something is irrelevant, does not matter, is a non-factor, is moot, or is worth nothing here. "While the age gap is irrelevant in redraft" is exactly the sentence never to write: it spends a clause on a thing you are not allowed to use, it names no player, and it tells the reader nothing. Delete the thought, do not negate it.',
      '',
      args.leagueType === 'redraft'
        ? [
            'EVERY TEAM IS TRYING TO MAKE THE PLAYOFFS. This is a one-year league. It resets every season, so a future season is worth nothing to anybody and NOBODY tanks, rebuilds, punts a year, or sells. There are no buyers and no sellers, and no side is more motivated than the other. Never frame one side as "making a playoff push", "going for it", "in win-now mode", "all in", or "chasing a playoff spot", because every manager in this league is doing exactly that, every year, and saying it about one side implies the other is not.',
            args.week != null && args.week >= STANDINGS_TALK_FROM_WEEK
              ? `This trade happened in week ${args.week}, so a standings angle is available. Each side carries a "Record going into this trade" line. You may reference it, but ONLY by stating the record itself, and only when it is genuinely notable (near the bottom, or clearly out in front). Never convert it into a claim about who wants it more.`
              : 'This trade happened in the PRESEASON or the first weeks of the season. There is no standings story yet: no records, no seeding, no playoff picture, no urgency. Grade the players. Any sentence about playoff position here is invented.',
          ].join(' ')
        : 'BUYING AND SELLING. This league carries value across seasons, so a side trading for the future against a side trading for now is a real distinction, and worth naming when the assets show it.',
      '',
      'DO NOT EXPLAIN THE LEAGUE TO THE LEAGUE. The reader is a manager in this league. He knows whether it is redraft, keeper or dynasty, he knows how many teams there are, and he knows how the lineup works. Never write "in a redraft league", "in this format", "since rosters reset every year", or any other line explaining the rules back to him. Write only what he could not already know: what these specific players do for these specific rosters.',
      '',
      'SAY IT STRAIGHT. When one side comes out ahead, write that, in those words: "Sean wins this trade", "Ricci takes the lower grade", "as of today this is Sean\'s deal". What is banned is gesturing at the verdict instead of stating it. NEVER write "the higher mark", "the better end of the ledger", "comes out ahead on paper", "gets the nod", "edges it out", "has the better of it", or any other phrase that describes a conclusion without saying what the conclusion is. If you find yourself reaching for a genteel substitute, use the plain word instead.',
      '',
      args.leagueType === 'redraft'
        ? '2. The rationale must EXPLAIN THE GRADE. The reader can already see who received what from the asset list. Your job is to say WHY one side\'s package is worth more (or less, or even) FOR THIS SEASON. Reference player tiers, weekly ceiling, opportunity and role, NFL team context, positional scarcity, and the receiving roster\'s depth at that position. Do not reference age, youth, or long-term upside.'
        : '2. The rationale must EXPLAIN THE GRADE. The reader can already see who received what from the asset list. Your job is to say WHY one side\'s package is worth more (or less, or even). Reference player tiers, age curves, opportunity, role, NFL team context, draft pick value if dynasty/keeper, positional scarcity. Be specific.',
      '',
      '3. Vary sentence structure and vocabulary. Do not use the same opening template twice.',
      '',
      'DIRECTION OF THE DEAL. The asset list under each side is what that side RECEIVED. Every verb you attach to a player must point the right way, or the sentence says the opposite of what happened.',
      '• Verbs that mean GIVING UP a player: flips, ships, moves on from, sends, deals away, gives up, cashes in, sells, parts with, surrenders. These may ONLY be used for players on the OTHER side\'s received list.',
      '• Verbs that mean GETTING a player: lands, adds, acquires, picks up, buys, comes away with, takes back, walks off with. These are the only verbs for a player on that side\'s own received list.',
      '• "X flips a high-end WR" says X GAVE ONE UP. If X is the side that received the high-end WR, that sentence is wrong. Write it from the assets actually leaving: "the two receivers Sean sent out came back as a genuine WR1", or simply "Sean lands a genuine WR1".',
      '• When you want to frame a package converting into one piece, name the outgoing pieces first and the incoming piece second: "<outgoing pieces> turn into <incoming player>". Never the reverse.',
      '',
      'PLAIN VERBS. Use lands, adds, gets, acquires, sends, gives up. Do NOT reach for showy synonyms: "snaps up", "scoops up", "snags", "nabs", "snares", "poaches", "swipes", "reels in", "hauls in", "pries away", "plucks", "swoops for" and "inks" are all banned. If a reader has to stop and work out what a verb means, it was the wrong verb.',
      '',
      'RANKS AND TIERS ARE GIVEN, NOT GUESSED. Every player line carries a consensus position rank and market value. The better-ranked / higher-valued player is the better asset, full stop. Never call a player "mid-tier", "a depth piece", "a downgrade" or similar when the data on his line outranks the player he is being compared to. If you describe a swap at one position, the higher-ranked player must be the one described as the better side of it.',
      'DIRECTION WORDS. "Flips", "deals away", "ships", "sends", "gives up", "moves on from" and "sheds" all describe what a side GAVE UP. Never use one for a player that side RECEIVED. "Charlie flips an injured TE" is wrong when Charlie is the one who acquired the injured TE; he flipped the pieces he sent to get him. If you are unsure which direction a verb runs, use plain "gets" and "gives up" instead.',
      'HOW TO WRITE A RANK. Never write the word "rank" inside parentheses. "a top-tier RB (rank RB12)" is wrong; it is "(RB12)". Better still, fold the rank into the noun and drop the parentheses entirely: write "a busted TE2", "a steady RB12", "a WR15 who starts most weeks". Only keep the parenthetical when you have already described the player in words and the number adds something the words did not, and even then use the bare form. Never attach a parenthetical rank to every player in the sentence: it reads like a spreadsheet, not a paragraph.',
      '',
      'NAME A RANK ONCE. The two asset lists are two halves of ONE exchange: a player arriving on one side is a player the other side gave up, and the reader can see that from the lists. So cite a position rank at most ONCE per player, on the side that RECEIVED him. When the same player comes up again from the other side\'s point of view, use words instead of the number: "the top-end receiver they gave up", "their RB1", "the back end of their backfield". Never print the same rank label twice in one write-up, and never spend a sentence telling the reader that the side who gave a player up no longer has him.',
      '',
      'RANKS ONLY WHERE THEY MEAN SOMETHING. Name an exact rank when the player is going to start: roughly top 12 at a position for an every-week starter, top 24 for a usable one. Past that the number is noise dressed up as precision. A WR57 is "a bench receiver who will not crack the lineup", not "the WR57". Never hang any part of a grade on a precise rank in the 40s or 50s. If a throw-in piece matters, say what it actually does; if it does not, leave it out.',
      '',
      'NAMING. Refer to a side by its EXACT full name as given ("Kyle\'s Foreskin", "Commisioner Goodhead"), character for character, every time. Never shorten it to the first word or the last word. "Kyle\'s" is not a team, and in a league with more than one Kyle it names the wrong person. If the full name feels repetitive, use a pronoun or "the other side" rather than a fragment.',
      '',
      'BANNED PHRASES. Never write any of these:',
      '• "primarily due to" / "primarily because"',
      '• "added depth" / "upgrades the position" / "addressed a need" as the entire reason',
      '• "solid move" / "great trade for both" / "win-win" / "fair deal" as the verdict',
      '• Any sentence whose only purpose is to restate who received whom',
      '• The em dash character. Never use an em dash anywhere in your writing; use commas, periods, or parentheses instead.',
      '• "while the added X is..." / "while the acquired X..." — do not tack a second player on with a "while the added" clause. Give that player their own sentence or leave them out.',
      '',
      'EXAMPLES. Study these carefully:',
      '',
      'GOOD (varied openings, real analysis):',
      '• "Christian McCaffrey is the bet here: an elite RB1 ceiling if he stays healthy, but the Sinkaroos are paying full freight in 2026 picks for a 29-year-old with a calf history. Horsecocks come away with two firsts and Jahmyr Gibbs, who has three years of cost control ahead of him. That is the side building equity, and the McCaffrey side is the one that has to win now."',
      '• "Trading down from a top-six pick for two thirds and a depth piece looks fine on paper, but the tier break at pick 6 is real: that\'s where the season-altering RBs go. Joey\'s thirds are lottery tickets, not equivalents. The Sinkaroos give up the most leverage they had at the deadline and walk away with role players."',
      '',
      'BAD (formulaic, restates the trade):',
      '• "The Sinkaroos won this trade, primarily due to acquiring Christian McCaffrey, who upgrades their RB position. Horsecocks added depth via Jahmyr Gibbs and two picks. Solid move for both teams."',
      '• "Joey won the trade because he got a better player. He gave up two picks but added a top RB. The other side gained some picks but lost their best player."',
      '',
      'USING THE VALUE DATA + ROSTER CONTEXT:',
      '• Each player line shows the player\'s consensus position rank (e.g. "RB3" = the 3rd-most-valuable RB on the market), consensus market value, age, and injury status when known. Position rank is your primary anchor: a player with rank "RB12" is a strong starter; "RB48" is depth. Market value settles close calls: RB11 vs RB13 with near-equal values is a wash.',
      '',
      'INJURIES. When a player line carries an "injury:" flag, that is current news and it is usually WHY the trade happened.',
      '• If an injured player is one of the headline pieces, you MUST acknowledge the injury in the write-up. Describing a player who is OUT with a knee injury as simply "a top TE" is a failure, even when the grade itself is right.',
      '• SAY WHAT IS WRONG. The parentheses on the line carry the body part and the nature of it. Use them: "out after knee surgery", "nursing a hamstring strain", "on IR with a foot injury". "Injured" on its own wastes the detail you were given.',
      '• MATCH THE SPECIFICITY EXACTLY. Use the words on the line and do not sharpen them. "ankle, sprain" is an ankle sprain, NOT a high ankle sprain. "knee - meniscus, surgery" is knee surgery on the meniscus, NOT a meniscus trim or a repair. "knee" alone is a knee injury, NOT a torn ACL. Naming a more precise diagnosis than the line gives is inventing medical fact, and it reads exactly as authoritative as the real thing.',
      '• "undisclosed" means the team did not say. Write it that way ("out with an undisclosed injury"); do not guess at a body part.',
      '• AVAILABILITY, NOT TIMELINES. Keep it broad: "may miss some time", "could be out a while", "week to week", "unlikely to help this season". You may NOT invent a number of weeks, a return date, or a prognosis: no "out 4-6 weeks", no "expected back after the bye", no "season-ending" unless the line itself says so. There is no timeline in the data, so any timeline you write is fabricated.',
      '• "on injured reserve" and "on the PUP list" mean an extended absence, so "out for some time" is fair. OUT means unavailable this week. DOUBTFUL and QUESTIONABLE mean week to week, and QUESTIONABLE in particular is a minor note, not a headline.',
      '• "injured, no game status listed" means a known injury with no official designation yet. Treat it as a real risk and say the status is unclear, rather than guessing at one.',
      '• A line reading "status:" rather than "injury:" is NOT an injury. A coach\'s decision, a personal matter or a suspension makes a player unavailable without anything being hurt. Never describe those as an injury or a knock.',
      // Joey's note, and he is right: this is the most common real trade in a
      // league with an injured starter in it, and the write-up kept treating
      // it as a mystery or, worse, as one manager fleecing the other.
      '• WHY AN INJURY TRADE HAPPENS, AND YOU SHOULD SAY IT. When one side sends out a hurt, better player and takes back a healthy, lesser one at the SAME position, the deal is almost always about availability rather than value. The manager giving up the injured star needs points out of that lineup slot NOW and is paying in quality to get them. The manager taking the injured star can usually afford to wait: check his "Roster BEFORE this trade" line, and if he has someone who can cover that position for a few weeks, say so, because that is exactly what makes the trade make sense for him. That is the most interesting true thing in a deal like this and it belongs in the write-up: a body who plays this week against the better player once he is back.',
      '• THAT MOTIVE EXPLAINS THE TRADE, IT DOES NOT CHANGE IT. Naming the need is allowed. Presenting it as a win is not. The side that gave up the better player still gave up the better player, and shedding an injured player is never relief, an upgrade, or a market being eased. Name the need, keep the verdict.',
      '• AN INJURY NEVER MOVES THE GRADE. The values on the player line are pulled live at grading time, so an injured player is ALREADY marked down in the number the anchor was built from. Docking that side again charges it twice for one fact. If the side holding the injured player still has the higher-valued package, that side still won the trade, and the write-up must say so while naming the injury as the risk attached to it. "He got hurt" is never a reason to flip, lower, or hedge a grade.',
      '• Each side also has a "Roster BEFORE this trade" line showing positional depth (e.g. "RB(4): McCaffrey (RB3), Hall (RB8), Mostert (RB42) +1 | WR(3): Chase (WR2)..."). It is the roster as it stood BEFORE this deal: the players being received are NOT in it, and the players being sent still are. Use it to weigh need: a side acquiring an RB while already deep at RB is paying retail; the same RB to a side thin at the position is a real win. Never say a side "already had" a player they are receiving in this trade, and never count an incoming player as existing depth.',
      // The old single band (1-12 elite, for every position) was wrong for
      // the one-starter positions and produced a real factual error: it let
      // a TE13 be described as a "premium TE". A league starting one TE has
      // exactly twelve starting tight ends in it, so TE13 is by definition
      // the first man who does NOT start. Elite at a one-slot position is a
      // far narrower thing than elite at a position you start two or three
      // of, and the bands have to say so.
      '• TIER REFERENCE, AND IT DIFFERS BY POSITION. How many of a position a lineup starts changes what a rank means.',
      '  - RB and WR (you start two or three, plus flex): 1-12 elite, 13-24 solid starter, 25-48 bye-week filler / handcuff, 49+ deep depth / waiver.',
      '  - QB and TE (you start ONE): 1-5 elite, 6-12 starter, 13-24 replacement level / streamer, 25+ waiver. A twelve-team league starts twelve tight ends, so TE13 is the first tight end who does not start for anybody.',
      '• "Premium", "elite" and "top-tier" at QB or TE mean TOP FIVE. Never apply them to a TE or QB ranked outside it: a TE13 is replacement level, and calling him premium is a factual error, not a stylistic one. At RB and WR those same words mean top twelve.',
      '• TIER WORDS DESCRIBE A PLAYER, NOT A GAP. Those bands are where the numbers were cut, not cliffs in the players themselves. Two players at the same position within 5 ranks of each other are COMPARABLE and must be described that way: "a slightly lesser WR", "a small step down at RB", "close to a lateral move". Never place them in different classes because a band boundary happens to fall between them. RB12 and RB14 are two ranks apart, not a class apart, and calling one "proven" while calling the other "mid-tier" in the same sentence is a contradiction of the data you were given.',
      '• Reserve tier language for gaps that are actually large: roughly 10 or more ranks at the position, or a starter traded for a bench piece. Describing a player in absolute terms is fine when nothing close is being compared to him ("no true RB1 in this deal"); using the bands to manufacture a gap between near-equal players is not.',
      '• PACKAGE SHAPE BEATS RAW TOTAL. Each side has a "Package:" line with its player count, total value, and best piece. Do NOT grade on total value alone. A lineup starts a fixed number of players, so consolidation wins: two starters worth 9000 combined beat three pieces worth 9000 combined, because the third piece rides the bench and contributes nothing on Sunday. If one side has the better BEST player and the totals are close, that side won. Only credit the quantity side when the receiving roster is genuinely thin enough to start those extra pieces (check its Current roster line), or when the total gap is large enough to outweigh the drop in top-end talent.',
      '• The reverse also holds: a side that turns one elite player into several mid pieces has usually lost, even at an even total, unless it had a glaring hole the depth actually fills.',
      '• Calibrate the grade gap to the rank gap:',
      '  - Both sides got comparable tiers (e.g. RB10 traded for RB14) → roughly even, both B+/B (or A-/A- if both filled real needs).',
      '  - One tier apart (RB8 vs RB22) → clear winner, A-/B range.',
      '  - Two+ tiers apart (RB4 vs RB28) → big swing, A/C+ or larger.',
      '• When BOTH sides acquired top-24 positional starters they can use, BOTH can earn A-range grades. A/A is correct when both teams hit a real need without overpaying. Mutual wins are real.',
      '• Age: for DYNASTY/KEEPER, under-25 = ascending and 29+ = declining, so bump grades accordingly. For REDRAFT, age is irrelevant to value and must not be cited as a reason for any grade; the roster resets in a year, so a younger player carries no premium.',
      '• Picks have no rank data: treat next-year 1st rounders as ~top-50 positional value, 2nds as ~top-100, 3rds as ~top-150, 4th+ as depth. Future-year picks (2027+) are worth ~70% of next-year picks.',
      '',
      'OUTPUT: strict JSON only, no prose before/after, no markdown fences. Shape:',
      '{ "summary": "<grading rationale, 3-4 sentences>", "sides": [{ "side_id": "<uuid>", "grade": "<letter>" }, ...] }',
    ].join('\n')

  const anchors = computeGradeAnchors(args.sides, args.bundle, args.sidByAsset, args.rosterCtx ?? null)

  const sidesText = args.sides
    .map((s, idx) => {
      const assets = s.assets.length === 0
        ? '  (nothing)'
        : s.assets.map((a) => `  - ${formatAssetWithValue(a, args.bundle, args.sidByAsset)}`).join('\n')
      const pkg = summarisePackage(s.assets, args.bundle, args.sidByAsset)
      const roster = s.roster_summary ? `\n   Roster BEFORE this trade: ${s.roster_summary}` : ''
      const rec = s.record ? `\n   Record going into this trade: ${s.record}` : ''
      const a = anchors.get(s.side_id)
      const anchor = a
        ? `\n   ANCHOR GRADE: ${a.grade}${a.confident
            ? ' (high confidence, move at most one notch)'
            : ' (low confidence: this side holds picks or players the value engine could not price, move at most two notches)'}`
        : ''
      return `Side ${idx + 1}, ${s.manager_name} (side_id: ${s.side_id}) received:\n${assets}${pkg ? `\n${pkg}` : ''}${roster}${rec}${anchor}`
    })
    .join('\n\n')

  // Same-position comparisons, decided here rather than left to the model.
  // It read two receivers off the lists and named the wrong one as the better
  // player, which is not a judgement it should be making at all: the values
  // are right there and the answer is arithmetic.
  const swaps = computePositionSwaps(
    args.sides.map((s) => ({ side_id: s.side_id, manager_name: s.manager_name, assets: s.assets })),
    args.bundle,
    args.sidByAsset,
  )
  const swapLines = formatPositionSwaps(swaps)
  const injuryNotes = formatInjurySwapNotes(swaps)

  const user =
    [
      `League type: ${args.leagueType}`,
      args.seasonYear != null ? `Season: ${args.seasonYear}` : null,
      args.week != null ? `Week: ${args.week}` : null,
      `LEAD ANGLE for this write-up (open from this angle, then broaden): ${pickLeadAngle(args.tradeId)}`,
      '',
      sidesText,
      '',
      swapLines.length > 0
        ? [
            'SAME-POSITION SWAPS (already worked out from the values above, these are facts, never contradict one):',
            ...swapLines,
          ].join('\n')
        : null,
      swapLines.length > 0 ? '' : null,
      injuryNotes.length > 0
        ? ['AVAILABILITY ANGLE (this is why the trade happened, work it into the write-up):', ...injuryNotes].join('\n')
        : null,
      injuryNotes.length > 0 ? '' : null,
      'Return JSON with this exact shape:',
      '{',
      '  "summary": "<3-4 sentence recap of the whole trade>",',
      '  "sides": [',
      args.sides.map((s) => `    {"side_id": "${s.side_id}", "grade": "<letter>"}`).join(',\n'),
      '  ]',
      '}',
    ]
      .filter((line) => line !== null)
      .join('\n')

  return { system, user }
}

// Revisit prompt — fed the original verdict so the model can either agree
// ("the grade holds") or shift. Same JSON output shape as buildPrompt for
// parser reuse, but the writing voice is retrospective.
type RevisitPromptArgs = {
  leagueType: 'redraft' | 'keeper' | 'dynasty'
  seasonYear: number | null
  week: number | null
  originalSummary: string
  sides: Array<{
    side_id: string
    manager_name: string
    assets: Array<Record<string, unknown>>
    original_grade: string | null
    roster_summary: string | null
  }>
  bundle: ValueBundle
  sidByAsset: Map<Record<string, unknown>, string>
}

function buildRevisitPrompt(args: RevisitPromptArgs): { system: string; user: string } {
  const typeNote =
    args.leagueType === 'dynasty'
      ? 'This is a DYNASTY league: long-term value matters more than rest-of-season.'
      : args.leagueType === 'keeper'
      ? 'This is a KEEPER league: both rest-of-season and next-year value matter.'
      : [
          'This is a REDRAFT league: rosters reset every year and nobody keeps anyone.',
          'A player\'s age and long-term upside are therefore worth nothing here.',
          'Never credit or penalise a side for youth, "upside", "ascending", "contention window", or "long-term value"; those are dynasty concepts.',
          'Judge only what each side has produced and will produce for the rest of THIS season.',
        ].join(' ')

  const system =
    [
      'You are an experienced fantasy football trade analyst writing a retrospective on a trade graded 4 weeks ago. The retrospective you write is a GRADING RATIONALE: it must explain WHY the (possibly revised) grades are what they are, not just restate the trade.',
      typeNote,
      '',
      'You are given the original recap and the original per-side letter grades.',
      'Your job: write a fresh retrospective that says whether the grade held up. Adjust grades if your view has changed; otherwise keep them.',
      '',
      'GRADING SCALE (use only these): A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F.',
      '',
      'CALIBRATION:',
      '• Stay anchored to the original grade unless the trade looks meaningfully different in hindsight.',
      '• When you do shift, move one or two notches (e.g. B+ → A-, not B+ → F). Dramatic regrades require a clearly different read.',
      '• Most retrospectives will keep the original grade. That is the correct outcome when nothing about the deal looks different now.',
      '',
      'WRITING THE RETROSPECTIVE. 3 to 4 sentences. Follow these rules:',
      '',
      '1. Vary your openings. NEVER start two retrospectives with the same phrase. SPECIFICALLY BANNED openers: "Four weeks after", "Four weeks into the season", "Four weeks later", "In hindsight", "Looking back", "The X side\'s grade holds up", "X won the trade in hindsight", or any verdict-first formula.',
      '',
      '2. Lead with the most interesting observation in retrospect: a specific player\'s arc (breakout, regression, injury), a pick that gained/lost value, a positional context that has changed, a roster decision that aged well or badly. Concrete first, conclusion later.',
      '',
      '3. The retrospective must EXPLAIN the (possibly revised) grade. Reference what has changed (or held) about specific players, picks, or roster contexts. Be specific.',
      '',
      'Example good openers (vary your voice, do not copy these verbatim):',
      '• "The Saquon bet has paid off in a way few saw coming..."',
      '• "Pollard\'s ankle changes the calculus here..."',
      '• "Pittsburgh\'s offense has cratered and so has this trade for..."',
      '• "On second look, the Sinkaroos\' draft capital was the real prize..."',
      '• "What looked like a depth move at the time has become a roster cornerstone..."',
      '• "The early returns favored A; week-six performance flips that..."',
      '',
      'DIRECTION OF THE DEAL. The asset list under each side is what that side RECEIVED. "Flips", "ships", "sends", "moves on from", "deals away" and "gives up" describe a player LEAVING a roster, so they may only be used for players on the OTHER side\'s list. Use "lands", "adds", "acquires" or "comes away with" for a player on that side\'s own list. Getting this backwards states the opposite of what happened.',
      '',
      'RANKS ARE GIVEN, NOT GUESSED. The better-ranked, higher-valued player on the lines you are given is the better asset. Never describe him as the lesser piece of a swap.',
      '',
      'NAME A RANK ONCE, AND ONLY WHERE IT MEANS SOMETHING. A player arriving on one side is a player the other side gave up; the reader can see that, so cite his rank once, on the side that received him, and refer to him in words from the other side ("the receiver they gave up"). Name an exact rank only for a player who actually starts: past roughly the top 24 at a position the number is noise, and "a bench receiver who will not crack the lineup" beats "the WR57".',
      '',
      'NEVER WRITE THE NEGATIVE SPACE, AND NEVER EXPLAIN THE LEAGUE TO THE LEAGUE. These instructions name factors that do not apply here; that is guidance for you, not material for the write-up. Leave an inapplicable factor out silently. Never write that something is irrelevant, does not matter, is a non-factor or is moot, and never write "in a redraft league", "in this format", or any line explaining the league\'s own rules back to a manager who plays in it.',
      '',
      'SAY IT STRAIGHT. If the grade moved, say it moved and say who it favours, in plain words: "this is Sean\'s trade now", "Ricci\'s grade comes down". Never gesture at a verdict with "the higher mark", "the better end of the ledger", "comes out ahead on paper", "gets the nod" or "edges it out". Say what the conclusion is.',
      '',
      'NEVER WRITE A LETTER GRADE IN THE PROSE. The letters are printed beside this text in large type. No "(B+)", no "an A- haul", no "the grade drops to C+", no "earns a B". Say the grade held, came down, or went up, and let the letters say what to.',
      '',
      // The verdict pass is where the availability story actually resolves, so
      // it gets the same licence the initial write-up has: name the motive,
      // keep the verdict.
      'INJURY TRADES HAVE A REASON. When one side sent out a hurt player and took back a healthy, lesser one at the same position, the deal was about availability: he needed points from that slot immediately and paid in quality for them. Four weeks on you can say whether that worked, whether the hurt player came back, and whether the manager who waited got what he was waiting for. That is the story. It is still not a licence to call shedding an injured player a win.',
      '',
      'BANNED PHRASES (same as initial grading): "primarily due to", "added depth", "upgrades the position", "solid move", "fair deal". The em dash character is also banned everywhere; use commas, periods, or parentheses instead. Refer to each side by its EXACT full name every time, never shortened to one word.',
      '',
      'Reference managers by team name. Retrospective voice is optional and should be used sparingly, most sentences should be present-tense analysis.',
      '',
      'OUTPUT: strict JSON only, { "summary": "<retrospective rationale>", "sides": [{ "side_id", "grade" }, ...] }',
    ].join('\n')

  const sidesText = args.sides
    .map((s, idx) => {
      const assets = s.assets.length === 0
        ? '  (nothing)'
        : s.assets.map((a) => `  - ${formatAssetWithValue(a, args.bundle, args.sidByAsset)}`).join('\n')
      const pkg = summarisePackage(s.assets, args.bundle, args.sidByAsset)
      const pkgLine = pkg ? `${pkg}\n` : ''
      const rosterLine = s.roster_summary ? `   Roster BEFORE this trade: ${s.roster_summary}\n` : ''
      const originalGradeLine = s.original_grade ? `   Original grade: ${s.original_grade}\n` : ''
      return `Side ${idx + 1}, ${s.manager_name} (side_id: ${s.side_id}) received:\n${assets}\n${pkgLine}${rosterLine}${originalGradeLine}`
    })
    .join('\n')

  const user =
    [
      `League type: ${args.leagueType}`,
      args.seasonYear != null ? `Season: ${args.seasonYear}` : null,
      args.week != null ? `Week: ${args.week}` : null,
      '',
      'ORIGINAL RECAP (from 4 weeks ago):',
      args.originalSummary,
      '',
      'TRADE:',
      sidesText,
      '',
      'Return JSON with this exact shape:',
      '{',
      '  "summary": "<3-4 sentence retrospective>",',
      '  "sides": [',
      args.sides.map((s) => `    {"side_id": "${s.side_id}", "grade": "<letter>"}`).join(',\n'),
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
    const pos = (a.position as string) || '·'
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

// Like formatAsset but inlines the player's consensus position rank,
// market value, age, and injury status in plain prose so the prompt reads
// naturally. Works on every platform because the asset was resolved to a
// Sleeper id first (sidByAsset). Falls back to the plain format for
// players we couldn't resolve or the value engine doesn't cover.
// A one-line arithmetic summary of what a side is receiving.
//
// The model was being handed a list of players and asked to compare
// packages in prose, so it did the addition itself and got it wrong: on a
// 2-for-3 it claimed one side had "roughly 3,600 more value" when that
// side was actually 1,000 BEHIND on the total. Doing the sum here removes
// the arithmetic from the model's job.
//
// `best` is reported separately from `total` on purpose. Fantasy lineups
// start a fixed number of players, so three mid pieces that add up to two
// good ones are not equivalent: the two good ones both start and the third
// mid piece rides the bench. Total alone hides that; best + count exposes
// it, and the prompt rule below tells the model what to do with it.
function summarisePackage(
  assets: Array<Record<string, unknown>>,
  bundle: ValueBundle,
  sidByAsset: Map<Record<string, unknown>, string>,
): string {
  const vals: Array<{ v: number; label: string }> = []
  let picks = 0
  for (const a of assets) {
    if (a.kind === 'pick') { picks += 1; continue }
    if (a.kind !== 'player') continue
    const sid = sidByAsset.get(a)
    const cv = sid ? bundle.consensus.get(sid) : undefined
    if (!cv) continue
    const rank = sid ? bundle.rankLabels.get(sid) : undefined
    vals.push({ v: cv.value, label: `${(a.name as string) || cv.name}${rank ? ` ${rank}` : ''}` })
  }
  if (vals.length === 0) return picks > 0 ? `   Package: ${picks} pick(s), no player value data` : ''

  vals.sort((a, b) => b.v - a.v)
  const total = vals.reduce((acc, x) => acc + x.v, 0)
  const best = vals[0]
  const parts = [
    `${vals.length} valued player${vals.length === 1 ? '' : 's'}`,
    `total ${total}`,
    `best ${best.v} (${best.label})`,
  ]
  if (vals.length > 1) parts.push(`rest ${total - best.v}`)
  if (picks > 0) parts.push(`plus ${picks} pick(s)`)
  return `   Package: ${parts.join(', ')}`
}

// Is this player carrying a real injury, as opposed to a suspension or a
// coach's decision? Reuses formatInjury so "injured" here means exactly what
// the player line says it means.
function isInjured(meta: PlayerValue | undefined): boolean {
  const line = formatInjury(meta)
  return !!line && line.startsWith('injury:')
}

// Who got the better player at each position, per side.
//
// A trade is usually read one position at a time ("who won the WR swap"),
// and that reading is the one the model got backwards: it wrote that a side
// gave up the better receiver when the receiver it received outranked and
// outvalued the one it sent. Computing the comparison here does two jobs:
// it goes into the prompt as a stated fact, and it goes into the linter so a
// write-up that contradicts it is caught before anyone reads it.
//
// Only positions where BOTH directions carry a player produce a swap. A side
// that received a WR while sending none didn't make a WR swap, and "the
// better receiver" is not a claim anyone can make about it.
function computePositionSwaps(
  sides: Array<{ side_id: string; manager_name: string; assets: Array<Record<string, unknown>> }>,
  bundle: ValueBundle,
  sidByAsset: Map<Record<string, unknown>, string>,
): PositionSwap[] {
  // Best valued player per position out of one asset list.
  const bestByPos = (assets: Array<Record<string, unknown>>): Map<string, SwapPiece> => {
    const out = new Map<string, SwapPiece>()
    for (const a of assets) {
      if (a.kind !== 'player') continue
      const sid = sidByAsset.get(a)
      const cv = sid ? bundle.consensus.get(sid) : undefined
      if (!sid || !cv) continue
      const pos = String((a.position as string) || cv.position || '').toUpperCase()
      if (!pos) continue
      const piece: SwapPiece = {
        name: (a.name as string) || cv.name,
        rank: bundle.rankLabels.get(sid) ?? null,
        value: cv.value,
        injured: isInjured(bundle.meta.get(sid)),
      }
      const prev = out.get(pos)
      if (!prev || piece.value > prev.value) out.set(pos, piece)
    }
    return out
  }

  // Inside this band the two players are close enough that "the better one"
  // is a judgement call, and the write-up gets to make it either way.
  const EVEN_BAND = 0.02

  const swaps: PositionSwap[] = []
  for (const s of sides) {
    const received = bestByPos(s.assets)
    const gave = bestByPos(sides.filter((o) => o.side_id !== s.side_id).flatMap((o) => o.assets))
    for (const [pos, gotPiece] of received) {
      const gavePiece = gave.get(pos)
      if (!gavePiece) continue
      const base = Math.max(gotPiece.value, gavePiece.value)
      const gap = base > 0 ? (gotPiece.value - gavePiece.value) / base : 0
      swaps.push({
        side: s.manager_name,
        pos,
        received: gotPiece,
        gave: gavePiece,
        better: Math.abs(gap) <= EVEN_BAND ? 'even' : gap > 0 ? 'received' : 'gave',
      })
    }
  }
  return swaps
}

// The swap block the prompt shows the model: one line per position, stating
// outright which side ended up with the better player there.
function formatPositionSwaps(swaps: PositionSwap[]): string[] {
  // Each swap appears once from each side's point of view; one line per
  // position is enough, so keep the first.
  const seen = new Set<string>()
  const lines: string[] = []
  for (const s of swaps) {
    if (seen.has(s.pos)) continue
    seen.add(s.pos)
    const piece = (p: SwapPiece) =>
      `${p.name}${p.rank ? ` (${p.rank}, value ${p.value}${p.injured ? ', hurt' : ''})` : ` (value ${p.value})`}`
    const verdict = s.better === 'even'
      ? 'the two are close enough to call it a wash'
      : s.better === 'received'
      ? `${s.side} got the better ${s.pos}`
      : `${s.side} gave up the better ${s.pos}`
    lines.push(`• ${s.pos}: ${s.side} receives ${piece(s.received)} and sends ${piece(s.gave)}. ${verdict}.`)
  }
  return lines
}

// The availability story, when the shape of the deal tells one.
//
// A side that sends out a hurt, higher-valued player and takes back a
// healthy lesser one at the same position is buying games he can start now.
// That is usually the real reason the trade happened and the write-up should
// say so; it is NOT a reason to move a grade, and the prompt says that too.
function formatInjurySwapNotes(swaps: PositionSwap[]): string[] {
  const seen = new Set<string>()
  const notes: string[] = []
  for (const s of swaps) {
    if (seen.has(s.pos)) continue
    // The side that RECEIVED the hurt player, so the sentence reads in one
    // direction: he took on the injury, the other manager took the healthy body.
    if (!s.received.injured || s.gave.injured) continue
    if (s.better !== 'received') continue
    seen.add(s.pos)
    notes.push(
      `• ${s.pos}: ${s.side} takes on ${s.received.name}, who is hurt, and sends back the healthy ` +
      `${s.gave.name}. The likely reason this trade exists is availability: the other side needed a ` +
      `${s.pos} who plays now, and ${s.side} can carry an absence if his roster line shows cover at the ` +
      `position. Name that trade, a healthy body now against the better player once he is back. It ` +
      `explains the deal; it does not change who won it.`,
    )
  }
  return notes
}

function formatAssetWithValue(
  a: Record<string, unknown>,
  bundle: ValueBundle,
  sidByAsset: Map<Record<string, unknown>, string>,
): string {
  const kind = a.kind as string
  if (kind !== 'player') return formatAsset(a)

  const name = (a.name as string) || `Player ${a.player_id}`
  const pos = (a.position as string) || '·'
  const team = (a.team as string) || '?'
  const sid = sidByAsset.get(a)
  if (!sid) return `${name}, ${pos} on ${team} (no value data)`

  const cv = bundle.consensus.get(sid)
  const meta = bundle.meta.get(sid)
  const traits: string[] = []
  const rank = bundle.rankLabels.get(sid)
  if (rank) traits.push(rank)
  if (cv) traits.push(`market value ${cv.value}`)
  const age = cv?.age ?? meta?.age
  if (age != null) traits.push(`age ${age}`)
  const injury = formatInjury(meta)
  if (injury) traits.push(injury)
  if (traits.length === 0) return `${name}, ${pos} on ${team} (no value data)`
  return `${name}, ${pos} on ${team}, ${traits.join(', ')}`
}

// Sleeper's designations are abbreviations aimed at an app UI, not at a
// reader. 'PUP' and 'DNR' mean nothing to a language model that has to turn
// them into a sentence, and a model that half-knows an abbreviation will
// confidently invent what it stands for. Spell them out here so the prompt
// never has to guess.
const INJURY_LABELS: Record<string, string> = {
  ir: 'on injured reserve',
  // No inline gloss for PUP: the detail is already parenthesised, and
  // "on the PUP list (physically unable to perform) (ankle)" reads as a bug.
  // The prompt explains what PUP means instead.
  pup: 'on the PUP list',
  out: 'OUT',
  doubtful: 'DOUBTFUL',
  questionable: 'QUESTIONABLE',
  sus: 'suspended',
  na: 'not active',
  dnr: 'did not report',
  cov: 'on the COVID list',
}

// Sleeper files non-medical absences in the same field as injuries. A healthy
// scratch, a personal matter and a suspension are all reasons a player is
// unavailable, and none of them are injuries. Labelling them "injury:" would
// invite the write-up to invent a knock that doesn't exist.
const NON_MEDICAL_REASONS = new Set([
  "coach's decision",
  'coaches decision',
  'personal',
  'suspension',
  'not injury related',
])

// Render whatever availability signal exists into one phrase.
//
// The status alone is not the test. Sleeper leaves injury_status blank on
// players who are plainly hurt (a torn ACL with an empty designation), so a
// body part or a note is treated as a flag in its own right.
//
// The phrase reports Sleeper's own words and adds nothing. That is a real
// constraint on how specific this can be, and it is worth naming: across the
// league, injury_notes only ever takes five values (Surgery, Sprain, Strain,
// Soreness, Fracture), and body parts are mostly bare ("Knee", "Ankle",
// "Undisclosed") with occasional detail ("Knee - Meniscus", "Knee - ACL").
// So "ankle sprain" is sayable and "high ankle sprain" is not; "knee surgery"
// is sayable and "meniscus trim" is not. The prompt forbids upgrading one
// into the other, because a fabricated diagnosis reads exactly as
// authoritative as a sourced one.
function formatInjury(meta: PlayerValue | undefined): string | null {
  if (!meta) return null
  const clean = (v: string | null | undefined): string | null => {
    const t = (v ?? '').trim()
    return t === '' || t.toLowerCase() === 'healthy' ? null : t
  }
  const status = clean(meta.injury_status)
  const bodyPart = clean(meta.injury_body_part)
  const notes = clean(meta.injury_notes)
  if (!status && !bodyPart && !notes) return null

  const label = status ? INJURY_LABELS[status.toLowerCase()] ?? status : null
  const nonMedical = bodyPart != null && NON_MEDICAL_REASONS.has(bodyPart.toLowerCase())
  // No designation but a known injury: say so rather than implying he is
  // available, and rather than inventing a status Sleeper did not give.
  const head = label ?? (nonMedical ? 'unavailable' : 'injured, no game status listed')

  // Lowercased so it reads as prose inside the line rather than as a field
  // dump, and de-duplicated: 'Sus' + 'Suspension' would otherwise render as
  // "suspended (suspension)".
  const detailParts = [bodyPart, notes]
    .filter((p): p is string => !!p)
    .map((p) => p.toLowerCase())
    .filter((p) => !head.toLowerCase().includes(p))
  const detail = detailParts.join(', ')

  if (nonMedical) {
    return detail ? `status: ${head} (${detail}, not an injury)` : `status: ${head} (not an injury)`
  }
  return detail ? `injury: ${head} (${detail})` : `injury: ${head}`
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
