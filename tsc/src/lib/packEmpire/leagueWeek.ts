// A League week's scoring, shared by the server (which keeps the score) and the
// browser (which shows it as the lineup fills).
//
// The week's twist is the Daily's rule list, minus the two that don't fit a
// league (salary cap, no captain), the same for every team in the league that
// week and fixed by the league, season and week, so it can't be rerolled. Each
// rule turns up once a season before any repeats. The Standings Pack stands in
// for the Daily's captain: on 'Captain Counts Double' its card counts double.
//
// With a league's twists off, a week scores the way every other mode does now:
// the cards, plus chemistry at full strength (the 2x, real-teammate kind).

import { DAY_RULES, dayChemistry, scoreLineup, type DailyScore, type DayRule } from './dayRules'
import { REGULAR_WEEKS, type LeaguePhase, type Player } from './rules'

/** The plain week: no twist. */
const PLAIN: DayRule = { id: 'plain', title: 'No Twist', line: 'Cards and chemistry, nothing else.' }

function weekly(rule: DayRule): DayRule {
  if (rule.id === 'captain') {
    return { ...rule, title: 'Standings Pack Counts Double', line: 'The card from your Standings Pack counts double.' }
  }
  return {
    ...rule,
    title: rule.title.replace(/\bDay\b/, 'Week'),
    line: rule.line.replace(/\btoday\b/g, 'this week'),
  }
}

export const LEAGUE_RULES: DayRule[] = DAY_RULES.filter((r) => !r.salaryCap && !r.noCaptain).map(weekly)

/** Which week of the season this is, counting the postseason on from the regular. */
function weekIndex(phase: LeaguePhase, week: number): number {
  if (phase === 'gauntlet') return REGULAR_WEEKS
  if (phase === 'finals') return REGULAR_WEEKS + 1
  return week - 1
}

/** A plain FNV hash: nothing here is secret, it only has to be fixed. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
  return h
}

/** The league's season order of rules, shuffled off its id and season. */
function seasonOrder(leagueId: string, season: number): DayRule[] {
  const order = [...LEAGUE_RULES]
  let state = hash(`${leagueId}:${season}`) || 1
  for (let i = order.length - 1; i > 0; i--) {
    state = (Math.imul(state, 48271) >>> 0) % 2147483647
    const j = state % (i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

export function ruleForWeek(leagueId: string, season: number, phase: LeaguePhase, week: number): DayRule {
  const order = seasonOrder(leagueId, season)
  return order[weekIndex(phase, week) % order.length]
}

/** A rule by the id a draft was started under; the plain week for none. */
export function weekRule(ruleId: string | null | undefined): DayRule {
  return (ruleId && LEAGUE_RULES.find((r) => r.id === ruleId)) || PLAIN
}

/** What crosses the wire: the words, not the functions. */
export type WeekRuleView = { id: string; title: string; line: string }

export function weekRuleView(rule: DayRule): WeekRuleView | null {
  return rule.id === PLAIN.id ? null : { id: rule.id, title: rule.title, line: rule.line }
}

/** A lineup's score under the week's rule, slot for slot, empty slots and all.
    The Weakest Link only bites on a full eleven, as on the Daily. */
export function weekScore(lineup: (Player | null)[], packSlot: number | null, ruleId: string | null | undefined): DailyScore {
  const held = lineup.flatMap((p, slot) => (p ? [{ p, slot }] : []))
  const at = packSlot == null ? -1 : held.findIndex((h) => h.slot === packSlot)
  return scoreLineup(
    held.map((h) => h.p),
    at >= 0 ? at : null,
    weekRule(ruleId)
  )
}

/** What a card would add in chemistry to the lineup so far, under the rule. */
export function weekChemPreview(ruleId: string | null | undefined, card: Player, lineup: Player[]): number {
  const rule = weekRule(ruleId)
  return dayChemistry([...lineup, card], rule).total - dayChemistry(lineup, rule).total
}

/** What a card counts for under the rule, on its own (no Weakest Link). */
export function weekCardValue(ruleId: string | null | undefined, card: Player, isPackSlot: boolean): number {
  const rule = weekRule(ruleId)
  const v = Math.round(card.score * (rule.mult?.(card) ?? 1))
  return isPackSlot && rule.captainMult ? v * rule.captainMult : v
}
