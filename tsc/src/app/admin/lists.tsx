'use client'

// The two long lists on /admin, members and leagues. Everything arrives
// server-rendered; filtering, searching and More/Less happen here, so a
// tap never waits on the server. Never the whole list at once.

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import type { LeagueItem, Member, Plan } from './data'
import { PLATFORM_LABEL, ago, fmtDay } from './format'
import { grantComp, revokeComp } from './actions'
import s from './admin.module.css'

// ── Shared bits ──────────────────────────────────────────────────────────

function Chips<T extends string>({ options, value, onChange }: {
  options: { id: T; label: string; n: number; glyph?: Glyph }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className={s.chips} role="tablist">
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id}
          className={`${s.chip} ${value === o.id ? s.chipOn : ''}`} onClick={() => onChange(o.id)}>
          {o.glyph && <PlanGlyph k={o.glyph} />}
          {o.label} <span className={s.chipN}>{o.n}</span>
        </button>
      ))}
    </div>
  )
}

function Pager({ shown, total, step, floor, set }: { shown: number; total: number; step: number; floor: number; set: (n: number) => void }) {
  if (total <= floor) return null
  return (
    <div className={s.pager}>
      <span>Showing {shown} of {total}</span>
      <span className={s.pagerBtns}>
        {shown > floor && <button type="button" className={s.ghostBtn} onClick={() => set(Math.max(floor, shown - step))}>Less</button>}
        {shown < total && <button type="button" className={s.goldBtn} onClick={() => set(Math.min(total, shown + step))}>More</button>}
      </span>
    </div>
  )
}

function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className={s.search}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
      </svg>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  )
}

// ── Plan glyphs ──────────────────────────────────────────────────────────
// Drawn in CSS: a full disc is paying, half a disc is a trial (rust ring when
// it's been cancelled and won't convert), an empty ring is cancelled, a star
// is a comp. Always beside a word, never on its own.

export type Glyph = 'paying' | 'trial' | 'trialx' | 'canceled' | 'pastdue' | 'comp' | 'free'

export function PlanGlyph({ k }: { k: Glyph }) {
  if (k === 'comp') return <span className={s.glyphStar} aria-hidden>★</span>
  return <span className={s.glyph} data-k={k} aria-hidden />
}

function glyphOf(p: Plan): Glyph {
  if (p.kind === 'trial') return p.cancels ? 'trialx' : 'trial'
  return p.kind
}

function planText(p: Plan): string {
  switch (p.kind) {
    case 'paying': return p.ending && p.renews ? `Paying · ends ${fmtDay(p.renews)}` : 'Paying'
    case 'trial': return p.ends ? `Trial · ${p.cancels ? 'cancels' : 'ends'} ${fmtDay(p.ends)}` : 'Trial'
    case 'canceled': return 'Canceled'
    case 'pastdue': return 'Payment issue'
    case 'comp': return p.env ? 'Comp · env' : p.until ? `Comp · ${fmtDay(p.until)}` : 'Comp · forever'
    case 'free': return 'Free'
  }
}

export function PlanPill({ plan }: { plan: Plan }) {
  const k = glyphOf(plan)
  return (
    <span className={s.pill} data-k={k}>
      <PlanGlyph k={k} />
      {planText(plan)}
    </span>
  )
}

// ── Members ──────────────────────────────────────────────────────────────

type MemberFilter = 'all' | 'paying' | 'trial' | 'comp' | 'canceled' | 'free' | 'new' | 'noleague'

const isFilter = (v: string | undefined): v is MemberFilter =>
  !!v && ['all', 'paying', 'trial', 'comp', 'canceled', 'free', 'new', 'noleague'].includes(v)

// Joined with the time, for the closed row on a wide screen: "Oct 13, 6:11 PM".
const JOINED_AT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }

export function MemberList({ members, asOf, initial, initialFilter }: {
  members: Member[]
  asOf: string
  initial: number
  initialFilter?: string
}) {
  const [filter, setFilter] = useState<MemberFilter>(isFilter(initialFilter) ? initialFilter : 'all')
  const [sort, setSort] = useState<'joined' | 'seen'>('joined')
  const [q, setQ] = useState('')
  const [count, setCount] = useState(initial)
  const [open, setOpen] = useState<string | null>(null)

  const weekAgo = Date.parse(asOf) - 7 * 86_400_000
  const inFilter = (m: Member, f: MemberFilter) =>
    f === 'all' ? true
      : f === 'new' ? Date.parse(m.joined) >= weekAgo
      : f === 'noleague' ? m.leagues.length === 0
      : f === 'canceled' ? m.plan.kind === 'canceled' || m.plan.kind === 'pastdue'
      : m.plan.kind === f

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out = members.filter((m) => inFilter(m, filter) && (!needle || [m.name, m.email, m.code].some((v) => v?.toLowerCase().includes(needle))))
    if (filter === 'comp') {
      // Soonest to run out first; permanent comps last.
      return out.sort((a, b) => ((a.plan.kind === 'comp' && a.plan.until) || '9999').localeCompare((b.plan.kind === 'comp' && b.plan.until) || '9999'))
    }
    if (sort === 'seen') return out.sort((a, b) => (b.lastSeen ?? '').localeCompare(a.lastSeen ?? ''))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, filter, sort, q])

  const n = (f: MemberFilter) => members.filter((m) => inFilter(m, f)).length
  const step = initial
  const floor = Math.min(5, list.length)
  const shown = Math.max(floor, Math.min(count, list.length))

  return (
    <div>
      <div className={s.listTools}>
        <Chips<MemberFilter>
          value={filter}
          onChange={(f) => { setFilter(f); setCount(initial) }}
          options={[
            { id: 'all', label: 'All', n: members.length },
            { id: 'new', label: 'New this week', n: n('new') },
            { id: 'paying', label: 'Paying', n: n('paying'), glyph: 'paying' },
            { id: 'trial', label: 'Trial', n: n('trial'), glyph: 'trial' },
            { id: 'comp', label: 'Comped', n: n('comp'), glyph: 'comp' },
            { id: 'canceled', label: 'Canceled', n: n('canceled'), glyph: 'canceled' },
            { id: 'free', label: 'Free', n: n('free'), glyph: 'free' },
            { id: 'noleague', label: 'No league', n: n('noleague') },
          ]}
        />
        <div className={s.toolRow}>
          <Search value={q} onChange={(v) => { setQ(v); setCount(initial) }} placeholder="Name, email or code" />
          {filter !== 'comp' && (
            <div className={s.seg}>
              <button type="button" aria-pressed={sort === 'joined'} onClick={() => setSort('joined')}>Newest</button>
              <button type="button" aria-pressed={sort === 'seen'} onClick={() => setSort('seen')}>Last seen</button>
            </div>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <p className={s.emptyNote}>Nobody here.</p>
      ) : (
        <ul className={s.rows}>
          <li className={`${s.labels} ${s.memberLabels}`} aria-hidden>
            <span>Member</span><span>Joined</span><span>Leagues</span><span>Bookmarks</span><span>Seen</span><span>Heard via</span><span>Plan</span><span />
          </li>
          {list.slice(0, shown).map((m) => (
            <MemberRow key={m.id} m={m} asOf={asOf} open={open === m.id} toggle={() => setOpen(open === m.id ? null : m.id)} />
          ))}
        </ul>
      )}
      <Pager shown={shown} total={list.length} step={step} floor={floor} set={setCount} />
    </div>
  )
}

function MemberRow({ m, asOf, open, toggle }: { m: Member; asOf: string; open: boolean; toggle: () => void }) {
  const leagues = m.leagues.length
  const marks = m.bookmarks.length
  return (
    <li className={`${s.row} ${open ? s.rowOpen : ''}`}>
      <button type="button" className={s.rowHead} onClick={toggle} aria-expanded={open}>
        <span className={s.who}>
          <span className={s.whoName}>{m.name ?? m.email ?? m.id.slice(0, 8)}</span>
          {m.name && m.email && <span className={s.whoSub}>{m.email}</span>}
        </span>
        <span className={s.cell} data-label="Joined">{fmtDay(m.joined, JOINED_AT)}</span>
        <span className={s.cell} data-label="Leagues">{leagues}</span>
        <span className={s.cell} data-label="Bookmarks">{marks || '·'}</span>
        <span className={s.cell} data-label="Seen">{m.lastSeen ? ago(m.lastSeen, asOf) : '·'}</span>
        <span className={s.cell} data-label="Via">{m.heardVia ?? '·'}</span>
        <span className={s.planCell}><PlanPill plan={m.plan} /></span>
        <span className={s.chev} aria-hidden>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </span>
        {/* The columns as one muted line, where they don't fit (a phone). */}
        <span className={s.rowMeta}>
          Joined {fmtDay(m.joined)} · {leagues} {leagues === 1 ? 'league' : 'leagues'}{marks ? ` · ${marks} ${marks === 1 ? 'bookmark' : 'bookmarks'}` : ''}{m.lastSeen ? ` · seen ${ago(m.lastSeen, asOf)}` : ''}
        </span>
      </button>
      {open && <MemberDrawer m={m} />}
    </li>
  )
}

function MemberDrawer({ m }: { m: Member }) {
  const p = m.plan
  const sub =
    p.kind === 'paying' ? `${p.label}, ${p.ending ? 'cancelled, ends' : 'renews'} ${p.renews ? fmtDay(p.renews, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}`
      : p.kind === 'trial' ? `${p.label} trial, ${p.ends ? `${p.cancels ? 'cancelled, ends' : 'converts'} ${fmtDay(p.ends)}` : 'no end date'}`
      : p.kind === 'canceled' ? `${p.label}, ended${p.since ? ` ${fmtDay(p.since, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}`
      : p.kind === 'pastdue' ? `${p.label}, ${p.status}`
      : m.subNote ?? 'None'
  return (
    <div className={s.drawer}>
      <dl className={s.facts}>
        <div className={s.factWide}><dt>Email</dt><dd>{m.email ? <a href={`mailto:${m.email}`}>{m.email}</a> : '·'}</dd></div>
        <div><dt>Code</dt><dd className={s.mono}>{m.code ?? '·'}</dd></div>
        <div><dt>Joined</dt><dd>{fmtDay(m.joined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} ET</dd></div>
        <div><dt>Heard via</dt><dd>{m.heardVia ?? '·'}{m.heardOther ? `, “${m.heardOther}”` : ''}</dd></div>
        <div><dt>Signed up from</dt><dd>{m.cameFrom ?? '·'}</dd></div>
        <div><dt>Stripe</dt><dd>{sub}</dd></div>
        {m.endedComp && <div><dt>Old comp</dt><dd>Ended {fmtDay(m.endedComp.ended)}{m.endedComp.note ? `, ${m.endedComp.note}` : ''}</dd></div>}
        <div className={s.factWide}>
          <dt>Leagues</dt>
          <dd>
            {m.leagues.length === 0 ? 'None' : m.leagues.map((l) => (
              <Link key={l.slug} href={`/league/${l.slug}`} className={s.leagueTag}>
                {l.name}{l.empty && <span className={s.tagMute}> · empty</span>}
              </Link>
            ))}
          </dd>
        </div>
        <div className={s.factWide}>
          <dt>Bookmarks</dt>
          <dd>
            {m.bookmarks.length === 0 ? 'None' : m.bookmarks.map((b) => (
              <Link key={b.slug} href={`/leagues/${b.slug}/`} className={s.leagueTag}>
                {b.name}<span className={s.tagMute}> · {fmtDay(b.at)}</span>
              </Link>
            ))}
          </dd>
        </div>
      </dl>
      <CompControls m={m} />
    </div>
  )
}

// A comp grant with no prompt() in the way: pick a length, add a note, go.
// Revoking takes a second tap rather than a confirm() dialog.
const LENGTHS: { months: number | null; label: string }[] = [
  { months: 1, label: '1 mo' }, { months: 3, label: '3 mo' }, { months: 6, label: '6 mo' }, { months: null, label: 'Forever' },
]

function CompControls({ m }: { m: Member }) {
  const p = m.plan
  const [months, setMonths] = useState<number | null>(3)
  const [note, setNote] = useState('')
  const [armed, setArmed] = useState(false)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  if (p.kind === 'comp' && p.env) {
    return <p className={s.compNote}>Comped through LIFETIME_USER_IDS. Change it in the env.</p>
  }
  const active = p.kind === 'comp'

  const grant = () => start(async () => {
    setMsg(null)
    const res = await grantComp(m.id, note.trim() || undefined, months ?? undefined)
    setMsg(res.ok ? { ok: true, text: 'Comped. They won’t be told, so tell them.' } : { ok: false, text: res.error ?? 'Failed.' })
    if (res.ok) setNote('')
  })
  const revoke = () => {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return }
    start(async () => {
      setArmed(false)
      const res = await revokeComp(m.id)
      setMsg(res.ok ? { ok: true, text: 'Comp revoked.' } : { ok: false, text: res.error ?? 'Failed.' })
    })
  }

  return (
    <div className={s.comp}>
      <div className={s.compHead}>
        <span className={s.kicker}>{active ? 'Comp' : 'Give a comp'}</span>
        {active && <span className={s.compNow}>{p.until ? `Until ${fmtDay(p.until, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Permanent'}{p.note ? ` · ${p.note}` : ''}</span>}
      </div>
      <div className={s.compRow}>
        <div className={s.seg}>
          {LENGTHS.map((l) => (
            <button key={l.label} type="button" aria-pressed={months === l.months} onClick={() => setMonths(l.months)}>{l.label}</button>
          ))}
        </div>
        <input className={s.noteInput} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" maxLength={120} />
        <button type="button" className={s.goldBtn} disabled={pending} onClick={grant}>
          {pending ? 'Saving' : active ? 'Replace' : 'Comp'}
        </button>
        {active && (
          <button type="button" className={`${s.ghostBtn} ${armed ? s.armed : ''}`} disabled={pending} onClick={revoke}>
            {armed ? 'Tap again' : 'Revoke'}
          </button>
        )}
      </div>
      {active && <p className={s.compHint}>A new length starts from today.</p>}
      {msg && <p className={msg.ok ? s.okMsg : s.errMsg}>{msg.text}</p>}
    </div>
  )
}

// ── Leagues ──────────────────────────────────────────────────────────────

// Each platform in its own colours, set like its wordmark, so the column reads
// at a glance. Drawn in CSS, not the real logo files.
const PLATFORM_MARK: Record<string, string> = { sleeper: 'sleeper', espn: 'ESPN', yahoo: 'yahoo!', nfl: 'NFL' }

function PlatformMark({ platform }: { platform: string }) {
  return (
    <span className={s.plat} data-p={platform} title={PLATFORM_LABEL[platform] ?? platform}>
      {PLATFORM_MARK[platform] ?? (PLATFORM_LABEL[platform] ?? platform).replace('.com', '')}
    </span>
  )
}

const PLAN_LABEL: Record<LeagueItem['plan'], string> = { 'veteran+': 'Veteran+', rookie: 'Rookie', comp: 'Comp', udfa: 'UDFA', testing: 'Testing' }

export function LeagueList({ leagues, asOf, initial, empty = false }: {
  leagues: LeagueItem[]
  asOf: string
  initial: number
  /** The leagues that never got data: no filters, owner front and centre. */
  empty?: boolean
}) {
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState<'new' | 'read'>('new')
  const [q, setQ] = useState('')
  const [count, setCount] = useState(initial)

  const platforms = useMemo(() => [...new Set(leagues.map((l) => l.platform))], [leagues])
  const inFilter = (l: LeagueItem, f: string) =>
    f === 'all' ? true
      : f === 'read' ? l.readers7 > 0
      : f === 'paid' ? l.plan !== 'udfa'
      : l.platform === f

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out = leagues.filter((l) => inFilter(l, filter) && (!needle || [l.name, l.slug, l.owner, l.ownerEmail].some((v) => v?.toLowerCase().includes(needle))))
    return sort === 'read' ? out.sort((a, b) => b.readers7 - a.readers7) : out
  }, [leagues, filter, sort, q])

  const floor = Math.min(5, list.length)
  const shown = Math.max(floor, Math.min(count, list.length))

  return (
    <div>
      <div className={s.listTools}>
        {!empty && (
          <Chips
            value={filter}
            onChange={(f) => { setFilter(f); setCount(initial) }}
            options={[
              { id: 'all', label: 'All', n: leagues.length },
              { id: 'read', label: 'Read this week', n: leagues.filter((l) => l.readers7 > 0).length },
              { id: 'paid', label: 'Paid or comp', n: leagues.filter((l) => l.plan !== 'udfa').length },
              ...platforms.map((p) => ({ id: p, label: PLATFORM_LABEL[p] ?? p, n: leagues.filter((l) => l.platform === p).length })),
            ]}
          />
        )}
        <div className={s.toolRow}>
          <Search value={q} onChange={(v) => { setQ(v); setCount(initial) }} placeholder={empty ? 'League or owner' : 'League, slug or owner'} />
          {!empty && (
            <div className={s.seg}>
              <button type="button" aria-pressed={sort === 'new'} onClick={() => setSort('new')}>Newest</button>
              <button type="button" aria-pressed={sort === 'read'} onClick={() => setSort('read')}>Most read</button>
            </div>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <p className={s.emptyNote}>No leagues here.</p>
      ) : (
        <ul className={s.rows}>
          <li className={`${s.labels} ${s.leagueLabels}`} aria-hidden>
            <span /><span>League</span><span>Added</span><span>Synced</span><span>Readers 7d</span><span>State</span>
          </li>
          {list.slice(0, shown).map((l) => (
            <li key={l.id} className={`${s.row} ${s.leagueRow}`}>
              <PlatformMark platform={l.platform} />
              <span className={s.who}>
                <Link href={`/league/${l.slug}`} className={s.whoName}>{l.name}</Link>
                <span className={s.whoSub}>{l.owner}{l.ownerEmail && l.ownerEmail !== l.owner ? ` · ${l.ownerEmail}` : ''}</span>
              </span>
              <span className={s.cell} data-label="Added">{fmtDay(l.created)}</span>
              <span className={s.cell} data-label="Synced">{l.lastSynced ? ago(l.lastSynced, asOf) : 'never'}</span>
              <span className={s.cell} data-label="Readers 7d">{empty ? '·' : l.readers7 || '·'}</span>
              <span className={s.tags}>
                {l.yours && <span className={s.tag} data-t="yours">Yours</span>}
                <span className={s.tag} data-t={l.plan}>{PLAN_LABEL[l.plan]}</span>
                {l.grace && <span className={s.tag} data-t="grace">Grace · {fmtDay(l.grace)}</span>}
                {!empty && <span className={s.tag} data-t={l.published ? 'pub' : 'priv'}>{l.published ? 'Published' : 'Private'}</span>}
              </span>
              <div className={s.rowMeta}>
                {PLATFORM_LABEL[l.platform] ?? l.platform} · added {fmtDay(l.created)}
                {l.lastSynced ? ` · synced ${ago(l.lastSynced, asOf)}` : ' · never synced'}
                {!empty && l.readers7 > 0 ? ` · ${l.readers7} ${l.readers7 === 1 ? 'reader' : 'readers'} this week` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager shown={shown} total={list.length} step={initial} floor={floor} set={setCount} />
    </div>
  )
}
