-- Paste into Supabase → SQL Editor. Read-only.
-- Gives the two numbers PostgREST cannot: true on-disk size, and how much of
-- it is index vs TOAST. Everything else in this repo can only estimate.

-- 1. Whole database, against the plan quota (Free = 500 MB, Pro = 8 GB).
select pg_size_pretty(pg_database_size(current_database())) as database_size;

-- 2. Per-table, biggest first. `toast` is where sunday_live_frames.payload
--    actually lives once compressed, so it is the number that matters there.
select
  c.relname                                                as table_name,
  pg_size_pretty(pg_total_relation_size(c.oid))            as total,
  pg_size_pretty(pg_relation_size(c.oid))                  as heap,
  pg_size_pretty(pg_indexes_size(c.oid))                   as indexes,
  pg_size_pretty(coalesce(pg_total_relation_size(c.reltoastrelid), 0)) as toast,
  c.reltuples::bigint                                      as approx_rows
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc;

-- 3. What the Sunday Live frames actually cost, and what a prune would return.
--    keep_latest_per_week is what survives if you keep only the newest frame
--    per (league, year, week) -- enough for the archive permalink.
select
  count(*)                                                  as frames,
  count(distinct (league_id, year, week))                   as keep_latest_per_week,
  pg_size_pretty(sum(pg_column_size(payload)))              as compressed_payload,
  pg_size_pretty(sum(octet_length(payload::text)))          as uncompressed_payload
from sunday_live_frames;
