'use client'

// Friends, on the profile. Desktop lays it out as two columns (who you have,
// and how to add more); the phone stacks it with anything waiting on you at
// the top.
//
// Every action posts to /api/friends and gets the whole list back, so the
// panel never has to reconcile its own guesses with the server.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useSyncExternalStore } from 'react'
import type { Friend, FriendsState, HeadToHead } from '@/lib/friends'
import styles from './play.module.css'

const noop = () => () => {}

function useOrigin(): string {
  return useSyncExternalStore(noop, () => window.location.origin, () => '')
}

function initial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase()
}

function h2hLine(h: HeadToHead | null): { text: string; tone: 'lead' | 'trail' | null } {
  if (!h) return { text: "Haven't played yet", tone: null }
  const rec = h.t ? `${h.w}-${h.l}-${h.t}` : `${h.w}-${h.l}`
  if (h.w > h.l) return { text: `You lead ${rec}`, tone: 'lead' }
  if (h.w < h.l) return { text: `You trail ${rec}`, tone: 'trail' }
  return { text: `Level at ${rec}`, tone: null }
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

export function FriendsPanel({ initial: start, phone = false }: { initial: FriendsState; phone?: boolean }) {
  const router = useRouter()
  const origin = useOrigin()
  const [state, setState] = useState(start)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  // Unfriending is two taps: the first arms the row, the second removes.
  const [arming, setArming] = useState<string | null>(null)

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

  // ── Pieces ──────────────────────────────────────────────────

  const waiting = (state.incoming.length > 0 || state.challenges.length > 0) && (
    <div className={`${styles.panel} ${styles.panelHot}`}>
      <div className={styles.label}>
        Waiting on You <span>{state.incoming.length + state.challenges.length}</span>
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
              Decline
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
              Pack Empire challenge{c.score != null ? ` · beat ${c.score.toLocaleString()}` : ''}
            </div>
          </span>
          <span className={styles.acts}>
            <Link href={`/games/pack-empire/versus/${c.id}/`} className={styles.btn}>
              Play
            </Link>
          </span>
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
        <p className={styles.nothing}>
          Nobody yet. Send your link to the group chat and everyone who opens it lands here.
        </p>
      ) : (
        state.friends.map((f) => {
          const h = h2hLine(f.h2h)
          return (
            <div key={f.id} className={styles.row}>
              <span className={styles.mono} aria-hidden>
                {initial(f.name)}
              </span>
              <span className={styles.who}>
                <div className={styles.name}>{f.name}</div>
                <div className={styles.sub}>
                  <span className={h.tone === 'lead' ? styles.lead : h.tone === 'trail' ? styles.trail : undefined}>
                    {h.text}
                  </span>
                </div>
              </span>
              <span className={styles.acts}>
                {arming === f.id ? (
                  <>
                    <button type="button" className={styles.btnQuiet} disabled={!!busy} onClick={() => run(`r:${f.id}`, { action: 'remove', id: f.id })}>
                      Remove
                    </button>
                    <button type="button" className={styles.btnQuiet} onClick={() => setArming(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className={styles.btnGhost} disabled={!!busy} onClick={() => challenge(f)}>
                      {busy === `ch:${f.id}` ? 'Opening' : 'Challenge'}
                    </button>
                    <button type="button" className={styles.x} aria-label={`Remove ${f.name}`} title="Remove" onClick={() => setArming(f.id)}>
                      <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                        <path d="M2 2l8 8M10 2l-8 8" />
                      </svg>
                    </button>
                  </>
                )}
              </span>
            </div>
          )
        })
      )}
      {state.outgoing.length > 0 && (
        <>
          <div className={styles.label} style={{ marginTop: '.9rem' }}>
            Asked <span>{state.outgoing.length}</span>
          </div>
          {state.outgoing.map((f) => (
            <div key={f.id} className={styles.row}>
              <span className={styles.mono} aria-hidden>
                {initial(f.name)}
              </span>
              <span className={styles.who}>
                <div className={styles.name}>{f.name}</div>
                <div className={styles.sub}>Hasn&apos;t answered yet</div>
              </span>
              <span className={styles.acts}>
                <button type="button" className={styles.btnQuiet} disabled={!!busy} onClick={() => run(`r:${f.id}`, { action: 'remove', id: f.id })}>
                  Cancel
                </button>
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  )

  const add = (
    <div>
      <div className={styles.panel}>
        <div className={styles.label}>Your Invite Link</div>
        <p className={styles.hint}>
          Whoever opens it and says yes is your friend straight away. Drop it in the group chat.
        </p>
        <div className={styles.link}>
          <code>{url || path}</code>
          <button type="button" className={styles.btn} onClick={share}>
            {copied ? 'Copied' : phone ? 'Send' : 'Copy'}
          </button>
        </div>
        <p className={styles.hint}>
          Link out in the wild?{' '}
          <button type="button" disabled={!!busy} onClick={() => run('reset', { action: 'reset-link' })}>
            Reset it
          </button>{' '}
          and the old one stops working.
        </p>
      </div>

      {state.suggestions.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.label}>
            From Your Leagues <span>{state.suggestions.length}</span>
          </div>
          {state.suggestions.map((s) => (
            <div key={s.code} className={styles.row}>
              <span className={styles.mono} aria-hidden>
                {initial(s.name)}
              </span>
              <span className={styles.who}>
                <div className={styles.name}>{s.name}</div>
                <div className={styles.sub}>{s.via}</div>
              </span>
              <span className={styles.acts}>
                <button type="button" className={styles.btnGhost} disabled={!!busy} onClick={() => run(`s:${s.code}`, { action: 'add', code: s.code, via: 'league' })}>
                  {busy === `s:${s.code}` ? 'Asking' : 'Add'}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.panel}>
        <div className={styles.label}>Add by Member Code</div>
        <form className={styles.codeForm} onSubmit={addCode}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Their 7-character code"
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
        <p className={styles.hint}>They get a request on their profile. Your own code is on your card.</p>
      </div>
    </div>
  )

  const messages = (
    <>
      {note && <p className={styles.note}>{note}</p>}
      {error && <p className={styles.err}>{error}</p>}
    </>
  )

  if (phone) {
    return (
      <div className={styles.phone}>
        <div className={styles.friends}>
          {waiting}
          {list}
          {messages}
          {add}
        </div>
      </div>
    )
  }

  return (
    <>
      {(note || error) && <div style={{ marginBottom: '1rem' }}>{messages}</div>}
      <div className={styles.friends}>
        <div>
          {waiting && <div style={{ marginBottom: '1rem' }}>{waiting}</div>}
          {list}
        </div>
        <div>{add}</div>
      </div>
    </>
  )
}
