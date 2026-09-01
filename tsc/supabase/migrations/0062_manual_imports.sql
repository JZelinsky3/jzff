-- 0062_manual_imports.sql
-- Provenance for hand-entered season data.
--
-- Some league history can never be fetched again: NFL.com retired its fantasy
-- product in 2026 and took every league page with it, and older platforms drop
-- seasons on their own schedule. The importer at /league/<slug>/import lets a
-- commissioner type or upload what the platform can no longer give us, writing
-- ordinary manager_seasons / drafts / matchups rows.
--
-- This table records that a season's stage was filled by hand. Two reasons it
-- is a table rather than a flag in seasons.settings: every ingest REPLACES
-- seasons.settings wholesale on each sync, so a flag there would not survive
-- the first re-sync; and the ingests need to know what to leave alone, which
-- is a lookup, not a display value. `has_league_write` (0043) already covers
-- owner / editor / site admin, so the policies just call it.

create table manual_imports (
  id          uuid primary key default uuid_generate_v4(),
  league_id   uuid not null references leagues(id) on delete cascade,
  season_id   uuid not null references seasons(id) on delete cascade,
  -- Which stage was entered by hand. One row per season per stage; re-importing
  -- the same stage updates the row rather than adding a second one.
  kind        text not null check (kind in ('standings', 'drafts', 'matchups')),
  row_count   int not null default 0,
  note        text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (season_id, kind)
);

create index manual_imports_league_idx on manual_imports(league_id);

alter table manual_imports enable row level security;

-- Same shape as every other per-league table in 0001: read follows league
-- access, write follows has_league_write (owner / editor / site admin).
create policy "manual_imports access" on manual_imports
  for select using (has_league_access(league_id));
create policy "manual_imports write" on manual_imports
  for all using (has_league_write(league_id));

create trigger manual_imports_updated_at
  before update on manual_imports
  for each row execute function set_updated_at();

notify pgrst, 'reload schema';
