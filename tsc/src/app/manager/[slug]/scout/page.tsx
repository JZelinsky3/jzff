import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCareerChronicle } from '@/lib/manager/chronicle'
import { loadScoutReport, type ScoutLeague, type ScoutReport } from '@/lib/manager/scout'
import { TIER_LABEL, TIER_ORDER, TRACKED_POSITIONS, type PositionTier, type TrackedPosition, type TradeRecommendation, type PositionRating } from '@/lib/values/needs'
import { ChronicleShell, EmptyState } from '../_shell'

export const dynamic = 'force-dynamic'

const TIER_COLOR: Record<PositionTier, string> = {
  elite: 'var(--gold-bright)',
  strong: 'var(--gold)',
  average: 'var(--cream-soft)',
  thin: 'var(--rust)',
  critical: 'var(--rust)',
}

export default async function ScoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const chronicle = await loadCareerChronicle(slug, user.id)
  if (!chronicle) notFound()
  const report = await loadScoutReport(slug, user.id)
  if (!report) notFound()

  const deck = report.totals.leagues === 0
    ? 'No Sleeper leagues linked yet.'
    : `${report.totals.weakSpots} weak spot${report.totals.weakSpots === 1 ? '' : 's'} · ${report.totals.strongSpots} strong${report.totals.strongSpots === 1 ? '' : 's'} · ${report.totals.recommendations} target${report.totals.recommendations === 1 ? '' : 's'} on the board.`

  const intro = (
    <>
      Position scarcity, scored against the league. Where you're elite, where you're thin, where
      KTC and the slot template say a trade should make sense. The lead story sketches the biggest
      gap; the strength matrix lines up every league against every position; the recommendation
      board is starting points for the Trade Desk, not final verdicts. Sleeper-only for now.
    </>
  )

  return (
    <ChronicleShell chronicle={chronicle} active="scout" edition="The Scout" deck={deck} intro={intro}>
      {report.errors.length > 0 && (
        <div className="mh-box rust">
          <div className="mh-box-mast">Wire warning · {report.errors.length} league{report.errors.length === 1 ? '' : 's'} couldn&apos;t load</div>
          {report.errors.map((e, i) => (
            <div key={i} className="mh-row-line"><span className="lbl">{e}</span><span className="val" style={{ color: 'var(--rust)' }}>—</span></div>
          ))}
        </div>
      )}
      {report.totals.leagues === 0 ? (
        <EmptyState>No Sleeper rosters resolved. Link a Sleeper league or re-sync an existing one.</EmptyState>
      ) : (
        <>
          <LeadStory report={report} />
          <StrengthMatrix report={report} />
          <PerLeagueScout report={report} />
          <TopRecommendations report={report} slug={slug} />
        </>
      )}
      {report.unsupported.length > 0 && (
        <div className="mh-box steel">
          <div className="mh-box-mast">Pending Platform Support · {report.unsupported.length}</div>
          <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'var(--cream-soft)', fontSize: '.95rem', lineHeight: 1.6, marginBottom: '.75rem' }}>
            The Scout reads live Sleeper rosters only today. ESPN, NFL.com, and Yahoo coverage is on the roadmap.
          </p>
          {report.unsupported.map((u, i) => (
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

function LeadStory({ report }: { report: ScoutReport }) {
  const worst = pickWorstSpot(report)
  const best = pickBestSpot(report)
  const lopsided = report.leagues
    .map((lg) => ({
      lg,
      lopsidedness: Math.max(...TRACKED_POSITIONS.map((p) => Math.abs(lg.needs.ratings[p].diffPct))),
    }))
    .sort((a, b) => b.lopsidedness - a.lopsidedness)[0]

  return (
    <section className="mh-row mh-row-2">
      <article className="mh-story" style={{ borderTop: 'none', paddingTop: 0 }}>
        <div className="mh-story-kicker">Lead Story · The Scout&apos;s Report</div>
        <h3 className="mh-story-head">
          {report.totals.weakSpots === 0
            ? <>Roster is <em>balanced</em> across the board.</>
            : report.totals.weakSpots === 1
            ? <>One <em>weak spot</em> identified.</>
            : <><em>{report.totals.weakSpots}</em> weak spots across {report.totals.leagues} {report.totals.leagues === 1 ? 'league' : 'leagues'}.</>}
        </h3>
        <p className="mh-story-dek">
          Each position rated relative to the league median — same currency every team in that league plays in.
        </p>
        <div className="mh-story-body">
          <p>
            <span className="dropcap">A</span>cross {report.totals.leagues} live {report.totals.leagues === 1 ? 'roster' : 'rosters'}, the Scout flagged{' '}
            <strong>{report.totals.weakSpots}</strong> position{report.totals.weakSpots === 1 ? '' : 's'} where you sit below the median —
            and <strong>{report.totals.strongSpots}</strong> where you sit above. The desk built{' '}
            <strong>{report.totals.recommendations}</strong> trade target{report.totals.recommendations === 1 ? '' : 's'} from those imbalances.
          </p>
          {worst && (
            <p>
              Most urgent: <strong>{worst.position}</strong> in <strong>{worst.leagueName}</strong> — rated <em>{TIER_LABEL[worst.rating.tier]}</em>{' '}
              ({fmtPct(worst.rating.diffPct)} vs the league median). {worst.rating.topPlayers[0] ? (
                <>The top piece carrying that group is <strong>{worst.rating.topPlayers[0].name}</strong>.</>
              ) : <>The bench is empty at that slot.</>}
            </p>
          )}
          {best && (
            <p>
              Greatest surplus: <strong>{best.position}</strong> in <strong>{best.leagueName}</strong> — <em>{TIER_LABEL[best.rating.tier]}</em>{' '}
              ({fmtPct(best.rating.diffPct)}). Asset to deal from when chasing a need.
            </p>
          )}
          {lopsided && (
            <p>
              Most lopsided roster: <strong>{lopsided.lg.builderLeague.leagueName}</strong> — extremes between best and worst position are wide enough that even a single
              cross-position trade could rebalance the team meaningfully.
            </p>
          )}
        </div>
      </article>
      <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="mh-box">
          <div className="mh-box-mast">Scout&apos;s board</div>
          <div className="mh-row-line"><span className="lbl">Leagues scanned</span><span className="val cream">{report.totals.leagues}</span></div>
          <div className="mh-row-line"><span className="lbl">Strong / Elite</span><span className="val">{report.totals.strongSpots}</span></div>
          <div className="mh-row-line"><span className="lbl">Thin / Critical</span><span className="val" style={{ color: 'var(--rust)' }}>{report.totals.weakSpots}</span></div>
          <div className="mh-row-line"><span className="lbl">Targets identified</span><span className="val cream">{report.totals.recommendations}</span></div>
        </div>
        <TierLegend />
      </aside>
    </section>
  )
}

function TierLegend() {
  return (
    <div className="mh-box steel">
      <div className="mh-box-mast">Tier legend</div>
      {TIER_ORDER.map((tier) => (
        <div key={tier} className="mh-row-line">
          <span className="lbl">{TIER_LABEL[tier]}</span>
          <span className="val" style={{ color: TIER_COLOR[tier] }}>{tierBadge(tier)}</span>
        </div>
      ))}
      <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '.78rem', color: 'var(--cream-mute)', marginTop: '.75rem', lineHeight: 1.5 }}>
        Elite ≥ +25% vs median · Strong ≥ +10% · Thin ≤ −10% · Critical ≤ −25%.
      </div>
    </div>
  )
}

function StrengthMatrix({ report }: { report: ScoutReport }) {
  return (
    <section>
      <div className="mh-shead">
        <h3 className="mh-shead-title">The <em>Strength</em> Matrix</h3>
        <span className="mh-shead-meta">Position tiers across every league</span>
      </div>
      <div className="mh-box">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: '.72rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--gold-deep)', color: 'var(--gold)', textAlign: 'left' }}>
              <th style={{ padding: '.55rem .4rem', letterSpacing: '.18em', fontSize: '.55rem' }}>LEAGUE</th>
              <th style={{ padding: '.55rem .4rem', letterSpacing: '.18em', fontSize: '.55rem' }}>MODE</th>
              {TRACKED_POSITIONS.map((p) => (
                <th key={p} style={{ padding: '.55rem .4rem', letterSpacing: '.18em', fontSize: '.55rem' }}>{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.leagues.map((lg) => (
              <tr key={lg.builderLeague.archiveLeagueId} style={{ borderBottom: '1px dotted var(--ink-line-soft)' }}>
                <td style={{ padding: '.55rem .4rem', color: 'var(--cream)', fontFamily: 'var(--serif)', fontSize: '.95rem' }}>{lg.builderLeague.leagueName}</td>
                <td style={{ padding: '.55rem .4rem', color: 'var(--cream-mute)', fontSize: '.62rem', letterSpacing: '.15em' }}>{lg.builderLeague.modeLabel}{lg.builderLeague.qbStarters >= 2 ? ' · SF' : ''}</td>
                {TRACKED_POSITIONS.map((p) => {
                  const r = lg.needs.ratings[p]
                  return (
                    <td key={p} style={{ padding: '.55rem .4rem', color: TIER_COLOR[r.tier], fontWeight: 700, letterSpacing: '.06em' }}>
                      {tierBadge(r.tier)} <span style={{ color: 'var(--cream-mute)', fontWeight: 400, fontSize: '.6rem', marginLeft: '.35rem' }}>{fmtPct(r.diffPct)}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function PerLeagueScout({ report }: { report: ScoutReport }) {
  return (
    <section>
      <div className="mh-shead">
        <h3 className="mh-shead-title">Per-<em>League</em> Scouting</h3>
        <span className="mh-shead-meta">Deep view, one league at a time</span>
      </div>
      <div className="mh-broadsheet">
        {report.leagues.map((lg) => <LeagueScoutCard key={lg.builderLeague.archiveLeagueId} lg={lg} />)}
      </div>
    </section>
  )
}

function LeagueScoutCard({ lg }: { lg: ScoutLeague }) {
  const ratings = TRACKED_POSITIONS.map((p) => lg.needs.ratings[p])
  const weak = ratings.filter((r) => r.tier === 'thin' || r.tier === 'critical').sort((a, b) => a.diffPct - b.diffPct)
  const strong = ratings.filter((r) => r.tier === 'strong' || r.tier === 'elite').sort((a, b) => b.diffPct - a.diffPct)
  return (
    <article className="mh-row mh-row-2" style={{ borderTop: '1px dotted var(--ink-line)', paddingTop: '1.5rem' }}>
      <div>
        <div className="mh-story-kicker">{lg.builderLeague.leagueName} · {lg.builderLeague.modeLabel}</div>
        <h4 className="mh-story-head" style={{ fontSize: '1.5rem' }}>
          {weak.length === 0 ? <>Roster <em>balanced</em>.</> : <><em>{weak.length}</em> need{weak.length === 1 ? '' : 's'}, <em>{strong.length}</em> surplus{strong.length === 1 ? '' : 'es'}.</>}
        </h4>
        <div className="mh-story-body">
          <p>
            League uses <strong>{lg.builderLeague.valueProviderLabel}</strong> values. Position medians taken across all {lg.builderLeague.teamCount} rosters in the league.
          </p>
          {weak.length > 0 && (
            <p>
              Where you&apos;re thin:{' '}
              {weak.map((r, i) => (
                <span key={r.position}>
                  <strong>{r.position}</strong> <em style={{ color: TIER_COLOR[r.tier] }}>({TIER_LABEL[r.tier]})</em>{i < weak.length - 1 ? ', ' : '.'}
                </span>
              ))}
            </p>
          )}
          {strong.length > 0 && (
            <p>
              Where you&apos;re stacked:{' '}
              {strong.map((r, i) => (
                <span key={r.position}>
                  <strong>{r.position}</strong> <em style={{ color: TIER_COLOR[r.tier] }}>({TIER_LABEL[r.tier]})</em>{i < strong.length - 1 ? ', ' : '.'}
                </span>
              ))}
            </p>
          )}
          {lg.recommendations.length > 0 && (
            <p>
              <strong>{lg.recommendations.length}</strong> trade target{lg.recommendations.length === 1 ? '' : 's'} surfaced — see the recommendations section below.
            </p>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
        {TRACKED_POSITIONS.map((p) => <PositionDetail key={p} r={lg.needs.ratings[p]} />)}
      </div>
    </article>
  )
}

function PositionDetail({ r }: { r: PositionRating }) {
  return (
    <div className="mh-box" style={{ borderLeft: `3px solid ${TIER_COLOR[r.tier]}` }}>
      <div className="mh-row-line">
        <span className="lbl" style={{ display: 'flex', gap: '.6rem', alignItems: 'baseline' }}>
          <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '1.1rem', color: 'var(--gold)' }}>{r.position}</span>
          <span style={{ fontSize: '.55rem', letterSpacing: '.2em', textTransform: 'uppercase', color: TIER_COLOR[r.tier] }}>
            {TIER_LABEL[r.tier]}
          </span>
        </span>
        <span className="val" style={{ color: TIER_COLOR[r.tier] }}>{fmtPct(r.diffPct)}</span>
      </div>
      <div className="mh-row-line">
        <span className="lbl">Starter value</span>
        <span className="val">{Math.round(r.starterValue).toLocaleString()} <span style={{ color: 'var(--cream-mute)', fontWeight: 400 }}>vs {Math.round(r.leagueMedian).toLocaleString()} med.</span></span>
      </div>
      {r.topPlayers.slice(0, 3).map((p) => (
        <div key={p.playerId} className="mh-row-line">
          <span className="lbl" style={{ color: 'var(--cream)', fontFamily: 'var(--serif)', fontSize: '.9rem' }}>{p.name} <span style={{ color: 'var(--cream-mute)', fontSize: '.55rem', letterSpacing: '.15em' }}>{p.team ?? '—'}</span></span>
          <span className="val">{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

function TopRecommendations({ report, slug }: { report: ScoutReport; slug: string }) {
  const all: TradeRecommendation[] = report.leagues.flatMap((lg) => lg.recommendations)
  all.sort((a, b) => Math.abs(a.valueDeltaPct) - Math.abs(b.valueDeltaPct))
  const top = all.slice(0, 6)
  if (top.length === 0) {
    return (
      <section>
        <div className="mh-shead"><h3 className="mh-shead-title">Trade <em>Targets</em></h3></div>
        <EmptyState>
          No clear trade targets surfaced. Either your rosters are well-balanced, or the league&apos;s tier spreads are too tight for a confident match.
        </EmptyState>
      </section>
    )
  }
  return (
    <section>
      <div className="mh-shead">
        <h3 className="mh-shead-title">Trade <em>Targets</em></h3>
        <span className="mh-shead-meta">{top.length} highest-confidence swap{top.length === 1 ? '' : 's'} · take to the Trade Desk</span>
      </div>
      <div className="mh-row mh-row-2">
        {top.map((rec, i) => <RecommendationCard key={`${rec.archiveLeagueId}-${i}`} r={rec} slug={slug} />)}
      </div>
    </section>
  )
}

function RecommendationCard({ r, slug }: { r: TradeRecommendation; slug: string }) {
  const fairKind = Math.abs(r.valueDeltaPct) <= 0.05 ? 'fair' : r.valueDelta > 0 ? 'you' : 'them'
  const bandColor = fairKind === 'you' ? 'var(--gold)' : fairKind === 'them' ? 'var(--rust)' : 'var(--steel)'
  return (
    <article className="mh-story" style={{ borderTop: '1px dotted var(--ink-line)', paddingTop: '1.25rem' }}>
      <div className="mh-story-kicker">{r.leagueName} · vs {r.counterpartyTeamName}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '.75rem', alignItems: 'center', margin: '.5rem 0 .85rem' }}>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '.52rem', letterSpacing: '.25em', textTransform: 'uppercase', color: 'var(--rust)' }}>Send · from {r.givePosition} {TIER_LABEL[r.giveTier]}</div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem', color: 'var(--cream)', marginTop: '.2rem' }}>{r.give.name}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', letterSpacing: '.12em', color: 'var(--cream-mute)' }}>{r.give.position} · {r.give.team ?? '—'} · {r.give.value.toLocaleString()}</div>
        </div>
        <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '1.8rem', color: bandColor }}>↔</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '.52rem', letterSpacing: '.25em', textTransform: 'uppercase', color: 'var(--gold)' }}>Get · for your {r.getPosition} need</div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem', color: 'var(--cream)', marginTop: '.2rem' }}>{r.get.name}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', letterSpacing: '.12em', color: 'var(--cream-mute)' }}>{r.get.position} · {r.get.team ?? '—'} · {r.get.value.toLocaleString()}</div>
        </div>
      </div>
      <div className="mh-row-line"><span className="lbl">Value delta</span><span className="val" style={{ color: bandColor }}>{r.valueDelta > 0 ? '+' : ''}{Math.round(r.valueDelta).toLocaleString()} ({fmtPct(r.valueDeltaPct)})</span></div>
      <div className="mh-row-line"><span className="lbl">Their position</span><span className="val">{TIER_LABEL[r.getTier]} at {r.getPosition}</span></div>
      <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '.95rem', color: 'var(--cream-soft)', lineHeight: 1.55, marginTop: '.75rem' }}>
        {r.rationale}
      </p>
      <div className="mh-story-byline">
        <span>Counterparty: <strong>{r.counterpartyTeamName}</strong></span>
        <Link href={`/manager/${slug}/trade-builder`} style={{ color: 'var(--gold)', textDecoration: 'none' }}>Open in builder →</Link>
      </div>
    </article>
  )
}

function pickWorstSpot(report: ScoutReport): { leagueName: string; position: TrackedPosition; rating: PositionRating } | null {
  let worst: { leagueName: string; position: TrackedPosition; rating: PositionRating } | null = null
  for (const lg of report.leagues) {
    for (const pos of TRACKED_POSITIONS) {
      const r = lg.needs.ratings[pos]
      if (r.tier !== 'thin' && r.tier !== 'critical') continue
      if (!worst || r.diffPct < worst.rating.diffPct) {
        worst = { leagueName: lg.builderLeague.leagueName, position: pos, rating: r }
      }
    }
  }
  return worst
}

function pickBestSpot(report: ScoutReport): { leagueName: string; position: TrackedPosition; rating: PositionRating } | null {
  let best: { leagueName: string; position: TrackedPosition; rating: PositionRating } | null = null
  for (const lg of report.leagues) {
    for (const pos of TRACKED_POSITIONS) {
      const r = lg.needs.ratings[pos]
      if (r.tier !== 'strong' && r.tier !== 'elite') continue
      if (!best || r.diffPct > best.rating.diffPct) {
        best = { leagueName: lg.builderLeague.leagueName, position: pos, rating: r }
      }
    }
  }
  return best
}

function fmtPct(n: number): string {
  const pct = n * 100
  if (Math.abs(pct) < 0.5) return '0%'
  return `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`
}

function tierBadge(tier: PositionTier): string {
  switch (tier) {
    case 'elite':    return '★★★'
    case 'strong':   return '★★'
    case 'average':  return '★'
    case 'thin':     return '▽'
    case 'critical': return '▼'
  }
}
