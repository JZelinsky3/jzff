-- 0098_pack_empire_locker_versus.sql
--
-- Field General against another person. All additive: a CPU game is a row with no
-- guest, and reads the way it always has.
--
--   guest_id    the other seat, once they've sat down. `user_id` stays seat one.
--   invited_id  who a challenge is held for. Null is an open link.
--   winner_id   who won, whichever seat they were in. Wins are counted off this.
--   locks       plays a seat has locked in and the other hasn't answered yet, by
--               seat. They stay on the server: nobody sees them until both are in.
--   deadline    when the drive runs out. Whoever hasn't locked by then passes it.
--   version     bumped on every write, so two seats locking at once can't lose one.
--
-- 'waiting' is a challenge nobody's taken yet.

alter table pe_locker_matches add column if not exists guest_id uuid references auth.users (id) on delete cascade;
alter table pe_locker_matches add column if not exists invited_id uuid references auth.users (id) on delete cascade;
alter table pe_locker_matches add column if not exists winner_id uuid references auth.users (id) on delete set null;
alter table pe_locker_matches add column if not exists locks jsonb not null default '{}'::jsonb;
alter table pe_locker_matches add column if not exists deadline timestamptz;
alter table pe_locker_matches add column if not exists version int not null default 0;

alter table pe_locker_matches drop constraint if exists pe_locker_matches_status_check;
alter table pe_locker_matches add constraint pe_locker_matches_status_check check (status in ('waiting', 'live', 'won', 'lost', 'drawn', 'resigned'));

update pe_locker_matches set winner_id = user_id where status = 'won' and winner_id is null;

create index if not exists pe_locker_matches_guest_idx on pe_locker_matches (guest_id, game) where status = 'live';
create index if not exists pe_locker_matches_invited_idx on pe_locker_matches (invited_id) where status = 'waiting';
create index if not exists pe_locker_matches_winner_idx on pe_locker_matches (winner_id, day);
