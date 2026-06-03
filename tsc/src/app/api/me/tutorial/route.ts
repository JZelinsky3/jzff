// POST /api/me/tutorial   { action, key?, page? }
//
// Tracks the signed-in user's onboarding-tour state for a given surface. We
// keep it on auth.users.user_metadata so it follows the user across devices
// without needing a new table.
//
// Shape stored under user_metadata.tutorials:
//   {
//     leagues:        '<ISO timestamp>' | null,   // global dismissal
//     leagues_seen:   string[],                   // per-page completion
//   }
//
// Actions:
//   • dismiss   → set `<key>` to now() (suppresses every page tour).
//   • reset     → clear both `<key>` and `<key>_seen` (used by "Replay tour").
//   • seen      → append the given `page` to `<key>_seen` (idempotent).
//
// `key` defaults to 'leagues' (the public-almanac tour). Future tours can
// use their own key (e.g. 'dashboard', 'setup').
//
// Anonymous visitors don't hit this route — tutorial.js falls back to
// localStorage for them.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const Body = z.object({
  action: z.enum(['dismiss', 'reset', 'seen']),
  key: z.string().min(1).max(64).optional(),
  page: z.string().min(1).max(64).optional(),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  const { action } = parsed.data
  const key = parsed.data.key ?? 'leagues'
  const seenKey = key + '_seen'

  const existing = (user.user_metadata?.tutorials ?? {}) as Record<string, unknown>
  const next: Record<string, unknown> = { ...existing }

  if (action === 'dismiss') {
    next[key] = new Date().toISOString()
  } else if (action === 'reset') {
    delete next[key]
    delete next[seenKey]
  } else { // 'seen'
    if (!parsed.data.page) {
      return NextResponse.json({ error: 'page required for seen action.' }, { status: 400 })
    }
    const seen = Array.isArray(existing[seenKey]) ? (existing[seenKey] as string[]).slice() : []
    if (!seen.includes(parsed.data.page)) seen.push(parsed.data.page)
    next[seenKey] = seen
  }

  const { error } = await supabase.auth.updateUser({ data: { tutorials: next } })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
