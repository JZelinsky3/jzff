import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCareerChronicle, type CareerChronicle, type ChroniclePick } from '@/lib/manager/chronicle'
import { ChronicleShell, EmptyState } from '../_shell'

export const dynamic = 'force-dynamic'

export default async function DraftRoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const chronicle = await loadCareerChronicle(slug, user.id)
  if (!chronicle) notFound()

  const picks = chronicle.picks
  const totalPicks = picks.length
  const r1Picks = picks.filter((p) => p.round === 1)
  const lateSteals = picks
    .filter((p) => p.round >= 5 && p.finalRank != null && p.finalRank <= 3)
    .slice(0, 6)
  const r1Busts = r1Picks
    .filter((p) => p.finalRank != null && p.teamSize > 0 && p.finalRank > Math.ceil(p.teamSize / 2))
    .slice(0, 6)
  const draftsByYearLeague = groupPicks(picks)

  const deck = totalPicks === 0
    ? 'No drafts on file yet.'
    : `${totalPicks} picks across ${draftsByYearLeague.length} draft${draftsByYearLeague.length === 1 ? '' : 's'}.`

  return (
    <ChronicleShell chronicle={chronicle} active="draft-room" deck={deck}>
      <DraftStats c={chronicle} picks={picks} drafts={draftsByYearLeague.length} />
      <LeadDraftStory r1={r1Picks} lateSteals={lateSteals} r1Busts={r1Busts} />
      {lateSteals.length > 0 && <LateSteals picks={lateSteals} />}
      {r1Busts.length > 0 && <R1Busts picks={r1Busts} />}
      <DraftLedger drafts={draftsByYearLeague} />
    </ChronicleShell>
  )
}

function DraftStats({ c, picks, drafts }: { c: CareerChronicle; picks: ChroniclePick[]; drafts: number }) {
  void c
  const r1 = picks.filter((p) => p.round === 1).length
  const positions = picks.reduce((m, p) => {
    if (!p.position) return m
    m.set(p.position, (m.get(p.position) ?? 0) + 1)
    return m
  }, new Map<string, number>())
  const topPosition = [...positions.entries()].sort((a, b) => b[1] - a[1])[0]
  return (
    <section className="mh-row mh-row-4">
      <div className="mh-stat">
        <div className="mh-stat-value">{picks.length}</div>
        <div className="mh-stat-label">Career picks</div>
        <div className="mh-stat-sub">{drafts} draft{drafts === 1 ? '' : 's'} on file</div>
      </div>
      <div className="mh-stat">
        <div className="mh-stat-value">{r1}</div>
        <div className="mh-stat-label">Round-one calls</div>
        <div className="mh-stat-sub">The ones that defined years</div>
      </div>
      <div className="mh-stat">
        <div className="mh-stat-value">{topPosition?.[0] ?? '—'}</div>
        <div className="mh-stat-label">Most-drafted pos.</div>
        <div className="mh-stat-sub">{topPosition ? `${topPosition[1]} picks` : '—'}</div>
      </div>
      <div className="mh-stat">
        <div className="mh-stat-value">{picks.filter((p) => p.round >= 5).length}</div>
        <div className="mh-stat-label">Mid/late picks</div>
        <div className="mh-stat-sub">Round 5+</div>
      </div>
    </section>
  )
}

function LeadDraftStory({ r1, lateSteals, r1Busts }: { r1: ChroniclePick[]; lateSteals: ChroniclePick[]; r1Busts: ChroniclePick[] }) {
  if (r1.length === 0 && lateSteals.length === 0) {
    return (
      <section className="mh-row mh-row-2">
        <div className="mh-story" style={{ borderTop: 'none', paddingTop: 0 }}>
          <div className="mh-story-kicker">Lead · The Draft Room</div>
          <h3 className="mh-story-head">The draft board is <em>still blank</em>.</h3>
          <div className="mh-story-body"><p>Sync more leagues with draft data to unlock this chapter.</p></div>
        </div>
      </section>
    )
  }
  const headlinePick = r1[0]
  const bigSteal = lateSteals[0]
  return (
    <section className="mh-row mh-row-2">
      <article className="mh-story" style={{ borderTop: 'none', paddingTop: 0 }}>
        <div className="mh-story-kicker">Lead · The Draft Room</div>
        <h3 className="mh-story-head">
          {r1.length} <em>round-one</em> swings, {lateSteals.length} mid-round <em>steals</em>{r1Busts.length > 0 ? `, ${r1Busts.length} R1 misses` : ''}.
        </h3>
        <p className="mh-story-dek">Every pick filed across every league, sorted into stories.</p>
        <div className="mh-story-body">
          {headlinePick && (
            <p>
              <span className="dropcap">{headlinePick.year.toString()[0]}</span>
              The earliest call on record: <strong>{headlinePick.player}</strong>{headlinePick.position ? ` (${headlinePick.position})` : ''} at{' '}
              <em>{headlinePick.overall} overall</em>, Round {headlinePick.round} of the {headlinePick.year} {headlinePick.leagueName} draft.{' '}
              {headlinePick.finalRank != null && <>That season finished <strong>{ordinal(headlinePick.finalRank)}</strong>.</>}
            </p>
          )}
          {bigSteal && (
            <p>
              Best late-round value: <strong>{bigSteal.player}</strong>{bigSteal.position ? ` · ${bigSteal.position}` : ''} taken in
              Round <strong>{bigSteal.round}</strong> ({bigSteal.year}, {bigSteal.leagueName}) — a season that ended <em>{ordinal(bigSteal.finalRank!)}</em>.
              The Draft Room calls that pure profit.
            </p>
          )}
          {r1Busts.length > 0 && (
            <p>
              The other side of the ledger: <strong>{r1Busts.length}</strong> first-round pick{r1Busts.length === 1 ? '' : 's'} attached to seasons that
              missed the top half. Stories preserved below — every chronicler keeps the misses too.
            </p>
          )}
        </div>
      </article>
      <div className="mh-box">
        <div className="mh-box-mast">Round-One Roll Call</div>
        {r1.slice(0, 10).map((p) => (
          <div key={`${p.leagueSlug}-${p.year}-${p.overall}`} className="mh-row-line">
            <span className="lbl">{p.year} · {p.player}{p.position ? ` (${p.position})` : ''}</span>
            <span className="val">#{p.overall}</span>
          </div>
        ))}
        {r1.length > 10 && (
          <div className="mh-row-line"><span className="lbl">…and</span><span className="val">{r1.length - 10} more</span></div>
        )}
      </div>
    </section>
  )
}

function LateSteals({ picks }: { picks: ChroniclePick[] }) {
  return (
    <section>
      <div className="mh-shead"><h3 className="mh-shead-title">Mid-Round <em>Steals</em></h3><span className="mh-shead-meta">R5+ picks attached to top-3 seasons</span></div>
      <div className="mh-row mh-row-3">
        {picks.map((p) => (
          <article key={`${p.leagueSlug}-${p.year}-${p.overall}`} className="mh-story" style={{ borderTop: '1px dotted var(--ink-line)', paddingTop: '1.1rem' }}>
            <div className="mh-story-kicker">Steal · {p.year}</div>
            <h4 className="mh-story-head" style={{ fontSize: '1.3rem' }}>{p.player}</h4>
            <div className="mh-story-dek">{p.position ? `${p.position} · ` : ''}{p.nflTeam ?? ''}</div>
            <div className="mh-row-line"><span className="lbl">Round / Pick</span><span className="val">R{p.round}.{p.roundPick} · #{p.overall}</span></div>
            <div className="mh-row-line"><span className="lbl">League</span><span className="val cream">{p.leagueName}</span></div>
            <div className="mh-row-line"><span className="lbl">Season finish</span><span className="val">{p.finalRank ? ordinal(p.finalRank) : '—'}</span></div>
          </article>
        ))}
      </div>
    </section>
  )
}

function R1Busts({ picks }: { picks: ChroniclePick[] }) {
  return (
    <section>
      <div className="mh-shead"><h3 className="mh-shead-title">Burned by <em>Round One</em></h3><span className="mh-shead-meta">First-round picks · bottom-half finishes</span></div>
      <div className="mh-row mh-row-3">
        {picks.map((p) => (
          <article key={`${p.leagueSlug}-${p.year}-${p.overall}`} className="mh-story" style={{ borderTop: '1px dotted var(--ink-line)', paddingTop: '1.1rem' }}>
            <div className="mh-story-kicker rust">Miss · {p.year}</div>
            <h4 className="mh-story-head" style={{ fontSize: '1.3rem' }}>{p.player}</h4>
            <div className="mh-story-dek">{p.position ? `${p.position} · ` : ''}{p.nflTeam ?? ''}</div>
            <div className="mh-row-line"><span className="lbl">R1 pick</span><span className="val">#{p.overall}</span></div>
            <div className="mh-row-line"><span className="lbl">League</span><span className="val cream">{p.leagueName}</span></div>
            <div className="mh-row-line"><span className="lbl">Season finish</span><span className="val" style={{ color: 'var(--rust)' }}>{ordinal(p.finalRank!)}</span></div>
          </article>
        ))}
      </div>
    </section>
  )
}

type DraftGroup = { year: number; leagueName: string; leagueSlug: string; picks: ChroniclePick[]; finalRank: number | null; teamSize: number }

function groupPicks(picks: ChroniclePick[]): DraftGroup[] {
  const map = new Map<string, DraftGroup>()
  for (const p of picks) {
    const k = `${p.leagueSlug}|${p.year}`
    let g = map.get(k)
    if (!g) {
      g = { year: p.year, leagueName: p.leagueName, leagueSlug: p.leagueSlug, picks: [], finalRank: p.finalRank, teamSize: p.teamSize }
      map.set(k, g)
    }
    g.picks.push(p)
  }
  for (const g of map.values()) g.picks.sort((a, b) => a.overall - b.overall)
  return [...map.values()].sort((a, b) => b.year - a.year || a.leagueName.localeCompare(b.leagueName))
}

function DraftLedger({ drafts }: { drafts: DraftGroup[] }) {
  if (drafts.length === 0) return <EmptyState>No draft files on record.</EmptyState>
  return (
    <section>
      <div className="mh-shead"><h3 className="mh-shead-title">The <em>Draft Ledger</em></h3><span className="mh-shead-meta">Every pick, every year</span></div>
      <div className="mh-row mh-row-2">
        {drafts.map((d) => (
          <article key={`${d.leagueSlug}-${d.year}`} className="mh-story" style={{ borderTop: '1px dotted var(--ink-line)', paddingTop: '1.25rem' }}>
            <div className="mh-story-kicker">{d.leagueName} · {d.year} Draft</div>
            <h4 className="mh-story-head" style={{ fontSize: '1.4rem' }}>
              {d.picks.length} picks · finished {d.finalRank ? <em>{ordinal(d.finalRank)}</em> : <em>—</em>}
            </h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: '.7rem', marginTop: '.5rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--gold-deep)', color: 'var(--gold)', textAlign: 'left' }}>
                  <th style={{ padding: '.4rem .25rem', letterSpacing: '.15em', fontSize: '.55rem' }}>R.PK</th>
                  <th style={{ padding: '.4rem .25rem', letterSpacing: '.15em', fontSize: '.55rem' }}>PLAYER</th>
                  <th style={{ padding: '.4rem .25rem', letterSpacing: '.15em', fontSize: '.55rem' }}>POS</th>
                </tr>
              </thead>
              <tbody>
                {d.picks.map((p) => (
                  <tr key={p.overall} style={{ borderBottom: '1px dotted var(--ink-line-soft)' }}>
                    <td style={{ padding: '.35rem .25rem', color: 'var(--cream-mute)' }}>R{p.round}.{p.roundPick}</td>
                    <td style={{ padding: '.35rem .25rem', color: 'var(--cream)', fontFamily: 'var(--serif)', fontSize: '.85rem' }}>{p.player}</td>
                    <td style={{ padding: '.35rem .25rem', color: 'var(--gold)' }}>{p.position ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        ))}
      </div>
    </section>
  )
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}
