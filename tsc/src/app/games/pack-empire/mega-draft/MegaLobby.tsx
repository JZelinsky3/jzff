'use client'

// Open a Mega Draft, or sit down at one by its code. Either seat works
// signed out: the browser keeps a seat key, and the drafts it has sat at are
// remembered here so they can be found again from this device.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
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

function parseMine(raw: string | null): string[] {
  try {
    const list = JSON.parse(raw || '[]')
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function MegaLobby({ signedIn }: { signedIn: boolean }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stored = useStored(MINE)
  const mine = signedIn ? [] : parseMine(stored)

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/games/pack-empire/mega/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name, key: signedIn ? null : megaKey() }),
      })
      const out = await res.json().catch(() => null)
      if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Could not open a draft.')
      rememberMega(out.id)
      router.push(`/games/pack-empire/mega-draft/${out.id}/`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open a draft.')
      setBusy(false)
    }
  }

  const clean = code.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6)

  return (
    <>
      <div className="pe-twoup">
        <div className="pe-panel">
          <div className="pe-kicker">Host</div>
          <div className="pe-panel-title">Open a draft</div>
          <p className="pe-panel-text" style={{ marginBottom: '0.9rem' }}>
            A fresh board of thirty-six, dealt the moment you open it. Send the code to one person.
          </p>
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {!signedIn && (
              <input
                className="pe-input"
                placeholder="Your name"
                value={name}
                maxLength={24}
                onChange={(e) => setName(e.target.value)}
              />
            )}
            <button
              type="button"
              className="pe-btn"
              onClick={create}
              disabled={busy || (!signedIn && name.trim().length < 2)}
            >
              {busy ? 'Dealing the board' : 'Open a draft'}
            </button>
          </div>
        </div>
        <div className="pe-panel">
          <div className="pe-kicker">Join</div>
          <div className="pe-panel-title">Have a code?</div>
          <p className="pe-panel-text" style={{ marginBottom: '0.9rem' }}>
            Six characters, from whoever opened the draft. You pick your name at the table.
          </p>
          <div className="pe-share">
            <input
              className="pe-input"
              placeholder="CODE"
              value={clean}
              onChange={(e) => setCode(e.target.value)}
              style={{ fontFamily: 'var(--mono)', letterSpacing: '0.3em', textTransform: 'uppercase' }}
              onKeyDown={(e) => e.key === 'Enter' && clean.length === 6 && router.push(`/games/pack-empire/mega-draft/${clean}/`)}
            />
            <Link
              href={clean.length === 6 ? `/games/pack-empire/mega-draft/${clean}/` : '#'}
              className="pe-btn pe-btn--ghost"
              aria-disabled={clean.length !== 6}
              style={clean.length === 6 ? undefined : { opacity: 0.5, pointerEvents: 'none' }}
            >
              Sit down
            </Link>
          </div>
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
