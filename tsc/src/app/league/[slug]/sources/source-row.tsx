'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { syncSource, deleteSource, updateNflSourceSettings, updateEspnSourceSettings, updateChainSourceSettings } from './actions'
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

function describeRange(source: Source): string | null {
  // NFL + ESPN always show range; Sleeper + Yahoo only show one when a manual
  // year-scope has been set on the source (otherwise the chain walks freely).
  const start = num(source.settings, 'season_start')
  const end = num(source.settings, 'season_end')
  if (source.platform === 'nfl' || source.platform === 'espn') {
    if (start && end) return start === end ? String(start) : `${start}–${end}`
    return null
  }
  if (source.platform === 'sleeper' || source.platform === 'yahoo') {
    if (start && end) return start === end ? `Limited to ${start}` : `Limited to ${start}–${end}`
    if (start) return `Limited to ${start}+`
    if (end) return `Limited to ≤${end}`
    return null
  }
  return null
}

function describePlayoff(source: Source): string | null {
  if (source.platform !== 'nfl') return null
  const week = num(source.settings, 'playoff_week_start')
  const teams = num(source.settings, 'playoff_team_count')
  if (week && teams) return `Wk ${week} · ${teams} teams`
  return null
}

export function SourceRow({
  source,
  leagueId,
  slug,
  hasCookies = false,
  syncedRange = null,
}: { source: Source; leagueId: string; slug: string; hasCookies?: boolean; syncedRange?: string | null }) {
  void slug
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState<'syncing' | 'deleting' | 'saving' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  // Custom sync panel — lets the commissioner pick which stages to refresh
  // instead of paying the full-sync runtime cost every time.
  const [customSyncOpen, setCustomSyncOpen] = useState(false)
  // NFL.com can't supply per-week lineup data (platform limitation), so
  // we disable that checkbox and exclude it from default selection there.
  const lineupsSupported = source.platform !== 'nfl'
  const [stagesSelected, setStagesSelected] = useState<Record<StageKey, boolean>>({
    matchups: true,
    drafts: true,
    lineups: lineupsSupported,
    trades: true,
  })
  const toggleStage = (k: StageKey) => setStagesSelected((s) => ({ ...s, [k]: !s[k] }))

  // Edit form state (shared between NFL + ESPN where the field overlaps)
  const [seasonStart, setSeasonStart] = useState(String(num(source.settings, 'season_start') ?? ''))
  const [seasonEnd, setSeasonEnd] = useState(String(num(source.settings, 'season_end') ?? ''))
  const [playoffWeekStart, setPlayoffWeekStart] = useState(String(num(source.settings, 'playoff_week_start') ?? '15'))
  const [playoffTeamCount, setPlayoffTeamCount] = useState(String(num(source.settings, 'playoff_team_count') ?? '6'))
  const [label, setLabel] = useState(source.label ?? '')

  // ESPN-only edit state. Cookie inputs start blank — leaving them blank on
  // save preserves the existing stored cookies; toggling "remove cookies"
  // clears them outright (used when switching a league from private to public).
  const [swid, setSwid] = useState('')
  const [espnS2, setEspnS2] = useState('')
  const [clearCookies, setClearCookies] = useState(false)

  async function onSync() {
    setBusy('syncing')
    setMsg(null)
    const result = await syncSource(source.id, leagueId)
    setBusy(null)
    if (!result.ok) {
      setMsg(result.error)
    } else {
      // Surface any ingest warnings so the user can see diagnostics (e.g. the
      // Yahoo standings-shape report) without digging through server logs.
      const warns = (result as { warnings?: string[] }).warnings ?? []
      if (warns.length) {
        const preview = warns.slice(0, 6).join('\n')
        const more = warns.length > 6 ? `\n…and ${warns.length - 6} more` : ''
        setMsg(`Synced with warnings:\n${preview}${more}`)
      }
      router.refresh()
    }
  }

  async function onCustomSync() {
    const stages = (Object.keys(stagesSelected) as StageKey[]).filter((k) => stagesSelected[k])
    if (stages.length === 0) { setMsg('Pick at least one part to sync.'); return }
    setBusy('syncing'); setMsg(null)
    const result = await syncSource(source.id, leagueId, stages)
    setBusy(null)
    if (!result.ok) {
      setMsg(result.error)
    } else {
      const warns = (result as { warnings?: string[] }).warnings ?? []
      const label = stages.join(', ')
      if (warns.length) {
        const preview = warns.slice(0, 6).join('\n')
        const more = warns.length > 6 ? `\n…and ${warns.length - 6} more` : ''
        setMsg(`Synced ${label} with warnings:\n${preview}${more}`)
      } else {
        setMsg(`Synced ${label}.`)
      }
      setCustomSyncOpen(false)
      router.refresh()
    }
  }

  function onDelete() {
    if (!confirm('Remove this source? Seasons ingested only via this source will be deleted.')) return
    setBusy('deleting')
    startTransition(async () => {
      await deleteSource(source.id, leagueId)
      router.refresh()
      setBusy(null)
    })
  }

  async function onSaveSettings() {
    setBusy('saving'); setMsg(null)
    const result = await updateNflSourceSettings({
      sourceId: source.id,
      leagueId,
      seasonStart: Number(seasonStart),
      seasonEnd: Number(seasonEnd),
      playoffWeekStart: Number(playoffWeekStart),
      playoffTeamCount: Number(playoffTeamCount),
      label: label.trim() || undefined,
    })
    setBusy(null)
    if (!result.ok) { setMsg(result.error); return }
    setEditing(false)
    setMsg('Saved. Click Sync to re-import this range with the new settings.')
    router.refresh()
  }

  async function onSaveChainSettings() {
    if (source.platform !== 'sleeper' && source.platform !== 'yahoo') return
    setBusy('saving'); setMsg(null)
    const result = await updateChainSourceSettings({
      sourceId: source.id,
      leagueId,
      platform: source.platform,
      seasonStart: seasonStart.trim() ? Number(seasonStart) : undefined,
      seasonEnd: seasonEnd.trim() ? Number(seasonEnd) : undefined,
      label: label.trim() || undefined,
    })
    setBusy(null)
    if (!result.ok) { setMsg(result.error); return }
    setEditing(false)
    setMsg('Saved. Click Sync to re-import with the new range.')
    router.refresh()
  }

  async function onSaveEspnSettings() {
    setBusy('saving'); setMsg(null)
    const result = await updateEspnSourceSettings({
      sourceId: source.id,
      leagueId,
      seasonStart: Number(seasonStart),
      seasonEnd: Number(seasonEnd),
      swid: swid.trim() || undefined,
      espnS2: espnS2.trim() || undefined,
      clearCookies,
      label: label.trim() || undefined,
    })
    setBusy(null)
    if (!result.ok) { setMsg(result.error); return }
    setEditing(false)
    setSwid(''); setEspnS2(''); setClearCookies(false)
    setMsg('Saved. Click Sync to re-import with the new settings.')
    router.refresh()
  }

  return (
    <div className="card" style={{ padding: '.85rem 1.1rem' }}>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '180px' }}>
          <div className="card-corner" style={{ position: 'static', marginBottom: '.2rem' }}>{source.platform}</div>
          <div className="card-title" style={{ fontSize: '1.1rem' }}>
            {source.label ?? 'Source'}
          </div>
          <div className="text-mono" style={{ fontSize: '.74rem', color: 'var(--cream-soft)', marginTop: '.2rem', wordBreak: 'break-all' }}>
            {source.external_id}
          </div>
          <div className="text-mono text-cream-mute" style={{ fontSize: '.6rem', letterSpacing: '.18em', textTransform: 'uppercase', marginTop: '.4rem' }}>
            {source.platform === 'nfl' || source.platform === 'espn'
              ? (describeRange(source) ?? 'No range set')
              : (source.walk_history
                  ? (describeRange(source) ?? syncedRange ?? 'Walks history')
                  : 'Single season')}
            {describePlayoff(source) && (
              <>{' · '}{describePlayoff(source)}</>
            )}
            {source.platform === 'espn' && hasCookies && (
              <>{' · '}Private (cookies stored)</>
            )}
            {' · '}
            {source.last_synced_at
              ? `synced ${new Date(source.last_synced_at).toLocaleDateString()}`
              : 'never synced'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          <button onClick={onSync} disabled={busy !== null || isPending} className="dc-btn">
            {busy === 'syncing' ? 'Syncing…' : 'Sync now →'}
          </button>
          {/* Custom sync + Edit settings share one row to keep the column
              from growing. Inner buttons shrink their font + allow a
              line break so the two-row label fits without forcing the
              column wider than "Sync now" / "Remove". */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.35rem' }}>
            <button
              onClick={() => setCustomSyncOpen((v) => !v)}
              disabled={busy !== null || isPending}
              className="dc-btn-ghost"
              style={{
                padding: '.45rem .3rem',
                fontSize: '.7rem',
                lineHeight: 1.15,
                whiteSpace: 'normal',
                minWidth: 0,
              }}
            >
              {customSyncOpen
                ? 'Cancel'
                : (<><span>Custom</span><br /><span>sync</span></>)}
            </button>
            {(source.platform === 'nfl' || source.platform === 'espn' || source.platform === 'sleeper' || source.platform === 'yahoo') && (
              <button
                onClick={() => setEditing((v) => !v)}
                disabled={busy !== null || isPending}
                className="dc-btn-ghost"
                style={{
                  padding: '.45rem .3rem',
                  fontSize: '.7rem',
                  lineHeight: 1.15,
                  whiteSpace: 'normal',
                  minWidth: 0,
                }}
              >
                {editing
                  ? 'Cancel'
                  : (<><span>Edit</span><br /><span>settings</span></>)}
              </button>
            )}
          </div>
          <button onClick={onDelete} disabled={busy !== null || isPending} className="dc-btn-ghost">
            Remove
          </button>
        </div>
      </div>

      {customSyncOpen && (
        <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(255,255,255,.025)', borderRadius: '2px', borderLeft: '3px solid var(--gold)' }}>
          <div className="dc-form" style={{ gap: '.75rem' }}>
            <div className="dc-field">
              <label className="dc-label">Sync only these parts</label>
              <span className="dc-checkbox-hint" style={{ marginBottom: '.5rem' }}>
                Skip the ones you don&apos;t need to refresh — faster than a full sync.
              </span>
              <label className="dc-checkbox-row">
                <input type="checkbox" checked={stagesSelected.matchups} onChange={() => toggleStage('matchups')} />
                <span><strong>Matchups &amp; standings</strong> — per-week scores, records, finishes</span>
              </label>
              <label className="dc-checkbox-row">
                <input type="checkbox" checked={stagesSelected.drafts} onChange={() => toggleStage('drafts')} />
                <span><strong>Drafts</strong> — pick-by-pick results</span>
              </label>
              <label className="dc-checkbox-row" style={{ opacity: lineupsSupported ? 1 : 0.5 }}>
                <input
                  type="checkbox"
                  checked={stagesSelected.lineups}
                  onChange={() => toggleStage('lineups')}
                  disabled={!lineupsSupported}
                />
                <span>
                  <strong>Weekly lineups</strong> — per-week starters &amp; bench
                  {!lineupsSupported && (
                    <em style={{ display: 'block', fontSize: '.7rem', opacity: 0.75, marginTop: '.1rem' }}>
                      NFL.com doesn&apos;t preserve per-week lineup data in their archive.
                    </em>
                  )}
                </span>
              </label>
              <label className="dc-checkbox-row">
                <input type="checkbox" checked={stagesSelected.trades} onChange={() => toggleStage('trades')} />
                <span><strong>Trades</strong> — completed deals &amp; assets</span>
              </label>
            </div>
            <button onClick={onCustomSync} disabled={busy !== null} className="dc-btn dc-btn-block">
              {busy === 'syncing' ? 'Syncing…' : 'Sync selected →'}
            </button>
          </div>
        </div>
      )}

      {editing && source.platform === 'nfl' && (
        <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(255,255,255,.025)', borderRadius: '2px', borderLeft: '3px solid var(--gold)' }}>
          <div className="dc-form" style={{ gap: '.85rem' }}>
            <div className="dc-field">
              <label className="dc-label">Label (optional)</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="dc-input"
                placeholder="e.g. 2022–2025 (4-team playoffs)"
              />
            </div>
            <div className="dc-field">
              <label className="dc-label">Season range</label>
              <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={seasonStart}
                  onChange={(e) => setSeasonStart(e.target.value)}
                  className="dc-input mono"
                  style={{ flex: '0 0 6.5rem', textAlign: 'center' }}
                />
                <span style={{ opacity: 0.6 }}>through</span>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={seasonEnd}
                  onChange={(e) => setSeasonEnd(e.target.value)}
                  className="dc-input mono"
                  style={{ flex: '0 0 6.5rem', textAlign: 'center' }}
                />
              </div>
            </div>
            <div className="dc-field">
              <label className="dc-label">Playoffs</label>
              <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', flex: '0 0 10rem' }}>
                  <span className="dc-checkbox-hint" style={{ margin: 0 }}>Start week</span>
                  <select
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
                After saving, click <strong>Sync now</strong> to re-ingest this year range with the new playoff config.
              </span>
            </div>
            <button onClick={onSaveSettings} disabled={busy !== null} className="dc-btn dc-btn-block">
              {busy === 'saving' ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </div>
      )}

      {editing && (source.platform === 'sleeper' || source.platform === 'yahoo') && (
        <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(255,255,255,.025)', borderRadius: '2px', borderLeft: '3px solid var(--gold)' }}>
          <div className="dc-form" style={{ gap: '.85rem' }}>
            <div className="dc-field">
              <label className="dc-label">Label (optional)</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="dc-input"
                placeholder="e.g. Sleeper era 2021+"
              />
            </div>
            <div className="dc-field">
              <label className="dc-label">Limit to year range (optional)</label>
              <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  placeholder="from"
                  value={seasonStart}
                  onChange={(e) => setSeasonStart(e.target.value)}
                  className="dc-input mono"
                  style={{ flex: '0 0 6.5rem', textAlign: 'center' }}
                />
                <span style={{ opacity: 0.6 }}>through</span>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  placeholder="to"
                  value={seasonEnd}
                  onChange={(e) => setSeasonEnd(e.target.value)}
                  className="dc-input mono"
                  style={{ flex: '0 0 6.5rem', textAlign: 'center' }}
                />
              </div>
              <span className="dc-checkbox-hint">
                Leave both blank to ingest every season the chain reaches. Use this when a
                second source (e.g. Yahoo) already covers some years and you don&apos;t want
                duplicates from a partial Sleeper season the league never actually played.
              </span>
            </div>
            <button onClick={onSaveChainSettings} disabled={busy !== null} className="dc-btn dc-btn-block">
              {busy === 'saving' ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </div>
      )}

      {editing && source.platform === 'espn' && (
        <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(255,255,255,.025)', borderRadius: '2px', borderLeft: '3px solid var(--gold)' }}>
          <div className="dc-form" style={{ gap: '.85rem' }}>
            <div className="dc-field">
              <label className="dc-label">Label (optional)</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="dc-input"
                placeholder="e.g. 2020–2025"
              />
            </div>
            <div className="dc-field">
              <label className="dc-label">Season range</label>
              <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={seasonStart}
                  onChange={(e) => setSeasonStart(e.target.value)}
                  className="dc-input mono"
                  style={{ flex: '0 0 6.5rem', textAlign: 'center' }}
                />
                <span style={{ opacity: 0.6 }}>through</span>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={seasonEnd}
                  onChange={(e) => setSeasonEnd(e.target.value)}
                  className="dc-input mono"
                  style={{ flex: '0 0 6.5rem', textAlign: 'center' }}
                />
              </div>
            </div>

            <div className="dc-field">
              <label className="dc-label">Private league cookies</label>
              <span className="dc-checkbox-hint" style={{ marginBottom: '.5rem' }}>
                {hasCookies
                  ? 'Cookies are stored. Leave both fields blank to keep them, or paste fresh values to replace.'
                  : 'Only required for private leagues. Leave blank for public.'}
              </span>
              <input
                value={swid}
                onChange={(e) => { setSwid(e.target.value); setClearCookies(false) }}
                className="dc-input mono"
                placeholder="SWID — {ABC12345-...}"
                style={{ marginBottom: '.5rem' }}
              />
              <input
                value={espnS2}
                onChange={(e) => { setEspnS2(e.target.value); setClearCookies(false) }}
                className="dc-input mono"
                placeholder="espn_s2 token"
              />
              {hasCookies && (
                <label className="dc-checkbox-row" style={{ marginTop: '.5rem' }}>
                  <input
                    type="checkbox"
                    checked={clearCookies}
                    onChange={(e) => {
                      setClearCookies(e.target.checked)
                      if (e.target.checked) { setSwid(''); setEspnS2('') }
                    }}
                  />
                  <span>Remove stored cookies (league is now public)</span>
                </label>
              )}
            </div>

            <button onClick={onSaveEspnSettings} disabled={busy !== null} className="dc-btn dc-btn-block">
              {busy === 'saving' ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p
          className={msg.startsWith('Saved') || msg.startsWith('Synced') ? 'dc-form-ok' : 'dc-form-error'}
          style={{ marginTop: '.85rem', whiteSpace: 'pre-wrap', fontFamily: msg.startsWith('Synced') ? 'var(--mono)' : undefined, fontSize: msg.startsWith('Synced') ? '.75rem' : undefined }}
        >
          {msg}
        </p>
      )}
    </div>
  )
}
