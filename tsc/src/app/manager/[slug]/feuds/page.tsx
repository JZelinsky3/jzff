import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCareerChronicle, type CareerChronicle } from '@/lib/manager/chronicle'
import type { CareerRivalry } from '@/lib/manager/career'
import { ChronicleShell, EmptyState } from '../_shell'

export const dynamic = 'force-dynamic'

export default async function FeudsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const chronicle = await loadCareerChronicle(slug, user.id)
  if (!chronicle) notFound()

  const rivals = chronicle.topRivalries
  const archRival = rivals[0]
  const playoffRivals = rivals.filter((r) => r.playoffGames > 0).slice(0, 3)
  const tightFeuds = [...rivals].filter((r) => r.games >= 3).sort((a, b) => {
    const aDiff = Math.abs(a.wins - a.losses)
    const bDiff = Math.abs(b.wins - b.losses)
    return aDiff - bDiff
  }).slice(0, 4)

  const deck = rivals.length === 0
    ? 'No opponents on file yet.'
    : `${rivals.length} most-played rival${rivals.length === 1 ? '' : 's'} on record · ${chronicle.h2hPerLeague.length} per-league head-to-head ledgers.`

  return (
    <ChronicleShell chronicle={chronicle} active="feuds" deck={deck}>
      {archRival ? <ArchRivalLead r={archRival} c={chronicle} /> : <NoFeuds />}
      {playoffRivals.length > 0 && <PlayoffFeuds rivals={playoffRivals} />}
      {tightFeuds.length > 0 && <TightFeuds rivals={tightFeuds} />}
      <SocietyPage rivals={rivals} />
    </ChronicleShell>
  )
}

function NoFeuds() {
  return (
    <section>
      <EmptyState>No head-to-head data yet. The chronicler is waiting for the first opponents.</EmptyState>
    </section>
  )
}

function ArchRivalLead({ r, c }: { r: CareerRivalry; c: CareerChronicle }) {
  const decided = r.wins + r.losses
  const lead = r.wins > r.losses ? 'lead' : r.wins < r.losses ? 'trail' : 'are level with'
  const margin = Math.abs(r.wins - r.losses)
  const avg = decided > 0 ? r.pointsFor / r.games : 0
  const avgAg = decided > 0 ? r.pointsAgainst / r.games : 0
  return (
    <section className="mh-row mh-row-2">
      <article className="mh-story" style={{ borderTop: 'none', paddingTop: 0 }}>
        <div className="mh-story-kicker">Lead Story · Arch-Rival</div>
        <h3 className="mh-story-head">
          The {r.games} fights with <em>{r.opponent}</em>.
        </h3>
        <p className="mh-story-dek">
          {c.chronicle.displayName} {lead} {r.opponent} {margin > 0 ? `by ${margin} game${margin === 1 ? '' : 's'}` : 'overall'}, across {r.leagues.length} league{r.leagues.length === 1 ? '' : 's'}.
        </p>
        <div className="mh-story-body">
          <p>
            <span className="dropcap">{r.opponent[0]}</span>
            cross every meeting on file, <strong>{r.opponent}</strong> sits at <em>{r.wins}-{r.losses}{r.ties ? `-${r.ties}` : ''}</em> against {c.chronicle.displayName}.{' '}
            {r.playoffGames > 0 ? (
              <>The bracket has put them across the desk <strong>{r.playoffGames}</strong> time{r.playoffGames === 1 ? '' : 's'} — the most loaded meetings on the calendar.</>
            ) : (
              <>They have yet to meet in the playoff bracket — only regular-season Sundays.</>
            )}
          </p>
          <p>
            Average scoreline: <strong>{avg.toFixed(1)}</strong> for, <strong>{avgAg.toFixed(1)}</strong> against.
            Total points exchanged: <em>{(r.pointsFor + r.pointsAgainst).toFixed(0)}</em>.
          </p>
          {r.leagues.length > 1 && (
            <p>
              The feud spans <strong>{r.leagues.length}</strong> leagues — {r.leagues.join(', ')}. That kind of cross-league hostility is rare; most rivals share one platform.
            </p>
          )}
        </div>
      </article>
      <div className="mh-box rust">
        <div className="mh-box-mast">The Tale of the Tape</div>
        <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '2.4rem', color: 'var(--cream)', lineHeight: 1, marginBottom: '.4rem' }}>
          {r.wins}<span style={{ color: 'var(--rust)' }}>–</span>{r.losses}{r.ties ? `–${r.ties}` : ''}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--cream-mute)', marginBottom: '1rem' }}>
          vs {r.opponent}
        </div>
        <div className="mh-row-line"><span className="lbl">Games</span><span className="val cream">{r.games}</span></div>
        <div className="mh-row-line"><span className="lbl">Playoff</span><span className="val">{r.playoffGames}</span></div>
        <div className="mh-row-line"><span className="lbl">Points for</span><span className="val">{r.pointsFor.toFixed(0)}</span></div>
        <div className="mh-row-line"><span className="lbl">Points against</span><span className="val">{r.pointsAgainst.toFixed(0)}</span></div>
        <div className="mh-row-line"><span className="lbl">Leagues</span><span className="val cream">{r.leagues.length}</span></div>
      </div>
    </section>
  )
}

function PlayoffFeuds({ rivals }: { rivals: CareerRivalry[] }) {
  return (
    <section>
      <div className="mh-shead"><h3 className="mh-shead-title"><em>Hostile</em> Brackets</h3><span className="mh-shead-meta">Rivals you&apos;ve met in the playoffs</span></div>
      <div className="mh-row mh-row-3">
        {rivals.map((r) => (
          <article key={r.opponent} className="mh-story" style={{ borderTop: '1px dotted var(--ink-line)', paddingTop: '1.1rem' }}>
            <div className="mh-story-kicker rust">{r.playoffGames} playoff meeting{r.playoffGames === 1 ? '' : 's'}</div>
            <h4 className="mh-story-head" style={{ fontSize: '1.4rem' }}>vs <em>{r.opponent}</em></h4>
            <div className="mh-row-line"><span className="lbl">Career H2H</span><span className="val">{r.wins}-{r.losses}{r.ties ? `-${r.ties}` : ''}</span></div>
            <div className="mh-row-line"><span className="lbl">Bracket games</span><span className="val cream">{r.playoffGames}</span></div>
            <div className="mh-row-line"><span className="lbl">Avg PF</span><span className="val">{(r.pointsFor / r.games).toFixed(1)}</span></div>
            <div className="mh-row-line"><span className="lbl">Leagues</span><span className="val cream">{r.leagues.length === 1 ? r.leagues[0] : `${r.leagues.length} leagues`}</span></div>
          </article>
        ))}
      </div>
    </section>
  )
}

function TightFeuds({ rivals }: { rivals: CareerRivalry[] }) {
  return (
    <section>
      <div className="mh-shead"><h3 className="mh-shead-title">The <em>Closest</em> Feuds</h3><span className="mh-shead-meta">Rivals you can&apos;t shake — record within ±1</span></div>
      <div className="mh-row mh-row-4">
        {rivals.map((r) => {
          const totalDecided = r.wins + r.losses
          const winPct = totalDecided > 0 ? (r.wins / totalDecided) * 100 : 50
          return (
            <article key={r.opponent} className="mh-stat" style={{ textAlign: 'left' }}>
              <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '1.3rem', color: 'var(--cream)' }}>{r.opponent}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '.55rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--cream-mute)', margin: '.35rem 0 .65rem' }}>
                {r.games} games · {r.leagues.length} {r.leagues.length === 1 ? 'league' : 'leagues'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `${winPct}% ${100 - winPct}%`, height: '8px', border: '1px solid var(--ink-line)' }}>
                <div style={{ background: 'var(--gold)' }} />
                <div style={{ background: 'var(--steel)' }} />
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', letterSpacing: '.1em', color: 'var(--cream)', marginTop: '.5rem', display: 'flex', justifyContent: 'space-between' }}>
                <span>{r.wins}W</span>
                <span>{r.losses}L{r.ties ? ` · ${r.ties}T` : ''}</span>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function SocietyPage({ rivals }: { rivals: CareerRivalry[] }) {
  if (rivals.length === 0) return null
  return (
    <section>
      <div className="mh-shead"><h3 className="mh-shead-title">The <em>Society</em> Pages</h3><span className="mh-shead-meta">Top {rivals.length} most-played opponents</span></div>
      <div className="mh-box">
        <div className="mh-box-mast">Career Head-to-Head</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: '.72rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--gold-deep)', color: 'var(--gold)', textAlign: 'left' }}>
              <th style={{ padding: '.5rem .35rem', letterSpacing: '.15em', fontSize: '.55rem' }}>OPPONENT</th>
              <th style={{ padding: '.5rem .35rem', letterSpacing: '.15em', fontSize: '.55rem' }}>G</th>
              <th style={{ padding: '.5rem .35rem', letterSpacing: '.15em', fontSize: '.55rem' }}>RECORD</th>
              <th style={{ padding: '.5rem .35rem', letterSpacing: '.15em', fontSize: '.55rem' }}>PF</th>
              <th style={{ padding: '.5rem .35rem', letterSpacing: '.15em', fontSize: '.55rem' }}>PA</th>
              <th style={{ padding: '.5rem .35rem', letterSpacing: '.15em', fontSize: '.55rem' }}>BRACKET</th>
              <th style={{ padding: '.5rem .35rem', letterSpacing: '.15em', fontSize: '.55rem' }}>LEAGUES</th>
            </tr>
          </thead>
          <tbody>
            {rivals.map((r) => (
              <tr key={r.opponent} style={{ borderBottom: '1px dotted var(--ink-line-soft)' }}>
                <td style={{ padding: '.5rem .35rem', color: 'var(--cream)', fontFamily: 'var(--serif)', fontSize: '.95rem' }}>{r.opponent}</td>
                <td style={{ padding: '.5rem .35rem', color: 'var(--cream-soft)' }}>{r.games}</td>
                <td style={{ padding: '.5rem .35rem', color: 'var(--gold)', fontWeight: 700 }}>{r.wins}-{r.losses}{r.ties ? `-${r.ties}` : ''}</td>
                <td style={{ padding: '.5rem .35rem', color: 'var(--cream-soft)' }}>{r.pointsFor.toFixed(0)}</td>
                <td style={{ padding: '.5rem .35rem', color: 'var(--cream-soft)' }}>{r.pointsAgainst.toFixed(0)}</td>
                <td style={{ padding: '.5rem .35rem', color: r.playoffGames > 0 ? 'var(--rust)' : 'var(--cream-mute)' }}>{r.playoffGames}</td>
                <td style={{ padding: '.5rem .35rem', color: 'var(--cream-mute)', fontSize: '.62rem' }}>{r.leagues.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
