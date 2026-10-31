// /api/games/pack-empire/daily
//
//   GET  ?v=range|season                        -> { state }
//   POST { action: 'start', version, captain }  -> { state }
//   POST { action: 'pick', version, id }        -> { state }
//
// A run lives on the server (see lib/packEmpire/daily.ts), so these only ever
// move it forward: there's no way to ask for a pack but the one you're on.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { dailyState, isDailyVersion, pickDaily, startDaily } from '@/lib/packEmpire/daily'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

async function viewer() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function GET(req: NextRequest) {
  const version = req.nextUrl.searchParams.get('v')
  if (!isDailyVersion(version)) return reply({ ok: false, error: 'No such Daily.' }, 400)
  return reply({ ok: true, state: await dailyState(await viewer(), version) })
}

export async function POST(req: NextRequest) {
  const userId = await viewer()
  if (!userId) return reply({ ok: false, needsAuth: true, error: 'Sign in to play the Daily.' }, 401)
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return reply({ ok: false, error: 'Malformed request.' }, 400)
  }
  if (!isDailyVersion(body.version)) return reply({ ok: false, error: 'No such Daily.' }, 400)

  const out =
    body.action === 'start'
      ? await startDaily(userId, body.version, body.captain)
      : body.action === 'pick'
        ? await pickDaily(userId, body.version, body.id)
        : { ok: false as const, error: 'Unknown action.' }
  return out.ok ? reply(out) : reply(out, ('status' in out ? out.status : undefined) ?? 400)
}
