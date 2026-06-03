// NFL Fantasy (fantasy.nfl.com) platform adapter.
//
// NFL Fantasy doesn't expose a public JSON API for league data, but every
// page we need is server-rendered HTML and viewable without authentication
// for public leagues. This module fetches and parses those pages.
//
// Pages used per season:
//   /league/<id>/history/<year>/owners            — team list + owner names
//   /league/<id>/history/<year>/standings         — champion / runner-up / 3rd
//   /league/<id>/history/<year>/schedule?...      — per-week matchups + scores
//   /league/<id>/history/<year>/draftresults      — draft picks

import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'

const BASE = 'https://fantasy.nfl.com'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export type NflOwner = {
  team_id: number       // numeric, scoped to (league, season)
  team_name: string
  team_image_url: string | null
  owner_name: string    // display name shown on the site
  user_id: string       // NFL.com user id (stable across seasons)
  is_league_owner: boolean
}

export type NflMatchup = {
  week: number
  a_team_id: number
  a_score: number | null   // null = game not yet played (future/unplayed week)
  a_record: string         // e.g. "1-0-0"
  b_team_id: number
  b_score: number | null
  b_record: string
}

export type NflStandingsRow = {
  final_rank: number
  team_id: number
  team_name: string
  // Top-3 also have records + PF visible; the rest only show team name on standings.
  owner_name: string | null
  record: string | null   // "8-6-0"
  points_for: number | null
}

export type NflDraftPick = {
  overall_pick: number
  round: number
  round_pick: number
  team_id: number
  player_name: string
  player_position: string | null
  player_nfl_team: string | null
}

// ─── HTTP ─────────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
    // Each league/season is essentially static once the season ends; let
    // upstream caches deduplicate fetches but don't hold stale data forever.
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`NFL ${url} → HTTP ${res.status}`)
  return res.text()
}

// ─── Public probe: confirm league exists + grab basic metadata ─────────────

export type NflLeagueProbe = {
  ok: true
  name: string
  // NFL pages always say "{leagueName} – League Home | NFL Fantasy" or similar.
  // We don't get founded year cheaply; the user supplies the season range.
} | { ok: false; error: string }

export async function probeLeague(leagueId: string, season: number): Promise<NflLeagueProbe> {
  try {
    const html = await fetchHtml(`${BASE}/league/${leagueId}/history/${season}/owners`)
    const $ = cheerio.load(html)
    const title = $('title').text() || ''
    // "League Manager - Managers | NFL Fantasy" — not useful for the actual
    // league name. Grab the breadcrumb or page heading instead.
    const heading = $('.leagueNav .first a, h1, .leagueName').first().text().trim()
    const name = heading || title.split(' | ')[0] || `NFL League ${leagueId}`
    return { ok: true, name }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Probe failed' }
  }
}

// ─── Owners page → roster of (team_id, owner) for a season ────────────────

export async function fetchOwners(leagueId: string, season: number): Promise<NflOwner[]> {
  const html = await fetchHtml(`${BASE}/league/${leagueId}/history/${season}/owners`)
  const $ = cheerio.load(html)
  const out: NflOwner[] = []

  // Each team is a <tr class="team-N ..."> in the managers table.
  $('table.tableType-team tbody tr').each((_, tr) => {
    const row = $(tr)
    // teamImg has class "teamId-<n>" — extract that.
    const teamLink = row.find('a.teamImg').first()
    const cls = teamLink.attr('class') || ''
    const idMatch = cls.match(/teamId-(\d+)/)
    if (!idMatch) return
    const team_id = Number(idMatch[1])

    const team_name = row.find('a.teamName').first().text().trim()
    const team_image_url = teamLink.find('img').attr('src') || null

    // Owner cell: <span class="userName userId-<id>">DisplayName</span>
    const ownerSpan = row.find('td.teamOwnerName .userName').first()
    const ownerCls = ownerSpan.attr('class') || ''
    const userMatch = ownerCls.match(/userId-(\d+)/)
    const user_id = userMatch ? userMatch[1] : ''
    const owner_name = ownerSpan.text().trim() || ''

    // League owner (commissioner) badge is on the <li> wrapper.
    const is_league_owner = row.find('td.teamOwnerName li.leagueOwner').length > 0

    if (team_id && user_id) {
      out.push({ team_id, team_name, team_image_url, owner_name, user_id, is_league_owner })
    }
  })

  return out
}

// ─── Schedule page → matchups for a single week ───────────────────────────

export async function fetchWeekSchedule(
  leagueId: string,
  season: number,
  week: number
): Promise<NflMatchup[]> {
  const url = `${BASE}/league/${leagueId}/history/${season}/schedule?gameSeason=${season}&leagueId=${leagueId}&scheduleDetail=${week}&scheduleType=week&standingsTab=schedule`
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)
  const out: NflMatchup[] = []

  // Each <li class="matchup ..."> contains two <div class="teamWrap teamWrap-N">.
  $('ul.scheduleContent li.matchups li.matchup').each((_, li) => {
    const wrappers = $(li).find('div.teamWrap')
    if (wrappers.length !== 2) return
    const parsed = wrappers.toArray().map((w) => parseTeamWrap($, $(w)))
    if (parsed[0] && parsed[1]) {
      out.push({
        week,
        a_team_id: parsed[0].team_id, a_score: parsed[0].score, a_record: parsed[0].record,
        b_team_id: parsed[1].team_id, b_score: parsed[1].score, b_record: parsed[1].record,
      })
    }
  })

  return out
}

function parseTeamWrap($: cheerio.CheerioAPI, wrap: cheerio.Cheerio<AnyNode>): { team_id: number; score: number | null; record: string } | null {
  const teamName = wrap.find('a.teamName').first()
  const cls = teamName.attr('class') || ''
  const idMatch = cls.match(/teamId-(\d+)/)
  if (!idMatch) return null
  const team_id = Number(idMatch[1])

  // An unplayed/future game has a blank .teamTotal. Keep the matchup with a
  // null score rather than dropping it — pick'ems needs upcoming weeks.
  const totalText = wrap.find('.teamTotal').first().text().trim()
  const parsed = parseFloat(totalText.replace(/,/g, ''))
  const score = Number.isFinite(parsed) ? parsed : null

  const record = wrap.find('.teamRecord').first().text().trim() || '0-0-0'
  return { team_id, score, record }
}

// ─── Standings page → champion / runner-up / third place ─────────────────

export async function fetchStandings(leagueId: string, season: number): Promise<NflStandingsRow[]> {
  const html = await fetchHtml(`${BASE}/league/${leagueId}/history/${season}/standings`)
  const $ = cheerio.load(html)
  const out: NflStandingsRow[] = []

  // NFL Fantasy renders the final standings as a podium ("place-1" / "place-2"
  // / "place-3" elements with bigger styling) plus a remaining list. The exact
  // wrapper varies by year/template. We scan all elements whose class names
  // contain "place-N", looking for a teamName link inside.
  $('[class*="place-"]').each((_, el) => {
    const item = $(el)
    const placeCls = (item.attr('class') || '').match(/(?:^|\s)place-(\d+)(?:\s|$)/)
    if (!placeCls) return
    const final_rank = Number(placeCls[1])
    const teamLink = item.find('a.teamName, a[class*="teamId-"]').first()
    const cls = teamLink.attr('class') || ''
    const idMatch = cls.match(/teamId-(\d+)/)
    if (!idMatch) return
    const team_id = Number(idMatch[1])
    const team_name = teamLink.text().trim()

    // Owner + record + PF are inside <em> tags on the top-3 podium slots.
    let owner_name: string | null = null
    let record: string | null = null
    let points_for: number | null = null
    const ems = item.find('em')
    if (ems.length >= 1) owner_name = ems.eq(0).text().trim() || null
    if (ems.length >= 2) {
      const detail = ems.eq(1).text().trim()
      const m = detail.match(/Reg\.\s*Season:\s*(\d+-\d+-\d+),\s*([\d,.]+)\s*Points/i)
      if (m) {
        record = m[1]!
        points_for = parseFloat(m[2]!.replace(/,/g, ''))
      }
    }
    // De-dupe in case the team appears in multiple matched containers.
    if (out.find((r) => r.final_rank === final_rank && r.team_id === team_id)) return
    out.push({ final_rank, team_id, team_name, owner_name, record, points_for })
  })

  // Fallback: some seasons render the rest of the field as a flat ranked list
  // outside any place-N container. If we have fewer than 4 rows, scan any
  // <ol>/<ul> with team links and infer rank from list order.
  if (out.length < 4) {
    $('ol li a.teamName, ul.standings li a.teamName, table.tableType-standings tbody tr').each((idx, el) => {
      const item = $(el)
      const teamLink = item.is('a') ? item : item.find('a.teamName').first()
      const cls = teamLink.attr('class') || ''
      const idMatch = cls.match(/teamId-(\d+)/)
      if (!idMatch) return
      const team_id = Number(idMatch[1])
      if (out.find((r) => r.team_id === team_id)) return
      out.push({
        final_rank: out.length + 1, // fall back to order encountered
        team_id,
        team_name: teamLink.text().trim(),
        owner_name: null,
        record: null,
        points_for: null,
      })
      void idx
    })
  }

  return out
}

// ─── Per-week per-team roster snapshot ────────────────────────────────────
//
// NFL.com's gamecenter page renders each team's roster with the slot it
// filled, the player's name/position/team, and the fantasy points it earned.
// HTML structure has shifted between seasons — we tolerate the variants we
// know of and return [] for anything we can't parse so the caller can
// degrade gracefully. Best-effort by design.

export type NflRosterPlayer = {
  player_external_id: string  // NFL.com playerId (stable across seasons)
  full_name: string
  position: string | null     // primary position (QB/RB/...)
  nfl_team: string | null
  slot: string                // the slot the player filled (QB/RB/BN/IR/...)
  points: number | null
}

export function nflIsStarterSlot(slot: string): boolean {
  const s = slot.toUpperCase()
  return s !== 'BN' && s !== 'IR' && s !== 'BENCH' && s !== 'RES'
}

export async function fetchTeamWeekRoster(
  leagueId: string,
  season: number,
  teamId: number,
  week: number
): Promise<NflRosterPlayer[]> {
  // Two URL shapes — modern season uses the live gamecenter route, older
  // archived seasons live under /history. Try the historical path first when
  // we have a season; it's the format that survives once a season is archived.
  const urls = [
    `${BASE}/league/${leagueId}/history/${season}/teamgamecenter?teamId=${teamId}&trackType=fbs&statCategory=stats&statSeason=${season}&statType=weekStats&statWeek=${week}`,
    `${BASE}/league/${leagueId}/team/${teamId}/gamecenter?gameCenterTab=track&trackType=fbs&statCategory=stats&statSeason=${season}&statType=weekStats&statWeek=${week}`,
  ]

  let html: string | null = null
  for (const url of urls) {
    try {
      html = await fetchHtml(url)
      if (html) break
    } catch {
      // fall through to next variant
    }
  }
  if (!html) return []

  const $ = cheerio.load(html)
  const out: NflRosterPlayer[] = []

  // The roster table is usually <table class="tableType-team"> with rows of
  // class "player". Each row exposes:
  //   td.teamPosition       → slot (e.g. "QB", "WR", "BN")
  //   a.playerName          → player display name; class includes playerNameId-N
  //   em                    → "<POS> - <NFL_TEAM>" meta line
  //   span.statTotal / td.statTotal → fantasy points (blank for unplayed)
  $('table.tableType-team tr.player, table tr.player').each((_, tr) => {
    const row = $(tr)
    const slotRaw = row.find('td.teamPosition, .teamPosition').first().text().trim()
    if (!slotRaw) return
    const slot = slotRaw.toUpperCase()

    const playerLink = row.find('a.playerName').first()
    const full_name = playerLink.text().trim()
    if (!full_name) {
      // Empty slot ("--" row). Skip — no player to record.
      return
    }
    const cls = playerLink.attr('class') || ''
    const idMatch = cls.match(/playerNameId-(\d+)/)
    const player_external_id = idMatch ? idMatch[1]! : full_name // fallback so the unique key still works

    let position: string | null = null
    let nfl_team: string | null = null
    const meta = row.find('em').first().text().trim()
    const metaMatch = meta.match(/([A-Z]{1,4})\s*[-–]\s*([A-Z]{2,4})/)
    if (metaMatch) { position = metaMatch[1]!; nfl_team = metaMatch[2]! }
    else if (/^(DEF|DST|D\/ST)$/i.test(meta)) { position = 'DEF' }

    const totalText = row.find('.statTotal, td.statTotal').first().text().trim()
    const parsed = parseFloat(totalText.replace(/,/g, ''))
    const points = Number.isFinite(parsed) ? parsed : null

    out.push({ player_external_id, full_name, position, nfl_team, slot, points })
  })

  return out
}

// ─── Draft results page → ordered list of picks ───────────────────────────

export async function fetchDraft(leagueId: string, season: number): Promise<NflDraftPick[]> {
  // The default /draftresults page only shows one round at a time. Append
  // ?draftResultsDetail=0 to get every round inline.
  const url = `${BASE}/league/${leagueId}/history/${season}/draftresults?draftResultsDetail=0&draftResultsTab=round&draftResultsType=results`
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)
  const out: NflDraftPick[] = []

  // Markup: <h4>Round N</h4><ul><li><span class="count">P.</span> ... </li>...</ul>
  // Picks don't carry a round attribute themselves — track it via the most
  // recent <h4> heading we walked past in document order.
  let currentRound: number | null = null
  $('h4, li').each((_, el) => {
    const node = $(el)
    if ((el as { tagName?: string }).tagName === 'h4') {
      const m = node.text().trim().match(/^Round\s+(\d+)/i)
      if (m) currentRound = Number(m[1])
      return
    }
    // <li> — must contain a .count and a player link to be a pick row.
    const countEl = node.find('> .count').first()
    if (countEl.length === 0) return
    const countText = countEl.text().trim().replace(/\.$/, '')
    const round_pick = parseInt(countText, 10)
    if (!Number.isFinite(round_pick) || currentRound == null) return

    // Team id from <a class="teamId-N">.
    const teamLink = node.find('a[class*="teamId-"]').first()
    const teamCls = teamLink.attr('class') || ''
    const teamMatch = teamCls.match(/teamId-(\d+)/)
    if (!teamMatch) return
    const team_id = Number(teamMatch[1])

    // Player name from <a class="playerName"> (skip the headshot image link).
    const playerLink = node.find('a.playerName').first()
    const player_name = playerLink.text().trim()
    if (!player_name) return

    // Position + NFL team from the trailing <em>.
    let player_position: string | null = null
    let player_nfl_team: string | null = null
    const meta = node.find('em').first().text().trim()
    // Examples: "RB - SF", "WR - DET", "QB - BUF", "K - BAL"
    const metaMatch = meta.match(/([A-Z]{1,4})\s*[-–]\s*([A-Z]{2,4})/)
    if (metaMatch) {
      player_position = metaMatch[1]!
      player_nfl_team = metaMatch[2]!
    } else if (/^(DEF|DST|D\/ST)$/i.test(meta)) {
      // Defenses are rendered as just <em>DEF</em> with no team (the team is the player).
      player_position = 'DEF'
      player_nfl_team = null
    }

    out.push({
      overall_pick: 0, // filled below
      round: currentRound,
      round_pick,
      team_id,
      player_name,
      player_position,
      player_nfl_team,
    })
  })

  // Sort by round then round_pick. The page already lists picks in draft
  // order accounting for snake direction, so overall = index + 1.
  out.sort((a, b) => a.round - b.round || a.round_pick - b.round_pick)
  out.forEach((p, i) => { p.overall_pick = i + 1 })
  return out
}

// ─── Transactions page → completed trades ────────────────────────────────
//
// NFL.com renders the transaction history at:
//   /league/<id>/history/<year>/transactions?transactionType=trade
// Each trade is a row that names the two teams and lists the players that
// went each direction. The HTML has shifted across seasons — we tolerate
// the two most common shapes:
//
//   modern: <li class="transaction"><span class="date">…</span>…
//             <a class="teamId-N">…</a> traded <a class="playerId-M">…</a> …
//
//   legacy: a flat <ul.transactionList> with <li> rows of the same anchors
//
// We don't get a stable transaction id in the HTML, so we synthesize one
// from (date, team-pair, sorted player ids) — stable enough to dedupe on
// re-sync as long as the trade text hasn't been edited by NFL.com.
//
// Defensive by design: if no trade rows parse, we return [] and let the
// caller emit a warning instead of failing the sync.

export type NflTradePlayer = {
  player_external_id: string  // NFL.com playerId
  full_name: string
  position: string | null
  nfl_team: string | null
  to_team_id: number          // receiver
  from_team_id: number        // sender (the team trading the player away)
}

export type NflTrade = {
  trade_id: string            // NFL.com trade id (stable per league across re-syncs)
  executed_at: string         // ISO timestamp (NFL.com omits the year — we append the season)
  week: number | null         // league week from the row's transactionWeek cell
  team_ids: number[]          // every team appearing in the trade (usually 2)
  players: NflTradePlayer[]
}

export async function fetchTrades(leagueId: string, season: number): Promise<NflTrade[]> {
  // NFL.com's transactions page is a <table class="tableType-transaction">
  // where each trade SIDE is a <tr class="transaction-trade-{tradeId}-{n}">.
  // A standard 2-team trade has rows -1 and -2; auto-drops triggered by the
  // trade get a -3/-4 row with type="Drop" which we skip.
  // Columns we read per row:
  //   .transactionDate  → "Nov 10, 5:08am" (no year)
  //   .transactionWeek  → "10"
  //   .transactionType  → "Trade" | "Drop"
  //   .playerNameAndInfo → <ul><li><a class="playerName playerNameId-N">Name</a> <em>POS - TEAM</em></li>...</ul>
  //   .transactionFrom  → <a class="teamName teamId-N">Team A</a>
  //   .transactionTo    → <a class="teamName teamId-N">Team B</a>
  const url = `${BASE}/league/${leagueId}/history/${season}/transactions?transactionType=trade`
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)

  type SideRow = {
    side: number
    type: string
    dateText: string
    week: number | null
    from_team_id: number | null
    to_team_id: number | null
    players: Array<{ player_external_id: string; full_name: string; position: string | null; nfl_team: string | null }>
  }
  const byTradeId = new Map<string, SideRow[]>()

  $('tr[class*="transaction-trade-"]').each((_, el) => {
    const row = $(el)
    const cls = row.attr('class') || ''
    const idMatch = cls.match(/transaction-trade-(\d+)-(\d+)/)
    if (!idMatch) return
    const tradeId = idMatch[1]!
    const side = Number(idMatch[2])

    const type = row.find('td.transactionType').first().text().trim()
    const dateText = row.find('td.transactionDate').first().text().trim()
    const weekText = row.find('td.transactionWeek').first().text().trim()
    const week = /^\d+$/.test(weekText) ? Number(weekText) : null

    const fromAnchor = row.find('td.transactionFrom a[class*="teamId-"]').first()
    const toAnchor = row.find('td.transactionTo a[class*="teamId-"]').first()
    const fromMatch = (fromAnchor.attr('class') || '').match(/teamId-(\d+)/)
    const toMatch = (toAnchor.attr('class') || '').match(/teamId-(\d+)/)
    const from_team_id = fromMatch ? Number(fromMatch[1]) : null
    const to_team_id = toMatch ? Number(toMatch[1]) : null

    const players: SideRow['players'] = []
    row.find('td.playerNameAndInfo li').each((_, li) => {
      const item = $(li)
      const playerLink = item.find('a[class*="playerNameId-"]').first()
      const pCls = playerLink.attr('class') || ''
      const pMatch = pCls.match(/playerNameId-(\d+)/)
      if (!pMatch) return
      const player_external_id = pMatch[1]!
      const full_name = playerLink.text().trim()
      const meta = item.find('em').first().text().trim()
      let position: string | null = null
      let nfl_team: string | null = null
      const metaMatch = meta.match(/([A-Z]{1,4})\s*[-–]\s*([A-Z]{2,4})/)
      if (metaMatch) { position = metaMatch[1]!; nfl_team = metaMatch[2]! }
      else if (/^(DEF|DST|D\/ST)/i.test(meta)) { position = 'DEF' }
      players.push({ player_external_id, full_name, position, nfl_team })
    })

    const list = byTradeId.get(tradeId) ?? []
    list.push({ side, type, dateText, week, from_team_id, to_team_id, players })
    byTradeId.set(tradeId, list)
  })

  const out: NflTrade[] = []
  for (const [tradeId, sides] of byTradeId) {
    // Only "Trade" rows are part of the asset ledger. Auto-drop ("Drop")
    // rows share a trade id but represent roster cuts triggered to clear
    // space for incoming players — they aren't part of the deal itself.
    const tradeSides = sides.filter((s) => s.type.toLowerCase() === 'trade')
    if (tradeSides.length === 0) continue
    tradeSides.sort((a, b) => a.side - b.side)

    // NFL.com renders dates without the year. Append the season for parse.
    const dateText = tradeSides[0].dateText
    const parsed = Date.parse(`${dateText} ${season}`)
    const executed_at = Number.isFinite(parsed)
      ? new Date(parsed).toISOString()
      : new Date(`${season}-12-31T00:00:00Z`).toISOString()
    const week = tradeSides[0].week

    const teamIds = new Set<number>()
    const players: NflTradePlayer[] = []
    for (const s of tradeSides) {
      if (s.from_team_id != null) teamIds.add(s.from_team_id)
      if (s.to_team_id != null) teamIds.add(s.to_team_id)
      if (s.from_team_id == null || s.to_team_id == null) continue
      for (const p of s.players) {
        players.push({
          ...p,
          from_team_id: s.from_team_id,
          to_team_id: s.to_team_id,
        })
      }
    }
    if (teamIds.size < 2 || players.length === 0) continue

    out.push({
      trade_id: tradeId,
      executed_at,
      week,
      team_ids: [...teamIds],
      players,
    })
  }

  // Newest first — mirrors how the page displays them.
  out.sort((a, b) => b.executed_at.localeCompare(a.executed_at))
  return out
}

// ─── Concurrency helper (mirrors sleeper.ts parallelLimit) ───────────────

export async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let i = 0
  async function run() {
    while (i < items.length) {
      const idx = i++
      results[idx] = await worker(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}
