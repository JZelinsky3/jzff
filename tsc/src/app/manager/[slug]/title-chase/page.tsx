import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCareerChronicle, type CareerChronicle, type ChronicleTitleRun } from '@/lib/manager/chronicle'
import { ChronicleShell, EmptyState } from '../_shell'

export const dynamic = 'force-dynamic'

export default async function TitleChasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const chronicle = await loadCareerChronicle(slug, user.id)
  if (!chronicle) notFound()

  const champRuns = chronicle.titleRuns.filter((r) => r.finish === 1)
  const runnerRuns = chronicle.titleRuns.filter((r) => r.finish === 2)
  const t = chronicle.totals
  const finalsCount = t.championships + t.runnerUps
  const deck = finalsCount === 0
    ? 'No finals reached — yet. The chase begins.'
    : finalsCount === 1
    ? 'One night in the bracket. The story of a single final.'
    : `${t.championships} ring${t.championships === 1 ? '' : 's'} · ${t.runnerUps} runner-up · ${t.playoffAppearances} brackets entered.`

  return (
    <ChronicleShell chronicle={chronicle} active="title-chase" deck={deck}>
      <ChaseStats c={chronicle} />
      <ChampionRuns runs={champRuns} />
      <RunnerUpRuns runs={runnerRuns} />
      <AlsoRans c={chronicle} />
    </ChronicleShell>
  )
}

function ChaseStats({ c }: { c: CareerChronicle }) {
  const t = c.totals
  const finalsCount = t.championships + t.runnerUps
  const playoffPct = (t.playoffWins + t.playoffLosses) > 0
    ? `${((t.playoffWins / (t.playoffWins + t.playoffLosses)) * 100).toFixed(0)}%`
    : '—'
  return (
    <section className="mh-row mh-row-4">
      <div className="mh-stat">
        <div className="mh-stat-value"><em>{t.championships}</em></div>
        <div className="mh-stat-label">Rings</div>
        <div className="mh-stat-sub">{t.championships === 0 ? 'Quest continues' : 'Engraved'}</div>
      </div>
      <div className="mh-stat">
        <div className="mh-stat-value">{finalsCount}</div>
        <div className="mh-stat-label">Finals reached</div>
        <div className="mh-stat-sub">{t.runnerUps} runner-up{t.runnerUps === 1 ? '' : 's'}</div>
      </div>
      <div className="mh-stat">
        <div className="mh-stat-value">{t.playoffAppearances}</div>
        <div className="mh-stat-label">Brackets entered</div>
        <div className="mh-stat-sub">{t.seasonsPlayed > 0 ? `${((t.playoffAppearances / t.seasonsPlayed) * 100).toFixed(0)}% of seasons` : '—'}</div>
      </div>
      <div className="mh-stat">
        <div className="mh-stat-value">{t.playoffWins}-{t.playoffLosses}</div>
        <div className="mh-stat-label">Bracket record</div>
        <div className="mh-stat-sub">{playoffPct} win rate</div>
      </div>
    </section>
  )
}

function ChampionRuns({ runs }: { runs: ChronicleTitleRun[] }) {
  if (runs.length === 0) {
    return (
      <section>
        <div className="mh-shead"><h3 className="mh-shead-title">The <em>Rings</em></h3></div>
        <EmptyState>The trophy case is empty. The chronicle is waiting for chapter one.</EmptyState>
      </section>
    )
  }
  return (
    <section>
      <div className="mh-shead">
        <h3 className="mh-shead-title">The <em>Rings</em></h3>
        <span className="mh-shead-meta">{runs.length} championship{runs.length === 1 ? '' : 's'}</span>
      </div>
      <div className="mh-broadsheet">
        {runs.map((r, i) => <ChampionStory key={`${r.leagueSlug}-${r.year}`} r={r} ordinal={i + 1} />)}
      </div>
    </section>
  )
}

function ChampionStory({ r, ordinal }: { r: ChronicleTitleRun; ordinal: number }) {
  const flip = ordinal % 2 === 0
  return (
    <article className="mh-row" style={{ gridTemplateColumns: flip ? 'minmax(0, 1fr) minmax(0, 1.5fr)' : 'minmax(0, 1.5fr) minmax(0, 1fr)', borderTop: '1px dotted var(--ink-line)', paddingTop: '1.5rem' }}>
      {!flip ? <ChampionLead r={r} ordinal={ordinal} /> : <ChampionSidebar r={r} />}
      {!flip ? <ChampionSidebar r={r} /> : <ChampionLead r={r} ordinal={ordinal} />}
    </article>
  )
}

function ChampionLead({ r, ordinal }: { r: ChronicleTitleRun; ordinal: number }) {
  const headline = r.titleOpponent
    ? `The ${r.year} final: ${r.titleOpponent} fell ${r.titleScoreFor?.toFixed(1) ?? '—'}–${r.titleScoreAgainst?.toFixed(1) ?? '—'}.`
    : `${r.year} — the chase ended in coronation.`
  return (
    <div className="mh-story" style={{ borderTop: 'none', paddingTop: 0 }}>
      <div className="mh-story-kicker">★ Title No. {ordinal} · {r.leagueName}</div>
      <h3 className="mh-story-head"><em>{r.year}</em>: {r.leagueName}</h3>
      <p className="mh-story-dek">{headline}</p>
      <div className="mh-story-body">
        <p>
          <span className="dropcap">{r.year.toString()[0]}</span>
          The regular season closed at <strong>{r.regRecord}</strong>, then the bracket finished{' '}
          <strong>{r.playoffRecord}</strong>. {r.totalPf > 0 && <>The team posted <em>{r.totalPf.toFixed(0)}</em> total points across the year.</>}
        </p>
        {r.highWeekScore && (
          <p>
            High-water mark: <strong>{r.highWeekScore.toFixed(1)}</strong> {r.highWeek ? `in Week ${r.highWeek}` : 'on the year'} — the kind of statement
            scoreline that announces a title contender.
          </p>
        )}
        {r.titleOpponent && r.titleScoreFor != null && r.titleScoreAgainst != null && (
          <p>
            In the final, <strong>{r.titleOpponent}</strong> was overcome by{' '}
            {Math.abs(r.titleScoreFor - r.titleScoreAgainst).toFixed(1)} points. A clean handoff into the trophy case.
          </p>
        )}
      </div>
      <div className="mh-story-byline">
        <span>{r.leagueName} · Vol. {r.year}</span>
        <span>★ <strong>Champion</strong></span>
      </div>
    </div>
  )
}

function ChampionSidebar({ r }: { r: ChronicleTitleRun }) {
  return (
    <div className="mh-box">
      <div className="mh-box-mast">{r.year} · Box Score</div>
      <div className="mh-row-line"><span className="lbl">League</span><span className="val cream">{r.leagueName}</span></div>
      <div className="mh-row-line"><span className="lbl">Regular season</span><span className="val">{r.regRecord}</span></div>
      <div className="mh-row-line"><span className="lbl">Bracket</span><span className="val">{r.playoffRecord}</span></div>
      {r.totalPf > 0 && <div className="mh-row-line"><span className="lbl">Total PF</span><span className="val cream">{r.totalPf.toFixed(0)}</span></div>}
      {r.highWeekScore && <div className="mh-row-line"><span className="lbl">High week</span><span className="val">{r.highWeekScore.toFixed(1)}{r.highWeek ? ` · W${r.highWeek}` : ''}</span></div>}
      {r.titleOpponent && (
        <div className="mh-row-line"><span className="lbl">Title game</span><span className="val cream">vs {r.titleOpponent}</span></div>
      )}
      {r.titleScoreFor != null && r.titleScoreAgainst != null && (
        <div className="mh-row-line"><span className="lbl">Final</span><span className="val">{r.titleScoreFor.toFixed(1)}–{r.titleScoreAgainst.toFixed(1)}</span></div>
      )}
    </div>
  )
}

function RunnerUpRuns({ runs }: { runs: ChronicleTitleRun[] }) {
  if (runs.length === 0) return null
  return (
    <section>
      <div className="mh-shead">
        <h3 className="mh-shead-title">The <em>Runners-Up</em></h3>
        <span className="mh-shead-meta">{runs.length} silver finish{runs.length === 1 ? '' : 'es'}</span>
      </div>
      <div className="mh-row mh-row-2">
        {runs.map((r) => (
          <article key={`${r.leagueSlug}-${r.year}`} className="mh-story" style={{ borderTop: '1px dotted var(--ink-line)', paddingTop: '1.25rem' }}>
            <div className="mh-story-kicker rust">Runner-Up · {r.leagueName}</div>
            <h4 className="mh-story-head" style={{ fontSize: '1.4rem' }}><em>{r.year}</em> · One game short</h4>
            <div className="mh-story-body">
              <p>
                Regular-season finish <strong>{r.regRecord}</strong>, bracket finish <strong>{r.playoffRecord}</strong>.
                {r.highWeekScore ? <> Peak output: <strong>{r.highWeekScore.toFixed(1)}</strong>{r.highWeek ? ` in Week ${r.highWeek}` : ''}.</> : null}
                {' '}A finalist plate goes on the shelf, the headline goes elsewhere.
              </p>
            </div>
            <div className="mh-story-byline">
              <span>{r.leagueName}</span>
              <span style={{ color: 'var(--rust)' }}>★ <strong>2nd place</strong></span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function AlsoRans({ c }: { c: CareerChronicle }) {
  // Top-4 finishes that weren't title runs — "you were close"
  const top4 = c.seasonBriefs
    .filter((s) => s.finalRank != null && s.finalRank > 2 && s.finalRank <= 4)
    .slice(0, 8)
  if (top4.length === 0) return null
  return (
    <section>
      <div className="mh-shead"><h3 className="mh-shead-title">The <em>Final Four</em> Notebook</h3><span className="mh-shead-meta">Seasons that ended on the doorstep</span></div>
      <div className="mh-row mh-row-3">
        {top4.map((s) => (
          <div key={`${s.leagueSlug}-${s.year}`} className="mh-year">
            <div className="mh-year-yr">{s.year}</div>
            <div className="mh-year-league">{s.leagueName}</div>
            <div className="mh-year-body">
              <span>{s.regRecord}</span>
              <span>Finish: <strong>{s.finalRank}</strong></span>
              {s.highWeekScore && <span>Hi <strong>{s.highWeekScore.toFixed(0)}</strong></span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
