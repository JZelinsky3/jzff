-- 0084_pack_empire_binder_kept.sql
--
-- Two changes to Pack Empire, both additive.
--
-- 1. The binder holds KEPT cards only. Joey: the binder should be hard to
--    finish, not a prize for whoever opens the most packs, so the four cards
--    you passed on in a pack no longer count. One card per pack goes in. The
--    rows in pe_binder_packs already record which card was kept, so nothing
--    is rewritten; these are new readers. The old pe_binder_counts and
--    pe_binder_record stay until the code that calls them is gone.
--
--    pe_binder_site gives every card's count across the whole site, so a
--    card can say how rare it is.
--
-- 2. A CPU seat in Versus and Mega Draft, and Mega Draft seats held for a
--    friend (Versus already had invited_id).

-- ============================================================
-- The binder, kept cards only
-- ============================================================

create index if not exists pe_binder_packs_kept_idx on pe_binder_packs (kept);

-- Files packs (same as pe_binder_record) and returns the KEPT ids this player
-- had never kept before: the recap's "new to your binder".
create or replace function pe_binder_file(p_user uuid, p_source text, p_pool text, p_packs jsonb)
returns text[]
language plpgsql
as $$
declare
  incoming text[];
  seen text[];
  fresh text[];
begin
  select coalesce(array_agg(distinct p ->> 'kept'), '{}')
    into incoming
    from jsonb_array_elements(p_packs) p
   where p ->> 'kept' is not null;

  select coalesce(array_agg(distinct b.kept), '{}')
    into seen
    from pe_binder_packs b
   where b.user_id = p_user
     and b.kept = any (incoming);

  with ins as (
    insert into pe_binder_packs (user_id, deal, slot, cards, kept, source, pool)
    select p_user,
           p ->> 'deal',
           (p ->> 'slot')::smallint,
           array(select jsonb_array_elements_text(p -> 'cards')),
           p ->> 'kept',
           p_source,
           p_pool
      from jsonb_array_elements(p_packs) p
    on conflict (user_id, deal, slot) do nothing
    returning kept
  )
  select coalesce(array_agg(distinct kept), '{}')
    into fresh
    from ins
   where kept is not null
     and not (kept = any (seen));

  return fresh;
end;
$$;

-- One player's binder: how many times they kept each card.
create or replace function pe_binder_kept(p_user uuid)
returns table (card_id text, pulls int, first_at timestamptz)
language sql
stable
as $$
  select b.kept, count(*)::int, min(b.created_at)
    from pe_binder_packs b
   where b.user_id = p_user
     and b.kept is not null
   group by b.kept
$$;

-- Every card across the site: times kept, and by how many players.
create or replace function pe_binder_site()
returns table (card_id text, pulls int, holders int)
language sql
stable
as $$
  select b.kept, count(*)::int, count(distinct b.user_id)::int
    from pe_binder_packs b
   where b.kept is not null
   group by b.kept
$$;

-- Everyone with a binder.
create or replace function pe_binder_players()
returns int
language sql
stable
as $$
  select count(distinct user_id)::int from pe_binder_packs where kept is not null
$$;

revoke execute on function pe_binder_file(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function pe_binder_kept(uuid) from public, anon, authenticated;
revoke execute on function pe_binder_site() from public, anon, authenticated;
revoke execute on function pe_binder_players() from public, anon, authenticated;

-- ============================================================
-- CPU seats, and friend seats in Mega Draft
-- ============================================================

alter table pe_versus add column if not exists guest_bot boolean not null default false;

alter table pe_mega_drafts add column if not exists guest_bot boolean not null default false;
alter table pe_mega_drafts add column if not exists invited_id uuid references auth.users (id) on delete set null;
create index if not exists pe_mega_invited_idx on pe_mega_drafts (invited_id, created_at desc);
