-- 0044_draft_scoring_profile_standard.sql
-- Adds the Standard (non-PPR) draft scoring profiles so leagues that don't
-- award reception points are scored correctly on the almanac (draft grader,
-- All-Time Team, manager pages) instead of being forced into a Half/PPR fit.
--
-- New values:
--   std_4pt   Standard (0 pt/catch) + 4 pts/passing TD
--   std_6pt   Standard (0 pt/catch) + 6 pts/passing TD
--
-- Existing values keep working unchanged — this only widens the CHECK
-- constraint. Historical rank files live under
-- public/data/fantasy_ranks/std_4pt|std_6pt/<year>.json.

alter table leagues
  drop constraint if exists leagues_draft_scoring_profile_check;

alter table leagues
  add constraint leagues_draft_scoring_profile_check
  check (draft_scoring_profile in (
    'ppr_6pt', 'half_4pt', 'ppr_4pt', 'half_6pt', 'std_4pt', 'std_6pt'
  ));

notify pgrst, 'reload schema';
