// Writes a week of posts into social_posts, Monday to Sunday.
//
// Run by the Saturday cron for the week ahead, and by "Plan next week" on
// /admin/social. Idempotent on plan_key, so a slot that already exists (even
// one Joey edited or vetoed) is left exactly as it is.
//
// The base post of the day, with its card and link (all times Eastern):
//   Mon  8:00  Feature of the week    a /see/ landing page on the demo league,
//                                     the one X post with a link
//   Tue  8:00  Drop Regret Index      filled Tuesday from Sunday's scores
//   Wed  8:00  Fantasy History        best Week N games since 2009
//   Fri  8:00  Roster Roulette deal   one seeded wheel for everyone
//   Sat 10:00  Weekly Recap promo     product card, no link on X
//
// Weekdays at 8: people read before work, and Tuesday morning is waivers.
// Saturday is later because 8am on a weekend is a dead feed. The feature
// has Monday (Joey: Monday mornings are the most active on X) because it is
// the post that shows the site, so it is the one worth paying for a link.
//
// Around it, the text-only extras (lib/social/extras.ts), so each day has
// three or four posts instead of one:
//   Mon 12 most added      19 question (Monday night)
//   Tue 12 top scorers     17 beat the projection    20 question (waivers)
//   Wed 12 most added      17 season leaders RB/WR   20 question (league)
//   Thu  9 byes            12 history by position    19 question (Thursday night)
//   Fri 12 most added      18 question (league)
//   Sat 13 season leaders QB/TE                      18 question (league)
//   Sun 10 question (lineups)   12 most added        20 Sunday's top scorers
//
// Everything tied to NFL games only runs in the regular season. In the
// offseason the week is the promo, the feature and the league questions.
// Slots already in the past when the plan runs are skipped, so planning the
// current week mid-week only adds what is still ahead.

import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getNflClock, nflWeekAt, weekOverAt } from '@/lib/nflClock'
import { addDays, easternAt, easternDate, easternWeekday } from './config'
import {
  buildFeature, buildHistory, buildRecapPromo, buildRoulette, snapshotDrops,
  type Built, type Kind, type RegretParams,
} from './content'
import { buildNugget, buildQuestion, type QuestionContext } from './extras'

type Db = ReturnType<typeof createAdminClient>

export type PlanResult = { plan_key: string; outcome: 'planned' | 'exists' | 'skipped' | 'error'; detail?: string }

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** The Monday after `today` (Eastern). On a Monday, that is next Monday. */
export function nextMonday(today = easternDate(new Date())): string {
  const dow = easternWeekday(today)
  return addDays(today, ((8 - dow) % 7) || 7)
}

type Slot = {
  kind: Kind
  date: string
  hour: number
  /** Built on the day with no copy yet: does it draw a card? */
  card?: boolean
  build: () => Promise<{ built: Built | null; params?: object } | { skip: string }>
}

export async function planWeek(db: Db, opts: { monday?: string; dry?: boolean } = {}): Promise<{ monday: string; results: PlanResult[] }> {
  const monday = opts.monday ?? nextMonday()
  if (easternWeekday(monday) !== 1) throw new Error(`${monday} is not a Monday`)

  const clock = await getNflClock()
  const season = clock?.season ?? new Date().getUTCFullYear()
  // Not clock.seasonStartDate: Sleeper reports the Wednesday (2026-09-09),
  // and nflWeekAt wants the Tuesday week 1 opens, which it computes itself.
  const seasonOver = weekOverAt(season, 18)
  // The NFL week a post's moment falls in, or null outside the regular season.
  const weekOf = (date: string, hour: number): number | null => {
    const at = easternAt(date, hour)
    const w = nflWeekAt(season, at)
    return w >= 1 && at.getTime() < seasonOver ? w : null
  }
  const rotation = Math.floor(Date.parse(`${monday}T12:00:00Z`) / WEEK_MS)

  const tue = addDays(monday, 1)
  const slots: Slot[] = [
    {
      kind: 'feature', date: monday, hour: 8,
      build: async () => ({ built: buildFeature(rotation) }),
    },
    {
      kind: 'regret', date: tue, hour: 8, card: true,
      build: async () => {
        // The week that ended Monday night. Its drops have to be captured
        // while it is still being played, which is why this slot can only be
        // planned on the Friday or Saturday before.
        const tueWeek = weekOf(tue, 12)
        const week = tueWeek ? tueWeek - 1 : null
        if (!week) return { skip: 'not the regular season' }
        const today = easternDate(new Date())
        const dow = easternWeekday(today)
        if (weekOf(today, 12) !== week || (dow !== 5 && dow !== 6)) {
          return { skip: `drops for week ${week} can only be captured on the Friday or Saturday before it` }
        }
        const params: RegretParams = { season, week, drops: await snapshotDrops() }
        return { built: null, params }
      },
    },
    {
      kind: 'history', date: addDays(monday, 2), hour: 8,
      build: async () => {
        const week = weekOf(addDays(monday, 2), 12)
        if (!week) return { skip: 'not the regular season' }
        return { built: await buildHistory(week, season - 1) }
      },
    },
    {
      kind: 'roulette', date: addDays(monday, 4), hour: 8,
      build: async () => {
        const week = weekOf(addDays(monday, 4), 12)
        if (!week) return { skip: 'not the regular season' }
        return { built: buildRoulette(season, week) }
      },
    },
    {
      kind: 'recap', date: addDays(monday, 5), hour: 10,
      build: async () => ({ built: buildRecapPromo(rotation) }),
    },
    ...extraSlots(monday, season, rotation, weekOf),
  ]

  const keys = slots.map((s) => `${s.date}:${s.kind}`)
  const { data: existing } = await db.from('social_posts').select('plan_key').in('plan_key', keys)
  const have = new Set((existing ?? []).map((r) => r.plan_key as string))

  const results: PlanResult[] = []
  for (const slot of slots) {
    const plan_key = `${slot.date}:${slot.kind}`
    if (have.has(plan_key)) { results.push({ plan_key, outcome: 'exists' }); continue }
    if (easternAt(slot.date, slot.hour).getTime() < Date.now()) {
      results.push({ plan_key, outcome: 'skipped', detail: 'already past' })
      continue
    }
    try {
      const made = await slot.build()
      if ('skip' in made) { results.push({ plan_key, outcome: 'skipped', detail: made.skip }); continue }
      const id = randomUUID()
      const b = made.built
      const row = {
        id,
        plan_key,
        kind: slot.kind,
        scheduled_at: easternAt(slot.date, slot.hour).toISOString(),
        x_text: b?.x_text ?? null,
        threads_text: b?.threads_text ?? null,
        link: b?.link ?? null,
        card: b?.card ?? null,
        // A card is drawn by our own route from the row; the text-only
        // extras have no image at all.
        image_path: (b ? b.card : slot.card) ? `/api/og/social/${id}/` : (b?.image_path ?? null),
        params: made.params ?? {},
      }
      if (!opts.dry) {
        const { error } = await db.from('social_posts').upsert(row, { onConflict: 'plan_key', ignoreDuplicates: true })
        if (error) throw new Error(error.message)
      }
      results.push({ plan_key, outcome: 'planned', detail: b ? b.x_text.split('\n')[0].slice(0, 120) : 'filled before sending' })
    } catch (e) {
      results.push({ plan_key, outcome: 'error', detail: (e as Error).message.slice(0, 300) })
    }
  }
  return { monday, results }
}

type WeekOf = (date: string, hour: number) => number | null

/** The text-only extras for the week starting `monday`; see the table up top. */
function extraSlots(monday: string, season: number, rotation: number, weekOf: WeekOf): Slot[] {
  const day = (n: number) => addDays(monday, n)

  // Built on the day from `params(week)`. `last` means the NFL week that
  // finished before this slot (a Tuesday's top scorers are last week's).
  const onTheDay = (kind: Kind, n: number, hour: number, which: 'this' | 'last', params: (week: number) => object | null): Slot => ({
    kind, date: day(n), hour,
    build: async () => {
      const w = weekOf(day(n), hour)
      if (!w) return { skip: 'not the regular season' }
      const week = which === 'last' ? w - 1 : w
      const p = week >= 1 ? params(week) : null
      return p ? { built: null, params: p } : { skip: 'too early in the season' }
    },
  })

  // League questions run all year; the game-day ones only in the season.
  // Up to three league questions a week, so `k` keeps them apart.
  const question = (n: number, hour: number, context: QuestionContext, k = 0): Slot => ({
    kind: 'question', date: day(n), hour,
    build: async () => {
      if (context !== 'league' && !weekOf(day(n), hour)) return { skip: 'not the regular season' }
      return { built: buildQuestion(context, context === 'league' ? rotation * 3 + k : rotation) }
    },
  })

  const trending = (n: number, sunday = false) => onTheDay('trending', n, 12, 'this', () => (sunday ? { sunday } : {}))
  const week = (wk: number) => ({ season, week: wk })

  return [
    // Monday
    trending(0),
    question(0, 19, 'mnf'),
    // Tuesday
    onTheDay('leaders', 1, 12, 'last', week),
    onTheDay('beat', 1, 17, 'last', week),
    question(1, 20, 'waivers'),
    // Wednesday
    trending(2),
    onTheDay('season', 2, 17, 'last', (wk) => (wk >= 3 ? { ...week(wk), pos: ['RB', 'WR'][rotation % 2] } : null)),
    question(2, 20, 'league', 0),
    // Thursday
    onTheDay('byes', 3, 9, 'this', week),
    {
      kind: 'nugget', date: day(3), hour: 12,
      build: async () => {
        const wk = weekOf(day(3), 12)
        if (!wk) return { skip: 'not the regular season' }
        return { built: await buildNugget(wk, season - 1, rotation) }
      },
    },
    question(3, 19, 'tnf'),
    // Friday
    trending(4),
    question(4, 18, 'league', 1),
    // Saturday
    onTheDay('season', 5, 13, 'last', (wk) => (wk >= 3 ? { ...week(wk), pos: ['QB', 'TE'][rotation % 2] } : null)),
    question(5, 18, 'league', 2),
    // Sunday
    question(6, 10, 'sunday'),
    trending(6, true),
    onTheDay('sunday', 6, 20, 'this', week),
  ]
}
