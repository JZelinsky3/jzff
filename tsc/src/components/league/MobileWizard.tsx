'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { AddSourceForm } from '@/app/league/[slug]/sources/add-source-form'
import type { ProfileRow } from '@/app/league/[slug]/setup/setup-list'
import {
  publishLeague,
  renameProfile,
  setAlumniOverride,
  setHidden,
  mergeProfiles,
} from '@/app/league/[slug]/setup/actions'
import {
  setLatestSeasonLive,
  createRivalryInWizard,
  deleteRivalryInWizard,
} from '@/app/league/[slug]/welcome/actions'

// Mobile-first rebuild of the league setup wizard. Same step machine as
// wizard.tsx, but each step renders as a single question screen: large
// serif title up top, content stack in the middle, sticky Continue pill
// at the bottom — the pattern the user pulled from the Vocabulary app
// screenshots. CSS namespace: mwiz-.

type SourceLite = {
  id: string
  platform: string
  external_id: string
  label: string | null
  last_synced_at: string | null
}
type ManagerLite = { id: string; name: string }
type LatestSeason = { id: string; year: number; isLive: boolean }
type ExistingRivalry = { id: string; name: string | null; aId: string; bId: string; aName: string; bName: string }

type Props = {
  leagueId: string
  leagueName: string
  slug: string
  initialSources: SourceLite[]
  initialLastSyncedAt: string | null
  initialPublishedAt: string | null
  latestSeason: LatestSeason | null
  existingRivalries: ExistingRivalry[]
  yahooConnected: boolean
  managers: ManagerLite[]
  profiles: ProfileRow[]
  avatars: Record<string, string>
  yearRange: string | null
}

type StepKey = 'sources' | 'members' | 'rivalries' | 'season' | 'publish'

const STEPS: StepKey[] = ['sources', 'members', 'rivalries', 'season', 'publish']

export function MobileWizard(props: Props) {
  const [step, setStep] = useState<StepKey>('sources')
  const stepIdx = STEPS.indexOf(step)
  const sources = props.initialSources
  const [hasSynced, setHasSynced] = useState<boolean>(!!props.initialLastSyncedAt)

  function goNext() {
    const next = STEPS[stepIdx + 1]
    if (next) {
      setStep(next)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  function goBack() {
    const prev = STEPS[stepIdx - 1]
    if (prev) {
      setStep(prev)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <main className="mwiz">
      <header className="mwiz-bar">
        {stepIdx > 0 ? (
          <button type="button" className="mwiz-bar-back" onClick={goBack} aria-label="Back">
            <svg viewBox="0 0 8 14" width="10" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="7 1 1 7 7 13" />
            </svg>
          </button>
        ) : (
          <span className="mwiz-bar-spacer" />
        )}
        <span className="mwiz-bar-progress">Step {stepIdx + 1} of {STEPS.length}</span>
        <Link href={`/league/${props.slug}`} className="mwiz-bar-close" aria-label="Exit wizard">×</Link>
      </header>

      <div className="mwiz-track">
        <div className="mwiz-track-fill" style={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }} />
      </div>

      {step === 'sources' && (
        <StepSources
          leagueId={props.leagueId}
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
        />
      )}
      {step === 'rivalries' && (
        <StepRivalries
          leagueId={props.leagueId}
          managers={props.managers}
          existing={props.existingRivalries}
          onContinue={goNext}
        />
      )}
      {step === 'season' && (
        <StepSeason
          leagueId={props.leagueId}
          latest={props.latestSeason}
          onContinue={goNext}
        />
      )}
      {step === 'publish' && (
        <StepPublish
          leagueId={props.leagueId}
          slug={props.slug}
          alreadyPublished={!!props.initialPublishedAt}
        />
      )}
    </main>
  )
}

// ── Shared step shell ────────────────────────────────────────────────────────
function StepShell({
  title,
  titleEm,
  subtitle,
  children,
  cta,
}: {
  title: string
  titleEm?: string
  subtitle: string
  children: React.ReactNode
  cta: React.ReactNode
}) {
  return (
    <div className="mwiz-step">
      <div className="mwiz-step-body">
        <h1 className="mwiz-title">
          {title}
          {titleEm ? <> <em>{titleEm}</em></> : null}
        </h1>
        <p className="mwiz-subtitle">{subtitle}</p>
        <div className="mwiz-content">{children}</div>
      </div>
      <div className="mwiz-cta">{cta}</div>
    </div>
  )
}

function ContinueButton({
  onClick,
  disabled,
  hint,
  label = 'Continue',
}: {
  onClick: () => void
  disabled?: boolean
  hint?: string
  label?: string
}) {
  return (
    <>
      {hint && <div className="mwiz-cta-hint">{hint}</div>}
      <button type="button" className="mwiz-btn" onClick={onClick} disabled={disabled}>
        {label}
      </button>
    </>
  )
}

// ── Step 1: Sources & sync ──────────────────────────────────────────────────
type SyncRowState = 'pending' | 'running' | 'done' | 'error'
type SyncRow = { platform: string; state: SyncRowState; error?: string }
const POST_ADD_SYNC_DELAY_MS = 2000

function StepSources({
  leagueId,
  slug,
  sources,
  yahooConnected,
  yearRange,
  alreadySynced,
  onSynced,
  onContinue,
}: {
  leagueId: string
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
  const [formOpen, setFormOpen] = useState(false)
  const [rows, setRows] = useState<SyncRow[]>([])
  const [phase, setPhase] = useState<'idle' | 'loading' | 'running' | 'done' | 'failed'>('idle')
  const [warnings, setWarnings] = useState<string[]>([])
  const [showWarnings, setShowWarnings] = useState(false)
  const [syncCoolingDown, setSyncCoolingDown] = useState(false)

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
  const canContinue = hasOne && (alreadySynced || phase === 'done')

  // CTA strategy:
  // - No sources → no CTA; user adds a source first
  // - Has sources, never synced → primary "Sync all sources"; after success
  //   the label flips to Continue
  // - Has sources, already synced → primary "Continue"; "Re-sync" is a
  //   ghost secondary above the form
  const ctaLabel = syncing ? 'Syncing…' : canContinue ? 'Continue' : 'Sync all sources'
  const ctaDisabled = !hasOne || syncing || syncCoolingDown || (!canContinue && phase === 'failed' && rows.length === 0)
  const ctaOnClick = canContinue ? onContinue : runSync

  return (
    <StepShell
      title="Where does this league"
      titleEm="live?"
      subtitle={
        hasOne
          ? `${sources.length} source${sources.length === 1 ? '' : 's'} attached${yearRange ? ` · ${yearRange}` : ''}`
          : 'Attach at least one platform to begin.'
      }
      cta={
        <ContinueButton
          onClick={ctaOnClick}
          disabled={ctaDisabled}
          label={ctaLabel}
          hint={
            !hasOne ? 'Add a source below to continue' :
            !canContinue && !syncing ? 'Sync to pull every season into your archive' :
            undefined
          }
        />
      }
    >
      {hasOne && (
        <div className="mwiz-list">
          {sources.map((s) => (
            <div key={s.id} className="mwiz-source-pill">
              <div className="mwiz-source-platform">{s.platform.toUpperCase()}</div>
              <div className="mwiz-source-id">{s.label || s.external_id}</div>
              {s.last_synced_at && <span className="mwiz-source-check" aria-label="Synced">✓</span>}
            </div>
          ))}
        </div>
      )}

      {!formOpen ? (
        <button
          type="button"
          className="mwiz-add-pill"
          onClick={() => setFormOpen(true)}
        >
          <span className="mwiz-add-plus" aria-hidden>+</span>
          {hasOne ? 'Add another source' : 'Add a source'}
        </button>
      ) : (
        <div ref={formMountRef} className="mwiz-form-card">
          <AddSourceForm leagueId={leagueId} slug={slug} yahooConnected={yahooConnected} />
          <div style={{ textAlign: 'right', marginTop: '.65rem' }}>
            <button
              type="button"
              className="mwiz-ghost"
              onClick={() => setFormOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {hasOne && phase !== 'idle' && rows.length > 0 && (
        <div className="mwiz-progress-card">
          <div className="mwiz-progress-track">
            <div className="mwiz-progress-fill" style={{ width: `${fillPct}%` }} />
          </div>
          <div className="mwiz-progress-meta">{done} of {total} platforms</div>
          <ul className="mwiz-sync-list">
            {rows.map((r) => (
              <li key={r.platform} className={`mwiz-sync-row state-${r.state}`}>
                <span className="mwiz-sync-icon" aria-hidden>
                  {r.state === 'done' ? '✓' : r.state === 'error' ? '!' : r.state === 'running' ? '·' : ''}
                </span>
                <span className="mwiz-sync-name">{r.platform.toUpperCase()}</span>
                <span className="mwiz-sync-state">
                  {r.state === 'pending' && 'Queued'}
                  {r.state === 'running' && 'Syncing…'}
                  {r.state === 'done' && 'Done'}
                  {r.state === 'error' && (r.error || 'Failed')}
                </span>
              </li>
            ))}
          </ul>
          {warnings.length > 0 && (
            <div className="mwiz-warnings">
              <button
                type="button"
                className="mwiz-warnings-toggle"
                onClick={() => setShowWarnings((v) => !v)}
              >
                {warnings.length} warning{warnings.length === 1 ? '' : 's'} {showWarnings ? '▴' : '▾'}
              </button>
              {showWarnings && (
                <ul className="mwiz-warnings-list">
                  {warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {canContinue && phase === 'idle' && (
        <button type="button" className="mwiz-ghost-pill" onClick={runSync} disabled={syncCoolingDown}>
          Re-sync to pull new seasons
        </button>
      )}
    </StepShell>
  )
}

// ── Step 2: Members ─────────────────────────────────────────────────────────
// Full list of profiles as expandable pill cards. Tap a card to open an
// inline drawer with the four actions: Rename, Merge, Hide, Alumni.
// Merge starts a multi-select where the tapped profile is the keeper.

type ProfileBusy = string | 'merge' | null

function isAlumni(p: ProfileRow): boolean {
  return p.is_alumni_override === true || (p.is_alumni_override === null && !p.auto_current)
}

function statusBadge(p: ProfileRow): { label: string; tone: 'current' | 'alumni' | 'hidden' } {
  if (p.is_hidden) return { label: 'Hidden', tone: 'hidden' }
  return isAlumni(p) ? { label: 'Alumni', tone: 'alumni' } : { label: 'Current', tone: 'current' }
}

function alumniCycleLabel(p: ProfileRow): string {
  if (p.is_alumni_override === null) return isAlumni(p) ? 'Mark current' : 'Mark alumni'
  if (p.is_alumni_override === true) return 'Mark current'
  return 'Reset to auto'
}

function teamNameOf(p: ProfileRow): string | null {
  // Profile.managers arrives newest-first from the wizard loader; first
  // non-null team_name is the most recent. Skip values identical to the
  // canonical name so we don't repeat the same string twice on the pill.
  for (const m of p.managers) {
    const t = m.team_name?.trim()
    if (t && t !== p.canonical_name) return t
  }
  return null
}

function StepMembers({
  leagueId,
  slug,
  profiles,
  onContinue,
}: {
  leagueId: string
  slug: string
  profiles: ProfileRow[]
  onContinue: () => void
}) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState<ProfileBusy>(null)
  const [err, setErr] = useState<string | null>(null)

  // Merge mode: a starting profile becomes the keeper, then other profiles
  // become checkable. Sticky bottom CTA swaps to "Merge X" until cancelled
  // or confirmed.
  const [mergeKeeperId, setMergeKeeperId] = useState<string | null>(null)
  const [mergeIds, setMergeIds] = useState<Set<string>>(new Set())
  const mergeMode = mergeKeeperId !== null
  const keeper = mergeKeeperId ? profiles.find((p) => p.id === mergeKeeperId) ?? null : null

  const counts = useMemo(() => {
    const visible = profiles.filter((p) => !p.is_hidden)
    const merged = profiles.filter((p) => p.managers.length > 1).length
    const alumni = profiles.filter((p) => isAlumni(p)).length
    return { visible: visible.length, merged, alumni }
  }, [profiles])

  function toggleDrawer(id: string) {
    if (mergeMode) return
    setOpenId((cur) => (cur === id ? null : id))
    setErr(null)
  }

  function startMerge(id: string) {
    setMergeKeeperId(id)
    setMergeIds(new Set([id]))
    setOpenId(null)
    setErr(null)
  }
  function cancelMerge() {
    setMergeKeeperId(null)
    setMergeIds(new Set())
    setErr(null)
  }
  function toggleMergeId(id: string) {
    if (!mergeMode || id === mergeKeeperId) return
    const next = new Set(mergeIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setMergeIds(next)
  }
  async function confirmMerge() {
    if (!mergeKeeperId || mergeIds.size < 2) return
    const keepName = profiles.find((p) => p.id === mergeKeeperId)?.canonical_name ?? '?'
    if (!confirm(`Merge ${mergeIds.size} profiles into "${keepName}"? Other profiles will be deleted; their stats roll up under the keeper.`)) return
    setBusy('merge'); setErr(null)
    const r = await mergeProfiles({ leagueId, profileIds: Array.from(mergeIds), keepId: mergeKeeperId })
    setBusy(null)
    if (!r.ok) { setErr(r.error); return }
    cancelMerge()
    router.refresh()
  }

  async function doToggleHide(p: ProfileRow) {
    setBusy(p.id); setErr(null)
    const r = await setHidden(p.id, leagueId, !p.is_hidden)
    setBusy(null)
    if (!r.ok) { setErr(r.error); return }
    router.refresh()
  }

  async function doCycleAlumni(p: ProfileRow) {
    const next = p.is_alumni_override === null ? true : p.is_alumni_override === true ? false : null
    setBusy(p.id); setErr(null)
    const r = await setAlumniOverride(p.id, leagueId, next)
    setBusy(null)
    if (!r.ok) { setErr(r.error); return }
    router.refresh()
  }

  async function doRename(p: ProfileRow) {
    const nextName = prompt('Canonical name:', p.canonical_name)
    if (!nextName || nextName.trim() === p.canonical_name) return
    const fd = new FormData()
    fd.set('profileId', p.id)
    fd.set('leagueId', leagueId)
    fd.set('canonicalName', nextName.trim())
    setBusy(p.id); setErr(null)
    const r = await renameProfile(null, fd)
    setBusy(null)
    if (!r.ok) { setErr(r.error); return }
    router.refresh()
  }

  return (
    <StepShell
      title="Review the"
      titleEm="roster."
      subtitle="Tap a manager to rename, merge, hide, or mark alumni. All optional."
      cta={
        mergeMode ? (
          <>
            <div className="mwiz-cta-hint">
              Merging into <strong style={{ color: 'var(--gold)' }}>{keeper?.canonical_name ?? '?'}</strong> · pick at least 1 more
            </div>
            <button
              type="button"
              className="mwiz-btn"
              onClick={confirmMerge}
              disabled={mergeIds.size < 2 || busy === 'merge'}
            >
              {busy === 'merge' ? 'Merging…' : `Merge ${mergeIds.size}`}
            </button>
            <button type="button" className="mwiz-ghost-link" onClick={cancelMerge}>
              Cancel merge
            </button>
          </>
        ) : (
          <>
            <ContinueButton onClick={onContinue} label="Continue" />
            <Link href={`/league/${slug}/setup`} className="mwiz-ghost-link">
              Open full member editor →
            </Link>
          </>
        )
      }
    >
      <div className="mwiz-stat-row mwiz-stat-row-slim">
        <div className="mwiz-stat-slim">
          <span className="mwiz-stat-slim-val">{counts.visible}</span>
          <span className="mwiz-stat-slim-label">Managers</span>
        </div>
        <div className="mwiz-stat-slim">
          <span className="mwiz-stat-slim-val">{counts.merged}</span>
          <span className="mwiz-stat-slim-label">Merged</span>
        </div>
        <div className="mwiz-stat-slim">
          <span className="mwiz-stat-slim-val">{counts.alumni}</span>
          <span className="mwiz-stat-slim-label">Alumni</span>
        </div>
      </div>

      {err && <div className="mwiz-err">{err}</div>}

      <div className="mwiz-mlist">
        {profiles.map((p) => {
          const isOpen = openId === p.id
          const isChecked = mergeIds.has(p.id)
          const isKeeper = p.id === mergeKeeperId
          const rowBusy = busy === p.id
          const badge = statusBadge(p)
          const team = teamNameOf(p)

          return (
            <div
              key={p.id}
              className={[
                'mwiz-mrow',
                isOpen ? 'is-open' : '',
                mergeMode ? (isKeeper ? 'is-keeper' : isChecked ? 'is-merge-on' : 'is-merge-off') : '',
                p.is_hidden ? 'is-hidden' : '',
              ].filter(Boolean).join(' ')}
            >
              <button
                type="button"
                className="mwiz-mrow-head"
                onClick={() => {
                  if (mergeMode) toggleMergeId(p.id)
                  else toggleDrawer(p.id)
                }}
                aria-expanded={isOpen}
              >
                {mergeMode && (
                  <span className="mwiz-mrow-check" aria-hidden>
                    {isKeeper ? '★' : isChecked ? '✓' : ''}
                  </span>
                )}
                <span className="mwiz-mrow-body">
                  <span className="mwiz-mrow-name">{p.canonical_name}</span>
                  {team && <span className="mwiz-mrow-team">{team}</span>}
                </span>
                <span className={`mwiz-mrow-badge tone-${badge.tone}`}>{badge.label}</span>
                {!mergeMode && (
                  <span className="mwiz-mrow-caret" aria-hidden>
                    {isOpen ? '▾' : '▸'}
                  </span>
                )}
              </button>

              {isOpen && !mergeMode && (
                <div className="mwiz-mrow-drawer">
                  <button
                    type="button"
                    className="mwiz-mact"
                    onClick={() => doRename(p)}
                    disabled={rowBusy}
                  >
                    <span className="mwiz-mact-icon" aria-hidden>✎</span>
                    <span>Rename</span>
                  </button>
                  <button
                    type="button"
                    className="mwiz-mact"
                    onClick={() => startMerge(p.id)}
                    disabled={rowBusy}
                  >
                    <span className="mwiz-mact-icon" aria-hidden>∞</span>
                    <span>Merge</span>
                  </button>
                  <button
                    type="button"
                    className="mwiz-mact"
                    onClick={() => doToggleHide(p)}
                    disabled={rowBusy}
                  >
                    <span className="mwiz-mact-icon" aria-hidden>{p.is_hidden ? '◉' : '◯'}</span>
                    <span>{p.is_hidden ? 'Unhide' : 'Hide'}</span>
                  </button>
                  <button
                    type="button"
                    className="mwiz-mact"
                    onClick={() => doCycleAlumni(p)}
                    disabled={rowBusy}
                  >
                    <span className="mwiz-mact-icon" aria-hidden>§</span>
                    <span>{alumniCycleLabel(p)}</span>
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </StepShell>
  )
}

// ── Step 3: Rivalries ───────────────────────────────────────────────────────
function pairKey(x: string, y: string): string {
  return [x, y].sort().join('|')
}

function StepRivalries({
  leagueId,
  managers,
  existing,
  onContinue,
}: {
  leagueId: string
  managers: ManagerLite[]
  existing: ExistingRivalry[]
  onContinue: () => void
}) {
  const router = useRouter()
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [name, setName] = useState('')
  const [autoName, setAutoName] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const usedIds = useMemo(() => {
    const s = new Set<string>()
    for (const r of existing) { s.add(r.aId); s.add(r.bId) }
    return s
  }, [existing])

  async function add() {
    if (!a || !b) { setErr('Pick two managers.'); return }
    if (a === b) { setErr('Pick two different managers.'); return }
    setBusy(true); setErr(null)
    const r = await createRivalryInWizard({
      leagueId,
      managerA: a,
      managerB: b,
      name: autoName ? undefined : (name.trim() || undefined),
      autoName,
    })
    setBusy(false)
    if (!r.ok) { setErr(r.error); return }
    setNewIds((prev) => {
      const next = new Set(prev)
      next.add(pairKey(a, b))
      return next
    })
    setA(''); setB(''); setName('')
    setFormOpen(false)
    router.refresh()
  }

  async function remove(rivalryId: string) {
    if (!confirm('Delete this rivalry?')) return
    setDeletingId(rivalryId); setErr(null)
    const r = await deleteRivalryInWizard({ leagueId, rivalryId })
    setDeletingId(null)
    if (!r.ok) { setErr(r.error); return }
    router.refresh()
  }

  return (
    <StepShell
      title="Pick the"
      titleEm="feuds."
      subtitle="Two managers per rivalry. Curated rivalries get their own page in the public almanac."
      cta={
        <>
          <ContinueButton onClick={onContinue} label={existing.length > 0 ? 'Continue' : 'Skip for now'} />
          {existing.length > 0 && (
            <div className="mwiz-cta-hint">{existing.length} on file</div>
          )}
        </>
      }
    >
      {existing.length > 0 && (
        <div className="mwiz-list">
          {existing.map((r) => {
            const isNew = newIds.has(pairKey(r.aId, r.bId))
            const isDeleting = deletingId === r.id
            return (
              <div key={r.id} className={`mwiz-rival-pill${isNew ? ' is-new' : ''}`}>
                <div className="mwiz-rival-body">
                  <div className="mwiz-rival-pair">{r.aName} vs {r.bName}</div>
                  {r.name && <div className="mwiz-rival-name">{r.name}</div>}
                </div>
                <button
                  type="button"
                  className="mwiz-rival-del"
                  onClick={() => remove(r.id)}
                  disabled={isDeleting}
                  aria-label="Delete rivalry"
                >
                  {isDeleting ? '…' : '×'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {!formOpen ? (
        <button
          type="button"
          className="mwiz-add-pill"
          onClick={() => setFormOpen(true)}
        >
          <span className="mwiz-add-plus" aria-hidden>+</span>
          Add a rivalry
        </button>
      ) : (
        <div className="mwiz-form-card">
          <label className="mwiz-field">
            <span className="mwiz-field-label">Manager A</span>
            <select className="mwiz-select" value={a} onChange={(e) => setA(e.target.value)}>
              <option value="">Pick one…</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {usedIds.has(m.id) ? '· ' : ''}{m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mwiz-field">
            <span className="mwiz-field-label">Manager B</span>
            <select className="mwiz-select" value={b} onChange={(e) => setB(e.target.value)}>
              <option value="">Pick one…</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {usedIds.has(m.id) ? '· ' : ''}{m.name}
                </option>
              ))}
            </select>
          </label>

          <label className="mwiz-check-row">
            <input type="checkbox" checked={autoName} onChange={(e) => setAutoName(e.target.checked)} />
            <span>Auto-name from a curated bank</span>
          </label>

          {!autoName && (
            <label className="mwiz-field">
              <span className="mwiz-field-label">Rivalry name</span>
              <input
                className="mwiz-input"
                placeholder="The Snake Draft Bowl"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}

          {err && <div className="mwiz-err">{err}</div>}

          <div className="mwiz-form-actions">
            <button type="button" className="mwiz-ghost" onClick={() => { setFormOpen(false); setErr(null) }}>
              Cancel
            </button>
            <button
              type="button"
              className="mwiz-btn-inline"
              onClick={add}
              disabled={busy || !a || !b}
            >
              {busy ? 'Saving…' : 'Add'}
            </button>
          </div>
        </div>
      )}
    </StepShell>
  )
}

// ── Step 4: Season ──────────────────────────────────────────────────────────
function StepSeason({
  leagueId,
  latest,
  onContinue,
}: {
  leagueId: string
  latest: LatestSeason | null
  onContinue: () => void
}) {
  const [live, setLive] = useState<boolean | null>(latest ? !!latest.isLive : null)
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function choose(value: boolean) {
    setLive(value)
    setErr(null)
    if (!latest) return
    startTransition(async () => {
      const r = await setLatestSeasonLive({ leagueId, live: value })
      if (!r.ok) {
        setErr(r.error)
        setLive(!value)
      }
    })
  }

  if (!latest) {
    return (
      <StepShell
        title="Is the season"
        titleEm="live?"
        subtitle="No seasons on file yet — sync a source first to set a live season."
        cta={<ContinueButton onClick={onContinue} label="Skip for now" />}
      >
        <div className="mwiz-empty">Add and sync a source on step 1.</div>
      </StepShell>
    )
  }

  return (
    <StepShell
      title={`Is the ${latest.year} season`}
      titleEm="live?"
      subtitle="Marking it live unlocks the live-season pages (pick'ems, power rankings, weekly form)."
      cta={
        <ContinueButton
          onClick={onContinue}
          disabled={busy}
          label="Continue"
        />
      }
    >
      <div className="mwiz-options">
        <button
          type="button"
          className={`mwiz-option${live === true ? ' is-active' : ''}`}
          onClick={() => choose(true)}
          disabled={busy}
        >
          <span className="mwiz-option-label">Live now</span>
          <span className="mwiz-option-check" aria-hidden>{live === true ? '✓' : ''}</span>
        </button>
        <button
          type="button"
          className={`mwiz-option${live === false ? ' is-active' : ''}`}
          onClick={() => choose(false)}
          disabled={busy}
        >
          <span className="mwiz-option-label">Off-season</span>
          <span className="mwiz-option-check" aria-hidden>{live === false ? '✓' : ''}</span>
        </button>
      </div>
      {err && <div className="mwiz-err">{err}</div>}
    </StepShell>
  )
}

// ── Step 5: Publish ─────────────────────────────────────────────────────────
function StepPublish({
  leagueId,
  slug,
  alreadyPublished,
}: {
  leagueId: string
  slug: string
  alreadyPublished: boolean
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

  if (published) {
    return (
      <StepShell
        title="The almanac is"
        titleEm="live."
        subtitle="Your public archive is open. Pick where to go next."
        cta={
          <>
            <Link href={`/leagues/${slug}/`} className="mwiz-btn-link">View public almanac</Link>
            <Link href={`/league/${slug}`} className="mwiz-ghost-link">
              Back to league setup →
            </Link>
          </>
        }
      >
        <div className="mwiz-success">
          <span className="mwiz-success-check" aria-hidden>✓</span>
          <span>Published. Visible at <code>/leagues/{slug}/</code>.</span>
        </div>
      </StepShell>
    )
  }

  return (
    <StepShell
      title="Ready to go"
      titleEm="live?"
      subtitle="Publishing opens your public almanac at /leagues/[slug]. You can unpublish any time from the league setup page."
      cta={
        <ContinueButton
          onClick={doPublish}
          disabled={busy}
          label={busy ? 'Publishing…' : 'Publish almanac'}
        />
      }
    >
      <div className="mwiz-pub-card">
        <div className="mwiz-pub-row"><span>Sources</span><strong>Attached</strong></div>
        <div className="mwiz-pub-row"><span>Members</span><strong>Reviewed</strong></div>
        <div className="mwiz-pub-row"><span>Rivalries</span><strong>Optional</strong></div>
        <div className="mwiz-pub-row"><span>Season</span><strong>Set</strong></div>
      </div>
      {err && <div className="mwiz-err">{err}</div>}
    </StepShell>
  )
}
