// seasons.settings is shared ground, and a sync used to bulldoze it.
//
// Two parties write that column. The platform writes the season's shape —
// playoff start week, team count, status — on every ingest. The commissioner
// writes the things only a person can decide, from /league/<slug>/live:
// `current_week`, `season_start_date`, and the `gotw` map.
//
// Every ingest built a fresh settings object and passed it to upsert, and an
// upsert replaces the whole column. So each sync deleted the live-week
// configuration of the season it was syncing. Nothing looked broken: the
// season row kept is_live, so the league stayed "live" while resolveCurrentWeek
// went null underneath it, Pick'ems and Power Rankings and the Form Sheet all
// went quiet, and the hub reported "<year> is live, but has no week". The
// commissioner set the week again, the next sync ate it again, once a week,
// indefinitely. Game of the Week went with it every time.
//
// Fix: read the stored settings and spread the platform's keys over them. The
// platform still wins every key it is actually authoritative for; keys it has
// never heard of survive untouched.

type MinimalDb = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: number) => {
          maybeSingle: () => Promise<{ data: { settings: unknown } | null }>
        }
      }
    }
  }
}

/**
 * Platform settings for (`leagueId`, `year`), merged over whatever is already
 * stored on the season row. Pass the result straight to the season upsert.
 *
 * Falls back to the platform object alone if the read fails: a sync that can't
 * see the old settings should still sync, and that is exactly the behavior
 * this replaced.
 */
export async function mergeSeasonSettings(
  db: unknown,
  leagueId: string,
  year: number,
  platform: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    const { data } = await (db as MinimalDb)
      .from('seasons')
      .select('settings')
      .eq('league_id', leagueId)
      .eq('year', year)
      .maybeSingle()
    const existing = (data?.settings ?? {}) as Record<string, unknown>
    return { ...existing, ...platform }
  } catch {
    return platform
  }
}
