-- 0063_comp_grants_expiry.sql
-- Time-limited comps.
--
-- comp_grants was all-or-nothing: a row meant full access forever, and the
-- only way to end it was to remember to delete the row by hand. That is fine
-- for a lifetime comp and wrong for the common case of thanking someone with
-- a free month, where forgetting silently gives away a subscription.
--
-- Null expires_at keeps the old meaning (permanent), so every existing grant
-- is unchanged. isComped() in src/lib/siteAdmin.ts is the single reader and
-- now ignores rows whose expiry has passed; the row is left in place as a
-- record of what was given and when.

alter table comp_grants
  add column if not exists expires_at timestamptz;

comment on column comp_grants.expires_at is
  'When this comp stops applying. Null means permanent.';

notify pgrst, 'reload schema';
