'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { syncSource, deleteSource, updateNflSourceSettings, updateEspnSourceSettings } from './actions'

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
  if (source.platform !== 'nfl' && source.platform !== 'espn') return null
  const start = num(source.settings, 'season_start')
  const end = num(source.settings, 'season_end')
  if (start && end) return start === end ? String(start) : `${start}–${end}`
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
}: { source: Source; leagueId: string; slug: string; hasCookies?: boolean }) {
  void slug
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState<'syncing' | 'deleting' | 'saving' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

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
    if (!result.ok) setMsg(result.error)
    else router.refresh()
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
              : (source.walk_history ? 'Walks history' : 'Single season')}
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
          {(source.platform === 'nfl' || source.platform === 'espn') && (
            <button
              onClick={() => setEditing((v) => !v)}
              disabled={busy !== null || isPending}
              className="dc-btn-ghost"
            >
              {editing ? 'Cancel' : 'Edit settings'}
            </button>
          )}
          <button onClick={onDelete} disabled={busy !== null || isPending} className="dc-btn-ghost">
            Remove
          </button>
        </div>
      </div>

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

      {msg && <p className={msg.startsWith('Saved') ? 'dc-form-ok' : 'dc-form-error'} style={{ marginTop: '.85rem' }}>{msg}</p>}
    </div>
  )
}
