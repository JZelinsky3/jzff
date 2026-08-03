-- "Which manager are you in this league?"
--
-- One account, one manager, per league. This is the fact that lets a league
-- leaderboard print the name the league actually knows you by rather than
-- your site account name: nobody in PA Milk Society knows you as an email
-- address, they know you as the manager who has been losing to them since
-- 2019.
--
-- Deliberately its own table rather than a reuse of `career_links`, which
-- already stores something close ("the platform user_id the subscriber chose
-- as me in this league"). career_links hangs off `career_chronicles`, which
-- is the Manager Hub, which is vaulted — so reusing it would couple every
-- league board to a feature that is currently switched off. This table is
-- the general fact; the Hub can read it if it ever comes back.
--
-- `manager_id` points at the PRIMARY manager of a merged profile group, the
-- same convention the rivalries rows use, so a person who appears under two
-- manager rows in one league is still one claim.

create table league_claims (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  profile_id  uuid not null references profiles (id) on delete cascade,
  league_id   uuid not null references leagues (id) on delete cascade,
  manager_id  uuid not null references managers (id) on delete cascade,

  -- One claim per account per league: you are one person in one league, and
  -- a second claim would mean two names for one player on one board.
  unique (profile_id, league_id),
  -- And one account per manager: without this, everyone in the league could
  -- claim to be the person who won it. Self-claim with no verification is
  -- fine among twelve people who know each other, but it should at least be
  -- first-come, and visibly taken afterwards.
  unique (league_id, manager_id)
);

-- Resolving a whole board's worth of names filters by league first, which
-- neither unique index above can serve (both lead with another column).
create index league_claims_league_idx on league_claims (league_id);

alter table league_claims enable row level security;

-- Public read: these names are already printed on public leaderboards, and
-- the claim is what makes them right. Writes go through the API route's
-- admin client, which checks the manager really belongs to that league.
create policy league_claims_public_read on league_claims
  for select using (true);

notify pgrst, 'reload schema';
