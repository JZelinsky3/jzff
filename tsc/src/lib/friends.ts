// Friends. SERVER ONLY.
//
// The old games site found friends by searching usernames. This site has no
// usernames, and a search box over every account would be a directory of
// strangers, so the ways in are all people you already know (0082):
//
//   your invite link   opened and accepted = friends, no second step. You
//                      sent it and they tapped it, so both sides said yes.
//   your leagues       owners, bookmarkers and claimed managers of any league
//                      you're tied to, offered as suggestions. A request.
//   a member code      typed in by hand. A request. Codes stand in for names
//                      on public boards, so one must never be enough alone.
//   a Versus opponent  the person you just played. A request.
//
// Friendship rows hold no user ids that ever reach the browser. The client
// acts on friendship ids and member codes, and the server works out who.

import { randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { publicNames } from '@/lib/minigames/boardIdentity'

export type FriendSource = 'link' | 'league' | 'code' | 'versus'

type FriendshipRow = {
  id: string
  created_at: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted'
  source: FriendSource
  accepted_at: string | null
}

export type HeadToHead = { w: number; l: number; t: number }

export type Friend = {
  /** The friendship row. Every action on it goes by this id. */
  id: string
  name: string
  code: string
  /** Accepted, or asked, as an ISO date. */
  since: string
  /** Pack Empire Versus and Mega Draft, from your side. Null when you have
      never played each other. */
  h2h: HeadToHead | null
}

export type Suggestion = {
  name: string
  code: string
  /** The league you share, plus how many more. */
  via: string
}

export type WaitingChallenge = {
  id: string
  /** A Versus Challenge, or a Mega Draft with your seat held. */
  kind: 'versus' | 'mega'
  from: string
  at: string
  /** The number to beat, if they've already drafted. */
  score: number | null
}

export type FriendsState = {
  /** Your invite link's token. The page builds the URL. */
  invite: string
  friends: Friend[]
  incoming: Friend[]
  outgoing: Friend[]
  suggestions: Suggestion[]
  challenges: WaitingChallenge[]
}

export type Fail = { ok: false; error: string; status?: number }

/** Requests you can have waiting on other people at once. */
const MAX_OUTGOING = 25
const MAX_SUGGESTIONS = 8

const db = () => createAdminClient()

// ============================================================
// Invite links
// ============================================================

function newToken(): string {
  return randomBytes(9).toString('base64url')
}

export function isInviteToken(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{12}$/.test(v)
}

/** This account's invite token, made the first time anything asks. */
export async function inviteToken(userId: string): Promise<string> {
  const { data } = await db().from('friend_links').select('token').eq('user_id', userId).maybeSingle()
  if (data?.token) return data.token as string
  const token = newToken()
  // Two tabs asking at once: whichever insert lands first is the token.
  await db().from('friend_links').upsert({ user_id: userId, token }, { onConflict: 'user_id', ignoreDuplicates: true })
  const { data: again } = await db().from('friend_links').select('token').eq('user_id', userId).maybeSingle()
  return (again?.token as string | undefined) ?? token
}

/** A new token, which kills every copy of the old link. */
export async function resetInvite(userId: string): Promise<void> {
  await db().from('friend_links').upsert({ user_id: userId, token: newToken(), created_at: new Date().toISOString() })
}

/** Who an invite link belongs to, for the page it opens. */
export async function inviteOwner(token: unknown): Promise<{ userId: string; name: string } | null> {
  if (!isInviteToken(token)) return null
  const { data } = await db().from('friend_links').select('user_id').eq('token', token).maybeSingle()
  if (!data) return null
  const userId = data.user_id as string
  return { userId, name: (await publicNames([userId])).get(userId) ?? 'A member' }
}

// ============================================================
// The pair
// ============================================================

async function pairRow(a: string, b: string): Promise<FriendshipRow | null> {
  const { data } = await db()
    .from('friendships')
    .select('*')
    .or(`and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`)
    .maybeSingle()
  return (data as FriendshipRow | null) ?? null
}

/** Whether two accounts are friends (accepted, either way round). */
export async function areFriends(a: string, b: string): Promise<boolean> {
  const row = await pairRow(a, b)
  return row?.status === 'accepted'
}

/** The other account on one of the viewer's accepted friendships, or null.
    How a challenge names its friend without a user id leaving the server. */
export async function friendOf(userId: string, friendshipId: unknown): Promise<string | null> {
  if (typeof friendshipId !== 'string' || !/^[0-9a-f-]{36}$/.test(friendshipId)) return null
  const { data } = await db()
    .from('friendships')
    .select('requester_id, addressee_id, status')
    .eq('id', friendshipId)
    .maybeSingle()
  if (!data || data.status !== 'accepted') return null
  if (data.requester_id === userId) return data.addressee_id as string
  if (data.addressee_id === userId) return data.requester_id as string
  return null
}

/**
 * Asks `target` to be friends. If they already asked you, that's a yes and
 * it's accepted on the spot rather than leaving two requests crossing.
 */
async function request(
  userId: string,
  target: string,
  source: Exclude<FriendSource, 'link'>
): Promise<{ ok: true; message: string } | Fail> {
  if (target === userId) return { ok: false, error: 'That one is you.' }
  const name = (await publicNames([target])).get(target) ?? 'them'
  const existing = await pairRow(userId, target)
  if (existing?.status === 'accepted') return { ok: true, message: `You and ${name} are already friends.` }
  if (existing && existing.requester_id === userId) return { ok: true, message: `Already asked ${name}.` }
  if (existing) {
    await db()
      .from('friendships')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', existing.id)
    return { ok: true, message: `You and ${name} are friends now.` }
  }

  const { count } = await db()
    .from('friendships')
    .select('id', { count: 'exact', head: true })
    .eq('requester_id', userId)
    .eq('status', 'pending')
  if ((count ?? 0) >= MAX_OUTGOING) {
    return { ok: false, error: `You have ${MAX_OUTGOING} requests waiting already. Give them a chance to answer.` }
  }

  const { error } = await db().from('friendships').insert({ requester_id: userId, addressee_id: target, source })
  // A unique-pair collision is the other side asking in the same second.
  if (error && error.code !== '23505') return { ok: false, error: 'Could not send that request.' }
  return { ok: true, message: `Asked ${name}. They'll see it on their profile.` }
}

const CODE_RE = /^[2-9A-HJKMNP-Z]{7}$/

/** A member code, typed in by hand or tapped off a suggestion. */
export async function requestByCode(
  userId: string,
  raw: unknown,
  via: unknown
): Promise<{ ok: true; message: string } | Fail> {
  const code = typeof raw === 'string' ? raw.toUpperCase().replace(/[^0-9A-Z]/g, '') : ''
  if (!CODE_RE.test(code)) return { ok: false, error: 'Member codes are seven letters and numbers.' }
  const { data } = await db().from('profiles').select('id').eq('member_code', code).maybeSingle()
  if (!data) return { ok: false, error: 'No member has that code.' }
  return request(userId, data.id as string, via === 'league' ? 'league' : 'code')
}

/** The account you just played in a Versus challenge. */
export async function requestOpponent(userId: string, opponentId: string | null) {
  if (!opponentId) return { ok: false as const, error: 'They played without an account, so there is nobody to add.' }
  return request(userId, opponentId, 'versus')
}

/** Opening somebody's invite link and saying yes. */
export async function acceptInvite(
  userId: string,
  token: unknown
): Promise<{ ok: true; name: string } | Fail> {
  const owner = await inviteOwner(token)
  if (!owner) return { ok: false, error: 'That invite link has been reset. Ask for a fresh one.', status: 404 }
  if (owner.userId === userId) return { ok: false, error: 'That is your own link. Send it to someone.' }

  const existing = await pairRow(userId, owner.userId)
  if (existing?.status === 'accepted') return { ok: true, name: owner.name }
  if (existing) {
    await db()
      .from('friendships')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', existing.id)
    return { ok: true, name: owner.name }
  }
  const { error } = await db().from('friendships').insert({
    requester_id: owner.userId,
    addressee_id: userId,
    status: 'accepted',
    source: 'link',
    accepted_at: new Date().toISOString(),
  })
  if (error && error.code === '23505') {
    // They asked at the same moment. Whatever landed, make it a yes.
    const raced = await pairRow(userId, owner.userId)
    if (raced && raced.status !== 'accepted') {
      await db().from('friendships').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', raced.id)
    }
  } else if (error) {
    return { ok: false, error: 'Could not add them. Try the link again.' }
  }
  return { ok: true, name: owner.name }
}

/** Saying yes to a request someone sent you. */
export async function acceptRequest(userId: string, id: unknown): Promise<{ ok: true } | Fail> {
  if (typeof id !== 'string') return { ok: false, error: 'No such request.' }
  const { data } = await db()
    .from('friendships')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('addressee_id', userId)
    .eq('status', 'pending')
    .select('id')
  if (!data?.length) return { ok: false, error: 'That request is gone.' }
  return { ok: true }
}

/** Decline, cancel and unfriend are all the same thing: the row goes. */
export async function removeFriendship(userId: string, id: unknown): Promise<{ ok: true } | Fail> {
  if (typeof id !== 'string') return { ok: false, error: 'No such friend.' }
  await db()
    .from('friendships')
    .delete()
    .eq('id', id)
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
  return { ok: true }
}

// ============================================================
// The whole list
// ============================================================

/** Accepted friends' account ids, for records and boards. */
export async function friendIds(userId: string): Promise<string[]> {
  const { data } = await db()
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
  return ((data ?? []) as { requester_id: string; addressee_id: string }[]).map((r) =>
    r.requester_id === userId ? r.addressee_id : r.requester_id
  )
}

/** Accepted friends by friendship id and name, for a picker. */
export async function friendPicker(userId: string): Promise<{ id: string; name: string }[]> {
  const { data } = await db()
    .from('friendships')
    .select('id, requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
  const rows = (data ?? []) as { id: string; requester_id: string; addressee_id: string }[]
  const other = (r: (typeof rows)[number]) => (r.requester_id === userId ? r.addressee_id : r.requester_id)
  const names = await publicNames(rows.map(other))
  return rows
    .map((r) => ({ id: r.id, name: names.get(other(r)) ?? 'Friend' }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Pack Empire head-to-heads against every account you've played. */
async function headToHeads(userId: string): Promise<Map<string, HeadToHead>> {
  // Imported here rather than at the top: versus.ts imports this module for
  // friendOf, and a cycle at module load leaves one side undefined.
  const [{ versusResults }, { megaResults }] = await Promise.all([
    import('@/lib/packEmpire/versus'),
    import('@/lib/packEmpire/mega'),
  ])
  const [vs, mega] = await Promise.all([versusResults(userId), megaResults(userId)])
  const out = new Map<string, HeadToHead>()
  for (const r of [...vs, ...mega]) {
    if (!r.opponentId) continue
    const h = out.get(r.opponentId) ?? { w: 0, l: 0, t: 0 }
    if (r.yours > r.theirs) h.w++
    else if (r.yours < r.theirs) h.l++
    else h.t++
    out.set(r.opponentId, h)
  }
  return out
}

/**
 * People from your leagues you aren't connected to yet.
 *
 * A league ties an account to it three ways: owning it, bookmarking it, or
 * claiming a manager in it. Anyone tied to a league you're tied to is
 * somebody you very probably know. Claims and ownership weigh double, since a
 * bookmark can be a stranger who liked the almanac.
 */
async function suggestionsFor(userId: string, skip: Set<string>): Promise<Suggestion[]> {
  const [owned, marked, claimed] = await Promise.all([
    db().from('leagues').select('id').eq('owner_id', userId),
    db().from('league_bookmarks').select('league_id').eq('user_id', userId),
    db().from('league_claims').select('league_id').eq('profile_id', userId),
  ])
  const leagueIds = [
    ...new Set([
      ...((owned.data ?? []) as { id: string }[]).map((r) => r.id),
      ...((marked.data ?? []) as { league_id: string }[]).map((r) => r.league_id),
      ...((claimed.data ?? []) as { league_id: string }[]).map((r) => r.league_id),
    ]),
  ]
  if (leagueIds.length === 0) return []

  const [leagues, marks, claims] = await Promise.all([
    db().from('leagues').select('id, name, owner_id').in('id', leagueIds),
    db().from('league_bookmarks').select('league_id, user_id').in('league_id', leagueIds).limit(2000),
    db().from('league_claims').select('league_id, profile_id').in('league_id', leagueIds).limit(2000),
  ])
  const leagueName = new Map<string, string>()
  const weight = new Map<string, number>()
  const shared = new Map<string, Set<string>>()
  const add = (who: string | null, league: string, w: number) => {
    if (!who || who === userId || skip.has(who)) return
    weight.set(who, (weight.get(who) ?? 0) + w)
    const s = shared.get(who) ?? new Set<string>()
    s.add(league)
    shared.set(who, s)
  }
  for (const l of (leagues.data ?? []) as { id: string; name: string; owner_id: string | null }[]) {
    leagueName.set(l.id, l.name)
    add(l.owner_id, l.id, 2)
  }
  for (const m of (marks.data ?? []) as { league_id: string; user_id: string }[]) add(m.user_id, m.league_id, 1)
  for (const c of (claims.data ?? []) as { league_id: string; profile_id: string }[]) add(c.profile_id, c.league_id, 2)

  const picked = [...weight.entries()]
    .sort((a, b) => b[1] - a[1] || (shared.get(b[0])?.size ?? 0) - (shared.get(a[0])?.size ?? 0))
    .slice(0, MAX_SUGGESTIONS)
    .map(([id]) => id)
  if (picked.length === 0) return []

  const [names, { data: codes }] = await Promise.all([
    publicNames(picked),
    db().from('profiles').select('id, member_code').in('id', picked),
  ])
  const codeOf = new Map(((codes ?? []) as { id: string; member_code: string }[]).map((p) => [p.id, p.member_code]))
  return picked.flatMap((id) => {
    const code = codeOf.get(id)
    if (!code) return []
    const leaguesShared = [...(shared.get(id) ?? [])]
    const first = leagueName.get(leaguesShared[0]) ?? 'your league'
    return [
      {
        name: names.get(id) ?? code,
        code,
        via: leaguesShared.length > 1 ? `${first} +${leaguesShared.length - 1}` : first,
      },
    ]
  })
}

/** Friend challenges and Mega Drafts sitting in your list that you haven't
    opened, newest first. */
async function waitingChallenges(userId: string): Promise<WaitingChallenge[]> {
  const [vs, mega] = await Promise.all([
    db()
      .from('pe_versus')
      .select('id, created_at, host_name, host_score:host_result->score')
      .eq('invited_id', userId)
      .is('guest_id', null)
      .neq('status', 'done')
      .order('created_at', { ascending: false })
      .limit(10),
    db()
      .from('pe_mega_drafts')
      .select('id, created_at, host_name')
      .eq('invited_id', userId)
      .is('guest_id', null)
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
      .limit(10),
  ])
  const out: WaitingChallenge[] = [
    ...((vs.data ?? []) as { id: string; created_at: string; host_name: string; host_score: number | null }[]).map(
      (r) => ({
        id: r.id,
        kind: 'versus' as const,
        from: r.host_name,
        at: r.created_at,
        score: r.host_score == null ? null : Number(r.host_score),
      })
    ),
    ...((mega.data ?? []) as { id: string; created_at: string; host_name: string }[]).map((r) => ({
      id: r.id,
      kind: 'mega' as const,
      from: r.host_name,
      at: r.created_at,
      score: null,
    })),
  ]
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10)
}

export async function friendsState(userId: string): Promise<FriendsState> {
  const { data } = await db()
    .from('friendships')
    .select('*')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(500)
  const rows = (data ?? []) as FriendshipRow[]
  const other = (r: FriendshipRow) => (r.requester_id === userId ? r.addressee_id : r.requester_id)
  const everyone = rows.map(other)

  const [invite, names, codes, h2h, suggestions, challenges] = await Promise.all([
    inviteToken(userId),
    publicNames(everyone),
    everyone.length
      ? db().from('profiles').select('id, member_code').in('id', everyone)
      : Promise.resolve({ data: [] as { id: string; member_code: string }[] }),
    rows.some((r) => r.status === 'accepted') ? headToHeads(userId) : Promise.resolve(new Map<string, HeadToHead>()),
    suggestionsFor(userId, new Set(everyone)),
    waitingChallenges(userId),
  ])
  const codeOf = new Map(((codes.data ?? []) as { id: string; member_code: string }[]).map((p) => [p.id, p.member_code]))

  const toFriend = (r: FriendshipRow): Friend => {
    const id = other(r)
    return {
      id: r.id,
      name: names.get(id) ?? 'Member',
      code: codeOf.get(id) ?? '',
      since: r.accepted_at ?? r.created_at,
      h2h: h2h.get(id) ?? null,
    }
  }

  const friends = rows
    .filter((r) => r.status === 'accepted')
    .map(toFriend)
    .sort((a, b) => a.name.localeCompare(b.name))
  return {
    invite,
    friends,
    incoming: rows.filter((r) => r.status === 'pending' && r.addressee_id === userId).map(toFriend),
    outgoing: rows.filter((r) => r.status === 'pending' && r.requester_id === userId).map(toFriend),
    suggestions,
    challenges,
  }
}
