// Which wheels a given visitor is offered.
//
// Everyone gets the site-wide pool. A signed-in reader also gets a pool per
// league they have a stake in — the ones they run, plus the ones they've
// bookmarked — because landing on your own league-mate's 2019 team is the
// entire joke, and a stranger's isn't.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const SITE_POOL = { id: 'site', label: 'The Whole Site' }

export type GamePool = {
  id: string
  label: string
  /** Why this pool is on the list — shown on the hub cards. */
  note: string
  /** Short monogram for the card plate. The league's own abbreviation when it
      set one (only about a third do), otherwise initials off the name. */
  monogram: string
  /** Completed seasons on the books, and the years they span. Both are the
      card's stat line: "how much history is in here" is the only thing that
      actually distinguishes one league from another before you play it. */
  seasons: number
  firstYear: number | null
  lastYear: number | null
  managers: number
}

/** Initials, for leagues that never set an abbreviation. Two or three letters
    off the significant words — "PA Milk Society" gives PMS, which is why the
    league's own abbreviation always wins when it has one. */
function monogramFor(name: string, abbreviation: string | null): string {
  const abbr = (abbreviation ?? '').trim()
  if (abbr) return abbr.toUpperCase().slice(0, 4)
  const words = name
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w && !/^(the|of|and|a|an|league|fantasy|football)$/i.test(w))
  const source = words.length > 0 ? words : name.split(/\s+/).filter(Boolean)
  const letters = source.slice(0, 3).map((w) => w[0]?.toUpperCase() ?? '').join('')
  return letters || name.slice(0, 2).toUpperCase()
}

export async function loadPoolsForViewer(): Promise<{ signedIn: boolean; leaguePools: GamePool[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { signedIn: false, leaguePools: [] }

  const [{ data: owned }, { data: bookmarkRows }] = await Promise.all([
    supabase
      .from('leagues')
      .select('id, name, slug, published_at, abbreviation')
      .eq('owner_id', user.id)
      .eq('manager_view', false)
      .order('created_at', { ascending: false }),
    supabase.from('league_bookmarks').select('league_id').eq('user_id', user.id),
  ])

  type Raw = { id: string; name: string; slug: string; abbreviation: string | null; note: string }
  const raw: Raw[] = []
  const seen = new Set<string>()
  for (const l of owned ?? []) {
    if (seen.has(l.slug)) continue
    seen.add(l.slug)
    raw.push({
      id: l.id,
      name: l.name,
      slug: l.slug,
      abbreviation: l.abbreviation ?? null,
      note: l.published_at ? 'Your league' : 'Unpublished · only you can play it',
    })
  }

  // Bookmarked leagues belong to other people, so RLS won't let this user
  // SELECT them directly — resolve the ids they're allowed to hold through
  // the admin client, own-scoped by the bookmark list we just read.
  const bookmarkIds = (bookmarkRows ?? []).map((b) => b.league_id as string)
  if (bookmarkIds.length > 0) {
    const db = createAdminClient()
    const { data: followed } = await db
      .from('leagues')
      .select('id, name, slug, published_at, abbreviation')
      .in('id', bookmarkIds)
      .eq('manager_view', false)
      .not('published_at', 'is', null)
    for (const l of followed ?? []) {
      if (seen.has(l.slug as string)) continue
      seen.add(l.slug as string)
      raw.push({
        id: l.id as string,
        name: l.name as string,
        slug: l.slug as string,
        abbreviation: (l.abbreviation as string | null) ?? null,
        note: 'A league you follow',
      })
    }
  }

  if (raw.length === 0) return { signedIn: true, leaguePools: [] }

  // The card's stat line. Read through the admin client because the list
  // already includes other people's leagues, resolved above and own-scoped by
  // this viewer's bookmarks. Completed seasons only, by the house rule — a
  // card promising eight seasons when one of them has no champion yet would
  // be counting something none of the games will deal.
  const db = createAdminClient()
  const ids = raw.map((r) => r.id)
  const [{ data: seasonRows }, { data: managerRows }] = await Promise.all([
    db.from('seasons').select('league_id, year').in('league_id', ids).not('champion_manager_id', 'is', null),
    db.from('managers').select('league_id').in('league_id', ids),
  ])

  const years = new Map<string, number[]>()
  for (const r of seasonRows ?? []) {
    const list = years.get(r.league_id as string)
    if (list) list.push(r.year as number)
    else years.set(r.league_id as string, [r.year as number])
  }
  const managerCount = new Map<string, number>()
  for (const r of managerRows ?? []) {
    const k = r.league_id as string
    managerCount.set(k, (managerCount.get(k) ?? 0) + 1)
  }

  const leaguePools: GamePool[] = raw.map((r) => {
    const ys = (years.get(r.id) ?? []).sort((a, b) => a - b)
    return {
      id: r.slug,
      label: r.name,
      note: r.note,
      monogram: monogramFor(r.name, r.abbreviation),
      seasons: ys.length,
      firstYear: ys[0] ?? null,
      lastYear: ys[ys.length - 1] ?? null,
      managers: managerCount.get(r.id) ?? 0,
    }
  })

  return { signedIn: true, leaguePools }
}
