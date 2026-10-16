// GET /leagues/<slug>/cup/summary/: the Cup panel in the Season Archives
// (both trees), which stays up all year: the Cup only runs a few weeks, but
// its brackets and champions are part of the league's history.
//
// Returns null when the league has no Cup and none is coming. Before a
// league's first Cup is drawn it returns the launch preview, the same one
// the almanac strip points at.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recapViewable } from '@/lib/recap/load'
import { cupBadge, type CupBadge } from '@/lib/cup/load'
import { loadLeagueCups, type LeagueCups } from '@/lib/cup/history'
import { demoLeagueCups, isDemoCup } from '@/lib/cup/demo'
import { CHAMPION_BONUS, roundPoints } from '@/lib/cup/extras'
import { challengePoints } from '@/lib/cup/stamps'

export const dynamic = 'force-dynamic'

export type CupSummaryYear = {
  year: number
  href: string
  state: 'before' | 'running' | 'done'
  champion: { name: string; seed: number } | null
  runnerUp: string | null
  // The final's score, winner first.
  final: string | null
  // Where a Cup that isn't over stands.
  round: { name: string; short: string; week: number } | null
  alive: number
  field: number
}

export type CupSummary =
  | { kind: 'preview'; name: string; href: string; status: string }
  | {
      kind: 'cup'
      name: string
      href: string
      // The Cup Hall of Fame.
      hall: string
      since: number
      // One line on the newest Cup.
      status: string
      picksOpen: boolean
      // Newest first.
      years: CupSummaryYear[]
      // The newest Cup's bracket challenge, once anyone has points.
      leader: { names: string[]; points: number; done: boolean } | null
      stamps: number
    }

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

function json(body: CupSummary | null, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, max-age=60' } })
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json(null, 404)
  const href = `/leagues/${slug}/cup/`
  let leagueCups: LeagueCups
  let badge: CupBadge | null
  if (isDemoCup(slug)) {
    // The demo league (lib/cup/demo.ts): no rows, and its semifinal picks
    // are always open.
    leagueCups = demoLeagueCups()
    const newest = leagueCups.cups[leagueCups.cups.length - 1]
    badge = newest ? { id: newest.view.cup.id, name: newest.view.cup.name, href, label: '', key: '', picksOpen: true, preview: false } : null
  } else {
    const db = createAdminClient()
    const { data: league } = await db.from('leagues').select('id, slug, owner_id, published_at').eq('slug', slug).maybeSingle()
    if (!league || !(await recapViewable(league))) return json(null, 404)
    const [lc, { data: live }] = await Promise.all([
      loadLeagueCups(league.id as string),
      db.from('seasons').select('year, settings').eq('league_id', league.id).eq('is_live', true).maybeSingle(),
    ])
    leagueCups = lc
    badge = live
      ? await cupBadge(db, { id: league.id as string, slug }, { year: live.year as number, week: null, settings: (live.settings ?? null) as Record<string, unknown> | null }).catch(() => null)
      : null
  }
  const { cups, stamps, nameOf } = leagueCups

  if (!cups.length) {
    if (badge?.preview) return json({ kind: 'preview', name: badge.name, href, status: badge.label })
    return json(null)
  }

  const years: CupSummaryYear[] = [...cups].reverse().map(({ view }) => {
    const b = view.bracket
    const last = b.rounds[b.rounds.length - 1]!.matches[0]
    let final: string | null = null
    if (b.champion && last && last.winner && last.a.kind === 'team' && last.b.kind === 'team') {
      const w = last[last.winner]
      const l = last.winner === 'a' ? last.b : last.a
      if (w.kind === 'team') final = `${(w.score ?? 0).toFixed(2)} to ${(l.score ?? 0).toFixed(2)}`
    }
    const out = b.rounds.flatMap((r) => r.matches).filter((m) => m.state === 'final').length
    const r = b.currentRound != null ? b.rounds[b.currentRound]! : null
    return {
      year: view.cup.season_year,
      href: `${href}?year=${view.cup.season_year}`,
      state: b.status,
      champion: b.champion ? { name: b.champion.name, seed: b.champion.seed } : null,
      runnerUp: b.runnerUp?.name ?? null,
      final,
      round: r ? { name: r.name, short: r.short, week: r.week } : null,
      alive: b.field - out,
      field: b.field,
    }
  })

  const newest = cups[cups.length - 1]!
  const nb = newest.view.bracket
  const now = years[0]!
  let status: string
  if (now.state === 'done' && now.champion) status = `${now.champion.name} won it as the ${ordinal(now.champion.seed)} seed.`
  else if (now.state === 'before' || !now.round) status = `The draw is set. Round one is week ${nb.startWeek}.`
  else status = `${now.round.name}${newest.view.currentWeek === now.round.week ? ' this week' : `, week ${now.round.week}`}. ${now.alive} of ${now.field} left.`

  const board = challengePoints(nb, newest.picks, roundPoints(nb.rounds.length), CHAMPION_BONUS)
  const best = Math.max(0, ...board.values())
  const leader =
    best > 0
      ? {
          names: [...board.entries()]
            .filter(([, n]) => n === best)
            .map(([who]) => nameOf(who))
            .sort(),
          points: best,
          done: nb.status === 'done',
        }
      : null

  return json({
    kind: 'cup',
    name: newest.view.cup.name,
    href,
    hall: `${href}hall/`,
    since: cups[0]!.view.cup.season_year,
    status,
    picksOpen: !!badge && !badge.preview && badge.id === newest.view.cup.id && badge.picksOpen,
    years,
    leader,
    stamps: stamps.length,
  })
}
