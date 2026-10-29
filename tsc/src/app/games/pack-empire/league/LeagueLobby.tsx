'use client'

// Start a league or join one. Four to twelve teams, the commissioner picks
// the playoff field, and invite-only leagues are joined by their code.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LEAGUE_SIZES, playoffFieldSize, playoffOptions } from '@/lib/packEmpire/rules'

async function post(body: Record<string, unknown>) {
  const res = await fetch('/api/games/pack-empire/league/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => null)
  if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Something went wrong.')
  return out
}

export function CreateLeague() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<'invite' | 'public'>('invite')
  const [size, setSize] = useState(8)
  const [playoff, setPlayoff] = useState('half')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const opts = playoffOptions(size)
  const field = playoffFieldSize(opts.includes(playoff) ? playoff : 'half', size)

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const out = await post({
        action: 'create',
        name,
        visibility,
        maxPlayers: size,
        playoffSize: opts.includes(playoff) ? playoff : 'half',
      })
      router.push(`/games/pack-empire/league/${out.id}/`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the league.')
      setBusy(false)
    }
  }

  return (
    <div className="pe-panel">
      <div className="pe-kicker">Commissioner</div>
      <div className="pe-panel-title">Start a league</div>
      <div className="pe-form">
        <label className="pe-field-label">
          Name
          <input
            className="pe-input"
            value={name}
            maxLength={40}
            placeholder="The League"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <span className="pe-field-label">Who can join</span>
        <div className="pe-seg">
          {(
            [
              ['invite', 'Invite code'],
              ['public', 'Anyone'],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              className={`pe-seg-opt${visibility === v ? ' on' : ''}`}
              onClick={() => setVisibility(v)}
            >
              {l}
            </button>
          ))}
        </div>

        <span className="pe-field-label">Teams</span>
        <div className="pe-seg">
          {LEAGUE_SIZES.map((n) => (
            <button
              key={n}
              type="button"
              className={`pe-seg-opt${size === n ? ' on' : ''}`}
              onClick={() => setSize(n)}
            >
              {n}
            </button>
          ))}
        </div>

        <span className="pe-field-label">Playoff field</span>
        <div className="pe-seg">
          {opts.map((o) => (
            <button
              key={o}
              type="button"
              className={`pe-seg-opt${(opts.includes(playoff) ? playoff : 'half') === o ? ' on' : ''}`}
              onClick={() => setPlayoff(o)}
            >
              {o === 'half' ? 'Half' : o}
            </button>
          ))}
        </div>
        <p className="pe-note">
          {field} of {size} make it.{' '}
          {field <= 2 ? 'Straight to the Final.' : 'One Gauntlet week halves them, then the Final.'}
        </p>

        <button type="button" className="pe-btn" onClick={create} disabled={busy || name.trim().length < 3}>
          {busy ? 'Creating' : 'Create the league'}
        </button>
        {error && <div className="pe-error">{error}</div>}
      </div>
    </div>
  )
}

export function JoinByCode() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const clean = code.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6)

  const join = async () => {
    setBusy(true)
    setError(null)
    try {
      const out = await post({ action: 'join', code: clean })
      router.push(`/games/pack-empire/league/${out.id}/`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join.')
      setBusy(false)
    }
  }

  return (
    <div className="pe-panel">
      <div className="pe-kicker">Join</div>
      <div className="pe-panel-title">Have a code?</div>
      <p className="pe-panel-text" style={{ marginBottom: '0.9rem' }}>
        Six characters from your commissioner. Leagues take new teams until the season starts.
      </p>
      <div className="pe-share">
        <input
          className="pe-input"
          placeholder="CODE"
          value={clean}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && clean.length === 6 && join()}
          style={{ fontFamily: 'var(--mono)', letterSpacing: '0.3em' }}
        />
        <button type="button" className="pe-btn pe-btn--ghost" disabled={busy || clean.length !== 6} onClick={join}>
          Join
        </button>
      </div>
      {error && (
        <div className="pe-error" style={{ marginTop: '0.8rem' }}>
          {error}
        </div>
      )}
    </div>
  )
}

export function JoinPublic({ id }: { id: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <button
        type="button"
        className="pe-btn pe-btn--sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await post({ action: 'join', id })
            router.push(`/games/pack-empire/league/${id}/`)
            router.refresh()
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not join.')
            setBusy(false)
          }
        }}
      >
        Join
      </button>
      {error && <span className="pe-note" style={{ color: '#f0b4ad' }}>{error}</span>}
    </>
  )
}
