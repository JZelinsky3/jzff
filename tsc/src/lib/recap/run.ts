// The weekly recap job: for every league with a live season, build the recap
// for the week that just finished, check it, store it, and email it to the
// commissioner. Driven by /api/cron/recaps.
//
// ── Safety rails, in the order they fire ─────────────────────────────────
//  1. No NFL clock, no recaps. Everything downstream keys off "which week
//     just finished", and guessing that is how a partial week goes out.
//  2. The week must be final (nflClock.weekIsFinal) AND every game in it must
//     have two real scores (facts.ts). A league that fails is stored as
//     'held' with the reason, and the next run tries again.
//  3. RECAP_SEND_MODE decides who can receive anything at all:
//        off    build and store, send nothing
//        admin  send only to leagues owned by a site admin (the default,
//               so a fresh deploy can only ever email Joey)
//        all    send to every eligible commissioner
//  4. A recipient is skipped when their address is unconfirmed, on the
//     suppression list (unsubscribed, bounced, complained), or has turned
//     off product email on /account.
//  5. The (recap, user) pair is claimed in recap_sends BEFORE Resend is
//     called. A second run hits the unique constraint and skips, so a recap
//     can go out at most once. A send that dies halfway stays 'pending' and
//     is not retried.
//  6. The league's mailing list (./subscribers.ts) gets the same email under
//     the same rules: same mode gate, a (recap, subscriber) claim first, and
//     no copy to a bounced or complained address. Only confirmed addresses
//     are on it.

import { createAdminClient } from '@/lib/supabase/admin'
import { getLockReason } from '@/lib/leagueTier'
import { getNflClock, weekIsFinal } from '@/lib/nflClock'
import { buildRecapFacts, recapTierFor, RECAP_FACTS_VERSION, type RecapFacts } from './facts'
import { recapSubject, templateIntro, writeIntro } from './intro'
import { renderRecapEmail, type RecapAudience } from './email'
import { SITE_URL, recapPageUrl, subscriberToken, unsubscribePageUrl, unsubscribeToken } from './links'
import { sendViaResend } from './resend'
import { activeSubscribers } from './subscribers'

export type RecapMode = 'off' | 'admin' | 'all'

export function recapMode(): RecapMode {
  const v = (process.env.RECAP_SEND_MODE ?? '').trim().toLowerCase()
  return v === 'off' || v === 'all' ? v : 'admin'
}

export type RecapRunOptions = {
  startedAt: number
  // Build and report, write nothing, send nothing.
  dry?: boolean
  // Only this league.
  slug?: string | null
  // Rebuild facts and intro even if the recap exists. Never re-sends.
  force?: boolean
  // Email this league's recap to the site admins only, marked [Preview], and
  // log nothing. For checking inbox placement before a real send.
  preview?: boolean
  offset?: number
}

export type RecapLeagueResult = { slug: string; outcome: string; detail?: string }

export type RecapRunReport =
  | { ok: false; error: string }
  | {
      ok: true
      year: number | null
      week: number | null
      mode: RecapMode
      dry: boolean
      done: boolean
      nextOffset: number | null
      note?: string
      results: RecapLeagueResult[]
    }

// Stop starting new leagues after this long. Each one is a few database
// reads plus one model call; the headroom is for the one in flight.
const START_BUDGET_MS = 200_000

type Db = ReturnType<typeof createAdminClient>

export async function runRecaps(opts: RecapRunOptions): Promise<RecapRunReport> {
  const db = createAdminClient()
  const mode = recapMode()
  const dry = !!opts.dry

  const clock = await getNflClock()
  if (!clock) return { ok: false, error: 'NFL clock unavailable. Not building recaps blind.' }

  const empty = (note: string): RecapRunReport => ({
    ok: true, year: clock.season, week: null, mode, dry, done: true, nextOffset: null, note, results: [],
  })
  if (clock.seasonType !== 'regular' && clock.seasonType !== 'post') return empty(`NFL season type is ${clock.seasonType}`)

  const year = clock.season
  // In season, the week that just finished. Once the NFL regular season is
  // over, week 18 is the last one any league can still owe a recap for.
  const week = clock.seasonType === 'regular' ? clock.week - 1 : 18
  if (week < 1) return empty('no week has finished yet')
  if (!weekIsFinal(year, week, clock)) return empty(`week ${week} is not final`)

  if (!dry) {
    const probe = await db.from('weekly_recaps').select('id').limit(1)
    if (probe.error) {
      return { ok: false, error: `weekly_recaps is not readable (${probe.error.message}). Apply migration 0070_weekly_recaps.sql.` }
    }
  }

  const { data: live } = await db.from('seasons').select('league_id').eq('year', year).eq('is_live', true)
  const ids = [...new Set((live ?? []).map((s) => s.league_id as string))]
  if (!ids.length) return empty('no live seasons')

  let query = db
    .from('leagues')
    .select('id, slug, name, owner_id, published_at')
    .in('id', ids)
    .order('id', { ascending: true })
  if (opts.slug) query = query.eq('slug', opts.slug)
  const { data: leagueRows } = await query
  const leagues = (leagueRows ?? []) as {
    id: string
    slug: string
    name: string
    owner_id: string | null
    published_at: string | null
  }[]

  const { data: adminRows } = await db.from('site_admins').select('user_id')
  const admins = new Set((adminRows ?? []).map((a) => a.user_id as string))

  const offset = Math.max(0, opts.offset ?? 0)
  let cursor = offset
  const results: RecapLeagueResult[] = []

  for (const league of leagues.slice(offset)) {
    if (Date.now() - opts.startedAt > START_BUDGET_MS) break
    cursor++
    try {
      results.push(await runLeague(db, league, { year, week, mode, dry, admins, force: !!opts.force, preview: !!opts.preview }))
    } catch (e) {
      results.push({ slug: league.slug, outcome: 'error', detail: (e as Error).message.slice(0, 300) })
    }
  }

  const done = cursor >= leagues.length
  return { ok: true, year, week, mode, dry, done, nextOffset: done ? null : cursor, results }
}

async function runLeague(
  db: Db,
  league: { id: string; slug: string; name: string; owner_id: string | null; published_at: string | null },
  ctx: { year: number; week: number; mode: RecapMode; dry: boolean; admins: Set<string>; force: boolean; preview: boolean },
): Promise<RecapLeagueResult> {
  const { year, week } = ctx
  const out = (outcome: string, detail?: string): RecapLeagueResult => ({ slug: league.slug, outcome, ...(detail ? { detail } : {}) })

  // An unpublished almanac is hidden from everyone but its owner, and the
  // recap page follows the same rule, so a recap would be an email full of
  // links that don't open. Nothing is built until the league is published.
  if (!league.published_at) return out('unpublished')

  const { data: existing } = await db
    .from('weekly_recaps')
    .select('id, status, intro, intro_source, version:facts->v')
    .eq('league_id', league.id)
    .eq('season_year', year)
    .eq('week', week)
    .maybeSingle()
  if (existing?.status === 'sent' && !ctx.force && !ctx.preview) return out('already-sent')

  const tier = recapTierFor(await getLockReason(league.id, league.owner_id))
  const built = await buildRecapFacts({ leagueId: league.id, year, week, tier })
  if (built.status === 'incomplete') {
    if (!ctx.dry && existing?.status !== 'sent') {
      await db.from('weekly_recaps').upsert(
        {
          league_id: league.id, season_year: year, week,
          status: 'held', hold_reason: built.reason, updated_at: new Date().toISOString(),
        },
        { onConflict: 'league_id,season_year,week' },
      )
    }
    return out('held', built.reason)
  }
  if (built.status !== 'ok') return out(built.status)
  const facts = built.facts

  // Reuse an intro that already passed its checks, so a retry doesn't
  // produce a second, different paragraph for the same week.
  let intro: string
  let introSource: 'ai' | 'template'
  let introNote: string | undefined
  // Only when it was written from the current facts shape: an intro written
  // from last version's facts may lean on lines the new ones don't carry.
  if (existing?.intro && existing.status !== 'held' && !ctx.force && Number(existing.version) === RECAP_FACTS_VERSION) {
    intro = existing.intro as string
    introSource = (existing.intro_source as 'ai' | 'template') ?? 'template'
  } else {
    const written = await writeIntro(facts)
    intro = written.text
    introSource = written.source
    introNote = written.note
  }
  const subject = recapSubject(facts)
  const introInfo = `${tier} tier, ${introSource} intro${introNote ? ` (${introNote})` : ''}`

  if (ctx.dry) return out('dry-run', `${subject} | ${introInfo} | ${intro}`)

  const { data: saved, error: saveErr } = await db
    .from('weekly_recaps')
    .upsert(
      {
        league_id: league.id, season_year: year, week,
        facts, intro, intro_source: introSource, subject,
        status: existing?.status === 'sent' ? 'sent' : 'ready',
        hold_reason: null, updated_at: new Date().toISOString(),
      },
      { onConflict: 'league_id,season_year,week' },
    )
    .select('id')
    .single()
  if (saveErr || !saved) return out('error', `could not save the recap: ${saveErr?.message ?? 'no row'}`)
  const recapId = saved.id as string

  if (ctx.preview) {
    const sent: string[] = []
    for (const adminId of ctx.admins) {
      const email = await confirmedEmail(db, adminId)
      if (!email) continue
      const r = await sendRecapEmail({
        facts, intro, subject: `[Preview] ${subject}`, to: email, audience: 'owner',
        unsubToken: unsubscribeToken(adminId), idempotencyKey: null,
      })
      sent.push(r.ok ? email : `${email} failed: ${r.error}`)
    }
    return out('preview', sent.join('; ') || 'no admin with a confirmed email')
  }

  if (existing?.status === 'sent') return out('rebuilt', introInfo)
  if (ctx.mode === 'off') return out('built', `RECAP_SEND_MODE=off. ${introInfo}`)
  if (ctx.mode === 'admin' && (!league.owner_id || !ctx.admins.has(league.owner_id))) {
    return out('built', `admin-only mode, owner is not a site admin. ${introInfo}`)
  }

  // ── The commissioner ──
  let ownerNote: string
  let ownerEmail: string | null = null
  let anySent = false
  if (!league.owner_id) ownerNote = 'league has no owner'
  else {
    const recipient = await eligibleRecipient(db, league.owner_id)
    if (!recipient.ok) ownerNote = `owner not sent: ${recipient.reason}`
    else {
      ownerEmail = recipient.email
      // Claim the send first. The unique (recap_id, user_id) constraint is
      // what makes a second run skip instead of emailing twice.
      const { error: claimErr } = await db
        .from('recap_sends')
        .insert({ recap_id: recapId, user_id: league.owner_id, email: recipient.email, status: 'pending' })
      if (claimErr) {
        ownerNote = claimErr.code === '23505' ? 'owner already sent' : `could not claim the owner send: ${claimErr.message}`
      } else {
        const result = await sendRecapEmail({
          facts, intro, subject, to: recipient.email, audience: 'owner',
          unsubToken: unsubscribeToken(league.owner_id),
          idempotencyKey: `recap-${recapId}-${league.owner_id}`,
        })
        await db
          .from('recap_sends')
          .update(sendUpdate(result))
          .eq('recap_id', recapId)
          .eq('user_id', league.owner_id)
        ownerNote = result.ok ? 'owner sent' : `owner send failed: ${result.error}`
        anySent ||= result.ok
      }
    }
  }

  // ── The league's mailing list ──
  const subs = await activeSubscribers(db, league.id)
  let subsSent = 0
  let subsFailed = 0
  for (const sub of subs) {
    if (sub.email === ownerEmail) continue
    const { data: suppressed } = await db.from('email_suppressions').select('reason').eq('email', sub.email).maybeSingle()
    if (suppressed && (suppressed.reason === 'bounce' || suppressed.reason === 'complaint')) continue
    const { error: claimErr } = await db
      .from('recap_sends')
      .insert({ recap_id: recapId, subscriber_id: sub.id, email: sub.email, status: 'pending' })
    if (claimErr) continue
    const result = await sendRecapEmail({
      facts, intro, subject, to: sub.email, audience: 'subscriber',
      unsubToken: subscriberToken(sub.id),
      idempotencyKey: `recap-${recapId}-sub-${sub.id}`,
    })
    await db.from('recap_sends').update(sendUpdate(result)).eq('recap_id', recapId).eq('subscriber_id', sub.id)
    if (result.ok) subsSent++
    else subsFailed++
  }
  anySent ||= subsSent > 0

  const listNote = subs.length ? `, list ${subsSent} sent${subsFailed ? `, ${subsFailed} failed` : ''}` : ''
  if (anySent) {
    await db.from('weekly_recaps').update({ status: 'sent', updated_at: new Date().toISOString() }).eq('id', recapId)
    return out('sent', `${ownerNote}${listNote}. ${introInfo}`)
  }
  return out(ownerNote.startsWith('owner send failed') ? 'send-failed' : 'built', `${ownerNote}${listNote}`)
}

function sendUpdate(result: { ok: true; id: string | null } | { ok: false; error: string }) {
  const now = new Date().toISOString()
  return result.ok
    ? { status: 'sent', resend_id: result.id, updated_at: now }
    : { status: 'failed', error: result.error.slice(0, 500), updated_at: now }
}

// ── On request ────────────────────────────────────────────────────────────

// An owner asking for their recap now, from the Current Season page. A
// league that signs up on a Wednesday shouldn't have to wait until the next
// Tuesday to see what it is paying for. This never touches weekly_recaps or
// recap_sends, so it can neither stand in for nor block the real Tuesday
// send; it is a copy, built fresh, sent to the person who asked.
export async function sendRecapNow(args: {
  leagueId: string
  userId: string
  year: number
  week: number
}): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  if (recapMode() === 'off') return { ok: false, error: 'Recap email is switched off right now. The page still works.' }
  const db = createAdminClient()
  const { data: league } = await db.from('leagues').select('id, owner_id').eq('id', args.leagueId).maybeSingle()
  if (!league) return { ok: false, error: 'League not found.' }

  const to = await confirmedEmail(db, args.userId)
  if (!to) return { ok: false, error: 'Confirm your email address first, then try again.' }
  // An explicit request outranks the "product email" toggle, but not a
  // bounce or a spam complaint: those addresses stay untouched.
  const { data: suppressed } = await db.from('email_suppressions').select('reason').eq('email', to).maybeSingle()
  if (suppressed && suppressed.reason !== 'unsubscribed') {
    return { ok: false, error: `We can't send to ${to} (${suppressed.reason}). Reach out through the support button.` }
  }

  const tier = recapTierFor(await getLockReason(league.id, league.owner_id))
  const built = await buildRecapFacts({ leagueId: league.id, year: args.year, week: args.week, tier })
  if (built.status === 'incomplete') return { ok: false, error: `Week ${args.week} isn't fully scored yet (${built.reason}).` }
  if (built.status !== 'ok') return { ok: false, error: `No week ${args.week} games on file yet. Sync the league, then try again.` }

  const facts = built.facts
  const r = await sendRecapEmail({
    facts,
    intro: templateIntro(facts),
    subject: recapSubject(facts),
    to,
    audience: 'owner',
    unsubToken: unsubscribeToken(args.userId),
    idempotencyKey: null,
  })
  return r.ok ? { ok: true, to } : { ok: false, error: 'The email did not go out. Try again in a minute.' }
}

// ── Recipients ────────────────────────────────────────────────────────────

async function confirmedEmail(db: Db, userId: string): Promise<string | null> {
  const { data } = await db.auth.admin.getUserById(userId)
  const user = data?.user
  if (!user?.email || !user.email_confirmed_at) return null
  return user.email.toLowerCase()
}

async function eligibleRecipient(db: Db, userId: string): Promise<{ ok: true; email: string } | { ok: false; reason: string }> {
  const { data } = await db.auth.admin.getUserById(userId)
  const user = data?.user
  if (!user?.email) return { ok: false, reason: 'owner has no email address' }
  if (!user.email_confirmed_at) return { ok: false, reason: 'owner email is unconfirmed' }
  // The /account toggle is "email me about new features". Someone who turned
  // that off did not ask for a weekly email either, so it counts here too.
  if (user.user_metadata?.marketing_opt_in === false) return { ok: false, reason: 'owner turned off product email' }
  const email = user.email.toLowerCase()
  const { data: suppressed } = await db.from('email_suppressions').select('reason').eq('email', email).maybeSingle()
  if (suppressed) return { ok: false, reason: `address suppressed (${suppressed.reason})` }
  return { ok: true, email }
}

// ── Resend ────────────────────────────────────────────────────────────────

async function sendRecapEmail(args: {
  facts: RecapFacts
  intro: string
  subject: string
  to: string
  audience: RecapAudience
  unsubToken: string | null
  idempotencyKey: string | null
}): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const token = args.unsubToken
  if (!token) return { ok: false, error: 'no RECAP_SIGNING_SECRET or CRON_SECRET to sign the unsubscribe link' }

  const { facts } = args
  const who = args.audience === 'owner' ? 'owner' : 'list'
  const { html, text } = renderRecapEmail(
    facts,
    args.intro,
    args.subject,
    {
      page: recapPageUrl(facts.league.slug, facts.year, facts.week, 'email', who),
      share: recapPageUrl(facts.league.slug, facts.year, facts.week, 'share'),
      unsubscribe: unsubscribePageUrl(token),
      account: `${SITE_URL}/account/`,
      pricing: `${SITE_URL}/pricing/?utm_source=recap&utm_medium=email`,
      newLeague: `${SITE_URL}/dashboard/new/?utm_source=recap&utm_medium=email&utm_campaign=new-league`,
      league: `${SITE_URL}/leagues/${facts.league.slug}/?utm_source=recap&utm_medium=email`,
      join: `${recapPageUrl(facts.league.slug, facts.year, facts.week, 'email', who)}#join`,
    },
    args.audience,
  )
  return sendViaResend({
    to: args.to,
    subject: args.subject,
    html,
    text,
    unsubToken: token,
    idempotencyKey: args.idempotencyKey,
    category: args.audience === 'owner' ? 'weekly_recap' : 'weekly_recap_list',
  })
}
