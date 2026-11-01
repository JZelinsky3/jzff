-- 0095_pack_empire_locker.sql
--
-- The Locker: a card collection of its own, for games built on owning cards rather
-- than drafting them. Nothing here touches the binder. All additive.
--
--   pe_locker_packs    every pack anyone's been given, opened or not. What makes a
--                      pack one of a kind is (user, kind, grant_key): the starter
--                      is 'once', a daily or a bonus is its day, so a double tap or
--                      a refresh can't hand out two. `source` says how it came:
--                      'free' and 'reward' today, and a priced pack later needs only
--                      a new kind and a source of 'purchase', with the receipt as
--                      its grant_key.
--   pe_locker_cards    what each player owns, and how many of each.
--   pe_locker_decks    one saved deck per player per game.
--   pe_locker_matches  a game in progress and how it ended. The server holds the
--                      state, so the CPU's hand never reaches the browser. Wins are
--                      counted off this table across every game, by `day`.
--
-- RLS on with no policies, like every other pe_ table: server routes only.

create table if not exists pe_locker_packs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null,
  grant_key  text not null,
  source     text not null default 'free' check (source in ('free', 'reward', 'purchase')),
  cards      text[],
  created_at timestamptz not null default now(),
  opened_at  timestamptz,
  unique (user_id, kind, grant_key)
);

create index if not exists pe_locker_packs_waiting_idx on pe_locker_packs (user_id) where opened_at is null;

create table if not exists pe_locker_cards (
  user_id  uuid not null references auth.users (id) on delete cascade,
  card_id  text not null,
  count    int not null default 1 check (count > 0),
  first_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create table if not exists pe_locker_decks (
  user_id    uuid not null references auth.users (id) on delete cascade,
  game       text not null,
  cards      text[] not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, game)
);

create table if not exists pe_locker_matches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  game        text not null,
  event       text,
  state       jsonb not null,
  status      text not null default 'live' check (status in ('live', 'won', 'lost', 'drawn', 'resigned')),
  -- The day it finished, in the Daily's clock. Null until then.
  day         date,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists pe_locker_matches_live_idx on pe_locker_matches (user_id, game) where status = 'live';
create index if not exists pe_locker_matches_wins_idx on pe_locker_matches (user_id, day) where status = 'won';

alter table pe_locker_packs enable row level security;
alter table pe_locker_cards enable row level security;
alter table pe_locker_decks enable row level security;
alter table pe_locker_matches enable row level security;

-- Opens a pack: the cards go on the row and into the collection in one step, or
-- not at all. False means it was already open, so a double tap files nothing twice.
create or replace function pe_locker_open(p_user uuid, p_pack uuid, p_cards text[])
returns boolean
language plpgsql
as $$
begin
  update pe_locker_packs
     set cards = p_cards, opened_at = now()
   where id = p_pack
     and user_id = p_user
     and opened_at is null;
  if not found then
    return false;
  end if;

  insert into pe_locker_cards (user_id, card_id, count)
  select p_user, c, count(*)::int
    from unnest(p_cards) c
   group by c
  on conflict (user_id, card_id)
  do update set count = pe_locker_cards.count + excluded.count;

  return true;
end;
$$;

revoke execute on function pe_locker_open(uuid, uuid, text[]) from public, anon, authenticated;
