// POST /api/games/pack-empire/deal
//
//   { action: 'start', captain }        -> { seed }
//   { action: 'pack', seed, slot, taken } -> { cards }
//
// Empire Builder and Versus Challenge both draft through here. 'start' is the
// commitment: the captain is signed into the seed, so it can't be swapped
// once a pack has been seen. 'pack' deals one slot's five cards; it is pure,
// so asking twice returns the same pack and a refresh rerolls nothing.
//
// No account needed. Nothing is written; a run only reaches the board through
// /api/games/runs, which re-deals the whole thing from the seed.

import { NextResponse, type NextRequest } from 'next/server'
import { newCaptainSeed, readCaptainSeed } from '@/lib/packEmpire/deal'
import { soloPack } from '@/lib/packEmpire/solo'
import { SLOT_COUNT } from '@/lib/packEmpire/rules'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return bad('Malformed request.')
  }

  if (body.action === 'start') {
    const captain = body.captain
    if (!Number.isInteger(captain) || (captain as number) < 0 || (captain as number) >= SLOT_COUNT) {
      return bad('Pick a captain first.')
    }
    return NextResponse.json({ ok: true, seed: newCaptainSeed(captain as number) }, { headers: NO_STORE })
  }

  if (body.action === 'pack') {
    const seed = typeof body.seed === 'string' ? body.seed.trim().toUpperCase() : ''
    const parsed = readCaptainSeed(seed)
    if (!parsed) return bad('That run was not dealt here. Start a new one.')

    const slot = body.slot
    if (!Number.isInteger(slot) || (slot as number) < 0 || (slot as number) >= SLOT_COUNT) {
      return bad('No such slot.')
    }

    const taken = Array.isArray(body.taken) ? body.taken : []
    if (taken.length >= SLOT_COUNT || !taken.every((t) => typeof t === 'string' && t.length <= 40)) {
      return bad('Malformed roster.')
    }

    const cards = soloPack(seed, parsed.captain, slot as number, taken as string[])
    return NextResponse.json({ ok: true, cards }, { headers: NO_STORE })
  }

  return bad('Unknown action.')
}
