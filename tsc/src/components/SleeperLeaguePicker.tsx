'use client'

import { useState, useTransition } from 'react'

type LookupLeague = {
  league_id: string
  name: string
  total_rosters: number
  seasons: string[]
  avatar: string | null
}

// Two-mode picker: username search (default) or paste a Sleeper league ID.
// Mobile users can't easily get a league ID from share links, so username
// is the friendlier default. Power users on desktop can switch to ID input.
export function SleeperLeaguePicker({
  externalId,
  setExternalId,
  fieldName = 'externalId',
  detect,
  onSelected,
}: {
  externalId: string
  setExternalId: (id: string) => void
  fieldName?: string
  // Optional "Detect" button for the league ID mode (used by the create-archive
  // flow to auto-populate league name + division setup before submit).
  detect?: { onDetect: (id: string) => void; isDetecting: boolean }
  // Called when the user picks a league from the username search results.
  onSelected?: (leagueId: string, leagueName: string) => void
}) {
  const [mode, setMode] = useState<'username' | 'leagueId'>('username')
  const [lookupUsername, setLookupUsername] = useState('')
  const [lookupLeagues, setLookupLeagues] = useState<LookupLeague[] | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [isLookingUp, startLookup] = useTransition()

  function handleLookup() {
    setLookupError(null)
    setLookupLeagues(null)
    const u = lookupUsername.trim()
    if (!u) return
    startLookup(async () => {
      const userRes = await fetch(`https://api.sleeper.app/v1/user/${encodeURIComponent(u)}`)
      if (!userRes.ok) {
        setLookupError(userRes.status === 404 ? `No Sleeper user "${u}".` : `Sleeper lookup failed (${userRes.status}).`)
        return
      }
      const user = (await userRes.json()) as { user_id?: string } | null
      if (!user?.user_id) {
        setLookupError(`No Sleeper user "${u}".`)
        return
      }
      const currentYear = new Date().getFullYear()
      const seasons: string[] = []
      for (let y = 2023; y <= currentYear; y++) seasons.push(String(y))
      const all = await Promise.all(seasons.map(async (s) => {
        const r = await fetch(`https://api.sleeper.app/v1/user/${user.user_id}/leagues/nfl/${s}`)
        if (!r.ok) return [] as Array<{ league_id: string; name: string; season: string; total_rosters: number; avatar: string | null }>
        return (await r.json()) as Array<{ league_id: string; name: string; season: string; total_rosters: number; avatar: string | null }>
      }))
      const merged = new Map<string, LookupLeague>()
      for (const list of all) {
        for (const lg of list ?? []) {
          const existing = merged.get(lg.league_id)
          if (existing) {
            if (!existing.seasons.includes(lg.season)) existing.seasons.push(lg.season)
          } else {
            merged.set(lg.league_id, {
              league_id: lg.league_id,
              name: lg.name,
              total_rosters: lg.total_rosters,
              seasons: [lg.season],
              avatar: lg.avatar ?? null,
            })
          }
        }
      }
      const arr = Array.from(merged.values()).map((l) => ({ ...l, seasons: l.seasons.sort() }))
      arr.sort((a, b) => (b.seasons.at(-1) ?? '').localeCompare(a.seasons.at(-1) ?? ''))
      if (arr.length === 0) {
        setLookupError(`No leagues found for "${u}" in 2023–${currentYear}.`)
        return
      }
      setLookupLeagues(arr)
    })
  }

  function pickLeague(lg: LookupLeague) {
    setExternalId(lg.league_id)
    setMode('leagueId')
    setLookupLeagues(null)
    setLookupUsername('')
    setLookupError(null)
    onSelected?.(lg.league_id, lg.name)
  }

  const toggleLinkStyle: React.CSSProperties = {
    marginTop: '.6rem',
    alignSelf: 'flex-start',
    background: 'none',
    border: 'none',
    padding: 0,
    color: 'var(--gold)',
    fontFamily: 'var(--mono)',
    fontSize: '.7rem',
    letterSpacing: '.18em',
    textTransform: 'uppercase',
    textAlign: 'left',
    cursor: 'pointer',
    textDecoration: 'underline',
  }

  if (mode === 'username') {
    return (
      <div className="dc-field">
        <label htmlFor="sleeperLookupUsername" className="dc-label">Sleeper username</label>
        <input type="hidden" name={fieldName} value={externalId} />
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <input
            id="sleeperLookupUsername"
            value={lookupUsername}
            onChange={(e) => setLookupUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleLookup()
              }
            }}
            placeholder="your_sleeper_handle"
            className="dc-input mono"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="dc-btn-ghost"
            onClick={handleLookup}
            disabled={isLookingUp || !lookupUsername.trim()}
          >
            {isLookingUp ? 'Searching…' : 'Search'}
          </button>
        </div>
        <span className="dc-checkbox-hint">
          We&apos;ll list every Sleeper league you&apos;ve been in from 2023 to now. Pick one.
        </span>
        {lookupError && (
          <p className="dc-form-error" style={{ margin: '.5rem 0 0' }}>{lookupError}</p>
        )}
        {lookupLeagues && lookupLeagues.length > 0 && (
          <div style={{ marginTop: '.75rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
            {lookupLeagues.map((lg) => {
              const yrs = lg.seasons.length === 1
                ? lg.seasons[0]
                : `${lg.seasons[0]}–${lg.seasons.at(-1)}`
              return (
                <button
                  key={lg.league_id}
                  type="button"
                  onClick={() => pickLeague(lg)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '.65rem',
                    padding: '.55rem .7rem',
                    background: 'var(--ink)',
                    border: '1px solid var(--gold-soft, rgba(200,160,80,.25))',
                    borderRadius: '3px',
                    color: 'var(--cream)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '.9rem',
                  }}
                >
                  {lg.avatar && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://sleepercdn.com/avatars/thumbs/${lg.avatar}`}
                      alt=""
                      width={28}
                      height={28}
                      style={{ borderRadius: '3px', flex: '0 0 28px' }}
                    />
                  )}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lg.name}
                    </span>
                    <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: '.7rem', opacity: 0.6, letterSpacing: '.05em' }}>
                      {yrs} · {lg.total_rosters} teams
                    </span>
                  </span>
                  <span style={{ color: 'var(--gold)', fontFamily: 'var(--mono)', fontSize: '.7rem' }}>→</span>
                </button>
              )
            })}
          </div>
        )}
        <button type="button" onClick={() => setMode('leagueId')} style={toggleLinkStyle}>
          Use League ID →
        </button>
      </div>
    )
  }

  return (
    <div className="dc-field">
      <label htmlFor={fieldName} className="dc-label">Sleeper league ID</label>
      <div style={{ display: 'flex', gap: '.5rem' }}>
        <input
          id={fieldName}
          name={fieldName}
          required
          placeholder="1234567890123456789"
          value={externalId}
          onChange={(e) => setExternalId(e.target.value)}
          className="dc-input mono"
          style={{ flex: 1 }}
        />
        {detect && (
          <button
            type="button"
            className="dc-btn-ghost"
            onClick={() => detect.onDetect(externalId)}
            disabled={detect.isDetecting || !externalId.trim()}
          >
            {detect.isDetecting ? 'Detecting…' : 'Detect'}
          </button>
        )}
      </div>
      <button type="button" onClick={() => setMode('username')} style={toggleLinkStyle}>
        ← Use Username
      </button>
    </div>
  )
}
