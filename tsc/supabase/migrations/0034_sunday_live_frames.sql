-- ============================================================
-- SUNDAY LIVE FRAMES
-- One row per (league, year, week, taken_at). The full SlLeague
-- payload is stored as jsonb so reconstructions (WP sparkline,
-- Big Moment diffing, end-of-day Sunday Live Archive permalink)
-- don't depend on any schema beyond this.
--
-- snapshots.ts writes are debounced to ~1/minute during the live
-- window, so the row count stays bounded: ~120 frames per matchup
-- per Sunday × N weeks × N leagues. Kept indefinitely so the
-- archive permalink survives forever.
-- ============================================================
create table sunday_live_frames (
  id          uuid primary key default uuid_generate_v4(),
  league_id   uuid not null references leagues(id) on delete cascade,
  year        int  not null,
  week        int  not null,
  taken_at    timestamptz not null default now(),
  payload     jsonb not null
);

create index sunday_live_frames_league_week_idx
  on sunday_live_frames(league_id, year, week, taken_at desc);
