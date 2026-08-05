// Shared bits of the league's own games wing.
//
// The Games Page has always been able to play a single league — every game
// route reads ?pool=<slug> and hands it straight to that game's dealer. What
// it could not do was FEEL like part of the league: you left /leagues/<slug>/
// for /games/, chose the league again on every visit, and on a phone with the
// almanac saved to the home screen you left the installed app as well. iOS
// scopes a home-screen install to the manifest's `scope`, and the league
// manifest's used to be /leagues/<slug>/, so /games/ opened in the in-app
// browser overlay — a modal sheet with an X that dumps you back on the hub.
//
// So the games are mounted inside the league instead:
//
//   /leagues/<slug>/games/            the shelf
//   /leagues/<slug>/games/<game>/     the game, pool locked to this league
//   /leagues/<slug>/games/board/      one leaderboard, switchable by game
//
// A static `games` segment beats the [[...path]] catch-all that serves the
// almanac templates, the same way `live/` and `sunday-live/` already do, so
// nothing about that route changes.
//
// The pool is never chosen here and there is no lobby: inside a league, the
// league IS the pool. /games/ keeps the picker, the site-wide wheel, the demo
// and the combined-league wheels, and every link ever shared out of it still
// works.

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { GAMES, type GameDef } from '@/app/games/gameDefs'
import type { PlayableGameId } from '@/app/games/PlayGame'

export type LeagueGamesMeta = {
  id: string
  slug: string
  name: string
  abbreviation: string | null
  /** Completed seasons on the books, by the house rule (champion set), and
      the years they span. Every game deals off completed seasons, so this is
      the number that says whether the shelf is worth opening. */
  seasons: number
  firstYear: number | null
  lastYear: number | null
  managers: number
}

/**
 * The league behind this wing, or a 404.
 *
 * Deliberately NOT gated on published_at or on the viewer. A league pool is
 * playable by anyone holding the slug — that rule is set in
 * lib/minigames/deal.ts and argued there — and this route reaches the same
 * dealers with the same pool. Gating the wing but not /games/?pool=<slug>
 * would be a lock on one of two doors into the same room.
 */
export async function loadLeagueGamesMeta(slug: string): Promise<LeagueGamesMeta> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound()

  const db = createAdminClient()
  const { data: league } = await db
    .from('leagues')
    .select('id, name, slug, abbreviation')
    .eq('slug', slug)
    .eq('manager_view', false)
    .maybeSingle()
  if (!league) notFound()

  const leagueId = league.id as string
  const [{ data: seasonRows }, { count: managerCount }] = await Promise.all([
    db.from('seasons').select('year').eq('league_id', leagueId).not('champion_manager_id', 'is', null),
    db.from('managers').select('id', { count: 'exact', head: true }).eq('league_id', leagueId),
  ])

  const years = (seasonRows ?? []).map((r) => r.year as number).sort((a, b) => a - b)

  return {
    id: leagueId,
    slug: league.slug as string,
    name: league.name as string,
    abbreviation: (league.abbreviation as string | null) ?? null,
    seasons: years.length,
    firstYear: years[0] ?? null,
    lastYear: years[years.length - 1] ?? null,
    managers: managerCount ?? 0,
  }
}

/** Route base for this league's games, with the trailing slash the dock and
    every href builder expect. */
export function gamesBase(slug: string): string {
  return `/leagues/${slug}/games/`
}

/**
 * The games this league can actually offer.
 *
 * `allowsSite` and `allowsCombine` are about pools that don't exist in here,
 * so they're irrelevant. What IS relevant is that every game in the list can
 * be played on a single named league, which all six can — the two that refuse
 * the demo (The Gauntlet, the Over/Under) refuse it for wanting a
 * week-by-week schedule the static demo tree hasn't got, not for wanting more
 * than one league.
 *
 * A game whose dealer can't fill a hand still says so on its own screen. That
 * is a better answer than hiding it: "your league has one season, come back"
 * is information, and a shelf that silently shortens is not.
 */
export function leagueGames(): GameDef[] {
  return GAMES
}

export function isPlayableGameId(v: string): v is PlayableGameId {
  return GAMES.some((g) => g.id === v)
}

export function gameDefById(id: string): GameDef | null {
  return GAMES.find((g) => g.id === id) ?? null
}
