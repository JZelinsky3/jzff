// Writes a week of posts into social_posts, Monday to Sunday.
//
// Run by the Saturday cron for the week ahead, and by "Plan next week" on
// /admin/social. Idempotent on plan_key, so a slot that already exists (even
// one Joey edited or vetoed) is left exactly as it is.
//
// The week (all times Eastern):
//   Mon 12:00  Weekly Recap promo     product card
//   Tue 12:00  Drop Regret Index      filled Tuesday from Sunday's scores
//   Wed 12:00  Fantasy History        best Week N games since 2009
//   Fri 12:00  Roster Roulette deal   one seeded wheel for everyone
//   Sat 10:00  Feature of the week    a /see/ landing page on the demo league
//
// The three NFL posts only run in the regular season. In the offseason the
// week is just the promo and the feature.

import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getNflClock, nflWeekAt, weekOverAt } from '@/lib/nflClock'
import { addDays, easternAt, easternDate, easternWeekday } from './config'
import {
  buildFeature, buildHistory, buildRecapPromo, buildRoulette, snapshotDrops,
  type Built, type Kind, type RegretParams,
} from './content'

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
      kind: 'recap', date: monday, hour: 12,
      build: async () => ({ built: buildRecapPromo(rotation) }),
    },
    {
      kind: 'regret', date: tue, hour: 12,
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
      kind: 'history', date: addDays(monday, 2), hour: 12,
      build: async () => {
        const week = weekOf(addDays(monday, 2), 12)
        if (!week) return { skip: 'not the regular season' }
        return { built: await buildHistory(week, season - 1) }
      },
    },
    {
      kind: 'roulette', date: addDays(monday, 4), hour: 12,
      build: async () => {
        const week = weekOf(addDays(monday, 4), 12)
        if (!week) return { skip: 'not the regular season' }
        return { built: buildRoulette(season, week) }
      },
    },
    {
      kind: 'feature', date: addDays(monday, 5), hour: 10,
      build: async () => ({ built: buildFeature(rotation) }),
    },
  ]

  const keys = slots.map((s) => `${s.date}:${s.kind}`)
  const { data: existing } = await db.from('social_posts').select('plan_key').in('plan_key', keys)
  const have = new Set((existing ?? []).map((r) => r.plan_key as string))

  const results: PlanResult[] = []
  for (const slot of slots) {
    const plan_key = `${slot.date}:${slot.kind}`
    if (have.has(plan_key)) { results.push({ plan_key, outcome: 'exists' }); continue }
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
        // A post filled later always draws its own card.
        image_path: !b || b.card ? `/api/og/social/${id}/` : b.image_path,
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
