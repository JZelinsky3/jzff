'use client'

import { useActionState, useRef, useState } from 'react'
import { useChapterEdits } from '@/app/league/[slug]/chapter-book'
import { updateLeagueSettings } from './actions'

function autoAbbr(name: string): string {
  return name
    .replace(/[^A-Za-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join('')
    .slice(0, 6)
}

function slugifyClient(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

export function SettingsForm({
  leagueId,
  leagueName,
  currentSlug,
  currentAbbreviation,
  currentPrizePool,
  currentDraftScoringProfile,
  savedJustNow,
  inline = false,
}: {
  leagueId: string
  leagueName: string
  currentSlug: string
  currentAbbreviation: string | null
  currentPrizePool: string | null
  currentDraftScoringProfile: 'ppr_6pt' | 'half_4pt' | 'ppr_4pt' | 'half_6pt'
  savedJustNow: boolean
  // Rendered as a chapter of the hub's book: suppresses the action's
  // post-save redirect and hides the form's own submit, since the book
  // supplies Save in its footer.
  inline?: boolean
}) {
  const [state, formAction, isPending] = useActionState(updateLeagueSettings, null)
  const [name, setName] = useState(leagueName)
  const [abbr, setAbbr] = useState(currentAbbreviation ?? '')
  const [slug, setSlug] = useState(currentSlug)
  const [prizePool, setPrizePool] = useState(currentPrizePool ?? '')
  const [pprMode, setPprMode] = useState<'ppr' | 'half'>(currentDraftScoringProfile.startsWith('ppr') ? 'ppr' : 'half')
  const [passTdPts, setPassTdPts] = useState<'4' | '6'>(currentDraftScoringProfile.endsWith('6pt') ? '6' : '4')
  const draftScoringProfile = `${pprMode}_${passTdPts}pt` as 'ppr_6pt' | 'half_4pt' | 'ppr_4pt' | 'half_6pt'
  // Mini calculator (members × buy-in × years). User can apply it OR ignore — the
  // final number stays free-form so they can hand-enter totals that include
  // variable buy-ins across years.
  const [calcMembers, setCalcMembers] = useState('')
  const [calcBuyin, setCalcBuyin] = useState('')
  const [calcYears, setCalcYears] = useState('')
  const calcTotal = (() => {
    const m = Number(calcMembers), b = Number(calcBuyin), y = Number(calcYears)
    if (!m || !b || !y) return null
    return m * b * y
  })()
  const placeholder = autoAbbr(name)
  const previewSlug = slugifyClient(slug) || currentSlug

  // Report pending edits to the surrounding chapter book (no-op on the
  // standalone /settings page, which renders outside a book). Submitting
  // the real <form> keeps the server action's redirect + revalidation, so
  // the book's Save button just clicks it.
  const formRef = useRef<HTMLFormElement>(null)
  const dirty =
    name !== leagueName ||
    abbr !== (currentAbbreviation ?? '') ||
    slug !== currentSlug ||
    prizePool !== (currentPrizePool ?? '') ||
    draftScoringProfile !== currentDraftScoringProfile
  useChapterEdits('settings', dirty, () => {
    formRef.current?.requestSubmit()
    return true
  })

  return (
    <form ref={formRef} action={formAction} className="dc-form">
      <input type="hidden" name="leagueId" value={leagueId} />
      {inline && <input type="hidden" name="inline" value="1" />}

      <div className="dc-field">
        <label htmlFor="name" className="dc-label">League name</label>
        <input
          id="name"
          name="name"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="dc-input"
        />
        <span className="dc-checkbox-hint">
          Displayed in the header and titles across the public almanac.
        </span>
      </div>

      <div className="dc-field">
        <label htmlFor="abbreviation" className="dc-label">Abbreviation</label>
        <input
          id="abbreviation"
          name="abbreviation"
          maxLength={16}
          value={abbr}
          onChange={(e) => setAbbr(e.target.value.toUpperCase())}
          placeholder={placeholder}
          className="dc-input mono"
          style={{ textTransform: 'uppercase' }}
        />
        <span className="dc-checkbox-hint">
          Short label shown on the public almanac. Leave blank to derive from initials
          (would be <strong>{placeholder}</strong>).
        </span>
      </div>

      <div className="dc-field">
        <label htmlFor="slug" className="dc-label">URL identifier</label>
        <input
          id="slug"
          name="slug"
          maxLength={60}
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="dc-input mono"
        />
        <span className="dc-checkbox-hint">
          Public URL becomes <strong style={{ fontFamily: 'var(--mono)' }}>/leagues/{previewSlug}/</strong>.
          Old URLs stop working after you save, so share the new link.
        </span>
      </div>

      <div className="dc-field">
        <label htmlFor="prizePool" className="dc-label">Prize pool</label>
        <input
          id="prizePool"
          name="prizePool"
          maxLength={60}
          value={prizePool}
          onChange={(e) => setPrizePool(e.target.value)}
          placeholder="$3,440"
          className="dc-input"
        />
        <span className="dc-checkbox-hint">
          Free-form. Use whatever notation works (<code style={{ fontFamily: 'var(--mono)' }}>$3,440</code>,
          <code style={{ fontFamily: 'var(--mono)' }}> $250 × 7 yrs</code>, etc.). Shown on the public almanac.
          Leave blank to hide.
        </span>
        <details style={{ marginTop: '.6rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '.75rem', color: 'var(--cream-soft)' }}>
            Quick calculator (members × buy-in × years)
          </summary>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.5rem', flexWrap: 'wrap' }}>
            <input
              type="number"
              min={1}
              max={50}
              placeholder="Members"
              value={calcMembers}
              onChange={(e) => setCalcMembers(e.target.value)}
              className="dc-input mono"
              style={{ flex: '0 0 6rem' }}
            />
            <span style={{ opacity: 0.6 }}>×</span>
            <input
              type="number"
              min={1}
              placeholder="Buy-in $"
              value={calcBuyin}
              onChange={(e) => setCalcBuyin(e.target.value)}
              className="dc-input mono"
              style={{ flex: '0 0 6rem' }}
            />
            <span style={{ opacity: 0.6 }}>×</span>
            <input
              type="number"
              min={1}
              max={50}
              placeholder="Years"
              value={calcYears}
              onChange={(e) => setCalcYears(e.target.value)}
              className="dc-input mono"
              style={{ flex: '0 0 5rem' }}
            />
            {calcTotal && (
              <button
                type="button"
                onClick={() => setPrizePool('$' + calcTotal.toLocaleString())}
                className="lo-btn-ghost sm"
              >
                Use ${calcTotal.toLocaleString()}
              </button>
            )}
          </div>
          <span className="dc-checkbox-hint" style={{ marginTop: '.4rem' }}>
            Doesn&apos;t auto-fill if buy-ins varied across years; paste your own total in that case.
          </span>
        </details>
      </div>

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
          Used to grade past drafts on the History tab (Steal of the Year, Bust of the Year, Heartbreakers).
          End-of-season FantasyPros totals are evaluated under this scoring.
        </span>
      </div>

      {!inline && (
        <button type="submit" disabled={isPending} className="lo-btn block">
          {isPending ? 'Saving…' : 'Save settings'}
        </button>
      )}

      {state && !state.ok && <p className="lo-msg-err">{state.error}</p>}
      {savedJustNow && !state && <p className="lo-msg-ok">Saved.</p>}
    </form>
  )
}
