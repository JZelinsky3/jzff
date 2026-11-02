-- 0096_pack_empire_locker_decks.sql
--
-- More than one saved deck per game. Additive, so anything reading `cards` keeps
-- working: `cards` stays the deck in play, `saved` holds every deck someone's built
-- as [{ id, name, cards, calls }], and `active` is the id of the one in `cards`. A
-- player with one deck from before this has an empty `saved`, and reads as Deck 1.

alter table pe_locker_decks add column if not exists saved jsonb not null default '[]'::jsonb;
alter table pe_locker_decks add column if not exists active text;
