-- Multi-source league support.
-- One archive (leagues row) may pull from multiple platform-specific league IDs
-- (e.g. user moved platforms, restarted with a new league, etc.).
-- Each source can be ingested independently; all seasons land in the same archive.

create table league_sources (
  id           uuid primary key default uuid_generate_v4(),
  league_id    uuid not null references leagues(id) on delete cascade,
  platform     platform_kind not null,
  external_id  text not null,
  label        text,                         -- optional user-given label, e.g. "Old league 2018-2020"
  last_synced_at timestamptz,
  walk_history boolean not null default true, -- if true, follow previous_league_id back
  created_at   timestamptz not null default now(),
  unique (league_id, platform, external_id)
);

create index league_sources_league_idx on league_sources(league_id);

alter table league_sources enable row level security;

create policy "sources access" on league_sources for select using (has_league_access(league_id));
create policy "sources write"  on league_sources for all    using (has_league_write(league_id));

-- Backfill: every existing leagues row gets a corresponding source.
insert into league_sources (league_id, platform, external_id, walk_history)
select id, platform, external_id, true from leagues
on conflict do nothing;
