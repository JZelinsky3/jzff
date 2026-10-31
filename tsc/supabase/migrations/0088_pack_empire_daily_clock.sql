-- 0088_pack_empire_daily_clock.sql
--
-- The Daily's shot clock. The server stamps a pack when it hands it over, so a
-- refresh can't restart the clock, and a pack isn't sent at all until then.
-- Null means the next pack hasn't been opened.

alter table pe_daily_runs add column if not exists pack_opened_at timestamptz;
