'use client'

// Client pieces of the Newsstand: the live league search (debounced,
// spinner while in flight) and the bookmark star + copy-link buttons.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { HubSpinner } from '../spinner'

// ── Demo bookmark (localStorage) ─────────────────────────────────────────
// The demo almanac has no league row, so its bookmark ribbon (on /demo/)
// persists to localStorage instead of the bookmarks API. These hooks/cards
// read the same key so the demo shows up on Your Shelf like a real
// bookmark. useSyncExternalStore keeps SSR + hydration consistent (server
// snapshot is always false; the card appears client-side).
const DEMO_BM_KEY = 'tsc-demo-bookmark'

function subscribeStorage(cb: () => void) {
  window.addEventListener('storage', cb)
  return () => window.removeEventListener('storage', cb)
}

function useDemoBookmark(): boolean {
  return useSyncExternalStore(
    subscribeStorage,
    () => {
      try {
        return localStorage.getItem(DEMO_BM_KEY) === '1'
      } catch {
        return false
      }
    },
    () => false
  )
}

export function DemoShelfCard() {
  const stored = useDemoBookmark()
  const [removed, setRemoved] = useState(false)
  if (!stored || removed) return null

  function remove(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    try {
      localStorage.removeItem(DEMO_BM_KEY)
    } catch {
      /* ignore */
    }
    setRemoved(true)
  }

  return (
    <a href="/demo/" target="_blank" rel="noopener" className="hub-shelf-card" style={{ borderStyle: 'dashed' }}>
      <div className="hub-shelf-top">
        <span>Tour</span>
        <button
          className="hub-bm-btn on"
          onClick={remove}
          title="Remove bookmark"
          aria-label="Remove demo bookmark"
        >
          <StarIcon filled />
        </button>
      </div>
      <div className="hub-shelf-name">The Lakeside League</div>
      <div className="hub-shelf-sub">Demo almanac · bookmarked on the demo page</div>
    </a>
  )
}

export function EmptyShelfHint() {
  const hasDemo = useDemoBookmark()
  if (hasDemo) return null
  return (
    <p
      style={{
        textAlign: 'center', maxWidth: '520px', margin: '0 auto',
        fontFamily: 'var(--serif)', fontStyle: 'italic',
        fontSize: '1.05rem', lineHeight: 1.6, color: 'var(--hb-mute)',
      }}
    >
      Nothing on your shelf yet. Tap the ★ on any almanac above and it&apos;ll wait for you
      here — and on your dashboard.
    </p>
  )
}

type SearchResult = {
  name: string
  slug: string
  platform: string
  seasons: number
  firstYear: number | null
  latestYear: number | null
  bookmarked: boolean
  own: boolean
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.4l-5.8 3 1.1-6.4L2.6 9.4l6.5-.9L12 2.6z" />
    </svg>
  )
}

export function BookmarkStar({
  slug,
  initial,
  disabled = false,
  title,
}: {
  slug: string
  initial: boolean
  disabled?: boolean
  title?: string
}) {
  const [on, setOn] = useState(initial)
  const [busy, setBusy] = useState(false)

  async function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy || disabled) return
    setBusy(true)
    const next = !on
    setOn(next) // optimistic — revert on failure
    try {
      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, action: next ? 'add' : 'remove' }),
      })
      if (!res.ok) setOn(!next)
    } catch {
      setOn(!next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      className={`hub-bm-btn${on ? ' on' : ''}`}
      onClick={toggle}
      disabled={disabled}
      title={title ?? (disabled ? 'This is your league' : on ? 'Remove bookmark' : 'Bookmark this almanac')}
      aria-label={on ? 'Remove bookmark' : 'Add bookmark'}
      aria-pressed={on}
      style={disabled ? { opacity: 0.35, cursor: 'default' } : undefined}
    >
      <StarIcon filled={on} />
    </button>
  )
}

export function LeagueSearch({ signedIn = true }: { signedIn?: boolean }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)

  // Clear any pending debounce on unmount so a late fetch can't set state.
  useEffect(() => {
    const seqRef = seq
    const timerRef = timer
    return () => {
      seqRef.current++
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  function onQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setQ(value)
    if (timer.current) clearTimeout(timer.current)
    const query = value.trim()
    const mySeq = ++seq.current
    if (query.length < 2) {
      setResults(null)
      setLoading(false)
      return
    }
    setLoading(true)
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/hub/search?q=${encodeURIComponent(query)}`)
        const json = await res.json()
        if (seq.current === mySeq) setResults(json.results ?? [])
      } catch {
        if (seq.current === mySeq) setResults([])
      } finally {
        if (seq.current === mySeq) setLoading(false)
      }
    }, 320)
  }

  return (
    <div className="hub-search">
      <div className="hub-search-box">
        <svg className="hub-search-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <line x1="15.5" y1="15.5" x2="21" y2="21" />
        </svg>
        <input
          className="hub-search-input"
          value={q}
          onChange={onQueryChange}
          placeholder="Search the public almanacs…"
          aria-label="Search published leagues"
          autoComplete="off"
          spellCheck={false}
        />
        {loading && (
          <span className="hub-search-spin">
            <HubSpinner size={26} />
          </span>
        )}
      </div>

      {results !== null && (
        <div className="hub-search-results">
          {results.length === 0 && !loading ? (
            <div className="hub-search-empty">
              Nothing on the rack by that name — yet. Almanacs appear here once their
              commissioner publishes them.
            </div>
          ) : (
            results.map((r, i) => (
              <a
                key={r.slug}
                href={`/leagues/${r.slug}/`}
                className="hub-result"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <span className="hub-result-letter">{r.name.charAt(0).toUpperCase()}</span>
                <span>
                  <div className="hub-result-name">{r.name}</div>
                  <div className="hub-result-sub">
                    {r.platform}
                    {r.seasons > 0 && (
                      <>
                        {' '}· {r.seasons} {r.seasons === 1 ? 'season' : 'seasons'}
                        {r.firstYear && r.latestYear && r.firstYear !== r.latestYear
                          ? ` · ${r.firstYear}–${r.latestYear}`
                          : r.firstYear
                            ? ` · ${r.firstYear}`
                            : ''}
                      </>
                    )}
                    {r.own && ' · yours'}
                  </div>
                </span>
                <BookmarkStar
                  slug={r.slug}
                  initial={r.bookmarked}
                  disabled={r.own || !signedIn}
                  title={!signedIn ? 'Sign in to bookmark' : undefined}
                />
                <span className="hub-result-open">Open →</span>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// Per-league promotion editor for the "Put yours on the rack" panel.
// Pitch + optional recruiting link → POST /api/hub/promote, then refresh
// the server-rendered board so the new listing shows immediately.
export function PromoteForm({
  leagueId,
  leagueName,
  slug,
  promoted,
  initialText,
  initialLink,
}: {
  leagueId: string
  leagueName: string
  slug: string
  promoted: boolean
  initialText: string
  initialLink: string
}) {
  const router = useRouter()
  const [text, setText] = useState(initialText)
  const [link, setLink] = useState(initialLink)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(action: 'set' | 'clear') {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/hub/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'set'
            ? { leagueId, action, text, link: link.trim() || undefined }
            : { leagueId, action }
        ),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg({ ok: false, text: json.error ?? 'Something went wrong.' })
      } else {
        if (action === 'clear') {
          setText('')
          setLink('')
        }
        setMsg({ ok: true, text: action === 'set' ? 'On the board — see it above.' : 'Taken down.' })
        router.refresh()
      }
    } catch {
      setMsg({ ok: false, text: 'Network hiccup — try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hub-promo-card">
      <div className="hub-promo-card-head">
        <span className="hub-promo-card-name">{leagueName}</span>
        {promoted && <span className="hub-promo-live">● On the board</span>}
      </div>
      <div className="hub-copy-row">
        <span className="hub-copy-url">jzff.online/leagues/{slug}/</span>
        <CopyLinkButton url={`https://jzff.online/leagues/${slug}/`} />
      </div>
      <textarea
        className="hub-textarea"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 280))}
        placeholder="Pitch your league — what makes it worth following? Looking for new managers? Say so."
        rows={3}
        maxLength={280}
      />
      <input
        className="hub-input"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="Optional link — invite URL, Discord, contact… (https://)"
        maxLength={300}
        inputMode="url"
      />
      <div className="hub-promo-card-actions">
        <button className="hub-btn" onClick={() => submit('set')} disabled={busy} style={{ padding: '.6rem 1.1rem' }}>
          {busy ? 'Working…' : promoted ? 'Update listing' : 'Promote it →'}
        </button>
        {promoted && (
          <button className="hub-btn-ghost" onClick={() => submit('clear')} disabled={busy} style={{ padding: '.6rem 1.1rem' }}>
            Take down
          </button>
        )}
        <span className="hub-promo-count">{text.length}/280</span>
      </div>
      {msg && (
        <div className={`hub-promo-msg${msg.ok ? ' ok' : ' err'}`}>{msg.text}</div>
      )}
    </div>
  )
}

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard blocked — leave the URL visible for manual copy.
    }
  }
  return (
    <button className="hub-copy-btn" onClick={copy}>
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}
