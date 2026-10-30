'use client'

// Games and friends on the profile, phone and desktop alike. Three tabs, so
// only one short list is ever on screen: your games, your friends, and every
// way of adding one. It was a dozen panels in one long column, with the
// invite link, the member code and the league suggestions all sat between
// your friends list and the rest of the page.
//
// It opens on Friends when something is waiting on you, and /account/#friends
// (the nav's link) always lands there.
//
// Every action posts to /api/friends and gets the whole list back, so the hub
// never has to reconcile its own guesses with the server.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useSyncExternalStore } from 'react'
import type { Friend, FriendsState } from '@/lib/friends'
import { h2hLine } from './h2h'
import styles from './play.module.css'

type Tab = 'games' | 'friends' | 'add'

const noop = () => () => {}

function useOrigin(): string {
  return useSyncExternalStore(noop, () => window.location.origin, () => '')
}

function subscribeHash(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

function useHash(): string {
  return useSyncExternalStore(subscribeHash, () => window.location.hash, () => '')
}

function initial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase()
}

async function post(body: Record<string, unknown>) {
  const res = await fetch('/api/friends/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => null)
  if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Something went wrong. Try again.')
  return out as { ok: true; state: FriendsState; message: string | null }
}

function Record({ text, tone }: { text: string; tone: 'lead' | 'trail' | null }) {
  return <span className={tone === 'lead' ? styles.lead : tone === 'trail' ? styles.trail : undefined}>{text}</span>
}

/** How many from a list show before "Show all". */
const SHORT_LIST = 3

export function PlayHub({
  initial: start,
  games,
  phone = false,
}: {
  initial: FriendsState
  /** The record book, rendered by the page. */
  games: React.ReactNode
  phone?: boolean
}) {
  const router = useRouter()
  const origin = useOrigin()
  const hash = useHash()
  const [state, setState] = useState(start)
  const [picked, setPicked] = useState<Tab | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  // A friend's row opens to show what you can do with them.
  const [open, setOpen] = useState<string | null>(null)
  // Unfriending is two taps: the first arms it, the second removes.
  const [arming, setArming] = useState<string | null>(null)
  const [allLeagues, setAllLeagues] = useState(false)

  const waitingCount = state.incoming.length + state.challenges.length
  const tab: Tab = picked ?? (hash === '#friends' || waitingCount > 0 ? 'friends' : 'games')

  const path = `/friends/${state.invite}/`
  const url = `${origin}${path}`

  const run = async (key: string, body: Record<string, unknown>) => {
    setBusy(key)
    setError(null)
    setNote(null)
    try {
      const out = await post(body)
      setState(out.state)
      if (out.message) setNote(out.message)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      return false
    } finally {
      setBusy(null)
      setArming(null)
    }
  }

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'The Sunday Chronicle', text: 'Add me on The Sunday Chronicle', url })
        return
      }
    } catch {
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // The link is on screen to copy by hand.
    }
  }

  const challenge = async (f: Friend) => {
    setBusy(`ch:${f.id}`)
    setError(null)
    try {
      const res = await fetch('/api/games/pack-empire/versus/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', friend: f.id }),
      })
      const out = await res.json().catch(() => null)
      if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Could not open a challenge.')
      router.push(`/games/pack-empire/versus/${out.id}/`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open a challenge.')
      setBusy(null)
    }
  }

  const addCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await run('code', { action: 'add', code })) setCode('')
  }

  const addRow = (who: { name: string; code: string }, sub: React.ReactNode, via: 'versus' | 'league') => (
    <div key={who.code} className={styles.row}>
      <span className={styles.mono} aria-hidden>
        {initial(who.name)}
      </span>
      <span className={styles.who}>
        <div className={styles.name}>{who.name}</div>
        <div className={styles.sub}>{sub}</div>
      </span>
      <button
        type="button"
        className={styles.btnGhost}
        disabled={!!busy}
        onClick={() => run(`a:${who.code}`, { action: 'add', code: who.code, via })}
      >
        {busy === `a:${who.code}` ? 'Asking' : 'Add'}
      </button>
    </div>
  )

  // ── Friends ─────────────────────────────────────────────────

  const waiting = waitingCount > 0 && (
    <div className={`${styles.panel} ${styles.panelHot}`}>
      <div className={styles.label}>
        Waiting on You <span>{waitingCount}</span>
      </div>
      {state.incoming.map((f) => (
        <div key={f.id} className={styles.row}>
          <span className={styles.mono} aria-hidden>
            {initial(f.name)}
          </span>
          <span className={styles.who}>
            <div className={styles.name}>{f.name}</div>
            <div className={styles.sub}>Wants to be friends</div>
          </span>
          <span className={styles.acts}>
            <button type="button" className={styles.btn} disabled={!!busy} onClick={() => run(`a:${f.id}`, { action: 'accept', id: f.id })}>
              Accept
            </button>
            <button type="button" className={styles.btnQuiet} disabled={!!busy} onClick={() => run(`r:${f.id}`, { action: 'remove', id: f.id })}>
              No
            </button>
          </span>
        </div>
      ))}
      {state.challenges.map((c) => (
        <div key={c.id} className={styles.row}>
          <span className={styles.mono} aria-hidden>
            {initial(c.from)}
          </span>
          <span className={styles.who}>
            <div className={styles.name}>{c.from}</div>
            <div className={styles.sub}>
              {c.kind === 'mega'
                ? 'Mega Draft · seat held'
                : `Challenge${c.score != null ? ` · beat ${c.score.toLocaleString()}` : ''}`}
            </div>
          </span>
          <Link
            href={c.kind === 'mega' ? `/games/pack-empire/mega-draft/${c.id}/` : `/games/pack-empire/versus/${c.id}/`}
            className={styles.btn}
          >
            Play
          </Link>
        </div>
      ))}
    </div>
  )

  const list = (
    <div className={styles.panel}>
      <div className={styles.label}>
        Your Friends <span>{state.friends.length || 'None yet'}</span>
      </div>
      {state.friends.length === 0 ? (
        <div className={styles.nothing}>
          <p>Nobody yet.</p>
          <button type="button" className={styles.btnGhost} onClick={() => setPicked('add')}>
            Add Friends
          </button>
        </div>
      ) : (
        state.friends.map((f) => {
          const h = h2hLine(f.h2h)
          const isOpen = open === f.id
          return (
            <div key={f.id} className={styles.friend}>
              <button
                type="button"
                className={styles.friendRow}
                aria-expanded={isOpen}
                onClick={() => {
                  setOpen(isOpen ? null : f.id)
                  setArming(null)
                }}
              >
                <span className={styles.mono} aria-hidden>
                  {initial(f.name)}
                </span>
                <span className={styles.who}>
                  <span className={styles.name}>{f.name}</span>
                </span>
                <span className={styles.rec}>
                  <Record text={h.text} tone={h.tone} />
                </span>
                <svg className={styles.caret} viewBox="0 0 12 8" width="10" height="7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M1.5 1.5 6 6l4.5-4.5" />
                </svg>
              </button>
              {isOpen && (
                <div className={styles.friendActs}>
                  {arming === f.id ? (
                    <>
                      <span>Remove {f.name}?</span>
                      <button type="button" className={styles.btnQuiet} disabled={!!busy} onClick={() => run(`r:${f.id}`, { action: 'remove', id: f.id })}>
                        Remove
                      </button>
                      <button type="button" className={styles.btnQuiet} onClick={() => setArming(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className={styles.btn} disabled={!!busy} onClick={() => challenge(f)}>
                        {busy === `ch:${f.id}` ? 'Opening' : 'Challenge'}
                      </button>
                      <button type="button" className={styles.btnQuiet} onClick={() => setArming(f.id)}>
                        Remove
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
      {state.outgoing.length > 0 && (
        <details className={styles.more}>
          <summary>
            {state.outgoing.length} {state.outgoing.length === 1 ? 'request' : 'requests'} sent
          </summary>
          {state.outgoing.map((f) => (
            <div key={f.id} className={styles.row}>
              <span className={styles.mono} aria-hidden>
                {initial(f.name)}
              </span>
              <span className={styles.who}>
                <div className={styles.name}>{f.name}</div>
              </span>
              <button type="button" className={styles.btnQuiet} disabled={!!busy} onClick={() => run(`r:${f.id}`, { action: 'remove', id: f.id })}>
                Cancel
              </button>
            </div>
          ))}
        </details>
      )}
    </div>
  )

  // ── Add ─────────────────────────────────────────────────────

  const leagues = allLeagues ? state.suggestions : state.suggestions.slice(0, SHORT_LIST)

  const people = (state.played.length > 0 || state.suggestions.length > 0) && (
    <div>
      {state.played.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.label}>
            People You&apos;ve Played <span>{state.played.length}</span>
          </div>
          {state.played.map((p) => addRow(p, <Record {...h2hLine(p.h2h)} />, 'versus'))}
        </div>
      )}
      {state.suggestions.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.label}>
            From Your Leagues <span>{state.suggestions.length}</span>
          </div>
          {leagues.map((s) => addRow(s, s.via, 'league'))}
          {!allLeagues && state.suggestions.length > SHORT_LIST && (
            <button type="button" className={styles.showAll} onClick={() => setAllLeagues(true)}>
              Show all {state.suggestions.length}
            </button>
          )}
        </div>
      )}
    </div>
  )

  const ways = (
    <div>
      <div className={styles.panel}>
        <div className={styles.label}>Your Invite Link</div>
        <p className={styles.hint}>Whoever opens it and says yes is your friend straight away.</p>
        <div className={styles.link}>
          <code>{url || path}</code>
          <button type="button" className={styles.btn} onClick={share}>
            {copied ? 'Copied' : phone ? 'Send' : 'Copy'}
          </button>
        </div>
        <button type="button" className={styles.resetLink} disabled={!!busy} onClick={() => run('reset', { action: 'reset-link' })}>
          Reset this link
        </button>
      </div>

      <div className={styles.panel}>
        <div className={styles.label}>Add by Member Code</div>
        <form className={styles.codeForm} onSubmit={addCode}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="7-character code"
            maxLength={9}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            aria-label="Member code"
          />
          <button type="submit" className={styles.btnGhost} disabled={!!busy || code.trim().length < 7}>
            {busy === 'code' ? 'Asking' : 'Ask'}
          </button>
        </form>
      </div>
    </div>
  )

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'games', label: 'Games' },
    { id: 'friends', label: 'Friends', count: waitingCount },
    { id: 'add', label: 'Add Friends' },
  ]

  return (
    <div className={phone ? styles.phone : undefined}>
      <div className={styles.tabs} role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`${styles.tab}${tab === t.id ? ` ${styles.tabOn}` : ''}`}
            onClick={() => {
              setPicked(t.id)
              setNote(null)
              setError(null)
            }}
          >
            {t.label}
            {t.count ? <span className={styles.tabCount}>{t.count}</span> : null}
          </button>
        ))}
      </div>

      {note && <p className={styles.note}>{note}</p>}
      {error && <p className={styles.err}>{error}</p>}

      {tab === 'games' && games}

      {tab === 'friends' && (
        <div className={waiting ? styles.pair : undefined}>
          {waiting}
          {list}
        </div>
      )}

      {tab === 'add' && (
        <div className={people ? styles.pair : undefined}>
          {people}
          {ways}
        </div>
      )}
    </div>
  )
}
