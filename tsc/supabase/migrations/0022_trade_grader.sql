-- 0022_trade_grader.sql
-- Trade Grader: stores completed trades pulled from the league's platform and
-- (Phase 2) an LLM-generated grade for each side with a 4-week revisit.
--
-- Data shape:
--   trades         — one row per executed trade. raw_payload keeps the original
--                    platform response so we can replay/debug without re-fetching.
--   trade_sides    — one row per participating team. assets is a JSON array of
--                    {kind: 'player'|'pick'|'faab', ...} objects.
--   trade_grades   — one row per trade_side. Initial grade fires when the trade
--                    is first detected; revisit_* fields fire 4 weeks later
--                    against updated standings + player values.
--
-- league_type: lets the grader weight rest-of-season (redraft) vs. multi-year
-- value (dynasty/keeper) appropriately. Defaults to 'redraft' for existing rows.

-- ============================================================
-- LEAGUE TYPE (redraft | keeper | dynasty)
-- ============================================================
alter table leagues
  add column if not exists league_type text not null default 'redraft';

alter table leagues
  drop constraint if exists leagues_league_type_check;
alter table leagues
  add constraint leagues_league_type_check
  check (league_type in ('redraft','keeper','dynasty'));


-- ============================================================
-- TRADES
-- ============================================================
create table trades (
  id           uuid primary key default uuid_generate_v4(),
  league_id    uuid not null references leagues(id) on delete cascade,
  season_id    uuid not null references seasons(id) on delete cascade,
  platform     platform_kind not null,
  external_id  text not null,                  -- platform's transaction id
  week         int,                            -- league week (nullable for pre-season)
  executed_at  timestamptz not null,
  status       text not null default 'completed',  -- completed | vetoed | reverted
  raw_payload  jsonb not null,
  created_at   timestamptz not null default now(),
  unique (league_id, platform, external_id)
);

create index trades_league_idx on trades(league_id, executed_at desc);
create index trades_season_idx on trades(season_id);

alter table trades enable row level security;

create policy "trades read"  on trades for select using (has_league_access(league_id));
create policy "trades write" on trades for all    using (has_league_write(league_id));


-- ============================================================
-- TRADE SIDES (one per team in the trade)
-- ============================================================
-- assets shape: [{kind:'player', player_id, name, position, team},
--                {kind:'pick',   season_year, round, original_owner_manager_id},
--                {kind:'faab',   amount}]
create table trade_sides (
  id         uuid primary key default uuid_generate_v4(),
  trade_id   uuid not null references trades(id) on delete cascade,
  manager_id uuid not null references managers(id) on delete cascade,
  assets     jsonb not null,
  created_at timestamptz not null default now(),
  unique (trade_id, manager_id)
);

create index trade_sides_trade_idx   on trade_sides(trade_id);
create index trade_sides_manager_idx on trade_sides(manager_id);

alter table trade_sides enable row level security;

create policy "trade_sides read" on trade_sides for select using (
  exists (select 1 from trades t where t.id = trade_sides.trade_id and has_league_access(t.league_id))
);
create policy "trade_sides write" on trade_sides for all using (
  exists (select 1 from trades t where t.id = trade_sides.trade_id and has_league_write(t.league_id))
);


-- ============================================================
-- TRADE GRADES (LLM-generated; Phase 2 wires the call)
-- ============================================================
create table trade_grades (
  id                  uuid primary key default uuid_generate_v4(),
  trade_side_id       uuid not null references trade_sides(id) on delete cascade,

  -- Initial grade (at trade detection)
  grade               text,    -- 'A+' .. 'F'
  blurb               text,
  value_score         real,
  position_need_score real,
  model               text,    -- e.g. 'groq:llama-3.3-70b-versatile'
  graded_at           timestamptz not null default now(),

  -- 4-week revisit
  revisit_grade       text,
  revisit_blurb       text,
  revisit_value_score real,
  revisited_at        timestamptz,

  unique (trade_side_id)
);

create index trade_grades_side_idx on trade_grades(trade_side_id);

alter table trade_grades enable row level security;

create policy "trade_grades read" on trade_grades for select using (
  exists (
    select 1 from trade_sides ts
    join trades t on t.id = ts.trade_id
    where ts.id = trade_grades.trade_side_id and has_league_access(t.league_id)
  )
);
create policy "trade_grades write" on trade_grades for all using (
  exists (
    select 1 from trade_sides ts
    join trades t on t.id = ts.trade_id
    where ts.id = trade_grades.trade_side_id and has_league_write(t.league_id)
  )
);

notify pgrst, 'reload schema';
