// Trade-deadline awareness for the Trade Desk.
//
// Two sources, commish wins:
//   1. trade_desk_settings.tradeDeadlineWeek — set in the drawer. Works on
//      every platform (the NFL clock from Sleeper's /state/nfl is
//      league-independent). 0 means "no deadline".
//   2. Sleeper auto-detect — league.settings.trade_deadline + /state/nfl.
//      Only when the league's live season is actually a Sleeper league.
// Anything unanswerable returns { known: false } and the UI skips the
// stamp — silent beats wrong, especially for dynasty leagues that trade
// all offseason.
//
// "Closed" means the league HAS a deadline and it has passed for this
// season (later regular-season week, or playoffs). Leagues with no
// deadline never close; offseason never reads as closed.

import { createAdminClient } from '@/lib/supabase/admin'
import { sleeper } from '@/lib/platforms/sleeper'
import { parseSettings } from '@/lib/tradeDesk/settings'

export type DeadlineStatus = {
  known: boolean
  phase?: 'pre' | 'regular' | 'post' | 'off'
  week?: number
  deadlineWeek?: number | null // null = league has no deadline
  closed?: boolean
  weeksLeft?: number | null // only set in-season, pre-deadline
}

function fromClock(
  phase: 'pre' | 'regular' | 'post' | 'off',
  week: number,
  deadlineWeek: number | null,
): DeadlineStatus {
  const closed =
    deadlineWeek !== null &&
    ((phase === 'regular' && week > deadlineWeek) || phase === 'post')
  const weeksLeft =
    deadlineWeek !== null && phase === 'regular' && week >= 1 && week <= deadlineWeek
      ? deadlineWeek - week + 1
      : null
  return { known: true, phase, week, deadlineWeek, closed, weeksLeft }
}

export async function getDeadlineStatus(leagueId: string): Promise<DeadlineStatus> {
  const db = createAdminClient()
  const { data: league } = await db
    .from('leagues')
    .select('id, platform, trade_desk_settings')
    .eq('id', leagueId)
    .maybeSingle<{ id: string; platform: string; trade_desk_settings: unknown }>()
  if (!league) return { known: false }

  const override = parseSettings(league.trade_desk_settings).tradeDeadlineWeek

  try {
    // Commish override — platform-agnostic, just needs the NFL clock.
    if (override != null) {
      const st = await sleeper.state()
      if (!st) return { known: false }
      const phase =
        st.season_type === 'regular' || st.season_type === 'post' || st.season_type === 'pre'
          ? st.season_type
          : ('off' as const)
      return fromClock(phase, Number(st.week) || 0, override === 0 ? null : override)
    }

    // Auto-detect — Sleeper only.
    if (league.platform !== 'sleeper') return { known: false }
    const { data: seasonRows } = await db
      .from('seasons')
      .select('external_id, year')
      .eq('league_id', leagueId)
      .order('year', { ascending: false })
      .limit(1)
    const liveId = seasonRows?.[0]?.external_id as string | undefined
    // Year-shaped ids are NFL.com season rows, not Sleeper league ids.
    if (!liveId || /^\d{4}$/.test(liveId)) return { known: false }

    const [lg, st] = await Promise.all([sleeper.league(liveId), sleeper.state()])
    if (!lg || !st) return { known: false }
    // The NFL clock only applies if this league row belongs to the
    // clock's season — a league that hasn't rolled over yet would
    // otherwise read last year's deadline against this year's week.
    if (lg.season !== st.season) return { known: false }

    const raw = Number(lg.settings?.trade_deadline)
    const deadlineWeek = Number.isFinite(raw) && raw >= 1 && raw <= 18 ? raw : null
    const phase =
      st.season_type === 'regular' || st.season_type === 'post' || st.season_type === 'pre'
        ? st.season_type
        : ('off' as const)
    return fromClock(phase, Number(st.week) || 0, deadlineWeek)
  } catch {
    return { known: false }
  }
}
