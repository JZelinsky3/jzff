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

import { createAdminClient } from '@/lib/supabase/admin'
import { getLockReason } from '@/lib/leagueTier'
import { getNflClock, weekIsFinal } from '@/lib/nflClock'
import { buildRecapFacts, recapTierFor, RECAP_FACTS_VERSION, type RecapFacts } from './facts'
import { recapSubject, writeIntro } from './intro'
import { renderRecapEmail } from './email'
import { SITE_URL, recapPageUrl, unsubscribeApiUrl, unsubscribePageUrl, unsubscribeToken } from './links'

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
      const r = await sendRecapEmail({ facts, intro, subject: `[Preview] ${subject}`, userId: adminId, to: email, idempotencyKey: null })
      sent.push(r.ok ? email : `${email} failed: ${r.error}`)
    }
    return out('preview', sent.join('; ') || 'no admin with a confirmed email')
  }

  if (existing?.status === 'sent') return out('rebuilt', introInfo)
  if (ctx.mode === 'off') return out('built', `RECAP_SEND_MODE=off. ${introInfo}`)
  if (!league.owner_id) return out('built', 'league has no owner')
  if (ctx.mode === 'admin' && !ctx.admins.has(league.owner_id)) {
    return out('built', `admin-only mode, owner is not a site admin. ${introInfo}`)
  }

  const recipient = await eligibleRecipient(db, league.owner_id)
  if (!recipient.ok) return out('built', `not sent: ${recipient.reason}`)

  // Claim the send first. The unique (recap_id, user_id) constraint is what
  // makes a second run skip instead of emailing twice.
  const { error: claimErr } = await db
    .from('recap_sends')
    .insert({ recap_id: recapId, user_id: league.owner_id, email: recipient.email, status: 'pending' })
  if (claimErr) {
    if (claimErr.code === '23505') return out('already-sent')
    return out('error', `could not claim the send: ${claimErr.message}`)
  }

  const result = await sendRecapEmail({
    facts, intro, subject, userId: league.owner_id, to: recipient.email,
    idempotencyKey: `recap-${recapId}-${league.owner_id}`,
  })
  const now = new Date().toISOString()
  await db
    .from('recap_sends')
    .update(result.ok
      ? { status: 'sent', resend_id: result.id, updated_at: now }
      : { status: 'failed', error: result.error.slice(0, 500), updated_at: now })
    .eq('recap_id', recapId)
    .eq('user_id', league.owner_id)
  if (!result.ok) return out('send-failed', result.error)

  await db.from('weekly_recaps').update({ status: 'sent', updated_at: now }).eq('id', recapId)
  return out('sent', introInfo)
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
  userId: string
  to: string
  idempotencyKey: string | null
}): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { ok: false, error: 'RESEND_API_KEY is not set' }

  // The August broadcast went to spam because it was sent from Resend's
  // shared sandbox address. The domain's DMARC policy is p=quarantine, so
  // anything not from our own domain is spam-foldered on our own orders.
  const from = process.env.RECAP_EMAIL_FROM || 'The Sunday Chronicle <recap@thesundaychronicle.app>'
  if (!/@thesundaychronicle\.app>?\s*$/i.test(from)) {
    return { ok: false, error: `RECAP_EMAIL_FROM must be an @thesundaychronicle.app address, got "${from}"` }
  }

  const token = unsubscribeToken(args.userId)
  if (!token) return { ok: false, error: 'no RECAP_SIGNING_SECRET or CRON_SECRET to sign the unsubscribe link' }

  const { facts } = args
  const { html, text } = renderRecapEmail(facts, args.intro, args.subject, {
    page: recapPageUrl(facts.league.slug, facts.year, facts.week, 'email'),
    share: recapPageUrl(facts.league.slug, facts.year, facts.week, 'share'),
    unsubscribe: unsubscribePageUrl(token),
    account: `${SITE_URL}/account/`,
    pricing: `${SITE_URL}/pricing/?utm_source=recap&utm_medium=email`,
    newLeague: `${SITE_URL}/?utm_source=recap&utm_medium=email&utm_campaign=new-league`,
  })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(args.idempotencyKey ? { 'Idempotency-Key': args.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      html,
      text,
      ...(process.env.RECAP_REPLY_TO ? { reply_to: process.env.RECAP_REPLY_TO } : {}),
      // One-click unsubscribe (RFC 8058). Gmail and Yahoo show their own
      // unsubscribe button off these, which is far better for the domain's
      // reputation than a reader reaching for "report spam".
      headers: {
        'List-Unsubscribe': `<${unsubscribeApiUrl(token)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      tags: [{ name: 'category', value: 'weekly_recap' }],
    }),
    cache: 'no-store',
  })
  if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}` }
  const data = (await res.json().catch(() => null)) as { id?: string } | null
  return { ok: true, id: data?.id ?? null }
}
