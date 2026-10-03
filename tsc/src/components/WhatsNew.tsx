'use client'

// The "what's new" popup: a small card on desktop, a bottom sheet on a
// phone. Mounted on the dashboard and in the league setup layout, for
// league owners only. Whether it shows, and how often, is decided by
// /api/me/whats-new against the rules in lib/whatsNew.ts; this side only
// keeps a local copy of the answer so most page loads never ask.
//
// Add ?whatsnew to a dashboard or league setup URL to open it on demand,
// even after it has been seen.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { WHATS_NEW_ENDS_AT, WHATS_NEW_ID, type WhatsNewPayload, type WhatsNewResponse } from '@/lib/whatsNew'
import styles from './WhatsNew.module.css'

const API = '/api/me/whats-new/'

// The setup wizard a new league lands on, and Presentation mode, which
// takes over the screen. It waits for the next page instead.
const QUIET = [/^\/league\/[^/]+\/welcome/, /^\/league\/[^/]+\/present/]

type Local = {
  id: string
  n?: number
  at?: string
  done?: boolean
  // ISO time to ask again, or 'never'.
  skip?: string | null
}

function readLocal(key: string): Local | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as Local | null
    return v && v.id === WHATS_NEW_ID ? v : null
  } catch {
    return null
  }
}

function writeLocal(key: string, patch: Partial<Local>) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...(readLocal(key) ?? {}), ...patch, id: WHATS_NEW_ID }))
  } catch {
    // Private mode: the account copy on the server still holds the count.
  }
}

// Shown once here already, or the server said not to ask again yet.
function blockedLocally(s: Local | null, now: number): boolean {
  if (!s) return false
  if (s.done || s.skip === 'never' || (s.n ?? 0) >= 1) return true
  const skip = s.skip ? Date.parse(s.skip) : NaN
  return Number.isFinite(skip) && now < skip
}

const PAPER = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3.5" width="11" height="13" rx="1.2" />
    <path d="M14 7h2.5a.5.5 0 0 1 .5.5V15a1.5 1.5 0 0 1-1.5 1.5H4.5" />
    <path d="M5.5 6.5h6M5.5 9.5h6M5.5 12.5h4" />
  </svg>
)
// League setup: two sliders.
const SLIDERS = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.5 6h2.2M9.5 6h7M3.5 14h7.2M14.5 14h2" />
    <circle cx="7.6" cy="6" r="1.9" />
    <circle cx="12.6" cy="14" r="1.9" />
  </svg>
)
const PULSE = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 10.5h3.2l1.8-4.5 3 9 2-6 1.3 1.5h3.7" />
  </svg>
)
const CHEVRON = (
  <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 1 7 7 1 13" />
  </svg>
)

function record(action: 'shown' | 'done') {
  // keepalive: "done" usually fires from a link that is leaving the page.
  void fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
    keepalive: true,
  }).catch(() => {})
}

export function WhatsNew({ user, league, mobile }: { user: string; league: string | null; mobile: boolean }) {
  const pathname = usePathname()
  const quiet = QUIET.some((r) => r.test(pathname))
  const key = `tsc-whatsnew:${user}`

  const [payload, setPayload] = useState<WhatsNewPayload | null>(null)
  const [phase, setPhase] = useState<'closed' | 'open' | 'closing'>('closed')
  const [sheet, setSheet] = useState(mobile)
  const tried = useRef(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  // Ask once per mount, a beat after the page has painted, so it reads as
  // the site saying something rather than the page still loading.
  useEffect(() => {
    if (quiet || tried.current) return
    const now = Date.now()
    const force = new URLSearchParams(window.location.search).has('whatsnew')
    if (!force && (now >= WHATS_NEW_ENDS_AT || blockedLocally(readLocal(key), now))) return
    tried.current = true
    let live = true
    const timer = window.setTimeout(async () => {
      try {
        const qs = new URLSearchParams()
        if (league) qs.set('league', league)
        if (force) qs.set('force', '1')
        const res = await fetch(`${API}?${qs}`, { cache: 'no-store' })
        if (!res.ok || !live) return
        const r = (await res.json()) as WhatsNewResponse
        if (!live) return
        if (!r.show) {
          writeLocal(key, { skip: r.retry ?? 'never' })
          return
        }
        // Someone already typing into a field doesn't get interrupted; it
        // waits for their next visit.
        const busy = document.activeElement as HTMLElement | null
        if (busy && (/^(INPUT|TEXTAREA|SELECT)$/.test(busy.tagName) || busy.isContentEditable)) return
        returnFocus.current = busy
        setSheet(mobile || window.matchMedia('(max-width: 560px)').matches)
        setPayload(r.payload)
        setPhase('open')
        if (!force) {
          writeLocal(key, { n: (readLocal(key)?.n ?? 0) + 1, at: new Date().toISOString(), skip: null })
          record('shown')
        }
      } catch {
        // Offline, or signed out mid-request. Next visit asks again.
      }
    }, 900)
    return () => {
      live = false
      window.clearTimeout(timer)
      tried.current = false
    }
  }, [quiet, key, league, mobile])

  // It's a one-time card, so however it's closed (Got it, a link, the X,
  // the backdrop, Escape) it's done. The showing was already recorded when
  // it opened; this is a second write in case that one didn't land.
  const close = useCallback(() => {
    writeLocal(key, { done: true })
    record('done')
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPhase('closed')
    else setPhase('closing')
  }, [key])

  useEffect(() => {
    if (phase !== 'closing') return
    const t = window.setTimeout(() => setPhase('closed'), 200)
    return () => window.clearTimeout(t)
  }, [phase])

  // While it's up: the page underneath doesn't scroll, focus starts in the
  // card, Escape closes it, and focus goes back where it was afterwards.
  const isUp = phase !== 'closed'
  useEffect(() => {
    if (!isUp) return
    const html = document.documentElement
    const body = document.body
    const prev = [html.style.overflow, body.style.overflow]
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    cardRef.current?.focus({ preventScroll: true })
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      html.style.overflow = prev[0]
      body.style.overflow = prev[1]
      document.removeEventListener('keydown', onKey)
      const back = returnFocus.current
      if (back && document.contains(back)) back.focus({ preventScroll: true })
    }
  }, [isUp, close])

  function trapTab(e: React.KeyboardEvent) {
    if (e.key !== 'Tab' || !cardRef.current) return
    const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const at = document.activeElement
    if (e.shiftKey && (at === first || at === cardRef.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && at === last) {
      e.preventDefault()
      first.focus()
    }
  }

  if (!isUp || !payload) return null

  const { league: lg, full, recap } = payload
  const done = () => close()
  const recapHref = recap ? `/leagues/${lg.slug}/recap/${recap.year}/${recap.week}/` : null
  const weeklyHref = `/leagues/${lg.slug}/live/weekly/`
  const liveHref = `/leagues/${lg.slug}/live/`
  const setupHref = `/league/${lg.slug}/live`
  const demoHref = mobile ? '/demo-m/live/' : '/demo/live/'
  // The commish row leads with what they can do there. With no finished
  // week yet there's nothing to generate, so it points at the list instead.
  const setupTitle = recap ? 'Generate the recap' : 'Build your mailing list'

  const clip =
    recap && recapHref ? (
      <a className={styles.clip} href={recapHref} target="_blank" rel="noopener" onClick={done}>
        <span className={styles.clipKicker}>
          {lg.name} · Week {recap.week}
        </span>
        <span className={styles.clipHead}>{recap.headline ?? `Your week ${recap.week} paper is ready`}</span>
        <span className={styles.clipMore}>Read it</span>
      </a>
    ) : null

  // Phone: the mobile league hub's own controls. Each line is a tappable
  // row (icon tile, name, one line, chevron) instead of a paragraph with a
  // mono link under it, which read as a desktop page squeezed onto a phone.
  const sheetBody = (
    <div className={styles.body}>
      <p id="whatsnew-lede" className={styles.lede}>
        {"Your league's week as its own paper, every Tuesday morning."}
      </p>
      {clip}
      <div className={styles.list}>
        {full ? (
          <a className={styles.item} href={weeklyHref} target="_blank" rel="noopener" onClick={done}>
            <span className={styles.itemIcon} aria-hidden>
              {PAPER}
            </span>
            <span className={styles.itemBody}>
              <span className={styles.itemName}>The Weekly</span>
              <span className={styles.itemDesc}>Where the recap lives, under Live Season</span>
            </span>
            <span className={styles.itemArrow} aria-hidden>
              {CHEVRON}
            </span>
          </a>
        ) : (
          <div className={styles.item}>
            <span className={styles.itemIcon} aria-hidden>
              {PAPER}
            </span>
            <span className={styles.itemBody}>
              <span className={styles.itemName}>In your inbox</span>
              <span className={styles.itemDesc}>Every Tuesday. Free leagues get the short edition.</span>
            </span>
          </div>
        )}
        <Link className={styles.item} href={setupHref} onClick={done}>
          <span className={styles.itemIcon} aria-hidden>
            {SLIDERS}
          </span>
          <span className={styles.itemBody}>
            <span className={styles.itemName}>{setupTitle}</span>
            <span className={styles.itemDesc}>
              {recap
                ? 'In league setup under Current Season. Email a copy, add members to the mailing list.'
                : 'In league setup, before the first one goes out.'}
            </span>
          </span>
          <span className={styles.itemArrow} aria-hidden>
            {CHEVRON}
          </span>
        </Link>
        <a className={styles.item} href={full ? liveHref : demoHref} target="_blank" rel="noopener" onClick={done}>
          <span className={styles.itemIcon} aria-hidden>
            {PULSE}
          </span>
          <span className={styles.itemBody}>
            <span className={styles.itemName}>
              Live Season
              <span className={`${styles.badge} ${full ? styles.badgeOn : styles.badgePaid}`}>{full ? 'On' : 'Paid plans'}</span>
            </span>
            <span className={styles.itemDesc}>
              {full ? "Pick'ems, power rankings, previews and the trade desk" : "Pick'ems, power rankings and previews. Tap for a demo week."}
            </span>
          </span>
          <span className={styles.itemArrow} aria-hidden>
            {CHEVRON}
          </span>
        </a>
      </div>
    </div>
  )

  const cardBody = (
    <div className={styles.body}>
      <p id="whatsnew-lede" className={styles.lede}>
        {
          "Every Tuesday morning, your league's week comes out as its own paper: every score, the standings, records that fell and the games ahead."
        }
      </p>
      {clip}
      <ul className={styles.rows}>
        <li className={styles.row}>
          <span className={styles.icon} aria-hidden>
            {PAPER}
          </span>
          <div>
            <div className={styles.rowTitle}>Where to find it</div>
            <p className={styles.rowText}>
              {full
                ? 'In The Weekly, under Live Season, and in your inbox every Tuesday.'
                : 'In your inbox every Tuesday. Free leagues get the short edition; paid plans get the whole paper in The Weekly.'}
            </p>
            {full ? (
              <div className={styles.links}>
                <a className={styles.link} href={weeklyHref} target="_blank" rel="noopener" onClick={done}>
                  Open The Weekly
                </a>
              </div>
            ) : null}
          </div>
        </li>
        <li className={styles.row}>
          <span className={styles.icon} aria-hidden>
            {SLIDERS}
          </span>
          <div>
            <div className={styles.rowTitle}>{setupTitle}</div>
            <p className={styles.rowText}>
              {recap
                ? "It's in league setup under Current Season, where you can also email yourself a copy and add your members to the mailing list."
                : 'Under Current Season in league setup, add your members before the first one goes out.'}
            </p>
            <div className={styles.links}>
              <Link className={styles.link} href={setupHref} onClick={done}>
                Open Current Season
              </Link>
            </div>
          </div>
        </li>
      </ul>

      <section className={styles.live} aria-labelledby="whatsnew-live">
        <div className={styles.row}>
          <span className={styles.icon} aria-hidden>
            {PULSE}
          </span>
          <div>
            <div id="whatsnew-live" className={styles.rowTitle}>
              {full ? 'Live Season is on' : 'Live Season'}
              {full ? null : <span className={styles.tag}>Paid plans</span>}
            </div>
            <p className={styles.rowText}>
              {full
                ? `Pick'ems, power rankings, matchup previews and the trade desk, running for ${lg.name} every week.`
                : "Pick'ems, power rankings, matchup previews and the trade desk, every week of the season. See a sample week on the demo first."}
            </p>
            <div className={styles.links}>
              {full ? (
                <a className={styles.link} href={liveHref} target="_blank" rel="noopener" onClick={done}>
                  Open Live Season
                </a>
              ) : (
                <>
                  <a className={styles.link} href={demoHref} target="_blank" rel="noopener" onClick={done}>
                    See a demo week
                  </a>
                  <Link className={styles.link} href="/pricing" onClick={done}>
                    Plans
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )

  return createPortal(
    <div className={`${styles.root} ${sheet ? styles.sheet : ''} ${phase === 'closing' ? styles.closing : ''}`}>
      <div className={styles.backdrop} onClick={done} aria-hidden />
      <div
        ref={cardRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsnew-title"
        aria-describedby="whatsnew-lede"
        tabIndex={-1}
        onKeyDown={trapTab}
      >
        <header className={styles.head}>
          <div className={styles.eyebrow}>New this season</div>
          <h2 id="whatsnew-title" className={styles.title}>
            The Weekly Recap is live
          </h2>
          <button type="button" className={styles.x} onClick={done} aria-label="Close">
            <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden>
              <path d="M1.5 1.5l11 11M12.5 1.5l-11 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {sheet ? sheetBody : cardBody}

        <footer className={styles.foot}>
          <button type="button" className={styles.ok} onClick={done}>
            Got it
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
