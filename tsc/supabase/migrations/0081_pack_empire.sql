-- 0081_pack_empire.sql
--
-- Pack Empire, moved over from the standalone NFL MiniGames hub. Four modes:
-- Empire Builder (solo), Versus Challenge, Mega Draft and League Mode.
--
-- Every table is prefixed pe_ because this database already has `leagues`,
-- `league_members` and `profiles`, and they mean the almanac's leagues. A
-- Pack Empire league is twelve friends opening packs, not a fantasy league.
--
-- Nothing here is read or written from the browser. RLS is on and there are
-- no policies, so only the service role gets in: every read and write goes
-- through a server route that checks who is asking. That is a deliberate
-- change from the original, where the browser wrote its own scores, its own
-- draft results and its own league standings straight into the tables.

-- ============================================================
-- Empire Builder: the shared board
-- ============================================================
--
-- Solo runs go on the Games Page's own board (game_runs), re-dealt and
-- re-scored server-side from the seed like every other game there.

alter table game_runs
  drop constraint if exists game_runs_game_check;

alter table game_runs
  add constraint game_runs_game_check
  check (game in (
    'roulette', 'guess-the-draft', 'gauntlet', 'over-under', 'redraft', 'multiverse',
    'pack-empire'
  ));

-- ============================================================
-- Versus Challenge
-- ============================================================
--
-- Two people, the same draft, separate packs: highest total wins. The host
-- needs an account; the challenger can be anyone holding the link, which is
-- the point of sending one. A signed-out challenger's seat is a random key
-- the browser keeps, stored here only as its SHA-256.
--
-- Each side's seed is issued by the server when that side commits a captain,
-- and kept here, so a result can only be submitted against the packs that
-- seat was actually dealt.

create table if not exists pe_versus (
  id            text primary key,
  created_at    timestamptz not null default now(),

  host_id       uuid not null references auth.users (id) on delete cascade,
  host_name     text not null,
  host_seed     text,
  -- { lineup: Player[11], score, tier, captain, picks, at }
  host_result   jsonb,

  guest_id      uuid references auth.users (id) on delete set null,
  guest_key     text,
  guest_name    text,
  guest_seed    text,
  guest_result  jsonb,

  status        text not null default 'open'
                check (status in ('open', 'playing', 'done')),
  completed_at  timestamptz
);

create index if not exists pe_versus_host_idx on pe_versus (host_id, created_at desc);
create index if not exists pe_versus_guest_idx on pe_versus (guest_id, created_at desc);

alter table pe_versus enable row level security;

-- ============================================================
-- Mega Draft
-- ============================================================
--
-- A live two-seat snake draft off one shared board of 36. Seat 0 picks
-- first; who sits there is a coin flip when the second player arrives. The
-- board is public by design (both players see every card), so unlike a pack
-- it is stored whole. Picks are validated server-side: whose turn, whether
-- the player is still on the board, whether the picker has a slot for him.

create table if not exists pe_mega_drafts (
  id            text primary key,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  seed          text not null,
  -- Player[36]
  board         jsonb not null,
  -- [{ n, seat, id, slot }] in pick order
  picks         jsonb not null default '[]'::jsonb,

  host_id       uuid references auth.users (id) on delete set null,
  host_key      text,
  host_name     text not null,
  guest_id      uuid references auth.users (id) on delete set null,
  guest_key     text,
  guest_name    text,
  -- Which of host/guest holds seat 0, set by the coin when the guest sits.
  host_first    boolean,

  status        text not null default 'waiting'
                check (status in ('waiting', 'live', 'done')),
  completed_at  timestamptz
);

create index if not exists pe_mega_host_idx on pe_mega_drafts (host_id, created_at desc);
create index if not exists pe_mega_guest_idx on pe_mega_drafts (guest_id, created_at desc);

alter table pe_mega_drafts enable row level security;

-- ============================================================
-- League Mode
-- ============================================================
--
-- An eight-week season of weekly drafts. Every week each team opens a pack
-- for every slot it hasn't locked, then locks one player from that draft for
-- the rest of the season, so the weekly draft shrinks from eleven packs
-- towards four. Last week's rank buys a boosted pack. Chemistry (same-team
-- synergy, rival-team friction) is added to the raw score.
--
-- The commissioner advances the week. Drafts stay hidden from the rest of
-- the league until they do; standings are the cumulative total of revealed
-- weeks. Then a one-week Gauntlet halves the field and a one-week Final
-- crowns the team with the highest postseason total.

create table if not exists pe_leagues (
  id               text primary key,
  created_at       timestamptz not null default now(),
  name             text not null,
  commissioner_id  uuid not null references auth.users (id) on delete cascade,
  visibility       text not null default 'invite'
                   check (visibility in ('public', 'invite')),
  join_code        text not null unique,
  max_players      int  not null default 8 check (max_players between 4 and 12),
  -- 'half', or a team count
  playoff_size     text not null default 'half',
  phase            text not null default 'pregame'
                   check (phase in ('pregame', 'regular', 'gauntlet', 'finals', 'complete')),
  current_week     int  not null default 1,
  season_number    int  not null default 1
);

create index if not exists pe_leagues_public_idx on pe_leagues (visibility, phase, created_at desc);

alter table pe_leagues enable row level security;

create table if not exists pe_league_members (
  id               uuid primary key default gen_random_uuid(),
  league_id        text not null references pe_leagues (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  joined_at        timestamptz not null default now(),
  -- The account's board name at the time they joined; never an email.
  display_name     text not null,
  team_name        text,
  -- Sum of every revealed regular-season week.
  team_score       int  not null default 0,
  -- Sum of every revealed postseason week.
  playoff_score    int  not null default 0,
  next_pack_tier   text not null default 'standard_pack'
                   check (next_pack_tier in ('standard_pack', 'rising_pack', 'prime_pack', 'elite_drop')),
  -- [{ slot, player }] carried into every remaining regular-season week
  permanent_locks  jsonb not null default '[]'::jsonb,
  playoff_active   boolean not null default false,
  playoff_seed     int,
  unique (league_id, user_id)
);

create index if not exists pe_league_members_user_idx on pe_league_members (user_id);

alter table pe_league_members enable row level security;

create table if not exists pe_league_drafts (
  id               uuid primary key default gen_random_uuid(),
  league_id        text not null references pe_leagues (id) on delete cascade,
  member_id        uuid not null references pe_league_members (id) on delete cascade,
  user_id          uuid not null,
  season_number    int  not null,
  phase            text not null,
  week_number      int  not null,
  status           text not null default 'drafting'
                   check (status in ('drafting', 'submitted')),
  -- Server-only. Packs are dealt from it on request and never sent whole,
  -- so nobody can see a pack they haven't opened.
  seed             text not null,
  -- The pack tier this team earned for the week, and the slot they spent it
  -- on (null until chosen, -1 when declined or when the tier is standard).
  pack_tier        text not null,
  boosted_slot     int,
  -- [{ slot, player }] locks carried in at the start of the week
  carried          jsonb not null default '[]'::jsonb,
  -- [{ slot, id }] in the order the packs were opened
  picks            jsonb not null default '[]'::jsonb,
  -- The pack currently open. One at a time: open it, take a card.
  open_slot        int,
  roster           jsonb,
  draft_score      int,
  chemistry        jsonb,
  final_score      int,
  -- The player kept for the rest of the season after this week's reveal.
  locked_this_week text,
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  unique (league_id, member_id, season_number, phase, week_number)
);

create index if not exists pe_league_drafts_week_idx
  on pe_league_drafts (league_id, season_number, phase, week_number);

alter table pe_league_drafts enable row level security;
