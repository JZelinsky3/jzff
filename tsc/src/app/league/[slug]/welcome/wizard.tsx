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
}

type StepKey = 'sources' | 'sync' | 'members' | 'rivalries' | 'season' | 'publish'

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'sources', label: 'Sources' },
  { key: 'sync', label: 'Sync' },
  { key: 'members', label: 'Members' },
  { key: 'rivalries', label: 'Rivalries' },
  { key: 'season', label: 'Season' },
  { key: 'publish', label: 'Publish' },
]

export function Wizard(props: Props) {
  const [step, setStep] = useState<StepKey>('sources')
  const stepIdx = STEPS.findIndex((s) => s.key === step)

  // Sources state mirrors props for the first render, then trails server
  // refreshes triggered by AddSourceForm's revalidatePath.
  const [sources, setSources] = useState<SourceLite[]>(props.initialSources)
  useEffect(() => { setSources(props.initialSources) }, [props.initialSources])

  // Sync state — populated when the step is entered.
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
            slug={props.slug}
            sources={sources}
            yahooConnected={props.yahooConnected}
            onContinue={goNext}
          />
        )}
        {step === 'sync' && (
          <StepSync
            leagueId={props.leagueId}
            alreadySynced={hasSynced}
            onSynced={() => setHasSynced(true)}
            onContinue={goNext}
            onBack={goBack}
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
// Step 1 — Sources. Reuses AddSourceForm so the wizard inherits every
// platform-picker quirk (Yahoo OAuth gating, ESPN cookies, NFL year range,
// etc.) without duplicating that surface area.

function StepSources({
  leagueId,
  slug,
  sources,
  yahooConnected,
  onContinue,
}: {
  leagueId: string
  slug: string
  sources: SourceLite[]
  yahooConnected: boolean
  onContinue: () => void
}) {
  const router = useRouter()
  const formMountRef = useRef<HTMLDivElement>(null)

  // Same trick as AddSourcePanel: watch for AddSourceForm's success element
  // and refresh the server data so the count + list update without a full
  // navigation. AddSourceForm itself calls revalidatePath after insert.
  useEffect(() => {
    const root = formMountRef.current
    if (!root) return
    const obs = new MutationObserver(() => {
      if (root.querySelector('.dc-form-ok')) router.refresh()
    })
    obs.observe(root, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [router])

  const hasOne = sources.length > 0

  return (
    <>
      <StepHeader
        num="§ 01"
        title="Add a source"
        sub="Pick the platform that hosts your league. ESPN, Sleeper, Yahoo, and NFL.com are supported — you can add more after this step."
      />

      {sources.length > 0 && (
        <div className="wiz-card">
          <div className="wiz-card-title">{sources.length} source{sources.length === 1 ? '' : 's'} attached</div>
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

      <div ref={formMountRef} className="wiz-form">
        <AddSourceForm leagueId={leagueId} slug={slug} yahooConnected={yahooConnected} />
      </div>

      <FooterNav
        primary={{ label: 'Continue', disabled: !hasOne, onClick: onContinue }}
        primaryHint={hasOne ? undefined : 'Add at least one source to continue'}
      />
    </>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Step 2 — Sync. Uses the chunked GET → POST?platform=X endpoint so per-
// platform progress can be shown as a checklist with a fill bar. Errors on
// one platform don't block continuing — the user can re-sync later.

type SyncRowState = 'pending' | 'running' | 'done' | 'error'
type SyncRow = { platform: string; state: SyncRowState; error?: string }

function StepSync({
  leagueId,
  alreadySynced,
  onSynced,
  onContinue,
  onBack,
}: {
  leagueId: string
  alreadySynced: boolean
  onSynced: () => void
  onContinue: () => void
  onBack: () => void
}) {
  const [rows, setRows] = useState<SyncRow[]>([])
  const [phase, setPhase] = useState<'idle' | 'loading' | 'running' | 'done' | 'failed'>('idle')
  const [warnings, setWarnings] = useState<string[]>([])
  const [showWarnings, setShowWarnings] = useState(false)
  const router = useRouter()

  async function runSync() {
    setPhase('loading')
    setWarnings([])
    try {
      const listRes = await fetch(`/api/leagues/${leagueId}/sync`)
      if (!listRes.ok) throw new Error(`Could not list platforms (${listRes.status})`)
      const { platforms } = (await listRes.json()) as { platforms: string[] }
      if (!platforms || platforms.length === 0) {
        setPhase('failed')
        setWarnings(['No sources to sync. Go back and add one first.'])
        return
      }
      const initial: SyncRow[] = platforms.map((p) => ({ platform: p, state: 'pending' }))
      setRows(initial)
      setPhase('running')

      // Sequential — the function cap is per-platform, parallel would just
      // burn more time waiting for the slowest one and provide no real win.
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

  // Continue gate: at least one sync must have happened ever (or this run
  // must have attempted every platform). Errors don't block — the user can
  // address them on the sources page later.
  const canContinue = alreadySynced || phase === 'done'

  return (
    <>
      <StepHeader
        num="§ 02"
        title="Pull every season"
        sub="We walk each source for matchups, drafts, and rosters. Big leagues can take a minute — keep this tab open until each platform ticks off."
      />

      {alreadySynced && phase === 'idle' && (
        <div className="wiz-card" style={{ borderColor: 'rgba(120,180,120,.4)' }}>
          <div className="wiz-card-title">Already synced</div>
          <div className="wiz-card-sub">
            This league has data on file. You can move on, or re-sync to pick up new seasons / fix gaps.
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
          disabled={phase === 'loading' || phase === 'running'}
        >
          {phase === 'loading' || phase === 'running' ? 'Syncing…' :
           rows.length > 0 ? 'Re-sync' :
           alreadySynced ? 'Sync again' : 'Start sync'}
        </button>
      </div>

      <FooterNav
        primary={{ label: 'Continue', disabled: !canContinue, onClick: onContinue }}
        secondary={{ label: '← Back', onClick: onBack }}
        primaryHint={canContinue ? undefined : 'Run the sync (or use the already-synced data) to continue'}
      />
    </>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Step 3 — Members. Embeds the full SetupList from /setup so merging, hiding,
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
        num="§ 03"
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
// Step 4 — Rivalries. Inline picker: two manager dropdowns + optional name.
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
        num="§ 04"
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
// Step 5 — Season status. Quick toggle for "is this league mid-season right
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
        num="§ 05"
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
// Step 6 — Publish. Calls publishLeague, then offers two exits: jump to the
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
        num="§ 06"
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
