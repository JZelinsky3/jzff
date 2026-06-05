-- 0031_udfa_rename.sql
-- Repurpose the testing-window flag as the permanent UDFA (free) tier marker.
-- Semantics: is_udfa = true means this league has the free feature set
-- (all-time standings + rivalries + manager top strip only; everything else
-- blurred with an upgrade CTA). The flag is stamped at creation time when
-- the user has no active subscription and no comp grant.
--
-- Idempotent: handles three DB states
--   1. created_during_testing exists (from 0015) → rename it
--   2. is_udfa already exists → no-op
--   3. neither exists (0015 was never applied) → add is_udfa directly

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leagues'
      and column_name = 'created_during_testing'
  ) then
    alter table leagues rename column created_during_testing to is_udfa;
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leagues'
      and column_name = 'is_udfa'
  ) then
    alter table leagues
      add column is_udfa boolean not null default false;
  end if;
end$$;
