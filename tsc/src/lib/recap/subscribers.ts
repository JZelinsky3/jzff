// League mailing lists: anyone in a league can put their own address on
// the list at the bottom of a recap page and get the paper every Tuesday.
//
// Double opt-in. A signup sends one confirmation email and nothing else
// until the button on the confirmation page is pressed, so typing in
// somebody else's address costs them one ignorable email. It also does the
// domain's reputation a favour: the first email a new reader gets from us is
// one they asked for seconds ago and are looking for, which is the one most
// likely to be opened, and opened mail is what keeps the rest out of spam.

import { createAdminClient } from '@/lib/supabase/admin'
import { recapMode } from './run'
import { subscribeConfirmUrl, subscriberToken } from './links'
import { recapFromAddress, sendViaResend } from './resend'
import { renderSubscribeConfirmEmail } from './email'

type Db = ReturnType<typeof createAdminClient>

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i
// A confirmation is not re-sent to the same address sooner than this.
const RESEND_AFTER_MS = 10 * 60 * 1000
// Brakes on a script filling one league's list, or every list.
const LEAGUE_SIGNUPS_PER_HOUR = 15
const SITE_SIGNUPS_PER_HOUR = 120
const LEAGUE_MAX_ACTIVE = 60

export type SignupResult =
  | { ok: true; state: 'sent' | 'already' | 'recent' }
  | { ok: false; error: string }

export async function signUp(slug: string, rawEmail: string): Promise<SignupResult> {
  const email = rawEmail.trim().toLowerCase()
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, error: "That doesn't look like an email address." }
  if (recapMode() === 'off') return { ok: false, error: 'Recap email is paused right now. Try again next week.' }

  const db = createAdminClient()
  const { data: league } = await db.from('leagues').select('id, name, published_at').eq('slug', slug).maybeSingle()
  // The list belongs to a public paper. An unpublished league's recap is
  // only visible to its owner, who already gets the email.
  if (!league?.published_at) return { ok: false, error: 'This league is not taking signups.' }

  // A bounce or a spam complaint stops everything to an address, and a
  // signup form must not be the way around that.
  const { data: suppressed } = await db.from('email_suppressions').select('reason').eq('email', email).maybeSingle()
  if (suppressed && (suppressed.reason === 'bounce' || suppressed.reason === 'complaint')) {
    return { ok: false, error: "We can't send to that address. Try another one." }
  }

  const { data: existing } = await db
    .from('recap_subscribers')
    .select('id, status, confirm_sent_at')
    .eq('league_id', league.id)
    .eq('email', email)
    .maybeSingle()
  if (existing?.status === 'active') return { ok: true, state: 'already' }
  if (existing?.status === 'pending' && existing.confirm_sent_at && Date.now() - Date.parse(existing.confirm_sent_at) < RESEND_AFTER_MS) {
    return { ok: true, state: 'recent' }
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const [{ count: leagueHour }, { count: siteHour }, { count: active }] = await Promise.all([
    db.from('recap_subscribers').select('id', { count: 'exact', head: true }).eq('league_id', league.id).gte('updated_at', hourAgo),
    db.from('recap_subscribers').select('id', { count: 'exact', head: true }).gte('updated_at', hourAgo),
    db.from('recap_subscribers').select('id', { count: 'exact', head: true }).eq('league_id', league.id).eq('status', 'active'),
  ])
  if ((leagueHour ?? 0) >= LEAGUE_SIGNUPS_PER_HOUR || (siteHour ?? 0) >= SITE_SIGNUPS_PER_HOUR) {
    return { ok: false, error: 'Lots of signups right now. Try again in an hour.' }
  }
  if ((active ?? 0) >= LEAGUE_MAX_ACTIVE) return { ok: false, error: "This league's list is full." }

  const now = new Date().toISOString()
  let id = existing?.id as string | undefined
  if (id) {
    await db.from('recap_subscribers').update({ status: 'pending', updated_at: now }).eq('id', id)
  } else {
    const { data: row, error } = await db
      .from('recap_subscribers')
      .insert({ league_id: league.id, email, status: 'pending', updated_at: now })
      .select('id')
      .single()
    if (error || !row) return { ok: false, error: 'Something went wrong. Try again in a minute.' }
    id = row.id as string
  }

  const token = subscriberToken(id)
  if (!token) return { ok: false, error: 'Email is not set up on this site yet.' }
  const { html, text, subject } = renderSubscribeConfirmEmail({
    league: league.name as string,
    confirmUrl: subscribeConfirmUrl(token),
    from: recapFromAddress(),
  })
  const sent = await sendViaResend({ to: email, subject, html, text, unsubToken: null, idempotencyKey: null, category: 'recap_confirm' })
  if (!sent.ok) return { ok: false, error: 'The confirmation email did not go out. Try again in a minute.' }
  await db.from('recap_subscribers').update({ confirm_sent_at: new Date().toISOString() }).eq('id', id)
  return { ok: true, state: 'sent' }
}

export type Subscriber = {
  id: string
  email: string
  status: 'pending' | 'active' | 'unsubscribed'
  league: { id: string; name: string; slug: string }
}

export async function subscriberById(id: string): Promise<Subscriber | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('recap_subscribers')
    .select('id, email, status, leagues(id, name, slug)')
    .eq('id', id)
    .maybeSingle()
  const league = (Array.isArray(data?.leagues) ? data?.leagues[0] : data?.leagues) as Subscriber['league'] | undefined
  if (!data || !league) return null
  return { id: data.id as string, email: data.email as string, status: data.status as Subscriber['status'], league }
}

// Confirming and resuming are the same act: this address wants the paper.
export async function activateSubscriber(id: string): Promise<void> {
  const db = createAdminClient()
  const now = new Date().toISOString()
  await db
    .from('recap_subscribers')
    .update({ status: 'active', confirmed_at: now, unsubscribed_at: null, updated_at: now })
    .eq('id', id)
}

// Off this one league's list. Other lists the address is on, and the
// commissioner's own email if it is theirs, are untouched.
export async function unsubscribeSubscriber(id: string): Promise<void> {
  const db = createAdminClient()
  const now = new Date().toISOString()
  await db.from('recap_subscribers').update({ status: 'unsubscribed', unsubscribed_at: now, updated_at: now }).eq('id', id)
}

export async function activeSubscribers(db: Db, leagueId: string): Promise<{ id: string; email: string }[]> {
  const { data } = await db.from('recap_subscribers').select('id, email').eq('league_id', leagueId).eq('status', 'active')
  return (data ?? []) as { id: string; email: string }[]
}

// ── The commissioner's side of the list ──────────────────────────────────
//
// The commish knows everyone's email, so they can add the league from the
// Current Season page instead of waiting for each member to find the form.
// It's the same double opt-in: an added address gets one confirmation
// email that says who added it, and nothing else until they press the
// button. Someone who left the list is not re-invited; they can rejoin
// from any recap page themselves.

const OWNER_INVITES_PER_HOUR = 40
export const OWNER_INVITES_PER_CALL = 20
// Resend allows two requests a second; invites go out one at a time under it.
const SEND_GAP_MS = 550

export type ListMember = { id: string; email: string; status: 'pending' | 'active' }

export async function listMembers(leagueId: string): Promise<ListMember[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('recap_subscribers')
    .select('id, email, status')
    .eq('league_id', leagueId)
    .in('status', ['pending', 'active'])
    .order('created_at', { ascending: true })
  return (data ?? []) as ListMember[]
}

export type InviteResult = 'sent' | 'already' | 'recent' | 'left' | 'blocked' | 'invalid' | 'you' | 'full' | 'failed'
export type InviteOutcome = { email: string; result: InviteResult }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function inviteToList(args: {
  leagueId: string
  emails: string[]
  // The commissioner's own address. They already get the paper as owner,
  // and a second copy on the list would just be a duplicate.
  ownerEmail: string | null
}): Promise<{ ok: true; outcomes: InviteOutcome[] } | { ok: false; error: string }> {
  if (recapMode() === 'off') return { ok: false, error: 'Recap email is paused right now. Try again next week.' }

  const db = createAdminClient()
  const { data: league } = await db.from('leagues').select('id, name, published_at').eq('id', args.leagueId).maybeSingle()
  if (!league) return { ok: false, error: 'League not found.' }
  // Same rule as the public form: the list belongs to a public paper.
  if (!league.published_at) return { ok: false, error: 'Publish your almanac first. The mailing list opens once the recap is public.' }

  const emails = [...new Set(args.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))].slice(0, OWNER_INVITES_PER_CALL)
  const isEmail = (e: string) => e.length <= 254 && EMAIL.test(e)
  // Only well-formed addresses go into the lookups below.
  const valid = emails.filter(isEmail)
  const owner = args.ownerEmail?.trim().toLowerCase() ?? null

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const none = Promise.resolve({ data: [] as Record<string, unknown>[] })
  const [{ count: leagueHour }, { count: siteHour }, { count: activeCount }, { data: existingRows }, { data: suppressedRows }] =
    await Promise.all([
      db.from('recap_subscribers').select('id', { count: 'exact', head: true }).eq('league_id', league.id).gte('updated_at', hourAgo),
      db.from('recap_subscribers').select('id', { count: 'exact', head: true }).gte('updated_at', hourAgo),
      db.from('recap_subscribers').select('id', { count: 'exact', head: true }).eq('league_id', league.id).eq('status', 'active'),
      valid.length > 0
        ? db.from('recap_subscribers').select('id, email, status, confirm_sent_at').eq('league_id', league.id).in('email', valid)
        : none,
      valid.length > 0 ? db.from('email_suppressions').select('email').in('email', valid) : none,
    ])
  let budget = Math.min(OWNER_INVITES_PER_HOUR - (leagueHour ?? 0), SITE_SIGNUPS_PER_HOUR - (siteHour ?? 0))
  if (budget <= 0) return { ok: false, error: 'That’s a lot of invites for one hour. Try again later.' }

  const existing = new Map((existingRows ?? []).map((r) => [r.email as string, r]))
  // Any suppression, including an unsubscribe: the commissioner adding an
  // address must not be a way around somebody saying stop.
  const suppressed = new Set((suppressedRows ?? []).map((r) => r.email as string))
  const room = LEAGUE_MAX_ACTIVE - (activeCount ?? 0)

  const outcomes: InviteOutcome[] = []
  let lastSend = 0
  for (const email of emails) {
    const ex = existing.get(email)
    if (!isEmail(email)) { outcomes.push({ email, result: 'invalid' }); continue }
    if (owner && email === owner) { outcomes.push({ email, result: 'you' }); continue }
    if (suppressed.has(email)) { outcomes.push({ email, result: 'blocked' }); continue }
    if (ex?.status === 'active') { outcomes.push({ email, result: 'already' }); continue }
    if (ex?.status === 'unsubscribed') { outcomes.push({ email, result: 'left' }); continue }
    if (ex?.status === 'pending' && ex.confirm_sent_at && Date.now() - Date.parse(ex.confirm_sent_at as string) < RESEND_AFTER_MS) {
      outcomes.push({ email, result: 'recent' })
      continue
    }
    if (room <= 0) { outcomes.push({ email, result: 'full' }); continue }
    if (budget <= 0) { outcomes.push({ email, result: 'failed' }); continue }

    const now = new Date().toISOString()
    let id = ex?.id as string | undefined
    if (id) {
      await db.from('recap_subscribers').update({ status: 'pending', updated_at: now }).eq('id', id)
    } else {
      const { data: row } = await db
        .from('recap_subscribers')
        .insert({ league_id: league.id, email, status: 'pending', updated_at: now })
        .select('id')
        .single()
      id = row?.id as string | undefined
    }
    const token = id ? subscriberToken(id) : null
    if (!id || !token) { outcomes.push({ email, result: 'failed' }); continue }

    const mail = renderSubscribeConfirmEmail({
      league: league.name as string,
      confirmUrl: subscribeConfirmUrl(token),
      from: recapFromAddress(),
      invited: true,
    })
    const send = () => sendViaResend({ to: email, ...mail, unsubToken: null, idempotencyKey: null, category: 'recap_invite' })
    const wait = lastSend + SEND_GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastSend = Date.now()
    let sent = await send()
    // One retry if Resend says slow down.
    if (!sent.ok && sent.error.startsWith('Resend 429')) {
      await sleep(1100)
      lastSend = Date.now()
      sent = await send()
    }
    budget--
    if (!sent.ok) { outcomes.push({ email, result: 'failed' }); continue }
    await db.from('recap_subscribers').update({ confirm_sent_at: new Date().toISOString() }).eq('id', id)
    outcomes.push({ email, result: 'sent' })
  }
  return { ok: true, outcomes }
}

// Off the list, from the commissioner's side. An address that never
// confirmed is simply forgotten; a confirmed one is marked as left, which
// keeps its send history.
export async function removeMember(leagueId: string, id: string): Promise<void> {
  const db = createAdminClient()
  const { data: row } = await db.from('recap_subscribers').select('status').eq('id', id).eq('league_id', leagueId).maybeSingle()
  if (!row) return
  if (row.status === 'pending') {
    await db.from('recap_subscribers').delete().eq('id', id).eq('league_id', leagueId)
    return
  }
  const now = new Date().toISOString()
  await db
    .from('recap_subscribers')
    .update({ status: 'unsubscribed', unsubscribed_at: now, updated_at: now })
    .eq('id', id)
    .eq('league_id', leagueId)
}
