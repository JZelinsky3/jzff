-- 0082_friends.sql
--
-- Friends, a board name, and the records the profile page reads.
--
-- The old games site found friends by searching usernames. This site has no
-- usernames (display names are seeded from the signup email) and a search box
-- over every account would be a directory of strangers, so there are four
-- doors instead, all of them people you already know:
--
--   link     your own invite link. Whoever opens it and accepts is your
--            friend straight away: you sent it, they tapped it, both sides
--            have said yes. Resettable, so a link that got out can be killed.
--   league   people from your leagues (owners, bookmarkers, anyone who has
--            claimed a manager there). A request; they accept.
--   code     a member code typed in by hand. A request; they accept. Member
--            codes show on public boards for anyone without a name, so a
--            code alone must never be enough to make a friendship.
--   versus   the person you just played. A request; they accept.
--
-- Nothing here is read or written from the browser. RLS is on with no
-- policies; every read and write goes through /api/friends, which checks who
-- is asking.

-- ============================================================
-- Friendships
-- ============================================================

create table if not exists friendships (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  requester_id  uuid not null references auth.users (id) on delete cascade,
  addressee_id  uuid not null references auth.users (id) on delete cascade,
  status        text not null default 'pending'
                check (status in ('pending', 'accepted')),
  source        text not null default 'code'
                check (source in ('link', 'league', 'code', 'versus')),
  accepted_at   timestamptz,
  check (requester_id <> addressee_id)
);

-- One row per pair, whichever way round it was asked. Declining, cancelling
-- and unfriending all delete the row, so asking again later just works.
create unique index if not exists friendships_pair_idx
  on friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_requester_idx on friendships (requester_id);
create index if not exists friendships_addressee_idx on friendships (addressee_id);

alter table friendships enable row level security;

-- ============================================================
-- Invite links
-- ============================================================
--
-- One live token per account, made the first time the profile asks for it.
-- Resetting swaps the token, which kills every copy of the old link at once.

create table if not exists friend_links (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  token       text not null unique,
  created_at  timestamptz not null default now()
);

alter table friend_links enable row level security;

-- ============================================================
-- Board name
-- ============================================================
--
-- The name a player goes by on site-wide boards, to friends and at the Pack
-- Empire table. Separate from display_name, which is seeded from the signup
-- email or the Google full name and is what the admin pages read.
--
-- Profiles carry a self-update policy, so the shape rules are enforced here
-- as well as in the server action. The slur screen can only run server-side.

alter table profiles
  add column if not exists board_name text;

alter table profiles
  drop constraint if exists profiles_board_name_check;

alter table profiles
  add constraint profiles_board_name_check
  check (
    board_name is null
    or (char_length(board_name) between 2 and 24 and position('@' in board_name) = 0)
  );

-- ============================================================
-- Friend challenges
-- ============================================================
--
-- A Versus challenge sent to one friend holds the other seat for them: only
-- that account can take it. It also puts the challenge in their list before
-- they have opened it, which is how they find out it exists.

alter table pe_versus
  add column if not exists invited_id uuid references auth.users (id) on delete set null;

create index if not exists pe_versus_invited_idx on pe_versus (invited_id, created_at desc);

-- ============================================================
-- League Mode titles
-- ============================================================
--
-- A new season wipes the standings, so the champion was only knowable until
-- the commissioner rolled it over. Counted at the Final instead.

alter table pe_league_members
  add column if not exists titles int not null default 0;
