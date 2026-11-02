// POST /api/games/pack-empire/locker
//
//   { action: 'open', pack }                         -> { cards, fresh }
//   { action: 'deck', game, id?, name?, cards, calls? } -> {}
//   { action: 'deck-choose', game, id }              -> {}
//   { action: 'deck-delete', game, id }              -> {}
//   { action: 'sell', rarity }                       -> { faab }
//   { action: 'buy', kind }                          -> {}
//
// The Locker itself, for every game on it. Signed-in only: what you own is an
// account's. Packs are dealt here and nowhere else.

import { NextResponse, type NextRequest } from 'next/server'
import { lockerOpenTo } from '@/lib/packEmpire/locker/access'
import { buyPack, chooseDeck, deleteDeck, openPack, saveDeck, sellSpares } from '@/lib/packEmpire/locker/store'
import { RARITIES, type Rarity } from '@/lib/packEmpire/rules'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE })
}

const UUID = /^[0-9a-f-]{36}$/i

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return bad('Sign in first.', 401)
  if (!(await lockerOpenTo(user.id))) return bad('Not found.', 404)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return bad('Malformed request.')
  }

  if (body.action === 'open') {
    if (typeof body.pack !== 'string' || !UUID.test(body.pack)) return bad('No such pack.')
    const out = await openPack(user.id, body.pack)
    return out.ok ? NextResponse.json({ ok: true, cards: out.cards, fresh: out.fresh }, { headers: NO_STORE }) : bad(out.error, out.status)
  }

  if (body.action === 'deck') {
    const { game, id, name, cards, calls = [] } = body
    const ids = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 60 && v.every((c) => typeof c === 'string' && c.length <= 40)
    if (typeof game !== 'string' || !ids(cards) || !ids(calls) || (id != null && typeof id !== 'string') || (name != null && typeof name !== 'string')) {
      return bad('Malformed deck.')
    }
    const problem = await saveDeck(user.id, game, { id: (id as string | null) ?? null, name: (name as string | null) ?? '', cards, calls })
    return problem ? bad(problem) : NextResponse.json({ ok: true }, { headers: NO_STORE })
  }

  if (body.action === 'deck-choose' || body.action === 'deck-delete') {
    const { game, id } = body
    if (typeof game !== 'string' || typeof id !== 'string') return bad('No such deck.')
    const problem = await (body.action === 'deck-choose' ? chooseDeck : deleteDeck)(user.id, game, id)
    return problem ? bad(problem) : NextResponse.json({ ok: true }, { headers: NO_STORE })
  }

  if (body.action === 'sell') {
    if (!RARITIES.includes(body.rarity as Rarity)) return bad('No such rarity.')
    const out = await sellSpares(user.id, body.rarity as Rarity)
    return 'error' in out ? bad(out.error) : NextResponse.json({ ok: true, faab: out.faab }, { headers: NO_STORE })
  }

  if (body.action === 'buy') {
    if (typeof body.kind !== 'string') return bad('No such pack.')
    const problem = await buyPack(user.id, body.kind)
    return problem ? bad(problem) : NextResponse.json({ ok: true }, { headers: NO_STORE })
  }

  return bad('Unknown action.')
}
