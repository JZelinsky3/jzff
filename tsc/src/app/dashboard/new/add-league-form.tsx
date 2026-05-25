'use client'

import { useActionState, useState, useTransition } from 'react'
import { addLeague, previewSleeperLeague } from './actions'

export function AddLeagueForm() {
  const [state, formAction, isPending] = useActionState(addLeague, null)

  const [platform, setPlatform] = useState<'sleeper' | 'nfl' | 'espn' | 'yahoo'>('sleeper')
  const [externalId, setExternalId] = useState('')
  const [customName, setCustomName] = useState('')
  const [abbreviation, setAbbreviation] = useState('')
  const [divisionCount, setDivisionCount] = useState(0)
  const [divisionTerm, setDivisionTerm] = useState<'conference' | 'division'>('division')
  const [divisionNames, setDivisionNames] = useState<string[]>([])
  const [previewMsg, setPreviewMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [isPreviewing, startPreview] = useTransition()

  // NFL- + ESPN-shared fields
  const thisYear = new Date().getFullYear()
  const [seasonStart, setSeasonStart] = useState(String(thisYear - 4))
  const [seasonEnd, setSeasonEnd] = useState(String(thisYear))
  const [playoffWeekStart, setPlayoffWeekStart] = useState('15')
  const [playoffTeamCount, setPlayoffTeamCount] = useState('6')
  // ESPN-only private-league cookies
  const [swid, setSwid] = useState('')
  const [espnS2, setEspnS2] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)

  function handlePreview() {
    setPreviewMsg(null)
    startPreview(async () => {
      const res = await previewSleeperLeague(externalId)
      if (!res.ok) {
        setPreviewMsg({ tone: 'err', text: res.error })
        return
      }
      if (!customName) setCustomName(res.name)
      setDivisionCount(res.divisionCount)
      setDivisionNames(res.divisionNames)
      setPreviewMsg({
        tone: 'ok',
        text: `Found "${res.name}"${res.divisionCount > 0 ? ` · ${res.divisionCount} ${divisionTerm}${res.divisionCount > 1 ? 's' : ''} detected` : ''}.`,
      })
    })
  }

  function setNameAt(i: number, v: string) {
    setDivisionNames((prev) => {
      const next = [...prev]
      while (next.length < i + 1) next.push('')
      next[i] = v
      return next.slice(0, Math.max(divisionCount, next.length))
    })
  }

  function setCount(n: number) {
    const clamped = Math.max(0, Math.min(4, n))
    setDivisionCount(clamped)
    setDivisionNames((prev) => {
      const next = [...prev]
      while (next.length < clamped) next.push('')
      return next.slice(0, clamped)
    })
  }

  return (
    <form action={formAction} className="dc-form">
      <div className="dc-field">
        <label htmlFor="platform" className="dc-label">Platform</label>
        <select
          id="platform"
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
      </div>

      <div className="dc-field">
        <label htmlFor="externalId" className="dc-label">League ID</label>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <input
            id="externalId"
            name="externalId"
            required
            placeholder={
              platform === 'nfl' ? '7528632'
              : platform === 'espn' ? '47847'
              : '1234567890123456789'
            }
            value={externalId}
            onChange={(e) => setExternalId(e.target.value)}
            className="dc-input mono"
            style={{ flex: 1 }}
          />
          {platform === 'sleeper' && (
            <button
              type="button"
              className="dc-btn-ghost"
              onClick={handlePreview}
              disabled={isPreviewing || !externalId.trim()}
            >
              {isPreviewing ? 'Detecting…' : 'Detect'}
            </button>
          )}
        </div>
        {previewMsg && (
          <p className={previewMsg.tone === 'ok' ? 'dc-form-ok' : 'dc-form-error'} style={{ margin: '.5rem 0 0' }}>
            {previewMsg.text}
          </p>
        )}
        {platform === 'nfl' && (
          <span className="dc-checkbox-hint">
            Find this in your NFL Fantasy URL: <span style={{ fontFamily: 'var(--mono)' }}>fantasy.nfl.com/league/<strong>7528632</strong></span>. League must be set to public.
          </span>
        )}
        {platform === 'espn' && (
          <span className="dc-checkbox-hint">
            From your ESPN URL: <span style={{ fontFamily: 'var(--mono)' }}>fantasy.espn.com/football/league?leagueId=<strong>47847</strong></span>. Playoff config is read automatically from ESPN&apos;s API.
          </span>
        )}
      </div>

      <div className="dc-field">
        <label htmlFor="customName" className="dc-label">League name (optional)</label>
        <input
          id="customName"
          name="customName"
          maxLength={80}
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="Auto-filled from your platform"
          className="dc-input"
        />
      </div>

      <div className="dc-field">
        <label htmlFor="abbreviation" className="dc-label">Abbreviation (optional)</label>
        <input
          id="abbreviation"
          name="abbreviation"
          maxLength={16}
          value={abbreviation}
          onChange={(e) => setAbbreviation(e.target.value.toUpperCase())}
          placeholder={customName ? customName.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 6) : 'PAMS, TBSL, etc.'}
          className="dc-input mono"
          style={{ textTransform: 'uppercase' }}
        />
        <span className="dc-checkbox-hint">
          Short label used on the public almanac. Leave blank to use initials.
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
            <span className="dc-checkbox-hint">
              We&apos;ll fetch each season&apos;s history page. Older seasons your league predates will be skipped with a warning.
            </span>
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
            <span className="dc-checkbox-hint">
              Only the championship-bracket games count toward playoff records.
              Consolation games are tracked but excluded.
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
              ESPN auto-falls-back to its history archive for older seasons, so you can
              walk back as far as the league existed.
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
                Required if ESPN asks you to sign in when visiting the league URL.
                Cookies expire periodically — you can refresh them later from the league&apos;s sources page.
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
                <span className="dc-checkbox-hint">
                  Get both from a logged-in ESPN tab: DevTools → Application → Cookies → fantasy.espn.com.
                </span>
              </div>
            </>
          )}
        </>
      )}

      <div className="dc-field">
        <label className="dc-label">Conferences / Divisions</label>
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
          <select
            name="divisionCount"
            value={divisionCount}
            onChange={(e) => setCount(parseInt(e.target.value, 10))}
            className="dc-select"
            style={{ flex: '0 0 8rem' }}
          >
            <option value={0}>None</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
          <select
            name="divisionTerm"
            value={divisionTerm}
            onChange={(e) => setDivisionTerm(e.target.value as 'conference' | 'division')}
            className="dc-select"
            style={{ flex: '0 0 10rem' }}
            disabled={divisionCount === 0}
          >
            <option value="division">Division</option>
            <option value="conference">Conference</option>
          </select>
        </div>
        <span className="dc-checkbox-hint">
          Auto-detected from your platform. Pick the term your league actually uses.
        </span>
      </div>

      {divisionCount > 0 && (
        <div className="dc-field">
          <label className="dc-label">{divisionTerm === 'conference' ? 'Conference' : 'Division'} names</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {Array.from({ length: divisionCount }).map((_, i) => (
              <input
                key={i}
                name={`divisionName-${i}`}
                value={divisionNames[i] ?? ''}
                onChange={(e) => setNameAt(i, e.target.value)}
                placeholder={`${divisionTerm === 'conference' ? 'Conference' : 'Division'} ${i + 1}`}
                className="dc-input"
                maxLength={40}
              />
            ))}
          </div>
        </div>
      )}

      <button type="submit" disabled={isPending} className="dc-btn dc-btn-block">
        {isPending ? 'Validating…' : 'Create archive →'}
      </button>

      {state && !state.ok && <p className="dc-form-error">{state.error}</p>}
    </form>
  )
}
