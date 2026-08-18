-- Catch-up for a rename that happened after 0057 had already been applied.
--
-- 0057 shipped first as `leftovers_runs`, was applied to production, and the
-- game was then renamed to THE MILK EXAM. The file at 0057 now creates
-- `exam_runs`, so a database that ran the earlier version is left with a table
-- the code no longer writes to and every submitted run fails on a missing
-- relation.
--
-- Written to be safe either way, because which of the two a database has
-- depends only on when it was migrated:
--
--   applied the old 0057  ->  the table is renamed, keeping its rows
--   applied the new 0057  ->  the rename is a no-op notice, nothing happens
--   never applied 0057    ->  0057 creates exam_runs, this is a no-op
--
-- `alter table if exists` is what makes the second and third cases quiet
-- rather than fatal.

alter table if exists leftovers_runs rename to exam_runs;

-- The index was named explicitly, so it does not follow the table. The unique
-- constraint's name is server-generated and cosmetic, so it is left alone.
alter index if exists leftovers_runs_league_edition_idx
  rename to exam_runs_league_edition_idx;

-- The share token moved with the name. A league that minted a link before the
-- rename carries a dead `leftovers_token` that nothing reads: the code looks
-- up `exam_token` only. Drop the stale key rather than leave a live-looking
-- token on the row for somebody to find and hand out.
update leagues
   set settings = settings - 'leftovers_token'
 where settings ? 'leftovers_token';
