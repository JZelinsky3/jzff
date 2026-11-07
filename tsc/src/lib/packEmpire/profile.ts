// A Pack Empire profile: the player at a glance. SERVER ONLY.
//
// Nothing here is stored for the profile. The binder already holds the cards,
// the board the runs, Versus and Mega Draft the record, the Daily its own days;
// this reads them and picks out what's worth a look. A friend's profile is the
// same view, loaded off an account id the server worked out from the friendship,
// so no user id ever reaches the browser.

import { createAdminClient } from '@/lib/supabase/admin'
import { isOwned, loadBinder, type BinderOwned } from './binder'
import { peResults, type PeResults } from './results'
import { RARITIES, boardLabel, difficultyForMode, formatForMode, personOf, teamLogo, type Rarity } from './rules'

export type WLT = { w: number; l: number; t: number }

export type ProfileFact = { kick: string; text: string }

export type PeProfile = {
  /** The most valuable card they've kept. */
  best: BinderOwned | null
  /** The man they've kept most often, by his best card. Only once it's more than one. */
  favPlayer: { card: BinderOwned; pulls: number } | null
  favTeam: { team: string; logo: string | null; pulls: number } | null
  /** Best Builder run: on the main board if they have one there, else anywhere. */
  top: { score: number; board: string; href: string } | null
  runs: number
  collected: { owned: number; of: number; packs: number; byRarity: Record<Rarity, { owned: number; of: number }> }
  record: { versus: WLT | null; mega: WLT | null; titles: number }
  daily: { days: number; streak: number } | null
  facts: ProfileFact[]
}

const FACTS = 4

/** "Oct 30": a month spelled short stays bare. */
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })

const cardName = (c: { name: string; year?: number }) => (c.year ? `${c.name} ${c.year}` : c.name)

function tally(rows: { yours: number; theirs: number }[]): WLT | null {
  if (!rows.length) return null
  const out = { w: 0, l: 0, t: 0 }
  for (const r of rows) {
    if (r.yours > r.theirs) out.w++
    else if (r.yours < r.theirs) out.l++
    else out.t++
  }
  return out
}

/** The longest run of days in a row, off 'YYYY-MM-DD' keys. */
function longestStreak(days: string[]): number {
  const sorted = [...new Set(days)].sort()
  let best = 0
  let run = 0
  let prev: number | null = null
  for (const d of sorted) {
    const [y, m, day] = d.split('-').map(Number)
    const t = Date.UTC(y, m - 1, day) / 86_400_000
    run = prev != null && t - prev === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = t
  }
  return best
}

/** Most of something, needing at least two so one card isn't a "favorite". */
function mostOf<T>(items: T[], key: (t: T) => string | null, weight: (t: T) => number) {
  const sums = new Map<string, { n: number; first: T }>()
  for (const it of items) {
    const k = key(it)
    if (!k) continue
    const cur = sums.get(k)
    if (cur) cur.n += weight(it)
    else sums.set(k, { n: weight(it), first: it })
  }
  let top: { key: string; n: number; first: T } | null = null
  for (const [k, v] of sums) if (!top || v.n > top.n) top = { key: k, ...v }
  return top && top.n >= 2 ? top : null
}

/**
 * `sync` files any board runs that never reached the binder (your own profile
 * only). `pre` is the Versus and Mega games, when the page has already loaded
 * them for the friend list.
 */
export async function profileFor(userId: string, { sync = false, pre }: { sync?: boolean; pre?: PeResults } = {}): Promise<PeProfile> {
  const db = createAdminClient()
  const [binder, results, runs, runCount, members, daily] = await Promise.all([
    loadBinder(userId, sync),
    pre ?? peResults(userId),
    db
      .from('game_runs')
      .select('id, score, mode')
      .eq('user_id', userId)
      .eq('game', 'pack-empire')
      .is('week_start', null)
      .order('score', { ascending: false })
      .limit(200),
    db.from('game_runs').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('game', 'pack-empire').is('week_start', null),
    db.from('pe_league_members').select('titles').eq('user_id', userId),
    db.from('pe_daily_runs').select('day').eq('user_id', userId).eq('done', true).limit(1000),
  ])

  // Every card they've kept, vaulted ones too: a vaulted card is still theirs.
  const owned = [...binder.men, ...binder.vaulted].flatMap((m) => m.cards.filter(isOwned))
  const best = owned.reduce<BinderOwned | null>((a, b) => (!a || b.score > a.score ? b : a), null)

  const fp = mostOf(owned, (c) => personOf(c), (c) => c.pulls)
  const favPlayer = fp
    ? { card: owned.filter((c) => personOf(c) === fp.key).reduce((a, b) => (b.score > a.score ? b : a)), pulls: fp.n }
    : null
  const ft = mostOf(owned, (c) => c.team || null, (c) => c.pulls)
  const favTeam = ft ? { team: ft.key, logo: teamLogo({ team: ft.key }), pulls: ft.n } : null

  const runRows = (runs.data ?? []) as { id: string; score: number; mode: string | null }[]
  const topRun = runRows.find((r) => r.mode === 'offense') ?? runRows[0] ?? null
  const top = topRun
    ? {
        score: Number(topRun.score),
        board: boardLabel(difficultyForMode(topRun.mode) ?? 'open', formatForMode(topRun.mode)),
        href: `/games/pack-empire/run/${topRun.id}/`,
      }
    : null

  const { vs, mega } = results
  const titles = ((members.data ?? []) as { titles: number | null }[]).reduce((n, m) => n + (m.titles ?? 0), 0)
  const days = ((daily.data ?? []) as { day: string }[]).map((d) => d.day)

  const t = binder.totals
  return {
    best,
    favPlayer,
    favTeam,
    top,
    runs: runCount.count ?? runRows.length,
    collected: { owned: t.owned, of: t.cards, packs: t.pulls, byRarity: t.byRarity },
    record: { versus: tally(vs), mega: tally(mega), titles },
    daily: days.length ? { days: new Set(days).size, streak: longestStreak(days) } : null,
    facts: factsFor(owned, vs),
  }
}

/** The few things about a player worth a line, best first, only the ones they have. */
function factsFor(owned: BinderOwned[], vs: PeResults['vs']): ProfileFact[] {
  const out: ProfileFact[] = []

  // A Canton's number is theirs for good: the lowest one they hold.
  const canton = owned.filter((c) => c.serial).sort((a, b) => a.serial![0] - b.serial![0])[0]
  if (canton?.serial) out.push({ kick: 'Canton', text: `No. ${canton.serial[0]} of ${canton.serial[1]}: ${cardName(canton)}` })

  // The scarcest card they hold, by how often anyone has kept it. Not the Canton
  // just named: one card twice in four lines reads as a short list.
  const rarest = owned
    .filter((c) => c.site.pulls > 0 && c.id !== canton?.id)
    .sort((a, b) => a.site.pulls - b.site.pulls || b.score - a.score)[0]
  if (rarest && rarest.site.pulls <= 5 && RARITIES.indexOf(rarest.rarity) >= RARITIES.indexOf('dynasty')) {
    out.push({
      kick: 'Rarest Pull',
      text:
        rarest.site.pulls <= rarest.pulls
          ? `Nobody else has kept ${cardName(rarest)}`
          : `${cardName(rarest)}, kept ${rarest.site.pulls} times on the whole site`,
    })
  }

  const firstBig = owned.filter((c) => c.rarity === 'immortal' || c.rarity === 'canton').sort((a, b) => a.firstAt.localeCompare(b.firstAt))[0]
  if (firstBig) out.push({ kick: 'First Immortal', text: `${cardName(firstBig)}, ${shortDate(firstBig.firstAt)}` })

  const won = vs.filter((r) => r.yours > r.theirs).sort((a, b) => b.yours - b.theirs - (a.yours - a.theirs))[0]
  if (won) out.push({ kick: 'Biggest Win', text: `By ${(won.yours - won.theirs).toLocaleString()}${won.opponent ? ` over ${won.opponent}` : ''}` })

  const often = mostOf(vs, (r) => r.opponentId, () => 1)
  if (often) {
    const h = tally(vs.filter((r) => r.opponentId === often.key))!
    out.push({ kick: 'Most Played', text: `${often.first.opponent ?? 'One rival'}, ${h.t ? `${h.w}-${h.l}-${h.t}` : `${h.w}-${h.l}`} in ${often.n}` })
  }

  return out.slice(0, FACTS)
}
