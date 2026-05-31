'use client'

import { useActionState, useState, useTransition } from 'react'
import { addLeagueToHub, fetchSleeperMembers, type HubMember } from './actions'

export function AddToHubForm() {
  const [state, formAction, isPending] = useActionState(addLeagueToHub, null)

  const [leagueId, setLeagueId] = useState('')
  const [leagueName, setLeagueName] = useState('')
  const [members, setMembers] = useState<HubMember[] | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [picked, setPicked] = useState<HubMember | null>(null)
  const [isLooking, startLook] = useTransition()

  function lookup() {
    setLookupError(null)
    setMembers(null)
    setPicked(null)
    startLook(async () => {
      const res = await fetchSleeperMembers(leagueId)
      if (!res.ok) {
        setLookupError(res.error)
        return
      }
      setLeagueName(res.leagueName)
      setMembers(res.members)
    })
  }

  return (
    <form action={formAction} className="dc-form">
      <div className="dc-field">
        <label htmlFor="leagueId" className="dc-label">Sleeper league ID</label>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <input
            id="leagueId"
            name="leagueId"
            required
            placeholder="1234567890123456789"
            value={leagueId}
            onChange={(e) => setLeagueId(e.target.value)}
            className="dc-input mono"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            onClick={lookup}
            disabled={isLooking || !leagueId.trim()}
            className="dc-btn"
            style={{ flex: '0 0 auto' }}
          >
            {isLooking ? 'Finding…' : 'Find members'}
          </button>
        </div>
        <span className="dc-checkbox-hint">
          From your league URL: sleeper.com/leagues/<strong>1234567890123456789</strong>/team.
        </span>
        {lookupError && <p className="dc-form-error" style={{ margin: '.5rem 0 0' }}>{lookupError}</p>}
      </div>

      {members && (
        <div className="dc-field">
          <label className="dc-label">Which member is you?</label>
          <span className="dc-checkbox-hint" style={{ marginBottom: '.4rem' }}>
            Found <strong>{leagueName}</strong> · {members.length} members. Tap your identity.
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', marginTop: '.35rem' }}>
            {members.map((m) => {
              const isPicked = picked?.userId === m.userId
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => setPicked(m)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '.65rem',
                    padding: '.55rem .7rem',
                    background: isPicked ? 'rgba(232,200,137,.1)' : 'var(--ink)',
                    border: `1px solid ${isPicked ? 'var(--gold)' : 'var(--gold-soft, rgba(200,160,80,.25))'}`,
                    borderRadius: '3px',
                    color: 'var(--cream)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '.9rem',
                  }}
                >
                  {m.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.avatarUrl} alt="" width={32} height={32} style={{ borderRadius: '50%', flex: '0 0 32px' }} />
                  ) : (
                    <span style={{ flex: '0 0 32px', width: 32, height: 32, borderRadius: '50%', background: 'var(--ink-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--serif)', color: 'var(--gold)' }}>
                      {m.displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.displayName}
                    </span>
                    {m.teamName && (
                      <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: '.7rem', opacity: 0.6 }}>
                        {m.teamName}
                      </span>
                    )}
                  </span>
                  <span style={{ color: 'var(--gold)', fontFamily: 'var(--mono)', fontSize: '.7rem' }}>
                    {isPicked ? '✓ You' : '→'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Hidden fields carry the lookup result into the server action. */}
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="leagueName" value={leagueName} />
      <input type="hidden" name="managerExternalId" value={picked?.userId ?? ''} />
      <input type="hidden" name="managerName" value={picked?.displayName ?? ''} />

      {picked && (
        <button type="submit" disabled={isPending} className="dc-btn dc-btn-block">
          {isPending ? 'Adding…' : `Add ${picked.displayName} to my hub →`}
        </button>
      )}

      {state && !state.ok && <p className="dc-form-error">{state.error}</p>}
    </form>
  )
}
