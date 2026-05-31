'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { SleeperLeaguePicker } from '@/components/SleeperLeaguePicker'
import { addSource, listYahooLeaguesForSources } from './actions'

type Result = { ok: false; error: string } | { ok: true } | null

type YahooPickerLeague = {
  league_key: string
  name: string
  seasons: string[]
  num_teams: number
  logo_url?: string
}

function describeYahooRange(seasons: string[]): string {
  if (seasons.length === 0) return '?'
  if (seasons.length === 1) return seasons[0]
  return `${seasons[0]}–${seasons.at(-1)}`
}

export function AddSourceForm({
  leagueId,
  slug,
  yahooConnected,
}: {
  leagueId: string
  slug: string
  yahooConnected: boolean
}) {
  const [state, action, isPending] = useActionState<Result, FormData>(
    addSource as (prev: Result, fd: FormData) => Promise<Result>,
    null
  )
  const [walk, setWalk] = useState(false)
  const [platform, setPlatform] = useState<'sleeper' | 'nfl' | 'espn' | 'yahoo'>('sleeper')
  const thisYear = new Date().getFullYear()
  const [seasonStart, setSeasonStart] = useState(String(thisYear - 4))
  const [seasonEnd, setSeasonEnd] = useState(String(thisYear))
  const [playoffWeekStart, setPlayoffWeekStart] = useState('15')
  const [playoffTeamCount, setPlayoffTeamCount] = useState('6')
  const [swid, setSwid] = useState('')
  const [espnS2, setEspnS2] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [sleeperExternalId, setSleeperExternalId] = useState('')

  // Yahoo league picker — fetched on demand from the connected user's account.
  const [yahooLeagues, setYahooLeagues] = useState<YahooPickerLeague[] | null>(null)
  const [yahooLeaguesError, setYahooLeaguesError] = useState<string | null>(null)
  const [isLoadingYahooLeagues, startYahooLoad] = useTransition()
  const [pickedYahooKey, setPickedYahooKey] = useState<string | null>(null)
  const [pickedYahooName, setPickedYahooName] = useState<string | null>(null)

  useEffect(() => {
    if (platform !== 'yahoo' || !yahooConnected) return
    if (yahooLeagues !== null || isLoadingYahooLeagues) return
    setYahooLeaguesError(null)
    startYahooLoad(async () => {
      const res = await listYahooLeaguesForSources()
      if (!res.ok) {
        setYahooLeaguesError(res.error)
        setYahooLeagues([])
        return
      }
      setYahooLeagues(res.leagues)
    })
  }, [platform, yahooConnected, yahooLeagues, isLoadingYahooLeagues])

  function selectYahooLeague(lg: YahooPickerLeague) {
    setPickedYahooKey(lg.league_key)
    setPickedYahooName(`${lg.name} (${describeYahooRange(lg.seasons)})`)
  }

  return (
    <form action={action} className="dc-form">
      <input type="hidden" name="leagueId" value={leagueId} />

      <div className="dc-field">
        <label className="dc-label">Platform</label>
        <select
          name="platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value as typeof platform)}
          className="dc-select"
        >
          <option value="sleeper">Sleeper</option>
          <option value="nfl">NFL.com</option>
          <option value="espn">ESPN</option>
          <option value="yahoo">Yahoo (beta — connect required)</option>
        </select>
        {platform === 'nfl' && (
          <span className="dc-checkbox-hint">
            NFL Fantasy changed its playoff format in 2021. Split a pre/post-2021 history into
            two sources, each with its own playoff config. League must be set to public on NFL.com.
          </span>
        )}
        {platform === 'espn' && (
          <span className="dc-checkbox-hint">
            Public leagues need only the league ID. Private leagues require your SWID + espn_s2
            cookies (grab them from a logged-in ESPN tab — DevTools → Application → Cookies).
            Playoff config is read from ESPN automatically.
          </span>
        )}
        {platform === 'yahoo' && (
          <span className="dc-checkbox-hint">
            Yahoo requires a one-time OAuth connect (read-only). Once linked, pick a league
            from the list — Yahoo gives us the rest. Turn on walk-history below to follow
            the renew chain back through prior seasons.
          </span>
        )}
      </div>

      {platform === 'sleeper' ? (
        <SleeperLeaguePicker
          externalId={sleeperExternalId}
          setExternalId={setSleeperExternalId}
        />
      ) : platform === 'yahoo' ? (
        !yahooConnected ? (
          <div className="dc-field">
            <div style={{ padding: '1rem 1.1rem', background: 'var(--ink-soft)', borderRadius: '4px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '.45rem' }}>
                ★ Yahoo connection
              </div>
              <p style={{ margin: 0, lineHeight: 1.55, color: 'var(--cream)' }}>
                Yahoo requires you to log in once so we can read your leagues. Read-only access —
                no roster moves, no posting on your behalf.
              </p>
              <a
                href={`/api/yahoo/authorize?from=${encodeURIComponent(`/league/${slug}/sources`)}`}
                className="dc-btn"
                style={{ marginTop: '.85rem', display: 'inline-block' }}
              >
                Connect Yahoo →
              </a>
            </div>
          </div>
        ) : (
          <div className="dc-field">
            <label className="dc-label">Pick your Yahoo league</label>
            <input type="hidden" name="externalId" value={pickedYahooKey ?? ''} />
            {isLoadingYahooLeagues && (
              <p className="dc-checkbox-hint">Loading your Yahoo leagues…</p>
            )}
            {yahooLeaguesError && (
              <p className="dc-form-error" style={{ margin: '.4rem 0 0' }}>{yahooLeaguesError}</p>
            )}
            {yahooLeagues && yahooLeagues.length === 0 && !isLoadingYahooLeagues && !yahooLeaguesError && (
              <p className="dc-checkbox-hint">
                No NFL leagues found on your Yahoo account for the last 15 seasons. If you&apos;re
                expecting some, make sure you connected the right Yahoo account.
              </p>
            )}
            {yahooLeagues && yahooLeagues.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', marginTop: '.35rem' }}>
                {yahooLeagues.map((lg) => {
                  const picked = lg.league_key === pickedYahooKey
                  return (
                    <button
                      key={lg.league_key}
                      type="button"
                      onClick={() => selectYahooLeague(lg)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '.65rem',
                        padding: '.55rem .7rem',
                        background: picked ? 'rgba(232,200,137,.1)' : 'var(--ink)',
                        border: `1px solid ${picked ? 'var(--gold)' : 'var(--gold-soft, rgba(200,160,80,.25))'}`,
                        borderRadius: '3px',
                        color: 'var(--cream)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '.9rem',
                      }}
                    >
                      {lg.logo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={lg.logo_url} alt="" width={28} height={28} style={{ borderRadius: '3px', flex: '0 0 28px' }} />
                      )}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {lg.name}
                        </span>
                        <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: '.7rem', opacity: 0.6, letterSpacing: '.05em' }}>
                          {describeYahooRange(lg.seasons)} · {lg.num_teams} teams
                        </span>
                      </span>
                      <span style={{ color: 'var(--gold)', fontFamily: 'var(--mono)', fontSize: '.7rem' }}>
                        {picked ? '✓' : '→'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {pickedYahooName && (
              <p className="dc-form-ok" style={{ margin: '.5rem 0 0' }}>
                Selected: {pickedYahooName}
              </p>
            )}
          </div>
        )
      ) : (
        <div className="dc-field">
          <label className="dc-label">League ID</label>
          <input
            name="externalId"
            required
            placeholder={platform === 'nfl' ? '7528632' : '123456'}
            className="dc-input mono"
          />
        </div>
      )}

      <div className="dc-field">
        <label className="dc-label">Label (optional)</label>
        <input name="label" placeholder="e.g. Old league 2018-2020" className="dc-input" />
      </div>

      {platform === 'nfl' && (
        <>
          <div className="dc-field">
            <label className="dc-label">Season range</label>
            <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
              <input
                name="seasonStart"
                type="number"
                min={2000}
                max={2100}
                value={seasonStart}
                onChange={(e) => setSeasonStart(e.target.value)}
                className="dc-input mono"
                style={{ flex: '0 0 6.5rem', textAlign: 'center' }}
              />
              <span style={{ opacity: 0.6 }}>through</span>
              <input
                name="seasonEnd"
                type="number"
                min={2000}
                max={2100}
                value={seasonEnd}
                onChange={(e) => setSeasonEnd(e.target.value)}
                className="dc-input mono"
                style={{ flex: '0 0 6.5rem', textAlign: 'center' }}
              />
            </div>
          </div>

          <div className="dc-field">
            <label className="dc-label">Playoffs</label>
            <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', flex: '0 0 10rem' }}>
                <span className="dc-checkbox-hint" style={{ margin: 0 }}>Start week</span>
                <select
                  name="playoffWeekStart"
                  value={playoffWeekStart}
                  onChange={(e) => setPlayoffWeekStart(e.target.value)}
                  className="dc-select"
                >
                  <option value="14">Week 14</option>
                  <option value="15">Week 15</option>
                  <option value="16">Week 16</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', flex: '0 0 10rem' }}>
                <span className="dc-checkbox-hint" style={{ margin: 0 }}>Teams</span>
                <select
                  name="playoffTeamCount"
                  value={playoffTeamCount}
                  onChange={(e) => setPlayoffTeamCount(e.target.value)}
                  className="dc-select"
                >
                  <option value="4">4 teams</option>
                  <option value="6">6 teams (2 byes)</option>
                  <option value="8">8 teams</option>
                </select>
              </div>
            </div>
          </div>
        </>
      )}

      {platform === 'espn' && (
        <>
          <div className="dc-field">
            <label className="dc-label">Season range</label>
            <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
              <input
                name="seasonStart"
                type="number"
                min={2000}
                max={2100}
                value={seasonStart}
                onChange={(e) => setSeasonStart(e.target.value)}
                className="dc-input mono"
                style={{ flex: '0 0 6.5rem', textAlign: 'center' }}
              />
              <span style={{ opacity: 0.6 }}>through</span>
              <input
                name="seasonEnd"
                type="number"
                min={2000}
                max={2100}
                value={seasonEnd}
                onChange={(e) => setSeasonEnd(e.target.value)}
                className="dc-input mono"
                style={{ flex: '0 0 6.5rem', textAlign: 'center' }}
              />
            </div>
            <span className="dc-checkbox-hint">
              ESPN moved older seasons to its history archive — we&apos;ll fall back to that
              endpoint automatically when needed.
            </span>
          </div>

          <label className="dc-checkbox-row">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => {
                setIsPrivate(e.target.checked)
                if (!e.target.checked) { setSwid(''); setEspnS2('') }
              }}
            />
            <span>
              This is a private league
              <span className="dc-checkbox-hint">
                Stored as part of the source config and sent on every sync. Cookies eventually
                expire — you&apos;ll need to refresh them periodically.
              </span>
            </span>
          </label>

          {isPrivate && (
            <>
              <div className="dc-field">
                <label className="dc-label">SWID</label>
                <input
                  name="swid"
                  value={swid}
                  onChange={(e) => setSwid(e.target.value)}
                  placeholder="{ABC12345-DEF6-7890-...}"
                  className="dc-input mono"
                />
              </div>
              <div className="dc-field">
                <label className="dc-label">espn_s2</label>
                <input
                  name="espnS2"
                  value={espnS2}
                  onChange={(e) => setEspnS2(e.target.value)}
                  placeholder="AEB...long opaque token..."
                  className="dc-input mono"
                />
              </div>
            </>
          )}
        </>
      )}

      {platform === 'sleeper' && (
        <label className="dc-checkbox-row">
          <input
            type="checkbox"
            name="walkHistory"
            checked={walk}
            onChange={(e) => setWalk(e.target.checked)}
            value="true"
          />
          <span>
            Walk <code style={{ fontFamily: 'var(--mono)', fontSize: '.85em' }}>previous_league_id</code> history
            <span className="dc-checkbox-hint">
              On: follow Sleeper&apos;s chain back from this ID. Off: only this single season is imported.
            </span>
          </span>
        </label>
      )}

      {platform === 'yahoo' && yahooConnected && (
        <label className="dc-checkbox-row">
          <input
            type="checkbox"
            name="walkHistory"
            checked={walk}
            onChange={(e) => setWalk(e.target.checked)}
            value="true"
          />
          <span>
            Walk Yahoo&apos;s <code style={{ fontFamily: 'var(--mono)', fontSize: '.85em' }}>renew</code> chain
            <span className="dc-checkbox-hint">
              On: pull every prior season Yahoo links back to from this one. Off: just this season.
            </span>
          </span>
        </label>
      )}

      {(platform === 'sleeper' || (platform === 'yahoo' && yahooConnected)) && walk && (
        <div className="dc-field">
          <label className="dc-label">Limit to year range (optional)</label>
          <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
            <input
              name="seasonStart"
              type="number"
              min={2000}
              max={2100}
              placeholder="from"
              className="dc-input mono"
              style={{ flex: '0 0 6.5rem', textAlign: 'center' }}
            />
            <span style={{ opacity: 0.6 }}>through</span>
            <input
              name="seasonEnd"
              type="number"
              min={2000}
              max={2100}
              placeholder="to"
              className="dc-input mono"
              style={{ flex: '0 0 6.5rem', textAlign: 'center' }}
            />
          </div>
          <span className="dc-checkbox-hint">
            Leave blank to ingest every season the chain reaches. Set bounds when another
            source already covers some years — prevents double-counting when leagues bounce
            between platforms.
          </span>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || (platform === 'yahoo' && (!yahooConnected || !pickedYahooKey))}
        className="dc-btn dc-btn-block"
      >
        {isPending
          ? 'Validating…'
          : platform === 'yahoo' && !yahooConnected
          ? 'Connect Yahoo first'
          : platform === 'yahoo' && !pickedYahooKey
          ? 'Pick a Yahoo league first'
          : 'Add source →'}
      </button>

      {state && 'ok' in state && !state.ok && <p className="dc-form-error">{state.error}</p>}
      {state && 'ok' in state && state.ok && (
        <p className="dc-form-ok">Source added. Click &quot;Sync now&quot; on it to import.</p>
      )}
    </form>
  )
}
