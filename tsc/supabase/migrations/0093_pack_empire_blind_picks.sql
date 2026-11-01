-- 0093_pack_empire_blind_picks.sql
--
-- Range and Ball Knower turn over the four cards you passed on the moment you
-- keep one. Everything else about a Builder run lives in the browser until it's
-- posted, so without a record here anyone could send a throwaway pick, read the
-- pack, and draft with the answers. A pick goes in this table BEFORE the pack
-- turns, and the run has to match it when it's scored.
--
-- `run` is the seed. An Even Versus seat is the seed plus its seat, because both
-- seats share one seed. The primary key is the lock: two picks racing for the
-- same place can't both land. RLS on with no policies, server routes only, like
-- the other pe_ tables.

create table if not exists pe_blind_picks (
  run text not null,
  n smallint not null,
  slot smallint not null,
  card_id text not null,
  created_at timestamptz not null default now(),
  primary key (run, n),
  unique (run, slot)
);

alter table pe_blind_picks enable row level security;
