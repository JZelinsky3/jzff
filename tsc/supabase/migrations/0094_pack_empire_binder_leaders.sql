-- 0094_pack_empire_binder_leaders.sql
--
-- Two readers for the front page, both additive: every collection, biggest
-- first, and the week's kept cards out of a list of the best ones. Card values
-- live in the pool, not here, so what counts as best is worked out in the app and
-- the ids come in as a list. Daily keeps are out, the same as the binder. Service
-- role only, like the other pe_ functions.

create index if not exists pe_binder_packs_week_idx
  on pe_binder_packs (created_at desc) where kept is not null and source <> 'daily';

create or replace function pe_binder_collections()
returns table (user_id uuid, kept text[])
language sql
stable
as $$
  select p.user_id, array_agg(distinct p.kept)
    from pe_binder_packs p
   where p.kept is not null and p.source <> 'daily'
   group by p.user_id
   order by count(distinct p.kept) desc
   limit 25;
$$;

create or replace function pe_binder_pulls(p_since timestamptz, p_ids text[])
returns table (user_id uuid, deal text, kept text, source text, created_at timestamptz)
language sql
stable
as $$
  select p.user_id, p.deal, p.kept, p.source, p.created_at
    from pe_binder_packs p
   where p.created_at >= p_since and p.kept = any(p_ids) and p.source <> 'daily'
   limit 1000;
$$;

revoke all on function pe_binder_collections() from public, anon, authenticated;
revoke all on function pe_binder_pulls(timestamptz, text[]) from public, anon, authenticated;
grant execute on function pe_binder_collections() to service_role;
grant execute on function pe_binder_pulls(timestamptz, text[]) to service_role;
