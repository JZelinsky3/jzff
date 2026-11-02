-- 0097_pack_empire_locker_shop.sql
--
-- The Locker's Shop. FAAB is earned by winning and by selling spare copies, and
-- spent on packs. It can't be bought, won off anyone or taken out. All additive.
--
--   pe_locker_wallets  what each player has to spend. Every change goes through a
--                      function below, so a balance can't go under zero or be
--                      spent twice.
--
-- A bought pack is an ordinary row in pe_locker_packs, source 'reward', with a random
-- grant_key, since you can buy the same pack as often as you can afford it. 'purchase'
-- stays kept for real money, which this isn't.

create table if not exists pe_locker_wallets (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  faab       int not null default 0 check (faab >= 0),
  updated_at timestamptz not null default now()
);

alter table pe_locker_wallets enable row level security;

create or replace function pe_locker_earn(p_user uuid, p_amount int)
returns int
language plpgsql
as $$
declare
  v_faab int;
begin
  insert into pe_locker_wallets (user_id, faab)
  values (p_user, greatest(p_amount, 0))
  on conflict (user_id)
  do update set faab = pe_locker_wallets.faab + greatest(p_amount, 0), updated_at = now()
  returning faab into v_faab;
  return v_faab;
end;
$$;

-- Sells every copy past the first of these cards, at one price each. The last copy
-- of a card is never for sale. Returns what it paid.
create or replace function pe_locker_sell(p_user uuid, p_cards text[], p_each int)
returns int
language plpgsql
as $$
declare
  v_copies int;
begin
  with sold as (
    select card_id, count - 1 as spare
      from pe_locker_cards
     where user_id = p_user and card_id = any(p_cards) and count > 1
       for update
  ), done as (
    update pe_locker_cards c
       set count = 1
      from sold
     where c.user_id = p_user and c.card_id = sold.card_id
    returning sold.spare
  )
  select coalesce(sum(spare), 0) into v_copies from done;

  if v_copies > 0 then
    perform pe_locker_earn(p_user, v_copies * p_each);
  end if;
  return v_copies * p_each;
end;
$$;

-- Buys a pack: the money comes out and the pack goes in together, or neither does.
-- Null means they couldn't afford it.
create or replace function pe_locker_buy(p_user uuid, p_kind text, p_price int)
returns uuid
language plpgsql
as $$
declare
  v_pack uuid;
begin
  update pe_locker_wallets
     set faab = faab - p_price, updated_at = now()
   where user_id = p_user and faab >= p_price;
  if not found then
    return null;
  end if;

  insert into pe_locker_packs (user_id, kind, grant_key, source)
  values (p_user, p_kind, gen_random_uuid()::text, 'reward')
  returning id into v_pack;
  return v_pack;
end;
$$;

revoke execute on function pe_locker_earn(uuid, int) from public, anon, authenticated;
revoke execute on function pe_locker_sell(uuid, text[], int) from public, anon, authenticated;
revoke execute on function pe_locker_buy(uuid, text, int) from public, anon, authenticated;
