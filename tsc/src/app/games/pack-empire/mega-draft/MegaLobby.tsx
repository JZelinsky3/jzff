'use client'

// Open a Mega Draft, or sit down at one by its code. Either seat works
// signed out: the browser keeps a seat key, and the drafts it has sat at are
// remembered here so they can be found again from this device. Opening one is
// MatchSetup, the same card as Versus.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { DIFFICULTY_LOOK, MEGA_FORMATS, MEGA_FORMAT_LOOK, type Difficulty, type MegaFormat, type Player } from '@/lib/packEmpire/rules'
import { MatchSetup } from '../MatchSetup'
import { storageChanged, useStored } from '../clientStore'

const KEY = 'pe_mega_key'
const MINE = 'pe_mega_mine'

export function megaKey(): string {
  try {
    const k = localStorage.getItem(KEY)
    if (k) return k
  } catch {
    // fall through to a fresh one
  }
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const k = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  try {
    localStorage.setItem(KEY, k)
    storageChanged()
  } catch {
    // a private window: the seat lasts as long as the tab
  }
  return k
}

export function rememberMega(id: string) {
  try {
    const list = JSON.parse(localStorage.getItem(MINE) || '[]') as string[]
    localStorage.setItem(MINE, JSON.stringify([id, ...list.filter((x) => x !== id)].slice(0, 12)))
    storageChanged()
  } catch {
    // nothing to remember it in
  }
}

export function forgetMega(id: string) {
  try {
    const list = JSON.parse(localStorage.getItem(MINE) || '[]') as string[]
    localStorage.setItem(MINE, JSON.stringify(list.filter((x) => x !== id)))
    storageChanged()
  } catch {
    // nothing to forget it from
  }
}

function parseMine(raw: string | null): string[] {
  try {
    const list = JSON.parse(raw || '[]')
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** What the felt says along the top, per format. */
const TAG: Record<MegaFormat, string> = {
  classic: 'One board of thirty-six',
  chem: 'Real teammates stack',
  battles: 'Three Battles, +1,500 each',
}

const room = (id: string) => `/games/pack-empire/mega-draft/${id}/`

export function MegaLobby({
  signedIn,
  friends = [],
  hands,
}: {
  signedIn: boolean
  friends?: { id: string; name: string }[]
  /** Three cards per table for the setup card, keyed format:difficulty. */
  hands: Record<string, Player[]>
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [format, setFormat] = useState<MegaFormat>('classic')
  const [difficulty, setDifficulty] = useState<Difficulty>('open')
  const stored = useStored(MINE)
  const mine = signedIn ? [] : parseMine(stored)
  const named = signedIn || name.trim().length >= 2

  /** Deals the board and returns its code. */
  const deal = async (extra: Record<string, unknown>): Promise<string> => {
    const res = await fetch('/api/games/pack-empire/mega/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', name, key: signedIn ? null : megaKey(), format, difficulty, ...extra }),
    })
    const out = await res.json().catch(() => null)
    if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Could not open a draft.')
    rememberMega(out.id)
    return out.id as string
  }

  const create = async (tag: string, extra: Record<string, unknown> = {}) => {
    setBusy(tag)
    setError(null)
    try {
      router.push(room(await deal(extra)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open a draft.')
      setBusy(null)
    }
  }

  const makeLink = async () => {
    setBusy('link')
    setError(null)
    try {
      return room(await deal({}))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open a draft.')
      return null
    } finally {
      setBusy(null)
    }
  }

  const clean = code.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6)
  const cardsLine =
    difficulty === 'cap'
      ? 'Every card has a salary and each seat a budget. When you can’t pay anyone you need, the cheapest signs free.'
      : difficulty === 'open'
        ? 'Every card face up: value, rarity and stats.'
        : `${DIFFICULTY_LOOK[difficulty].line} The values come up after the last pick.`

  return (
    <>
      <MatchSetup
        kind="Mega Draft"
        color="#5fb3e8"
        formats={MEGA_FORMATS.map((f) => ({ id: f, label: MEGA_FORMAT_LOOK[f].label, line: MEGA_FORMAT_LOOK[f].line }))}
        format={format}
        onFormat={setFormat}
        difficulty={difficulty}
        onDifficulty={setDifficulty}
        cardsLine={cardsLine}
        hands={hands}
        tag={TAG[format]}
        opponent="Them"
        friends={friends}
        signedIn={signedIn}
        extra={
          signedIn ? undefined : (
            <label className="pe-mega-name">
              <span className="pe-note">Your name at the table</span>
              <input className="pe-input" placeholder="Your name" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
            </label>
          )
        }
        ready={named}
        busy={busy}
        error={error}
        onCpu={() => create('cpu', { cpu: true })}
        onFriend={(id) => create(`f:${id}`, { friend: id })}
        makeLink={makeLink}
        roomLabel="Go to the table"
        linkLine="Whoever opens it first sits down, and the coin for first pick is flipped then. No account needed on their end."
        friendLine="Their seat is held and it waits in their Mega Drafts. The coin flips when they sit down."
      />

      <div className="pe-panel pe-join-strip">
        <div className="pe-join-strip-text">
          <div className="pe-kicker">Join</div>
          <p className="pe-panel-text">Have a code? Six characters, from whoever opened the draft.</p>
        </div>
        <div className="pe-share">
          <input
            className="pe-input pe-input--code"
            placeholder="CODE"
            aria-label="Draft code"
            value={clean}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && clean.length === 6 && router.push(room(clean))}
          />
          <Link
            href={clean.length === 6 ? room(clean) : '#'}
            className="pe-act"
            aria-disabled={clean.length !== 6}
            style={clean.length === 6 ? undefined : { opacity: 0.5, pointerEvents: 'none' }}
          >
            Sit down
          </Link>
        </div>
      </div>

      {!signedIn && mine.length > 0 && (
        <section className="pe-sec">
          <div className="pe-sec-head">
            <span className="pe-sec-num">§ This device</span>
            <span className="pe-sec-title">Drafts you sat at</span>
          </div>
          <div className="pe-row-list">
            {mine.map((id) => (
              <Link key={id} href={room(id)} className="pe-row">
                <span className="pe-row-name">Draft {id}</span>
                <span className="pe-row-sub">Open</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
