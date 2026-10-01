import { NextResponse } from 'next/server'
import { verifySubscriberToken } from '@/lib/recap/links'
import { activateSubscriber, subscriberById } from '@/lib/recap/subscribers'

// The button on /recap/subscribe. There is no GET on purpose: mail scanners
// open every link in an email, and a GET that confirmed would let anyone
// sign anyone up as long as their inbox ran a link checker.
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  const token = form?.get('t')
  const id = typeof token === 'string' ? verifySubscriberToken(token) : null
  if (!id) return NextResponse.json({ error: 'invalid link' }, { status: 400 })
  const sub = await subscriberById(id)
  if (!sub) return NextResponse.json({ error: 'no such signup' }, { status: 404 })

  await activateSubscriber(id)
  const back = new URL('/recap/subscribe/', req.url)
  back.searchParams.set('t', token as string)
  back.searchParams.set('done', '1')
  return NextResponse.redirect(back, 303)
}
