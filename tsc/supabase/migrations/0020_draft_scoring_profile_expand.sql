-- 0020_draft_scoring_profile_expand.sql
-- Extends draft_scoring_profile from 2 combos to all 4 PPR × passing-TD
-- combinations. The UI now exposes the choice as two independent dropdowns
-- (Full/Half PPR × 4/6 pt passing TDs), so we need to accept every pairing.
--
-- New values:
--   ppr_4pt   Full PPR (1 pt/catch) + 4 pts/passing TD
--   half_6pt  Half PPR (0.5 pt/catch) + 6 pts/passing TD
--
-- Existing values (ppr_6pt, half_4pt) keep working unchanged — no data
-- migration needed; this only widens the CHECK constraint.

alter table leagues
  drop constraint if exists leagues_draft_scoring_profile_check;

alter table leagues
  add constraint leagues_draft_scoring_profile_check
  check (draft_scoring_profile in ('ppr_6pt', 'half_4pt', 'ppr_4pt', 'half_6pt'));

notify pgrst, 'reload schema';
