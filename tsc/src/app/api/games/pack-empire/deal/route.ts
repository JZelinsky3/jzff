// POST /api/games/pack-empire/deal
//
//   { action: 'start', captain, difficulty } -> { seed }
//   { action: 'pack', seed, slot, taken }    -> { cards }
//   { action: 'check', seed }                -> { live }
//   { action: 'lock', seed, picks, open }    -> { lock }
//
// Empire Builder and Versus Challenge both draft through here. 'start' is the
// commitment: the captain and the difficulty are signed into the seed, so
// neither can be swapped once a pack has been seen. 'pack' deals one slot's
// five cards; it is pure, so asking twice returns the same pack and a refresh
// rerolls nothing. On a blind difficulty the cards are masked here, because
// this is the last place they exist in full before they reach the browser.
//
// 'lock' is a blind run's pick going on record, which is what turns over the
// four cards it passed on (see lib/packEmpire/blindPicks). An Even seed belongs
// to two seats, so those lock through /api/games/pack-empire/versus instead.
//
// No account needed. Picks are all that's written; a run only reaches the board
// through /api/games/runs, which re-deals the whole thing from the seed.

import { NextResponse, type NextRequest } from 'next/server'
import { blindRun, lockBlindPicks, parseLockPicks } from '@/lib/packEmpire/blindPicks'
import { maskCard, newCaptainSeed, readSeed } from '@/lib/packEmpire/deal'
import { seedPack } from '@/lib/packEmpire/solo'
import { SLOT_COUNT, isBlind, isDifficulty } from '@/lib/packEmpire/rules'

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
    const difficulty = isDifficulty(body.difficulty) ? body.difficulty : 'open'
    return NextResponse.json({ ok: true, seed: newCaptainSeed(captain as number, difficulty) }, { headers: NO_STORE })
  }

  // A seed is signed with the pool it was dealt from. One saved on a device
  // before the pool changed no longer reads, and the table says so.
  if (body.action === 'check') {
    const seed = typeof body.seed === 'string' ? body.seed.trim().toUpperCase() : ''
    return NextResponse.json({ ok: true, live: !!readSeed(seed) }, { headers: NO_STORE })
  }

  if (body.action === 'pack') {
    const seed = typeof body.seed === 'string' ? body.seed.trim().toUpperCase() : ''
    const parsed = readSeed(seed)
    if (!parsed) return bad('That run was not dealt here. Start a new one.')

    const slot = body.slot
    if (!Number.isInteger(slot) || (slot as number) < 0 || (slot as number) >= SLOT_COUNT) {
      return bad('No such slot.')
    }

    const taken = Array.isArray(body.taken) ? body.taken : []
    if (taken.length >= SLOT_COUNT || !taken.every((t) => typeof t === 'string' && t.length <= 40)) {
      return bad('Malformed roster.')
    }

    const cards = seedPack(seed, parsed, slot as number, taken as string[]).map((c) => maskCard(c, parsed.diff))
    return NextResponse.json({ ok: true, cards }, { headers: NO_STORE })
  }

  if (body.action === 'lock') {
    const seed = typeof body.seed === 'string' ? body.seed.trim().toUpperCase() : ''
    const parsed = readSeed(seed)
    if (!parsed) return bad('That run was not dealt here. Start a new one.')
    if (!isBlind(parsed.diff) || parsed.even) return bad('That run has nothing to lock.')

    const picks = body.picks == null ? null : parseLockPicks(body.picks)
    if (body.picks != null && !picks) return bad('Malformed roster.')

    const out = await lockBlindPicks(blindRun(seed, parsed), seed, parsed, picks, body.open === true)
    return out.ok ? NextResponse.json({ ok: true, lock: out.lock }, { headers: NO_STORE }) : bad(out.error, out.status)
  }

  return bad('Unknown action.')
}
