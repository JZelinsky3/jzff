// POST /api/review
// Body: { rating, best_part?, needs_work?, can_quote?, quote_name?, email?, source? }
//
// Backs the /review page linked from the end-of-testing email. Writes a row
// to site_reviews and best-effort emails a copy to the support inbox so a
// 2-star review lands somewhere Joey reads today rather than in a table he
// checks on Friday. Same shape as /api/support: the row is the durability
// guarantee, the email is the notification.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const REVIEW_TO = process.env.SUPPORT_EMAIL_TO ?? 'jzffgames@gmail.com'
const REVIEW_FROM = process.env.SUPPORT_EMAIL_FROM ?? 'TSC Support <onboarding@resend.dev>'

const schema = z.object({
  // Half-star steps only, matching the DB constraint and the star control.
  rating: z.number().min(1).max(5).refine((n) => (n * 2) % 1 === 0, 'Half stars only'),
  best_part: z.string().trim().max(3000).nullish(),
  needs_work: z.string().trim().max(3000).nullish(),
  can_quote: z.boolean().optional(),
  quote_name: z.string().trim().max(120).nullish(),
  email: z.email().trim().max(200).nullish(),
  source: z.string().trim().max(60).nullish(),
  // Honeypot — rendered off-screen, real users never fill it.
  hp: z.string().optional(),
})

// Per-IP throttle: 3 reviews per 10 minutes per warm instance. Best-effort on
// serverless (instances don't share the map) but it blunts a single loop.
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 3
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
  if (hits.size > 2000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k)
    }
  }
  return false
}

async function notify(input: z.infer<typeof schema>, email: string | null): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const lines = [
    `Rating:  ${input.rating.toFixed(1)} / 5`,
    `From:    ${email ?? 'anonymous'}`,
    `Quote:   ${input.can_quote ? `yes, as "${input.quote_name || 'unnamed'}"` : 'no'}`,
    `Source:  ${input.source ?? '(direct)'}`,
    '',
    'BEST PART',
    input.best_part || '(blank)',
    '',
    'NEEDS WORK',
    input.needs_work || '(blank)',
  ]
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: REVIEW_FROM,
        to: [REVIEW_TO],
        ...(email ? { reply_to: email } : {}),
        subject: `[TSC review] ${input.rating.toFixed(1)} stars${email ? ` from ${email}` : ''}`,
        text: lines.join('\n'),
      }),
    })
    if (!res.ok) {
      console.error('[review] Resend send failed:', res.status, await res.text().catch(() => ''))
    }
  } catch (err) {
    console.error('[review] Resend send threw:', err)
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
    return NextResponse.json({ ok: false, error: 'Pick a star rating and try again.' }, { status: 400 })
  }
  const input = parsed.data

  // Bots that stuff every field get a quiet success and no side effects.
  if (input.hp) return NextResponse.json({ ok: true })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (throttled(ip)) {
    return NextResponse.json(
      { ok: false, error: 'That went through already. Give it a few minutes.' },
      { status: 429 },
    )
  }

  // Prefer the signed-in identity over whatever was typed in the form — the
  // email link may be forwarded, and the account email is the one we trust.
  let userId: string | null = null
  let email: string | null = input.email ?? null
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id ?? null
    if (user?.email) email = user.email
  } catch { /* anonymous */ }

  await notify(input, email)

  const db = createAdminClient()
  const { error } = await db.from('site_reviews').insert({
    user_id: userId,
    email,
    rating: input.rating,
    best_part: input.best_part ?? null,
    needs_work: input.needs_work ?? null,
    can_quote: input.can_quote ?? false,
    quote_name: input.quote_name ?? null,
    source: input.source ?? null,
    user_agent: req.headers.get('user-agent'),
  })
  if (error) {
    console.error('[review] insert failed:', error)
    return NextResponse.json(
      { ok: false, error: 'Could not save that right now. Try again shortly.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
