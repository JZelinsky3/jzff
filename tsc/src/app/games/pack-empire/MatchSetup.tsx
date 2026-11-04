'use client'

// Starting a Versus or a Mega Draft. The format and the cards are two switches,
// and under them the table they make, as a card the way Empire Builder's picker
// shows one: what you picked, three cards dealt the way it deals them with you
// and your opponent either side, and the two ways to start. Play the CPU drops
// you straight in. Challenge a Friend opens a sheet: send it to a friend (their
// seat is held and it waits in their list), or make a link to copy and send to
// anyone, without leaving the page.

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DIFFICULTIES, DIFFICULTY_LOOK, type Difficulty, type Player } from '@/lib/packEmpire/rules'
import { SetupSwitch } from './SetupSwitch'
import { TableArt } from './TableArt'
import { ShareLink } from './share'

type Friend = { id: string; name: string }
type Option<F> = { id: F; label: string; line: string }

export function MatchSetup<F extends string>({
  kind,
  color,
  formats,
  format,
  onFormat,
  difficulty,
  onDifficulty,
  cardsLine,
  hands,
  tag,
  opponent,
  friends,
  signedIn,
  locked,
  extra,
  ready = true,
  busy,
  error,
  onCpu,
  onFriend,
  makeLink,
  roomLabel,
  linkLine,
  friendLine,
}: {
  /** The mode's name, over the card. */
  kind: string
  /** The mode's colour. */
  color: string
  formats: Option<F>[]
  format: F
  onFormat: (f: F) => void
  difficulty: Difficulty
  onDifficulty: (d: Difficulty) => void
  /** What the picked cards are, in this mode's words. */
  cardsLine: string
  /** Three cards per table, keyed format:difficulty. */
  hands: Record<string, Player[]>
  /** A line along the top of the felt. */
  tag?: string
  /** Under the right-hand seat. */
  opponent: string
  friends: Friend[]
  signedIn: boolean
  /** Takes the place of the buttons: a sign-in pitch where starting needs an account. */
  locked?: ReactNode
  /** Above the buttons: a signed-out name, say. */
  extra?: ReactNode
  /** Whether the buttons can go yet. */
  ready?: boolean
  busy: string | null
  error: string | null
  onCpu: () => void
  onFriend: (id: string) => void
  /** Opens the game without going to it, for the link. Returns its room's path. */
  makeLink: () => Promise<string | null>
  /** The button to the room once a link is made. */
  roomLabel: string
  linkLine: string
  friendLine: string
}) {
  const [sheet, setSheet] = useState(false)
  const picked = formats.find((f) => f.id === format) ?? formats[0]

  return (
    <section className="pe-sec">
      <div className="pe-sec-head">
        <span className="pe-sec-num">§ New Game</span>
        <span className="pe-sec-title">Set The Table</span>
      </div>

      <div className="pe-match" style={{ '--fc': color, '--fc-soft': `color-mix(in srgb, ${color} 10%, transparent)` } as React.CSSProperties}>
        <div className="pe-match-pick">
          <SetupSwitch label="Format" options={formats} value={format} onChange={onFormat} />
          <SetupSwitch
            label="Cards"
            square
            options={DIFFICULTIES.map((d) => ({ id: d, label: DIFFICULTY_LOOK[d].label }))}
            value={difficulty}
            onChange={onDifficulty}
          />
        </div>

        <article className="pe-bp-card pe-match-card">
          <div className="pe-bp-info">
            <header className="pe-bp-card-head">
              <span className="pe-bp-card-kick">{kind}</span>
              <h2>
                {picked.label} <em>{DIFFICULTY_LOOK[difficulty].label}</em>
              </h2>
              <dl className="pe-match-spec">
                <div>
                  <dt>Format</dt>
                  <dd>{picked.line}</dd>
                </div>
                <div>
                  <dt>Cards</dt>
                  <dd>{cardsLine}</dd>
                </div>
              </dl>
            </header>
            {extra}
            {locked ?? (
              <div className="pe-match-go">
                <button type="button" className="pe-push" onClick={onCpu} disabled={!!busy || !ready}>
                  {busy === 'cpu' ? 'Dealing' : 'Play the CPU'}
                </button>
                <button type="button" className="pe-push pe-push--steel" onClick={() => setSheet(true)} disabled={!!busy || !ready}>
                  Challenge a Friend
                </button>
              </div>
            )}
            {error && !sheet && <div className="pe-error">{error}</div>}
          </div>
          <TableArt
            key={`${format}:${difficulty}`}
            cards={hands[`${format}:${difficulty}`] ?? []}
            seats={['You', opponent]}
            tag={tag}
          />
        </article>
      </div>

      {sheet && (
        <ChallengeSheet
          title={`${kind} · ${picked.label} · ${DIFFICULTY_LOOK[difficulty].label}`}
          friends={friends}
          signedIn={signedIn}
          busy={busy}
          error={error}
          onFriend={onFriend}
          makeLink={makeLink}
          roomLabel={roomLabel}
          linkLine={linkLine}
          friendLine={friendLine}
          onClose={() => setSheet(false)}
        />
      )}
    </section>
  )
}

/** Who to play: a friend straight away, or a link for anyone. A sheet up from the
    bottom on a phone, a dialog in the middle on a desktop. Portalled into the
    room, so the game's colours come with it and nothing sticky sits over it. */
function ChallengeSheet({
  title,
  friends,
  signedIn,
  busy,
  error,
  onFriend,
  makeLink,
  roomLabel,
  linkLine,
  friendLine,
  onClose,
}: {
  title: string
  friends: Friend[]
  signedIn: boolean
  busy: string | null
  error: string | null
  onFriend: (id: string) => void
  makeLink: () => Promise<string | null>
  roomLabel: string
  linkLine: string
  friendLine: string
  onClose: () => void
}) {
  const [shown, setShown] = useState(false)
  const [path, setPath] = useState<string | null>(null)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true))
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', key)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', key)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function close() {
    setShown(false)
    window.setTimeout(onClose, 200)
  }

  const link = async () => {
    const made = await makeLink()
    if (made) setPath(made)
  }

  // Only ever mounted after a tap, so the page is there to portal into.
  return createPortal(
    <div className={`pe-csheet-bg${shown ? ' on' : ''}`} onClick={close}>
      <div
        className={`pe-csheet${shown ? ' on' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Challenge a friend"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pe-csheet-head">
          <span className="pe-csheet-kick">{title}</span>
          <h3>
            Challenge A <em>Friend</em>
          </h3>
          <button type="button" className="pe-ksheet-x" onClick={close} aria-label="Close">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        {signedIn && (
          <section className="pe-csheet-sec">
            <span className="pe-setup-label">Send It Straight To Them</span>
            {friends.length > 0 ? (
              <>
                <div className="pe-friend-picks" role="group" aria-label="Send it to a friend">
                  {friends.map((f) => (
                    <button key={f.id} type="button" className="pe-friend-pick" onClick={() => onFriend(f.id)} disabled={!!busy}>
                      <span className="pe-friend-pick-mono" aria-hidden>
                        {f.name.charAt(0).toUpperCase()}
                      </span>
                      {busy === `f:${f.id}` ? 'Sending' : f.name}
                    </button>
                  ))}
                </div>
                <p className="pe-setup-line">{friendLine}</p>
              </>
            ) : (
              <p className="pe-setup-line">
                No friends yet.{' '}
                <Link href="/games/pack-empire/profile/" className="pe-link">
                  Add some
                </Link>{' '}
                and it can go straight to them. A link works for anyone.
              </p>
            )}
          </section>
        )}

        <section className="pe-csheet-sec">
          <span className="pe-setup-label">{signedIn ? 'Or Send A Link' : 'Send A Link'}</span>
          {path ? (
            <>
              <ShareLink path={path} title="Pack Empire" text="Pack Empire: you're up" />
              <p className="pe-setup-line">It&apos;s open now and waits in your list. Send it, then take your seat.</p>
              <Link href={path} className="pe-push pe-csheet-go">
                {roomLabel}
              </Link>
            </>
          ) : (
            <>
              <p className="pe-setup-line">{linkLine}</p>
              <button type="button" className="pe-act pe-csheet-make" onClick={link} disabled={!!busy}>
                {busy === 'link' ? 'Making it' : 'Make a link'}
              </button>
            </>
          )}
        </section>

        {error && <div className="pe-error">{error}</div>}
      </div>
    </div>,
    document.querySelector('main.pe-theme') ?? document.body
  )
}
