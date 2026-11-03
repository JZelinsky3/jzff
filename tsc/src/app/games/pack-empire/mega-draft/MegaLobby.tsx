'use client'

// Open a Mega Draft, or sit down at one by its code. Either seat works
// signed out: the browser keeps a seat key, and the drafts it has sat at are
// remembered here so they can be found again from this device. The format and
// the cards are picked once, above both ways to start, the same card as Versus.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { DIFFICULTIES, DIFFICULTY_LOOK, MEGA_FORMATS, MEGA_FORMAT_LOOK, type Difficulty, type MegaFormat } from '@/lib/packEmpire/rules'
import { SetupSwitch } from '../SetupSwitch'
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

export function MegaLobby({
  signedIn,
  friends = [],
}: {
  signedIn: boolean
  friends?: { id: string; name: string }[]
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

  const create = async (tag: string, extra: Record<string, unknown> = {}) => {
    setBusy(tag)
    setError(null)
    try {
      const res = await fetch('/api/games/pack-empire/mega/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name, key: signedIn ? null : megaKey(), format, difficulty, ...extra }),
      })
      const out = await res.json().catch(() => null)
      if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Could not open a draft.')
      rememberMega(out.id)
      router.push(`/games/pack-empire/mega-draft/${out.id}/`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open a draft.')
      setBusy(null)
    }
  }

  const clean = code.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6)

  return (
    <>
      {!signedIn && (
        <label className="pe-mega-name">
          <span className="pe-note">Your name at the table</span>
          <input
            className="pe-input"
            placeholder="Your name"
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      )}
      <section className="pe-sec">
        <div className="pe-sec-head">
          <span className="pe-sec-num">§ New Draft</span>
          <span className="pe-sec-title">Open A Board</span>
        </div>

        <div className="pe-setup-new">
          <SetupSwitch
            label="Format"
            options={MEGA_FORMATS.map((f) => ({ id: f, label: MEGA_FORMAT_LOOK[f].label }))}
            value={format}
            onChange={setFormat}
            line={MEGA_FORMAT_LOOK[format].line}
          />
          <SetupSwitch
            label="Cards"
            square
            options={DIFFICULTIES.map((d) => ({ id: d, label: DIFFICULTY_LOOK[d].label }))}
            value={difficulty}
            onChange={setDifficulty}
            line={
              difficulty === 'cap'
                ? 'Every card has a salary and each seat a budget. When you can’t pay anyone you need, the cheapest signs free.'
                : difficulty === 'open'
                  ? 'Every card face up: value, rarity and stats.'
                  : `${DIFFICULTY_LOOK[difficulty].line} The values come up after the last pick.`
            }
          />

          <div className="pe-setup-who">
            <div className="pe-setup-opp">
              <span className="pe-setup-label">Play the CPU</span>
              <p className="pe-setup-line">Same board, same snake. It sees what you see and nothing more.</p>
              <button type="button" className="pe-push" onClick={() => create('cpu', { cpu: true })} disabled={!!busy || !named}>
                {busy === 'cpu' ? 'Dealing the board' : 'Play the CPU'}
              </button>
            </div>

            <div className="pe-setup-opp">
              <span className="pe-setup-label">Play a person</span>
              {signedIn && friends.length > 0 ? (
                <div className="pe-friend-picks" role="group" aria-label="Send it to a friend">
                  {friends.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className="pe-friend-pick"
                      onClick={() => create(`f:${f.id}`, { friend: f.id })}
                      disabled={!!busy}
                    >
                      <span className="pe-friend-pick-mono" aria-hidden>
                        {f.name.charAt(0).toUpperCase()}
                      </span>
                      {busy === `f:${f.id}` ? 'Sending' : f.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="pe-setup-line">
                  {signedIn ? (
                    <>
                      <Link href="/games/pack-empire/profile/" className="pe-link">
                        Add friends
                      </Link>{' '}
                      to send one straight to them, or share the code.
                    </>
                  ) : (
                    'Open it and share the code with one person.'
                  )}
                </p>
              )}
              <button type="button" className="pe-push" onClick={() => create('open')} disabled={!!busy || !named}>
                {busy === 'open' ? 'Dealing the board' : 'Open with a code'}
              </button>
            </div>
          </div>
        </div>
      </section>

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
            onKeyDown={(e) => e.key === 'Enter' && clean.length === 6 && router.push(`/games/pack-empire/mega-draft/${clean}/`)}
          />
          <Link
            href={clean.length === 6 ? `/games/pack-empire/mega-draft/${clean}/` : '#'}
            className="pe-act"
            aria-disabled={clean.length !== 6}
            style={clean.length === 6 ? undefined : { opacity: 0.5, pointerEvents: 'none' }}
          >
            Sit down
          </Link>
        </div>
      </div>

      {error && (
        <div className="pe-error" style={{ marginTop: '1rem' }}>
          {error}
        </div>
      )}
      {!signedIn && mine.length > 0 && (
        <section className="pe-sec">
          <div className="pe-sec-head">
            <span className="pe-sec-num">§ This device</span>
            <span className="pe-sec-title">Drafts you sat at</span>
          </div>
          <div className="pe-row-list">
            {mine.map((id) => (
              <Link key={id} href={`/games/pack-empire/mega-draft/${id}/`} className="pe-row">
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
