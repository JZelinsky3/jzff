// Player Desk aggregator — Phase 2, Slice 1.
//
// Builds a cross-league snapshot of every player currently rostered by the
// chronicle owner across their linked leagues, plus an injury wire pulled
// from Sleeper's player dictionary. Read-only: hits live APIs each render,
// memoized via unstable_cache with a short TTL so a refresh of the page
// doesn't re-fetch the 5MB player dictionary every time.
//
// Multi-platform: Sleeper is supported now. ESPN / Yahoo / NFL.com career
// links are surfaced as "pending" rows in the desk's unsupported list so
// the UI can prompt the user that those platforms aren't wired up yet.

import { unstable_cache } from 'next/cache'
import { sleeper, type SleeperPlayer, type SleeperRoster, type SleeperUser } from '@/lib/platforms/sleeper'
import { createClient } from '@/lib/supabase/server'

export type DeskPlayer = {
  playerId: string
  name: string
  position: string
  team: string | null
  injuryStatus: string | null
  injuryBodyPart: string | null
  injuryNotes: string | null
  newsUpdated: number | null
  age: number | null
  yearsExp: number | null
  // Per-league context: which of the user's rosters this player sits on.
  slots: Array<{
    leagueName: string
    leagueSlug: string
    teamName: string | null
    slot: 'starter' | 'bench' | 'ir' | 'taxi'
  }>
}

export type DeskLeagueRoster = {
  leagueName: string
  leagueSlug: string
  platform: string
  teamName: string | null
  starters: DeskPlayer[]
  bench: DeskPlayer[]
  ir: DeskPlayer[]
  taxi: DeskPlayer[]
}

export type DeskUnsupported = {
  leagueName: string
  leagueSlug: string
  platform: string
  reason: string
}

export type PlayerDesk = {
  chronicle: { id: string; slug: string; displayName: string }
  refreshedAt: string
  totalPlayers: number
  injuries: DeskPlayer[]
  byPosition: Record<'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF' | 'OTHER', DeskPlayer[]>
  rosters: DeskLeagueRoster[]
  unsupported: DeskUnsupported[]
  errors: string[]
}

// Severity ranking — drives the injury wire's sort order. Higher = worse.
const INJURY_SEVERITY: Record<string, number> = {
  IR: 6,
  Suspended: 5,
  PUP: 4,
  Out: 3,
  Doubtful: 2,
  Questionable: 1,
}
function isInjuredStatus(s: string | null | undefined): boolean {
  if (!s) return false
  return INJURY_SEVERITY[s] != null
}

// Cache the full Sleeper /players/nfl dictionary for 6h. It's ~5MB and Sleeper
// recommends polling at most once per day; 6h is the operational sweet spot
// for injury freshness without hammering the endpoint.
async function loadSleeperPlayers(): Promise<Record<string, SleeperPlayer>> {
  const cached = unstable_cache(
    async () => {
      const players = await sleeper.playersNfl()
      return players ?? {}
    },
    ['sleeper-players-nfl', 'v1'],
    { revalidate: 6 * 60 * 60 },
  )
  return cached()
}

function playerName(p: SleeperPlayer | undefined, fallbackId: string): string {
  if (!p) return `Player ${fallbackId}`
  if (p.full_name) return p.full_name
  const fn = (p.first_name ?? '').trim()
  const ln = (p.last_name ?? '').trim()
  const combined = `${fn} ${ln}`.trim()
  return combined || `Player ${fallbackId}`
}

function positionBucket(pos: string | undefined | null): keyof PlayerDesk['byPosition'] {
  if (!pos) return 'OTHER'
  if (pos === 'QB' || pos === 'RB' || pos === 'WR' || pos === 'TE' || pos === 'K') return pos
  if (pos === 'DEF' || pos === 'DST' || pos === 'D/ST') return 'DEF'
  return 'OTHER'
}

type LinkRow = {
  league_id: string
  manager_external_id: string
  league: { id: string; name: string; slug: string; platform: string }
}

type ChronicleRow = { id: string; slug: string; display_name: string }

export async function loadPlayerDesk(slug: string, ownerId: string): Promise<PlayerDesk | null> {
  const supabase = await createClient()

  const { data: chronicle } = await supabase
    .from('career_chronicles')
    .select('id, slug, display_name')
    .eq('slug', slug)
    .eq('owner_id', ownerId)
    .maybeSingle<ChronicleRow>()
  if (!chronicle) return null

  const { data: links } = await supabase
    .from('career_links')
    .select('league_id, manager_external_id, league:leagues!inner(id, name, slug, platform)')
    .eq('chronicle_id', chronicle.id)
  const linkRows = (links ?? []) as unknown as LinkRow[]

  const sleeperLinks = linkRows.filter((l) => l.league.platform === 'sleeper')
  const otherLinks = linkRows.filter((l) => l.league.platform !== 'sleeper')

  // Resolve each Sleeper link's current Sleeper league_id from the most
  // recent season row. The chain walked during ingest stores per-season
  // external_id; the latest year's external_id is the live league_id.
  const leagueIdByArchive = new Map<string, string>()
  if (sleeperLinks.length > 0) {
    const archiveIds = sleeperLinks.map((l) => l.league_id)
    const { data: seasonRows } = await supabase
      .from('seasons')
      .select('league_id, year, external_id')
      .in('league_id', archiveIds)
      .order('year', { ascending: false })
    for (const row of seasonRows ?? []) {
      const archiveId = row.league_id as string
      if (!leagueIdByArchive.has(archiveId) && row.external_id) {
        leagueIdByArchive.set(archiveId, row.external_id as string)
      }
    }
  }

  const players = sleeperLinks.length > 0 ? await loadSleeperPlayers() : {}
  const errors: string[] = []
  const rosters: DeskLeagueRoster[] = []
  // Aggregate the same playerId across leagues into one DeskPlayer.
  const byId = new Map<string, DeskPlayer>()

  await Promise.all(
    sleeperLinks.map(async (link) => {
      const liveLeagueId = leagueIdByArchive.get(link.league_id)
      if (!liveLeagueId) {
        errors.push(`${link.league.name}: no current Sleeper league id on file (re-sync may be needed)`)
        return
      }
      let users: SleeperUser[] | null = null
      let rosterRows: SleeperRoster[] | null = null
      try {
        users = await sleeper.users(liveLeagueId)
        rosterRows = await sleeper.rosters(liveLeagueId)
      } catch (e) {
        errors.push(`${link.league.name}: ${e instanceof Error ? e.message : String(e)}`)
        return
      }
      if (!users || !rosterRows) {
        errors.push(`${link.league.name}: Sleeper returned no users / rosters`)
        return
      }
      const me = rosterRows.find((r) => r.owner_id === link.manager_external_id)
      if (!me) {
        errors.push(`${link.league.name}: couldn't find your roster (owner_id ${link.manager_external_id})`)
        return
      }
      const myUser = users.find((u) => u.user_id === link.manager_external_id)
      const teamName = myUser?.metadata?.team_name?.trim() || myUser?.display_name || null

      const starters = new Set((me.starters ?? []).filter(Boolean) as string[])
      const reserve = new Set((me.reserve ?? []).filter(Boolean) as string[])
      const taxi = new Set((me.taxi ?? []).filter(Boolean) as string[])
      const allIds = new Set<string>((me.players ?? []).filter(Boolean) as string[])
      for (const id of starters) allIds.add(id)
      for (const id of reserve) allIds.add(id)
      for (const id of taxi) allIds.add(id)

      const leagueRoster: DeskLeagueRoster = {
        leagueName: link.league.name,
        leagueSlug: link.league.slug,
        platform: 'sleeper',
        teamName,
        starters: [],
        bench: [],
        ir: [],
        taxi: [],
      }

      for (const pid of allIds) {
        const p = players[pid]
        const slot: DeskPlayer['slots'][number]['slot'] =
          taxi.has(pid) ? 'taxi' :
          reserve.has(pid) ? 'ir' :
          starters.has(pid) ? 'starter' : 'bench'

        let entry = byId.get(pid)
        if (!entry) {
          entry = {
            playerId: pid,
            name: playerName(p, pid),
            position: p?.position ?? '—',
            team: p?.team ?? null,
            injuryStatus: p?.injury_status ?? null,
            injuryBodyPart: p?.injury_body_part ?? null,
            injuryNotes: p?.injury_notes ?? null,
            newsUpdated: p?.news_updated ?? null,
            age: p?.age ?? null,
            yearsExp: p?.years_exp ?? null,
            slots: [],
          }
          byId.set(pid, entry)
        }
        entry.slots.push({
          leagueName: link.league.name,
          leagueSlug: link.league.slug,
          teamName,
          slot,
        })

        if (slot === 'starter') leagueRoster.starters.push(entry)
        else if (slot === 'ir') leagueRoster.ir.push(entry)
        else if (slot === 'taxi') leagueRoster.taxi.push(entry)
        else leagueRoster.bench.push(entry)
      }

      const posOrder = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'OTHER']
      const sortByPosThenName = (a: DeskPlayer, b: DeskPlayer) => {
        const da = posOrder.indexOf(positionBucket(a.position))
        const db = posOrder.indexOf(positionBucket(b.position))
        return da - db || a.name.localeCompare(b.name)
      }
      leagueRoster.starters.sort(sortByPosThenName)
      leagueRoster.bench.sort(sortByPosThenName)
      leagueRoster.ir.sort(sortByPosThenName)
      leagueRoster.taxi.sort(sortByPosThenName)
      rosters.push(leagueRoster)
    }),
  )

  const unsupported: DeskUnsupported[] = otherLinks.map((l) => ({
    leagueName: l.league.name,
    leagueSlug: l.league.slug,
    platform: l.league.platform,
    reason: 'Live roster sync coming — Sleeper only for now.',
  }))

  // Build position buckets across all leagues, deduped.
  const byPosition: PlayerDesk['byPosition'] = { QB: [], RB: [], WR: [], TE: [], K: [], DEF: [], OTHER: [] }
  for (const p of byId.values()) {
    byPosition[positionBucket(p.position)].push(p)
  }
  for (const key of Object.keys(byPosition) as (keyof PlayerDesk['byPosition'])[]) {
    byPosition[key].sort((a, b) => {
      // Injured first, then alphabetical.
      const ia = isInjuredStatus(a.injuryStatus) ? 0 : 1
      const ib = isInjuredStatus(b.injuryStatus) ? 0 : 1
      return ia - ib || a.name.localeCompare(b.name)
    })
  }

  const injuries = [...byId.values()]
    .filter((p) => isInjuredStatus(p.injuryStatus))
    .sort((a, b) => {
      const sa = INJURY_SEVERITY[a.injuryStatus!] ?? 0
      const sb = INJURY_SEVERITY[b.injuryStatus!] ?? 0
      if (sa !== sb) return sb - sa
      return a.name.localeCompare(b.name)
    })

  rosters.sort((a, b) => a.leagueName.localeCompare(b.leagueName))

  return {
    chronicle: { id: chronicle.id, slug: chronicle.slug, displayName: chronicle.display_name },
    refreshedAt: new Date().toISOString(),
    totalPlayers: byId.size,
    injuries,
    byPosition,
    rosters,
    unsupported,
    errors,
  }
}
