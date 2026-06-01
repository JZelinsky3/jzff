import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCareerChronicle } from '@/lib/manager/chronicle'
import { loadTradeFloor } from '@/lib/manager/tradeFloor'
import { valuateLeague, formatValuationLabel, availableSourcesForMode, parseSourceParam, type LeagueMode } from '@/lib/values'
import { ChronicleShell, EmptyState } from '../_shell'
import { SourceToggle } from '../_source-toggle'
import { TradeBuilder } from './_builder'
import type { BuilderLeague, BuilderPlayer, BuilderRoster } from '@/lib/manager/builder-types'

export const dynamic = 'force-dynamic'

const MODE_LABEL: Record<LeagueMode, string> = {
  dynasty: 'Dynasty',
  redraft: 'Redraft',
  keeper: 'Keeper',
}

export default async function TradeBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ source?: string | string[] }>
}) {
  const { slug } = await params
  const { source: rawSource } = await searchParams
  const requestedSource = parseSourceParam(rawSource)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const chronicle = await loadCareerChronicle(slug, user.id)
  if (!chronicle) notFound()
  const floor = await loadTradeFloor(slug, user.id)
  if (!floor) notFound()

  // Valuate every Sleeper league in parallel — each league may have a different
  // mode, so we can't share a single map.
  const builderLeagues: BuilderLeague[] = await Promise.all(
    floor.leagues.map(async (lg) => {
      const valuation = await valuateLeague(
        { mode: lg.mode, qbStarters: lg.qbStarters, teamCount: lg.teamCount },
        { source: requestedSource },
      )
      const rosters: BuilderRoster[] = lg.rosters.map((r) => {
        const players: BuilderPlayer[] = r.playerIds
          .map((pid) => {
            const v = valuation.values.get(pid)
            if (!v) return null
            return {
              playerId: pid,
              name: v.name,
              position: v.position,
              team: v.team,
              value: v.value,
              tier: v.tier,
              age: v.age,
            }
          })
          .filter((p): p is BuilderPlayer => p !== null)
          // Inactive / 0-value already filtered. Sort by value desc so the
          // builder lists premium pieces first.
          .sort((a, b) => b.value - a.value)
        return {
          ownerId: r.ownerId,
          teamName: r.teamName ?? r.ownerName,
          ownerName: r.ownerName,
          isMe: r.isMe,
          players,
          totalValue: players.reduce((s, p) => s + p.value, 0),
        }
      })
      return {
        archiveLeagueId: lg.archiveLeagueId,
        leagueName: lg.leagueName,
        leagueSlug: lg.leagueSlug,
        season: lg.season,
        mode: lg.mode,
        modeLabel: MODE_LABEL[lg.mode],
        valueProviderLabel: formatValuationLabel(valuation),
        myOwnerId: lg.myOwnerId,
        qbStarters: lg.qbStarters,
        teamCount: lg.teamCount,
        rosters,
      }
    }),
  )

  const deck = builderLeagues.length === 0
    ? 'No Sleeper leagues linked yet — connect one to start trading.'
    : `${builderLeagues.length} live league${builderLeagues.length === 1 ? '' : 's'} valuated.  Pick a league, pick a counterparty, build a trade.`

  // Toggle options follow the FIRST league's mode (most users have a single
  // mode across all linked leagues). If a single source is selected that
  // doesn't apply to a different league's mode, the orchestrator's fallback
  // handles it per-league.
  const primaryMode = floor.leagues[0]?.mode ?? 'dynasty'
  const toggleOptions = availableSourcesForMode(primaryMode)

  const intro = (
    <>
      Build a trade, get a verdict. Pick a league at the top, choose a counterparty, drop players
      on each side, and the value engine grades the swap by tier and scarcity. Verdicts read like
      Sunday-paper takes — not just "Side A wins" but where each side's roster shape moves.
      Currently scoped to Sleeper leagues; the value source toggle controls which provider feeds
      the grading.
    </>
  )

  return (
    <ChronicleShell chronicle={chronicle} active="trade-desk" edition="The Trade Desk" deck={deck} intro={intro}>
      {floor.errors.length > 0 && (
        <div className="mh-box rust">
          <div className="mh-box-mast">Wire warning · {floor.errors.length} league{floor.errors.length === 1 ? '' : 's'} couldn&apos;t load</div>
          {floor.errors.map((e, i) => (
            <div key={i} className="mh-row-line"><span className="lbl">{e}</span><span className="val" style={{ color: 'var(--rust)' }}>—</span></div>
          ))}
        </div>
      )}
      {builderLeagues.length === 0 ? (
        <EmptyState>No Sleeper rosters resolved. Link a Sleeper league or re-sync an existing one.</EmptyState>
      ) : (
        <>
          <SourceToggle active={requestedSource} options={toggleOptions} />
          <TradeBuilder leagues={builderLeagues} />
        </>
      )}
      {floor.unsupported.length > 0 && (
        <div className="mh-box steel">
          <div className="mh-box-mast">Pending Platform Support · {floor.unsupported.length}</div>
          <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'var(--cream-soft)', fontSize: '.95rem', lineHeight: 1.6, marginBottom: '.75rem' }}>
            Trade Desk works against live Sleeper rosters today. ESPN, NFL.com, and Yahoo integrations are next.
          </p>
          {floor.unsupported.map((u, i) => (
            <div key={`${u.leagueSlug}-${i}`} className="mh-row-line">
              <span className="lbl">{u.leagueName}</span>
              <span className="val" style={{ color: 'var(--steel)' }}>{u.platform.toUpperCase()}</span>
            </div>
          ))}
        </div>
      )}
    </ChronicleShell>
  )
}
