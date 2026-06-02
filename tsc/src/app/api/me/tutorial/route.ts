// POST /api/me/tutorial   { action: 'dismiss' | 'reset', key?: string }
// Tracks whether a signed-in user has dismissed (or completed) the onboarding
// tour for a given surface. We store it on auth.users.user_metadata so it
// follows the user across devices without needing a new table.
//
// `key` defaults to 'leagues' (the public-almanac tour). Future tours can use
// their own key (e.g. 'dashboard', 'setup').
//
// Anonymous visitors don't hit this route — the tutorial.js client falls back
// to localStorage for them.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const Body = z.object({
  action: z.enum(['dismiss', 'reset']),
  key: z.string().min(1).max(64).optional(),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  const { action } = parsed.data
  const key = parsed.data.key ?? 'leagues'

  const existing = (user.user_metadata?.tutorials ?? {}) as Record<string, string | null>
  const next: Record<string, string | null> = { ...existing }
  if (action === 'dismiss') {
    next[key] = new Date().toISOString()
  } else {
    delete next[key]
  }

  const { error } = await supabase.auth.updateUser({ data: { tutorials: next } })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
