import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCareerChronicle } from '@/lib/manager/chronicle'
import { loadPlayerDesk, type PlayerDesk, type DeskPlayer, type DeskLeagueRoster } from '@/lib/manager/desk'
import { ChronicleShell, EmptyState } from '../_shell'

export const dynamic = 'force-dynamic'

export default async function PlayerDeskPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const chronicle = await loadCareerChronicle(slug, user.id)
  if (!chronicle) notFound()
  const desk = await loadPlayerDesk(slug, user.id)
  if (!desk) notFound()

  const deck = desk.totalPlayers === 0
    ? 'No live rosters loaded yet.'
    : `${desk.totalPlayers} players rostered across ${desk.rosters.length} live league${desk.rosters.length === 1 ? '' : 's'} · refreshed ${timeAgo(desk.refreshedAt)}.`

  return (
    <ChronicleShell chronicle={chronicle} active="desk" deck={deck}>
      {desk.errors.length > 0 && <ErrorStrip errors={desk.errors} />}
      <InjuryWire desk={desk} />
      <PositionBoard desk={desk} />
      <LeagueRosters desk={desk} />
      {desk.unsupported.length > 0 && <UnsupportedNotice desk={desk} />}
    </ChronicleShell>
  )
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.round(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

function ErrorStrip({ errors }: { errors: string[] }) {
  return (
    <div className="mh-box rust">
      <div className="mh-box-mast">Wire warning · {errors.length} league{errors.length === 1 ? '' : 's'} couldn&apos;t load</div>
      {errors.map((e, i) => (
        <div key={i} className="mh-row-line"><span className="lbl">{e}</span><span className="val" style={{ color: 'var(--rust)' }}>—</span></div>
      ))}
    </div>
  )
}

function InjuryWire({ desk }: { desk: PlayerDesk }) {
  const t = desk.injuries
  if (desk.totalPlayers === 0) {
    return <EmptyState>No active Sleeper rosters resolved. Try re-syncing one of your leagues.</EmptyState>
  }
  if (t.length === 0) {
    return (
      <section className="mh-row mh-row-2">
        <article className="mh-story" style={{ borderTop: 'none', paddingTop: 0 }}>
          <div className="mh-story-kicker">Lead · The Wire</div>
          <h3 className="mh-story-head">A clean bill of <em>health</em>.</h3>
          <p className="mh-story-dek">Nobody on the active rosters carries an injury designation right now.</p>
          <div className="mh-story-body">
            <p>
              <span className="dropcap">N</span>o Questionable, Doubtful, Out, IR, PUP or Suspended designations on file across the {desk.rosters.length} {desk.rosters.length === 1 ? 'roster' : 'rosters'} we pulled.
              Scroll for the full position-by-position rundown and the per-league sheets.
            </p>
          </div>
        </article>
        <div className="mh-box steel">
          <div className="mh-box-mast">Status board</div>
          <div className="mh-row-line"><span className="lbl">Players</span><span className="val cream">{desk.totalPlayers}</span></div>
          <div className="mh-row-line"><span className="lbl">Leagues live</span><span className="val">{desk.rosters.length}</span></div>
          {desk.unsupported.length > 0 && <div className="mh-row-line"><span className="lbl">Pending platforms</span><span className="val" style={{ color: 'var(--rust)' }}>{desk.unsupported.length}</span></div>}
          <div className="mh-row-line"><span className="lbl">Refreshed</span><span className="val cream">{timeAgo(desk.refreshedAt)}</span></div>
        </div>
      </section>
    )
  }
  const worst = t[0]
  return (
    <section className="mh-row mh-row-2">
      <article className="mh-story" style={{ borderTop: 'none', paddingTop: 0 }}>
        <div className="mh-story-kicker rust">Lead · The Injury Wire</div>
        <h3 className="mh-story-head">
          <em>{t.length}</em> player{t.length === 1 ? '' : 's'} on the wire. <em>{worst.name}</em> tops the list.
        </h3>
        <p className="mh-story-dek">Every Q / D / O / IR / PUP designation across your rosters, ranked worst-first.</p>
        <div className="mh-box rust" style={{ marginTop: '1rem' }}>
          <div className="mh-box-mast">Injury Wire · {t.length}</div>
          {t.map((p) => (
            <InjuryRow key={p.playerId} p={p} />
          ))}
        </div>
      </article>
      <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="mh-box steel">
          <div className="mh-box-mast">Status board</div>
          <div className="mh-row-line"><span className="lbl">Players</span><span className="val cream">{desk.totalPlayers}</span></div>
          <div className="mh-row-line"><span className="lbl">Leagues live</span><span className="val">{desk.rosters.length}</span></div>
          <div className="mh-row-line"><span className="lbl">On the wire</span><span className="val" style={{ color: 'var(--rust)' }}>{t.length}</span></div>
          {desk.unsupported.length > 0 && <div className="mh-row-line"><span className="lbl">Pending platforms</span><span className="val" style={{ color: 'var(--rust)' }}>{desk.unsupported.length}</span></div>}
          <div className="mh-row-line"><span className="lbl">Refreshed</span><span className="val cream">{timeAgo(desk.refreshedAt)}</span></div>
        </div>
        <SeverityBreakdown injuries={t} />
      </aside>
    </section>
  )
}

function SeverityBreakdown({ injuries }: { injuries: DeskPlayer[] }) {
  const buckets = injuries.reduce((m, p) => {
    const s = p.injuryStatus ?? 'Unknown'
    m.set(s, (m.get(s) ?? 0) + 1)
    return m
  }, new Map<string, number>())
  if (buckets.size === 0) return null
  const order = ['IR', 'Suspended', 'PUP', 'Out', 'Doubtful', 'Questionable']
  return (
    <div className="mh-box">
      <div className="mh-box-mast">By severity</div>
      {order.filter((k) => buckets.has(k)).map((k) => (
        <div key={k} className="mh-row-line"><span className="lbl">{k}</span><span className="val">{buckets.get(k)}</span></div>
      ))}
    </div>
  )
}

function statusBadgeColor(s: string | null): string {
  if (!s) return 'var(--cream-mute)'
  if (s === 'IR' || s === 'Suspended' || s === 'PUP') return 'var(--rust)'
  if (s === 'Out' || s === 'Doubtful') return 'var(--rust)'
  if (s === 'Questionable') return 'var(--gold)'
  return 'var(--cream-mute)'
}

function InjuryRow({ p }: { p: DeskPlayer }) {
  const detail = [p.position, p.team].filter(Boolean).join(' · ')
  return (
    <div className="mh-row-line">
      <span className="lbl" style={{ display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
        <span style={{ color: 'var(--cream)', fontFamily: 'var(--serif)', fontSize: '.95rem' }}>{p.name}</span>
        <span style={{ fontSize: '.55rem', letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--cream-mute)' }}>
          {detail || '—'} · {p.slots.map((s) => s.leagueName).join(', ')}
          {p.injuryBodyPart ? ` · ${p.injuryBodyPart}` : ''}
        </span>
      </span>
      <span className="val" style={{ color: statusBadgeColor(p.injuryStatus) }}>{p.injuryStatus ?? '—'}</span>
    </div>
  )
}

function PositionBoard({ desk }: { desk: PlayerDesk }) {
  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const
  const hasAny = positions.some((p) => desk.byPosition[p].length > 0)
  if (!hasAny) return null
  return (
    <section>
      <div className="mh-shead">
        <h3 className="mh-shead-title">The <em>Position</em> Board</h3>
        <span className="mh-shead-meta">{desk.totalPlayers} players across {desk.rosters.length} {desk.rosters.length === 1 ? 'roster' : 'rosters'}</span>
      </div>
      <div className="mh-row mh-row-3">
        {positions
          .filter((p) => desk.byPosition[p].length > 0)
          .map((pos) => (
            <PositionCard key={pos} pos={pos} players={desk.byPosition[pos]} />
          ))}
      </div>
    </section>
  )
}

function PositionCard({ pos, players }: { pos: string; players: DeskPlayer[] }) {
  const injuredCount = players.filter((p) => p.injuryStatus).length
  return (
    <article className="mh-story" style={{ borderTop: '1px dotted var(--ink-line)', paddingTop: '1.1rem' }}>
      <div className="mh-story-kicker">{pos} · {players.length}{injuredCount > 0 ? ` · ${injuredCount} hurt` : ''}</div>
      <div className="mh-box" style={{ marginTop: '.5rem' }}>
        {players.map((p) => (
          <div key={p.playerId} className="mh-row-line">
            <span className="lbl" style={{ display: 'flex', flexDirection: 'column', gap: '.1rem' }}>
              <span style={{ color: 'var(--cream)', fontFamily: 'var(--serif)', fontSize: '.95rem' }}>
                {p.name}
                {p.injuryStatus && (
                  <span style={{ fontSize: '.5rem', letterSpacing: '.18em', marginLeft: '.4rem', color: statusBadgeColor(p.injuryStatus) }}>
                    [{p.injuryStatus}]
                  </span>
                )}
              </span>
              <span style={{ fontSize: '.52rem', letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--cream-mute)' }}>
                {(p.team ?? '—')} · {p.slots.length === 1 ? p.slots[0].leagueName : `${p.slots.length} leagues`}
              </span>
            </span>
            <span className="val" style={{ fontSize: '.6rem' }}>
              {[...new Set(p.slots.map((s) => s.slot.toUpperCase()))].join('/')}
            </span>
          </div>
        ))}
      </div>
    </article>
  )
}

function LeagueRosters({ desk }: { desk: PlayerDesk }) {
  if (desk.rosters.length === 0) return null
  return (
    <section>
      <div className="mh-shead">
        <h3 className="mh-shead-title">The <em>Roster Sheets</em></h3>
        <span className="mh-shead-meta">{desk.rosters.length} live {desk.rosters.length === 1 ? 'sheet' : 'sheets'}</span>
      </div>
      <div className="mh-row mh-row-2">
        {desk.rosters.map((r) => <RosterSheet key={r.leagueSlug} r={r} />)}
      </div>
    </section>
  )
}

function RosterSheet({ r }: { r: DeskLeagueRoster }) {
  const total = r.starters.length + r.bench.length + r.ir.length + r.taxi.length
  return (
    <article className="mh-story" style={{ borderTop: '1px dotted var(--ink-line)', paddingTop: '1.25rem' }}>
      <div className="mh-story-kicker">{r.leagueName}</div>
      <h4 className="mh-story-head" style={{ fontSize: '1.4rem' }}>{r.teamName ?? r.leagueName}</h4>
      <div className="mh-story-dek">{total} players · {r.starters.length} starting</div>
      <RosterGroup label={`Starters · ${r.starters.length}`} players={r.starters} />
      {r.bench.length > 0 && <RosterGroup label={`Bench · ${r.bench.length}`} players={r.bench} />}
      {r.ir.length > 0 && <RosterGroup label={`IR · ${r.ir.length}`} players={r.ir} accent="rust" />}
      {r.taxi.length > 0 && <RosterGroup label={`Taxi · ${r.taxi.length}`} players={r.taxi} accent="steel" />}
      <div className="mh-story-byline">
        <span>{r.platform.toUpperCase()}</span>
        <Link href={`/leagues/${r.leagueSlug}/`} style={{ color: 'var(--gold)', textDecoration: 'none' }}>Almanac →</Link>
      </div>
    </article>
  )
}

function RosterGroup({ label, players, accent }: { label: string; players: DeskPlayer[]; accent?: 'rust' | 'steel' }) {
  return (
    <div className={`mh-box${accent ? ` ${accent}` : ''}`} style={{ marginTop: '.75rem' }}>
      <div className="mh-box-mast">{label}</div>
      {players.map((p) => (
        <div key={p.playerId} className="mh-row-line">
          <span className="lbl" style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '.55rem', letterSpacing: '.18em', color: 'var(--gold)', minWidth: '2.2rem' }}>{p.position || '—'}</span>
            <span style={{ color: 'var(--cream)', fontFamily: 'var(--serif)', fontSize: '.93rem' }}>{p.name}</span>
            {p.injuryStatus && (
              <span style={{ fontSize: '.5rem', letterSpacing: '.18em', color: statusBadgeColor(p.injuryStatus) }}>
                [{p.injuryStatus}]
              </span>
            )}
          </span>
          <span className="val" style={{ fontSize: '.62rem' }}>{p.team ?? '—'}</span>
        </div>
      ))}
    </div>
  )
}

function UnsupportedNotice({ desk }: { desk: PlayerDesk }) {
  return (
    <div className="mh-box steel">
      <div className="mh-box-mast">Pending Platform Support · {desk.unsupported.length}</div>
      <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'var(--cream-soft)', fontSize: '.95rem', lineHeight: 1.6, marginBottom: '.75rem' }}>
        Live roster sync is Sleeper-first. ESPN, NFL.com, and Yahoo connectors for the Player Desk are next on the roadmap — their league histories already feed the chronicle, but live rosters need new ingest paths.
      </p>
      {desk.unsupported.map((u, i) => (
        <div key={`${u.leagueSlug}-${i}`} className="mh-row-line">
          <span className="lbl">{u.leagueName}</span>
          <span className="val" style={{ color: 'var(--steel)' }}>{u.platform.toUpperCase()}</span>
        </div>
      ))}
    </div>
  )
}
