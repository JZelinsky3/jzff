// POST /api/stripe/webhook
//
// Receives subscription lifecycle events from Stripe. Verifies the request
// signature against STRIPE_WEBHOOK_SECRET, then writes the resulting state
// to our local `subscriptions` table.
//
// Local dev: forward live Stripe events to localhost with
//   stripe listen --forward-to localhost:3000/api/stripe/webhook
// The CLI prints a `whsec_...` value on startup — paste it into .env.local
// as STRIPE_WEBHOOK_SECRET and restart the dev server.

import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe, upsertSubscriptionFromStripe } from '@/lib/stripe'

// Stripe signature verification requires the raw request body, not the
// JSON-parsed one. Disable Next's default body parsing for this route.
export const runtime = 'nodejs'   // crypto-using SDK needs full Node runtime
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET not configured' }, { status: 500 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const stripe = getStripe()
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'signature verification failed'
    return NextResponse.json({ error: `Webhook signature invalid: ${msg}` }, { status: 400 })
  }

  // Each subscription event carries the full Subscription object. The user_id
  // we attached on Checkout flows through as subscription.metadata.user_id.
  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object as Stripe.Subscription
        const userId = sub.metadata?.user_id
        if (!userId) {
          // Subscriptions created outside our Checkout flow (e.g. directly in
          // Stripe dashboard) won't have our metadata — ignore them rather
          // than fail loudly so they don't block legitimate events behind.
          console.warn(`[stripe webhook] ${event.type} for ${sub.id} has no user_id metadata, skipping`)
          break
        }
        await upsertSubscriptionFromStripe(sub, userId)
        break
      }
      // `checkout.session.completed` fires once when the user finishes the
      // hosted checkout. The subsequent `customer.subscription.created` is
      // what actually carries the subscription state we care about, so we
      // don't need to do anything special here — just acknowledge.
      case 'checkout.session.completed':
        break
      default:
        // We don't care about other events (payment_intent, invoice, etc.)
        // for now. Stripe expects 2xx regardless, so just acknowledge.
        break
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'webhook handler failed'
    console.error(`[stripe webhook] ${event.type} failed:`, msg)
    // Return 500 so Stripe retries. If we silently 200, we'd lose data.
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
