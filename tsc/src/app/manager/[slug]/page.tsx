import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCareerChronicle, type CareerChronicle } from '@/lib/manager/chronicle'
import { ChronicleShell, EmptyState } from './_shell'

export const dynamic = 'force-dynamic'

export default async function ManagerFrontPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const chronicle = await loadCareerChronicle(slug, user.id)
  if (!chronicle) notFound()

  return (
    <ChronicleShell chronicle={chronicle} active="front">
      <LeadStory c={chronicle} />
      <FeatureGrid c={chronicle} />
      <LeagueGallery c={chronicle} />
      {chronicle.pendingCount > 0 && <PendingNotice slug={slug} count={chronicle.pendingCount} />}
    </ChronicleShell>
  )
}

function LeadStory({ c }: { c: CareerChronicle }) {
  const t = c.totals
  const decided = t.wins + t.losses
  const winPct = decided > 0 ? `${(t.winPct * 100).toFixed(1)}%` : '—'
  const titleClause = t.championships === 0
    ? 'no rings to show for it — yet'
    : t.championships === 1
    ? 'one championship to point at'
    : `${t.championships} championships`
  const finalsClause = t.runnerUps > 0
    ? ` and ${t.runnerUps} runner-up finish${t.runnerUps === 1 ? '' : 'es'}`
    : ''
  const leagueCount = t.leagues
  const seasonsClause = t.seasonsPlayed === 1 ? 'one season' : `${t.seasonsPlayed} seasons`
  const topRival = c.topRivalries[0]
  const bestWin = c.bestWins[0]

  return (
    <section className="mh-row mh-row-2">
      <article className="mh-story" style={{ borderTop: 'none', paddingTop: 0 }}>
        <div className="mh-story-kicker">Lead Story · The State of the Career</div>
        <h2 className="mh-story-head">
          <em>{seasonsClause}</em>, {leagueCount} {leagueCount === 1 ? 'league' : 'leagues'}, {titleClause}{finalsClause}.
        </h2>
        <p className="mh-story-dek">
          A look at the {c.chronicle.displayName} chronicle — every season, threaded together.
        </p>
        <div className="mh-story-body">
          <p>
            <span className="dropcap">{c.chronicle.displayName[0]}</span>
            cross {leagueCount} fantasy {leagueCount === 1 ? 'league' : 'leagues'} the ledger reads{' '}
            <strong>{t.wins}-{t.losses}{t.ties ? `-${t.ties}` : ''}</strong> regular-season —
            a <em>{winPct}</em> clip over <strong>{seasonsClause}</strong>.{' '}
            {t.playoffAppearances > 0 ? (
              <>The playoff bracket has been reached <strong>{t.playoffAppearances}</strong> {t.playoffAppearances === 1 ? 'time' : 'times'}, producing a{' '}
              <strong>{t.playoffWins}-{t.playoffLosses}</strong> championship-bracket mark.</>
            ) : (
              <>The playoff bracket remains a road less traveled.</>
            )}
          </p>
          {t.championships > 0 && (
            <p>
              {t.championships === 1 ? 'The ring belongs to' : 'The rings belong to'}{' '}
              {c.trophyCase
                .filter((tc) => tc.kind === 'champion')
                .map((tc) => `${tc.year} ${tc.leagueName}`)
                .join(', ')}
              {t.runnerUps > 0 ? `; runner-up plates were collected ${t.runnerUps === 1 ? 'once' : `${t.runnerUps} times`}.` : '.'}
            </p>
          )}
          {topRival && (
            <p>
              The most-played opponent is <strong>{topRival.opponent}</strong> ({topRival.wins}-{topRival.losses}{topRival.ties ? `-${topRival.ties}` : ''} across <strong>{topRival.games}</strong> meetings
              {topRival.leagues.length > 1 ? `, ${topRival.leagues.length} different leagues` : ''}).
              See <Link href={`/manager/${c.chronicle.slug}/feuds`} style={{ color: 'var(--gold)' }}>The Feuds</Link> for the full society pages.
            </p>
          )}
          {bestWin && (
            <p>
              Signature win on record: a <strong>{bestWin.score.toFixed(1)}-{bestWin.oppScore.toFixed(1)}</strong> beating of {bestWin.opponent}{' '}
              in Week {bestWin.week}, {bestWin.year} ({bestWin.leagueName}). The Ledger keeps the rest.
            </p>
          )}
        </div>
        <div className="mh-story-byline">
          <span>Filed by The Editors</span>
          <span><strong>{c.chronicle.displayName}</strong> · {new Date().getFullYear()}</span>
        </div>
      </article>

      <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <TrophyCase c={c} />
        <SignatureWeek c={c} />
      </aside>
    </section>
  )
}

function TrophyCase({ c }: { c: CareerChronicle }) {
  if (c.trophyCase.length === 0) {
    return (
      <div className="mh-box">
        <div className="mh-box-mast">★ Trophy Case</div>
        <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'var(--cream-mute)', fontSize: '.95rem' }}>
          No silverware yet. The next chapter writes itself.
        </div>
      </div>
    )
  }
  return (
    <div className="mh-box">
      <div className="mh-box-mast">★ Trophy Case · {c.trophyCase.length}</div>
      {c.trophyCase.map((t, i) => (
        <div key={`${t.leagueName}-${t.year}-${i}`} className="mh-row-line">
          <span className="lbl">
            {t.year} · {t.leagueName}
            {t.kind === 'runner-up' && (
              <span style={{ fontSize: '.5rem', letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--rust)', marginLeft: '.4rem' }}>2nd</span>
            )}
          </span>
          <span className="val">{t.kind === 'champion' ? 'CHAMP' : '—'}</span>
        </div>
      ))}
    </div>
  )
}

function SignatureWeek({ c }: { c: CareerChronicle }) {
  const top = c.weeklyHighs[0]
  if (!top) return null
  return (
    <div className="mh-box steel">
      <div className="mh-box-mast">Signature Week</div>
      <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '2.4rem', color: 'var(--gold)', lineHeight: 1 }}>
        {top.score.toFixed(1)}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--cream-mute)', marginTop: '.4rem' }}>
        Week {top.week || '—'} · {top.year} · {top.leagueName}
      </div>
      <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '.92rem', color: 'var(--cream-soft)', marginTop: '.75rem', lineHeight: 1.5 }}>
        The highest scoring week on the books, across every league on file.
      </p>
    </div>
  )
}

function FeatureGrid({ c }: { c: CareerChronicle }) {
  const t = c.totals
  const totalPlayoff = t.playoffWins + t.playoffLosses
  const decided = t.wins + t.losses
  const avg = (() => {
    if (t.seasonsPlayed === 0) return null
    // Rough estimate using PF/games; we don't have total games here, so use win+loss+tie.
    const games = decided + t.ties
    return games > 0 ? t.pointsFor / games : null
  })()
  return (
    <section className="mh-row mh-row-4">
      <div className="mh-stat">
        <div className="mh-stat-value">{t.wins}<span style={{ color: 'var(--gold-deep)' }}>-</span>{t.losses}{t.ties ? `-${t.ties}` : ''}</div>
        <div className="mh-stat-label">Career Record</div>
        <div className="mh-stat-sub">{decided > 0 ? `${(t.winPct * 100).toFixed(1)}% · ${decided} decided` : 'No games'}</div>
      </div>
      <div className="mh-stat">
        <div className="mh-stat-value"><em>{t.championships}</em>{t.runnerUps > 0 && <span style={{ color: 'var(--cream-mute)', fontSize: '.55em' }}> · {t.runnerUps}</span>}</div>
        <div className="mh-stat-label">{t.championships === 1 ? 'Ring' : 'Rings'}{t.runnerUps > 0 ? ' / Runner-ups' : ''}</div>
        <div className="mh-stat-sub">{t.playoffAppearances} {t.playoffAppearances === 1 ? 'playoff trip' : 'playoff trips'}</div>
      </div>
      <div className="mh-stat">
        <div className="mh-stat-value">{avg != null ? avg.toFixed(1) : '—'}</div>
        <div className="mh-stat-label">PPG (career)</div>
        <div className="mh-stat-sub">{t.pointsFor.toFixed(0)} total PF</div>
      </div>
      <div className="mh-stat">
        <div className="mh-stat-value">{t.playoffWins}-{t.playoffLosses}</div>
        <div className="mh-stat-label">Bracket Record</div>
        <div className="mh-stat-sub">{totalPlayoff > 0 ? `${((t.playoffWins / totalPlayoff) * 100).toFixed(0)}% in chase` : 'Not yet tested'}</div>
      </div>
    </section>
  )
}

function LeagueGallery({ c }: { c: CareerChronicle }) {
  const ready = c.leagues.filter((l) => l.status === 'ready')
  if (ready.length === 0) {
    return (
      <section>
        <div className="mh-shead"><h3 className="mh-shead-title">The <em>Roster</em> of Leagues</h3></div>
        <EmptyState>No leagues synced yet. Add one to start the chronicle.</EmptyState>
      </section>
    )
  }
  return (
    <section>
      <div className="mh-shead">
        <h3 className="mh-shead-title">The <em>Roster</em> of Leagues</h3>
        <span className="mh-shead-meta">{ready.length} of {c.leagues.length} ready</span>
      </div>
      <div className="mh-row mh-row-3">
        {ready.map((lg) => {
          const decided = lg.wins + lg.losses
          const winPct = decided > 0 ? `${((lg.wins / decided) * 100).toFixed(0)}%` : '—'
          const titleLine = lg.championships > 0
            ? `${lg.championships} ring${lg.championships === 1 ? '' : 's'}${lg.titleYears.length > 0 ? ` (${lg.titleYears.join(', ')})` : ''}`
            : lg.runnerUps > 0
            ? `${lg.runnerUps} runner-up`
            : lg.bestFinish != null
            ? `Best: ${ordinal(lg.bestFinish)}`
            : 'Story being written'
          return (
            <article key={lg.leagueId} className="mh-story" style={{ borderTop: '1px dotted var(--ink-line)', paddingTop: '1.25rem' }}>
              <div className="mh-story-kicker">{lg.platform.toUpperCase()} · {lg.firstYear}–{lg.lastYear}</div>
              <h4 className="mh-story-head" style={{ fontSize: '1.4rem' }}>
                {lg.teamName ? <>{lg.teamName}</> : lg.managerName ?? c.chronicle.displayName}
              </h4>
              <div className="mh-story-dek" style={{ marginBottom: '.6rem' }}>{lg.leagueName}</div>
              <div className="mh-row-line"><span className="lbl">Record</span><span className="val cream">{lg.wins}-{lg.losses}{lg.ties ? `-${lg.ties}` : ''} · {winPct}</span></div>
              <div className="mh-row-line"><span className="lbl">Seasons</span><span className="val cream">{lg.seasonsPlayed}</span></div>
              <div className="mh-row-line"><span className="lbl">Hardware</span><span className="val">{titleLine}</span></div>
              {lg.playoffAppearances > 0 && (
                <div className="mh-row-line"><span className="lbl">Playoff trips</span><span className="val cream">{lg.playoffAppearances}</span></div>
              )}
              <div className="mh-story-byline">
                <span>{lg.leagueName}</span>
                <Link href={`/leagues/${lg.leagueSlug}/`} style={{ color: 'var(--gold)', textDecoration: 'none' }}>Almanac →</Link>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function PendingNotice({ slug, count }: { slug: string; count: number }) {
  return (
    <div className="mh-box rust">
      <div className="mh-box-mast">Editor&apos;s Note · {count} league{count === 1 ? '' : 's'} pending sync</div>
      <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '.95rem', color: 'var(--cream-soft)', lineHeight: 1.6 }}>
        We&apos;re holding stories for {count} league{count === 1 ? '' : 's'} that haven&apos;t been synced through Dynasty Codex yet. Once their archives publish,
        their chapters fold into this chronicle automatically. {' '}
        <Link href={`/manager/${slug}/settings`} style={{ color: 'var(--gold)' }}>Review setup →</Link>
      </p>
    </div>
  )
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}
