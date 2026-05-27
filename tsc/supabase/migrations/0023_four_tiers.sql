-- 0023_four_tiers.sql
--
-- Restructures subscription tiers from 3 to 4 and brings the DB check
-- constraint in sync with the app code (tier3 was already shipped in the
-- app but was never added to the constraint; we fix that here and add tier4
-- in one step).
--
-- New tier map:
--   tier1 → Rookie   1 league     $3/mo  $15/yr
--   tier2 → Veteran  3 leagues    $5/mo  $25/yr
--   tier3 → All-Pro  7 leagues   $12/mo  $50/yr
--   tier4 → HOF     15 leagues   $25/mo $100/yr

alter table subscriptions
  drop constraint if exists subscriptions_tier_check;

alter table subscriptions
  add constraint subscriptions_tier_check
  check (tier in ('tier1', 'tier2', 'tier3', 'tier4'));
