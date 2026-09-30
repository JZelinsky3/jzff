-- 0069_season_podium.sql
-- Hand-entered podiums: champion, runner-up and third place for a season,
-- with or without any standings behind them.
--
-- Plenty of leagues know who won every year long before they have the records
-- to go with it: the commissioner remembers 2014's champion, nobody kept the
-- 2014 standings. The importer (/league/<slug>/import) now takes just the
-- podium for a season, and all three places are optional past the champion.
--
-- seasons already stores champion_manager_id and runner_up_manager_id. Third
-- place was only ever derived from a third-place game in the matchups, which a
-- podium-only season does not have, so it gets its own column. The exporter
-- prefers it when set and falls back to the derived game otherwise.
--
-- 'podium' joins the manual_imports kinds so a typed-in podium is locked the
-- same way hand-entered standings are: every ingest writes champion and
-- runner-up on each sync, and a lock row is what makes them leave it alone.

alter table seasons
  add column if not exists third_place_manager_id uuid
    references managers(id) on delete set null;

alter table manual_imports drop constraint if exists manual_imports_kind_check;
alter table manual_imports
  add constraint manual_imports_kind_check
    check (kind in ('standings', 'drafts', 'matchups', 'podium'));

notify pgrst, 'reload schema';
