'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { AddSourceForm } from '@/app/league/[slug]/sources/add-source-form'
import { SetupList, type ProfileRow } from '@/app/league/[slug]/setup/setup-list'
import { createRivalry } from '@/app/league/[slug]/rivalries/actions'
import { publishLeague } from '@/app/league/[slug]/setup/actions'
import { setLatestSeasonLive } from './actions'

type SourceLite = {
  id: string
  platform: string
  external_id: string
  label: string | null
  last_synced_at: string | null
}
type ManagerLite = { id: string; name: string }
type LatestSeason = { id: string; year: number; isLive: boolean }

type Props = {
  leagueId: string
  leagueName: string
  slug: string
  initialSources: SourceLite[]
  initialLastSyncedAt: string | null
  initialPublishedAt: string | null
  latestSeason: LatestSeason | null
  initialRivalryCount: number
  yahooConnected: boolean
  managers: ManagerLite[]
  profiles: ProfileRow[]
  yearRange: string | null
}

type StepKey = 'sources' | 'members' | 'rivalries' | 'season' | 'publish'

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'sources', label: 'Sources' },
  { key: 'members', label: 'Members' },
  { key: 'rivalries', label: 'Rivalries' },
  { key: 'season', label: 'Season' },
  { key: 'publish', label: 'Publish' },
]

export function Wizard(props: Props) {
  const [step, setStep] = useState<StepKey>('sources')
  const stepIdx = STEPS.findIndex((s) => s.key === step)

  // Sources come straight from props — AddSourceForm calls revalidatePath on
  // insert, then the sources step's router.refresh() pulls fresh server data,
  // which re-renders this component with the updated initialSources prop.
  const sources = props.initialSources

  // Sync state — tracks whether at least one sync has ever completed (so the
  // sources step's Continue gate can pass) plus whether one ran this session.
  const [hasSynced, setHasSynced] = useState<boolean>(!!props.initialLastSyncedAt)

  function goNext() {
    const next = STEPS[stepIdx + 1]
    if (next) {
      setStep(next.key)
      // Always scroll to the wizard top — long steps (members list) can leave
      // the user scrolled mid-page and the next step's header lands off-screen.
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  function goBack() {
    const prev = STEPS[stepIdx - 1]
    if (prev) {
      setStep(prev.key)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <main className="wiz">
      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1.25rem' }}>
        <div className="hero-sup">★ Setup Wizard ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2rem, 5vw, 3.75rem)' }}>
          {props.leagueName.split(' ').slice(0, -1).join(' ')}{' '}
          <em>{props.leagueName.split(' ').slice(-1)[0]}.</em>
        </h1>
        <p className="hero-sub">
          A guided walk through the pieces every archive needs. Skip steps you
          don&apos;t care about now — you can come back any time.
        </p>
      </section>

      <StepBar step={step} />

      <div className="section wiz-body">
        {step === 'sources' && (
          <StepSources
            leagueId={props.leagueId}
            leagueName={props.leagueName}
            slug={props.slug}
            sources={sources}
            yahooConnected={props.yahooConnected}
            yearRange={props.yearRange}
            alreadySynced={hasSynced}
            onSynced={() => setHasSynced(true)}
            onContinue={goNext}
          />
        )}
        {step === 'members' && (
          <StepMembers
            leagueId={props.leagueId}
            slug={props.slug}
            profiles={props.profiles}
            onContinue={goNext}
            onBack={goBack}
          />
        )}
        {step === 'rivalries' && (
          <StepRivalries
            leagueId={props.leagueId}
            managers={props.managers}
            initialCount={props.initialRivalryCount}
            onContinue={goNext}
            onBack={goBack}
          />
        )}
        {step === 'season' && (
          <StepSeason
            leagueId={props.leagueId}
            latest={props.latestSeason}
            onContinue={goNext}
            onBack={goBack}
          />
        )}
        {step === 'publish' && (
          <StepPublish
            leagueId={props.leagueId}
            slug={props.slug}
            alreadyPublished={!!props.initialPublishedAt}
            onBack={goBack}
          />
        )}
      </div>
    </main>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Step bar — visible progress across all six steps. Click a dot to jump back
// to a completed step (forward jumps are gated by the per-step Continue gate).

function StepBar({ step }: { step: StepKey }) {
  const currentIdx = STEPS.findIndex((s) => s.key === step)
  return (
    <div className="wiz-bar">
      <ol className="wiz-bar-steps">
        {STEPS.map((s, i) => {
          const state = i < currentIdx ? 'done' : i === currentIdx ? 'now' : 'todo'
          return (
            <li key={s.key} className={`wiz-bar-step ${state}`}>
              <span className="wiz-bar-dot" aria-hidden>
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span className="wiz-bar-label">{s.label}</span>
            </li>
          )
        })}
      </ol>
      <div className="wiz-bar-track">
        <div
          className="wiz-bar-fill"
          style={{ width: `${(currentIdx / (STEPS.length - 1)) * 100}%` }}
        />
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Step 1 — Sources + Sync. Two halves on one page: attach league sources
// (reuses AddSourceForm), then walk each platform via the chunked
// GET → POST?platform=X sync endpoint. Continue is gated on having ≥1
// source AND at least one successful sync ever.

type SyncRowState = 'pending' | 'running' | 'done' | 'error'
type SyncRow = { platform: string; state: SyncRowState; error?: string }

// Brief window after adding a source where the sync button is disabled. The
// new source's platforms list comes from a server fetch — `router.refresh()`
// triggers re-render, but the cache-tag revalidation can lag by a moment.
// Two seconds is enough that GET /api/leagues/[id]/sync sees the new row.
const POST_ADD_SYNC_DELAY_MS = 2000

function StepSources({
  leagueId,
  leagueName,
  slug,
  sources,
  yahooConnected,
  yearRange,
  alreadySynced,
  onSynced,
  onContinue,
}: {
  leagueId: string
  leagueName: string
  slug: string
  sources: SourceLite[]
  yahooConnected: boolean
  yearRange: string | null
  alreadySynced: boolean
  onSynced: () => void
  onContinue: () => void
}) {
  const router = useRouter()
  const formMountRef = useRef<HTMLDivElement>(null)
  // Form is collapsed by default — most users land here with one source
  // already attached (from archive creation) and don't need a second.
  const [formOpen, setFormOpen] = useState(false)

  // Sync UI state.
  const [rows, setRows] = useState<SyncRow[]>([])
  const [phase, setPhase] = useState<'idle' | 'loading' | 'running' | 'done' | 'failed'>('idle')
  const [warnings, setWarnings] = useState<string[]>([])
  const [showWarnings, setShowWarnings] = useState(false)
  // Disabled briefly after adding a source — see POST_ADD_SYNC_DELAY_MS.
  const [syncCoolingDown, setSyncCoolingDown] = useState(false)

  // Watch AddSourceForm's success element so we can refresh server data
  // (refetches the sources list) and close the form. Also kicks off the
  // brief sync-cooldown so the user can't sync into stale platform data.
  useEffect(() => {
    if (!formOpen) return
    const root = formMountRef.current
    if (!root) return
    const obs = new MutationObserver(() => {
      if (root.querySelector('.dc-form-ok')) {
        setSyncCoolingDown(true)
        router.refresh()
        setFormOpen(false)
        const t = setTimeout(() => setSyncCoolingDown(false), POST_ADD_SYNC_DELAY_MS)
        return () => clearTimeout(t)
      }
    })
    obs.observe(root, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [router, formOpen])

  async function runSync() {
    setPhase('loading')
    setWarnings([])
    try {
      const listRes = await fetch(`/api/leagues/${leagueId}/sync`)
      if (!listRes.ok) throw new Error(`Could not list platforms (${listRes.status})`)
      const { platforms } = (await listRes.json()) as { platforms: string[] }
      if (!platforms || platforms.length === 0) {
        setPhase('failed')
        setWarnings(['No sources to sync. Add one first.'])
        return
      }
      setRows(platforms.map((p) => ({ platform: p, state: 'pending' })))
      setPhase('running')

      for (let i = 0; i < platforms.length; i++) {
        const p = platforms[i]
        setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, state: 'running' } : r))
        try {
          const res = await fetch(`/api/leagues/${leagueId}/sync?platform=${encodeURIComponent(p)}`, { method: 'POST' })
          if (!res.ok) {
            const j = (await res.json().catch(() => ({}))) as { error?: string }
            setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, state: 'error', error: j.error ?? `${res.status}` } : r))
          } else {
            const j = (await res.json()) as { warnings?: string[] }
            if (Array.isArray(j.warnings) && j.warnings.length > 0) {
              setWarnings((w) => [...w, ...j.warnings!])
            }
            setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, state: 'done' } : r))
          }
        } catch (err) {
          setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, state: 'error', error: err instanceof Error ? err.message : 'sync failed' } : r))
        }
      }
      setPhase('done')
      onSynced()
      router.refresh()
    } catch (err) {
      setPhase('failed')
      setWarnings([err instanceof Error ? err.message : 'Sync failed'])
    }
  }

  const total = rows.length
  const done = rows.filter((r) => r.state === 'done' || r.state === 'error').length
  const fillPct = total === 0 ? 0 : (done / total) * 100

  const hasOne = sources.length > 0
  const syncing = phase === 'loading' || phase === 'running'
  // Continue gate: at least one source AND data on file (either from a
  // prior sync, or one that just completed this session). Errors don't
  // block — the user can resync later.
  const canContinue = hasOne && (alreadySynced || phase === 'done')

  return (
    <>
      <StepHeader
        num="§ 01"
        title="Sources & sync"
        sub="One archive can pull from many league IDs. Confirm what's attached, then run the sync to pull every season, draft, and matchup. The first source was added when you created the archive."
      />

      {/* ── Attached sources ── */}
      {hasOne && (
        <div className="wiz-card">
          <div className="wiz-card-title">{leagueName}</div>
          <div className="wiz-card-sub" style={{ marginBottom: '.75rem' }}>
            {sources.length} source{sources.length === 1 ? '' : 's'} attached
            {yearRange && <> · {yearRange}</>}
          </div>
          <ul className="wiz-source-list">
            {sources.map((s) => (
              <li key={s.id}>
                <span className="wiz-source-platform">{s.platform.toUpperCase()}</span>
                <span className="wiz-source-id">{s.label || s.external_id}</span>
                {s.last_synced_at && <span className="wiz-source-sync">Synced</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Add another ── */}
      {!formOpen ? (
        <div className="wiz-sync-actions" style={{ marginBottom: '1.5rem' }}>
          <button
            type="button"
            className="dc-btn-ghost"
            onClick={() => setFormOpen(true)}
          >
            {hasOne ? '+ Add another source' : '+ Add a source'}
          </button>
        </div>
      ) : (
        <div ref={formMountRef} className="wiz-form">
          <div className="card" style={{ paddingBottom: '2rem' }}>
            <AddSourceForm leagueId={leagueId} slug={slug} yahooConnected={yahooConnected} />
          </div>
          <div style={{ marginTop: '.75rem', textAlign: 'right' }}>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="dc-btn-ghost"
              style={{ fontSize: '.7rem' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Sync section ── */}
      {hasOne && (
        <>
          {alreadySynced && phase === 'idle' && (
            <div className="wiz-card" style={{ borderColor: 'rgba(120,180,120,.4)' }}>
              <div className="wiz-card-title">Already synced</div>
              <div className="wiz-card-sub">
                Data on file. Move on, or re-sync to pull new seasons / fix gaps.
              </div>
            </div>
          )}

          {phase !== 'idle' && rows.length > 0 && (
            <div className="wiz-card">
              <div className="wiz-progress">
                <div className="wiz-progress-track">
                  <div className="wiz-progress-fill" style={{ width: `${fillPct}%` }} />
                </div>
                <div className="wiz-progress-meta">{done} of {total} platforms</div>
              </div>
              <ul className="wiz-sync-list">
                {rows.map((r) => (
                  <li key={r.platform} className={`wiz-sync-row ${r.state}`}>
                    <span className="wiz-sync-icon" aria-hidden>
                      {r.state === 'done' ? '✓' :
                       r.state === 'error' ? '!' :
                       r.state === 'running' ? '·' : ''}
                    </span>
                    <span className="wiz-sync-name">{r.platform.toUpperCase()}</span>
                    <span className="wiz-sync-state">
                      {r.state === 'pending' && 'Queued'}
                      {r.state === 'running' && 'Syncing…'}
                      {r.state === 'done' && 'Done'}
                      {r.state === 'error' && (r.error || 'Failed')}
                    </span>
                  </li>
                ))}
              </ul>

              {warnings.length > 0 && (
                <div className="wiz-warnings">
                  <button
                    type="button"
                    className="wiz-warnings-toggle"
                    onClick={() => setShowWarnings((v) => !v)}
                  >
                    {warnings.length} warning{warnings.length === 1 ? '' : 's'} {showWarnings ? '▴' : '▾'}
                  </button>
                  {showWarnings && (
                    <ul className="wiz-warnings-list">
                      {warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="wiz-sync-actions">
            <button
              type="button"
              className="dc-btn"
              onClick={runSync}
              disabled={syncing || syncCoolingDown}
              title={syncCoolingDown ? 'Loading the new source into sync…' : undefined}
            >
              {syncing ? 'Syncing…' :
               syncCoolingDown ? 'Preparing…' :
               rows.length > 0 ? 'Re-sync all' :
               alreadySynced ? 'Sync again' : 'Sync all sources'}
            </button>
          </div>
        </>
      )}

      <FooterNav
        primary={{ label: 'Continue', disabled: !canContinue, onClick: onContinue }}
        primaryHint={
          !hasOne ? 'Add at least one source to continue' :
          !canContinue ? 'Run the sync to continue' :
          undefined
        }
      />
    </>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Step 2 — Members. Embeds the full SetupList from /setup so merging, hiding,
// renaming, alumni overrides all work identically to the standalone page.

function StepMembers({
  leagueId,
  slug,
  profiles,
  onContinue,
  onBack,
}: {
  leagueId: string
  slug: string
  profiles: ProfileRow[]
  onContinue: () => void
  onBack: () => void
}) {
  return (
    <>
      <StepHeader
        num="§ 02"
        title="Review the roster"
        sub="Merge cross-platform identities, hide test/throwaway accounts, mark alumni. All optional — you can polish this any time."
      />
      <SetupList leagueId={leagueId} slug={slug} profiles={profiles} />
      <FooterNav
        primary={{ label: 'Continue', onClick: onContinue }}
        secondary={{ label: '← Back', onClick: onBack }}
        tertiary={{ label: 'Skip', onClick: onContinue }}
      />
    </>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Step 3 — Rivalries. Inline picker: two manager dropdowns + optional name.
// Names that have appeared in any created rivalry this session render greyed
// so the user can see who they've already used; greyed names stay selectable.

function StepRivalries({
  leagueId,
  managers,
  initialCount,
  onContinue,
  onBack,
}: {
  leagueId: string
  managers: ManagerLite[]
  initialCount: number
  onContinue: () => void
  onBack: () => void
}) {
  const [created, setCreated] = useState<{ a: string; b: string; name: string | null }[]>([])
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [name, setName] = useState('')
  const [autoName, setAutoName] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const usedIds = useMemo(() => {
    const s = new Set<string>()
    for (const r of created) { s.add(r.a); s.add(r.b) }
    return s
  }, [created])

  function nameOf(id: string): string {
    return managers.find((m) => m.id === id)?.name ?? '?'
  }

  async function add() {
    if (!a || !b) { setErr('Pick two managers.'); return }
    if (a === b) { setErr('Pick two different managers.'); return }
    setBusy(true); setErr(null)
    const fd = new FormData()
    fd.set('leagueId', leagueId)
    fd.set('managerA', a)
    fd.set('managerB', b)
    if (autoName) fd.set('autoName', 'true')
    else if (name.trim()) fd.set('name', name.trim())
    try {
      // createRivalry redirects on success — that throws a NEXT_REDIRECT.
      // The redirect points at the rivalries page, but we want to stay in
      // the wizard, so we catch + treat as success (the row is already in
      // the DB by the time the redirect fires).
      await createRivalry(null, fd)
      // If we got here without a throw, the action returned an error result.
      // Defensive — schema/validation failures fall through this branch.
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)) || ''
      if (!msg.includes('NEXT_REDIRECT')) {
        setErr(msg || 'Could not create rivalry.')
        setBusy(false)
        return
      }
    }
    setCreated((prev) => [...prev, { a, b, name: autoName ? null : (name.trim() || null) }])
    setA(''); setB(''); setName('')
    setBusy(false)
  }

  return (
    <>
      <StepHeader
        num="§ 03"
        title="Pick the feuds"
        sub="Hand-curated rivalries get their own pages in the public almanac. Pick two managers, name the grudge (or auto-name it)."
      />

      {(initialCount > 0 || created.length > 0) && (
        <div className="wiz-card">
          <div className="wiz-card-title">
            {created.length + (initialCount > 0 && created.length === 0 ? initialCount : 0)} rivalr{(created.length || initialCount) === 1 ? 'y' : 'ies'}{' '}
            {initialCount > 0 && created.length === 0 ? 'on file' : 'added this session'}
          </div>
          {created.length > 0 && (
            <ul className="wiz-source-list">
              {created.map((r, i) => (
                <li key={i}>
                  <span className="wiz-source-platform">★</span>
                  <span className="wiz-source-id">{nameOf(r.a)} vs {nameOf(r.b)}</span>
                  {r.name && <span className="wiz-source-sync">{r.name}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="wiz-form">
        <div className="dc-grid-2">
          <div className="dc-field">
            <label className="dc-label">Manager A</label>
            <select className="dc-select" value={a} onChange={(e) => setA(e.target.value)}>
              <option value="">Pick one…</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id} className={usedIds.has(m.id) ? 'wiz-used' : ''}>
                  {usedIds.has(m.id) ? '· ' : ''}{m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="dc-field">
            <label className="dc-label">Manager B</label>
            <select className="dc-select" value={b} onChange={(e) => setB(e.target.value)}>
              <option value="">Pick one…</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id} className={usedIds.has(m.id) ? 'wiz-used' : ''}>
                  {usedIds.has(m.id) ? '· ' : ''}{m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="dc-checkbox-row" style={{ marginTop: '.75rem' }}>
          <input
            type="checkbox"
            checked={autoName}
            onChange={(e) => setAutoName(e.target.checked)}
          />
          <span>
            Auto-name this rivalry
            <span className="dc-checkbox-hint">We&apos;ll pick a title from a curated bank.</span>
          </span>
        </label>

        {!autoName && (
          <div className="dc-field">
            <label className="dc-label">Rivalry name</label>
            <input
              className="dc-input"
              placeholder="The Snake Draft Bowl"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}

        <button
          type="button"
          className="dc-btn"
          onClick={add}
          disabled={busy || !a || !b}
          style={{ marginTop: '1rem' }}
        >
          {busy ? 'Saving…' : '+ Add rivalry'}
        </button>

        {err && <p className="dc-form-error">{err}</p>}
      </div>

      <FooterNav
        primary={{ label: 'Continue', onClick: onContinue }}
        secondary={{ label: '← Back', onClick: onBack }}
        tertiary={{ label: 'Skip', onClick: onContinue }}
      />
    </>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Step 4 — Season status. Quick toggle for "is this league mid-season right
// now?" — flips is_live on the most recent season. Full live-season config
// (current week, start date) still lives on /league/[slug]/live.

function StepSeason({
  leagueId,
  latest,
  onContinue,
  onBack,
}: {
  leagueId: string
  latest: LatestSeason | null
  onContinue: () => void
  onBack: () => void
}) {
  const [live, setLive] = useState<boolean>(!!latest?.isLive)
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function save(value: boolean) {
    setLive(value)
    setSaved(false)
    setErr(null)
    startTransition(async () => {
      const r = await setLatestSeasonLive({ leagueId, live: value })
      if (!r.ok) {
        setErr(r.error)
        setLive(!value)
        return
      }
      setSaved(true)
    })
  }

  return (
    <>
      <StepHeader
        num="§ 04"
        title="Live season?"
        sub={latest
          ? `Is the ${latest.year} season currently being played? Flipping this on unlocks the live-season pages.`
          : 'No seasons on file yet — sync a source first to set a live season.'}
      />

      {latest && (
        <div className="wiz-card">
          <div className="wiz-toggle-row">
            <div>
              <div className="wiz-card-title">{latest.year} season</div>
              <div className="wiz-card-sub">
                {live ? 'Marked as currently being played.' : 'Treated as a finished season.'}
              </div>
            </div>
            <div className="wiz-toggle-buttons">
              <button
                type="button"
                className={`dc-btn-ghost ${live ? 'wiz-toggle-active' : ''}`}
                onClick={() => save(true)}
                disabled={busy}
              >
                Live
              </button>
              <button
                type="button"
                className={`dc-btn-ghost ${!live ? 'wiz-toggle-active' : ''}`}
                onClick={() => save(false)}
                disabled={busy}
              >
                Off-season
              </button>
            </div>
          </div>
          {saved && <p className="wiz-saved">Saved.</p>}
          {err && <p className="dc-form-error">{err}</p>}
        </div>
      )}

      <FooterNav
        primary={{ label: 'Continue', onClick: onContinue }}
        secondary={{ label: '← Back', onClick: onBack }}
        tertiary={{ label: 'Skip', onClick: onContinue }}
      />
    </>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Step 5 — Publish. Calls publishLeague, then offers two exits: jump to the
// public league hub, or stay in the regular setup page for further editing.

function StepPublish({
  leagueId,
  slug,
  alreadyPublished,
  onBack,
}: {
  leagueId: string
  slug: string
  alreadyPublished: boolean
  onBack: () => void
}) {
  const [published, setPublished] = useState(alreadyPublished)
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function doPublish() {
    setErr(null)
    startTransition(async () => {
      const r = await publishLeague(leagueId)
      if (!r.ok) { setErr(r.error); return }
      setPublished(true)
    })
  }

  return (
    <>
      <StepHeader
        num="§ 05"
        title="Publish the almanac"
        sub="Opens the public read-only site at /leagues/[slug]. You can unpublish any time from the league setup page."
      />

      {!published ? (
        <div className="wiz-card">
          <div className="wiz-card-title">Ready to go live</div>
          <div className="wiz-card-sub">
            Publishing exposes the public almanac. Sources, members, and rivalries
            you set up here will all show up there. (You can keep editing after.)
          </div>
          <div style={{ marginTop: '1.25rem' }}>
            <button
              type="button"
              className="dc-btn"
              onClick={doPublish}
              disabled={busy}
            >
              {busy ? 'Publishing…' : 'Publish almanac'}
            </button>
          </div>
          {err && <p className="dc-form-error">{err}</p>}
        </div>
      ) : (
        <div className="wiz-card" style={{ borderColor: 'rgba(120,180,120,.5)' }}>
          <div className="wiz-card-title">Published.</div>
          <div className="wiz-card-sub">
            Your almanac is live. Where to next?
          </div>
          <div className="wiz-publish-exits">
            <Link href={`/leagues/${slug}/`} className="dc-btn">View public almanac</Link>
            <Link href={`/league/${slug}`} className="dc-btn-ghost">Go to league hub</Link>
            <Link href={`/league/${slug}/setup`} className="dc-btn-ghost">Open league setup page</Link>
          </div>
        </div>
      )}

      <FooterNav
        secondary={{ label: '← Back', onClick: onBack }}
      />
    </>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Shared layout bits.

function StepHeader({ num, title, sub }: { num: string; title: string; sub: string }) {
  return (
    <div className="section-header" style={{ marginBottom: '1.25rem' }}>
      <span className="section-num">{num}</span>
      <span className="section-title">{title} —</span>
      <span className="section-meta" style={{ display: 'block', marginTop: '.5rem', maxWidth: '52ch', whiteSpace: 'normal' }}>{sub}</span>
    </div>
  )
}

type NavBtn = { label: string; onClick: () => void; disabled?: boolean }

function FooterNav({
  primary,
  secondary,
  tertiary,
  primaryHint,
}: {
  primary?: NavBtn
  secondary?: NavBtn
  tertiary?: NavBtn
  primaryHint?: string
}) {
  return (
    <div className="wiz-footer">
      <div className="wiz-footer-left">
        {secondary && (
          <button type="button" className="dc-btn-ghost" onClick={secondary.onClick} disabled={secondary.disabled}>
            {secondary.label}
          </button>
        )}
      </div>
      <div className="wiz-footer-right">
        {tertiary && (
          <button type="button" className="dc-btn-ghost" onClick={tertiary.onClick} disabled={tertiary.disabled}>
            {tertiary.label}
          </button>
        )}
        {primary && (
          <div className="wiz-footer-primary">
            {primaryHint && <div className="wiz-footer-hint">{primaryHint}</div>}
            <button type="button" className="dc-btn" onClick={primary.onClick} disabled={primary.disabled}>
              {primary.label}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
