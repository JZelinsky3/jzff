-- 0016_league_bookmarks.sql
-- Users can bookmark public almanacs they want to follow without owning
-- the league. Shows up on /dashboard as a separate section.
--
-- One row per (user, league) pair; composite PK so a user can't double-
-- bookmark. Cascades both directions: if the user is deleted or the
-- league is deleted, the bookmark row goes with it.

create table if not exists league_bookmarks (
  user_id    uuid not null references auth.users(id) on delete cascade,
  league_id  uuid not null references leagues(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, league_id)
);

create index if not exists league_bookmarks_user_idx on league_bookmarks (user_id);

-- RLS: a user can read / write only their own bookmarks. Service role (used
-- by the API route handlers) bypasses RLS as usual.
alter table league_bookmarks enable row level security;

create policy "own bookmarks readable" on league_bookmarks
  for select using (auth.uid() = user_id);

create policy "own bookmarks insertable" on league_bookmarks
  for insert with check (auth.uid() = user_id);

create policy "own bookmarks deletable" on league_bookmarks
  for delete using (auth.uid() = user_id);
