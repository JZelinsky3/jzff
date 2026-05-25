// POST /api/stripe/checkout
// Body: { tier: 'tier1' | 'tier2', period: 'monthly' | 'yearly' }
// Returns: { url } — the URL to redirect the user to on Stripe-hosted checkout.
//
// Creates a Stripe Checkout Session in subscription mode with a 10-day
// trial. Reuses the user's existing Stripe customer if they have one (from
// a previous subscription); otherwise lets Stripe create one keyed to their
// account email.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getStripe, priceIdFor, getUserSubscription, isLifetimeUser } from '@/lib/stripe'

const TRIAL_DAYS = Number(process.env.STRIPE_TRIAL_DAYS ?? '10')

const Body = z.object({
  tier: z.enum(['tier1', 'tier2', 'tier3']),
  period: z.enum(['monthly', 'yearly']),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  }
  // Lifetime / comp users shouldn't ever land in a Stripe checkout — the
  // UI hides the cards but guard the API too in case they bypass it.
  if (isLifetimeUser(user.id)) {
    return NextResponse.json(
      { error: 'You have lifetime access — nothing to subscribe to.' },
      { status: 400 }
    )
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Pick a valid tier and period.' }, { status: 400 })
  }
  const { tier, period } = parsed.data

  let priceId: string
  try {
    priceId = priceIdFor(tier, period)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }

  // Where the user comes back to after checkout. Honor request origin so
  // the same code works in dev (localhost) and prod (vercel domain).
  const origin = req.headers.get('origin') ?? new URL(req.url).origin

  const stripe = getStripe()
  try {
    // Reuse existing Stripe customer if this user has subscribed before
    // (even if they later canceled). Otherwise let Stripe create one.
    const existing = await getUserSubscription(user.id)
    const customerArg = existing?.stripe_customer_id
      ? { customer: existing.stripe_customer_id }
      : { customer_email: user.email }

    // One trial per user, ever. If we have any prior subscription record
    // (active, canceled, or trialing on a different tier/period), they've
    // already used their free trial — bill them immediately. Otherwise grant
    // the configured trial length. This prevents the loophole where a user
    // could claim a 10-day trial on Rookie monthly, cancel, then claim
    // another on Veteran yearly, etc.
    const trialEligible = !existing

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Whose subscription this is, propagated through Stripe so the webhook
      // can map subscription events back to our user without a customer-lookup
      // round-trip.
      client_reference_id: user.id,
      subscription_data: {
        ...(trialEligible ? { trial_period_days: TRIAL_DAYS } : {}),
        metadata: { user_id: user.id },
      },
      // Allow promo codes — easy win, costs nothing if you never create one.
      allow_promotion_codes: true,
      // Tax: leave automatic_tax off for v1 (it requires Stripe Tax setup).
      success_url: `${origin}/account?checkout=success`,
      cancel_url:  `${origin}/pricing?checkout=canceled`,
      ...customerArg,
    })

    if (!session.url) {
      return NextResponse.json({ error: 'Stripe did not return a checkout URL.' }, { status: 500 })
    }
    return NextResponse.json({ url: session.url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'checkout failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
