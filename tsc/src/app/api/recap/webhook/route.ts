import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { suppressEmail } from '@/lib/recap/suppress'

// Resend delivery events. Only two matter here, and both stop future email
// to the address:
//   email.bounced     a hard bounce; mailing a dead address again hurts the
//                     domain's reputation for everyone else
//   email.complained  the reader pressed "report spam"
//
// Resend signs webhooks the Svix way: HMAC-SHA256 over
// "<svix-id>.<svix-timestamp>.<raw body>" with the base64 part of the
// whsec_ secret, sent as one or more "v1,<base64>" in svix-signature.
// Set RESEND_WEBHOOK_SECRET to the signing secret Resend shows for the
// endpoint. Without it every request is refused.

const TOLERANCE_S = 5 * 60

function verify(secret: string, id: string, ts: string, body: string, header: string): boolean {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest()
  for (const part of header.split(' ')) {
    const [version, sig] = part.split(',')
    if (version !== 'v1' || !sig) continue
    const given = Buffer.from(sig, 'base64')
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true
  }
  return false
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'webhook not configured' }, { status: 503 })

  const id = req.headers.get('svix-id')
  const ts = req.headers.get('svix-timestamp')
  const sig = req.headers.get('svix-signature')
  const body = await req.text()
  if (!id || !ts || !sig) return NextResponse.json({ error: 'missing signature' }, { status: 401 })
  if (Math.abs(Date.now() / 1000 - Number(ts)) > TOLERANCE_S) {
    return NextResponse.json({ error: 'stale timestamp' }, { status: 401 })
  }
  if (!verify(secret, id, ts, body, sig)) return NextResponse.json({ error: 'bad signature' }, { status: 401 })

  let event: { type?: string; data?: { to?: string | string[]; bounce?: { type?: string } } }
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }

  const to = event.data?.to
  const addresses = (Array.isArray(to) ? to : to ? [to] : []).filter((a) => typeof a === 'string' && a.includes('@'))

  if (event.type === 'email.complained') {
    for (const a of addresses) await suppressEmail(a, 'complaint')
  } else if (event.type === 'email.bounced') {
    // A temporary bounce (full mailbox, greylisting) is not a dead address.
    const kind = String(event.data?.bounce?.type ?? '').toLowerCase()
    if (kind !== 'transient' && kind !== 'temporary') {
      for (const a of addresses) await suppressEmail(a, 'bounce')
    }
  }

  return NextResponse.json({ ok: true })
}
