'use client'

import { useEffect, useActionState, useState, useTransition } from 'react'
import {
  addLeagueToHub,
  fetchSleeperMembers,
  fetchEspnMembers,
  fetchNflMembers,
  fetchYahooMembers,
  listYahooHubLeagues,
  type HubMember,
} from './actions'

type Platform = 'sleeper' | 'espn' | 'nfl' | 'yahoo'

type YahooPickerLeague = {
  league_key: string
  name: string
  seasons: string[]
  num_teams: number
  logo_url?: string
}

export function AddToHubForm({ yahooConnected }: { yahooConnected: boolean }) {
  const [state, formAction, isPending] = useActionState(addLeagueToHub, null)

  const [platform, setPlatform] = useState<Platform>('sleeper')
  const [leagueId, setLeagueId] = useState('')
  const [leagueName, setLeagueName] = useState('')
  const [members, setMembers] = useState<HubMember[] | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [picked, setPicked] = useState<HubMember | null>(null)
  const [isLooking, startLook] = useTransition()

  // ESPN / NFL shared season range; NFL playoff config; ESPN private cookies.
  const [seasonStart, setSeasonStart] = useState('2023')
  const [seasonEnd, setSeasonEnd] = useState('2025')
  const [playoffWeekStart, setPlayoffWeekStart] = useState('15')
  const [playoffTeamCount, setPlayoffTeamCount] = useState('6')
  const [isPrivate, setIsPrivate] = useState(false)
  const [swid, setSwid] = useState('')
  const [espnS2, setEspnS2] = useState('')

  // Yahoo league picker.
  const [yahooLeagues, setYahooLeagues] = useState<YahooPickerLeague[] | null>(null)
  const [yahooError, setYahooError] = useState<string | null>(null)
  const [isLoadingYahoo, startYahooLoad] = useTransition()
  const [pickedYahooKey, setPickedYahooKey] = useState<string | null>(null)

  // Reset the member list whenever the platform changes — a picked "me" from
  // one platform must never leak into a submit for another.
  function changePlatform(p: Platform) {
    setPlatform(p)
    setMembers(null)
    setPicked(null)
    setLeagueId('')
    setLeagueName('')
    setLookupError(null)
    setPickedYahooKey(null)
  }

  // Lazy-load Yahoo leagues on first visit to that tab.
  useEffect(() => {
    if (platform !== 'yahoo' || !yahooConnected) return
    if (yahooLeagues !== null || isLoadingYahoo) return
    setYahooError(null)
    startYahooLoad(async () => {
      const res = await listYahooHubLeagues()
      if (!res.ok) { setYahooError(res.error); setYahooLeagues([]); return }
      setYahooLeagues(res.leagues as YahooPickerLeague[])
    })
  }, [platform, yahooConnected, yahooLeagues, isLoadingYahoo])

  function runLookup() {
    setLookupError(null)
    setMembers(null)
    setPicked(null)
    startLook(async () => {
      let res
      if (platform === 'sleeper') res = await fetchSleeperMembers(leagueId)
      else if (platform === 'espn') res = await fetchEspnMembers(leagueId, Number(seasonEnd), isPrivate ? swid : undefined, isPrivate ? espnS2 : undefined)
      else res = await fetchNflMembers(leagueId, Number(seasonEnd))
      if (!res.ok) { setLookupError(res.error); return }
      setLeagueName(res.leagueName)
      setMembers(res.members)
    })
  }

  function pickYahooLeague(lg: YahooPickerLeague) {
    setPickedYahooKey(lg.league_key)
    setLeagueId(lg.league_key)
    setMembers(null)
    setPicked(null)
    setLookupError(null)
    startLook(async () => {
      const res = await fetchYahooMembers(lg.league_key)
      if (!res.ok) { setLookupError(res.error); return }
      setLeagueName(res.leagueName)
      setMembers(res.members)
    })
  }

  const idPlaceholder =
    platform === 'nfl' ? '7528632' : platform === 'espn' ? '47847' : '1234567890123456789'

  return (
    <form action={formAction} className="dc-form">
      <div className="dc-field">
        <label htmlFor="platform" className="dc-label">Platform</label>
        <select
          id="platform"
          value={platform}
          onChange={(e) => changePlatform(e.target.value as Platform)}
          className="dc-select"
        >
          <option value="sleeper">Sleeper</option>
          <option value="espn">ESPN</option>
          <option value="nfl">NFL.com</option>
          <option value="yahoo">Yahoo (connect required)</option>
        </select>
      </div>

      {/* ── Yahoo: connect + league picker ─────────────────────────────── */}
      {platform === 'yahoo' ? (
        !yahooConnected ? (
          <div className="dc-field">
            <div style={{ padding: '1rem 1.1rem', background: 'var(--ink-soft)', borderRadius: '4px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '.45rem' }}>
                ★ Yahoo connection
              </div>
              <p style={{ margin: 0, lineHeight: 1.55, color: 'var(--cream)' }}>
                Yahoo needs a one-time login so we can read your leagues. Read-only — no roster moves.
              </p>
              <a href="/api/yahoo/authorize" className="dc-btn" style={{ marginTop: '.85rem', display: 'inline-block' }}>
                Connect Yahoo →
              </a>
            </div>
          </div>
        ) : (
          <div className="dc-field">
            <label className="dc-label">Pick your Yahoo league</label>
            {isLoadingYahoo && <p className="dc-checkbox-hint">Loading your Yahoo leagues…</p>}
            {yahooError && <p className="dc-form-error" style={{ margin: '.4rem 0 0' }}>{yahooError}</p>}
            {yahooLeagues && yahooLeagues.length === 0 && !isLoadingYahoo && !yahooError && (
              <p className="dc-checkbox-hint">No NFL leagues found on your Yahoo account.</p>
            )}
            {yahooLeagues && yahooLeagues.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', marginTop: '.35rem' }}>
                {yahooLeagues.map((lg) => {
                  const sel = lg.league_key === pickedYahooKey
                  const yrs = lg.seasons.length === 0 ? '?' : lg.seasons.length === 1 ? lg.seasons[0] : `${lg.seasons[0]}–${lg.seasons.at(-1)}`
                  return (
                    <button
                      key={lg.league_key}
                      type="button"
                      onClick={() => pickYahooLeague(lg)}
                      style={pickRowStyle(sel)}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lg.name}</span>
                        <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: '.7rem', opacity: 0.6 }}>{yrs} · {lg.num_teams} teams</span>
                      </span>
                      <span style={{ color: 'var(--gold)', fontFamily: 'var(--mono)', fontSize: '.7rem' }}>{sel ? '✓' : '→'}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      ) : (
        <>
          {/* ── Sleeper / ESPN / NFL: league ID ──────────────────────────── */}
          <div className="dc-field">
            <label htmlFor="leagueId" className="dc-label">League ID</label>
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <input
                id="leagueId"
                value={leagueId}
                onChange={(e) => setLeagueId(e.target.value)}
                placeholder={idPlaceholder}
                className="dc-input mono"
                style={{ flex: 1 }}
              />
              <button type="button" onClick={runLookup} disabled={isLooking || !leagueId.trim()} className="dc-btn" style={{ flex: '0 0 auto' }}>
                {isLooking ? 'Finding…' : 'Find members'}
              </button>
            </div>
            {platform === 'nfl' && <span className="dc-checkbox-hint">fantasy.nfl.com/league/<strong>7528632</strong> — league must be public.</span>}
            {platform === 'espn' && <span className="dc-checkbox-hint">fantasy.espn.com/football/league?leagueId=<strong>47847</strong></span>}
            {platform === 'sleeper' && <span className="dc-checkbox-hint">sleeper.com/leagues/<strong>1234567890123456789</strong>/team</span>}
          </div>

          {(platform === 'espn' || platform === 'nfl') && (
            <div className="dc-field">
              <label className="dc-label">Season range</label>
              <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
                <input name="seasonStart" type="number" min={2000} max={2100} value={seasonStart} onChange={(e) => setSeasonStart(e.target.value)} className="dc-input mono" style={{ flex: '0 0 6.5rem', textAlign: 'center' }} />
                <span style={{ opacity: 0.6 }}>through</span>
                <input name="seasonEnd" type="number" min={2000} max={2100} value={seasonEnd} onChange={(e) => setSeasonEnd(e.target.value)} className="dc-input mono" style={{ flex: '0 0 6.5rem', textAlign: 'center' }} />
              </div>
              <span className="dc-checkbox-hint">We read the member list from the latest year, and ingest the whole range on sync.</span>
            </div>
          )}

          {platform === 'nfl' && (
            <div className="dc-field">
              <label className="dc-label">Playoffs</label>
              <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                <select name="playoffWeekStart" value={playoffWeekStart} onChange={(e) => setPlayoffWeekStart(e.target.value)} className="dc-select" style={{ flex: '0 0 9rem' }}>
                  <option value="14">Week 14</option>
                  <option value="15">Week 15</option>
                  <option value="16">Week 16</option>
                </select>
                <select name="playoffTeamCount" value={playoffTeamCount} onChange={(e) => setPlayoffTeamCount(e.target.value)} className="dc-select" style={{ flex: '0 0 9rem' }}>
                  <option value="4">4 teams</option>
                  <option value="6">6 teams</option>
                  <option value="8">8 teams</option>
                </select>
              </div>
            </div>
          )}

          {platform === 'espn' && (
            <>
              <label className="dc-checkbox-row">
                <input type="checkbox" checked={isPrivate} onChange={(e) => { setIsPrivate(e.target.checked); if (!e.target.checked) { setSwid(''); setEspnS2('') } }} />
                <span>This is a private league
                  <span className="dc-checkbox-hint">Required if ESPN asks you to sign in to view the league.</span>
                </span>
              </label>
              {isPrivate && (
                <>
                  <div className="dc-field">
                    <label className="dc-label">SWID</label>
                    <input value={swid} onChange={(e) => setSwid(e.target.value)} placeholder="{ABC12345-...}" className="dc-input mono" />
                  </div>
                  <div className="dc-field">
                    <label className="dc-label">espn_s2</label>
                    <input value={espnS2} onChange={(e) => setEspnS2(e.target.value)} placeholder="AEB...token..." className="dc-input mono" />
                    <span className="dc-checkbox-hint">DevTools → Application → Cookies → fantasy.espn.com.</span>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {lookupError && <p className="dc-form-error" style={{ margin: '.25rem 0 0' }}>{lookupError}</p>}

      {/* ── Shared member picker ───────────────────────────────────────── */}
      {members && (
        <div className="dc-field">
          <label className="dc-label">Which member is you?</label>
          <span className="dc-checkbox-hint" style={{ marginBottom: '.4rem' }}>
            Found <strong>{leagueName}</strong> · {members.length} members. Tap your identity.
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', marginTop: '.35rem' }}>
            {members.map((m) => {
              const sel = picked?.externalId === m.externalId
              return (
                <button key={m.externalId} type="button" onClick={() => setPicked(m)} style={pickRowStyle(sel)}>
                  {m.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.avatarUrl} alt="" width={32} height={32} style={{ borderRadius: '50%', flex: '0 0 32px' }} />
                  ) : (
                    <span style={{ flex: '0 0 32px', width: 32, height: 32, borderRadius: '50%', background: 'var(--ink-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--serif)', color: 'var(--gold)' }}>
                      {m.displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.displayName}</span>
                    {m.teamName && m.teamName !== m.displayName && (
                      <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: '.7rem', opacity: 0.6 }}>{m.teamName}</span>
                    )}
                  </span>
                  <span style={{ color: 'var(--gold)', fontFamily: 'var(--mono)', fontSize: '.7rem' }}>{sel ? '✓ You' : '→'}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Hidden fields carry the resolved selection into the server action. */}
      <input type="hidden" name="platform" value={platform} />
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="leagueName" value={leagueName} />
      <input type="hidden" name="managerExternalId" value={picked?.externalId ?? ''} />
      <input type="hidden" name="managerName" value={picked?.displayName ?? ''} />
      {(platform === 'espn' || platform === 'nfl') && (
        <>
          <input type="hidden" name="seasonStart" value={seasonStart} />
          <input type="hidden" name="seasonEnd" value={seasonEnd} />
        </>
      )}
      {platform === 'nfl' && (
        <>
          <input type="hidden" name="playoffWeekStart" value={playoffWeekStart} />
          <input type="hidden" name="playoffTeamCount" value={playoffTeamCount} />
        </>
      )}
      {platform === 'espn' && isPrivate && (
        <>
          <input type="hidden" name="swid" value={swid} />
          <input type="hidden" name="espnS2" value={espnS2} />
        </>
      )}

      {picked && (
        <button type="submit" disabled={isPending} className="dc-btn dc-btn-block">
          {isPending ? 'Adding…' : `Add ${picked.displayName} to my hub →`}
        </button>
      )}

      {state && !state.ok && <p className="dc-form-error">{state.error}</p>}
    </form>
  )
}

function pickRowStyle(selected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '.65rem',
    padding: '.55rem .7rem',
    background: selected ? 'rgba(232,200,137,.1)' : 'var(--ink)',
    border: `1px solid ${selected ? 'var(--gold)' : 'var(--gold-soft, rgba(200,160,80,.25))'}`,
    borderRadius: '3px',
    color: 'var(--cream)',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '.9rem',
  }
}
