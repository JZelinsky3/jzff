// /api/games/pack-empire/faces
//
//   POST   form { cardId, file }  -> { img, ids }  put a photo on a card
//   DELETE ?id=<card id>          -> { ids }       take an upload off
//
// Site admins only: this changes what every player sees.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { clearFace, saveFace } from '@/lib/packEmpire/faces'
import { playerById } from '@/lib/packEmpire/pool'
import { isSiteAdmin } from '@/lib/siteAdmin'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

/** Who's asking, or the reply that turns them away. */
async function gate(): Promise<{ userId: string } | { denied: NextResponse }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { denied: reply({ ok: false, error: 'Sign in first.' }, 401) }
  if (!(await isSiteAdmin(user.id))) return { denied: reply({ ok: false, error: 'Not allowed.' }, 403) }
  return { userId: user.id }
}

export async function POST(req: NextRequest) {
  const who = await gate()
  if ('denied' in who) return who.denied

  const form = await req.formData().catch(() => null)
  const card = playerById(String(form?.get('cardId') ?? ''))
  const file = form?.get('file')
  if (!card) return reply({ ok: false, error: 'No such card.' }, 400)
  if (!(file instanceof File)) return reply({ ok: false, error: 'No image attached.' }, 400)

  const out = await saveFace(card, file, who.userId)
  return reply(out, out.ok ? 200 : 400)
}

export async function DELETE(req: NextRequest) {
  const who = await gate()
  if ('denied' in who) return who.denied

  const card = playerById(req.nextUrl.searchParams.get('id') ?? '')
  if (!card) return reply({ ok: false, error: 'No such card.' }, 400)

  const out = await clearFace(card.id)
  return reply(out, out.ok ? 200 : 400)
}
