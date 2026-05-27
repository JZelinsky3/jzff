// POST /api/stripe/checkout
// Body: { tier: 'tier1' | 'tier2' | 'tier3' | 'tier4', period: 'monthly' | 'yearly', promoCode?: string }
// Returns: { url } — the URL to redirect the user to on Stripe-hosted checkout.
//
// Creates a Stripe Checkout Session in subscription mode with a trial.
// Reuses the user's existing Stripe customer if they have one (from a
// previous subscription); otherwise lets Stripe create one keyed to their
// account email.
//
// Promo code handling:
//   If `promoCode` is provided in the request body the code is validated
//   against Stripe and pre-applied to the session using `discounts` (rather
//   than allowing the user to enter a code on the Stripe-hosted page). When a
//   promo code is pre-applied the trial is suppressed — the promotional
//   discount IS the "free period" for that user, so they shouldn't stack both.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getStripe, priceIdFor, getUserSubscription, isCompUser } from '@/lib/stripe'

const TRIAL_DAYS = Number(process.env.STRIPE_TRIAL_DAYS ?? '10')

const Body = z.object({
  tier: z.enum(['tier1', 'tier2', 'tier3', 'tier4']),
  period: z.enum(['monthly', 'yearly']),
  // Optional promotion code string (e.g. "FREEMONTH"). When provided the code
  // is validated with Stripe and pre-applied to the session. Providing a code
  // suppresses the free trial — the discount is the promotional benefit.
  promoCode: z.string().trim().optional(),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  }
  // Lifetime / comp users shouldn't ever land in a Stripe checkout — the
  // UI hides the cards but guard the API too in case they bypass it.
  if (await isCompUser(user.id)) {
    return NextResponse.json(
      { error: 'You have lifetime access — nothing to subscribe to.' },
      { status: 400 }
    )
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Pick a valid tier and period.' }, { status: 400 })
  }
  const { tier, period, promoCode } = parsed.data

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
    //
    // Additionally: if the user is redeeming a promotional code, suppress the
    // trial. The promo discount is their benefit — stacking a free trial on
    // top of a free-month promo would mean the first charge is delayed by
    // weeks, which is unintended.
    const trialEligible = !existing && !promoCode

    // Resolve a promo code string to a Stripe promotion_code object ID.
    // The string the user types (e.g. "FREEMONTH") is the `code` field;
    // the `id` (e.g. "promo_xxx") is what Stripe's `discounts` param needs.
    let resolvedPromoId: string | null = null
    if (promoCode) {
      const promos = await stripe.promotionCodes.list({ code: promoCode, active: true, limit: 1 })
      if (promos.data.length === 0) {
        return NextResponse.json({ error: 'That promo code is invalid or expired.' }, { status: 400 })
      }
      resolvedPromoId = promos.data[0].id
    }

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
      // Promo code handling: if the user provided a code we pre-apply it via
      // `discounts` (mutually exclusive with allow_promotion_codes). If no
      // code was entered we fall back to allowing them to enter one in Stripe's
      // hosted checkout — but that path keeps the trial intact because we
      // have no way to know a code will be entered before the session is
      // created. The "promo suppresses trial" guarantee only applies when the
      // code is submitted to our API before checkout is created.
      ...(resolvedPromoId
        ? { discounts: [{ promotion_code: resolvedPromoId }] }
        : { allow_promotion_codes: true }
      ),
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
