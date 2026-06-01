-- Per-chronicle league display alias.
--
-- The manager hub shows leagues by their archive name (leagues.name) today.
-- That name is shared across every chronicle that links the league, and it's
-- also what shows up on the public almanac — so renaming the archive row
-- to suit one user's hub would bleed into everywhere else.
--
-- This column lets a chronicle owner override how that league is *displayed
-- inside their own manager hub* without touching the archive itself. The
-- loaders use `coalesce(career_links.league_alias, leagues.name)` for hub
-- display only; the public almanac at /leagues/<slug>/ keeps the original
-- league name unaffected.
--
-- Nullable + no default — null means "use the archive name."

alter table career_links
  add column league_alias text null;

comment on column career_links.league_alias is
  'Per-chronicle display name override for the linked league inside the manager hub. Null = use leagues.name. Public almanac is unaffected.';
