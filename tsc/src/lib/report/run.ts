// The Progress Report send: on the Thursday after a report week, email each
// league's report to its commissioner and its mailing list. Driven by
// /api/cron/reports from .github/workflows/cron.yml.
//
// The same rails as the Tuesday recap (lib/recap/run.ts), in the same order:
//  1. No NFL clock, no reports. The week is the one that just finished, and
//     it must be a report week (REPORT_WEEKS) and final.
//  2. The league's report has to be built through that week: every game
//     settled. A league that isn't is skipped as 'held', and a later run
//     (the afternoon pass, or a hand dispatch) picks it up.
//  3. RECAP_SEND_MODE gates this email too: off, admin, all.
//  4. Recipients are the recap's: a confirmed owner who hasn't unsubscribed
//     or turned off product email, then the mailing list. One unsubscribe
//     stops both emails.
//  5. Each (league, year, week, recipient) is claimed in report_sends before
//     Resend is called, so an edition reaches an address at most once.

import { createAdminClient } from '@/lib/supabase/admin'
import { getNflClock, weekIsFinal } from '@/lib/nflClock'
import { confirmedEmail, eligibleRecipient, recapMode, type Db, type RecapMode } from '@/lib/recap/run'
import { SITE_URL, recapPageUrl, subscriberToken, unsubscribePageUrl, unsubscribeToken } from '@/lib/recap/links'
import { sendViaResend } from '@/lib/recap/resend'
import { activeSubscribers } from '@/lib/recap/subscribers'
import { loadReport, REPORT_WEEKS, type ReportView } from './build'
import { renderReportEmail, reportSubject, type ReportAudience } from './email'

export type ReportRunOptions = {
  startedAt: number
  // Build and report, send nothing.
  dry?: boolean
  // Only this league.
  slug?: string | null
  // Email this league's report to the site admins only, marked [Preview].
  preview?: boolean
  // A different report week, for dry runs and previews only. A real send is
  // always the week that just finished.
  week?: number | null
  offset?: number
}

export type ReportLeagueResult = { slug: string; outcome: string; detail?: string }

export type ReportRunReport =
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
      results: ReportLeagueResult[]
    }

// Each league rebuilds its report (a sim per week so far), a second or two.
const START_BUDGET_MS = 200_000

type League = { id: string; slug: string; name: string; owner_id: string | null; published_at: string | null }

export function reportPageUrl(slug: string, week: number, medium: 'email' | 'share', who?: 'owner' | 'list'): string {
  return `${SITE_URL}/leagues/${slug}/report/${week}/?utm_source=report&utm_medium=${medium}&utm_campaign=w${week}${who ? `&utm_content=${who}` : ''}`
}

export async function runReports(opts: ReportRunOptions): Promise<ReportRunReport> {
  const db = createAdminClient()
  const mode = recapMode()
  const dry = !!opts.dry
  const sending = !dry && !opts.preview

  const clock = await getNflClock()
  if (!clock) return { ok: false, error: 'NFL clock unavailable. Not sending reports blind.' }
  const empty = (note: string, week: number | null = null): ReportRunReport => ({
    ok: true, year: clock.season, week, mode, dry, done: true, nextOffset: null, note, results: [],
  })

  const year = clock.season
  let week: number
  if (opts.week && !sending) week = opts.week
  else {
    if (clock.seasonType !== 'regular') return empty(`NFL season type is ${clock.seasonType}`)
    week = clock.week - 1
  }
  if (!REPORT_WEEKS.includes(week)) return empty(`week ${week} is not a report week (${REPORT_WEEKS.join(', ')})`, week)
  if (!weekIsFinal(year, week, clock)) return empty(`week ${week} is not final`, week)

  if (sending) {
    const probe = await db.from('report_sends').select('id').limit(1)
    if (probe.error) return { ok: false, error: `report_sends is not readable (${probe.error.message}). Apply migration 0080_report_sends.sql.` }
  }

  const { data: live } = await db.from('seasons').select('league_id').eq('year', year).eq('is_live', true)
  const ids = [...new Set((live ?? []).map((s) => s.league_id as string))]
  if (!ids.length) return empty('no live seasons', week)

  let query = db.from('leagues').select('id, slug, name, owner_id, published_at').in('id', ids).order('id', { ascending: true })
  if (opts.slug) query = query.eq('slug', opts.slug)
  const leagues = ((await query).data ?? []) as League[]

  const { data: adminRows } = await db.from('site_admins').select('user_id')
  const admins = new Set((adminRows ?? []).map((a) => a.user_id as string))

  const offset = Math.max(0, opts.offset ?? 0)
  let cursor = offset
  const results: ReportLeagueResult[] = []
  for (const league of leagues.slice(offset)) {
    if (Date.now() - opts.startedAt > START_BUDGET_MS) break
    cursor++
    try {
      results.push(await runLeague(db, league, { year, week, mode, dry, preview: !!opts.preview, admins }))
    } catch (e) {
      results.push({ slug: league.slug, outcome: 'error', detail: (e as Error).message.slice(0, 300) })
    }
  }
  const done = cursor >= leagues.length
  return { ok: true, year, week, mode, dry, done, nextOffset: done ? null : cursor, results }
}

// The edition for this league and week, or why there isn't one.
async function editionFor(league: League, week: number): Promise<{ ok: true; view: ReportView } | { ok: false; outcome: string; detail?: string }> {
  const r = await loadReport(league, week)
  if (r.status === 'none') return { ok: false, outcome: 'no-season' }
  if (r.status === 'pending') return { ok: false, outcome: 'held', detail: `week ${week} not settled yet` }
  if (!r.view.editions.includes(week)) return { ok: false, outcome: 'no-report', detail: `regular season ends week ${r.view.lastRegularWeek}` }
  if (r.view.week !== week) return { ok: false, outcome: 'held', detail: `week ${week} not settled yet (latest report is week ${r.view.week})` }
  return { ok: true, view: r.view }
}

async function runLeague(
  db: Db,
  league: League,
  ctx: { year: number; week: number; mode: RecapMode; dry: boolean; preview: boolean; admins: Set<string> },
): Promise<ReportLeagueResult> {
  const out = (outcome: string, detail?: string): ReportLeagueResult => ({ slug: league.slug, outcome, ...(detail ? { detail } : {}) })
  // Unpublished almanacs are hidden, and so is their report page.
  if (!league.published_at) return out('unpublished')

  const ed = await editionFor(league, ctx.week)
  if (!ed.ok) return out(ed.outcome, ed.detail)
  const v = ed.view
  if (v.year !== ctx.year) return out('no-season', `live season is ${v.year}`)
  const paid = v.tier !== 'free'
  const subject = reportSubject(v, paid)
  const info = `${v.tier} tier, report ${v.edition} of ${v.editions.length}`

  if (ctx.dry) return out('dry-run', `${subject} | ${info}`)

  if (ctx.preview) {
    const sent: string[] = []
    for (const adminId of ctx.admins) {
      const email = await confirmedEmail(db, adminId)
      if (!email) continue
      const r = await sendReportEmail({ view: v, paid, subject: `[Preview] ${subject}`, to: email, audience: 'owner', unsubToken: unsubscribeToken(adminId), idempotencyKey: null })
      sent.push(r.ok ? email : `${email} failed: ${r.error}`)
    }
    return out('preview', sent.join('; ') || 'no admin with a confirmed email')
  }

  if (ctx.mode === 'off') return out('built', `RECAP_SEND_MODE=off. ${info}`)
  if (ctx.mode === 'admin' && (!league.owner_id || !ctx.admins.has(league.owner_id))) return out('built', `admin-only mode, owner is not a site admin. ${info}`)

  const key = { league_id: league.id, season_year: ctx.year, week: ctx.week }
  const claim = (row: Record<string, unknown>) => db.from('report_sends').insert({ ...key, ...row, status: 'pending' })

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
      const { error: claimErr } = await claim({ user_id: league.owner_id, email: recipient.email })
      if (claimErr) ownerNote = claimErr.code === '23505' ? 'owner already sent' : `could not claim the owner send: ${claimErr.message}`
      else {
        const result = await sendReportEmail({
          view: v, paid, subject, to: recipient.email, audience: 'owner',
          unsubToken: unsubscribeToken(league.owner_id),
          idempotencyKey: `report-${league.id}-${ctx.year}-${ctx.week}-${league.owner_id}`,
        })
        await db.from('report_sends').update(sendUpdate(result)).match({ ...key, user_id: league.owner_id })
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
    const { error: claimErr } = await claim({ subscriber_id: sub.id, email: sub.email })
    if (claimErr) continue
    const result = await sendReportEmail({
      view: v, paid, subject, to: sub.email, audience: 'subscriber',
      unsubToken: subscriberToken(sub.id),
      idempotencyKey: `report-${league.id}-${ctx.year}-${ctx.week}-sub-${sub.id}`,
    })
    await db.from('report_sends').update(sendUpdate(result)).match({ ...key, subscriber_id: sub.id })
    if (result.ok) subsSent++
    else subsFailed++
  }
  anySent ||= subsSent > 0

  const listNote = subs.length ? `, list ${subsSent} sent${subsFailed ? `, ${subsFailed} failed` : ''}` : ''
  if (anySent) return out('sent', `${ownerNote}${listNote}. ${info}`)
  return out(ownerNote.startsWith('owner send failed') ? 'send-failed' : 'built', `${ownerNote}${listNote}`)
}

function sendUpdate(result: { ok: true; id: string | null } | { ok: false; error: string }) {
  const now = new Date().toISOString()
  return result.ok
    ? { status: 'sent', resend_id: result.id, updated_at: now }
    : { status: 'failed', error: result.error.slice(0, 500), updated_at: now }
}

function linksFor(v: ReportView, audience: ReportAudience, token: string) {
  const who = audience === 'owner' ? 'owner' : 'list'
  return {
    page: reportPageUrl(v.league.slug, v.week, 'email', who),
    share: reportPageUrl(v.league.slug, v.week, 'share'),
    unsubscribe: unsubscribePageUrl(token),
    account: `${SITE_URL}/account/`,
    pricing: `${SITE_URL}/pricing/?utm_source=report&utm_medium=email`,
    league: `${SITE_URL}/leagues/${v.league.slug}/?utm_source=report&utm_medium=email`,
    join: `${recapPageUrl(v.league.slug, v.year, v.week, 'email', who)}#join`,
  }
}

async function sendReportEmail(args: {
  view: ReportView
  paid: boolean
  subject: string
  to: string
  audience: ReportAudience
  unsubToken: string | null
  idempotencyKey: string | null
}): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const token = args.unsubToken
  if (!token) return { ok: false, error: 'no RECAP_SIGNING_SECRET or CRON_SECRET to sign the unsubscribe link' }
  const { html, text } = renderReportEmail(args.view, args.subject, linksFor(args.view, args.audience, token), args.audience, args.paid)
  return sendViaResend({
    to: args.to,
    subject: args.subject,
    html,
    text,
    unsubToken: token,
    idempotencyKey: args.idempotencyKey,
    category: args.audience === 'owner' ? 'progress_report' : 'progress_report_list',
  })
}

// The email as it would go out, for a site admin's browser. Sends nothing.
export async function previewReportHtml(slug: string, week: number, audience: ReportAudience): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  const db = createAdminClient()
  const { data } = await db.from('leagues').select('id, slug, name, owner_id, published_at').eq('slug', slug).maybeSingle()
  if (!data) return { ok: false, error: 'no such league' }
  const ed = await editionFor(data as League, week)
  if (!ed.ok) return { ok: false, error: `${ed.outcome}${ed.detail ? `: ${ed.detail}` : ''}` }
  const paid = ed.view.tier !== 'free'
  const { html } = renderReportEmail(ed.view, reportSubject(ed.view, paid), linksFor(ed.view, audience, 'preview'), audience, paid)
  return { ok: true, html }
}
