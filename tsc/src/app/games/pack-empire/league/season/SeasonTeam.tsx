'use client'

// The lineup page for a Season team (Joey, 2026-11-07: "build a new lineup page
// that works specifically for this"). The eleven on the turf as cards, each with
// its kind of player and how the next defense treats him, the bench on the
// sideline, subs by tap or drag (SeasonLineup), and beside it a scouting report
// on your own team: what it does well, where it's thin, and how every game left
// projects with the eleven as it stands. Every sub redraws all of it.

import Link from 'next/link'
import { useCallback, useState } from 'react'
import type { Lane } from '@/lib/packEmpire/archetypes'
import type { MySeason, SeasonView } from '@/lib/packEmpire/season'
import { SeasonLineup } from './SeasonLineup'
import { SeasonPack } from './SeasonPack'
import { seasonHref, seasonPost } from './api'

const LANE_NAME: Record<Lane, string> = { run: 'Run game', short: 'Short passes', deep: 'Deep passes', redZone: 'Red zone', protect: 'Protection' }
const LANE_ORDER: Lane[] = ['run', 'short', 'deep', 'redZone', 'protect']

const word = (r: number) => (r >= 1.08 ? 'Strong' : r <= 0.92 ? 'Thin' : 'Typical')

function identity(pass: number): { name: string; line: string } {
  if (pass >= 0.62) return { name: 'Air Raid', line: 'You win through the air.' }
  if (pass >= 0.56) return { name: 'Pass First', line: 'The passing game leads, the run keeps them honest.' }
  if (pass <= 0.47) return { name: 'Ground And Pound', line: 'You run it at them and dare them to stop it.' }
  return { name: 'Balanced', line: 'No one thing to take away.' }
}

export function SeasonTeam({ initial }: { initial: SeasonView }) {
  const [view, setView] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const me = view.me!
  const act = useCallback(
    async (key: string, body: Record<string, unknown>) => {
      setBusy(key)
      setError(null)
      try {
        const { view: v } = await seasonPost({ id: view.league.id, ...body })
        if (v) setView(v)
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.')
        return false
      } finally {
        setBusy(null)
      }
    },
    [view.league.id]
  )
  return (
    <div className="pe-sn-lp">
      <div className="pe-sn-lp-main">
        {error && <div className="pe-error">{error}</div>}
        {me.pending && <SeasonPack key={`${me.pending.trade ? 't' : 'g'}${me.pending.week}`} leagueId={view.league.id} me={me} busy={busy} act={act} onView={setView} />}
        <SeasonLineup leagueId={view.league.id} me={me} size="full" onView={setView} onError={setError} />
      </div>
      <TeamReport leagueId={view.league.id} me={me} />
    </div>
  )
}

function TeamReport({ leagueId, me }: { leagueId: string; me: MySeason }) {
  const p = me.profile
  if (!p) return null
  const id = identity(p.passShare)
  const ranked = [...LANE_ORDER].sort((a, b) => p.lanes[b] - p.lanes[a])
  const strong = ranked.filter((k) => p.lanes[k] >= 1.08).slice(0, 2)
  const thin = ranked.filter((k) => p.lanes[k] <= 0.92).slice(-1)
  const next = me.next
  return (
    <aside className="pe-sn-rep">
      <div className="pe-sn-rep-head">
        <small>Scouting Report</small>
        <h2>{id.name}</h2>
        <p>
          {id.line}{' '}
          {strong.length ? `Best at ${strong.map((k) => LANE_NAME[k].toLowerCase()).join(' and ')}.` : 'Nothing stands out above a typical offense.'}
          {thin.length ? ` Thin on ${LANE_NAME[thin[0]].toLowerCase()}.` : ''}
        </p>
      </div>

      <div className="pe-sn-rep-nums">
        <div>
          <b>{Math.round(p.projected)}</b>
          <small>Points vs a plain defense, best call</small>
        </div>
        <div>
          <b>{p.value.toLocaleString()}</b>
          <small>Card value</small>
        </div>
        <div>
          <b data-tone={p.chem > 0 ? 'up' : p.chem < 0 ? 'down' : undefined}>
            {p.chem > 0 ? '+' : ''}
            {p.chem.toLocaleString()}
          </b>
          <small>Chemistry</small>
        </div>
      </div>

      <div className="pe-sn-rep-lanes">
        {LANE_ORDER.map((k) => {
          const r = p.lanes[k]
          return (
            <div key={k} className="pe-sn-rep-lane" data-word={word(r)}>
              <span>{LANE_NAME[k]}</span>
              <i>
                <em style={{ transform: `scaleX(${Math.max(0.04, Math.min(1, r / 1.6))})` }} />
                <u />
              </i>
              <b>{word(r)}</b>
            </div>
          )
        })}
        <small className="pe-sn-rep-key">The tick is a typical Season offense.</small>
      </div>

      {me.outlook.length > 0 && (
        <div className="pe-sn-rep-road">
          <h3>The Road Ahead</h3>
          <ol>
            {me.outlook.map((w) => {
              const d = Math.round(w.projected - w.line)
              return (
                <li key={w.week} data-tone={d >= 2 ? 'up' : d <= -2 ? 'down' : 'even'} data-next={next?.phase === 'regular' && next.week === w.week ? 'true' : undefined}>
                  <span>{w.week}</span>
                  <span>
                    <b>{w.defense}</b>
                    <small>Stops {w.stops.toLowerCase()}</small>
                  </span>
                  <em>
                    {Math.round(w.projected)} <small>need {w.line}</small>
                  </em>
                </li>
              )
            })}
          </ol>
          <small className="pe-sn-rep-key">Projected points against each defense, and the points it takes to win.</small>
        </div>
      )}

      {next && (
        <Link href={seasonHref(leagueId)} className="pe-push pe-sn-rep-go">
          {next.phase === 'regular' ? `To Game ${next.week}` : 'To The Playoff Game'}
        </Link>
      )}
    </aside>
  )
}
