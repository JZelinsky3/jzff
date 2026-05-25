'use client'

import { useActionState, useState } from 'react'
import { addSource } from './actions'

type Result = { ok: false; error: string } | { ok: true } | null

export function AddSourceForm({ leagueId }: { leagueId: string }) {
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
          <option value="yahoo">Yahoo (coming soon)</option>
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
      </div>

      <div className="dc-field">
        <label className="dc-label">League ID</label>
        <input
          name="externalId"
          required
          placeholder={
            platform === 'nfl' ? '7528632'
            : platform === 'espn' ? '123456'
            : '1234567890123456789'
          }
          className="dc-input mono"
        />
      </div>

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

      <button type="submit" disabled={isPending} className="dc-btn dc-btn-block">
        {isPending ? 'Validating…' : 'Add source →'}
      </button>

      {state && 'ok' in state && !state.ok && <p className="dc-form-error">{state.error}</p>}
      {state && 'ok' in state && state.ok && (
        <p className="dc-form-ok">Source added. Click &quot;Sync now&quot; on it to import.</p>
      )}
    </form>
  )
}
