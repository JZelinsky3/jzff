// Server-side Stripe wrapper + subscription helpers.
//
// All Stripe API calls funnel through `getStripe()` so we have one place to
// configure the SDK and to fail loudly if STRIPE_SECRET_KEY is missing.
// Lazy-init so Next's build step (which has no env at module load) doesn't crash.

import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasCompGrant } from '@/lib/siteAdmin'

// ─── SDK singleton ────────────────────────────────────────────────────────

let _stripe: Stripe | null = null
export function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set — add it to .env.local')
  }
  // Let the SDK use its default API version (pinned by the package). Bumping
  // the stripe package is the right way to move API versions — keeping the
  // constructor empty avoids type-checking friction with each SDK upgrade.
  _stripe = new Stripe(key)
  return _stripe
}

// ─── Tier configuration ───────────────────────────────────────────────────

export type Tier = 'tier1' | 'tier2' | 'tier3'
export type BillingPeriod = 'monthly' | 'yearly'

// How many leagues each paid tier allows. A user with no subscription gets 0.
// Number.POSITIVE_INFINITY for tier3 → current >= limit is always false.
export const TIER_LIMITS: Record<Tier, number> = {
  tier1: 1,
  tier2: 5,
  tier3: Number.POSITIVE_INFINITY,
}

// Human-friendly labels used on the pricing page + account UI.
export const TIER_LABELS: Record<Tier, { name: string; tagline: string }> = {
  tier1: { name: 'Rookie',  tagline: 'Archive one league.' },
  tier2: { name: 'Veteran', tagline: 'Archive up to five leagues.' },
  tier3: { name: 'Legend',  tagline: 'Archive unlimited leagues.' },
}

// Display prices in USD cents — these match what was configured in Stripe.
// Keep them here too so the pricing page can render without an API round-trip.
export const TIER_PRICES: Record<Tier, Record<BillingPeriod, { amountCents: number; perLabel: string }>> = {
  tier1: {
    monthly: { amountCents: 500,  perLabel: '/mo' },
    yearly:  { amountCents: 3000, perLabel: '/yr' },
  },
  tier2: {
    monthly: { amountCents: 1500, perLabel: '/mo' },
    yearly:  { amountCents: 7500, perLabel: '/yr' },
  },
  tier3: {
    monthly: { amountCents: 2500,  perLabel: '/mo' },
    yearly:  { amountCents: 10000, perLabel: '/yr' },
  },
}

// Map (tier, period) → Stripe price ID from env. Throws if a price isn't set.
export function priceIdFor(tier: Tier, period: BillingPeriod): string {
  const map: Record<Tier, Record<BillingPeriod, string | undefined>> = {
    tier1: {
      monthly: process.env.STRIPE_TIER1_MONTHLY,
      yearly:  process.env.STRIPE_TIER1_YEARLY,
    },
    tier2: {
      monthly: process.env.STRIPE_TIER2_MONTHLY,
      yearly:  process.env.STRIPE_TIER2_YEARLY,
    },
    tier3: {
      monthly: process.env.STRIPE_TIER3_MONTHLY,
      yearly:  process.env.STRIPE_TIER3_YEARLY,
    },
  }
  const id = map[tier][period]
  if (!id) throw new Error(`STRIPE_${tier.toUpperCase()}_${period.toUpperCase()} env var is not set`)
  return id
}

// Reverse lookup — Stripe webhook payloads carry a price ID, we need to know
// which tier+period that maps to so we can write the correct row to our DB.
// Returns null for unknown price IDs (e.g. legacy products, or a price the
// commissioner created outside our 6-tier scheme).
export function tierFromPriceId(priceId: string): { tier: Tier; period: BillingPeriod } | null {
  const pairs: { id: string | undefined; tier: Tier; period: BillingPeriod }[] = [
    { id: process.env.STRIPE_TIER1_MONTHLY, tier: 'tier1', period: 'monthly' },
    { id: process.env.STRIPE_TIER1_YEARLY,  tier: 'tier1', period: 'yearly'  },
    { id: process.env.STRIPE_TIER2_MONTHLY, tier: 'tier2', period: 'monthly' },
    { id: process.env.STRIPE_TIER2_YEARLY,  tier: 'tier2', period: 'yearly'  },
    { id: process.env.STRIPE_TIER3_MONTHLY, tier: 'tier3', period: 'monthly' },
    { id: process.env.STRIPE_TIER3_YEARLY,  tier: 'tier3', period: 'yearly'  },
  ]
  const hit = pairs.find((p) => p.id === priceId)
  return hit ? { tier: hit.tier, period: hit.period } : null
}

// ─── Lifetime / comp accounts ─────────────────────────────────────────────
// Operator-controlled list of user IDs that get unlimited access without a
// Stripe subscription. Set LIFETIME_USER_IDS in .env.local as a comma-
// separated list of auth.users UUIDs. Use this for your own account and any
// other comped users (early supporters, friends, etc.). Lives in env (not DB)
// so it can't be modified from inside the app.

export function isLifetimeUser(userId: string): boolean {
  const raw = process.env.LIFETIME_USER_IDS
  if (!raw) return false
  return raw.split(',').map((s) => s.trim()).includes(userId)
}

// Combined comp check: env-allowlisted OR site-admin-granted via DB.
// Use this instead of isLifetimeUser at any callsite that gates paid
// features — comp grants from the /admin dashboard need to flow through here.
export async function isCompUser(userId: string): Promise<boolean> {
  if (isLifetimeUser(userId)) return true
  return hasCompGrant(userId)
}

// ─── Testing mode ─────────────────────────────────────────────────────────
// Time-limited free preview window. Set TESTING_MODE_UNTIL to an ISO date
// (e.g. "2026-07-01T23:59:59Z"). While now() < that, any signed-in user can
// create exactly one league without a Stripe subscription. Those leagues
// get created_during_testing=true. When the window closes,
// scripts/end-testing-session.mjs grants every testing league a 3-month
// grace period before deletion. Empty / missing = testing mode off.

export function isTestingModeActive(): boolean {
  const until = process.env.TESTING_MODE_UNTIL
  if (!until) return false
  const cutoff = Date.parse(until)
  if (Number.isNaN(cutoff)) return false
  return Date.now() < cutoff
}

export function testingModeEndsAt(): Date | null {
  const until = process.env.TESTING_MODE_UNTIL
  if (!until) return null
  const t = Date.parse(until)
  return Number.isNaN(t) ? null : new Date(t)
}

// ─── Subscription state ───────────────────────────────────────────────────

export type SubscriptionRow = {
  user_id: string
  stripe_customer_id: string
  stripe_subscription_id: string | null
  tier: Tier
  billing_period: BillingPeriod
  status: string
  price_id: string | null
  trial_ends_at: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
}

// "Subscription is good" = user can use paid features. Trialing counts as good.
export function isSubscriptionActive(sub: { status: string } | null): boolean {
  if (!sub) return false
  return sub.status === 'trialing' || sub.status === 'active'
}

// Load the user's subscription row (or null). Uses the admin client so this
// works inside server actions / route handlers regardless of caller's RLS.
export async function getUserSubscription(userId: string): Promise<SubscriptionRow | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('subscriptions')
    .select('user_id, stripe_customer_id, stripe_subscription_id, tier, billing_period, status, price_id, trial_ends_at, current_period_end, cancel_at_period_end')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as SubscriptionRow | null) ?? null
}

// ─── Gating decisions ─────────────────────────────────────────────────────

export type EnforcementResult =
  | { ok: true }
  | { ok: false; reason: 'no_subscription' | 'tier_limit'; tier?: Tier; limit?: number; current?: number; message: string }

// Can this user create another league? Loads their subscription + counts
// existing leagues. Returns a typed result so the caller can render a
// matching upgrade prompt without re-deriving the reason.
export async function canCreateLeague(userId: string): Promise<EnforcementResult> {
  // Lifetime / comp accounts skip every other check.
  if (await isCompUser(userId)) return { ok: true }

  // Testing-mode free path: during the open window, any signed-in user can
  // create exactly one league without paying. Counts ALL their leagues
  // (paid + testing) so they can't claim a free league on top of an
  // existing paid one. Once they have any league, they're back on the
  // normal subscription rails.
  const db = createAdminClient()
  if (isTestingModeActive()) {
    const { count } = await db
      .from('leagues')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', userId)
    if ((count ?? 0) === 0) return { ok: true }
  }

  const sub = await getUserSubscription(userId)
  if (!isSubscriptionActive(sub) || !sub) {
    return {
      ok: false,
      reason: 'no_subscription',
      message: 'Start a trial or subscribe to create your first league.',
    }
  }

  const { count } = await db
    .from('leagues')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId)
  const current = count ?? 0
  const limit = TIER_LIMITS[sub.tier]

  if (current >= limit) {
    return {
      ok: false,
      reason: 'tier_limit',
      tier: sub.tier,
      limit,
      current,
      message: `Your ${TIER_LABELS[sub.tier].name} plan covers ${limit} ${limit === 1 ? 'league' : 'leagues'}. You currently have ${current}. Upgrade to add more.`,
    }
  }

  return { ok: true }
}

// ─── Webhook event handlers ───────────────────────────────────────────────
// Called by /api/stripe/webhook for each subscription lifecycle event. We
// keep the actual upsert centralized here so adding new event types only
// means subscribing them in the route, not rewriting the persistence logic.

export async function upsertSubscriptionFromStripe(
  sub: Stripe.Subscription,
  userId: string,
): Promise<void> {
  const item = sub.items.data[0]
  const priceId = item?.price.id
  if (!priceId) throw new Error(`Subscription ${sub.id} has no price item`)

  const mapped = tierFromPriceId(priceId)
  if (!mapped) throw new Error(`Subscription ${sub.id} uses unknown price ${priceId}`)

  // In Stripe API 2025+ / SDK v22, current_period_end moved from the
  // Subscription to each SubscriptionItem (because items can now have
  // different billing periods). Our subscriptions only ever have one item,
  // so we read it off the first one.
  const periodEndSec = item.current_period_end
  const trialEndSec = sub.trial_end

  const db = createAdminClient()
  const { error } = await db.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      stripe_subscription_id: sub.id,
      tier: mapped.tier,
      billing_period: mapped.period,
      status: sub.status,
      price_id: priceId,
      trial_ends_at: trialEndSec ? new Date(trialEndSec * 1000).toISOString() : null,
      current_period_end: periodEndSec ? new Date(periodEndSec * 1000).toISOString() : null,
      cancel_at_period_end: !!sub.cancel_at_period_end,
    },
    { onConflict: 'user_id' },
  )
  if (error) throw new Error(`upsertSubscriptionFromStripe: ${error.message}`)

  // Grace-period management: when a subscription transitions to a non-active
  // state, mark all the user's leagues for deletion 6 months out so they
  // have time to come back. When it transitions back to active/trialing,
  // clear the grace flag. Idempotent — re-running on the same state is safe.
  await syncLeagueGracePeriodForUser(userId, sub.status)
}

const SUBSCRIPTION_GRACE_MONTHS = 6

async function syncLeagueGracePeriodForUser(userId: string, status: string): Promise<void> {
  const db = createAdminClient()
  const active = status === 'active' || status === 'trialing'
  if (active) {
    // Subscription healthy — clear any pending grace periods on this user's
    // leagues (no-op if there were none).
    await db
      .from('leagues')
      .update({ grace_period_ends_at: null })
      .eq('owner_id', userId)
      .not('grace_period_ends_at', 'is', null)
    return
  }
  // Subscription unhealthy (canceled, past_due, unpaid, incomplete_expired,
  // etc). Set grace period on leagues that don't already have one. Don't
  // overwrite existing grace dates so we don't keep pushing the deletion
  // out every time a subscription event fires.
  const ends = new Date()
  ends.setMonth(ends.getMonth() + SUBSCRIPTION_GRACE_MONTHS)
  await db
    .from('leagues')
    .update({ grace_period_ends_at: ends.toISOString() })
    .eq('owner_id', userId)
    .is('grace_period_ends_at', null)
}

// On `customer.subscription.deleted`, Stripe still sends the subscription
// payload with status=canceled. We write that through so the UI shows the
// canceled state instead of disappearing the row.
