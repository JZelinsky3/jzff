import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCareerChronicle, type CareerChronicle } from '@/lib/manager/chronicle'
import { ChronicleShell, EmptyState } from '../_shell'

export const dynamic = 'force-dynamic'

export default async function LedgerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const chronicle = await loadCareerChronicle(slug, user.id)
  if (!chronicle) notFound()

  const t = chronicle.totals
  const decided = t.wins + t.losses
  const games = decided + t.ties
  const avgPpg = games > 0 ? t.pointsFor / games : null
  const ptsDiff = t.pointsFor - t.pointsAgainst

  const deck = chronicle.weeklyHighs.length === 0
    ? 'The book of extremes is empty.'
    : `${(t.pointsFor + t.playoffPointsFor).toFixed(0)} career points · ${chronicle.weeklyHighs.length} weekly highs on file.`

  return (
    <ChronicleShell chronicle={chronicle} active="ledger" deck={deck}>
      <LedgerHero c={chronicle} avgPpg={avgPpg} ptsDiff={ptsDiff} />
      <ExtremesGrid c={chronicle} />
      <StreakNotebook c={chronicle} />
      <YearByYear c={chronicle} />
    </ChronicleShell>
  )
}

function LedgerHero({ c, avgPpg, ptsDiff }: { c: CareerChronicle; avgPpg: number | null; ptsDiff: number }) {
  const t = c.totals
  return (
    <section className="mh-row mh-row-2">
      <article className="mh-story" style={{ borderTop: 'none', paddingTop: 0 }}>
        <div className="mh-story-kicker">Lead Story · The Numbers</div>
        <h3 className="mh-story-head">
          <em>{(t.pointsFor + t.playoffPointsFor).toFixed(0)}</em> career points, give or take.
        </h3>
        <p className="mh-story-dek">A career, told in totals — and in the weeks that stand out from the rest.</p>
        <div className="mh-story-body">
          <p>
            <span className="dropcap">{(avgPpg ?? 0).toFixed(0)[0] || 'O'}</span>
            ver <strong>{t.seasonsPlayed}</strong> season{t.seasonsPlayed === 1 ? '' : 's'} and{' '}
            <strong>{(t.wins + t.losses + t.ties).toFixed(0)}</strong> decided regular-season games,
            the average has been <em>{avgPpg != null ? avgPpg.toFixed(1) : '—'}</em> points per game.
            {' '}{ptsDiff !== 0 && (
              <>The differential is <strong>{ptsDiff > 0 ? '+' : ''}{ptsDiff.toFixed(0)}</strong> — {ptsDiff > 0 ? 'a scoring surplus' : 'a scoring deficit'} on the books.</>
            )}
          </p>
          {t.playoffWins + t.playoffLosses > 0 && (
            <p>
              In the playoff bracket the page reads <strong>{t.playoffWins}-{t.playoffLosses}</strong>,
              with <em>{t.playoffPointsFor.toFixed(0)}</em> for and <em>{t.playoffPointsAgainst.toFixed(0)}</em> against.
              That&apos;s the room where careers are written — keep the gold in mind.
            </p>
          )}
        </div>
      </article>
      <div className="mh-box steel">
        <div className="mh-box-mast">The Big Board</div>
        <div className="mh-row-line"><span className="lbl">Seasons</span><span className="val cream">{t.seasonsPlayed}</span></div>
        <div className="mh-row-line"><span className="lbl">Reg record</span><span className="val">{t.wins}-{t.losses}{t.ties ? `-${t.ties}` : ''}</span></div>
        <div className="mh-row-line"><span className="lbl">Reg PF</span><span className="val cream">{t.pointsFor.toFixed(0)}</span></div>
        <div className="mh-row-line"><span className="lbl">Reg PA</span><span className="val cream">{t.pointsAgainst.toFixed(0)}</span></div>
        <div className="mh-row-line"><span className="lbl">Playoff record</span><span className="val">{t.playoffWins}-{t.playoffLosses}</span></div>
        <div className="mh-row-line"><span className="lbl">Playoff PF</span><span className="val cream">{t.playoffPointsFor.toFixed(0)}</span></div>
        <div className="mh-row-line"><span className="lbl">Avg PPG</span><span className="val">{avgPpg != null ? avgPpg.toFixed(1) : '—'}</span></div>
        <div className="mh-row-line"><span className="lbl">Bracket trips</span><span className="val cream">{t.playoffAppearances}</span></div>
      </div>
    </section>
  )
}

function ExtremesGrid({ c }: { c: CareerChronicle }) {
  const highs = c.weeklyHighs
  const lows = c.weeklyLows
  const bestWins = c.bestWins
  const worstLosses = c.worstLosses
  if (highs.length === 0 && lows.length === 0 && bestWins.length === 0 && worstLosses.length === 0) {
    return <EmptyState>No extremes on file yet — sync some leagues.</EmptyState>
  }
  return (
    <section className="mh-row mh-row-2">
      <div>
        <div className="mh-shead"><h3 className="mh-shead-title">Weekly <em>Highs</em></h3><span className="mh-shead-meta">{highs.length}</span></div>
        <div className="mh-box">
          {highs.map((h, i) => (
            <div key={`${h.leagueSlug}-${h.year}-${h.week}-${i}`} className="mh-row-line">
              <span className="lbl">{h.year}{h.week ? ` · W${h.week}` : ''} · {h.leagueName}</span>
              <span className="val">{h.score.toFixed(1)}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '1.5rem' }}>
          <div className="mh-shead"><h3 className="mh-shead-title">Biggest <em>Wins</em></h3><span className="mh-shead-meta">{bestWins.length}</span></div>
          <div className="mh-box">
            {bestWins.map((w, i) => (
              <div key={`${w.leagueName}-${w.year}-${w.week}-${i}`} className="mh-row-line">
                <span className="lbl">{w.year} W{w.week} vs {w.opponent}</span>
                <span className="val">+{w.margin.toFixed(1)}</span>
              </div>
            ))}
            {bestWins.length === 0 && <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'var(--cream-mute)', padding: '.5rem 0' }}>None on file.</div>}
          </div>
        </div>
      </div>
      <div>
        <div className="mh-shead"><h3 className="mh-shead-title">Weekly <em>Lows</em></h3><span className="mh-shead-meta">{lows.length}</span></div>
        <div className="mh-box rust">
          {lows.map((l, i) => (
            <div key={`${l.leagueSlug}-${l.year}-${i}`} className="mh-row-line">
              <span className="lbl">{l.year} · {l.leagueName}</span>
              <span className="val" style={{ color: 'var(--rust)' }}>{l.score.toFixed(1)}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '1.5rem' }}>
          <div className="mh-shead"><h3 className="mh-shead-title">Worst <em>Losses</em></h3><span className="mh-shead-meta">{worstLosses.length}</span></div>
          <div className="mh-box rust">
            {worstLosses.map((w, i) => (
              <div key={`${w.leagueName}-${w.year}-${w.week}-${i}`} className="mh-row-line">
                <span className="lbl">{w.year} W{w.week} vs {w.opponent}</span>
                <span className="val" style={{ color: 'var(--rust)' }}>{w.margin.toFixed(1)}</span>
              </div>
            ))}
            {worstLosses.length === 0 && <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'var(--cream-mute)', padding: '.5rem 0' }}>None on file.</div>}
          </div>
        </div>
      </div>
    </section>
  )
}

function StreakNotebook({ c }: { c: CareerChronicle }) {
  if (c.streaks.length === 0) return null
  const longestWins = c.streaks.filter((s) => s.kind === 'win').slice(0, 4)
  const longestLosses = c.streaks.filter((s) => s.kind === 'loss').slice(0, 4)
  return (
    <section>
      <div className="mh-shead"><h3 className="mh-shead-title">The <em>Streak</em> Notebook</h3><span className="mh-shead-meta">Longest stretches by league</span></div>
      <div className="mh-row mh-row-2">
        <div className="mh-box">
          <div className="mh-box-mast">Hot Hands</div>
          {longestWins.map((s, i) => (
            <div key={`w-${s.leagueSlug}-${i}`} className="mh-row-line">
              <span className="lbl">{s.leagueName} · {s.when}</span>
              <span className="val">{s.length}W</span>
            </div>
          ))}
        </div>
        <div className="mh-box rust">
          <div className="mh-box-mast">Cold Spells</div>
          {longestLosses.map((s, i) => (
            <div key={`l-${s.leagueSlug}-${i}`} className="mh-row-line">
              <span className="lbl">{s.leagueName} · {s.when}</span>
              <span className="val" style={{ color: 'var(--rust)' }}>{s.length}L</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function YearByYear({ c }: { c: CareerChronicle }) {
  if (c.seasonBriefs.length === 0) return null
  return (
    <section>
      <div className="mh-shead"><h3 className="mh-shead-title"><em>Year-by-Year</em> Ledger</h3><span className="mh-shead-meta">{c.seasonBriefs.length} season briefs</span></div>
      <div className="mh-row mh-row-3">
        {c.seasonBriefs.map((s) => (
          <div
            key={`${s.leagueSlug}-${s.year}`}
            className={`mh-year${s.champion ? ' champion' : s.runnerUp ? ' runner' : ''}`}
          >
            <div className="mh-year-yr">{s.year}{s.champion && <span className="mh-year-tag">★ CHAMP</span>}{s.runnerUp && <span className="mh-year-tag runner">2ND</span>}</div>
            <div className="mh-year-league">{s.leagueName}{s.teamName ? ` · ${s.teamName}` : ''}</div>
            <div className="mh-year-body">
              <span>{s.regRecord}</span>
              {s.finalRank != null && <span>Fin: <strong>{s.finalRank}</strong></span>}
              {s.avgPpg && <span>PPG <strong>{s.avgPpg.toFixed(1)}</strong></span>}
              {s.highWeekScore && <span>Hi <strong>{s.highWeekScore.toFixed(0)}</strong></span>}
              {s.lowWeekScore && <span>Lo <strong>{s.lowWeekScore.toFixed(0)}</strong></span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
