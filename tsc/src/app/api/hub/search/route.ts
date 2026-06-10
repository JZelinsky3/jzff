// GET /api/hub/search?q=<text> — Newsstand league search.
// Public: it only ever returns PUBLISHED almanacs — the same gate the
// public almanac route uses — so guests browsing the Clubhouse can search
// too. Uses the admin client because leagues RLS hides other people's
// leagues even when published. Signed-in callers additionally get their
// own bookmark state on each result.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80)
  if (q.length < 2) return NextResponse.json({ results: [] })

  // Escape PostgREST ilike wildcards so "100%" searches literally, and
  // strip the characters that would break the .or() filter grammar
  // (commas split conditions, parens group them).
  const like = `%${q.replace(/[,()]/g, ' ').replace(/[%_]/g, '\\$&')}%`

  const admin = createAdminClient()
  const { data: leagues, error } = await admin
    .from('leagues')
    .select('id, name, slug, platform, owner_id')
    .not('published_at', 'is', null)
    .or(`name.ilike.${like},slug.ilike.${like}`)
    .order('published_at', { ascending: false })
    .limit(12)
  if (error) return NextResponse.json({ error: 'Search failed.' }, { status: 500 })

  const rows = leagues ?? []
  if (rows.length === 0) return NextResponse.json({ results: [] })
  const ids = rows.map((l) => l.id as string)

  // Season counts + year span for the result subtitles, one query.
  const { data: seasonRows } = await admin
    .from('seasons')
    .select('league_id, year')
    .in('league_id', ids)
  const agg = new Map<string, { n: number; min: number; max: number }>()
  for (const s of seasonRows ?? []) {
    const a = agg.get(s.league_id as string) ?? { n: 0, min: Infinity, max: -Infinity }
    a.n += 1
    a.min = Math.min(a.min, s.year as number)
    a.max = Math.max(a.max, s.year as number)
    agg.set(s.league_id as string, a)
  }

  // Which of these the caller has already bookmarked (own-scoped RLS read).
  // Guests have none.
  const bookmarked = new Set<string>()
  if (user) {
    const { data: bmRows } = await supabase
      .from('league_bookmarks')
      .select('league_id')
      .eq('user_id', user.id)
      .in('league_id', ids)
    for (const b of bmRows ?? []) bookmarked.add(b.league_id as string)
  }

  return NextResponse.json({
    results: rows.map((l) => {
      const a = agg.get(l.id as string)
      return {
        name: l.name,
        slug: l.slug,
        platform: l.platform,
        seasons: a?.n ?? 0,
        firstYear: a && a.min !== Infinity ? a.min : null,
        latestYear: a && a.max !== -Infinity ? a.max : null,
        bookmarked: bookmarked.has(l.id as string),
        own: !!user && l.owner_id === user.id,
      }
    }),
  })
}
