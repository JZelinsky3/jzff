'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Difficulty } from '@/lib/packEmpire/rules'
import type { VersusFormat } from '@/lib/packEmpire/versus'
import { DifficultyPicker, FormatPicker } from '../Difficulty'

type Friend = { id: string; name: string }

async function open(body: Record<string, unknown>): Promise<string> {
  const res = await fetch('/api/games/pack-empire/versus/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', ...body }),
  })
  const out = await res.json().catch(() => null)
  if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Could not open a challenge.')
  return out.id as string
}

/**
 * The two ways to start: a person (one friend, whose seat is held for them,
 * or an open link for whoever opens it first) or the CPU. Side by side and
 * the same height, buttons on the same line. Either drops you straight into
 * your own draft. The format and the cards are picked once, above both, and
 * hold for whichever you go with.
 */
export function ChallengePanels({ friends }: { friends: Friend[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [format, setFormat] = useState<VersusFormat>('classic')
  const [difficulty, setDifficulty] = useState<Difficulty>('open')

  const go = async (key: string, body: Record<string, unknown>) => {
    setBusy(key)
    setError(null)
    try {
      router.push(`/games/pack-empire/versus/${await open({ ...body, format, difficulty })}/`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open a challenge.')
      setBusy(null)
    }
  }

  return (
    <>
      <FormatPicker value={format} onChange={setFormat} />
      <DifficultyPicker value={difficulty} onChange={setDifficulty} />
      <div className="pe-twoup">
        <div className="pe-panel">
          <div className="pe-kicker">A friend</div>
          <div className="pe-panel-title">Send a challenge</div>
          <p className="pe-panel-text">
            Pick a friend and the other seat waits for them, in their challenges. Or open a link and
            whoever opens it first takes the seat.
          </p>
          <div className="pe-panel-foot">
            {friends.length > 0 ? (
              <div className="pe-friend-picks" role="group" aria-label="Send it to a friend">
                {friends.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="pe-friend-pick"
                    onClick={() => go(`f:${f.id}`, { friend: f.id })}
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
              <p className="pe-note">
                No friends yet.{' '}
                <Link href="/games/pack-empire/profile/" className="pe-link">
                  Add some
                </Link>{' '}
                to send one straight to them.
              </p>
            )}
            <button type="button" className="pe-btn pe-btn--ghost" onClick={() => go('link', {})} disabled={!!busy}>
              {busy === 'link' ? 'Opening' : 'Open a link instead'}
            </button>
          </div>
        </div>

        <div className="pe-panel">
          <div className="pe-kicker">Solo</div>
          <div className="pe-panel-title">Draft against the CPU</div>
          <p className="pe-panel-text">
            {format === 'even'
              ? 'It gets the same eleven packs and drafts for value, chemistry and the Battles. It never sees your picks, and it can only read what you can read.'
              : 'Its eleven packs are dealt the moment you start, before you open yours, and it keeps the best card in each. It never sees your picks.'}{' '}
            Both totals go up when you lock yours in.
          </p>
          <div className="pe-panel-foot">
            <button type="button" className="pe-btn" onClick={() => go('cpu', { cpu: true })} disabled={!!busy}>
              {busy === 'cpu' ? 'Dealing' : 'Play the CPU'}
            </button>
          </div>
        </div>
      </div>
      {error && (
        <div className="pe-error" style={{ marginTop: '0.9rem' }}>
          {error}
        </div>
      )}
    </>
  )
}
