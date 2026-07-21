'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { SleeperLeaguePicker } from '@/components/SleeperLeaguePicker'
import { slugify } from '@/lib/slugify'
import {
  addLeague,
  checkSlugAvailable,
  listYahooLeagues,
  previewSleeperLeague,
  previewYahooLeague,
} from './actions'

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

// Live snapshot of the form, reported upward so the desktop "binding
// press" rail (new-archive-studio.tsx) can typeset the book cover and
// tick the progress ledger as the user works. Optional — the mobile
// tree renders the form without a listener.
export type ArchiveDraft = {
  platform: 'sleeper' | 'nfl' | 'espn' | 'yahoo'
  externalId: string
  name: string
  slug: string
  slugStatus: SlugStatus
  abbreviation: string
  divisionCount: number
  divisionTerm: 'conference' | 'division'
  divisionNames: string[]
  leagueFound: boolean
}

const PLATFORM_PLATES: {
  key: 'sleeper' | 'nfl' | 'espn' | 'yahoo'
  name: string
  sub: string
}[] = [
  { key: 'sleeper', name: 'Sleeper', sub: 'Username or ID' },
  { key: 'nfl', name: 'NFL.com', sub: 'League ID' },
  { key: 'espn', name: 'ESPN', sub: 'League ID' },
  { key: 'yahoo', name: 'Yahoo', sub: 'Connect · Beta' },
]

export function AddLeagueForm({
  yahooConnected,
  onDraftChange,
}: {
  yahooConnected: boolean
  onDraftChange?: (draft: ArchiveDraft) => void
}) {
  const [state, formAction, isPending] = useActionState(addLeague, null)

  const [platform, setPlatform] = useState<'sleeper' | 'nfl' | 'espn' | 'yahoo'>('sleeper')
  const [externalId, setExternalId] = useState('')
  const [customName, setCustomName] = useState('')
  const [customSlug, setCustomSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle')
  const [abbreviation, setAbbreviation] = useState('')
  const [divisionCount, setDivisionCount] = useState(0)
  const [divisionTerm, setDivisionTerm] = useState<'conference' | 'division'>('division')
  const [divisionNames, setDivisionNames] = useState<string[]>([])
  const [previewMsg, setPreviewMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [isPreviewing, startPreview] = useTransition()

  // Yahoo league picker — populated on-demand once the user is connected and
  // chooses the Yahoo platform. The user picks one league row and we fill in
  // externalId (= league_key) + name + division setup before submit.
  type YahooPickerLeague = {
    league_key: string
    name: string
    seasons: string[]
    num_teams: number
    logo_url?: string
  }
  const [yahooLeagues, setYahooLeagues] = useState<YahooPickerLeague[] | null>(null)
  const [yahooLeaguesError, setYahooLeaguesError] = useState<string | null>(null)
  const [isLoadingYahooLeagues, startYahooLoad] = useTransition()
  const [pickedYahooKey, setPickedYahooKey] = useState<string | null>(null)
  const [pickedYahooName, setPickedYahooName] = useState<string | null>(null)

  // Lazy-load the Yahoo leagues list the first time the user lands on the
  // Yahoo platform tab (and only if they're connected). Re-runs if the user
  // disconnects/reconnects between visits, which would change yahooConnected.
  useEffect(() => {
    if (platform !== 'yahoo' || !yahooConnected) return
    if (yahooLeagues !== null || isLoadingYahooLeagues) return
    setYahooLeaguesError(null)
    startYahooLoad(async () => {
      const res = await listYahooLeagues()
      if (!res.ok) {
        setYahooLeaguesError(res.error)
        setYahooLeagues([])
        return
      }
      setYahooLeagues(res.leagues)
    })
  }, [platform, yahooConnected, yahooLeagues, isLoadingYahooLeagues])

  // Auto-fill the slug from the league name until the user edits it directly.
  // We mirror slugify() (lowercase + dashes), but bail once the user has typed
  // their own — they own the value from that point forward.
  useEffect(() => {
    if (slugTouched) return
    setCustomSlug(slugify(customName))
  }, [customName, slugTouched])

  // Debounced availability check. Empty / un-slugifiable input is "invalid"
  // (e.g. only symbols) so the submit stays gated until the user types
  // something usable.
  useEffect(() => {
    const normalized = slugify(customSlug)
    if (!normalized) {
      setSlugStatus(customSlug.length === 0 ? 'idle' : 'invalid')
      return
    }
    setSlugStatus('checking')
    const t = setTimeout(async () => {
      const res = await checkSlugAvailable(customSlug)
      setSlugStatus(res.available ? 'available' : 'taken')
    }, 350)
    return () => clearTimeout(t)
  }, [customSlug])

  const slugBlocked = slugStatus === 'taken' || slugStatus === 'invalid' || slugStatus === 'checking' || slugStatus === 'idle'

  // Report the working draft to the binding-press rail. Sleeper/Yahoo count
  // as "found" once a preview loads; NFL/ESPN have no preview step, so any
  // plausible ID counts.
  useEffect(() => {
    if (!onDraftChange) return
    onDraftChange({
      platform,
      externalId,
      name: customName,
      slug: customSlug,
      slugStatus,
      abbreviation,
      divisionCount,
      divisionTerm,
      divisionNames,
      leagueFound:
        platform === 'sleeper' || platform === 'yahoo'
          ? previewMsg?.tone === 'ok'
          : externalId.trim().length >= 3,
    })
  }, [
    onDraftChange, platform, externalId, customName, customSlug, slugStatus,
    abbreviation, divisionCount, divisionTerm, divisionNames, previewMsg,
  ])

  function handleSlugChange(v: string) {
    setSlugTouched(true)
    // Restrict input to slug-safe chars as the user types so they don't end
    // up with a value that won't survive slugify() on submit.
    const cleaned = v.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+/, '')
    setCustomSlug(cleaned)
  }

  const slugField = customName.length > 0 ? (
    <div className="dc-field">
      <label htmlFor="customSlug" className="dc-label">League URL</label>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: '.7rem',
            fontFamily: 'var(--mono)',
            fontSize: '.8rem',
            color: 'var(--cream-mute)',
            pointerEvents: 'none',
          }}
        >
          /league/
        </span>
        <input
          id="customSlug"
          name="customSlug"
          value={customSlug}
          onChange={(e) => handleSlugChange(e.target.value)}
          className="dc-input mono"
          maxLength={60}
          style={{ flex: 1, paddingLeft: '4.4rem', paddingRight: '2.4rem' }}
        />
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: '.8rem',
            fontFamily: 'var(--mono)',
            fontSize: '1rem',
            color:
              slugStatus === 'available' ? 'var(--gold)' :
              slugStatus === 'taken' || slugStatus === 'invalid' ? '#e76f51' :
              'var(--cream-mute)',
          }}
        >
          {slugStatus === 'checking' ? '…' :
            slugStatus === 'available' ? '✓' :
            slugStatus === 'taken' || slugStatus === 'invalid' ? '✗' : ''}
        </span>
      </div>
      <span className="dc-checkbox-hint">
        {slugStatus === 'available' && 'Available.'}
        {slugStatus === 'taken' && 'That URL is already taken. Pick another.'}
        {slugStatus === 'invalid' && 'Use letters, numbers, and dashes.'}
        {slugStatus === 'checking' && 'Checking…'}
        {slugStatus === 'idle' && 'Auto-filled from your league name. Edit if you like.'}
      </span>
    </div>
  ) : null

  function selectYahooLeague(lg: YahooPickerLeague) {
    setPickedYahooKey(lg.league_key)
    setPickedYahooName(lg.name)
    setExternalId(lg.league_key)
    startPreview(async () => {
      const res = await previewYahooLeague(lg.league_key)
      if (!res.ok) {
        setPreviewMsg({ tone: 'err', text: res.error })
        return
      }
      if (!customName) setCustomName(res.name)
      setDivisionCount(res.divisionCount)
      setDivisionNames(res.divisionNames)
      setPreviewMsg({
        tone: 'ok',
        text: `Loaded "${res.name}" (${res.season})${res.divisionCount > 0 ? ` · ${res.divisionCount} divisions` : ''}.`,
      })
    })
  }

  // NFL- + ESPN-shared fields. Default range ends one year back so we don't
  // try to read an in-progress season that may not have public data yet.
  const [seasonStart, setSeasonStart] = useState('2023')
  const [seasonEnd, setSeasonEnd] = useState('2025')
  const [playoffWeekStart, setPlayoffWeekStart] = useState('15')
  const [playoffTeamCount, setPlayoffTeamCount] = useState('6')
  // ESPN-only private-league cookies
  const [swid, setSwid] = useState('')
  const [espnS2, setEspnS2] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [pprMode, setPprMode] = useState<'ppr' | 'half' | 'std'>('ppr')
  const [superflex, setSuperflex] = useState(false)
  const [passTdPts, setPassTdPts] = useState<'4' | '6'>('6')
  const draftScoringProfile = `${pprMode}_${passTdPts}pt` as 'ppr_6pt' | 'half_4pt' | 'ppr_4pt' | 'half_6pt' | 'std_4pt' | 'std_6pt'

  function handlePreview(idOverride?: string) {
    const id = idOverride ?? externalId
    setPreviewMsg(null)
    startPreview(async () => {
      const res = await previewSleeperLeague(id)
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
      <Chapter num="§" title="Choose the press">
        <input type="hidden" name="platform" value={platform} />
        <div className="dc-plat-grid" role="group" aria-label="Platform">
          {PLATFORM_PLATES.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={platform === p.key}
              className={`dc-plat${platform === p.key ? ' is-on' : ''}`}
              onClick={() => setPlatform(p.key)}
            >
              <span className="dc-plat-name">{p.name}</span>
              <span className="dc-plat-sub">{p.sub}</span>
            </button>
          ))}
        </div>
      </Chapter>

      {platform === 'yahoo' ? (
        <>
          {!yahooConnected ? (
            <Chapter num="Ch. I" title="Locate the manuscript">
            <div className="dc-field">
              <div style={{ padding: '1rem 1.1rem', background: 'var(--ink-soft)', borderRadius: '4px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '.45rem' }}>
                  ★ Yahoo connection
                </div>
                <p style={{ margin: 0, lineHeight: 1.55, color: 'var(--cream)' }}>
                  Yahoo requires you to log in once so we can read your leagues. We only get
                  read access, no roster moves, no posting.
                </p>
                <a
                  href="/api/yahoo/authorize"
                  className="dc-btn"
                  style={{ marginTop: '.85rem', display: 'inline-block' }}
                >
                  Connect Yahoo
                </a>
              </div>
            </div>
            </Chapter>
          ) : (
            <>
              <Chapter num="Ch. I" title="Locate the manuscript">
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
                  <span className="dc-checkbox-hint">
                    Deduped by Yahoo&apos;s renew chain, so each league appears once at its
                    most-recent season. Walk-history covers the rest.
                  </span>
                )}
                {yahooLeagues && yahooLeagues.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', marginTop: '.35rem' }}>
                    {yahooLeagues.map((lg) => {
                      const picked = lg.league_key === pickedYahooKey
                      const yrs = lg.seasons.length === 0
                        ? '?'
                        : lg.seasons.length === 1
                        ? lg.seasons[0]
                        : `${lg.seasons[0]}–${lg.seasons.at(-1)}`
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
                              {yrs} · {lg.num_teams} teams
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
                {previewMsg && (
                  <p className={previewMsg.tone === 'ok' ? 'dc-form-ok' : 'dc-form-error'} style={{ margin: '.5rem 0 0' }}>
                    {previewMsg.text}
                  </p>
                )}
              </div>
              </Chapter>

              <Chapter num="Ch. II" title="The title page">
              <div className="dc-field">
                <label htmlFor="customName" className="dc-label">League name (optional)</label>
                <input
                  id="customName"
                  name="customName"
                  maxLength={80}
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Auto-filled from Yahoo"
                  className="dc-input"
                />
              </div>

              {slugField}
              </Chapter>

              <Chapter num="Ch. III" title="Set the type">
              <div className="dc-field">
                <label htmlFor="draftScoringProfile" className="dc-label">Draft scoring profile</label>
                <input type="hidden" name="draftScoringProfile" value={draftScoringProfile} />
                <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', flex: '1 1 12rem' }}>
                    <span className="dc-checkbox-hint" style={{ margin: 0 }}>Reception scoring</span>
                    <select value={pprMode} onChange={(e) => setPprMode(e.target.value as typeof pprMode)} className="dc-select">
                      <option value="ppr">Full PPR (1 pt/catch)</option>
                      <option value="half">Half PPR (0.5 pt/catch)</option>
                      <option value="std">Standard (no PPR)</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', flex: '1 1 12rem' }}>
                    <span className="dc-checkbox-hint" style={{ margin: 0 }}>Passing TDs</span>
                    <select value={passTdPts} onChange={(e) => setPassTdPts(e.target.value as typeof passTdPts)} className="dc-select">
                      <option value="6">6 points</option>
                      <option value="4">4 points</option>
                    </select>
                  </div>
                </div>
                <input type="hidden" name="superflex" value={superflex ? 'true' : 'false'} />
                <label className="dc-checkbox-row" style={{ marginTop: '.75rem' }}>
                  <input type="checkbox" checked={superflex} onChange={(e) => setSuperflex(e.target.checked)} />
                  <span>Superflex<span className="dc-checkbox-hint">Second QB-eligible starter. Adds a SUPERFLEX slot to the All-Time Team.</span></span>
                </label>
              </div>
              </Chapter>

              <input type="hidden" name="divisionCount" value={divisionCount} />
              <input type="hidden" name="divisionTerm" value={divisionTerm} />
              {divisionNames.map((n, i) => (
                <input key={i} type="hidden" name={`divisionName-${i}`} value={n} />
              ))}
              <input type="hidden" name="abbreviation" value={abbreviation} />

              <p className="dc-checkbox-hint" style={{ marginTop: '.25rem' }}>
                Once your archive is created, history sync for Yahoo runs from the league page.
                We&apos;ll pull every season your league chain can reach.
              </p>

              <Chapter num="✦" title="The binding">
              <button
                type="submit"
                disabled={isPending || !pickedYahooKey || slugBlocked}
                className="dc-btn dc-btn-block"
              >
                {isPending
                  ? 'Binding…'
                  : !pickedYahooKey
                  ? 'Pick a league first'
                  : slugStatus === 'taken'
                  ? 'Change the URL to continue'
                  : slugStatus === 'invalid'
                  ? 'Enter a valid URL'
                  : 'Bind this volume'}
              </button>
              {state && !state.ok && <p className="dc-form-error">{state.error}</p>}
              </Chapter>
            </>
          )}
        </>
      ) : (
      <>
      <Chapter num="Ch. I" title="Locate the manuscript">
      {platform === 'sleeper' ? (
        <>
          <SleeperLeaguePicker
            externalId={externalId}
            setExternalId={setExternalId}
            detect={{ onDetect: (id) => handlePreview(id), isDetecting: isPreviewing }}
            onSelected={(id) => handlePreview(id)}
          />
          {previewMsg && (
            <p className={previewMsg.tone === 'ok' ? 'dc-form-ok' : 'dc-form-error'} style={{ margin: '.5rem 0 0' }}>
              {previewMsg.text}
            </p>
          )}
        </>
      ) : (
        <div className="dc-field">
          <label htmlFor="externalId" className="dc-label">League ID</label>
          <input
            id="externalId"
            name="externalId"
            required
            placeholder={platform === 'nfl' ? '7528632' : '47847'}
            value={externalId}
            onChange={(e) => setExternalId(e.target.value)}
            className="dc-input mono"
            style={{ flex: 1 }}
          />
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
      )}
      </Chapter>

      <Chapter num="Ch. II" title="The title page">
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

      {slugField}

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
      </Chapter>

      <Chapter num="Ch. III" title="Set the chapters">
      <div className="dc-field">
        <label className="dc-label">Draft scoring profile</label>
        <input type="hidden" name="draftScoringProfile" value={draftScoringProfile} />
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', flex: '1 1 12rem' }}>
            <span className="dc-checkbox-hint" style={{ margin: 0 }}>Reception scoring</span>
            <select
              value={pprMode}
              onChange={(e) => setPprMode(e.target.value as typeof pprMode)}
              className="dc-select"
            >
              <option value="ppr">Full PPR (1 pt/catch)</option>
              <option value="half">Half PPR (0.5 pt/catch)</option>
              <option value="std">Standard (no PPR)</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', flex: '1 1 12rem' }}>
            <span className="dc-checkbox-hint" style={{ margin: 0 }}>Passing TDs</span>
            <select
              value={passTdPts}
              onChange={(e) => setPassTdPts(e.target.value as typeof passTdPts)}
              className="dc-select"
            >
              <option value="6">6 points</option>
              <option value="4">4 points</option>
            </select>
          </div>
        </div>
        <span className="dc-checkbox-hint">
          Used to grade past drafts (Steal of the Year, Bust of the Year, Heartbreakers).
          End-of-season FantasyPros totals are evaluated under this scoring. Change anytime in League Settings.
        </span>
        <input type="hidden" name="superflex" value={superflex ? 'true' : 'false'} />
        <label className="dc-checkbox-row" style={{ marginTop: '.75rem' }}>
          <input type="checkbox" checked={superflex} onChange={(e) => setSuperflex(e.target.checked)} />
          <span>Superflex<span className="dc-checkbox-hint">Second QB-eligible starter. Adds a SUPERFLEX slot to the All-Time Team.</span></span>
        </label>
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
              <span style={{ color: 'var(--cream-mute)', fontWeight: 500, fontFamily: 'var(--mono)', fontSize: '.85rem' }}>through</span>
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
              <span style={{ color: 'var(--cream-mute)', fontWeight: 500, fontFamily: 'var(--mono)', fontSize: '.85rem' }}>through</span>
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
                Cookies expire periodically. You can refresh them later from the league&apos;s sources page.
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
                  Easy mode: install our{' '}
                  <a href="/tools/espn-cookies/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)' }}>
                    one-click bookmarklet
                  </a>
                  {' '}to grab both with a single click on fantasy.espn.com. Or
                  manually: DevTools → Application → Cookies → fantasy.espn.com.
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
      </Chapter>

      <Chapter num="✦" title="The binding">
      <button
        type="submit"
        disabled={isPending || slugBlocked}
        className="dc-btn dc-btn-block"
      >
        {isPending
          ? 'Binding…'
          : slugStatus === 'taken'
          ? 'Change the URL to continue'
          : slugStatus === 'invalid'
          ? 'Enter a valid URL'
          : 'Bind this volume'}
      </button>

      {state && !state.ok && <p className="dc-form-error">{state.error}</p>}
      </Chapter>
      </>
      )}
    </form>
  )
}

// Book-themed section wrapper: a chapter heading (numeral, italic title,
// double rule) over a stack of fields. Renders fine on the dark mobile
// card too — the paper-manuscript look comes from .dc-press-page on the
// desktop wrapper, not from these classes.
function Chapter({
  num,
  title,
  children,
}: {
  num: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="dc-msc">
      <header className="dc-msc-head">
        <span className="dc-msc-num">{num}</span>
        <span className="dc-msc-title">{title}</span>
        <span className="dc-msc-rule" aria-hidden />
      </header>
      <div className="dc-msc-body">{children}</div>
    </section>
  )
}
