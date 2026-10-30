-- 0083_pack_empire_binder.sql
--
-- The Pack Empire binder: every card a signed-in player has pulled, and how
-- often. Cards are seasons, so a man's binder page runs from his best year
-- to his worst, each with its own count.
--
-- What is stored is the PACK, not the card: one row per pack opened, with the
-- five ids dealt and the one kept. A pack is a pure function of its deal and
-- its slot, so (user, deal, slot) is the natural key, and recording the same
-- pack twice (a re-posted run, a banked run claimed on a second device, a
-- binder catching up on old runs) is a no-op instead of a double count.
--
--   deal  'solo:<seed>'   Empire Builder and Versus Challenge
--         'league:<seed>' a League Mode week
--
-- Written by the server only, after it has re-dealt the pack itself: a run
-- posted to the board, a Versus lineup, a League pick. RLS on, no policies,
-- like every other pe_ table.

create table if not exists pe_binder_packs (
  user_id     uuid not null references auth.users (id) on delete cascade,
  deal        text not null,
  slot        smallint not null check (slot between 0 and 10),
  cards       text[] not null,
  kept        text,
  source      text not null check (source in ('solo', 'versus', 'league')),
  -- POOL_VERSION the pack was dealt from; card ids are name + season, so
  -- they carry across rebuilds, and this says which pool they came out of.
  pool        text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, deal, slot)
);

alter table pe_binder_packs enable row level security;

-- ============================================================
-- Recording
-- ============================================================
--
-- Takes a run's (or a pick's) packs as JSON, inserts the ones not already
-- there, and hands back the card ids this player had never pulled before:
-- the recap's "new to your binder".
--
--   p_packs: [{ "deal": "solo:ABC…", "slot": 0, "cards": ["qb-…", …], "kept": "qb-…" }, …]

create or replace function pe_binder_record(p_user uuid, p_source text, p_pool text, p_packs jsonb)
returns text[]
language plpgsql
as $$
declare
  incoming text[];
  seen text[];
  fresh text[];
begin
  select coalesce(array_agg(distinct c), '{}')
    into incoming
    from jsonb_array_elements(p_packs) p, jsonb_array_elements_text(p -> 'cards') c;

  select coalesce(array_agg(distinct c), '{}')
    into seen
    from pe_binder_packs b, unnest(b.cards) c
   where b.user_id = p_user
     and c = any (incoming);

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
    returning cards
  )
  select coalesce(array_agg(distinct c), '{}')
    into fresh
    from ins, unnest(ins.cards) c
   where not (c = any (seen));

  return fresh;
end;
$$;

-- ============================================================
-- Reading
-- ============================================================

create or replace function pe_binder_counts(p_user uuid)
returns table (card_id text, pulls int, keeps int, first_at timestamptz)
language sql
stable
as $$
  select c,
         count(*)::int,
         count(*) filter (where c = b.kept)::int,
         min(b.created_at)
    from pe_binder_packs b, unnest(b.cards) c
   where b.user_id = p_user
   group by c
$$;

-- The server calls these with the service role. Nobody else needs them: the
-- table has no policies, so they would come back empty anyway, but a function
-- that takes a user id shouldn't be on the public API at all.
revoke execute on function pe_binder_record(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function pe_binder_counts(uuid) from public, anon, authenticated;
