'use client'

import { useState, useTransition } from 'react'

type LookupLeague = {
  // The HEAD league_id of the chain (most-recent season). Submitting this id
  // and letting walk_history follow `previous_league_id` back covers every
  // season in `seasons` without duplicates.
  league_id: string
  name: string
  total_rosters: number
  seasons: string[]
  avatar: string | null
}

// Raw shape returned by Sleeper's user-leagues endpoint. `previous_league_id`
// is what lets us collapse multiple seasons of the same league into one row.
type SleeperUserLeague = {
  league_id: string
  name: string
  season: string
  total_rosters: number
  avatar: string | null
  previous_league_id: string | null
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
      // Reach back to 2020 — Sleeper itself launched in 2017, but five seasons
      // of history covers the vast majority of leagues without ballooning the
      // request count.
      for (let y = 2020; y <= currentYear; y++) seasons.push(String(y))
      const all = await Promise.all(seasons.map(async (s) => {
        const r = await fetch(`https://api.sleeper.app/v1/user/${user.user_id}/leagues/nfl/${s}`)
        if (!r.ok) return [] as SleeperUserLeague[]
        return (await r.json()) as SleeperUserLeague[]
      }))

      // Flatten + index by league_id. Sleeper returns one row per season per
      // league; previous_league_id chains rows from older seasons.
      const byId = new Map<string, SleeperUserLeague>()
      for (const list of all) {
        for (const lg of list ?? []) {
          // If the same league_id shows up in two responses, prefer whichever
          // copy carries the most metadata (they should be identical anyway).
          if (!byId.has(lg.league_id)) byId.set(lg.league_id, lg)
        }
      }

      // Anything referenced as someone else's previous_league_id is an
      // intermediate node in a chain — not a head. Heads are the leagues
      // nobody points back to.
      const isAncestor = new Set<string>()
      for (const lg of byId.values()) {
        const prev = lg.previous_league_id
        if (prev && prev !== '0') isAncestor.add(prev)
      }

      // For each head, walk previous_league_id back through `byId` to collect
      // every season in the chain. We only walk seasons we actually fetched —
      // anything outside the 2020+ window is ignored (the ingest's history walk
      // will still pull it later, this is just for display).
      const merged: LookupLeague[] = []
      for (const head of byId.values()) {
        if (isAncestor.has(head.league_id)) continue
        const seasons: string[] = []
        let cursor: SleeperUserLeague | undefined = head
        const guard = new Set<string>()
        while (cursor && !guard.has(cursor.league_id)) {
          guard.add(cursor.league_id)
          if (cursor.season) seasons.push(cursor.season)
          const prevId: string | null = cursor.previous_league_id
          cursor = prevId && prevId !== '0' ? byId.get(prevId) : undefined
        }
        merged.push({
          league_id: head.league_id,
          name: head.name,
          total_rosters: head.total_rosters,
          seasons: seasons.sort(),
          avatar: head.avatar ?? null,
        })
      }

      merged.sort((a, b) => (b.seasons.at(-1) ?? '').localeCompare(a.seasons.at(-1) ?? ''))
      if (merged.length === 0) {
        setLookupError(`No leagues found for "${u}" in 2020–${currentYear}.`)
        return
      }
      setLookupLeagues(merged)
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
          We&apos;ll list every Sleeper league you&apos;ve been in from 2020 to now, deduped
          by history chain. Pick one — we&apos;ll walk every prior season automatically.
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
