-- Subscription state, mirrored from Stripe via webhooks.
--
-- One row per user. Created when they start a trial (via Stripe Checkout).
-- Absence of a row = the user has no active subscription, has not started a
-- trial, and can't create new leagues. Existing leagues remain readable.
--
-- We keep this table thin and use it as a fast local source of truth for
-- gating decisions ("can this user create another league?"). Stripe remains
-- the authoritative store; this table is whatever the last webhook said.
--
-- Status values mirror Stripe's subscription statuses:
--   trialing | active | past_due | canceled | incomplete |
--   incomplete_expired | unpaid | paused
-- Our app treats `trialing` and `active` as "subscription is good".

create table subscriptions (
  id                       uuid primary key default uuid_generate_v4(),
  -- One sub per user. Cascade so deleting an auth user wipes their sub row.
  user_id                  uuid not null unique
                              references auth.users(id) on delete cascade,
  -- Stripe identifiers. customer_id is created the first time the user
  -- opens Checkout; subscription_id is set once the subscription itself
  -- exists (immediately on trial start).
  stripe_customer_id       text not null unique,
  stripe_subscription_id   text unique,
  -- App-facing tier label, derived from the active price_id at webhook time.
  tier                     text not null check (tier in ('tier1', 'tier2')),
  billing_period           text not null check (billing_period in ('monthly', 'yearly')),
  -- Raw Stripe status. Keep as text (no enum) so future Stripe additions
  -- don't require a migration.
  status                   text not null,
  -- The Stripe price ID currently in effect (lets us reconstruct the choice
  -- if the user upgrades/downgrades).
  price_id                 text,
  -- Trial end date (only meaningful while status = 'trialing'; Stripe sets
  -- this to null once the trial converts).
  trial_ends_at            timestamptz,
  -- End of the currently-paid period. After this, Stripe will renew or
  -- terminate based on cancel_at_period_end.
  current_period_end       timestamptz,
  cancel_at_period_end     boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index subscriptions_customer_idx     on subscriptions(stripe_customer_id);
create index subscriptions_subscription_idx on subscriptions(stripe_subscription_id);
create index subscriptions_status_idx       on subscriptions(status);

alter table subscriptions enable row level security;

-- Users can read their own row; nobody can write through the anon/auth key
-- (webhook handler uses the service role key for writes).
create policy "subscriptions self read"
  on subscriptions for select
  using (auth.uid() = user_id);

-- Trigger to keep updated_at fresh on every webhook write.
create or replace function touch_subscriptions_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end$$ language plpgsql;

create trigger touch_subscriptions_updated_at_trg
  before update on subscriptions
  for each row execute function touch_subscriptions_updated_at();

notify pgrst, 'reload schema';
