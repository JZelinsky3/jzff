'use client'

// Your Season team: the eleven with each man's archetype and where his value
// goes, the bench under them, and subs. A bench card goes in at his position
// (any receiver spot, either tackle, either guard) and the starter takes his
// place on the bench. Letting one go makes room for the next game's pack.

import { useState } from 'react'
import { RARITY_LOOK, SLOTS, type Player } from '@/lib/packEmpire/rules'
import { BENCH_MAX } from '@/lib/packEmpire/seasonRules'
import type { CardStyle, MySeason, SeasonView } from '@/lib/packEmpire/season'
import { PackCard } from '../../cards'

async function post(body: Record<string, unknown>): Promise<SeasonView | null> {
  const res = await fetch('/api/games/pack-empire/season/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => null)
  if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Something went wrong.')
  return (out.view as SeasonView | null) ?? null
}

const LANES = [
  ['run', 'Run'],
  ['short', 'Short'],
  ['deep', 'Deep'],
  ['redZone', 'RZ'],
  ['protect', 'Pro'],
] as const

function Lanes({ style }: { style: CardStyle | undefined }) {
  if (!style) return null
  return (
    <span className="pe-sn-mini">
      {LANES.filter(([k]) => style.lanes[k] > 0.02).map(([k, label]) => (
        <span key={k}>
          <small>{label}</small>
          <i>
            <em style={{ width: `${Math.round(style.lanes[k] * 100)}%` }} />
          </i>
        </span>
      ))}
    </span>
  )
}

export function SeasonTeam({ leagueId, initial }: { leagueId: string; initial: MySeason }) {
  const [me, setMe] = useState(initial)
  const [subbing, setSubbing] = useState<Player | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const act = async (body: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    try {
      const v = await post({ id: leagueId, ...body })
      if (v?.me) setMe(v.me)
      setSubbing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pe-sn">
      {error && <div className="pe-error">{error}</div>}

      <section className="pe-sec pe-sn-sec">
        <div className="pe-sec-head">
          <span className="pe-sec-num">§ Starters</span>
          <span className="pe-sec-title">The Eleven</span>
        </div>
        {subbing && (
          <p className="pe-banner">
            <span>
              <b>{subbing.name}</b> can go in at {SLOTS.filter((s) => s.pool === subbing.pos).map((s) => s.short).join(' or ')}. Tap the man he replaces.
            </span>
          </p>
        )}
        <div className="pe-sn-roster">
          {me.lineup.map((p, slot) => {
            if (!p) return null
            const fits = !!subbing && SLOTS[slot].pool === subbing.pos
            const st = me.styles[p.id]
            return (
              <button
                key={`${slot}-${p.id}`}
                type="button"
                className={`pe-sn-man${fits ? ' fits' : ''}`}
                disabled={!fits || busy}
                onClick={() => subbing && act({ action: 'sub', bench: subbing.id, slot })}
                style={{ '--rc': RARITY_LOOK[p.rarity].color } as React.CSSProperties}
              >
                <span className="pe-sn-slot">{SLOTS[slot].short}</span>
                <span className="pe-sn-who">
                  <b>{p.name}</b>
                  <small>
                    {p.year} · {RARITY_LOOK[p.rarity].label} · {p.score.toLocaleString()}
                  </small>
                </span>
                <span className="pe-sn-tag">{st?.tag}</span>
                <Lanes style={st} />
              </button>
            )
          })}
        </div>
      </section>

      <section className="pe-sec pe-sn-sec">
        <div className="pe-sec-head">
          <span className="pe-sec-num">§ Bench</span>
          <span className="pe-sec-title">
            {me.bench.length} of {BENCH_MAX}
          </span>
        </div>
        {me.bench.length === 0 ? (
          <p className="pe-note">Nobody yet. Every game pays a pack, and its card lands here.</p>
        ) : (
          <div className="pe-sn-benchlist">
            {me.bench.map((p) => (
              <div key={p.id} className={`pe-sn-benchman${subbing?.id === p.id ? ' on' : ''}`}>
                <PackCard player={p} revealed index={0} still disabled />
                <span className="pe-sn-tag">{me.styles[p.id]?.tag}</span>
                <Lanes style={me.styles[p.id]} />
                <div className="pe-sn-benchacts">
                  <button type="button" className="pe-act pe-act--sm" disabled={busy} onClick={() => setSubbing(subbing?.id === p.id ? null : p)}>
                    {subbing?.id === p.id ? 'Cancel' : 'Sub In'}
                  </button>
                  <button type="button" className="pe-act pe-act--sm" disabled={busy} onClick={() => act({ action: 'release', bench: p.id })}>
                    Let Go
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
