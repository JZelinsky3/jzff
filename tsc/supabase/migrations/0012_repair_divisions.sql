-- ============================================================
-- REPAIR — add columns from migration 0003 that aren't present
-- ============================================================
-- Migration 0003_divisions.sql declared these columns, but a real DB was
-- found running without them (Sleeper manager_seasons upserts were silently
-- failing on `division_index does not exist`, which broke power rankings
-- since it couldn't read a 2026 roster). Re-applying idempotently.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'division_term') then
    create type division_term as enum ('conference', 'division');
  end if;
end$$;

alter table leagues
  add column if not exists division_count int not null default 0,
  add column if not exists division_term  division_term not null default 'division',
  add column if not exists division_names text[] not null default '{}';

alter table manager_seasons
  add column if not exists division_index int;

notify pgrst, 'reload schema';
