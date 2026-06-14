'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { syncSource, deleteSource, updateNflSourceSettings, updateEspnSourceSettings, updateChainSourceSettings } from '@/app/league/[slug]/sources/actions'
import type { StageKey } from '@/lib/ingest/stages'

type Source = {
  id: string
  platform: string
  external_id: string
  label: string | null
  walk_history: boolean
  settings: Record<string, unknown> | null
  last_synced_at: string | null
}

function num(s: Record<string, unknown> | null | undefined, k: string): number | null {
  const v = s?.[k]
  return typeof v === 'number' ? v : null
}

export function MobileSourceRow({
  source,
  leagueId,
  slug,
  hasCookies = false,
  syncedRange = null,
}: {
  source: Source
  leagueId: string
  slug: string
  hasCookies?: boolean
  syncedRange?: string | null
}) {
  void slug
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState<'syncing' | 'deleting' | 'saving' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<'custom' | 'settings' | null>(null)
  const [stagesSelected, setStagesSelected] = useState<Record<StageKey, boolean>>({
    matchups: true, drafts: true, lineups: true, trades: true,
  })
  const toggleStage = (k: StageKey) => setStagesSelected((s) => ({ ...s, [k]: !s[k] }))

  const [seasonStart, setSeasonStart] = useState(String(num(source.settings, 'season_start') ?? ''))
  const [seasonEnd, setSeasonEnd] = useState(String(num(source.settings, 'season_end') ?? ''))
  const [playoffWeekStart, setPlayoffWeekStart] = useState(String(num(source.settings, 'playoff_week_start') ?? '15'))
  const [playoffTeamCount, setPlayoffTeamCount] = useState(String(num(source.settings, 'playoff_team_count') ?? '6'))
  const [label, setLabel] = useState(source.label ?? '')
  const [swid, setSwid] = useState('')
  const [espnS2, setEspnS2] = useState('')
  const [clearCookies, setClearCookies] = useState(false)

  const hasSettings = source.platform === 'nfl' || source.platform === 'espn' || source.platform === 'sleeper' || source.platform === 'yahoo'

  async function onSync() {
    setBusy('syncing'); setMsg(null)
    const result = await syncSource(source.id, leagueId)
    setBusy(null)
    if (!result.ok) { setMsg(result.error) } else {
      const warns = (result as { warnings?: string[] }).warnings ?? []
      if (warns.length) setMsg(`Synced with ${warns.length} warning${warns.length === 1 ? '' : 's'}`)
      router.refresh()
    }
  }

  async function onCustomSync() {
    const stages = (Object.keys(stagesSelected) as StageKey[]).filter((k) => stagesSelected[k])
    if (stages.length === 0) { setMsg('Pick at least one.'); return }
    setBusy('syncing'); setMsg(null)
    const result = await syncSource(source.id, leagueId, stages)
    setBusy(null)
    if (!result.ok) { setMsg(result.error) } else {
      setMsg(`Synced ${stages.join(', ')}.`)
      setExpanded(null)
      router.refresh()
    }
  }

  function onDelete() {
    if (!confirm('Remove this source? Seasons only from this source will be deleted.')) return
    setBusy('deleting')
    startTransition(async () => {
      await deleteSource(source.id, leagueId)
      router.refresh()
      setBusy(null)
    })
  }

  async function onSaveSettings() {
    setBusy('saving'); setMsg(null)
    let result: { ok: true } | { ok: false; error: string }
    if (source.platform === 'nfl') {
      result = await updateNflSourceSettings({
        sourceId: source.id, leagueId,
        seasonStart: Number(seasonStart), seasonEnd: Number(seasonEnd),
        playoffWeekStart: Number(playoffWeekStart), playoffTeamCount: Number(playoffTeamCount),
        label: label.trim() || undefined,
      })
    } else if (source.platform === 'espn') {
      result = await updateEspnSourceSettings({
        sourceId: source.id, leagueId,
        seasonStart: Number(seasonStart), seasonEnd: Number(seasonEnd),
        swid: swid.trim() || undefined, espnS2: espnS2.trim() || undefined,
        clearCookies, label: label.trim() || undefined,
      })
    } else {
      result = await updateChainSourceSettings({
        sourceId: source.id, leagueId, platform: source.platform,
        seasonStart: seasonStart.trim() ? Number(seasonStart) : undefined,
        seasonEnd: seasonEnd.trim() ? Number(seasonEnd) : undefined,
        label: label.trim() || undefined,
      })
    }
    setBusy(null)
    if (!result.ok) { setMsg(result.error); return }
    setExpanded(null); setSwid(''); setEspnS2(''); setClearCookies(false)
    setMsg('Saved. Sync to apply.')
    router.refresh()
  }

  const rangeStart = num(source.settings, 'season_start')
  const rangeEnd = num(source.settings, 'season_end')
  const rangeText = rangeStart && rangeEnd
    ? rangeStart === rangeEnd ? String(rangeStart) : `${rangeStart}--${rangeEnd}`
    : syncedRange ?? (source.walk_history ? 'Walks history' : 'Single season')

  return (
    <div className="msr">
      {/* ── Header row ── */}
      <div className="msr-head">
        <span className="msr-platform">{source.platform}</span>
        <span className="msr-label">{source.label ?? 'Source'}</span>
        {source.last_synced_at && (
          <span className="msr-synced">
            {new Date(source.last_synced_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
      <div className="msr-id">{source.external_id}</div>
      <div className="msr-meta">
        {rangeText}
        {hasCookies && ' · Private'}
      </div>

      {/* ── Action pills ── */}
      <div className="msr-actions">
        <button onClick={onSync} disabled={busy !== null || isPending} className="msr-btn primary">
          {busy === 'syncing' ? 'Syncing...' : 'Sync'}
        </button>
        <button
          onClick={() => setExpanded(expanded === 'custom' ? null : 'custom')}
          disabled={busy !== null || isPending}
          className={`msr-btn ${expanded === 'custom' ? 'active' : ''}`}
        >
          Custom
        </button>
        {hasSettings && (
          <button
            onClick={() => setExpanded(expanded === 'settings' ? null : 'settings')}
            disabled={busy !== null || isPending}
            className={`msr-btn ${expanded === 'settings' ? 'active' : ''}`}
          >
            Settings
          </button>
        )}
        <button onClick={onDelete} disabled={busy !== null || isPending} className="msr-btn danger">
          {busy === 'deleting' ? '...' : 'Remove'}
        </button>
      </div>

      {/* ── Custom sync panel ── */}
      {expanded === 'custom' && (
        <div className="msr-panel">
          <div className="msr-panel-title">Sync only</div>
          {(['matchups', 'drafts', 'lineups', 'trades'] as StageKey[]).map((k) => (
            <label key={k} className="msr-check-row">
              <input type="checkbox" checked={stagesSelected[k]} onChange={() => toggleStage(k)} />
              <span>{k.charAt(0).toUpperCase() + k.slice(1)}</span>
            </label>
          ))}
          <button onClick={onCustomSync} disabled={busy !== null} className="msr-btn primary full">
            {busy === 'syncing' ? 'Syncing...' : 'Sync selected'}
          </button>
        </div>
      )}

      {/* ── Settings panel ── */}
      {expanded === 'settings' && (
        <div className="msr-panel">
          <div className="msr-panel-title">Source settings</div>
          <div className="msr-field">
            <label className="msr-field-label">Label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="msr-input" placeholder="Optional label" />
          </div>
          <div className="msr-field">
            <label className="msr-field-label">
              {source.platform === 'sleeper' || source.platform === 'yahoo' ? 'Limit years' : 'Season range'}
            </label>
            <div className="msr-range">
              <input type="number" min={2000} max={2100} value={seasonStart} onChange={(e) => setSeasonStart(e.target.value)} className="msr-input msr-input-yr" placeholder="from" />
              <span className="msr-range-sep">--</span>
              <input type="number" min={2000} max={2100} value={seasonEnd} onChange={(e) => setSeasonEnd(e.target.value)} className="msr-input msr-input-yr" placeholder="to" />
            </div>
          </div>
          {source.platform === 'nfl' && (
            <div className="msr-field">
              <label className="msr-field-label">Playoffs</label>
              <div className="msr-range">
                <select value={playoffWeekStart} onChange={(e) => setPlayoffWeekStart(e.target.value)} className="msr-select">
                  <option value="14">Wk 14</option><option value="15">Wk 15</option><option value="16">Wk 16</option>
                </select>
                <select value={playoffTeamCount} onChange={(e) => setPlayoffTeamCount(e.target.value)} className="msr-select">
                  <option value="4">4 teams</option><option value="6">6 teams</option><option value="8">8 teams</option>
                </select>
              </div>
            </div>
          )}
          {source.platform === 'espn' && (
            <div className="msr-field">
              <label className="msr-field-label">Private cookies</label>
              <input value={swid} onChange={(e) => { setSwid(e.target.value); setClearCookies(false) }} className="msr-input" placeholder="SWID" />
              <input value={espnS2} onChange={(e) => { setEspnS2(e.target.value); setClearCookies(false) }} className="msr-input" placeholder="espn_s2" style={{ marginTop: '.3rem' }} />
              {hasCookies && (
                <label className="msr-check-row" style={{ marginTop: '.3rem' }}>
                  <input type="checkbox" checked={clearCookies} onChange={(e) => { setClearCookies(e.target.checked); if (e.target.checked) { setSwid(''); setEspnS2('') } }} />
                  <span>Remove cookies</span>
                </label>
              )}
            </div>
          )}
          <button onClick={onSaveSettings} disabled={busy !== null} className="msr-btn primary full">
            {busy === 'saving' ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}

      {msg && <p className={`msr-msg ${msg.startsWith('Saved') || msg.startsWith('Synced') ? 'ok' : 'err'}`}>{msg}</p>}
    </div>
  )
}
