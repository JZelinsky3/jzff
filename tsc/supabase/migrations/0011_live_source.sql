-- ============================================================
-- LIVE SOURCE FLAG
-- ============================================================
-- Marks which league_source feeds the in-progress season. The weekly cron
-- re-syncs only sources flagged is_live — history sources are immutable once
-- their seasons end, so there's no reason to re-scrape them every week.
--
-- Pairs with seasons.is_live (the season pick'ems / power rankings read).
-- Both are set by the commissioner on /league/<slug>/live.

alter table league_sources
  add column if not exists is_live boolean not null default false;

create index if not exists league_sources_live_idx on league_sources(league_id) where is_live;

notify pgrst, 'reload schema';
