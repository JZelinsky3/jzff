'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { DIFFICULTIES, DIFFICULTY_LOOK, type Difficulty } from '@/lib/packEmpire/rules'
import type { VersusFormat } from '@/lib/packEmpire/versus'

type Friend = { id: string; name: string }

const FORMATS: { id: VersusFormat; label: string; line: string }[] = [
  { id: 'classic', label: 'Classic', line: 'Your own eleven packs and a captain each. The better pulls win.' },
  { id: 'even', label: 'Even', line: 'The same eleven packs, no captain. Chemistry and three Battles decide it.' },
  { id: 'mystery', label: 'Mystery', line: 'Your own captain, then ten packs of mixed positions. Plan for what you need.' },
]

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

/** One row of the setup: a label, the switch, and a line on the one picked. */
function Switch<T extends string>({
  label,
  options,
  value,
  onChange,
  line,
}: {
  label: string
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
  line: string
}) {
  return (
    <div className="pe-vs-row">
      <span className="pe-vs-label">{label}</span>
      <div className="pe-vs-seg" role="radiogroup" aria-label={label} style={{ '--n': options.length } as React.CSSProperties}>
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={o.id === value} onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="pe-vs-line">{line}</p>
    </div>
  )
}

/**
 * Starting a game, as one card: the format and the cards on two switches, then
 * who you're playing, the CPU or a person (a friend, whose seat is held for
 * them, or an open link for whoever opens it first). Either drops you straight
 * into your own draft with what's picked above.
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
    <section className="pe-sec">
      <div className="pe-sec-head">
        <span className="pe-sec-num">§ New Game</span>
        <span className="pe-sec-title">Start A Challenge</span>
      </div>

      <div className="pe-vs-new">
        <Switch
          label="Format"
          options={FORMATS}
          value={format}
          onChange={setFormat}
          line={FORMATS.find((f) => f.id === format)!.line}
        />
        <Switch
          label="Cards"
          options={DIFFICULTIES.map((d) => ({ id: d, label: DIFFICULTY_LOOK[d].label }))}
          value={difficulty}
          onChange={setDifficulty}
          line={DIFFICULTY_LOOK[difficulty].line}
        />

        <div className="pe-vs-who">
          <div className="pe-vs-opp">
            <span className="pe-vs-label">Play the CPU</span>
            <p className="pe-vs-line">It never sees your picks. Both totals go up when you lock yours in.</p>
            <button type="button" className="pe-push" onClick={() => go('cpu', { cpu: true })} disabled={!!busy}>
              {busy === 'cpu' ? 'Dealing' : 'Play the CPU'}
            </button>
          </div>

          <div className="pe-vs-opp">
            <span className="pe-vs-label">Play a friend</span>
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
              <p className="pe-vs-line">
                No friends yet.{' '}
                <Link href="/games/pack-empire/profile/" className="pe-link">
                  Add some
                </Link>{' '}
                or send a link to anyone.
              </p>
            )}
            <button type="button" className="pe-push" onClick={() => go('link', {})} disabled={!!busy}>
              {busy === 'link' ? 'Opening' : 'Send a link'}
            </button>
          </div>
        </div>

        {error && <div className="pe-error">{error}</div>}
      </div>
    </section>
  )
}
