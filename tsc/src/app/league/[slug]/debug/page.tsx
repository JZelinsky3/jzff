import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exportLeague } from '@/lib/export/pams'

// Quick-and-dirty diagnostics for a league. Shows per-season counts so we can
// spot empty parses (standings, matchups, drafts, final_rank assignments).
export default async function DebugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) notFound()

  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, year, settings, champion_manager_id, runner_up_manager_id, regular_season_winner_id')
    .eq('league_id', league.id)
    .order('year', { ascending: true })

  const seasonIds = (seasons ?? []).map((s) => s.id)
  if (seasonIds.length === 0) {
    return <pre style={{ padding: '2rem', fontFamily: 'var(--mono)' }}>No seasons yet.</pre>
  }

  const [{ data: managerSeasons }, { data: matchups }, { data: drafts }] = await Promise.all([
    supabase
      .from('manager_seasons')
      .select('season_id, manager_id, final_rank, regular_rank, wins, losses, ties, points_for')
      .in('season_id', seasonIds),
    supabase
      .from('matchups')
      .select('season_id, week, is_playoff, is_championship, manager_a_id, manager_b_id, score_a, score_b')
      .in('season_id', seasonIds),
    supabase.from('drafts').select('id, season_id').in('season_id', seasonIds),
  ])

  // Aggregate counts per season.
  type Row = {
    year: number
    managers: number
    finalRanks: Record<number, number>     // rank → count
    nullFinalRanks: number
    matchups: number
    playoffMatchups: number
    weeks: number[]
    playoffWeeks: number[]
    settings: Record<string, unknown>
    drafts: number
  }
  const byYear: Row[] = (seasons ?? []).map((s) => {
    const ms = (managerSeasons ?? []).filter((r) => r.season_id === s.id)
    const mt = (matchups ?? []).filter((r) => r.season_id === s.id)
    const ds = (drafts ?? []).filter((r) => r.season_id === s.id)
    const finalRanks: Record<number, number> = {}
    let nullFinalRanks = 0
    for (const r of ms) {
      if (r.final_rank == null) nullFinalRanks++
      else finalRanks[r.final_rank] = (finalRanks[r.final_rank] ?? 0) + 1
    }
    const weeks = Array.from(new Set(mt.map((r) => r.week))).sort((a, b) => a - b)
    const playoffWeeks = Array.from(new Set(mt.filter((r) => r.is_playoff).map((r) => r.week))).sort((a, b) => a - b)
    return {
      year: s.year,
      managers: ms.length,
      finalRanks,
      nullFinalRanks,
      matchups: mt.length,
      playoffMatchups: mt.filter((r) => r.is_playoff).length,
      weeks,
      playoffWeeks,
      settings: (s.settings ?? {}) as Record<string, unknown>,
      drafts: ds.length,
    }
  })

  // Direct admin-client probes to compare against what the RLS client returns above.
  const admin = createAdminClient()
  const adminMs = await admin.from('manager_seasons').select('season_id, manager_id, final_rank')
  const adminMsThisLeague = (adminMs.data ?? []).filter((r) => seasonIds.includes(r.season_id))
  const adminMatchups = await admin.from('matchups').select('season_id, is_playoff')
  const adminMatchupsThisLeague = (adminMatchups.data ?? []).filter((r) => seasonIds.includes(r.season_id))

  // ID consistency check: every manager_id that appears in matchups should also
  // appear in manager_seasons. If they diverge, we have stale FK references.
  const adminMatchupsFull = await admin.from('matchups').select('season_id, manager_a_id, manager_b_id').in('season_id', seasonIds)
  const matchupManagerIds = new Set<string>()
  for (const r of adminMatchupsFull.data ?? []) {
    matchupManagerIds.add(r.manager_a_id)
    matchupManagerIds.add(r.manager_b_id)
  }
  const msManagerIds = new Set<string>()
  for (const r of adminMsThisLeague) msManagerIds.add(r.manager_id)
  const adminManagers = await admin.from('managers').select('id, external_id, display_name').eq('league_id', league.id)
  const managersTableIds = new Set<string>((adminManagers.data ?? []).map((m) => m.id))
  // Find divergence
  const inMatchupsNotMs = [...matchupManagerIds].filter((id) => !msManagerIds.has(id))
  const inMsNotMatchups = [...msManagerIds].filter((id) => !matchupManagerIds.has(id))
  const inMatchupsNotManagers = [...matchupManagerIds].filter((id) => !managersTableIds.has(id))
  const inMsNotManagers = [...msManagerIds].filter((id) => !managersTableIds.has(id))

  // Reproduce loadSnapshot's exact query path to see what's actually getting joined.
  const sampleMgr = (adminManagers.data ?? []).find((m) => m.display_name?.toLowerCase() === 'mason')
    ?? adminManagers.data?.[0]
  let sampleMs: { season_id: string; manager_id: string; final_rank: number | null }[] = []
  let sampleMgrIdInMsByManager = false
  if (sampleMgr) {
    const all = await admin.from('manager_seasons').select('season_id, manager_id, final_rank')
    sampleMs = (all.data ?? []).filter((r) => r.manager_id === sampleMgr.id)
    const m = new Map<string, unknown>()
    for (const r of all.data ?? []) {
      if (!m.has(r.manager_id)) m.set(r.manager_id, [])
    }
    sampleMgrIdInMsByManager = m.has(sampleMgr.id)
  }

  // Exactly reproduce loadSnapshot's parallel Promise.all to see if any path returns nothing.
  const [seasonsR, managersR, msR] = await Promise.all([
    admin.from('seasons').select('id, year').eq('league_id', league.id),
    admin
      .from('managers')
      .select('id, external_id, display_name, team_name, avatar_url, profile_id')
      .eq('league_id', league.id)
      .then((res) => {
        if (res.error) {
          return admin
            .from('managers')
            .select('id, external_id, display_name, team_name, avatar_url')
            .eq('league_id', league.id)
            .then((r) => ({ data: r.data?.map((m) => ({ ...m, profile_id: null })) ?? null, error: r.error }))
        }
        return res
      }),
    admin.from('manager_seasons').select('season_id, manager_id, final_rank') as unknown as Promise<{ data: { season_id: string; manager_id: string; final_rank: number | null }[] | null; error: unknown }>,
  ])
  const repSeasonIds = new Set((seasonsR.data ?? []).map((s) => s.id))
  const repManagerIds = new Set((managersR.data ?? []).map((m) => m.id))
  const repMsFiltered = (msR.data ?? []).filter((r) => repSeasonIds.has(r.season_id) && repManagerIds.has(r.manager_id))
  const repMsByManager = new Map<string, unknown[]>()
  for (const r of repMsFiltered) {
    if (!repMsByManager.has(r.manager_id)) repMsByManager.set(r.manager_id, [])
    repMsByManager.get(r.manager_id)!.push(r)
  }
  const sampleMgrInRepMap = sampleMgr ? repMsByManager.has(sampleMgr.id) : false
  const sampleMgrRepCount = sampleMgr ? (repMsByManager.get(sampleMgr.id)?.length ?? 0) : 0

  // Run the exporter and pull what the standings page would actually display.
  type DirManager = {
    user_id: string | null
    name: string
    is_current: boolean
    wins: number
    losses: number
    ties: number
    reg_record?: string
    playoff_record?: string
  }
  const bundle = await exportLeague(league.id)
  const dir = bundle['managers_directory.json'] as { managers: DirManager[] } | undefined
  const dirManagers = dir?.managers ?? []

  // Pull each manager's per-file JSON too (that's what standings.html actually reads).
  type ManagerFile = {
    user_id: string | null
    name: string
    reg_record: string
    playoff_record: string
    reg_win_pct: number
    playoff_win_pct: number
    season_ledger?: Array<{ year: number; final_rank: number | null; reg_record: string; playoff_record: string }>
  }
  const managerFiles: ManagerFile[] = dirManagers
    .map((m) => bundle[`managers/${m.user_id}.json`] as ManagerFile | undefined)
    .filter((m): m is ManagerFile => !!m)

  return (
    <main style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto', fontFamily: 'var(--mono)', fontSize: '.75rem' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: '2rem', marginBottom: '1.5rem' }}>
        {league.name} · debug
      </h1>
      <p style={{ opacity: 0.7, marginBottom: '1.5rem' }}>
        Per-season snapshot of what landed in the database. Look for: 0 playoff matchups, all final ranks null, etc.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--ink-line)', textAlign: 'left' }}>
            <th style={{ padding: '.4rem' }}>Year</th>
            <th>Managers</th>
            <th>Matchups</th>
            <th>Playoff matchups</th>
            <th>Weeks</th>
            <th>Playoff weeks</th>
            <th>Final ranks (count)</th>
            <th>Nulls</th>
            <th>Drafts</th>
            <th>Settings</th>
          </tr>
        </thead>
        <tbody>
          {byYear.map((r) => (
            <tr key={r.year} style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
              <td style={{ padding: '.4rem' }}><strong>{r.year}</strong></td>
              <td>{r.managers}</td>
              <td style={{ color: r.matchups === 0 ? 'var(--rust)' : undefined }}>{r.matchups}</td>
              <td style={{ color: r.playoffMatchups === 0 ? 'var(--rust)' : undefined }}>{r.playoffMatchups}</td>
              <td>{r.weeks.join(',')}</td>
              <td>{r.playoffWeeks.join(',') || '—'}</td>
              <td>
                {Object.entries(r.finalRanks)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([rk, cnt]) => `${rk}:${cnt}`)
                  .join(' ')}
              </td>
              <td style={{ color: r.nullFinalRanks > 0 ? 'var(--rust)' : undefined }}>{r.nullFinalRanks}</td>
              <td>{r.drafts}</td>
              <td style={{ fontSize: '.7em', opacity: 0.7 }}>{JSON.stringify(r.settings)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.4rem', marginTop: '2.5rem', marginBottom: '.5rem' }}>
        Admin vs RLS client probe
      </h2>
      <div style={{ padding: '.8rem 1rem', background: 'rgba(255,255,255,.03)', borderRadius: '2px', marginBottom: '1.5rem' }}>
        <div>manager_seasons rows (RLS client, filtered by this league&apos;s seasons): <strong>{(managerSeasons ?? []).length}</strong></div>
        <div>manager_seasons rows (admin client, total in DB): <strong>{(adminMs.data ?? []).length}</strong> · admin error: <strong>{adminMs.error?.message ?? 'none'}</strong></div>
        <div>manager_seasons rows (admin client, filtered to this league&apos;s seasons): <strong>{adminMsThisLeague.length}</strong></div>
        <div>matchups rows (admin client, total in DB): <strong>{(adminMatchups.data ?? []).length}</strong></div>
        <div>matchups rows (admin client, filtered to this league&apos;s seasons): <strong>{adminMatchupsThisLeague.length}</strong></div>
        <div>seasonIds for this league: <strong>{seasonIds.length}</strong></div>
        <hr style={{ margin: '.6rem 0', opacity: 0.3 }} />
        <div>Distinct manager_ids in matchups (this league): <strong>{matchupManagerIds.size}</strong></div>
        <div>Distinct manager_ids in manager_seasons (this league): <strong>{msManagerIds.size}</strong></div>
        <div>Distinct manager_ids in managers table (this league): <strong>{managersTableIds.size}</strong></div>
        <div style={{ color: inMatchupsNotMs.length > 0 ? 'var(--rust)' : undefined }}>
          IDs in matchups but NOT manager_seasons: <strong>{inMatchupsNotMs.length}</strong>
          {inMatchupsNotMs.length > 0 && <span style={{ fontSize: '.8em', opacity: 0.6 }}> ({inMatchupsNotMs.slice(0, 3).join(', ')}{inMatchupsNotMs.length > 3 ? '…' : ''})</span>}
        </div>
        <div style={{ color: inMsNotMatchups.length > 0 ? 'var(--rust)' : undefined }}>
          IDs in manager_seasons but NOT matchups: <strong>{inMsNotMatchups.length}</strong>
          {inMsNotMatchups.length > 0 && <span style={{ fontSize: '.8em', opacity: 0.6 }}> ({inMsNotMatchups.slice(0, 3).join(', ')}{inMsNotMatchups.length > 3 ? '…' : ''})</span>}
        </div>
        <div style={{ color: inMatchupsNotManagers.length > 0 ? 'var(--rust)' : undefined }}>
          IDs in matchups but NOT in managers table: <strong>{inMatchupsNotManagers.length}</strong>
        </div>
        <div style={{ color: inMsNotManagers.length > 0 ? 'var(--rust)' : undefined }}>
          IDs in manager_seasons but NOT in managers table: <strong>{inMsNotManagers.length}</strong>
        </div>
      </div>

      <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.4rem', marginTop: '2.5rem', marginBottom: '.5rem' }}>
        Sample manager probe — reproducing loadSnapshot path
      </h2>
      <div style={{ padding: '.8rem 1rem', background: 'rgba(255,255,255,.03)', borderRadius: '2px', marginBottom: '1.5rem' }}>
        <div>Sample manager: <strong>{sampleMgr?.display_name ?? 'none'}</strong> · id: <code style={{ fontSize: '.7em' }}>{sampleMgr?.id ?? '—'}</code></div>
        <div>manager_seasons rows with that exact manager_id (admin direct query): <strong>{sampleMs.length}</strong></div>
        <div>Their id IS a key in a Map built from the same query: <strong>{String(sampleMgrIdInMsByManager)}</strong></div>
        <div style={{ marginTop: '.4rem', fontSize: '.75em', opacity: 0.7 }}>
          Sample rows: {sampleMs.slice(0, 3).map((r) => `${r.season_id.slice(0, 8)}…/rank:${r.final_rank ?? '?'}`).join(', ')}
        </div>
        <hr style={{ margin: '.6rem 0', opacity: 0.3 }} />
        <div style={{ fontFamily: 'var(--mono)', fontSize: '.75em' }}>
          <strong>Reproducing loadSnapshot Promise.all exactly:</strong>
        </div>
        <div>seasonsR.data length: <strong>{(seasonsR.data ?? []).length}</strong></div>
        <div>managersR.data length: <strong>{(managersR.data ?? []).length}</strong></div>
        <div>msR.data length (all in DB): <strong>{(msR.data ?? []).length}</strong></div>
        <div>repMsFiltered length: <strong>{repMsFiltered.length}</strong></div>
        <div>repMsByManager.size: <strong>{repMsByManager.size}</strong></div>
        <div>Sample mgr (Mason) IS key in repMsByManager: <strong>{String(sampleMgrInRepMap)}</strong></div>
        <div>Sample mgr (Mason) row count in repMsByManager: <strong>{sampleMgrRepCount}</strong></div>
      </div>

      <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.4rem', marginTop: '2.5rem', marginBottom: '.5rem' }}>
        Raw JSON for first manager (full exporter output)
      </h2>
      <pre style={{ padding: '.8rem 1rem', background: 'rgba(255,255,255,.03)', borderRadius: '2px', marginBottom: '1.5rem', overflow: 'auto', maxHeight: '24rem', fontSize: '.7rem' }}>
        {JSON.stringify(managerFiles[0] ?? null, null, 2)}
      </pre>

      <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.4rem', marginTop: '2.5rem', marginBottom: '1rem' }}>
        Exporter output — managers
      </h2>
      <p style={{ opacity: 0.7, marginBottom: '1rem' }}>
        What standings.html and managers.html actually receive. If reg_record looks right but playoff_record is 0-0-0 everywhere, the bug is in the aggregator&apos;s playoff filter.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--ink-line)', textAlign: 'left' }}>
            <th style={{ padding: '.4rem' }}>Name</th>
            <th>reg_record</th>
            <th>playoff_record</th>
            <th>Per-season (year: rank → reg / playoff)</th>
          </tr>
        </thead>
        <tbody>
          {managerFiles.map((m) => (
            <tr key={m.user_id} style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
              <td style={{ padding: '.4rem' }}><strong>{m.name}</strong></td>
              <td>{m.reg_record}</td>
              <td style={{ color: m.playoff_record === '0-0-0' ? 'var(--rust)' : undefined }}>{m.playoff_record}</td>
              <td style={{ fontSize: '.65em' }}>
                {(m.season_ledger ?? [])
                  .map((s) => `${s.year}:${s.final_rank ?? '?'} ${s.reg_record}/${s.playoff_record}`)
                  .join(' · ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
