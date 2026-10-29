'use client'

// The buttons on a league's page: the commissioner's (start, close the week,
// new season, delete), a team's (rename, leave), and an outsider's (join).
// Destructive ones confirm inline, a second tap on a button that has changed
// its words, rather than through a browser dialog.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { REGULAR_WEEKS, type LeaguePhase } from '@/lib/packEmpire/rules'

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

function useAction() {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const run = async (name: string, body: Record<string, unknown>, after?: (out: Record<string, unknown>) => void) => {
    setBusy(name)
    setError(null)
    setNote(null)
    try {
      const out = await post(body)
      after?.(out)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }
  return { busy, error, note, setNote, run }
}

function closeLabel(phase: LeaguePhase, week: number): string {
  if (phase === 'regular') return week >= REGULAR_WEEKS ? `Close week ${week} and seed the playoffs` : `Close week ${week}`
  if (phase === 'gauntlet') return 'Close the Gauntlet'
  return 'Close the Final'
}

export function CommishPanel({
  id,
  phase,
  week,
  canStart,
  teams,
  minPlayers,
  waitingOn,
}: {
  id: string
  phase: LeaguePhase
  week: number
  canStart: boolean
  teams: number
  minPlayers: number
  /** Teams yet to submit this week. */
  waitingOn: number
}) {
  const router = useRouter()
  const { busy, error, note, setNote, run } = useAction()
  const [armed, setArmed] = useState<'advance' | 'delete' | null>(null)

  return (
    <div className="pe-panel">
      <div className="pe-kicker">Commissioner</div>
      <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.8rem' }}>
        {phase === 'pregame' && (
          <>
            <button
              type="button"
              className="pe-btn"
              disabled={!canStart || !!busy}
              onClick={() => run('start', { action: 'start', id })}
            >
              Start the season
            </button>
            {!canStart && (
              <p className="pe-note">
                {teams} of {minPlayers} teams needed to start
              </p>
            )}
          </>
        )}

        {(phase === 'regular' || phase === 'gauntlet' || phase === 'finals') && (
          <>
            <button
              type="button"
              className={`pe-btn${armed === 'advance' ? '' : ' pe-btn--ghost'}`}
              disabled={!!busy}
              onClick={() => {
                if (waitingOn > 0 && armed !== 'advance') {
                  setArmed('advance')
                  return
                }
                setArmed(null)
                run('advance', { action: 'advance', id }, (out) => setNote(`Moved on to ${String(out.to)}.`))
              }}
            >
              {armed === 'advance'
                ? `${waitingOn} still drafting. Close it anyway`
                : closeLabel(phase, week)}
            </button>
            <p className="pe-note">
              {waitingOn > 0 ? `${waitingOn} team${waitingOn === 1 ? '' : 's'} yet to submit` : 'Every lineup is in'}
            </p>
          </>
        )}

        {phase === 'complete' && (
          <button type="button" className="pe-btn" disabled={!!busy} onClick={() => run('new', { action: 'new-season', id })}>
            Start a new season
          </button>
        )}

        <button
          type="button"
          className="pe-btn pe-btn--quiet pe-btn--sm"
          disabled={!!busy}
          onClick={() => {
            if (armed !== 'delete') {
              setArmed('delete')
              return
            }
            run('delete', { action: 'delete', id }, () => router.push('/games/pack-empire/league/'))
          }}
        >
          {armed === 'delete' ? 'Tap again to delete the league for everyone' : 'Delete league'}
        </button>
        {note && <p className="pe-note" style={{ color: 'var(--pe-green)' }}>{note}</p>}
        {error && <div className="pe-error">{error}</div>}
      </div>
    </div>
  )
}

export function RenameTeam({ id, current }: { id: string; current: string | null }) {
  const { busy, error, run } = useAction()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(current ?? '')
  if (!editing) {
    return (
      <button type="button" className="pe-link" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' }} onClick={() => setEditing(true)}>
        {current ? 'Rename' : 'Name your team'}
      </button>
    )
  }
  return (
    <span style={{ display: 'grid', gap: '0.4rem' }}>
      <span className="pe-share">
        <input className="pe-input" value={name} maxLength={28} onChange={(e) => setName(e.target.value)} />
        <button
          type="button"
          className="pe-btn pe-btn--sm"
          disabled={!!busy || name.trim().length < 2}
          onClick={() => run('rename', { action: 'rename', id, teamName: name }, () => setEditing(false))}
        >
          Save
        </button>
      </span>
      {error && <span className="pe-error">{error}</span>}
    </span>
  )
}

export function LeaveLeague({ id }: { id: string }) {
  const router = useRouter()
  const { busy, error, run } = useAction()
  const [armed, setArmed] = useState(false)
  return (
    <>
      <button
        type="button"
        className="pe-btn pe-btn--quiet pe-btn--sm"
        disabled={!!busy}
        onClick={() => {
          if (!armed) {
            setArmed(true)
            return
          }
          run('leave', { action: 'leave', id }, () => router.push('/games/pack-empire/league/'))
        }}
      >
        {armed ? 'Tap again to leave' : 'Leave league'}
      </button>
      {error && <div className="pe-error">{error}</div>}
    </>
  )
}

export function JoinThisLeague({ id, invite }: { id: string; invite: boolean }) {
  const { busy, error, run } = useAction()
  const [code, setCode] = useState('')
  const clean = code.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6)
  return (
    <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.8rem', maxWidth: 420 }}>
      {invite && (
        <input
          className="pe-input"
          placeholder="Invite code"
          value={clean}
          onChange={(e) => setCode(e.target.value)}
          style={{ fontFamily: 'var(--mono)', letterSpacing: '0.3em' }}
        />
      )}
      <button
        type="button"
        className="pe-btn"
        disabled={!!busy || (invite && clean.length !== 6)}
        onClick={() => run('join', invite ? { action: 'join', code: clean } : { action: 'join', id })}
      >
        Join this league
      </button>
      {error && <div className="pe-error">{error}</div>}
    </div>
  )
}
