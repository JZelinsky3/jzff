-- 0099_pack_empire_locker_trophies.sql
--
-- The Trophy Case. Every game reports what happened at the end of a match, and a
-- trophy is a number off that report with something to claim. All additive.
--
--   pe_locker_trophies  one row a player: the running numbers, and what they've
--                       claimed. Trophies themselves are data in the code, so adding
--                       one is a line there and every player's progress already counts.
--
-- A claim goes through a function, so the reward lands and the trophy is marked in one
-- step, and a double tap can't pay twice.

create table if not exists pe_locker_trophies (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  stats      jsonb not null default '{}',
  claimed    text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table pe_locker_trophies enable row level security;

-- Adds to some numbers and overwrites others. Returns where they all stand.
create or replace function pe_locker_tally(p_user uuid, p_add jsonb default '{}', p_set jsonb default '{}')
returns jsonb
language plpgsql
as $$
declare
  v_stats jsonb;
  v_key   text;
  v_by    numeric;
begin
  insert into pe_locker_trophies (user_id) values (p_user) on conflict (user_id) do nothing;
  select stats into v_stats from pe_locker_trophies where user_id = p_user for update;
  for v_key, v_by in select key, value::numeric from jsonb_each_text(p_add) loop
    v_stats := jsonb_set(v_stats, array[v_key], to_jsonb(coalesce((v_stats ->> v_key)::numeric, 0) + v_by));
  end loop;
  v_stats := v_stats || p_set;
  update pe_locker_trophies set stats = v_stats, updated_at = now() where user_id = p_user;
  return v_stats;
end;
$$;

-- Claims a trophy: it's marked and its reward lands together, or neither happens. False
-- means it was already claimed. A pack's grant_key is the trophy, so it can only come once.
create or replace function pe_locker_claim(p_user uuid, p_id text, p_faab int, p_card text, p_pack text)
returns boolean
language plpgsql
as $$
begin
  insert into pe_locker_trophies (user_id) values (p_user) on conflict (user_id) do nothing;
  update pe_locker_trophies
     set claimed = array_append(claimed, p_id), updated_at = now()
   where user_id = p_user and not (p_id = any (claimed));
  if not found then
    return false;
  end if;

  if coalesce(p_faab, 0) > 0 then
    perform pe_locker_earn(p_user, p_faab);
  end if;
  if p_card is not null then
    insert into pe_locker_cards (user_id, card_id) values (p_user, p_card)
    on conflict (user_id, card_id) do update set count = pe_locker_cards.count + 1;
  end if;
  if p_pack is not null then
    insert into pe_locker_packs (user_id, kind, grant_key, source)
    values (p_user, p_pack, 'trophy:' || p_id, 'reward')
    on conflict (user_id, kind, grant_key) do nothing;
  end if;
  return true;
end;
$$;

revoke execute on function pe_locker_tally(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function pe_locker_claim(uuid, text, int, text, text) from public, anon, authenticated;
