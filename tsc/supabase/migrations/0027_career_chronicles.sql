-- 0027_career_chronicles.sql
-- The Manager Hub: a subscriber's personal, cross-league career showcase.
--
-- This is the manager-centric mirror of the league almanac. Where the almanac
-- is owned by a commissioner and scoped to one league, a *career chronicle* is
-- owned by an individual user and spans every league they play in. The user
-- links each league and tells us which platform identity ("manager") is them;
-- the chronicle then rolls their stats up across all of it into a book.
--
-- NAMING NOTE: do NOT confuse these tables with `manager_profiles` (0006).
-- `manager_profiles` is a LEAGUE-scoped canonical-person identity that the
-- commissioner merges during almanac setup. `career_chronicles` here is a
-- USER-scoped showcase. Different owner, different purpose.
--
-- Model:
--   career_chronicles  = one row per user (their book). Has a slug for a future
--                        public/share route; for now reads are owner-only.
--   career_links       = which leagues belong to the chronicle + which platform
--                        identity (manager_external_id = the platform user_id)
--                        the user picked as "me" in each one. Tier-capped.
--   leagues.manager_view = true for leagues auto-ingested *only* to feed a
--                        chronicle. These stay out of the public archive list
--                        and the dashboard's "Your leagues" shelf.

-- ── leagues flag ────────────────────────────────────────────────────────────
-- Existing rows become false (they're real archives). New hub-only leagues set
-- this true so they don't pollute the commissioner-facing archive surfaces.
alter table leagues
  add column if not exists manager_view boolean not null default false;

create index if not exists leagues_manager_view_idx on leagues(manager_view);

-- ── career_chronicles ───────────────────────────────────────────────────────
create table career_chronicles (
  id           uuid primary key default uuid_generate_v4(),
  owner_id     uuid not null references profiles(id) on delete cascade,
  slug         text not null unique,
  display_name text not null,
  subtitle     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- One chronicle per user for now. A user's whole career is a single book;
  -- they add leagues to it rather than creating multiple books.
  unique (owner_id)
);

create index career_chronicles_owner_idx on career_chronicles(owner_id);

-- ── career_links ────────────────────────────────────────────────────────────
create table career_links (
  id                     uuid primary key default uuid_generate_v4(),
  chronicle_id           uuid not null references career_chronicles(id) on delete cascade,
  league_id              uuid not null references leagues(id) on delete cascade,
  source                 platform_kind not null,
  -- The platform user_id the subscriber chose as "me" in this league. Joins to
  -- managers.external_id within the same league after the league is synced.
  manager_external_id    text not null,
  -- Denormalized at link time from the live member list so we can show who they
  -- picked before the league has ever been synced.
  display_name_in_league text,
  created_at             timestamptz not null default now(),
  -- A league can only be linked once per chronicle.
  unique (chronicle_id, league_id)
);

create index career_links_chronicle_idx on career_links(chronicle_id);
create index career_links_league_idx    on career_links(league_id);

-- ── updated_at ──────────────────────────────────────────────────────────────
create trigger career_chronicles_updated_at
  before update on career_chronicles
  for each row execute function set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table career_chronicles enable row level security;
alter table career_links      enable row level security;

-- Chronicles: owner-only for everything. (A public share route can add a
-- published_at gate + a public read policy later.)
create policy "chronicles owner select" on career_chronicles
  for select using (owner_id = auth.uid());
create policy "chronicles owner insert" on career_chronicles
  for insert with check (owner_id = auth.uid());
create policy "chronicles owner update" on career_chronicles
  for update using (owner_id = auth.uid());
create policy "chronicles owner delete" on career_chronicles
  for delete using (owner_id = auth.uid());

-- Links: gated through the parent chronicle's owner.
create policy "links owner select" on career_links
  for select using (
    exists (select 1 from career_chronicles c where c.id = chronicle_id and c.owner_id = auth.uid())
  );
create policy "links owner write" on career_links
  for all using (
    exists (select 1 from career_chronicles c where c.id = chronicle_id and c.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from career_chronicles c where c.id = chronicle_id and c.owner_id = auth.uid())
  );

notify pgrst, 'reload schema';
