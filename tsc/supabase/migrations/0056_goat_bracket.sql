-- The greatest team in league history, settled by bracket.
--
-- Sixteen team-seasons, four rounds, one vote per manager per round. The
-- field itself is NOT in here: it is frozen in src/lib/greatestTeam.ts,
-- because seeds that could move after somebody has voted in round one would
-- not be a bracket. This holds only what the room does to it.
--
-- Same integrity model as the win-total ballot (0053/0054): manager_name is
-- text rather than a managers.id reference, since voting is open to whoever
-- holds the share link and there is no account to resolve at write time.

create table goat_bracket (
  league_id  uuid not null references leagues (id) on delete cascade,
  -- Which running of the tournament. Lets the league do this again in a later
  -- offseason without colliding with the votes from this one.
  edition    int  not null,

  -- Settled games: { "r16-0": 1, "r16-1": 9, ... } game id -> winning seed.
  -- Written when the commissioner closes a round, never derived on read, so a
  -- vote arriving late cannot flip a result the bracket has already advanced
  -- past.
  results    jsonb not null default '{}'::jsonb,

  -- The round currently taking votes ('r16' | 'qf' | 'sf' | 'final'), or null
  -- between rounds. This is the gate: with no open round the public page is a
  -- bracket to read, not a card to fill in.
  open_round text,

  -- Whether the running vote counts are public. Sealed by default so the room
  -- sees a receipt rather than a bandwagon while a round is live.
  revealed   boolean not null default false,

  created_at timestamptz not null default now(),

  primary key (league_id, edition)
);

create table goat_votes (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  league_id    uuid not null references leagues (id) on delete cascade,
  edition      int  not null,
  round        text not null check (round in ('r16', 'qf', 'sf', 'final')),
  manager_name text not null,

  -- { "r16-0": 16, "r16-1": 8, ... } one key per game open in that round,
  -- valued with the seed that voter advanced.
  picks        jsonb not null,

  -- One card per manager per round. The whole integrity model: a second
  -- submission under a name already used is refused by the database, not by
  -- a cookie somebody can clear.
  unique (league_id, edition, round, manager_name)
);

-- The room reads one league+edition's votes at a time, usually narrowed to a
-- round; the unique index leads with league_id and serves that, but the
-- round-scoped read is the hot path and deserves its own.
create index goat_votes_league_round_idx on goat_votes (league_id, edition, round);

-- No policies, by design: RLS on with zero policies denies anon and
-- authenticated outright. Every read and write goes through the service-role
-- client behind either the share token (voting) or a league write-access
-- check (the room).
alter table goat_bracket enable row level security;
alter table goat_votes   enable row level security;
