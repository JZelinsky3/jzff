'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { mergeProfiles, renameProfile, setAlumniOverride, setHidden, deleteProfiles } from '@/app/league/[slug]/setup/actions'

export type ProfileRow = {
  id: string
  canonical_name: string
  is_alumni_override: boolean | null
  is_hidden: boolean
  auto_current: boolean
  managers: { id: string; display_name: string | null; team_name: string | null; external_id: string | null }[]
}

function statusLabel(p: ProfileRow): string | null {
  if (p.is_hidden) return 'Hidden'
  if (p.is_alumni_override === true) return 'Alumni'
  if (p.is_alumni_override === false) return 'Forced'
  return null
}

function statusVariant(p: ProfileRow): string {
  if (p.is_hidden) return 'muted'
  if (p.is_alumni_override === true) return 'alumni'
  if (p.is_alumni_override === false) return 'forced'
  return ''
}

function nextStatusAction(p: ProfileRow): string {
  if (p.is_alumni_override === null) return 'Alumni'
  if (p.is_alumni_override === true) return 'Current'
  return 'Auto'
}

export function MobileSetupList({
  leagueId,
  slug,
  profiles,
}: {
  leagueId: string
  slug: string
  profiles: ProfileRow[]
}) {
  void slug
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pickingKeeper, setPickingKeeper] = useState(false)
  const [keeperId, setKeeperId] = useState<string | null>(null)

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

  function onSelectAll() {
    const allIds = profiles.map((p) => p.id)
    const every = allIds.every((id) => selected.has(id))
    setSelected(every ? new Set() : new Set(allIds))
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
    if (!confirm(`Merge ${ids.length} profiles into "${keepName}"?`)) return
    setBusy('merge'); setErr(null)
    const result = await mergeProfiles({ leagueId, profileIds: ids, keepId: keeperId })
    setBusy(null)
    if (!result.ok) { setErr(result.error); return }
    setSelected(new Set()); setPickingKeeper(false); setKeeperId(null)
    router.refresh()
  }

  async function onDelete() {
    if (selected.size === 0) return
    const ids = Array.from(selected)
    const names = ids.map((id) => profiles.find((p) => p.id === id)?.canonical_name ?? '?').slice(0, 3).join(', ')
    if (!confirm(`Delete ${ids.length} profile${ids.length === 1 ? '' : 's'} (${names}${ids.length > 3 ? '...' : ''})? This is permanent.`)) return
    setBusy('delete'); setErr(null)
    const result = await deleteProfiles({ leagueId, profileIds: ids })
    setBusy(null)
    if (!result.ok) { setErr(result.error); return }
    setSelected(new Set())
    router.refresh()
  }

  async function onToggleHide(p: ProfileRow) {
    setBusy(p.id); setErr(null)
    const r = await setHidden(p.id, leagueId, !p.is_hidden)
    setBusy(null)
    if (!r.ok) { setErr(r.error); return }
    router.refresh()
  }

  async function onCycleAlumni(p: ProfileRow) {
    const next = p.is_alumni_override === null ? true : p.is_alumni_override === true ? false : null
    setBusy(p.id); setErr(null)
    const r = await setAlumniOverride(p.id, leagueId, next)
    setBusy(null)
    if (!r.ok) { setErr(r.error); return }
    router.refresh()
  }

  function onRename(p: ProfileRow) {
    const next = prompt('Name:', p.canonical_name)
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

  function renderRow(p: ProfileRow) {
    const isSel = selected.has(p.id)
    const variant = statusVariant(p)
    return (
      <div
        key={p.id}
        className={`msl-row ${isSel ? 'selected' : ''} ${p.is_hidden ? 'hidden-profile' : ''}`}
        onClick={() => toggleSelect(p.id)}
      >
        <div className={`msl-check ${isSel ? 'on' : ''}`}>
          {isSel && (
            <svg viewBox="0 0 12 10" width="10" height="8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 5.5 4.5 9 11 1" />
            </svg>
          )}
        </div>
        <div className="msl-info">
          <div className="msl-name-row">
            <span className="msl-name">{p.canonical_name}</span>
            {statusLabel(p) && <span className={`msl-status ${variant}`}>{statusLabel(p)}</span>}
          </div>
          {p.managers.length > 0 && (
            <div className="msl-subs">
              {p.managers.map((m, i) => (
                <span key={m.id}>
                  {i > 0 && ' · '}
                  {m.display_name ?? 'Unknown'}
                  {m.team_name && m.team_name !== m.display_name && (
                    <span className="msl-team"> {m.team_name}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="msl-actions" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onRename(p)} disabled={busy !== null} className="msl-act">Rename</button>
          <button onClick={() => onCycleAlumni(p)} disabled={busy !== null} className="msl-act">
            {busy === p.id ? '...' : nextStatusAction(p)}
          </button>
          <button onClick={() => onToggleHide(p)} disabled={busy !== null} className="msl-act">
            {p.is_hidden ? 'Show' : 'Hide'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="msl">
      {/* ── Toolbar ── */}
      <div className="msl-toolbar">
        <button onClick={onSelectAll} disabled={profiles.length === 0 || busy !== null} className="msl-tool">
          {profiles.length > 0 && profiles.every((p) => selected.has(p.id)) ? 'Deselect' : 'Select all'}
        </button>
        <button onClick={onMergeStart} disabled={selected.size < 2 || busy !== null || pickingKeeper} className="msl-tool primary">
          {busy === 'merge' ? '...' : `Merge ${selected.size > 0 ? selected.size : ''}`}
        </button>
        <button onClick={onDelete} disabled={selected.size === 0 || busy !== null} className="msl-tool danger">
          {busy === 'delete' ? '...' : `Delete ${selected.size > 0 ? selected.size : ''}`}
        </button>
        {selected.size > 0 && (
          <button onClick={() => setSelected(new Set())} className="msl-tool">Clear</button>
        )}
      </div>

      {/* ── Merge keeper picker ── */}
      {pickingKeeper && (
        <div className="msl-merge-panel">
          <div className="msl-merge-q">Which profile stays?</div>
          <select
            value={keeperId ?? ''}
            onChange={(e) => setKeeperId(e.target.value || null)}
            className="msl-merge-select"
          >
            {Array.from(selected).map((id) => {
              const p = profiles.find((p) => p.id === id)
              return <option key={id} value={id}>{p?.canonical_name ?? id}</option>
            })}
          </select>
          <div className="msl-merge-btns">
            <button onClick={onMergeConfirm} disabled={!keeperId || busy !== null} className="msl-tool primary">
              {busy === 'merge' ? '...' : 'Confirm'}
            </button>
            <button onClick={() => { setPickingKeeper(false); setKeeperId(null) }} className="msl-tool">Cancel</button>
          </div>
        </div>
      )}

      {err && <p className="msl-err">{err}</p>}

      {profiles.length === 0 && (
        <div className="msl-empty">No profiles yet. Sync a source first.</div>
      )}

      {/* ── Current members ── */}
      {currentProfiles.length > 0 && (
        <div className="msl-group">
          {currentProfiles.map(renderRow)}
        </div>
      )}

      {/* ── Alumni ── */}
      {alumniProfiles.length > 0 && (
        <>
          <div className="msl-divider">
            <span className="msl-divider-label">Alumni</span>
            <span className="msl-divider-count">{alumniProfiles.length}</span>
          </div>
          <div className="msl-group">
            {alumniProfiles.map(renderRow)}
          </div>
        </>
      )}
    </div>
  )
}
