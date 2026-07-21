'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { mergeProfiles, renameProfile, setAlumniOverride, setHidden, deleteProfiles } from './actions'

export type ProfileRow = {
  id: string
  canonical_name: string
  is_alumni_override: boolean | null
  is_hidden: boolean
  auto_current: boolean
  managers: { id: string; display_name: string | null; team_name: string | null; external_id: string | null }[]
}

// Auto-detected status reads as the plain word; only a commissioner
// override is qualified. Labelling the common case "(auto)" added a
// parenthetical to nearly every row without telling anyone anything.
function statusLabel(p: ProfileRow): string {
  if (p.is_hidden) return 'Hidden'
  if (p.is_alumni_override === true) return 'Alumni (forced)'
  if (p.is_alumni_override === false) return 'Current (forced)'
  return p.auto_current ? 'Current' : 'Alumni'
}

function nextStatusAction(p: ProfileRow): string {
  // Mirrors the cycle in onCycleAlumni: null → true → false → null.
  if (p.is_alumni_override === null) return 'Mark alumni'
  if (p.is_alumni_override === true) return 'Mark current'
  return 'Reset to auto'
}

export function SetupList({
  leagueId,
  slug,
  profiles,
  avatars,
}: {
  leagueId: string
  slug: string
  profiles: ProfileRow[]
  // Optional per-profile avatar URLs. When provided, each card renders an
  // avatar circle next to the canonical name. The regular /setup page omits
  // this — only the setup wizard's members step passes it through.
  avatars?: Record<string, string>
}) {
  void slug
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pickingKeeper, setPickingKeeper] = useState(false)
  const [keeperId, setKeeperId] = useState<string | null>(null)

  // Current members first, alumni (auto-detected + forced) in their own
  // block below. Profiles arrive alphabetized from the server, so each
  // group stays alphabetical on its own.
  const isAlumni = (p: ProfileRow) =>
    p.is_alumni_override === true || (p.is_alumni_override === null && !p.auto_current)
  const currentProfiles = profiles.filter((p) => !isAlumni(p))
  const alumniProfiles = profiles.filter(isAlumni)

  function toggleSelect(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
    if (pickingKeeper && keeperId && !next.has(keeperId)) setKeeperId(null)
  }

  function onMergeStart() {
    if (selected.size < 2) return
    const ids = Array.from(selected)
    setKeeperId(ids[0])
    setPickingKeeper(true)
  }

  async function onMergeConfirm() {
    if (selected.size < 2 || !keeperId) return
    const ids = Array.from(selected)
    const keepName = profiles.find((p) => p.id === keeperId)?.canonical_name ?? '?'
    if (!confirm(`Merge ${ids.length} profiles into "${keepName}"? The others will be deleted; their stats roll up under the keeper.`)) return
    setBusy('merge'); setErr(null)
    const result = await mergeProfiles({ leagueId, profileIds: ids, keepId: keeperId })
    setBusy(null)
    if (!result.ok) { setErr(result.error); return }
    setSelected(new Set())
    setPickingKeeper(false)
    setKeeperId(null)
    router.refresh()
  }

  function onMergeCancel() {
    setPickingKeeper(false)
    setKeeperId(null)
  }

  async function onDelete() {
    if (selected.size === 0) return
    const ids = Array.from(selected)
    const names = ids
      .map((id) => profiles.find((p) => p.id === id)?.canonical_name ?? '?')
      .slice(0, 5)
      .join(', ')
    const more = ids.length > 5 ? ` + ${ids.length - 5} more` : ''
    if (!confirm(
      `Permanently delete ${ids.length} ${ids.length === 1 ? 'person' : 'people'} (${names}${more})? ` +
      `Every season, matchup, and rivalry tied to them is wiped too. This cannot be undone. Hide is safer if you just want them off the public site.`
    )) return
    setBusy('delete'); setErr(null)
    const result = await deleteProfiles({ leagueId, profileIds: ids })
    setBusy(null)
    if (!result.ok) { setErr(result.error); return }
    setSelected(new Set())
    router.refresh()
  }

  function onSelectAll() {
    const allVisible = profiles.map((p) => p.id)
    const everySelected = allVisible.every((id) => selected.has(id))
    setSelected(everySelected ? new Set() : new Set(allVisible))
  }

  async function onToggleHide(p: ProfileRow) {
    setBusy(p.id); setErr(null)
    const r = await setHidden(p.id, leagueId, !p.is_hidden)
    setBusy(null)
    if (!r.ok) { setErr(r.error); return }
    router.refresh()
  }

  async function onCycleAlumni(p: ProfileRow) {
    // Cycle: auto (null) → forced alumni (true) → forced current (false) → auto (null)
    const next = p.is_alumni_override === null ? true : p.is_alumni_override === true ? false : null
    setBusy(p.id); setErr(null)
    const r = await setAlumniOverride(p.id, leagueId, next)
    setBusy(null)
    if (!r.ok) { setErr(r.error); return }
    router.refresh()
  }

  function onRename(p: ProfileRow) {
    const next = prompt('Canonical name:', p.canonical_name)
    if (!next || next.trim() === p.canonical_name) return
    const fd = new FormData()
    fd.set('profileId', p.id)
    fd.set('leagueId', leagueId)
    fd.set('canonicalName', next.trim())
    startTransition(async () => {
      const r = await renameProfile(null, fd)
      if (!r.ok) setErr(r.error)
      router.refresh()
    })
  }

  return (
    <>
      <div className="lo-roster-toolbar">
        <button
          onClick={onSelectAll}
          disabled={profiles.length === 0 || busy !== null}
          className="lo-btn-ghost sm"
        >
          {profiles.length > 0 && profiles.every((p) => selected.has(p.id)) ? 'Deselect all' : 'Select all'}
        </button>
        <button
          onClick={onMergeStart}
          disabled={selected.size < 2 || busy !== null || pickingKeeper}
          className="lo-btn sm"
        >
          {busy === 'merge' ? 'Merging…' : `Merge ${selected.size}`}
        </button>
        <button
          onClick={onDelete}
          disabled={selected.size === 0 || busy !== null}
          className="lo-btn-ghost sm danger"
          title="Delete the profile AND its underlying stats. Permanent: use Hide instead for a soft remove."
        >
          {busy === 'delete' ? 'Deleting…' : `Delete ${selected.size}`}
        </button>
        <button
          onClick={() => setSelected(new Set())}
          disabled={selected.size === 0 || busy !== null}
          className="lo-btn-quiet"
        >
          Clear
        </button>
        <span className="lo-roster-hint hide-on-mobile">
          Pick the keeper after Merge · Delete is permanent
        </span>
      </div>

      {pickingKeeper && (
        <div className="lo-form-card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem', color: 'var(--cream)' }}>
                Which profile should stay?
              </div>
              <div style={{ opacity: 0.65, fontSize: '.8rem', marginTop: '.25rem' }}>
                The others get deleted; their stats roll up under the keeper.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={keeperId ?? ''}
                onChange={(e) => setKeeperId(e.target.value || null)}
                className="dc-input"
                // flex:1 + minWidth:0 lets the select fill the actions row
                // when there's space but shrink to viewport width on phones,
                // instead of forcing a 14rem floor that overflows narrow
                // screens. min-w-0 specifically defeats the implicit min-content
                // floor flex items have.
                style={{ flex: '1 1 12rem', minWidth: 0 }}
              >
                {Array.from(selected).map((id) => {
                  const p = profiles.find((p) => p.id === id)
                  return <option key={id} value={id}>{p?.canonical_name ?? id}</option>
                })}
              </select>
              <button onClick={onMergeConfirm} disabled={!keeperId || busy !== null} className="lo-btn sm">
                {busy === 'merge' ? 'Merging…' : 'Confirm merge'}
              </button>
              <button onClick={onMergeCancel} disabled={busy !== null} className="lo-btn-ghost sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {err && <p className="lo-msg-err" style={{ marginBottom: '.85rem' }}>{err}</p>}

      {profiles.length === 0 && (
        <div className="lo-empty"><div className="lo-empty-text">No profiles yet. Sync a source first.</div></div>
      )}
      <div className="lo-roster-grid">
        {currentProfiles.map(renderCard)}
      </div>
      {alumniProfiles.length > 0 && (
        <>
          {/* Alumni (auto + forced) get their own block under the current
              roster so the active league reads first and departures don't
              interleave with it. */}
          <div style={{ marginTop: '1.5rem', marginBottom: '.6rem', display: 'flex', alignItems: 'baseline', gap: '.6rem' }}>
            <span className="text-mono text-cream-mute" style={{ fontSize: '.62rem', letterSpacing: '.18em', textTransform: 'uppercase' }}>
              Alumni
            </span>
            <span style={{ opacity: 0.45, fontSize: '.75rem' }}>
              {alumniProfiles.length} {alumniProfiles.length === 1 ? 'person' : 'people'} no longer in the league
            </span>
          </div>
          <div className="lo-roster-grid">
            {alumniProfiles.map(renderCard)}
          </div>
        </>
      )}
    </>
  )

  function renderCard(p: ProfileRow) {
    const isSel = selected.has(p.id)
    const avatarUrl = avatars?.[p.id]
    return (
      <div key={p.id} className={`lo-person${p.is_hidden ? ' hidden' : ''}${isSel ? ' selected' : ''}`}>
        <input
          type="checkbox"
          checked={isSel}
          onChange={() => toggleSelect(p.id)}
        />
        {avatars && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl || '/icon.png'}
            alt=""
            width={32}
            height={32}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              objectFit: 'cover',
              background: 'rgba(255,247,230,.06)',
              border: '1px solid rgba(255,247,230,.15)',
              flexShrink: 0,
              opacity: avatarUrl ? 1 : .35,
            }}
            onError={(e) => {
              // Platform avatar 404s happen — esp. when users leave a
              // league and their avatar gets purged. Fall back to the
              // site icon so the layout doesn't go ragged.
              const t = e.currentTarget
              if (t.src.endsWith('/icon.png')) return
              t.src = '/icon.png'
              t.style.opacity = '.35'
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div className="lo-person-name" style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span>{p.canonical_name}</span>
            <span className="lo-person-status">
              {statusLabel(p)}
              {p.managers.length > 1 && <> · {p.managers.length} merged</>}
            </span>
          </div>
          {p.managers.length > 0 && (
            <div className="lo-person-accounts">
              {p.managers.map((m) => (
                <span key={m.id} className="lo-person-acct" title={m.team_name ?? undefined}>
                  {m.display_name ?? 'Unknown'}
                  {m.team_name && m.team_name !== m.display_name && (
                    <span style={{ opacity: 0.6 }}> · {m.team_name}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="lo-person-actions">
          <button onClick={() => onRename(p)} disabled={busy !== null} className="lo-btn-ghost xs">
            Rename
          </button>
          <button
            onClick={() => onCycleAlumni(p)}
            disabled={busy !== null}
            className="lo-btn-ghost xs"
            title="Cycle: Auto → Alumni → Current → Auto"
          >
            {busy === p.id ? '…' : nextStatusAction(p)}
          </button>
          <button onClick={() => onToggleHide(p)} disabled={busy !== null} className="lo-btn-ghost xs">
            {p.is_hidden ? 'Unhide' : 'Hide'}
          </button>
        </div>
      </div>
    )
  }
}
