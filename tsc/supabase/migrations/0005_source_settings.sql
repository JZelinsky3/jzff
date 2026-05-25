-- Per-source settings + allow the same external_id to be attached multiple
-- times under one archive (with different year ranges / playoff configs).
--
-- Motivation: NFL Fantasy changed its playoff structure in 2021. A user with
-- 2018-2025 history needs to sync 2018-2020 with a different playoff_week_start
-- than 2021-2025. Each segment becomes its own source row with the same
-- external_id but different settings.

alter table league_sources
  add column if not exists settings jsonb not null default '{}';

-- The old uniqueness on (league_id, platform, external_id) blocks the split case.
-- Drop it; users can still delete duplicate sources from the UI if they add by mistake.
alter table league_sources
  drop constraint if exists league_sources_league_id_platform_external_id_key;

-- Refresh PostgREST schema cache so the new column is visible to clients.
notify pgrst, 'reload schema';
