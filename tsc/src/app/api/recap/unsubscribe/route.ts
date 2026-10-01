import { NextResponse } from 'next/server'
import { isSubscriberToken, verifySubscriberToken, verifyUnsubscribeToken } from '@/lib/recap/links'
import { suppressEmail, unsuppressEmail, userEmail } from '@/lib/recap/suppress'
import { activateSubscriber, subscriberById, unsubscribeSubscriber } from '@/lib/recap/subscribers'

// Two callers:
//
//  1. A mail client's one-click unsubscribe (RFC 8058). Gmail and Yahoo POST
//     "List-Unsubscribe=One-Click" to the URL in the List-Unsubscribe header,
//     with the token in the query string, and expect a 2xx. No redirect.
//  2. The form on /recap/unsubscribe, which posts `action` (stop | resume)
//     and gets sent back to the page to see the result.
//
// A commissioner's token turns recap email off for their address. A
// mailing-list member's token (sub.<id>.<sig>) takes that one address off
// that one league's list and nothing else.
//
// There is no GET handler on purpose. Link scanners and inbox previews fetch
// every URL in an email; if a GET unsubscribed, those would unsubscribe
// people who never clicked anything.

export async function POST(req: Request) {
  const url = new URL(req.url)
  let token = url.searchParams.get('t')
  let action: 'stop' | 'resume' = 'stop'
  let fromPage = false

  const type = req.headers.get('content-type') ?? ''
  if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    if (form) {
      const t = form.get('t')
      if (typeof t === 'string' && t) token = t
      const a = form.get('action')
      if (a === 'stop' || a === 'resume') {
        action = a
        fromPage = true
      }
    }
  }

  if (isSubscriberToken(token)) {
    const id = verifySubscriberToken(token)
    if (!id) return NextResponse.json({ error: 'invalid link' }, { status: 400 })
    if (!(await subscriberById(id))) return NextResponse.json({ error: 'no such signup' }, { status: 404 })
    if (action === 'resume') await activateSubscriber(id)
    else await unsubscribeSubscriber(id)
  } else {
    const userId = verifyUnsubscribeToken(token)
    if (!userId) return NextResponse.json({ error: 'invalid link' }, { status: 400 })
    const user = await userEmail(userId)
    if (!user) return NextResponse.json({ error: 'no such account' }, { status: 404 })

    if (action === 'resume') await unsuppressEmail(user.email)
    else await suppressEmail(user.email, 'unsubscribe')
  }

  if (!fromPage) return new NextResponse('Unsubscribed from weekly recaps.', { status: 200 })

  const back = new URL('/recap/unsubscribe/', req.url)
  back.searchParams.set('t', token!)
  back.searchParams.set('done', action)
  return NextResponse.redirect(back, 303)
}
