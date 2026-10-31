// The pieces of /admin, written once. desktop.tsx and mobile.tsx lay them out;
// admin.module.css styles them both, the phone tree under .m.

import Link from 'next/link'
import type { AdminData, Attention, RoomIcon, Tile } from './data'
import { PLATFORM_LABEL, fmtDay, money } from './format'
import { PlanGlyph, type Glyph } from './lists'
import s from './admin.module.css'

// ── Pulse: four counters, today and this week, 14 days of history ────────

function Strip({ values, days, label }: { values: number[]; days: string[]; label: string }) {
  const peak = Math.max(1, ...values)
  return (
    <div className={s.strip} role="img" aria-label={`${label} by day, last ${days.length} days`}>
      {values.map((v, i) => (
        <span
          key={days[i]}
          title={`${fmtDay(`${days[i]}T12:00:00Z`, { weekday: 'short', month: 'short', day: 'numeric' })} · ${v}`}
          className={`${s.bar} ${i === values.length - 1 ? s.barNow : ''} ${v === 0 ? s.barZero : ''}`}
          style={{ height: v === 0 ? undefined : `${Math.max(12, (v / peak) * 100)}%` }}
        />
      ))}
    </div>
  )
}

export function Tiles({ tiles, days }: { tiles: Tile[]; days: string[] }) {
  return (
    <div className={s.tiles}>
      {tiles.map((t) => {
        const body = (
          <>
            <div className={s.tileLabel}>{t.label}</div>
            <div className={s.tileNums}>
              <span className={s.tileWeek}>{t.week.toLocaleString('en-US')}</span>
              <span className={s.tileUnit}>this week</span>
            </div>
            <div className={s.tileToday}><strong>{t.today}</strong> today</div>
            <Strip values={t.strip} days={days} label={t.label} />
            <div className={s.tileNote}>{t.note}</div>
          </>
        )
        return t.href
          ? <Link key={t.label} href={t.href} className={`${s.tile} ${s.tileLink}${t.own ? ` ${s.tileOwn}` : ''}`}>{body}</Link>
          : <div key={t.label} className={`${s.tile}${t.own ? ` ${s.tileOwn}` : ''}`}>{body}</div>
      })}
    </div>
  )
}

// ── Needs you ─────────────────────────────────────────────────────────────

function ToneIcon({ tone }: { tone: Attention['tone'] }) {
  if (tone === 'rust') {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3 2.5 20h19z" /><line x1="12" y1="10" x2="12" y2="14" /><line x1="12" y1="17" x2="12" y2="17.01" />
      </svg>
    )
  }
  if (tone === 'gold') {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" />
      </svg>
    )
  }
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9" /><line x1="12" y1="11" x2="12" y2="16" /><line x1="12" y1="8" x2="12" y2="8.01" />
    </svg>
  )
}

const TONE_WORD: Record<Attention['tone'], string> = { rust: 'Act', gold: 'Soon', steel: 'FYI' }

export function NeedsYou({ items }: { items: Attention[] }) {
  if (items.length === 0) {
    return <p className={s.quiet}>All quiet. Nothing needs you.</p>
  }
  return (
    <ul className={s.attn}>
      {items.map((a, i) => {
        const body = (
          <>
            <span className={s.attnIcon} data-tone={a.tone}><ToneIcon tone={a.tone} /></span>
            <span className={s.attnBody}>
              <span className={s.attnTitle}>{a.title}</span>
              <span className={s.attnDetail}>{a.detail}</span>
            </span>
            <span className={s.attnWord} data-tone={a.tone}>{TONE_WORD[a.tone]}</span>
          </>
        )
        return (
          <li key={i}>
            {a.href ? <Link href={a.href} className={s.attnRow}>{body}</Link> : <div className={s.attnRow}>{body}</div>}
          </li>
        )
      })}
    </ul>
  )
}

// ── Accounts ──────────────────────────────────────────────────────────────
// Each line opens the member list on that filter.

export function Accounts({ a }: { a: AdminData['accounts'] }) {
  const lines: { glyph: Glyph; label: string; n: number; sub: string; f: string }[] = [
    { glyph: 'paying', label: 'Paying', n: a.paying, sub: a.paying ? `about ${money(a.mrrCents)} a month at list price` : 'Nobody yet', f: 'paying' },
    { glyph: a.trialCancels ? 'trialx' : 'trial', label: 'On a trial', n: a.trial, sub: a.trialCancels ? `${a.trialCancels} cancelled, won't convert` : a.trial ? 'All set to convert' : 'None running', f: 'trial' },
    { glyph: 'comp', label: 'Comped', n: a.comped, sub: 'Full access, no Stripe', f: 'comp' },
    { glyph: 'canceled', label: 'Canceled', n: a.canceled, sub: 'Had a plan, not now', f: 'canceled' },
    { glyph: 'free', label: 'Free', n: a.free, sub: 'Never subscribed', f: 'free' },
  ]
  return (
    <ul className={s.ledger}>
      {lines.map((l) => (
        <li key={l.label}>
          <Link href={`/admin/?m=${l.f}#members`} className={s.ledgerRow}>
            <PlanGlyph k={l.glyph} />
            <span className={s.ledgerBody}>
              <span className={s.ledgerLabel}>{l.label}</span>
              <span className={s.ledgerSub}>{l.sub}</span>
            </span>
            <span className={s.ledgerN}>{l.n}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

// ── Signups ──────────────────────────────────────────────────────────────

/** The page each new account was on when they signed up, most first. Accounts
    from before this was tracked (2026-10-31) have no place, so aren't counted. */
export function SignupPlaces({ places }: { places: AdminData['signupPlaces'] }) {
  if (places.length === 0) return <p className={s.signupsEmpty}>New signups will show here, by the page they signed up from.</p>
  return (
    <ul className={s.signups}>
      {places.slice(0, 12).map((p) => (
        <li key={p.place}>
          <span>{p.place}</span>
          <b>{p.n}</b>
        </li>
      ))}
    </ul>
  )
}

// ── Library ──────────────────────────────────────────────────────────────
// Leagues with data only. The empty ones are counted on their own line, not
// in the total.

export function Library({ lib, nudge }: { lib: AdminData['library']; nudge: AdminData['followNudge'] }) {
  const peak = Math.max(1, ...lib.byPlatform.map((p) => p.n))
  return (
    <div className={s.library}>
      <div className={s.libHead}>
        <span className={s.libN}>{lib.withData}</span>
        <span className={s.libUnit}>leagues with data<br />{lib.published} published</span>
      </div>
      <ul className={s.platBars}>
        {lib.byPlatform.map((p) => (
          <li key={p.platform}>
            <span className={s.platName}>{PLATFORM_LABEL[p.platform] ?? p.platform}</span>
            <span className={s.platTrack}><span className={s.platFill} style={{ width: `${(p.n / peak) * 100}%` }} /></span>
            <span className={s.platN}>{p.n}</span>
          </li>
        ))}
      </ul>
      {lib.empty > 0 && (
        <a href="#empty" className={s.libEmpty}>
          {lib.empty} more never got any data{lib.emptyNfl ? `, ${lib.emptyNfl} of them NFL.com` : ''}
        </a>
      )}
      {nudge && (
        <div className={s.nudgeLine}>
          <span className={s.kicker}>Save-this-league card · 30 days</span>
          <span>
            {nudge.shown} shown · {nudge.tapped} tapped · {nudge.bookmarked} saved · {nudge.dismissed} waved off
          </span>
        </div>
      )}
    </div>
  )
}

// ── Rooms: the other admin pages ─────────────────────────────────────────

function RoomGlyph({ icon }: { icon: RoomIcon }) {
  const p = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (icon) {
    case 'return': return <svg {...p}><path d="M4 12a8 8 0 1 0 2.5-5.8" /><polyline points="4 4 4 8.5 8.5 8.5" /></svg>
    case 'pulse': return <svg {...p}><polyline points="3 12 7 12 10 5 14 19 17 12 21 12" /></svg>
    case 'social': return <svg {...p}><path d="M4 5h16v11H9l-5 4z" /></svg>
    case 'mail': return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="1.5" /><polyline points="3 7 12 13 21 7" /></svg>
    case 'star': return <svg {...p}><polygon points="12 3 14.8 9 21 9.6 16.3 13.8 17.7 20 12 16.8 6.3 20 7.7 13.8 3 9.6 9.2 9" /></svg>
    case 'cards': return <svg {...p}><rect x="4" y="7" width="12" height="14" rx="1.5" /><path d="M8 3h10.5A1.5 1.5 0 0 1 20 4.5V17" /></svg>
    case 'share': return <svg {...p}><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><line x1="8.2" y1="10.8" x2="15.8" y2="6.2" /><line x1="8.2" y1="13.2" x2="15.8" y2="17.8" /></svg>
  }
}

export function Rooms({ rooms }: { rooms: AdminData['rooms'] }) {
  return (
    <nav className={s.rooms} aria-label="Admin pages">
      {rooms.map((r) => (
        <Link key={r.href} href={r.href} className={s.room}>
          <span className={s.roomIcon}><RoomGlyph icon={r.icon} /></span>
          <span className={s.roomBody}>
            <span className={s.roomName}>{r.name} <em>{r.em}</em></span>
            <span className={s.roomStat}>{r.stat}</span>
          </span>
          <svg className={s.roomChev} width="8" height="13" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="1 1 7 7 1 13" />
          </svg>
        </Link>
      ))}
    </nav>
  )
}

// Audience exports for Resend broadcasts, confirmed addresses only.
export function Downloads() {
  const icon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="4" x2="12" y2="15" /><polyline points="7 10 12 15 17 10" /><line x1="5" y1="20" x2="19" y2="20" />
    </svg>
  )
  return (
    <div className={s.downloads}>
      <a href="/api/admin/audience" download className={s.dl}>{icon}Everyone (CSV)</a>
      <a href="/api/admin/audience?days=7" download className={s.dl}>{icon}Signups, last 7 days</a>
    </div>
  )
}

export function Section({ id, kicker, title, side, children, className }: {
  id?: string
  kicker: string
  title?: React.ReactNode
  side?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section id={id} className={`${s.panel} ${className ?? ''}`}>
      <header className={s.panelHead}>
        <div>
          <div className={s.kicker}>{kicker}</div>
          {title && <h2 className={s.panelTitle}>{title}</h2>}
        </div>
        {side && <div className={s.panelSide}>{side}</div>}
      </header>
      {children}
    </section>
  )
}

export function asOfLine(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET`
}
