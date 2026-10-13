// The Progress Report's block in the Tuesday recap email, on the weeks a
// report comes out. One email, not two: a second weekly email means more
// unsubscribes and spam reports, which costs the recap its inbox.
//
// Built once per league and week and shared by every recipient of that
// send (the owner and the mailing list). Anything going wrong here returns
// null and the recap goes out without the block; it never holds up a send.

import { SITE_URL } from '@/lib/recap/links'
import { loadReport } from './build'

export type ReportTeaser = {
  url: string
  title: string
  edition: number
  of: number
  week: number
  teams: number
  playoffTeams: number
  rows: { name: string; record: string; odds: number; change: number | null }[]
  honor: { name: string; letter: string }[]
  // The lowest grade point average: "see me after class".
  last: { name: string; letter: string } | null
  // The biggest move since the last report, when it's worth a line.
  mover: { name: string; change: number; odds: number } | null
  // What the change is measured from: "the last report", or "week 1" on
  // the season's first report.
  since: string
}

const memo = new Map<string, Promise<ReportTeaser | null>>()

export function reportTeaser(league: { id: string; slug: string; name: string }, year: number, week: number): Promise<ReportTeaser | null> {
  const key = `${league.id}:${year}:${week}`
  let p = memo.get(key)
  if (!p) {
    p = build(league, year, week).catch(() => null)
    memo.set(key, p)
    // A long-lived server shouldn't keep these forever.
    setTimeout(() => memo.delete(key), 30 * 60 * 1000).unref?.()
  }
  return p
}

async function build(league: { id: string; slug: string; name: string }, year: number, week: number): Promise<ReportTeaser | null> {
  const r = await loadReport({ ...league, owner_id: null }, week)
  if (r.status !== 'ok') return null
  const v = r.view
  // Only on the report's own week, in the live season.
  if (v.week !== week || v.year !== year) return null
  const change = (odds: number, before: number | null) => (before == null ? null : Math.round(odds - before))
  const moverTeam = [...v.teams]
    .filter((t) => t.before != null)
    .sort((a, b) => Math.abs(b.odds - (b.before ?? 0)) - Math.abs(a.odds - (a.before ?? 0)))[0]
  const moverChange = moverTeam ? change(moverTeam.odds, moverTeam.before) : null
  const byGpa = [...v.teams].sort((a, b) => b.gpa - a.gpa || b.odds - a.odds)
  return {
    url: `${SITE_URL}/leagues/${league.slug}/report/${week}/?utm_source=recap&utm_medium=email&utm_campaign=report`,
    title: v.final ? 'Final Report Card' : 'Progress Report',
    edition: v.edition,
    of: v.editions.length,
    week: v.week,
    teams: v.teams.length,
    playoffTeams: v.playoffTeams,
    rows: v.teams.slice(0, 6).map((t) => ({
      name: t.name,
      record: `${t.w}-${t.l}${t.t ? `-${t.t}` : ''}`,
      odds: t.odds,
      change: change(t.odds, t.before),
    })),
    honor: byGpa.slice(0, 3).map((t) => ({ name: t.name, letter: t.grades.overall.letter })),
    last: byGpa.length > 3 ? { name: byGpa[byGpa.length - 1]!.name, letter: byGpa[byGpa.length - 1]!.grades.overall.letter } : null,
    mover: moverTeam && moverChange != null && Math.abs(moverChange) >= 10 ? { name: moverTeam.name, change: moverChange, odds: moverTeam.odds } : null,
    since: v.compareIsEdition ? 'the last report' : `week ${v.compareWeek ?? 1}`,
  }
}
