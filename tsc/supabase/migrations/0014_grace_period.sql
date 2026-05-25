-- 0014_grace_period.sql
-- League grace period: when set, the league is scheduled for permanent
-- deletion at that timestamp unless the user regains access first.
--
-- Set by:
--   • Stripe webhook on `customer.subscription.deleted` → NOW + 6 months
--     (lapsed paying customer keeps their data half a year in case they
--     come back; if they don't, scripts/wipe-expired-leagues.mjs cleans it)
--   • Future: testing-mode end → NOW + 3 months (separate session)
--
-- Cleared by:
--   • Stripe webhook on customer.subscription.{created,updated} when status
--     becomes active or trialing again
--   • Manually if the user is added to LIFETIME_USER_IDS
--
-- NULL means "no grace period — league is in good standing".

alter table leagues
  add column if not exists grace_period_ends_at timestamptz;

-- Index for the cleanup script's WHERE clause. Sparse (NULL not indexed) so
-- it stays tiny — only rows with an active grace period are tracked.
create index if not exists leagues_grace_period_idx
  on leagues (grace_period_ends_at)
  where grace_period_ends_at is not null;
