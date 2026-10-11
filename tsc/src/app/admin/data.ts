// Everything /admin shows, read once and handed to whichever tree renders it
// (desktop or phone). Counts leave out Joey's own accounts (lib/ownAccounts):
// him checking the page is not a visitor, a signup or a member.

import { createAdminClient } from '@/lib/supabase/admin'
import { REFERRAL_LABELS } from '@/lib/referralChannels'
import { compIsActive } from '@/lib/siteAdmin'
import { isLifetimeUser, TIER_LABELS, TIER_PRICES, trialSlotActive, type Tier, type BillingPeriod } from '@/lib/stripe'
import { ownAccountIds } from '@/lib/ownAccounts'
import { socialLive } from '@/lib/social/config'
import { KIND_LABELS, type Kind } from '@/lib/social/content'
import { SHARE_PAGES } from '@/lib/sharePages'
import { ADMIN_TZ, PLATFORM_LABEL, fmtDay } from './format'

type Db = ReturnType<typeof createAdminClient>

const DAY_MS = 86_400_000
const STRIP_DAYS = 14

export type Plan =
  | { kind: 'paying'; label: string; renews: string | null; ending: boolean }
  | { kind: 'trial'; label: string; ends: string | null; cancels: boolean }
  | { kind: 'canceled'; label: string; since: string | null }
  | { kind: 'pastdue'; label: string; status: string }
  | { kind: 'comp'; until: string | null; env: boolean; note: string | null }
  | { kind: 'free' }

export type Member = {
  id: string
  name: string | null
  email: string | null
  code: string | null
  joined: string
  heardVia: string | null
  heardOther: string | null
  lastSeen: string | null
  plan: Plan
  /** Their Stripe row when the plan shown is a comp, so the drawer can say both. */
  subNote: string | null
  /** A comp that has run out, kept for the drawer. */
  endedComp: { ended: string; note: string | null } | null
  leagues: { name: string; slug: string; empty: boolean }[]
}

export type LeagueItem = {
  id: string
  name: string
  slug: string
  platform: string
  owner: string
  ownerEmail: string | null
  created: string
  lastSynced: string | null
  published: boolean
  plan: 'veteran+' | 'rookie' | 'comp' | 'udfa' | 'testing'
  grace: string | null
  readers7: number
  yours: boolean
}

export type Tile = { label: string; today: number; week: number; strip: number[]; href?: string; note: string }

export type Attention = { tone: 'rust' | 'gold' | 'steel'; title: string; detail: string; href?: string }

export type Room = { href: string; name: string; em: string; stat: string; icon: RoomIcon }
export type RoomIcon = 'return' | 'pulse' | 'social' | 'mail' | 'star' | 'share'

export type AdminData = {
  asOf: string
  stripDays: string[]
  tiles: Tile[]
  accounts: { paying: number; mrrCents: number; trial: number; trialCancels: number; comped: number; canceled: number; free: number }
  library: { withData: number; byPlatform: { platform: string; n: number }[]; published: number; empty: number; emptyNfl: number }
  attention: Attention[]
  rooms: Room[]
  members: Member[]
  ownLeftOut: number
  leagues: LeagueItem[]
  emptyLeagues: LeagueItem[]
}

function nyDay(d: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ADMIN_TZ }).format(typeof d === 'string' ? new Date(d) : d)
}

// The last n NY days, oldest first, anchored at noon UTC so DST can't repeat
// or skip one.
function recentDays(n: number): string[] {
  const [y, m, d] = nyDay(new Date()).split('-').map(Number)
  const anchor = Date.UTC(y, m - 1, d, 12)
  return Array.from({ length: n }, (_, i) => new Date(anchor - (n - 1 - i) * DAY_MS).toISOString().slice(0, 10))
}

async function leaguesWithManagers(db: Db): Promise<Set<string>> {
  const ids = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from('managers').select('league_id').range(from, from + 999)
    for (const r of data ?? []) ids.add(r.league_id as string)
    if (!data || data.length < 1000) break
  }
  return ids
}

type Sub = { user_id: string; tier: Tier; billing_period: BillingPeriod; status: string; current_period_end: string | null; trial_ends_at: string | null; cancel_at_period_end: boolean }
type Comp = { user_id: string; note: string | null; created_at: string; expires_at: string | null }

function subPlan(s: Sub): Plan {
  const label = `${TIER_LABELS[s.tier]?.name ?? s.tier} ${s.billing_period}`
  if (s.status === 'active') return { kind: 'paying', label, renews: s.current_period_end, ending: s.cancel_at_period_end }
  if (s.status === 'trialing') return { kind: 'trial', label, ends: s.trial_ends_at ?? s.current_period_end, cancels: s.cancel_at_period_end }
  if (s.status === 'canceled' || s.status === 'incomplete_expired') {
    return { kind: 'canceled', label, since: s.trial_ends_at ?? s.current_period_end }
  }
  return { kind: 'pastdue', label, status: s.status.replace(/_/g, ' ') }
}

export async function loadAdmin(): Promise<AdminData> {
  const db = createAdminClient()
  const now = Date.now()
  const days = recentDays(STRIP_DAYS)
  const today = days[days.length - 1]
  const week = new Set(days.slice(-7))
  const seenSince = new Date(now - 90 * DAY_MS).toISOString().slice(0, 10)

  const [profilesRes, leaguesRes, subsRes, compsRes, authRes, hasData, userVisitsRes, leagueVisitsRes, socialRes, failedRes, tokenRes, subscribersRes, reviewsRes] = await Promise.all([
    db.from('profiles').select('id, display_name, member_code, created_at, referral_source, referral_source_other').order('created_at', { ascending: false }),
    db.from('leagues').select('id, name, slug, platform, owner_id, created_at, last_synced_at, published_at, grace_period_ends_at').order('created_at', { ascending: false }),
    db.from('subscriptions').select('user_id, tier, billing_period, status, current_period_end, trial_ends_at, cancel_at_period_end'),
    db.from('comp_grants').select('user_id, note, created_at, expires_at'),
    db.auth.admin.listUsers({ perPage: 1000 }),
    leaguesWithManagers(db),
    db.from('user_visits').select('user_id, day, last_seen_at').gte('day', seenSince).limit(50_000),
    db.from('league_visits').select('league_id, day, visitor, role').gte('day', days[0]).limit(50_000),
    db.from('social_posts').select('kind, scheduled_at').eq('status', 'queued').gte('scheduled_at', new Date(now).toISOString()).order('scheduled_at', { ascending: true }).limit(200),
    db.from('social_posts').select('kind, scheduled_at, status').in('status', ['failed', 'partial']).gte('scheduled_at', new Date(now - 3 * DAY_MS).toISOString()),
    db.from('social_tokens').select('expires_at').eq('platform', 'threads').maybeSingle(),
    db.from('recap_subscribers').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('site_reviews').select('rating'),
  ])

  const users = authRes.data?.users ?? []
  const own = await ownAccountIds(db, users)
  const emailById = new Map(users.map((u) => [u.id, u.email ?? null]))
  const subByUser = new Map(((subsRes.data ?? []) as Sub[]).map((s) => [s.user_id, s]))
  const compByUser = new Map(((compsRes.data ?? []) as Comp[]).map((c) => [c.user_id, c]))
  const profiles = (profilesRes.data ?? []) as { id: string; display_name: string | null; member_code: string | null; created_at: string; referral_source: string | null; referral_source_other: string | null }[]
  const nameById = new Map(profiles.map((p) => [p.id, p.display_name]))
  const leagues = (leaguesRes.data ?? []) as { id: string; name: string; slug: string; platform: string; owner_id: string; created_at: string; last_synced_at: string | null; published_at: string | null; grace_period_ends_at: string | null }[]

  // ── Visits ──
  const userVisits = ((userVisitsRes.data ?? []) as { user_id: string; day: string; last_seen_at: string }[]).filter((v) => !own.has(v.user_id))
  const leagueVisits = ((leagueVisitsRes.data ?? []) as { league_id: string; day: string; visitor: string; role: string }[])
    .filter((v) => !own.has(v.visitor.slice(2)))
  const lastSeen = new Map<string, string>()
  for (const v of userVisits) if (!lastSeen.has(v.user_id) || v.last_seen_at > lastSeen.get(v.user_id)!) lastSeen.set(v.user_id, v.last_seen_at)

  // People: every signed-in member on the site plus every browser that read a
  // league. A signed-in reader is 'u:<id>' in both, so they count once.
  const peopleByDay = new Map<string, Set<string>>(days.map((d) => [d, new Set()]))
  for (const v of userVisits) peopleByDay.get(v.day)?.add(`u:${v.user_id}`)
  for (const v of leagueVisits) peopleByDay.get(v.day)?.add(v.visitor)
  const peopleWeek = new Set<string>()
  for (const d of week) for (const p of peopleByDay.get(d) ?? []) peopleWeek.add(p)

  // Leagues opened by somebody other than their commish (as /admin/activity counts).
  const openedByDay = new Map<string, Set<string>>(days.map((d) => [d, new Set()]))
  const readers7 = new Map<string, Set<string>>()
  for (const v of leagueVisits) {
    if (v.role === 'owner') continue
    openedByDay.get(v.day)?.add(v.league_id)
    if (week.has(v.day)) {
      if (!readers7.has(v.league_id)) readers7.set(v.league_id, new Set())
      readers7.get(v.league_id)!.add(v.visitor)
    }
  }
  const openedWeek = new Set<string>()
  for (const d of week) for (const l of openedByDay.get(d) ?? []) openedWeek.add(l)

  const countByDay = (isos: string[]) => {
    const m = new Map<string, number>()
    for (const iso of isos) { const d = nyDay(iso); m.set(d, (m.get(d) ?? 0) + 1) }
    return days.map((d) => m.get(d) ?? 0)
  }
  const signupStrip = countByDay(profiles.filter((p) => !own.has(p.id)).map((p) => p.created_at))
  const leagueStrip = countByDay(leagues.filter((l) => !own.has(l.owner_id)).map((l) => l.created_at))
  const sumWeek = (strip: number[]) => strip.slice(-7).reduce((a, b) => a + b, 0)

  const tiles: Tile[] = [
    { label: 'People', today: peopleByDay.get(today)!.size, week: peopleWeek.size, strip: days.map((d) => peopleByDay.get(d)!.size), href: '/admin/visitors', note: 'Members signed in, plus anyone reading a league' },
    { label: 'Leagues opened', today: openedByDay.get(today)!.size, week: openedWeek.size, strip: days.map((d) => openedByDay.get(d)!.size), href: '/admin/activity', note: 'Opened by someone besides the commish' },
    { label: 'Signups', today: signupStrip[signupStrip.length - 1], week: sumWeek(signupStrip), strip: signupStrip, note: 'New accounts' },
    { label: 'New leagues', today: leagueStrip[leagueStrip.length - 1], week: sumWeek(leagueStrip), strip: leagueStrip, note: 'Leagues created, with or without data yet' },
  ]

  // ── Members ──
  const leaguesByOwner = new Map<string, { name: string; slug: string; empty: boolean }[]>()
  for (const l of leagues) {
    if (!leaguesByOwner.has(l.owner_id)) leaguesByOwner.set(l.owner_id, [])
    leaguesByOwner.get(l.owner_id)!.push({ name: l.name, slug: l.slug, empty: !hasData.has(l.id) })
  }
  const members: Member[] = profiles.filter((p) => !own.has(p.id)).map((p) => {
    const sub = subByUser.get(p.id)
    const comp = compByUser.get(p.id)
    const envComp = isLifetimeUser(p.id)
    const compOn = envComp || (!!comp && compIsActive(comp))
    let plan: Plan = sub ? subPlan(sub) : { kind: 'free' }
    let subNote: string | null = null
    if (compOn) {
      if (sub) {
        const sp = subPlan(sub)
        subNote = sp.kind === 'free' || sp.kind === 'comp' ? null : `${sp.label}, ${sp.kind === 'pastdue' ? sp.status : sp.kind}`
      }
      plan = { kind: 'comp', until: envComp ? null : comp?.expires_at ?? null, env: envComp, note: comp?.note ?? null }
    }
    return {
      id: p.id,
      name: p.display_name && !p.display_name.includes('@') ? p.display_name : null,
      email: emailById.get(p.id) ?? null,
      code: p.member_code,
      joined: p.created_at,
      heardVia: p.referral_source ? REFERRAL_LABELS[p.referral_source] ?? p.referral_source : p.referral_source_other ? 'Other' : null,
      heardOther: p.referral_source_other,
      lastSeen: lastSeen.get(p.id) ?? null,
      plan,
      subNote,
      endedComp: comp && !compOn && comp.expires_at ? { ended: comp.expires_at, note: comp.note } : null,
      leagues: leaguesByOwner.get(p.id) ?? [],
    }
  })

  // ── Accounts ──
  const accounts = { paying: 0, mrrCents: 0, trial: 0, trialCancels: 0, comped: 0, canceled: 0, free: 0 }
  for (const m of members) {
    if (m.plan.kind === 'paying') {
      accounts.paying++
      const sub = subByUser.get(m.id)!
      const price = TIER_PRICES[sub.tier]?.[sub.billing_period]?.amountCents ?? 0
      accounts.mrrCents += sub.billing_period === 'yearly' ? price / 12 : price
    } else if (m.plan.kind === 'trial') {
      accounts.trial++
      if (m.plan.cancels) accounts.trialCancels++
    } else if (m.plan.kind === 'comp') accounts.comped++
    else if (m.plan.kind === 'canceled') accounts.canceled++
    else accounts.free++
  }

  // ── Leagues ──
  // Plan per league, mirroring resolveLeagueTier: comp owner, paid owner,
  // the owner's first league while the preview window is open, else UDFA.
  const previewOpen = trialSlotActive()
  const earliestByOwner = new Map<string, string>()
  for (const l of leagues) earliestByOwner.set(l.owner_id, l.id) // newest first, so the last write is the oldest
  const memberById = new Map(members.map((m) => [m.id, m]))
  const toItem = (l: typeof leagues[number]): LeagueItem => {
    const sub = subByUser.get(l.owner_id)
    const comp = compByUser.get(l.owner_id)
    const ownerComp = isLifetimeUser(l.owner_id) || (!!comp && compIsActive(comp))
    const ownerSub = !!sub && (sub.status === 'active' || sub.status === 'trialing')
    const plan: LeagueItem['plan'] = ownerComp ? 'comp'
      : ownerSub ? (sub!.tier === 'tier1' ? 'rookie' : 'veteran+')
      : previewOpen && earliestByOwner.get(l.owner_id) === l.id ? 'testing'
      : 'udfa'
    const m = memberById.get(l.owner_id)
    return {
      id: l.id, name: l.name, slug: l.slug, platform: l.platform,
      owner: m?.name ?? nameById.get(l.owner_id) ?? emailById.get(l.owner_id) ?? 'Unknown',
      ownerEmail: emailById.get(l.owner_id) ?? null,
      created: l.created_at, lastSynced: l.last_synced_at, published: !!l.published_at,
      plan, grace: l.grace_period_ends_at, readers7: readers7.get(l.id)?.size ?? 0, yours: own.has(l.owner_id),
    }
  }
  const withData = leagues.filter((l) => hasData.has(l.id)).map(toItem)
  const emptyLeagues = leagues.filter((l) => !hasData.has(l.id)).map(toItem)
  const platformCount = new Map<string, number>()
  for (const l of withData) platformCount.set(l.platform, (platformCount.get(l.platform) ?? 0) + 1)

  // ── Needs you ──
  const attention: Attention[] = []
  const inDays = (iso: string) => Math.ceil((Date.parse(iso) - now) / DAY_MS)
  const who = (m: Member) => m.name ?? m.email ?? 'Someone'
  for (const m of members) {
    const p = m.plan
    if (p.kind === 'trial' && p.ends && inDays(p.ends) <= 7) {
      attention.push(p.cancels
        ? { tone: 'rust', title: `Trial won't convert, ends ${fmtDay(p.ends)}`, detail: `${who(m)} · ${p.label} · cancelled in Stripe` }
        : { tone: 'gold', title: `Trial converts ${fmtDay(p.ends)}`, detail: `${who(m)} · ${p.label}` })
    }
    if (p.kind === 'paying' && p.ending && p.renews) attention.push({ tone: 'rust', title: `Plan ends ${fmtDay(p.renews)}, not renewing`, detail: `${who(m)} · ${p.label}` })
    if (p.kind === 'pastdue') attention.push({ tone: 'rust', title: 'Payment problem', detail: `${who(m)} · ${p.label} · ${p.status}` })
    if (p.kind === 'comp' && p.until && inDays(p.until) <= 14) attention.push({ tone: 'gold', title: `Comp ends ${fmtDay(p.until)}`, detail: `${who(m)}${p.note ? ` · ${p.note}` : ''} · nobody tells them` })
    if (m.endedComp && now - Date.parse(m.endedComp.ended) < 14 * DAY_MS) attention.push({ tone: 'steel', title: `Comp ended ${fmtDay(m.endedComp.ended)}`, detail: `${who(m)}${m.endedComp.note ? ` · ${m.endedComp.note}` : ''}` })
  }
  for (const l of [...withData, ...emptyLeagues]) {
    if (l.grace) attention.push({ tone: 'rust', title: `Grace period, deletes ${fmtDay(l.grace, { month: 'short', day: 'numeric', year: 'numeric' })}`, detail: `${l.name} · ${l.owner}` })
  }
  for (const l of emptyLeagues) {
    const age = now - Date.parse(l.created)
    if (age > DAY_MS / 2 && age < 7 * DAY_MS && l.platform !== 'nfl') attention.push({ tone: 'rust', title: 'Sync never landed', detail: `${l.name} · ${PLATFORM_LABEL[l.platform] ?? l.platform} · ${l.owner}`, href: `/league/${l.slug}` })
  }
  const failed = (failedRes.data ?? []) as { kind: string; scheduled_at: string; status: string }[]
  if (failed.length) attention.push({ tone: 'rust', title: `${failed.length} social ${failed.length === 1 ? 'post' : 'posts'} failed`, detail: failed.slice(0, 3).map((f) => KIND_LABELS[f.kind as Kind] ?? f.kind).join(', '), href: '/admin/social' })
  if (!socialLive()) attention.push({ tone: 'gold', title: 'Social posting is off', detail: 'SOCIAL_LIVE is not 1', href: '/admin/social' })
  const tokenEnds = (tokenRes.data as { expires_at: string | null } | null)?.expires_at
  if (tokenEnds && inDays(tokenEnds) <= 10) attention.push({ tone: 'gold', title: `Threads token expires ${fmtDay(tokenEnds)}`, detail: 'The Saturday plan refreshes it; check it ran', href: '/admin/social' })
  const order = { rust: 0, gold: 1, steel: 2 }
  attention.sort((a, b) => order[a.tone] - order[b.tone])

  // ── Rooms ──
  const queued = (socialRes.data ?? []) as { kind: string; scheduled_at: string }[]
  const next = queued[0]
  const ratings = ((reviewsRes.data ?? []) as { rating: number }[]).map((r) => Number(r.rating))
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0
  const members7 = new Set(userVisits.filter((v) => week.has(v.day)).map((v) => v.user_id)).size
  const rooms: Room[] = [
    { href: '/admin/visitors', name: 'Who came', em: 'back', icon: 'return', stat: `${members7} ${members7 === 1 ? 'member' : 'members'} this week` },
    { href: '/admin/activity', name: 'League', em: 'activity', icon: 'pulse', stat: `${openedWeek.size} opened this week` },
    {
      href: '/admin/social', name: 'Social', em: 'queue', icon: 'social',
      stat: next
        ? `Next ${new Date(next.scheduled_at).toLocaleString('en-US', { timeZone: ADMIN_TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' })}, ${(KIND_LABELS[next.kind as Kind] ?? next.kind).replace(/ \(text\)$/, '')}`
        : 'Nothing queued',
    },
    { href: '/admin/mailing-lists', name: 'Mailing', em: 'lists', icon: 'mail', stat: `${subscribersRes.count ?? 0} recap subscribers` },
    { href: '/admin/reviews', name: 'The', em: 'reviews', icon: 'star', stat: ratings.length ? `${ratings.length} · ${avg.toFixed(1)} average` : 'None yet' },
    { href: '/admin/share', name: 'Share', em: 'hub', icon: 'share', stat: `${SHARE_PAGES.length} landing pages` },
  ]

  return {
    asOf: new Date(now).toISOString(),
    stripDays: days,
    tiles,
    accounts,
    library: {
      withData: withData.length,
      byPlatform: [...platformCount.entries()].sort((a, b) => b[1] - a[1]).map(([platform, n]) => ({ platform, n })),
      published: withData.filter((l) => l.published).length,
      empty: emptyLeagues.length,
      emptyNfl: emptyLeagues.filter((l) => l.platform === 'nfl').length,
    },
    attention,
    rooms,
    members,
    ownLeftOut: profiles.length - members.length,
    leagues: withData,
    emptyLeagues,
  }
}
