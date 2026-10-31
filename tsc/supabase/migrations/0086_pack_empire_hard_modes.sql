-- 0086_pack_empire_hard_modes.sql
--
-- Pack Empire's hard modes.
--
--   Versus gets a format and a difficulty. Classic is what's always been there.
--   Even is one seed for both seats and no captain, kept in even_seed until a
--   seat starts on it.
--
--   Range and Ball Knower runs go on their own boards in game_runs, modes
--   'offense-range' and 'offense-season'. A blind run's first post is what
--   shows the player their numbers, so a deal can only ever go up once, by
--   anybody: otherwise one post from a throwaway guest would read the cards,
--   and a second could take the right ones.
--
--   The Daily gets its own table. One row per account, per day, per version,
--   created when the run starts. The server holds the picks as they're made
--   and deals one pack at a time, so a pack can't be seen before the last one
--   is answered, and a run can't be restarted or played twice. RLS on with no
--   policies, like every other pe_ table: server routes only.

alter table pe_versus
  add column if not exists format text not null default 'classic',
  add column if not exists difficulty text not null default 'open',
  add column if not exists even_seed text;

alter table pe_versus drop constraint if exists pe_versus_format_check;
alter table pe_versus add constraint pe_versus_format_check check (format in ('classic', 'even'));

alter table pe_versus drop constraint if exists pe_versus_difficulty_check;
alter table pe_versus add constraint pe_versus_difficulty_check check (difficulty in ('open', 'range', 'season'));

create unique index if not exists game_runs_blind_once_idx
  on game_runs (game, pool_id, mode, seed)
  where game = 'pack-empire' and mode in ('offense-range', 'offense-season') and week_start is null;

alter table pe_binder_packs drop constraint if exists pe_binder_packs_source_check;
alter table pe_binder_packs
  add constraint pe_binder_packs_source_check check (source in ('solo', 'versus', 'league', 'daily'));

create table if not exists pe_daily_runs (
  day           date not null,
  version       text not null check (version in ('range', 'season')),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,

  -- The captain's slot, or null on a day with no captain.
  captain       int,
  -- [{ id, slot }] in the order they were kept. `step` is its length, and every
  -- pick is written conditional on it, so a double tap can't sign two cards.
  picks         jsonb not null default '[]'::jsonb,
  step          int not null default 0,

  done          boolean not null default false,
  score         int,
  -- { lineup: Player[11], counted: number[11], cards, ruleDelta, chem }
  detail        jsonb,

  started_at    timestamptz not null default now(),
  finished_at   timestamptz,

  primary key (day, version, user_id)
);

create index if not exists pe_daily_board_idx
  on pe_daily_runs (day, version, score desc, finished_at asc)
  where done;

create index if not exists pe_daily_user_idx on pe_daily_runs (user_id, day desc);

alter table pe_daily_runs enable row level security;
