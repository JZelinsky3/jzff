import { NextResponse } from 'next/server'
import { signUp } from '@/lib/recap/subscribers'

// The mailing-list form at the bottom of a recap page. JSON in, JSON out.
// `website` is a honeypot: people never see it, form-filling bots fill it.
// A bot gets the same "check your inbox" a person does and nothing is sent.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { slug?: unknown; email?: unknown; website?: unknown } | null
  const slug = typeof body?.slug === 'string' ? body.slug : ''
  const email = typeof body?.email === 'string' ? body.email : ''
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return NextResponse.json({ ok: false, error: 'Unknown league.' }, { status: 400 })
  if (typeof body?.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true, state: 'sent' })

  const r = await signUp(slug, email)
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
