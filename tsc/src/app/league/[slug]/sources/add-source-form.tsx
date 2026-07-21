'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
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

type Platform = 'sleeper' | 'nfl' | 'espn' | 'yahoo'

// Prefill for the "extend an attached source" flow: re-choose a league that
// is already on the ledger and only pick the next stretch of years / a new
// playoff config, instead of re-typing the ID from scratch.
export type SourcePrefill = {
  platform: Platform
  externalId: string
  label?: string | null
  seasonStart?: number | null
  seasonEnd?: number | null
  playoffWeekStart?: number | null
  playoffTeamCount?: number | null
}

const PLATFORM_TILES: { key: Platform; name: string; sub: string }[] = [
  { key: 'sleeper', name: 'Sleeper', sub: 'Walks history' },
  { key: 'espn', name: 'ESPN', sub: 'Public or private' },
  { key: 'nfl', name: 'NFL.com', sub: 'Public leagues' },
  { key: 'yahoo', name: 'Yahoo', sub: 'Beta · connect' },
]

function describeYahooRange(seasons: string[]): string {
  if (seasons.length === 0) return '?'
  if (seasons.length === 1) return seasons[0]
  return `${seasons[0]}–${seasons.at(-1)}`
}

export function AddSourceForm({
  leagueId,
  slug,
  yahooConnected,
  prefill,
  onSuccess,
}: {
  leagueId: string
  slug: string
  yahooConnected: boolean
  // When set, the form opens pre-loaded with that league's platform + ID so
  // the user only chooses the new year range / playoff rules.
  prefill?: SourcePrefill | null
  onSuccess?: () => void
}) {
  const [state, action, isPending] = useActionState<Result, FormData>(
    addSource as (prev: Result, fd: FormData) => Promise<Result>,
    null
  )
  const [walk, setWalk] = useState(false)
  const [platform, setPlatform] = useState<Platform>(prefill?.platform ?? 'sleeper')
  const thisYear = new Date().getFullYear()
  const [seasonStart, setSeasonStart] = useState(String(prefill?.seasonStart ?? thisYear - 4))
  const [seasonEnd, setSeasonEnd] = useState(String(prefill?.seasonEnd ?? thisYear))
  const [playoffWeekStart, setPlayoffWeekStart] = useState(String(prefill?.playoffWeekStart ?? '15'))
  const [playoffTeamCount, setPlayoffTeamCount] = useState(String(prefill?.playoffTeamCount ?? '6'))
  const [swid, setSwid] = useState('')
  const [espnS2, setEspnS2] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [sleeperExternalId, setSleeperExternalId] = useState(
    prefill?.platform === 'sleeper' ? prefill.externalId : ''
  )
  const [manualExternalId, setManualExternalId] = useState(
    prefill && prefill.platform !== 'sleeper' && prefill.platform !== 'yahoo' ? prefill.externalId : ''
  )
  const [label, setLabel] = useState('')

  // Fire the success callback exactly once per successful submit.
  const successHandled = useRef(false)
  useEffect(() => {
    if (state && 'ok' in state && state.ok && !successHandled.current) {
      successHandled.current = true
      onSuccess?.()
    }
    if (state && 'ok' in state && !state.ok) successHandled.current = false
  }, [state, onSuccess])

  // Yahoo league picker — fetched on demand from the connected user's account.
  const [yahooLeagues, setYahooLeagues] = useState<YahooPickerLeague[] | null>(null)
  const [yahooLeaguesError, setYahooLeaguesError] = useState<string | null>(null)
  const [isLoadingYahooLeagues, startYahooLoad] = useTransition()
  const [pickedYahooKey, setPickedYahooKey] = useState<string | null>(
    prefill?.platform === 'yahoo' ? prefill.externalId : null
  )
  const [pickedYahooName, setPickedYahooName] = useState<string | null>(null)

  useEffect(() => {
    if (platform !== 'yahoo' || !yahooConnected) return
    if (yahooLeagues !== null || isLoadingYahooLeagues) return
    startYahooLoad(async () => {
      setYahooLeaguesError(null)
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

  const extending = !!prefill

  return (
    <form action={action} className="dc-form">
      <input type="hidden" name="leagueId" value={leagueId} />

      {extending && (
        <div className="lo-note">
          <div className="lo-note-head"><span className="pin">✦</span> Extending an attached league</div>
          <div className="lo-note-body">
            Platform and league ID are carried over from the ledger. Pick the new
            stretch of years (and playoff rules where they apply), then add it as
            its own source. The two sources sync independently and never
            double-count a season as long as their year ranges don&apos;t overlap.
          </div>
        </div>
      )}

      <div className="dc-field">
        <label className="dc-label">Platform</label>
        <input type="hidden" name="platform" value={platform} />
        <div className="lo-tiles">
          {PLATFORM_TILES.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`lo-tile${platform === t.key ? ' on' : ''}`}
              onClick={() => setPlatform(t.key)}
              disabled={extending && t.key !== platform}
              style={extending && t.key !== platform ? { opacity: 0.35, cursor: 'default' } : undefined}
            >
              <span className="lo-tile-name">{t.name}</span>
              <span className="lo-tile-sub">{t.sub}</span>
            </button>
          ))}
        </div>
        {platform === 'sleeper' && (
          <span className="dc-checkbox-hint">
            Sleeper can walk its own chain of past seasons automatically. Turn on
            walk-history below and one ID covers the whole run.
          </span>
        )}
        {platform === 'nfl' && (
          <span className="dc-checkbox-hint">
            League must be set to public on NFL.com. You pick the year range and
            the playoff rules for that range; if the rules changed mid-history,
            split it into two sources (see the field guide above the form).
          </span>
        )}
        {platform === 'espn' && (
          <span className="dc-checkbox-hint">
            Public leagues need only the league ID. Private leagues also need your
            SWID + espn_s2 cookies from a logged-in ESPN tab (DevTools, then
            Application, then Cookies). Playoff config is read from ESPN automatically.
          </span>
        )}
        {platform === 'yahoo' && (
          <span className="dc-checkbox-hint">
            Yahoo requires a one-time read-only connect. Once linked, pick a league
            from the list; Yahoo fills in the rest. Walk-history follows the renew
            chain back through prior seasons.
          </span>
        )}
      </div>

      {platform === 'sleeper' ? (
        extending ? (
          <div className="dc-field">
            <label className="dc-label">League ID</label>
            <input
              name="externalId"
              value={sleeperExternalId}
              readOnly
              className="dc-input mono"
              style={{ opacity: 0.7 }}
            />
          </div>
        ) : (
          <SleeperLeaguePicker
            externalId={sleeperExternalId}
            setExternalId={setSleeperExternalId}
          />
        )
      ) : platform === 'yahoo' ? (
        !yahooConnected ? (
          <div className="dc-field">
            <div className="lo-note steel">
              <div className="lo-note-head"><span className="pin">✦</span> Yahoo connection</div>
              <div className="lo-note-body">
                Yahoo requires you to log in once so we can read your leagues.
                Read-only access: no roster moves, no posting on your behalf.
              </div>
              <a
                href={`/api/yahoo/authorize?from=${encodeURIComponent(`/league/${slug}/sources`)}`}
                className="lo-btn sm"
                style={{ marginTop: '.85rem' }}
              >
                Connect Yahoo
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
                No NFL leagues found on your Yahoo account for the last 15 seasons.
                If you&apos;re expecting some, make sure you connected the right
                Yahoo account.
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
                      className={`lo-tile${picked ? ' on' : ''}`}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: '.65rem' }}
                    >
                      {lg.logo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={lg.logo_url} alt="" width={28} height={28} style={{ borderRadius: '3px', flex: '0 0 28px' }} />
                      )}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="lo-tile-name" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {lg.name}
                        </span>
                        <span className="lo-tile-sub">
                          {describeYahooRange(lg.seasons)} · {lg.num_teams} teams
                        </span>
                      </span>
                      <span style={{ color: 'var(--gold)', fontFamily: 'var(--mono)', fontSize: '.7rem' }}>
                        {picked ? '✓' : ''}
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
            value={manualExternalId}
            onChange={(e) => setManualExternalId(e.target.value)}
            readOnly={extending}
            placeholder={platform === 'nfl' ? '7528632' : '123456'}
            className="dc-input mono"
            style={extending ? { opacity: 0.7 } : undefined}
          />
        </div>
      )}

      <div className="dc-field">
        <label className="dc-label">Label (optional)</label>
        <input
          name="label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={extending ? 'e.g. 2021 onward, new playoff format' : 'e.g. Old league 2018-2020'}
          className="dc-input"
        />
        <span className="dc-checkbox-hint">
          Only you see this. Handy for telling two eras of the same league apart.
        </span>
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
            <label className="dc-label">Playoffs for this range</label>
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
            <span className="dc-checkbox-hint">
              Heads up: the NFL added a 17th game in 2021, so many leagues moved
              their playoffs a week later that year. If this range crosses 2021
              and your playoff week changed, split it into two sources with the
              right week on each.
            </span>
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
              ESPN moved older seasons to its history archive; we fall back to
              that endpoint automatically when needed.
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
                Stored as part of the source config and sent on every sync.
                Cookies eventually expire; refresh them here when a sync starts failing.
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
              defaultValue={prefill?.seasonStart ?? undefined}
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
              defaultValue={prefill?.seasonEnd ?? undefined}
              className="dc-input mono"
              style={{ flex: '0 0 6.5rem', textAlign: 'center' }}
            />
          </div>
          <span className="dc-checkbox-hint">
            Leave blank to ingest every season the chain reaches. Set bounds when
            another source already covers some years; it prevents double-counting
            when leagues bounce between platforms.
          </span>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || (platform === 'yahoo' && (!yahooConnected || !pickedYahooKey))}
        className="lo-btn block"
      >
        {isPending
          ? 'Validating…'
          : platform === 'yahoo' && !yahooConnected
          ? 'Connect Yahoo first'
          : platform === 'yahoo' && !pickedYahooKey
          ? 'Pick a Yahoo league first'
          : extending
          ? 'Add this range as a source'
          : 'Add source'}
      </button>

      {state && 'ok' in state && !state.ok && <p className="dc-form-error">{state.error}</p>}
      {state && 'ok' in state && state.ok && (
        <p className="dc-form-ok">Source added. Click &quot;Sync&quot; on it to import.</p>
      )}
    </form>
  )
}
