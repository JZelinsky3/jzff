// /api/friends
//
//   GET                                   -> { state }
//   POST { action: 'add', code, via? }    -> { state, message }  a member code; via 'league' off a suggestion
//   POST { action: 'versus', id }         -> { state, message }  the other seat of a Versus challenge
//   POST { action: 'invite', token }      -> { name }            accepting someone's invite link
//   POST { action: 'accept', id }         -> { state }
//   POST { action: 'remove', id }         -> { state }           decline, cancel and unfriend
//   POST { action: 'reset-link' }         -> { state }
//
// Every action needs an account. Ids here are friendship ids, never user ids.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  acceptInvite,
  acceptRequest,
  friendsState,
  removeFriendship,
  requestByCode,
  requestOpponent,
  resetInvite,
} from '@/lib/friends'
import { versusOpponent } from '@/lib/packEmpire/versus'

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

export async function GET() {
  const userId = await viewer()
  if (!userId) return reply({ ok: false, needsAuth: true, error: 'Sign in to see your friends.' }, 401)
  return reply({ ok: true, state: await friendsState(userId) })
}

export async function POST(req: NextRequest) {
  const userId = await viewer()
  if (!userId) return reply({ ok: false, needsAuth: true, error: 'Sign in first.' }, 401)
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return reply({ ok: false, error: 'Malformed request.' }, 400)
  }

  const after = async (out: { ok: true; message?: string } | { ok: false; error: string; status?: number }) =>
    out.ok
      ? reply({ ok: true, message: out.message ?? null, state: await friendsState(userId) })
      : reply(out, out.status ?? 400)

  switch (body.action) {
    case 'add':
      return after(await requestByCode(userId, body.code, body.via))
    case 'versus':
      return after(await requestOpponent(userId, await versusOpponent(body.id, userId)))
    case 'invite': {
      const out = await acceptInvite(userId, body.token)
      return out.ok ? reply(out) : reply(out, out.status ?? 400)
    }
    case 'accept':
      return after(await acceptRequest(userId, body.id))
    case 'remove':
      return after(await removeFriendship(userId, body.id))
    case 'reset-link':
      await resetInvite(userId)
      return after({ ok: true })
    default:
      return reply({ ok: false, error: 'Unknown action.' }, 400)
  }
}
