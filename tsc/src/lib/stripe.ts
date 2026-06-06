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
// All-Pro is now a finite 10-league cap (was Legend / unlimited) — the
// check downstream stays correct, just bounded.
export const TIER_LIMITS: Record<Tier, number> = {
  tier1: 1,
  tier2: 3,
  tier3: 10,
}

// How many leagues a user can link into their Manager Hub career chronicle.
// Deliberately more generous than TIER_LIMITS (archives): a linked league is
// read-heavier/lighter than a full commissioner-owned archive — the user is
// only tracking their own thread through it — so the caps are higher. The
// asymmetry is intentional (e.g. Rookie archives 1 but can chronicle 5).
export const MANAGER_LINK_LIMITS: Record<Tier, number> = {
  tier1: 5,
  tier2: 10,
  tier3: 20,
}

// Human-friendly labels used on the pricing page + account UI.
export const TIER_LABELS: Record<Tier, { name: string; tagline: string }> = {
  tier1: { name: 'Rookie',  tagline: 'Archive one league.' },
  tier2: { name: 'Veteran', tagline: 'Archive up to three leagues.' },
  tier3: { name: 'All-Pro', tagline: 'Archive up to ten leagues.' },
}

// Display prices in USD cents — these match what was configured in Stripe.
// Keep them here too so the pricing page can render without an API round-trip.
// 2026 pricing pass: $3/$5/$15 monthly, $15/$25/$50 yearly.
export const TIER_PRICES: Record<Tier, Record<BillingPeriod, { amountCents: number; perLabel: string }>> = {
  tier1: {
    monthly: { amountCents: 300,  perLabel: '/mo' },
    yearly:  { amountCents: 1500, perLabel: '/yr' },
  },
  tier2: {
    monthly: { amountCents: 500,  perLabel: '/mo' },
    yearly:  { amountCents: 2500, perLabel: '/yr' },
  },
  tier3: {
    monthly: { amountCents: 1500, perLabel: '/mo' },
    yearly:  { amountCents: 5000, perLabel: '/yr' },
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

// ─── Testing window ───────────────────────────────────────────────────────
// Time-limited preview period. Set TESTING_MODE_UNTIL to an ISO date
// (e.g. "2026-06-22T23:59:59Z") to override. Falls back to TESTING_DEFAULT_UNTIL
// below so the banner / trial badge "just work" without env config in dev.
// While now() < cutoff, any signed-in UDFA (free-tier) user can use the
// *entire* paid feature set — Pick'ems, Power Rankings, Live Season Hub,
// Manager Hub — without a subscription. Outside the window, UDFA stays
// free but is limited to 1 archive league and locks the paid features
// behind the upgrade rails.
//
// To force the window closed locally, set TESTING_MODE_UNTIL to a past
// ISO date (or any unparseable string).
const TESTING_DEFAULT_UNTIL = '2026-06-22T23:59:59Z'

function resolveTestingCutoff(): Date | null {
  const raw = process.env.TESTING_MODE_UNTIL ?? TESTING_DEFAULT_UNTIL
  const t = Date.parse(raw)
  return Number.isNaN(t) ? null : new Date(t)
}

export function isTestingModeActive(): boolean {
  const cutoff = resolveTestingCutoff()
  if (!cutoff) return false
  return Date.now() < cutoff.getTime()
}

export function testingModeEndsAt(): Date | null {
  return resolveTestingCutoff()
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

// Every non-comp user gets one free trial league on top of whatever
// their plan allows. Tier1 (1 league) → 2 total (1 paid + 1 trial).
// UDFA (no plan) → 1 trial league. During the preview window UDFA gets
// unlimited; the trial flag still latches onto their first league.
const TRIAL_BONUS = 1

// Can this user create another league? Loads their subscription + counts
// existing leagues. Returns a typed result so the caller can render a
// matching upgrade prompt without re-deriving the reason.
export async function canCreateLeague(userId: string): Promise<EnforcementResult> {
  // Lifetime / comp accounts skip every other check.
  if (await isCompUser(userId)) return { ok: true }

  const db = createAdminClient()
  const { count } = await db
    .from('leagues')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId)
  const current = count ?? 0
  const sub = await getUserSubscription(userId)
  const hasSub = isSubscriptionActive(sub) && !!sub

  // Trial slot: first league is always allowed regardless of plan.
  if (current === 0) return { ok: true }

  // No active subscription past the trial. UDFA is capped at 1 league
  // immediately — no preview-window grace. The trial slot covers the
  // first league; everything else needs a paid plan.
  if (!hasSub) {
    return {
      ok: false,
      reason: 'no_subscription',
      message: "You've used your free trial league. Upgrade to add more.",
    }
  }

  // Active subscription: trial slot stacks on top of the plan's allowance.
  const limit = TIER_LIMITS[sub.tier]
  const cap = limit + TRIAL_BONUS
  if (current >= cap) {
    return {
      ok: false,
      reason: 'tier_limit',
      tier: sub.tier,
      limit,
      current,
      message: `Your ${TIER_LABELS[sub.tier].name} plan covers ${limit} ${limit === 1 ? 'league' : 'leagues'} plus a 1-league free trial slot (${cap} total). You currently have ${current}. Upgrade to add more.`,
    }
  }
  return { ok: true }
}

// Can this user link another league into their Manager Hub chronicle? Mirrors
// canCreateLeague but counts career_links against MANAGER_LINK_LIMITS. Comp
// users skip the cap. Unlike archives there is no testing-mode free path —
// the hub is a paid feature end to end, so no active sub means no links.
export async function canAddCareerLink(userId: string): Promise<EnforcementResult> {
  if (await isCompUser(userId)) return { ok: true }

  const sub = await getUserSubscription(userId)
  if (!isSubscriptionActive(sub) || !sub) {
    return {
      ok: false,
      reason: 'no_subscription',
      message: 'Subscribe to start building your Manager Hub.',
    }
  }

  const db = createAdminClient()
  // Count links across the user's chronicle(s). One chronicle per user today,
  // but counting by owner keeps the gate correct if that ever changes.
  const { data: chronicles } = await db
    .from('career_chronicles')
    .select('id')
    .eq('owner_id', userId)
  const ids = (chronicles ?? []).map((c) => c.id as string)
  let current = 0
  if (ids.length > 0) {
    const { count } = await db
      .from('career_links')
      .select('id', { count: 'exact', head: true })
      .in('chronicle_id', ids)
    current = count ?? 0
  }
  const limit = MANAGER_LINK_LIMITS[sub.tier]

  if (current >= limit) {
    return {
      ok: false,
      reason: 'tier_limit',
      tier: sub.tier,
      limit,
      current,
      message: `Your ${TIER_LABELS[sub.tier].name} plan covers ${limit} linked leagues in your Manager Hub. You currently have ${current}. Upgrade to track more.`,
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

  const db = createAdminClient()

  // Resolve tier/period from the price ID. If the price isn't in our
  // current TIER_PRICES map (legacy price from a rebuilt tier structure,
  // orphan from a removed product, etc.) fall back to whatever the
  // existing subscriptions row already records for this user. This keeps
  // lifecycle events flowing (cancel / trial_will_end / etc.) for subs
  // that predate a price rotation. New subs on unknown prices still
  // throw — that's real misconfig and should be visible.
  let mapped = tierFromPriceId(priceId)
  if (!mapped) {
    const { data: existing } = await db
      .from('subscriptions')
      .select('tier, billing_period')
      .eq('user_id', userId)
      .maybeSingle()
    if (existing?.tier && existing?.billing_period) {
      mapped = { tier: existing.tier as Tier, period: existing.billing_period as BillingPeriod }
      console.warn(
        `[stripe] subscription ${sub.id} uses legacy price ${priceId}; ` +
        `falling back to stored tier=${mapped.tier} period=${mapped.period}`,
      )
    } else {
      throw new Error(`Subscription ${sub.id} uses unknown price ${priceId}`)
    }
  }

  // In Stripe API 2025+ / SDK v22, current_period_end moved from the
  // Subscription to each SubscriptionItem (because items can now have
  // different billing periods). Our subscriptions only ever have one item,
  // so we read it off the first one.
  const periodEndSec = item.current_period_end
  const trialEndSec = sub.trial_end

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
