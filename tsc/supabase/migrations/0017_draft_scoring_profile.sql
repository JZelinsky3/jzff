-- 0017_draft_scoring_profile.sql
-- Lets commissioners pick the scoring profile used to evaluate draft picks
-- (steals / busts / heartbreakers / best-worst) on the draft history page.
--
-- Values map to JSON files under public/data/fantasy_ranks/<profile>/<year>.json
-- shipped with the app (FantasyPros-derived end-of-season point totals):
--   ppr_6pt   Full PPR (1 pt/catch) + 6 pts/passing TD
--   half_4pt  Half PPR (0.5 pt/catch) + 4 pts/passing TD

alter table leagues
  add column if not exists draft_scoring_profile text not null default 'ppr_6pt';

alter table leagues
  drop constraint if exists leagues_draft_scoring_profile_check;

alter table leagues
  add constraint leagues_draft_scoring_profile_check
  check (draft_scoring_profile in ('ppr_6pt', 'half_4pt'));
