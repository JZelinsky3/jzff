// Support desk endpoint for the floating Support widget (public almanac
// pages + /league management pages). Two-step delivery:
//   1. Insert the note into support_requests (admin client, never fails open).
//   2. Best-effort email a copy to the support inbox via Resend. A missing
//      key or provider outage downgrades to "stored only" — the reporter
//      still gets a success, the row still exists, `emailed` records which
//      path happened.
//
// Anti-abuse: honeypot field (bots that fill every input get a fake 200),
// per-IP in-memory throttle (best-effort on serverless — instances don't
// share the map, but it still blunts a single warm-instance loop), and
// strict zod length caps so nobody stores a novel.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const SUPPORT_TO = process.env.SUPPORT_EMAIL_TO ?? 'jzffgames@gmail.com'
// Resend's shared onboarding sender works without a verified domain, but can
// only deliver to the address that owns the Resend account. Swap in a
// verified-domain sender (e.g. support@thesundaychronicle.com) once one exists.
const SUPPORT_FROM = process.env.SUPPORT_EMAIL_FROM ?? 'TSC Support <onboarding@resend.dev>'

const TOPIC_LABELS: Record<string, string> = {
  bug: 'Bug report',
  suggestion: 'Suggestion',
  feedback: 'Feedback',
  question: 'Question',
  billing: 'Billing',
  other: 'Other',
}

const schema = z.object({
  email: z.email().trim().max(200),
  topic: z.enum(['bug', 'suggestion', 'feedback', 'question', 'billing', 'other']),
  subject: z.string().trim().min(1).max(150),
  message: z.string().trim().min(1).max(5000),
  league_slug: z.string().trim().max(120).nullish(),
  page_url: z.string().trim().max(600).nullish(),
  // Honeypot — rendered off-screen, real users never fill it.
  hp: z.string().optional(),
})

// Per-IP throttle: 5 notes per 10 minutes per warm instance.
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 5
const hits = new Map<string, number[]>()
function throttled(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent)
    return true
  }
  recent.push(now)
  hits.set(ip, recent)
  // Cheap leak guard — the map only ever holds recent senders.
  if (hits.size > 2000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k)
    }
  }
  return false
}

async function sendEmail(input: z.infer<typeof schema>, opts: {
  userId: string | null
  userAgent: string | null
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) return false
  const topicLabel = TOPIC_LABELS[input.topic] ?? input.topic
  const lines = [
    `Topic:   ${topicLabel}`,
    `From:    ${input.email}`,
    `League:  ${input.league_slug ?? '(none)'}`,
    `Page:    ${input.page_url ?? '(unknown)'}`,
    `User:    ${opts.userId ?? 'anonymous'}`,
    `Agent:   ${opts.userAgent ?? '(unknown)'}`,
    '',
    input.message,
  ]
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: SUPPORT_FROM,
        to: [SUPPORT_TO],
        reply_to: input.email,
        subject: `[TSC ${topicLabel}] ${input.subject}`,
        text: lines.join('\n'),
      }),
    })
    if (!res.ok) {
      console.error('[support] Resend send failed:', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (err) {
    console.error('[support] Resend send threw:', err)
    return false
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Check the form and try again.' }, { status: 400 })
  }
  const input = parsed.data

  // Bots that stuff every field get a quiet success and no side effects.
  if (input.hp) return NextResponse.json({ ok: true })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (throttled(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Too many notes in a row. Give it a few minutes.' },
      { status: 429 },
    )
  }

  // Attach the signed-in user when there is one; anonymous is fine too.
  let userId: string | null = null
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id ?? null
  } catch { /* anonymous */ }

  const userAgent = req.headers.get('user-agent')
  const emailed = await sendEmail(input, { userId, userAgent })

  const db = createAdminClient()
  const { error } = await db.from('support_requests').insert({
    email: input.email,
    topic: input.topic,
    subject: input.subject,
    message: input.message,
    league_slug: input.league_slug ?? null,
    page_url: input.page_url ?? null,
    user_id: userId,
    user_agent: userAgent,
    emailed,
  })
  if (error && !emailed) {
    // Neither delivery path worked — this is the only true failure.
    console.error('[support] insert failed with no email fallback:', error)
    return NextResponse.json(
      { ok: false, error: 'Could not send right now. Try again shortly.' },
      { status: 500 },
    )
  }
  if (error) console.error('[support] insert failed (email did go out):', error)

  return NextResponse.json({ ok: true })
}
