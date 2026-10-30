// /api/games/pack-empire/mega
//
//   GET  ?id=&key=                          -> { view }
//   POST { action: 'create', name, key, cpu?, friend? } -> { id }
//                                           (cpu = true seats the CPU and starts at once;
//                                            friend = a friendship id, signed in, holds the seat)
//   POST { action: 'join', id, name, key }  -> { view }
//   POST { action: 'pick', id, player, key } -> { view }
//   POST { action: 'cpu', id, key }         -> { view }   (the CPU's pick, if it's on the clock)
//
// Both seats can be signed out: a seat is the account, or else a random key
// the browser keeps (stored here only as a hash). The room polls GET while
// the draft is live; a pick is checked and written by the server, never by
// the browser.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cpuPickMega, createMega, getMega, joinMega, pickMega } from '@/lib/packEmpire/mega'

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
  const id = (req.nextUrl.searchParams.get('id') ?? '').toUpperCase()
  const view = await getMega(id, await viewer(), req.nextUrl.searchParams.get('key'))
  if (!view) return reply({ ok: false, error: 'No draft with that code.' }, 404)
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
      const out = await createMega(userId, body.name, body.key, {
        cpu: body.cpu === true,
        friend: body.friend ?? undefined,
      })
      return out.ok ? reply(out) : reply(out, out.status ?? 400)
    }
    case 'join': {
      const out = await joinMega(id, userId, body.name, body.key)
      return out.ok ? reply(out) : reply(out, out.status ?? 400)
    }
    case 'pick': {
      const out = await pickMega(id, userId, body.key, body.player)
      return out.ok ? reply(out) : reply(out, out.status ?? 400)
    }
    case 'cpu': {
      const out = await cpuPickMega(id, userId, body.key)
      return out.ok ? reply(out) : reply(out, out.status ?? 400)
    }
    default:
      return reply({ ok: false, error: 'Unknown action.' }, 400)
  }
}
