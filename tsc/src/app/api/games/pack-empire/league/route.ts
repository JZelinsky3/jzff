// /api/games/pack-empire/league
//
//   GET  ?id=&draft=1          -> { view } (the league, or your week's draft)
//   POST { action, id, ... }   -> see below
//
// Everything needs an account: a season is eight weeks of coming back, and a
// team has to be somebody. The browser never touches the tables; every
// action is checked here (are you in this league, is it your turn to draft,
// are you the commissioner) and written with the service role.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  advanceWeek,
  beginDraft,
  createLeague,
  deleteLeague,
  getDraft,
  joinLeague,
  leagueView,
  leaveLeague,
  lockPlayer,
  newSeason,
  openLeaguePack,
  pickLeagueCard,
  renameTeam,
  startSeason,
  submitLeagueDraft,
} from '@/lib/packEmpire/league'

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

type Out = { ok: true } | { ok: false; error: string; status?: number }

function send(out: Out & Record<string, unknown>) {
  return out.ok ? reply(out) : reply(out, out.status ?? 400)
}

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get('id') ?? '').toUpperCase()
  const userId = await viewer()
  if (req.nextUrl.searchParams.get('draft')) {
    if (!userId) return reply({ ok: false, needsAuth: true, error: 'Sign in.' }, 401)
    return send(await getDraft(id, userId))
  }
  const view = await leagueView(id, userId)
  if (!view) return reply({ ok: false, error: 'No such league.' }, 404)
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
  if (!userId) return reply({ ok: false, needsAuth: true, error: 'Sign in to play League Mode.' }, 401)
  const id = typeof body.id === 'string' ? body.id.trim().toUpperCase() : ''

  switch (body.action) {
    case 'create':
      return send(
        await createLeague(userId, {
          name: body.name,
          visibility: body.visibility,
          maxPlayers: body.maxPlayers,
          playoffSize: body.playoffSize,
        })
      )
    case 'join':
      return send(await joinLeague(userId, { id: body.id, code: body.code }))
    case 'leave':
      return send(await leaveLeague(id, userId))
    case 'rename':
      return send(await renameTeam(id, userId, body.teamName))
    case 'start':
      return send(await startSeason(id, userId))
    case 'advance':
      return send(await advanceWeek(id, userId))
    case 'new-season':
      return send(await newSeason(id, userId))
    case 'delete':
      return send(await deleteLeague(id, userId))
    case 'begin':
      return send(await beginDraft(id, userId, body.boostSlot))
    case 'open':
      return send(await openLeaguePack(id, userId, body.slot))
    case 'pick':
      return send(await pickLeagueCard(id, userId, body.card))
    case 'submit':
      return send(await submitLeagueDraft(id, userId))
    case 'lock':
      return send(await lockPlayer(id, userId, body.player))
    default:
      return reply({ ok: false, error: 'Unknown action.' }, 400)
  }
}
