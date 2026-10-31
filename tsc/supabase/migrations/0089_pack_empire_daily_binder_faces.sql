-- 0089_pack_empire_daily_binder_faces.sql
--
-- Two changes to Pack Empire, both additive.
--
-- 1. The Daily stops counting toward the binder. Everyone who plays a day opens
--    the same packs, so filing them inflated those players' pull counts. The
--    readers skip source 'daily', which also takes care of the rows already
--    filed: they stay in pe_binder_packs, they just aren't counted.
--
-- 2. Photos uploaded from the complete binder. pe_card_faces lays a photo over
--    a card's pool image without a deploy, and works on stored lineups too
--    because it's applied where the card is drawn. RLS on with no policies,
--    server routes only, like the other pe_ tables.

-- ============================================================
-- The binder without the Daily
-- ============================================================

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
     and b.source <> 'daily'
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

create or replace function pe_binder_kept(p_user uuid)
returns table (card_id text, pulls int, first_at timestamptz)
language sql
stable
as $$
  select b.kept, count(*)::int, min(b.created_at)
    from pe_binder_packs b
   where b.user_id = p_user
     and b.kept is not null
     and b.source <> 'daily'
   group by b.kept
$$;

create or replace function pe_binder_site()
returns table (card_id text, pulls int, holders int)
language sql
stable
as $$
  select b.kept, count(*)::int, count(distinct b.user_id)::int
    from pe_binder_packs b
   where b.kept is not null
     and b.source <> 'daily'
   group by b.kept
$$;

revoke execute on function pe_binder_file(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function pe_binder_kept(uuid) from public, anon, authenticated;
revoke execute on function pe_binder_site() from public, anon, authenticated;

-- ============================================================
-- Uploaded photos
-- ============================================================

create table if not exists pe_card_faces (
  card_id text primary key,
  img text not null,
  -- The object in the bucket. Cards from one upload share it.
  path text not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists pe_card_faces_path_idx on pe_card_faces (path);

alter table pe_card_faces enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pack-empire-faces', 'pack-empire-faces', true, 4194304, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;
