'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { AddSourcePanel } from '@/app/league/[slug]/sources/add-source-panel'
import { SourceRow } from '@/app/league/[slug]/sources/source-row'
import { SetupList, type ProfileRow } from '@/app/league/[slug]/setup/setup-list'
import { publishLeague } from '@/app/league/[slug]/setup/actions'
import { setLatestSeasonLive, createRivalryInWizard, deleteRivalryInWizard } from './actions'

type SourceLite = {
  id: string
  platform: string
  external_id: string
  label: string | null
  last_synced_at: string | null
  walk_history: boolean
  settings: Record<string, unknown> | null
  hasCookies: boolean
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
    <main className="lo-page lo-page--sources">
      <section className="lo-hero">
        <div className="lo-hero-kicker">Setup Wizard</div>
        <h1 className="lo-hero-title" style={{ fontSize: 'clamp(2.1rem, 5vw, 3.6rem)' }}>
          {props.leagueName.split(' ').slice(0, -1).join(' ')}{' '}
          <em>{props.leagueName.split(' ').slice(-1)[0]}.</em>
        </h1>
        <p className="lo-hero-standfirst">
          A guided walk through the pieces every archive needs. Skip what you
          don&apos;t care about right now; everything here stays editable from
          the league&apos;s own pages later.
        </p>
      </section>

      <div className="lo-wiz-rail">
        <StepBar step={step} />
      </div>

      <div className="lo-wiz-body">
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
            avatars={props.avatars}
            onContinue={goNext}
            onBack={goBack}
          />
        )}
        {step === 'rivalries' && (
          <StepRivalries
            leagueId={props.leagueId}
            managers={props.managers}
            existing={props.existingRivalries}
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
// Step bar — visible progress across all five steps. Purely a progress
// indicator; only Back/Continue move the wizard (clicking a dot does not).

function StepBar({ step }: { step: StepKey }) {
  const currentIdx = STEPS.findIndex((s) => s.key === step)
  return (
    <ol className="lo-wiz-steps">
      {STEPS.map((s, i) => {
        const state = i < currentIdx ? 'done' : i === currentIdx ? 'now' : 'todo'
        return (
          <li key={s.key} className={`lo-wiz-step ${state}`}>
            <span className="lo-wiz-dot" aria-hidden>
              {state === 'done' ? '✓' : i + 1}
            </span>
            <span className="lo-wiz-label">{s.label}</span>
          </li>
        )
      })}
    </ol>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Step 1 — Sources + Sync. Reuses the real SourceRow / AddSourcePanel from
// the Sources department, so the source attached at archive creation (the
// "primary" source) is fully editable here too — year range, playoff rules,
// cookies, whatever the platform supports — not just a read-only listing.
// Continue is gated on having ≥1 source AND at least one successful sync ever.

type SyncRowState = 'pending' | 'running' | 'done' | 'error'
type SyncRow = { platform: string; state: SyncRowState; error?: string }

function StepSources({
  leagueId,
  slug,
  sources,
  yahooConnected,
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

  // Sync-all state.
  const [rows, setRows] = useState<SyncRow[]>([])
  const [phase, setPhase] = useState<'idle' | 'loading' | 'running' | 'done' | 'failed'>('idle')
  const [warnings, setWarnings] = useState<string[]>([])
  const [showWarnings, setShowWarnings] = useState(false)

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
        num="01"
        title="Sources & sync"
        sub="One archive can pull from many league IDs. A first source was already attached when you created the archive; its settings are open for editing below, same as the standalone Sources page."
      />

      <div className="lo-note-grid" style={{ marginBottom: '1.6rem' }}>
        <div className="lo-note">
          <div className="lo-note-head"><span className="pin">✦</span> While syncing</div>
          <div className="lo-note-body">
            <strong>Stay on this page</strong> until it finishes. Closing the tab
            cancels the run partway through. Usually 20 to 90 seconds.
          </div>
        </div>
        <div className="lo-note rust">
          <div className="lo-note-head"><span className="pin">✦</span> The 2021 playoff shift</div>
          <div className="lo-note-body">
            The NFL added a 17th game in <strong>2021</strong>, which pushed a lot
            of fantasy playoffs a week later. If your history crosses that year
            and the playoff week changed, split it into two sources below.
          </div>
        </div>
      </div>

      {hasOne && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div className="lo-src-grid">
            {sources.map((s) => (
              <SourceRow
                key={s.id}
                source={s}
                leagueId={leagueId}
                slug={slug}
                hasCookies={s.hasCookies}
                syncedRange={null}
              />
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: hasOne ? '1.75rem' : '1.5rem' }}>
        <AddSourcePanel leagueId={leagueId} slug={slug} yahooConnected={yahooConnected} />
      </div>

      {hasOne && (
        <>
          {phase !== 'idle' && rows.length > 0 && (
            <div className="lo-run" style={{ marginBottom: '1.25rem' }}>
              <div className="lo-run-track">
                <div className="lo-run-fill" style={{ width: `${fillPct}%` }} />
              </div>
              <div className="lo-run-meta">{done} of {total} platforms</div>
              <ul className="lo-run-rows">
                {rows.map((r) => (
                  <li key={r.platform} className={`lo-run-row ${r.state}`}>
                    <span className="icon" aria-hidden>
                      {r.state === 'done' ? '✓' :
                       r.state === 'error' ? '!' :
                       r.state === 'running' ? '·' : ''}
                    </span>
                    <span className="name">{r.platform.toUpperCase()}</span>
                    <span className="state">
                      {r.state === 'pending' && 'Queued'}
                      {r.state === 'running' && 'Syncing…'}
                      {r.state === 'done' && 'Done'}
                      {r.state === 'error' && (r.error || 'Failed')}
                    </span>
                  </li>
                ))}
              </ul>

              {warnings.length > 0 && (
                <div style={{ marginTop: '.9rem', paddingTop: '.8rem', borderTop: '1px dashed var(--ink-line)' }}>
                  <button type="button" className="lo-btn-quiet" onClick={() => setShowWarnings((v) => !v)}>
                    {warnings.length} warning{warnings.length === 1 ? '' : 's'} {showWarnings ? '▴' : '▾'}
                  </button>
                  {showWarnings && (
                    <ul style={{ marginTop: '.5rem', paddingLeft: '1.1rem', fontSize: '.75rem', color: 'var(--cream-mute)' }}>
                      {warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          <button type="button" className="lo-btn" onClick={runSync} disabled={syncing}>
            {syncing ? 'Syncing…' :
             rows.length > 0 ? 'Re-sync all' :
             alreadySynced ? 'Sync again' : 'Sync all sources'}
          </button>
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
  avatars,
  onContinue,
  onBack,
}: {
  leagueId: string
  slug: string
  profiles: ProfileRow[]
  avatars: Record<string, string>
  onContinue: () => void
  onBack: () => void
}) {
  return (
    <>
      <StepHeader
        num="02"
        title="Review the roster"
        sub="Merge cross-platform identities, hide test/throwaway accounts, mark alumni. All optional; you can polish this any time from the Members department."
      />
      <div className="lo-note" style={{ marginBottom: '1.6rem' }}>
        <div className="lo-note-head"><span className="pin">✦</span> Hide vs. delete</div>
        <div className="lo-note-body">
          <strong>Hide</strong> just keeps someone off the public almanac; their
          stats stay intact and reversible. <strong>Delete</strong> (on the
          Members page) permanently removes their history. When in doubt, hide.
        </div>
      </div>
      <SetupList leagueId={leagueId} slug={slug} profiles={profiles} avatars={avatars} />
      <FooterNav
        primary={{ label: 'Continue', onClick: onContinue }}
        secondary={{ label: 'Back', onClick: onBack }}
        tertiary={{ label: 'Skip', onClick: onContinue }}
      />
    </>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Step 3 — Rivalries. Inline picker: two manager dropdowns + optional name.
// Names that have appeared in any created rivalry this session render greyed
// so the user can see who they've already used; greyed names stay selectable.

// Stable order-independent key for a manager pair — the same pair always
// hashes to the same string regardless of which manager was picked first.
function pairKey(x: string, y: string): string {
  return [x, y].sort().join('|')
}

function StepRivalries({
  leagueId,
  managers,
  existing,
  onContinue,
  onBack,
}: {
  leagueId: string
  managers: ManagerLite[]
  existing: ExistingRivalry[]
  onContinue: () => void
  onBack: () => void
}) {
  const router = useRouter()
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [name, setName] = useState('')
  const [autoName, setAutoName] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Track ids we added this session so they can render with a "★ NEW" badge
  // for visual feedback without being a duplicate row. Cleared on remount.
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // "Used" set covers every rivalry currently on the DB. After add/delete we
  // call router.refresh() so `existing` is always the source of truth — no
  // session list to fall out of sync.
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
    // Mark the pair so the freshly-arrived row badges "NEW" — server refresh
    // brings the row in by id, so the set keys off the pair string.
    setNewIds((prev) => {
      const next = new Set(prev)
      next.add(pairKey(a, b))
      return next
    })
    setA(''); setB(''); setName('')
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
    <>
      <StepHeader
        num="03"
        title="Pick the feuds"
        sub="Hand-curated rivalries get their own pages in the public almanac. Pick two managers, name the grudge, or let us auto-name it from a curated bank."
      />

      {existing.length > 0 && (
        <div className="lo-feud-list" style={{ marginBottom: '1.75rem' }}>
          {existing.map((r) => {
            const isNew = newIds.has(pairKey(r.aId, r.bId))
            const isDeleting = deletingId === r.id
            return (
              <div key={r.id} className={`lo-feud${isNew ? ' is-new' : ''}`}>
                <span className="lo-feud-no" aria-hidden>{isNew ? '✦' : '★'}</span>
                <div>
                  <div className="lo-feud-name">{r.name || `${r.aName} vs ${r.bName}`}</div>
                  {r.name && <div className="lo-feud-pair">{r.aName} vs {r.bName}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  disabled={isDeleting}
                  className="lo-btn-quiet"
                  aria-label="Delete rivalry"
                >
                  {isDeleting ? '…' : 'Delete'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="lo-form-card">
        <div className="dc-form">
          <div className="dc-grid-2">
            <div className="dc-field">
              <label className="dc-label">Manager A</label>
              <select className="dc-select" value={a} onChange={(e) => setA(e.target.value)}>
                <option value="">Pick one…</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
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
                  <option key={m.id} value={m.id}>
                    {usedIds.has(m.id) ? '· ' : ''}{m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="dc-checkbox-row">
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
            className="lo-btn"
            onClick={add}
            disabled={busy || !a || !b}
          >
            {busy ? 'Saving…' : '+ Add rivalry'}
          </button>

          {err && <p className="lo-msg-err">{err}</p>}
        </div>
      </div>

      <FooterNav
        primary={{ label: 'Continue', onClick: onContinue }}
        secondary={{ label: 'Back', onClick: onBack }}
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
        num="04"
        title="Live season?"
        sub={latest
          ? `Is the ${latest.year} season currently being played? Flipping this on unlocks the live-season pages: pick'ems, power rankings, weekly form.`
          : 'No seasons on file yet. Sync a source first to set a live season.'}
      />

      {latest && (
        <div className="lo-form-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: '1.2rem', color: 'var(--cream)' }}>{latest.year} season</div>
              <div style={{ fontSize: '.85rem', color: 'var(--cream-soft)', marginTop: '.25rem' }}>
                {live ? 'Marked as currently being played.' : 'Treated as a finished season.'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <button
                type="button"
                className={live ? 'lo-btn sm' : 'lo-btn-ghost sm'}
                onClick={() => save(true)}
                disabled={busy}
              >
                Live
              </button>
              <button
                type="button"
                className={!live ? 'lo-btn sm' : 'lo-btn-ghost sm'}
                onClick={() => save(false)}
                disabled={busy}
              >
                Off-season
              </button>
            </div>
          </div>
          {saved && <p className="lo-msg-ok" style={{ marginTop: '.85rem' }}>Saved.</p>}
          {err && <p className="lo-msg-err" style={{ marginTop: '.85rem' }}>{err}</p>}
        </div>
      )}

      <FooterNav
        primary={{ label: 'Continue', onClick: onContinue }}
        secondary={{ label: 'Back', onClick: onBack }}
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
        num="05"
        title="Publish the almanac"
        sub="Opens the public read-only site at /leagues/[slug]. You can unpublish any time from the league's front page."
      />

      {!published ? (
        <div className="lo-form-card">
          <div style={{ fontFamily: 'var(--serif)', fontSize: '1.25rem', color: 'var(--cream)' }}>Ready to go live</div>
          <div style={{ fontSize: '.88rem', color: 'var(--cream-soft)', lineHeight: 1.6, marginTop: '.5rem', maxWidth: '58ch' }}>
            Publishing exposes the public almanac. Sources, members, and rivalries
            you set up here will all show up there. You can keep editing after.
          </div>
          <div style={{ marginTop: '1.4rem' }}>
            <button type="button" className="lo-btn" onClick={doPublish} disabled={busy}>
              {busy ? 'Publishing…' : 'Publish almanac'}
            </button>
          </div>
          {err && <p className="lo-msg-err" style={{ marginTop: '.85rem' }}>{err}</p>}
        </div>
      ) : (
        <div className="lo-form-card" style={{ borderColor: 'rgba(140,190,140,.4)' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: '1.25rem', color: 'var(--cream)' }}>Published.</div>
          <div style={{ fontSize: '.88rem', color: 'var(--cream-soft)', marginTop: '.5rem' }}>
            Your almanac is live. Where to next?
          </div>
          <div style={{ display: 'flex', gap: '.9rem', marginTop: '1.4rem', flexWrap: 'wrap' }}>
            <Link href={`/leagues/${slug}/`} className="lo-btn">View public almanac</Link>
            <Link href={`/league/${slug}`} className="lo-btn-ghost">Go to the front office</Link>
          </div>
        </div>
      )}

      <FooterNav
        secondary={{ label: 'Back', onClick: onBack }}
      />
    </>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Shared layout bits.

function StepHeader({ num, title, sub }: { num: string; title: string; sub: string }) {
  return (
    <header className="lo-wiz-header">
      <div className="lo-wiz-header-no">{num}</div>
      <h2 className="lo-wiz-header-title">{title}</h2>
      <p className="lo-wiz-header-sub">{sub}</p>
    </header>
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
    <div className="lo-wiz-footer">
      <div>
        {secondary && (
          <button type="button" className="lo-btn-ghost" onClick={secondary.onClick} disabled={secondary.disabled}>
            {secondary.label}
          </button>
        )}
      </div>
      <div className="lo-wiz-footer-right">
        {tertiary && (
          <button type="button" className="lo-btn-quiet" onClick={tertiary.onClick} disabled={tertiary.disabled}>
            {tertiary.label}
          </button>
        )}
        {primary && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.4rem' }}>
            {primaryHint && <div className="lo-wiz-footer-hint">{primaryHint}</div>}
            <button type="button" className="lo-btn" onClick={primary.onClick} disabled={primary.disabled}>
              {primary.label}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
