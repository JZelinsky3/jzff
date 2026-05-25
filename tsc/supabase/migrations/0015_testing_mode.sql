-- 0015_testing_mode.sql
-- Marks leagues created during the free testing window so they can be
-- treated differently from real paid/lifetime leagues:
--   • Public almanac hides pickems + power rankings chapters (those are
--     paid-tier features we don't want public-facing during testing)
--   • When testing ends, scripts/end-testing-session.mjs sets a 3-month
--     grace_period_ends_at on every testing league (same delete pipeline
--     as the subscription-lapse flow from migration 0014).

alter table leagues
  add column if not exists created_during_testing boolean not null default false;
