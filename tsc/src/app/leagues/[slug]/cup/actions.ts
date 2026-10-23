'use server'

// The commissioner's one control on the Cup page: reopen the current round's
// picks for a day after Thursday's lock, or lock them again early. Stored on
// the season as settings.cup_reopen (see cupLockAt in lib/cup/load.ts).

import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { CUP_REOPEN_HOURS, loadCup, reopenableWeek } from '@/lib/cup/load'

type Result = { ok: true; until: string | null } | { ok: false; error: string }

export async function setCupReopen(slug: string, week: number, open: boolean): Promise<Result> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug) || !Number.isInteger(week)) return { ok: false, error: 'Bad request.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const db = createAdminClient()
  const { data: league } = await db.from('leagues').select('id, owner_id').eq('slug', slug).maybeSingle()
  if (!league) return { ok: false, error: 'League not found.' }
  if (league.owner_id !== user.id && !(await isSiteAdmin(user.id))) {
    return { ok: false, error: 'Only the commissioner can reopen picks.' }
  }

  const view = await loadCup(league.id as string)
  if (!view) return { ok: false, error: 'This league has no Cup.' }
  if (reopenableWeek(view) !== week) return { ok: false, error: 'That round can’t be reopened now.' }

  // The stored settings, not view.season.settings: that copy has the NFL
  // calendar filled in for the Cup and mustn't be written back.
  const { data: season } = await db.from('seasons').select('settings').eq('id', view.season.id).maybeSingle()
  if (!season) return { ok: false, error: 'Season not found.' }
  const settings = { ...((season.settings ?? {}) as Record<string, unknown>) }
  const until = open ? new Date(Date.now() + CUP_REOPEN_HOURS * 3600 * 1000).toISOString() : null
  if (until) settings.cup_reopen = { week, until }
  else delete settings.cup_reopen

  const { error } = await db.from('seasons').update({ settings }).eq('id', view.season.id)
  if (error) return { ok: false, error: 'That didn’t save. Try again.' }

  // The almanac strip says "Pick now" off the same lock.
  revalidateTag(`league-${league.id}`, 'max')
  return { ok: true, until }
}
