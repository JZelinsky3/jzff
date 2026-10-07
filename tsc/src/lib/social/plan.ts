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
//   Wed  8:00  Fantasy History        top six Week N games since 2009
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
//   Mon 12 most added      15 drafted side by side   17 most dropped   19 Monday night matchup
//   Tue 12 top scorers     17 beat the projection    20 target leaders
//   Wed 12 most added      17 season leaders RB/WR   20 best pace vs the record
//   Thu  9 byes            12 this year vs last      16 name the player   19 draft bargains
//   Fri 12 most added      15 best single games      18 every game over N points
//   Sat 13 season leaders QB/TE   15 red zone chances   18 draft busts
//   Sun 10 top projected   12 most added   15 name the player   20 Sunday's top scorers
//
// No questions, no reply bait (Joey): a post asking for answers that gets
// none looks empty. Every extra stands on its own as a stat.
//
// Everything tied to NFL games only runs in the regular season. In the
// offseason the week is just the promo and the feature.
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
import { buildNameGame } from './extras'

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

  const trending = (n: number) => onTheDay('trending', n, 12, 'this', () => ({}))
  const week = (wk: number) => ({ season, week: wk })
  // Season-to-date posts wait for three weeks of games.
  const sinceWeek3 = (wk: number) => (wk >= 3 ? week(wk) : null)

  // Name the player, from the archive: written now, so it's in the digest.
  const nameGame = (n: number, hour: number, k: number): Slot => ({
    kind: 'namegame', date: day(n), hour,
    build: async () => {
      if (!weekOf(day(n), hour)) return { skip: 'not the regular season' }
      return { built: await buildNameGame(season - 1, rotation, k) }
    },
  })

  return [
    // Monday
    trending(0),
    onTheDay('sidebyside', 0, 15, 'last', sinceWeek3),
    onTheDay('drops', 0, 17, 'this', () => ({})),
    // Close to kickoff (8:15), with the night's projections.
    onTheDay('mnf', 0, 19, 'this', (wk) => (wk >= 2 ? { ...week(wk), date: day(0) } : null)),
    // Tuesday
    onTheDay('leaders', 1, 12, 'last', week),
    onTheDay('beat', 1, 17, 'last', week),
    onTheDay('targets', 1, 20, 'last', sinceWeek3),
    // Wednesday
    trending(2),
    onTheDay('season', 2, 17, 'last', (wk) => (wk >= 3 ? { ...week(wk), pos: ['RB', 'WR'][rotation % 2] } : null)),
    onTheDay('pace', 2, 20, 'last', sinceWeek3),
    // Thursday
    onTheDay('byes', 3, 9, 'this', week),
    // The RB/WR position Wednesday's season leaders didn't take.
    onTheDay('yearago', 3, 12, 'last', (wk) => (wk >= 3 ? { ...week(wk), pos: ['WR', 'RB'][rotation % 2] } : null)),
    nameGame(3, 16, 0),
    onTheDay('bargains', 3, 19, 'last', sinceWeek3),
    // Friday
    trending(4),
    onTheDay('highs', 4, 15, 'last', sinceWeek3),
    onTheDay('streaks', 4, 18, 'last', sinceWeek3),
    // Saturday
    onTheDay('season', 5, 13, 'last', (wk) => (wk >= 3 ? { ...week(wk), pos: ['QB', 'TE'][rotation % 2] } : null)),
    onTheDay('redzone', 5, 15, 'last', sinceWeek3),
    onTheDay('busts', 5, 18, 'last', sinceWeek3),
    // Sunday
    onTheDay('projections', 6, 10, 'this', week),
    trending(6),
    nameGame(6, 15, 1),
    onTheDay('sunday', 6, 20, 'this', week),
  ]
}
