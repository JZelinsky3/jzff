'use client'

// One challenge, every state it can be in, for whoever opened the link:
//
//   nobody's seat yet   join it (an account's name, or a typed one)
//   your seat, drafting the captain draft, with the other side's status
//   you're done         your number, the link to send, and a wait
//   both done           the two lineups, side by side
//   not your challenge  the result, read-only
//
// A signed-out challenger's seat is a random key this browser keeps. Lose the
// browser and the seat is lost with it, which is the price of not needing an
// account to answer a link.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { tierFor } from '@/lib/packEmpire/rules'
import type { VersusView } from '@/lib/packEmpire/versus'
import { CaptainDraft, type DraftDone } from '../CaptainDraft'
import { DeleteGame } from '../GameList'
import { LineupSheet } from '../cards'
import { storageChanged, useStored } from '../clientStore'
import { ShareLink } from '../share'

const keyName = (id: string) => `pe_vs_key_${id}`

function makeKey(id: string): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  try {
    localStorage.setItem(keyName(id), key)
    storageChanged()
  } catch {
    // A private window: the seat lasts as long as the tab.
  }
  return key
}

async function call(body: Record<string, unknown>) {
  const res = await fetch('/api/games/pack-empire/versus/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => null)
  if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Something went wrong. Try again.')
  return out
}

export function VersusRoom({
  initial,
  signedIn,
  yourName,
  canFriend = false,
}: {
  initial: VersusView
  signedIn: boolean
  yourName: string | null
  /** Signed in, an account in the other seat, and not friends yet. */
  canFriend?: boolean
}) {
  const router = useRouter()
  const [view, setView] = useState<VersusView>(initial)
  // A signed-out challenger's seat is the key in this browser. The one made
  // this visit wins over a stored one only until storage catches up.
  const storedKey = useStored(keyName(initial.id))
  const [madeKey, setMadeKey] = useState<string | null>(null)
  const key = madeKey ?? storedKey
  const [guestName, setGuestName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = view.id

  const refresh = useCallback(
    async (k: string | null = key) => {
      const q = new URLSearchParams({ id })
      if (k) q.set('key', k)
      const res = await fetch(`/api/games/pack-empire/versus/?${q}`, { cache: 'no-store' })
      const out = await res.json().catch(() => null)
      if (out?.ok) setView(out.view)
    },
    [id, key]
  )

  // A signed-out challenger coming back: the server render couldn't see
  // their key, so ask again with it.
  useEffect(() => {
    if (!storedKey || signedIn) return
    let cancelled = false
    void (async () => {
      const q = new URLSearchParams({ id: initial.id, key: storedKey })
      const res = await fetch(`/api/games/pack-empire/versus/?${q}`, { cache: 'no-store' })
      const out = await res.json().catch(() => null)
      if (!cancelled && out?.ok) setView(out.view)
    })()
    return () => {
      cancelled = true
    }
  }, [storedKey, signedIn, initial.id])

  const mine = view.you === 'host' ? view.host : view.you === 'guest' ? view.guest : null
  const theirs = view.you === 'host' ? view.guest : view.you === 'guest' ? view.host : null
  const both = view.host.done && view.guest.done

  // Keep an eye on the other side while there is something to wait for.
  useEffect(() => {
    if (both) return
    const t = window.setInterval(() => refresh(), 6000)
    return () => window.clearInterval(t)
  }, [both, refresh])

  const join = async () => {
    setBusy(true)
    setError(null)
    try {
      const k = signedIn ? null : key ?? makeKey(id)
      if (k) setMadeKey(k)
      const out = await call({ action: 'join', id, name: guestName, key: k })
      setView(out.view)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join.')
    } finally {
      setBusy(false)
    }
  }

  const startSeed = useCallback(
    async (captain: number) => {
      const out = await call({ action: 'start', id, captain, key })
      return out.seed as string
    },
    [id, key]
  )

  // Held on to until it saves, so a dropped connection on the last pick is a
  // retry rather than a lost eleven.
  const [unsent, setUnsent] = useState<DraftDone | null>(null)

  const onDone = useCallback(
    async (run: DraftDone) => {
      setUnsent(run)
      setError(null)
      try {
        const out = await call({ action: 'submit', id, picks: run.picks, key })
        setView(out.view)
        setUnsent(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Your lineup did not save.')
      }
    },
    [id, key]
  )

  const rematch = async () => {
    setBusy(true)
    try {
      const out = await call({ action: 'create', ...(view.bot ? { cpu: true } : {}) })
      router.push(`/games/pack-empire/versus/${out.id}/`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start a rematch.')
      setBusy(false)
    }
  }

  // "Add as a friend" off the result. A request, which they accept.
  const [friendNote, setFriendNote] = useState<string | null>(null)
  const addFriend = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/friends/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'versus', id }),
      })
      const out = await res.json().catch(() => null)
      setFriendNote(out?.ok ? (out.message ?? 'Asked.') : (out?.error ?? 'Could not send that.'))
    } finally {
      setBusy(false)
    }
  }

  const path = `/games/pack-empire/versus/${id}/`
  const shareText = mine?.done && mine.score != null ? `Pack Empire: beat ${mine.score.toLocaleString()}` : 'Pack Empire: draft against me'

  const header = useMemo(() => {
    const host = view.host.name ?? 'Host'
    const guest = view.guest.name
    return (
      <div className="pe-table-head">
        <div className="pe-kicker">★ Versus Challenge ★</div>
        <h1 className="pe-table-title">
          {host} <span className="pe-em">vs</span> {guest ?? 'Anyone'}
        </h1>
      </div>
    )
  }, [view.host.name, view.guest.name])

  // ── Both in: the result ───────────────────────────────────────
  if (both) {
    const h = view.host
    const g = view.guest
    const hs = h.score ?? 0
    const gs = g.score ?? 0
    const winner = hs === gs ? null : hs > gs ? h : g
    const youWon = mine && winner === mine
    // Your own number goes green or red; theirs stays as it is.
    const tone = (seat: typeof h) =>
      mine === seat && winner ? { color: winner === seat ? 'var(--pe-green)' : 'var(--pe-red)' } : undefined
    return (
      <div className="pe-table">
        {header}
        <div className="pe-recap" style={{ '--tc': winner ? tierFor(Math.max(hs, gs)).color : '#bfb5a0' } as React.CSSProperties}>
          <div className="pe-kicker">§ Final</div>
          <div className="pe-recap-tier">
            {winner ? (mine ? (youWon ? 'You win.' : `${winner.name} wins.`) : `${winner.name} wins.`) : 'Dead even.'}
          </div>
          <div className="pe-recap-score pe-recap-score--pair">
            <span style={tone(h)}>{hs.toLocaleString()}</span>{' '}
            <span style={{ color: 'var(--pe-ink-mute)' }}>·</span>{' '}
            <span style={tone(g)}>{gs.toLocaleString()}</span>
          </div>
          <div className="pe-recap-lbl pe-note">
            {winner ? `By ${Math.abs(hs - gs).toLocaleString()} accolades` : 'Not a point between them'}
          </div>
          <div className="pe-recap-actions">
            {signedIn ? (
              <button type="button" className="pe-btn" onClick={rematch} disabled={busy}>
                {view.bot ? 'Play the CPU again' : 'New challenge'}
              </button>
            ) : (
              <Link href="/games/pack-empire/play/" className="pe-btn">
                Play solo
              </Link>
            )}
            <Link href="/games/pack-empire/versus/" className="pe-btn pe-btn--quiet">
              Your challenges
            </Link>
            {canFriend && !friendNote && theirs?.name && (
              <button type="button" className="pe-btn pe-btn--quiet" onClick={addFriend} disabled={busy}>
                Add {theirs.name} as a friend
              </button>
            )}
          </div>
          {friendNote && <p className="pe-recap-post">{friendNote}</p>}
          {error && <p className="pe-recap-post">{error}</p>}
        </div>
        <div className="pe-twoup">
          <LineupSheet name={h.name ?? 'Host'} sub={h.tier} lineup={h.lineup ?? []} total={hs} totalColor={tierFor(hs).color} />
          <LineupSheet name={g.name ?? 'Challenger'} sub={g.tier} lineup={g.lineup ?? []} total={gs} totalColor={tierFor(gs).color} />
        </div>
      </div>
    )
  }

  // ── A seat held for a friend, opened by someone signed out ────
  // Could be the friend on another device, so it asks them to sign in
  // rather than telling them it isn't theirs.
  if (!view.you && view.reserved && !signedIn) {
    return (
      <div className="pe-table pe-wrap--narrow">
        {header}
        <div className="pe-panel">
          <div className="pe-kicker">A friend challenge</div>
          <div className="pe-panel-title">{view.host.name} sent this one to {view.guest.name}.</div>
          <p className="pe-panel-text">
            If that&apos;s you, sign in and the seat is yours. If it isn&apos;t, start your own and send the link
            to someone.
          </p>
          <div className="pe-recap-actions" style={{ justifyContent: 'flex-start' }}>
            <Link href={`/login?next=${encodeURIComponent(path)}`} className="pe-btn">
              Sign in
            </Link>
            <Link href="/games/pack-empire/versus/" className="pe-btn pe-btn--quiet">
              Start your own
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Somebody else's challenge ─────────────────────────────────
  if (!view.you && !view.canJoin) {
    return (
      <div className="pe-table pe-wrap--narrow">
        {header}
        <div className="pe-panel">
          <div className="pe-kicker">{view.reserved ? 'A friend challenge' : 'In progress'}</div>
          <div className="pe-panel-title">
            {view.reserved ? `This one was sent to ${view.guest.name}.` : 'This one is already taken.'}
          </div>
          <p className="pe-panel-text">
            {view.reserved
              ? `${view.host.name} is waiting on them. Start your own and send the link to someone.`
              : `${view.host.name} and ${view.guest.name} are drafting. Start your own and send the link to someone.`}
          </p>
          <div className="pe-recap-actions" style={{ justifyContent: 'flex-start' }}>
            <Link href="/games/pack-empire/versus/" className="pe-btn">
              Start a challenge
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── An open seat ──────────────────────────────────────────────
  if (!view.you && view.canJoin) {
    return (
      <div className="pe-table pe-wrap--narrow">
        {header}
        <div className="pe-panel">
          <div className="pe-kicker">You have been challenged</div>
          <div className="pe-panel-title">
            {view.host.name} wants to see your eleven.
          </div>
          <p className="pe-panel-text">
            {view.host.done && view.host.score != null ? (
              <>
                They have already drafted, and put up <b>{view.host.score.toLocaleString()}</b>. You each open your
                own eleven packs; the bigger total wins.
              </>
            ) : (
              <>You each open your own eleven packs, one keeper from each. The bigger accolades total wins.</>
            )}
          </p>
          {signedIn ? (
            <div className="pe-recap-actions" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="pe-btn" onClick={join} disabled={busy}>
                Accept as {yourName ?? 'you'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.6rem', marginTop: '1rem', maxWidth: 420 }}>
              <input
                className="pe-input"
                placeholder="Your name"
                value={guestName}
                maxLength={24}
                onChange={(e) => setGuestName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && join()}
              />
              <button type="button" className="pe-btn" onClick={join} disabled={busy || guestName.trim().length < 2}>
                Accept the challenge
              </button>
              <p className="pe-note">
                No account needed.{' '}
                <Link className="pe-link" href={`/login?next=${encodeURIComponent(`/games/pack-empire/versus/${id}/`)}`}>
                  Sign in
                </Link>{' '}
                to keep it.
              </p>
            </div>
          )}
          {error && (
            <div className="pe-error" style={{ marginTop: '0.9rem' }}>
              {error}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Your seat ─────────────────────────────────────────────────
  // Sent out and nobody came: the host can take it back.
  const deletable = view.you === 'host' && view.status === 'open'
  const deleteIt = (
    <DeleteGame
      api="/api/games/pack-empire/versus/"
      id={id}
      label="Delete this challenge"
      onGone={() => router.push('/games/pack-empire/versus/')}
    />
  )
  const opponentLine = view.bot
    ? 'The CPU has its own eleven packs, dealt when this opened. It drafts the moment you lock yours in.'
    : !theirs?.name
    ? 'Nobody has taken the other seat yet. Send the link.'
    : view.reserved
      ? `Held for ${theirs.name}. It's waiting in their challenges, or send them the link.`
      : theirs.done
      ? `${theirs.name} is in with ${theirs.score?.toLocaleString()}.`
      : theirs.started
        ? `${theirs.name} is drafting.`
        : `${theirs.name} has the link and hasn't opened a pack yet.`

  if (mine && !mine.done) {
    return (
      <div className="pe-table">
        {header}
        <p className="pe-note" style={{ textAlign: 'center', marginBottom: '1rem' }}>
          {opponentLine}
        </p>
        {view.you === 'host' && (!view.guest.name || view.reserved) && (
          <div style={{ maxWidth: 620, margin: '0 auto 1.2rem' }}>
            <ShareLink path={path} title="Pack Empire" text={shareText} />
            {deletable && <div style={{ marginTop: '0.8rem' }}>{deleteIt}</div>}
          </div>
        )}
        {error && (
          <div className="pe-error" style={{ maxWidth: 560, margin: '0 auto 1rem' }}>
            {error}
            {unsent && (
              <>
                {' '}
                <button type="button" className="pe-btn pe-btn--sm" onClick={() => onDone(unsent)}>
                  Send it again
                </button>
              </>
            )}
          </div>
        )}
        <CaptainDraft saveKey={`pe_vs_${id}`} startSeed={startSeed} fixedSeed={view.yourSeed} onDone={onDone} />
      </div>
    )
  }

  // ── You're in; they aren't ────────────────────────────────────
  const myScore = mine?.score ?? 0
  return (
    <div className="pe-table pe-wrap--narrow">
      {header}
      <div className="pe-recap" style={{ '--tc': tierFor(myScore).color } as React.CSSProperties}>
        <div className="pe-kicker">§ Your eleven</div>
        <div className="pe-recap-tier">{mine?.tier}</div>
        <div className="pe-recap-score">{myScore.toLocaleString()}</div>
        <p className="pe-recap-post">{opponentLine} This page updates by itself.</p>
      </div>
      {view.you === 'host' && (!view.guest.name || view.reserved) && (
        <div className="pe-panel">
          <div className="pe-kicker">Send the link</div>
          <p className="pe-panel-text" style={{ margin: '0.5rem 0 0.9rem' }}>
            {view.reserved
              ? `The seat is held for ${view.guest.name}, so only they can take it.`
              : 'Whoever opens it first takes the other seat. No account needed on their end.'}
          </p>
          <ShareLink path={path} title="Pack Empire" text={shareText} />
          {deletable && <div style={{ marginTop: '0.9rem' }}>{deleteIt}</div>}
        </div>
      )}
    </div>
  )
}
