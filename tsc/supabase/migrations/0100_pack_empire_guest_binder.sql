-- 0100_pack_empire_guest_binder.sql
--
-- Pulls made signed out count for the whole site. A guest's Empire Builder run
-- already goes on the board under a typed name (0085); now its packs file too,
-- so its keeps show up in Pulls Of The Week, Top Collectors and every card's
-- site count, and a Canton kept signed out takes its number on the spot.
--
-- Guest packs get a table of their own, keyed on the browser's hashed key the
-- same way game_runs is. pe_binder_packs keeps its primary key and its writer.
-- When that browser signs in, pe_binder_claim moves the packs and the Canton
-- numbers onto the account, so the binder fills and the number never changes.
--
-- Additive: the readers union in a table that starts empty, so they return
-- exactly what they did until a guest run files. Service role only, like every
-- other pe_ function.

create table if not exists pe_binder_guest_packs (
  guest_key   text not null,
  guest_name  text not null,
  deal        text not null,
  slot        smallint not null check (slot between 0 and 10),
  cards       text[] not null,
  kept        text,
  source      text not null check (source in ('solo')),
  pool        text not null,
  created_at  timestamptz not null default now(),
  primary key (guest_key, deal, slot)
);

create index if not exists pe_binder_guest_packs_kept_idx on pe_binder_guest_packs (kept);
create index if not exists pe_binder_guest_packs_week_idx
  on pe_binder_guest_packs (created_at desc) where kept is not null;

alter table pe_binder_guest_packs enable row level security;

-- A guest's Canton number. Claiming sets user_id and clears this.
alter table pe_canton_serials add column if not exists guest_key text;
create unique index if not exists pe_canton_serials_guest_idx
  on pe_canton_serials (guest_key, deal, slot) where guest_key is not null;

-- ============================================================
-- Writing
-- ============================================================

create or replace function pe_binder_guest_file(p_key text, p_name text, p_pool text, p_packs jsonb)
returns void
language sql
as $$
  insert into pe_binder_guest_packs (guest_key, guest_name, deal, slot, cards, kept, source, pool)
  select p_key,
         p_name,
         p ->> 'deal',
         (p ->> 'slot')::smallint,
         array(select jsonb_array_elements_text(p -> 'cards')),
         p ->> 'kept',
         'solo',
         p_pool
    from jsonb_array_elements(p_packs) p
  on conflict (guest_key, deal, slot) do nothing;
$$;

-- pe_canton_stamp for a guest: same per-card lock, same next number.
create or replace function pe_canton_stamp_guest(p_key text, p_stamps jsonb)
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
       where c.guest_key = p_key and c.deal = s ->> 'deal' and c.slot = (s ->> 'slot')::smallint
    ) then
      insert into pe_canton_serials (card_id, serial, user_id, guest_key, deal, slot)
      select s ->> 'card', coalesce(max(c.serial), 0) + 1, null, p_key, s ->> 'deal', (s ->> 'slot')::smallint
        from pe_canton_serials c
       where c.card_id = s ->> 'card';
    end if;
  end loop;
end;
$$;

-- Moves a browser's guest packs and Canton numbers onto the account that just
-- signed in on it. A pack the account already filed (it posted the same deal
-- itself) stays the account's; the guest copy goes. A Canton number is spent
-- either way: if the account already holds that pack's number, the guest's
-- stays taken with no owner, the same as a deleted account's.
create or replace function pe_binder_claim(p_user uuid, p_key text)
returns int
language plpgsql
as $$
declare
  moved int;
begin
  insert into pe_binder_packs (user_id, deal, slot, cards, kept, source, pool, created_at)
  select p_user, g.deal, g.slot, g.cards, g.kept, g.source, g.pool, g.created_at
    from pe_binder_guest_packs g
   where g.guest_key = p_key
  on conflict (user_id, deal, slot) do nothing;
  get diagnostics moved = row_count;

  delete from pe_binder_guest_packs where guest_key = p_key;

  update pe_canton_serials c
     set user_id = p_user, guest_key = null
   where c.guest_key = p_key
     and not exists (
       select 1 from pe_canton_serials o
        where o.user_id = p_user and o.deal = c.deal and o.slot = c.slot
     );
  update pe_canton_serials set guest_key = null where guest_key = p_key;

  return moved;
end;
$$;

-- ============================================================
-- Reading: signed-in and guest keeps together
-- ============================================================

create or replace function pe_binder_site()
returns table (card_id text, pulls int, holders int)
language sql
stable
as $$
  select k.kept, count(*)::int, count(distinct k.who)::int
    from (
      select b.kept, b.user_id::text as who
        from pe_binder_packs b
       where b.kept is not null and b.source <> 'daily'
      union all
      select g.kept, 'g:' || g.guest_key
        from pe_binder_guest_packs g
       where g.kept is not null
    ) k
   group by k.kept
$$;

-- Return types change (a guest has a name and no user id), so these are dropped first.
drop function if exists pe_binder_collections();
create function pe_binder_collections()
returns table (user_id uuid, guest_name text, kept text[])
language sql
stable
as $$
  select k.user_id, max(k.guest_name), array_agg(distinct k.kept)
    from (
      select p.user_id, null::text as guest_name, null::text as guest_key, p.kept
        from pe_binder_packs p
       where p.kept is not null and p.source <> 'daily'
      union all
      select null::uuid, g.guest_name, g.guest_key, g.kept
        from pe_binder_guest_packs g
       where g.kept is not null
    ) k
   group by k.user_id, k.guest_key
   order by count(distinct k.kept) desc
   limit 25;
$$;

drop function if exists pe_binder_pulls(timestamptz, text[]);
create function pe_binder_pulls(p_since timestamptz, p_ids text[])
returns table (user_id uuid, guest_name text, deal text, kept text, source text, created_at timestamptz)
language sql
stable
as $$
  (select p.user_id, null::text, p.deal, p.kept, p.source, p.created_at
     from pe_binder_packs p
    where p.created_at >= p_since and p.kept = any(p_ids) and p.source <> 'daily'
    limit 1000)
  union all
  (select null::uuid, g.guest_name, g.deal, g.kept, g.source, g.created_at
     from pe_binder_guest_packs g
    where g.created_at >= p_since and g.kept = any(p_ids)
    limit 1000);
$$;

revoke all on function pe_binder_guest_file(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function pe_canton_stamp_guest(text, jsonb) from public, anon, authenticated;
revoke all on function pe_binder_claim(uuid, text) from public, anon, authenticated;
revoke all on function pe_binder_site() from public, anon, authenticated;
revoke all on function pe_binder_collections() from public, anon, authenticated;
revoke all on function pe_binder_pulls(timestamptz, text[]) from public, anon, authenticated;
grant execute on function pe_binder_guest_file(text, text, text, jsonb) to service_role;
grant execute on function pe_canton_stamp_guest(text, jsonb) to service_role;
grant execute on function pe_binder_claim(uuid, text) to service_role;
grant execute on function pe_binder_site() to service_role;
grant execute on function pe_binder_collections() to service_role;
grant execute on function pe_binder_pulls(timestamptz, text[]) to service_role;
