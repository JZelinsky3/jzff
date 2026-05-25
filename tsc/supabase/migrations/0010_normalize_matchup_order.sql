-- ============================================================
-- NORMALIZE MATCHUP PARTICIPANT ORDERING
-- ============================================================
-- Make (manager_a_id, manager_b_id) deterministic: the smaller UUID is
-- always manager_a_id. This makes the matchups upsert key
-- (season_id, week, manager_a_id, manager_b_id) stable across re-syncs.
--
-- Why: the ingest used to delete-and-reinsert every matchup each sync,
-- because the parsers didn't guarantee stable a/b ordering — a re-sync
-- could write (Y,X) instead of (X,Y) and the upsert would miss, creating
-- duplicates. That delete cascaded into pickems_picks (FK on delete
-- cascade), so a weekly live-season re-sync would wipe every pick.
--
-- With deterministic ordering the ingest can upsert in place (no delete),
-- so matchup ids persist and picks survive. This one-time pass normalizes
-- rows written before the ordering change.

update matchups
set manager_a_id = manager_b_id,
    manager_b_id = manager_a_id,
    score_a = score_b,
    score_b = score_a
where manager_a_id > manager_b_id;
