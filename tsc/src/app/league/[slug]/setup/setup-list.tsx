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

function statusLabel(p: ProfileRow): string {
  if (p.is_hidden) return 'Hidden'
  if (p.is_alumni_override === true) return 'Alumni (forced)'
  if (p.is_alumni_override === false) return 'Current (forced)'
  return p.auto_current ? 'Current (auto)' : 'Alumni (auto)'
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
      `Every season, matchup, and rivalry tied to them is wiped too. This can't be undone — Hide is safer if you just want them off the public site.`
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
      <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        <button
          onClick={onSelectAll}
          disabled={profiles.length === 0 || busy !== null}
          className="dc-btn-ghost"
        >
          {profiles.length > 0 && profiles.every((p) => selected.has(p.id)) ? 'Deselect all' : 'Select all'}
        </button>
        <button
          onClick={onMergeStart}
          disabled={selected.size < 2 || busy !== null || pickingKeeper}
          className="dc-btn"
        >
          {busy === 'merge' ? 'Merging…' : `Merge ${selected.size}`}
        </button>
        <button
          onClick={onDelete}
          disabled={selected.size === 0 || busy !== null}
          className="dc-btn-ghost"
          style={{ color: 'var(--fire, #d65a3c)', borderColor: 'rgba(214,90,60,.4)' }}
          title="Delete the profile AND its underlying stats — permanent. Use Hide instead for a soft remove."
        >
          {busy === 'delete' ? 'Deleting…' : `Delete ${selected.size}`}
        </button>
        <button
          onClick={() => setSelected(new Set())}
          disabled={selected.size === 0 || busy !== null}
          className="dc-btn-ghost"
        >
          Clear
        </button>
        <span style={{ flex: 1, minWidth: '14rem', opacity: 0.6, fontSize: '.8rem' }}>
          Pick the keeper after clicking Merge · Delete is permanent (cascades stats)
        </span>
      </div>

      {pickingKeeper && (
        <div className="dc-card-row" style={{ marginBottom: '.85rem' }}>
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem' }}>
              Which profile should stay?
            </div>
            <div style={{ opacity: 0.6, fontSize: '.8rem', marginTop: '.25rem' }}>
              The others get deleted; their stats roll up under the keeper.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={keeperId ?? ''}
              onChange={(e) => setKeeperId(e.target.value || null)}
              className="dc-input"
              style={{ minWidth: '14rem' }}
            >
              {Array.from(selected).map((id) => {
                const p = profiles.find((p) => p.id === id)
                return <option key={id} value={id}>{p?.canonical_name ?? id}</option>
              })}
            </select>
            <button
              onClick={onMergeConfirm}
              disabled={!keeperId || busy !== null}
              className="dc-btn"
            >
              {busy === 'merge' ? 'Merging…' : 'Confirm merge'}
            </button>
            <button
              onClick={onMergeCancel}
              disabled={busy !== null}
              className="dc-btn-ghost"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {err && <p className="dc-form-error" style={{ marginBottom: '.85rem' }}>{err}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))', gap: '.5rem' }}>
        {profiles.length === 0 && (
          <div className="dc-empty" style={{ gridColumn: '1 / -1' }}><div className="dc-empty-text">No profiles yet — sync a source first.</div></div>
        )}
        {profiles.map((p) => {
          const isSel = selected.has(p.id)
          return (
            <div key={p.id} className="card" style={{ padding: '.45rem .7rem', opacity: p.is_hidden ? 0.55 : 1 }}>
              <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="checkbox"
                  checked={isSel}
                  onChange={() => toggleSelect(p.id)}
                  style={{ transform: 'scale(1.15)', cursor: 'pointer' }}
                />
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: '1rem', display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span>{p.canonical_name}</span>
                    <span className="text-mono text-cream-mute" style={{ fontSize: '.55rem', letterSpacing: '.18em', textTransform: 'uppercase' }}>
                      {statusLabel(p)}
                      {p.managers.length > 1 && <> · {p.managers.length} merged</>}
                    </span>
                  </div>
                  {p.managers.length > 0 && (
                    <div style={{ marginTop: '.2rem', fontSize: '.7rem', color: 'var(--cream-mute)', display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                      {p.managers.map((m, i) => (
                        <span key={m.id}>
                          {i > 0 && <span style={{ opacity: 0.4 }}>· </span>}
                          {m.display_name ?? 'Unknown'}
                          {m.team_name && m.team_name !== m.display_name && (
                            <span style={{ opacity: 0.55 }}> ({m.team_name})</span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '.3rem' }}>
                  <button
                    onClick={() => onRename(p)}
                    disabled={busy !== null}
                    className="dc-btn-ghost"
                    style={{ fontSize: '.65rem', padding: '.25rem .55rem' }}
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => onCycleAlumni(p)}
                    disabled={busy !== null}
                    className="dc-btn-ghost"
                    style={{ fontSize: '.65rem', padding: '.25rem .55rem' }}
                    title="Cycle: Auto → Alumni → Current → Auto"
                  >
                    {busy === p.id ? '…' : nextStatusAction(p)}
                  </button>
                  <button
                    onClick={() => onToggleHide(p)}
                    disabled={busy !== null}
                    className="dc-btn-ghost"
                    style={{ fontSize: '.65rem', padding: '.25rem .55rem' }}
                  >
                    {p.is_hidden ? 'Unhide' : 'Hide'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
