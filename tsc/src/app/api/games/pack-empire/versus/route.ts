// /api/games/pack-empire/versus
//
//   GET  ?id=&key=                         -> { view }
//   POST { action: 'create' }              -> { id }          (signed in)
//   POST { action: 'join', id, name, key } -> { view }
//   POST { action: 'start', id, captain, key } -> { seed }
//   POST { action: 'submit', id, picks, key }  -> { view }
//
// `key` is a signed-out challenger's seat key, kept in their browser. The
// packs themselves are dealt by /api/games/pack-empire/deal off the seat's
// seed, exactly like an Empire Builder run; this route only issues the seed
// and re-scores the finished lineup.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createVersus,
  getVersus,
  joinVersus,
  startVersusSeat,
  submitVersusSeat,
} from '@/lib/packEmpire/versus'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

async function viewer() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? ''
  const key = req.nextUrl.searchParams.get('key')
  const view = await getVersus(id, await viewer(), key)
  if (!view) return reply({ ok: false, error: 'No such challenge.' }, 404)
  return reply({ ok: true, view })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return reply({ ok: false, error: 'Malformed request.' }, 400)
  }
  const userId = await viewer()
  const id = typeof body.id === 'string' ? body.id.trim().toUpperCase() : ''

  switch (body.action) {
    case 'create': {
      if (!userId) return reply({ ok: false, needsAuth: true, error: 'Sign in to start a challenge.' }, 401)
      const out = await createVersus(userId)
      return out.ok ? reply(out) : reply(out, out.status ?? 400)
    }
    case 'join': {
      const out = await joinVersus(id, userId, body.name, body.key)
      return out.ok ? reply(out) : reply(out, out.status ?? 400)
    }
    case 'start': {
      const out = await startVersusSeat(id, userId, body.key, body.captain)
      return out.ok ? reply(out) : reply(out, out.status ?? 400)
    }
    case 'submit': {
      const out = await submitVersusSeat(id, userId, body.key, body.picks)
      return out.ok ? reply(out) : reply(out, out.status ?? 400)
    }
    default:
      return reply({ ok: false, error: 'Unknown action.' }, 400)
  }
}
