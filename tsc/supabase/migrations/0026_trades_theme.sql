-- 0026_trades_theme.sql
-- Per-league visual theme for the Trade Grader page. Defaults to 'cards'
-- (the sportscard aesthetic) for everyone, including existing leagues.
--
-- A picker on /leagues/<slug>/live-season/trades/ — visible only to the
-- league commissioner — writes the chosen theme back via POST
-- /api/leagues/<id>/trades-theme. Stored as text with a check constraint
-- so an invalid value can't be persisted; the four valid options match
-- the demos at /demo/trade-themes/.

alter table leagues
  add column if not exists trades_theme text not null default 'cards';

alter table leagues
  drop constraint if exists leagues_trades_theme_check;
alter table leagues
  add constraint leagues_trades_theme_check
  check (trades_theme in ('tribunal','wire','floor','cards'));

notify pgrst, 'reload schema';
