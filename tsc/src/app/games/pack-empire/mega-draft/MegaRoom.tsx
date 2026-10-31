'use client'

// The Mega Draft room: the shared board in the middle, both elevens either
// side, and whoever is on the clock lit up. The server is the referee; this
// only asks it things. It polls while the draft is live, and a pick shows up
// for the other player on their next poll, about a second and a half later.
// Against the CPU, the room asks the server for the CPU's pick after a beat,
// so it plays at a person's pace rather than all at once.
//
// Phones get the board and the two elevens as three tabs under a sticky
// clock, because three columns at 390px is three unreadable columns.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MEGA_TOTAL_PICKS,
  POOL_KEYS,
  RARITY_LOOK,
  SLOTS,
  seasonLabel,
  shortName,
  tierFor,
  type Player,
  type PoolKey,
} from '@/lib/packEmpire/rules'
import type { MegaView } from '@/lib/packEmpire/mega'
import { DeleteGame } from '../GameList'
import { LineupSheet } from '../cards'
import { useFace, useFaces } from '../faces'
import { ShareButton, ShareLink } from '../share'
import { useStored } from '../clientStore'
import { forgetMega, megaKey, rememberMega } from './MegaLobby'

function PoolCard({
  player,
  state,
  takenBy,
  fresh,
  onPick,
}: {
  player: Player
  state: 'can' | 'wait' | 'full' | 'taken'
  takenBy: string | null
  fresh: boolean
  onPick: () => void
}) {
  const rc = RARITY_LOOK[player.rarity]
  const img = useFace(player)
  return (
    <button
      type="button"
      className={`pe-pc pe-pc--${state}${fresh ? ' fresh' : ''}`}
      style={{ '--rc': rc.color, '--rg': rc.glow, '--art': rc.art } as React.CSSProperties}
      onClick={state === 'can' ? onPick : undefined}
      disabled={state !== 'can'}
      aria-label={state === 'can' ? `Draft ${player.name}` : player.name}
    >
      <span className="pe-pc-top">
        <span className="pe-pc-pos" style={{ background: rc.color }}>
          {player.pos}
        </span>
        <span className="pe-pc-rar" style={{ color: rc.color }}>
          {rc.label}
        </span>
      </span>
      <span className="pe-pc-art" style={{ background: rc.art }}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="pe-pc-img" loading="lazy" />
        ) : (
          <span className="pe-pc-initial">{player.name.charAt(0)}</span>
        )}
        {state === 'taken' && <span className="pe-pc-taken">{takenBy ?? 'Drafted'}</span>}
      </span>
      <span className="pe-pc-body">
        <span className="pe-pc-name" style={{ color: rc.color }}>
          {shortName(player.name)}
        </span>
        <span className="pe-pc-team">{seasonLabel(player)}</span>
        <span className="pe-pc-score" style={{ color: rc.color }}>
          {player.score.toLocaleString()}
        </span>
      </span>
    </button>
  )
}

function Column({
  label,
  name,
  lineup,
  score,
  filled,
  picking,
  yours = false,
}: {
  label: string
  name: string | null
  lineup: (Player | null)[]
  score: number
  filled: number
  picking: boolean
  /** The viewer's own column. */
  yours?: boolean
}) {
  const tier = tierFor(score)
  const faces = useFaces()
  return (
    <div className={`pe-lc${picking ? ' picking' : ''}`}>
      <div className="pe-lc-head">
        {/* On one line, so a column doesn't grow when the clock lands on it. */}
        <span className="pe-lc-label">
          {label}
          {picking && <b> · {yours ? 'Your pick' : 'On the clock'}</b>}
        </span>
        <span className="pe-lc-name">{name ?? 'Open seat'}</span>
        <span className="pe-lc-score" style={{ color: tier.color }}>
          {score.toLocaleString()}
        </span>
        <span className="pe-lc-progress">
          {filled}/{SLOTS.length}
        </span>
      </div>
      <div className="pe-lc-slots">
        {SLOTS.map((s, i) => {
          const p = lineup[i]
          const rc = p ? RARITY_LOOK[p.rarity] : null
          return (
            <div
              key={s.key}
              className={`pe-lcs${p ? ' filled' : ''}`}
              style={rc ? ({ '--rc': rc.color } as React.CSSProperties) : undefined}
            >
              <span className="pe-lcs-pos" style={rc ? { background: rc.color } : undefined}>
                {s.short}
              </span>
              {p ? (
                <>
                  {(faces[p.id] ?? p.img) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={(faces[p.id] ?? p.img) as string} alt="" className="pe-lcs-img" />
                  ) : (
                    <span className="pe-lcs-initial">{p.name.charAt(0)}</span>
                  )}
                  <span className="pe-lcs-info">
                    <span className="pe-lcs-name" style={{ color: rc!.color }}>
                      {shortName(p.name)}
                    </span>
                    <span className="pe-lcs-score">{p.score.toLocaleString()}</span>
                  </span>
                </>
              ) : (
                <span className="pe-lcs-empty">·</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Which seats still need a position: empty slots left, yours and theirs. */
function posNeed(lineup: (Player | null)[], pos: PoolKey): number {
  return SLOTS.filter((s, i) => s.pool === pos && !lineup[i]).length
}

export function MegaRoom({
  initial,
  signedIn,
  canFriend = false,
}: {
  initial: MegaView
  signedIn: boolean
  /** Signed in, a real account in the other seat, and not friends yet. */
  canFriend?: boolean
}) {
  const [view, setViewRaw] = useState<MegaView>(initial)
  // A signed-out seat is this browser's key (one key for every Mega Draft it
  // sits at). The one made this visit wins until storage catches up.
  const storedKey = useStored('pe_mega_key')
  const [madeKey, setMadeKey] = useState<string | null>(null)
  const key = signedIn ? null : madeKey ?? storedKey
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'ALL' | PoolKey>('ALL')
  const [tab, setTab] = useState<'board' | 'you' | 'them'>('board')
  const [fresh, setFresh] = useState<string | null>(null)
  const lastCount = useRef(initial.picks.length)
  const freshTimer = useRef<number | null>(null)
  const id = view.id

  /** Every new view comes through here, so the newest pick can be lit up
      for a moment, whoever made it. */
  const setView = useCallback((v: MegaView) => {
    if (v.picks.length > lastCount.current) {
      setFresh(v.picks[v.picks.length - 1].id)
      if (freshTimer.current) window.clearTimeout(freshTimer.current)
      freshTimer.current = window.setTimeout(() => setFresh(null), 2200)
    }
    lastCount.current = v.picks.length
    setViewRaw(v)
  }, [])

  const refresh = useCallback(
    async (k: string | null) => {
      const q = new URLSearchParams({ id })
      if (k) q.set('key', k)
      const res = await fetch(`/api/games/pack-empire/mega/?${q}`, { cache: 'no-store' })
      const out = await res.json().catch(() => null)
      if (out?.ok) setView(out.view)
    },
    [id, setView]
  )

  // The server render couldn't see a signed-out seat's key, so ask again
  // with it.
  useEffect(() => {
    if (!storedKey || signedIn) return
    let cancelled = false
    void (async () => {
      const q = new URLSearchParams({ id: initial.id, key: storedKey })
      const res = await fetch(`/api/games/pack-empire/mega/?${q}`, { cache: 'no-store' })
      const out = await res.json().catch(() => null)
      if (!cancelled && out?.ok) setView(out.view)
    })()
    return () => {
      cancelled = true
    }
  }, [storedKey, signedIn, initial.id, setView])

  // Poll while there is anything to wait for.
  useEffect(() => {
    if (view.status === 'done') return
    const t = window.setInterval(() => refresh(key), view.status === 'live' ? 1500 : 3000)
    return () => window.clearInterval(t)
  }, [view.status, key, refresh])

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch('/api/games/pack-empire/mega/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, key, ...body }),
      })
      const out = await res.json().catch(() => null)
      if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Something went wrong.')
      return out
    },
    [id, key]
  )

  // The CPU on the clock: give it a beat, then ask for its pick. Keyed on the
  // pick number, so a snake turn of two asks twice.
  const cpuTurn = view.status === 'live' && view.botSeat != null && view.onClock === view.botSeat
  useEffect(() => {
    if (!cpuTurn) return
    const t = window.setTimeout(
      () => {
        post({ action: 'cpu' })
          .then((out) => setView(out.view))
          .catch(() => {})
      },
      900 + Math.floor(Math.random() * 700)
    )
    return () => window.clearTimeout(t)
  }, [cpuTurn, view.pickNo, post, setView])

  // "Add as a friend" off the result. A request, which they accept.
  const [friendNote, setFriendNote] = useState<string | null>(null)
  const addFriend = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/friends/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mega', id }),
      })
      const out = await res.json().catch(() => null)
      setFriendNote(out?.ok ? (out.message ?? 'Asked.') : (out?.error ?? 'Could not send that.'))
    } finally {
      setBusy(false)
    }
  }

  const router = useRouter()
  const againCpu = async () => {
    setBusy(true)
    setError(null)
    try {
      const mine = view.you != null ? view.seats[view.you].name : null
      const res = await fetch('/api/games/pack-empire/mega/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', cpu: true, name: mine ?? '', key }),
      })
      const out = await res.json().catch(() => null)
      if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Could not deal a new board.')
      rememberMega(out.id)
      router.push(`/games/pack-empire/mega-draft/${out.id}/`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not deal a new board.')
      setBusy(false)
    }
  }

  const join = async () => {
    setBusy(true)
    setError(null)
    try {
      const k = signedIn ? null : key ?? megaKey()
      if (k) setMadeKey(k)
      const res = await fetch('/api/games/pack-empire/mega/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', id, name, key: k }),
      })
      const out = await res.json().catch(() => null)
      if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Could not sit down.')
      rememberMega(id)
      setView(out.view)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sit down.')
    } finally {
      setBusy(false)
    }
  }

  const pick = async (p: Player) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const out = await post({ action: 'pick', player: p.id })
      setView(out.view)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That pick did not go through.')
      refresh(key)
    } finally {
      setBusy(false)
    }
  }

  const takenBy = useMemo(() => {
    const m = new Map<string, number>()
    for (const pk of view.picks) m.set(pk.id, pk.seat)
    return m
  }, [view.picks])

  const you = view.you
  const them = you == null ? null : you === 0 ? 1 : 0
  const yourTurn = view.status === 'live' && you != null && view.onClock === you
  const mineLineup = you != null ? view.seats[you].lineup : null

  const stateFor = (p: Player): 'can' | 'wait' | 'full' | 'taken' => {
    if (takenBy.has(p.id)) return 'taken'
    if (!yourTurn || !mineLineup) return 'wait'
    const open = SLOTS.some((s, i) => s.pool === p.pos && !mineLineup[i])
    return open ? 'can' : 'full'
  }

  const shown = view.board.filter((p) => filter === 'ALL' || p.pos === filter)

  /** What a position tab says: filled by you, contested, or yours alone to
      take whenever you like. Spectators get plain tabs. */
  const posState = (k: PoolKey): 'both' | 'mine' | 'filled' | null => {
    if (you == null || them == null) return null
    if (posNeed(view.seats[you].lineup, k) === 0) return 'filled'
    return posNeed(view.seats[them].lineup, k) > 0 ? 'both' : 'mine'
  }
  const seatName = (s: number) => view.seats[s].name ?? 'Open seat'

  // ── Waiting room ──────────────────────────────────────────────
  if (view.status === 'waiting') {
    return (
      <div className="pe-table pe-wrap--narrow">
        <div className="pe-table-head">
          <div className="pe-kicker">★ Mega Draft · {id} ★</div>
          <h1 className="pe-table-title">
            {view.hostName}&apos;s <span className="pe-em">board.</span>
          </h1>
          <p className="pe-table-sub">Thirty-six players, two seats, eleven picks each, snake order.</p>
        </div>
        {you === 0 ? (
          <div className="pe-panel">
            <div className="pe-kicker">{view.reservedFor ? `Held for ${view.reservedFor}` : 'Waiting for a second seat'}</div>
            <p className="pe-panel-text" style={{ margin: '0.5rem 0 0.9rem' }}>
              {view.reservedFor ? (
                <>
                  It&apos;s waiting in their Mega Drafts, and only they can sit down. Send them the link to get
                  them here faster.
                </>
              ) : (
                <>
                  Send the link, or read out the code{' '}
                  <b style={{ fontFamily: 'var(--mono)', letterSpacing: '0.2em' }}>{id}</b>.
                </>
              )}{' '}
              The coin for first pick is flipped the moment they sit down. This page updates by itself.
            </p>
            <ShareLink path={`/games/pack-empire/mega-draft/${id}/`} title="Pack Empire" text="Mega Draft: sit down" />
            <div style={{ marginTop: '0.9rem' }}>
              <DeleteGame
                api="/api/games/pack-empire/mega/"
                id={id}
                seatKey={key}
                label="Delete this draft"
                onGone={() => {
                  forgetMega(id)
                  router.push('/games/pack-empire/mega-draft/')
                }}
              />
            </div>
          </div>
        ) : view.canJoin ? (
          <div className="pe-panel">
            <div className="pe-kicker">An open seat</div>
            <div className="pe-panel-title">Draft against {view.hostName}.</div>
            {!signedIn && (
              <input
                className="pe-input"
                placeholder="Your name"
                value={name}
                maxLength={24}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && join()}
                style={{ margin: '0.6rem 0' }}
              />
            )}
            <button
              type="button"
              className="pe-btn"
              onClick={join}
              disabled={busy || (!signedIn && name.trim().length < 2)}
              style={{ marginTop: '0.5rem' }}
            >
              Sit down
            </button>
            {error && (
              <div className="pe-error" style={{ marginTop: '0.8rem' }}>
                {error}
              </div>
            )}
          </div>
        ) : view.reservedFor ? (
          <div className="pe-panel">
            <div className="pe-kicker">A friend draft</div>
            <div className="pe-panel-title">
              {view.hostName} sent this one to {view.reservedFor}.
            </div>
            <p className="pe-panel-text">
              {signedIn ? (
                'Open your own and send the code to someone.'
              ) : (
                <>
                  If that&apos;s you,{' '}
                  <Link href={`/login?next=${encodeURIComponent(`/games/pack-empire/mega-draft/${id}/`)}`} className="pe-link">
                    sign in
                  </Link>{' '}
                  and the seat is yours.
                </>
              )}
            </p>
            <div className="pe-recap-actions" style={{ justifyContent: 'flex-start' }}>
              <Link href="/games/pack-empire/mega-draft/" className="pe-btn pe-btn--quiet">
                Open your own
              </Link>
            </div>
          </div>
        ) : (
          <p className="pe-empty">Waiting for the draft to start.</p>
        )}
        <div className="pe-sec">
          <div className="pe-sec-head">
            <span className="pe-sec-num">§ The board</span>
            <span className="pe-sec-meta">{view.board.length} players</span>
          </div>
          <div className="pe-pool">
            {view.board.map((p) => (
              <PoolCard key={p.id} player={p} state="wait" takenBy={null} fresh={false} onPick={() => {}} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Final ─────────────────────────────────────────────────────
  if (view.status === 'done') {
    const [a, b] = view.seats
    const winner = a.score === b.score ? null : a.score > b.score ? 0 : 1
    const head =
      winner == null ? 'Dead even.' : you === winner ? 'You win.' : `${seatName(winner)} wins.`
    // Your own number goes green or red; theirs stays as it is.
    const tone = (seat: 0 | 1) =>
      you === seat && winner != null ? { color: winner === seat ? 'var(--pe-green)' : 'var(--pe-red)' } : undefined
    return (
      <div className="pe-table">
        <div className="pe-recap" style={{ '--tc': tierFor(Math.max(a.score, b.score)).color } as React.CSSProperties}>
          <div className="pe-kicker">§ Mega Draft · Final</div>
          <div className="pe-recap-tier">{head}</div>
          <div className="pe-recap-score pe-recap-score--pair">
            <span style={tone(0)}>{a.score.toLocaleString()}</span>{' '}
            <span style={{ color: 'var(--pe-ink-mute)' }}>·</span>{' '}
            <span style={tone(1)}>{b.score.toLocaleString()}</span>
          </div>
          <div className="pe-recap-lbl pe-note">
            {winner == null ? 'Not a point between them' : `By ${Math.abs(a.score - b.score).toLocaleString()} accolades`}
          </div>
          <div className="pe-recap-actions">
            {view.botSeat != null && you != null ? (
              <>
                <button type="button" className="pe-btn" onClick={againCpu} disabled={busy}>
                  Play the CPU again
                </button>
                <Link href="/games/pack-empire/mega-draft/" className="pe-btn pe-btn--quiet">
                  Another draft
                </Link>
              </>
            ) : (
              <Link href="/games/pack-empire/mega-draft/" className="pe-btn">
                Another draft
              </Link>
            )}
            {canFriend && !friendNote && them != null && (
              <button type="button" className="pe-btn pe-btn--quiet" onClick={addFriend} disabled={busy}>
                Add {seatName(them)} as a friend
              </button>
            )}
            <ShareButton
              path={`/games/pack-empire/mega-draft/${id}/`}
              text={winner == null ? 'Dead even on the Mega Draft.' : `${seatName(winner)} won the Mega Draft by ${Math.abs(a.score - b.score).toLocaleString()}.`}
            />
          </div>
          {friendNote && <p className="pe-recap-post">{friendNote}</p>}
          {error && <p className="pe-recap-post">{error}</p>}
        </div>
        <div className="pe-twoup">
          <LineupSheet name={seatName(0)} sub="Picked first" lineup={a.lineup} total={a.score} totalColor={tierFor(a.score).color} />
          <LineupSheet name={seatName(1)} sub="Picked second" lineup={b.lineup} total={b.score} totalColor={tierFor(b.score).color} />
        </div>
      </div>
    )
  }

  // ── Live ──────────────────────────────────────────────────────
  const clockName = view.onClock != null ? seatName(view.onClock) : ''
  const left = you ?? 0
  const right = them ?? 1

  return (
    <div className="pe-mega">
      <div className={`pe-clock${yourTurn ? ' yours' : ''}`}>
        <span className="pe-clock-pick">
          Pick {Math.min(view.pickNo + 1, MEGA_TOTAL_PICKS)} of {MEGA_TOTAL_PICKS}
        </span>
        <span className="pe-clock-who">
          {you == null ? `${clockName} is picking` : yourTurn ? 'Your pick' : `${clockName} is picking`}
        </span>
        <span className="pe-clock-score">
          {view.seats[left].score.toLocaleString()} · {view.seats[right].score.toLocaleString()}
        </span>
      </div>

      {error && (
        <div className="pe-error" style={{ margin: '0 0 0.8rem' }}>
          {error}
        </div>
      )}

      <div className="pe-mega-tabs" role="tablist">
        {(
          [
            ['board', 'Board'],
            ['you', you == null ? seatName(0) : 'Yours'],
            ['them', you == null ? seatName(1) : 'Theirs'],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`pe-mega-tab${tab === t ? ' on' : ''}`}
            onClick={() => setTab(t)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={`pe-mega-grid show-${tab}`}>
        <div className="pe-mega-you">
          <Column
            label={you == null ? 'Seat one' : 'You'}
            name={seatName(left)}
            lineup={view.seats[left].lineup}
            score={view.seats[left].score}
            filled={view.seats[left].filled}
            picking={view.onClock === left}
            yours={you != null}
          />
        </div>

        <div className="pe-mega-board">
          <div className="pe-filters">
            {(['ALL', ...POOL_KEYS] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`pe-filter${filter === k ? ' on' : ''}`}
                data-need={k === 'ALL' ? undefined : (posState(k) ?? undefined)}
                onClick={() => setFilter(k)}
              >
                {k === 'ALL' ? 'All' : k}
              </button>
            ))}
          </div>
          {you != null && (
            <div className="pe-need-key" aria-hidden>
              <span data-need="both">Both need</span>
              <span data-need="mine">Only you need</span>
              <span data-need="filled">You&apos;re full</span>
            </div>
          )}
          <div className="pe-pool">
            {shown.map((p) => (
              <PoolCard
                key={p.id}
                player={p}
                state={stateFor(p)}
                takenBy={takenBy.has(p.id) ? seatName(takenBy.get(p.id)!) : null}
                fresh={fresh === p.id}
                onPick={() => pick(p)}
              />
            ))}
          </div>
        </div>

        <div className="pe-mega-them">
          <Column
            label={you == null ? 'Seat two' : 'Them'}
            name={seatName(right)}
            lineup={view.seats[right].lineup}
            score={view.seats[right].score}
            filled={view.seats[right].filled}
            picking={view.onClock === right}
          />
        </div>
      </div>
    </div>
  )
}
