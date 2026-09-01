-- 0064_row_timestamps.sql
-- When did this row arrive, and when was it last touched?
--
-- The five tables an ingest writes had no timestamps at all, so "did a sync
-- change this league's data two days ago?" could not be answered from the
-- data. Answering it for weekly-depression took an identity forensics detour
-- through managers.created_at, which happened to be the only dated thing in
-- the league. These columns make the same question a single query.
--
-- created_at is added WITHOUT a default first, so existing rows keep NULL,
-- meaning "arrived before we started recording". Defaulting them would stamp
-- every historical row with today's date, which is worse than not knowing:
-- it looks like an answer and is a lie.

alter table manager_seasons add column if not exists created_at timestamptz;
alter table manager_seasons add column if not exists updated_at timestamptz;
alter table manager_seasons alter column created_at set default now();
alter table manager_seasons alter column updated_at set default now();

alter table matchups add column if not exists created_at timestamptz;
alter table matchups add column if not exists updated_at timestamptz;
alter table matchups alter column created_at set default now();
alter table matchups alter column updated_at set default now();

alter table drafts add column if not exists created_at timestamptz;
alter table drafts add column if not exists updated_at timestamptz;
alter table drafts alter column created_at set default now();
alter table drafts alter column updated_at set default now();

alter table draft_picks add column if not exists created_at timestamptz;
alter table draft_picks add column if not exists updated_at timestamptz;
alter table draft_picks alter column created_at set default now();
alter table draft_picks alter column updated_at set default now();

alter table weekly_lineups add column if not exists created_at timestamptz;
alter table weekly_lineups add column if not exists updated_at timestamptz;
alter table weekly_lineups alter column created_at set default now();
alter table weekly_lineups alter column updated_at set default now();

-- set_updated_at() is defined in 0001. weekly_lineups is the one high-volume
-- table here (thousands of rows per season), but the trigger only fires on
-- UPDATE, and lineups are written by insert, so the cost stays near zero.
create trigger manager_seasons_updated_at before update on manager_seasons
  for each row execute function set_updated_at();
create trigger matchups_updated_at before update on matchups
  for each row execute function set_updated_at();
create trigger drafts_updated_at before update on drafts
  for each row execute function set_updated_at();
create trigger draft_picks_updated_at before update on draft_picks
  for each row execute function set_updated_at();
create trigger weekly_lineups_updated_at before update on weekly_lineups
  for each row execute function set_updated_at();

notify pgrst, 'reload schema';
