// POST /api/stripe/portal
// Returns: { url } — Stripe-hosted customer portal where the user can
// upgrade/downgrade their plan, change payment method, view invoices,
// and cancel. Cheaper than building any of that ourselves.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe, getUserSubscription } from '@/lib/stripe'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const sub = await getUserSubscription(user.id)
  if (!sub?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No subscription on file — visit /pricing to start one.' },
      { status: 400 }
    )
  }

  const origin = req.headers.get('origin') ?? new URL(req.url).origin

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/account`,
    })
    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[stripe/portal] session create failed', err)
    return NextResponse.json({ error: 'Billing portal is temporarily unavailable.' }, { status: 500 })
  }
}
