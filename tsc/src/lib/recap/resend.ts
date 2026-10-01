// One email through Resend, from the recap address. Shared by the weekly
// send and the mailing-list confirmation, so both go out from our own
// domain with the same one-click unsubscribe headers.

import { unsubscribeApiUrl } from './links'

export async function sendViaResend(args: {
  to: string
  subject: string
  html: string
  text: string
  // The signed token behind List-Unsubscribe. Every email that goes out on
  // a schedule carries one; Gmail and Yahoo require it for bulk senders.
  unsubToken: string | null
  idempotencyKey: string | null
  category: string
}): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { ok: false, error: 'RESEND_API_KEY is not set' }

  // The August broadcast went to spam because it was sent from Resend's
  // shared sandbox address. The domain's DMARC policy is p=quarantine, so
  // anything not from our own domain is spam-foldered on our own orders.
  const from = process.env.RECAP_EMAIL_FROM || 'The Sunday Chronicle <recap@thesundaychronicle.app>'
  if (!/@thesundaychronicle\.app>?\s*$/i.test(from)) {
    return { ok: false, error: `RECAP_EMAIL_FROM must be an @thesundaychronicle.app address, got "${from}"` }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(args.idempotencyKey ? { 'Idempotency-Key': args.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
      ...(process.env.RECAP_REPLY_TO ? { reply_to: process.env.RECAP_REPLY_TO } : {}),
      // One-click unsubscribe (RFC 8058). Gmail and Yahoo show their own
      // unsubscribe button off these, which is far better for the domain's
      // reputation than a reader reaching for "report spam".
      ...(args.unsubToken
        ? {
            headers: {
              'List-Unsubscribe': `<${unsubscribeApiUrl(args.unsubToken)}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          }
        : {}),
      tags: [{ name: 'category', value: args.category }],
    }),
    cache: 'no-store',
  })
  if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}` }
  const data = (await res.json().catch(() => null)) as { id?: string } | null
  return { ok: true, id: data?.id ?? null }
}

// The address the paper comes from, for "add us to your contacts".
export function recapFromAddress(): string {
  const from = process.env.RECAP_EMAIL_FROM || 'recap@thesundaychronicle.app'
  return from.match(/<([^>]+)>/)?.[1] ?? from.trim()
}
