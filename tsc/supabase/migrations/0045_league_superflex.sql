-- 0045_league_superflex.sql
-- Marks a league as superflex (a second QB-eligible starting slot). Drives
-- the All-Time Team's roster layout — a SUPERFLEX card is added to the
-- starting lineup (QB/RB/WR/TE eligible, which in practice lands the
-- manager's second-best QB season). Manual toggle, set in league settings
-- and at league creation; defaults off so every existing league is 1QB.

alter table leagues
  add column if not exists superflex boolean not null default false;

notify pgrst, 'reload schema';
