-- 0039_hub_trades.sql
-- Clubhouse Trade Room: standalone trade analyzer (no league required).
-- Members build a hypothetical trade from player names, analyze it against
-- the consensus value engine, and can publish it to a public board where
-- other members vote.
--
--   hub_trades      — one row per published trade. side_a / side_b are the
--                     asset arrays [{id,name,position,team,value}] frozen at
--                     publish time (values drift daily; the board shows what
--                     the analysis saw). Settings are denormalized so the
--                     board can label "Dynasty · SF · 12-team".
--   hub_trade_votes — one vote per (trade, user): 'a' | 'fair' | 'b'.
--
-- RLS: board is public-readable (the Clubhouse is browsable signed-out);
-- inserts/votes are own-scoped. The publish API re-runs the analysis
-- server-side so posted numbers can't be spoofed.

create table hub_trades (
  id           uuid primary key default uuid_generate_v4(),
  owner_id     uuid not null references profiles(id) on delete cascade,
  mode         text not null default 'redraft' check (mode in ('redraft','keeper','dynasty')),
  qb_starters  int  not null default 1 check (qb_starters in (1,2)),
  team_count   int  not null default 12 check (team_count between 4 and 32),
  uses_rosters boolean not null default false,
  side_a       jsonb not null,
  side_b       jsonb not null,
  delta_pct    numeric(8,4) not null default 0,
  grade_a      text not null,
  grade_b      text not null,
  verdict_a    text,
  verdict_b    text,
  created_at   timestamptz not null default now()
);

create index hub_trades_created_idx on hub_trades(created_at desc);
create index hub_trades_owner_idx   on hub_trades(owner_id);

alter table hub_trades enable row level security;

create policy "hub_trades public read" on hub_trades for select using (true);
create policy "hub_trades insert own"  on hub_trades for insert with check (owner_id = auth.uid());
create policy "hub_trades delete own"  on hub_trades for delete using (owner_id = auth.uid());

create table hub_trade_votes (
  trade_id   uuid not null references hub_trades(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  vote       text not null check (vote in ('a','fair','b')),
  created_at timestamptz not null default now(),
  primary key (trade_id, user_id)
);

create index hub_trade_votes_trade_idx on hub_trade_votes(trade_id);

alter table hub_trade_votes enable row level security;

create policy "hub_trade_votes public read" on hub_trade_votes for select using (true);
create policy "hub_trade_votes insert own"  on hub_trade_votes for insert with check (user_id = auth.uid());
create policy "hub_trade_votes update own"  on hub_trade_votes for update using (user_id = auth.uid());
create policy "hub_trade_votes delete own"  on hub_trade_votes for delete using (user_id = auth.uid());

notify pgrst, 'reload schema';
