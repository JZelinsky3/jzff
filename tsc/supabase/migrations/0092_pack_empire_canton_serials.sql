-- 0092_pack_empire_canton_serials.sql
--
-- A Canton's number, shown in the binder: the 5th Lamar Jackson 2019 ever pulled
-- is 5/5, then 5/6, 5/7 as others pull it. Yours never changes, the total climbs,
-- and every Canton counts on its own.
--
-- A table of its own rather than a count over pe_binder_packs, because those rows
-- go when an account is deleted, and a number must never move. So user_id here is
-- set null instead, and the number stays spent.
--
-- Additive: nothing reads or writes this until the code does, and nothing else
-- depends on it. Written with the service key only, like the binder.

create table if not exists pe_canton_serials (
  card_id     text not null,
  serial      int not null check (serial > 0),
  user_id     uuid references auth.users (id) on delete set null,
  deal        text not null,
  slot        smallint not null,
  created_at  timestamptz not null default now(),
  primary key (card_id, serial),
  unique (user_id, deal, slot)
);

create index if not exists pe_canton_serials_user_idx on pe_canton_serials (user_id);

alter table pe_canton_serials enable row level security;

-- Takes [{ "card": "qb-…", "deal": "solo:ABC…", "slot": 0 }, …] and gives each pack
-- not already stamped the next number of its card. The lock is per card, so two
-- pulls of the same Canton can't land on one number; re-filing a pack is a no-op.
create or replace function pe_canton_stamp(p_user uuid, p_stamps jsonb)
returns void
language plpgsql
as $$
declare
  s jsonb;
begin
  for s in select * from jsonb_array_elements(p_stamps) loop
    perform pg_advisory_xact_lock(hashtext('pe_canton:' || (s ->> 'card')));
    if not exists (
      select 1 from pe_canton_serials c
       where c.user_id = p_user and c.deal = s ->> 'deal' and c.slot = (s ->> 'slot')::smallint
    ) then
      insert into pe_canton_serials (card_id, serial, user_id, deal, slot)
      select s ->> 'card', coalesce(max(c.serial), 0) + 1, p_user, s ->> 'deal', (s ->> 'slot')::smallint
        from pe_canton_serials c
       where c.card_id = s ->> 'card';
    end if;
  end loop;
end;
$$;

-- Cantons kept before this existed take their numbers in the order they were kept.
insert into pe_canton_serials (card_id, serial, user_id, deal, slot, created_at)
select b.kept,
       row_number() over (partition by b.kept order by b.created_at, b.user_id, b.deal, b.slot),
       b.user_id, b.deal, b.slot, b.created_at
  from pe_binder_packs b
 where b.kept = any (array[
   'rb-marshall-faulk-2000', 'qb-lamar-jackson-2019', 'te-travis-kelce-2020',
   'rb-priest-holmes-2002', 'wr-cooper-kupp-2021', 'te-rob-gronkowski-2011',
   'wr-davante-adams-2020', 'qb-aaron-rodgers-2011', 'rb-ladainian-tomlinson-2006',
   'wr-jerry-rice-1995'
 ])
on conflict do nothing;
