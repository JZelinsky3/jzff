-- 0067_player_values_injury_detail.sql
-- What is actually wrong with the player, not just that something is.
--
-- player_values stored injury_status and nothing else, so the richest thing
-- a trade write-up could say was "Out". That is enough to know a player is
-- unavailable and not enough to write a sentence about it, which is why
-- grades described a player who had just had knee surgery as simply "a top
-- TE" and moved on.
--
-- Sleeper already sends the detail in the same dictionary we were reading.
-- A checked example, live, the day this landed:
--
--   Brock Bowers  injury_status 'Out'  body_part 'Knee - Meniscus'  notes 'Surgery'
--   Tyreek Hill   injury_status ''     body_part 'Knee - ACL'       notes 'Surgery'
--
-- Two things follow. The detail is worth storing, and injury_status alone is
-- not a reliable test for "is this player hurt": Hill's is an empty string
-- while his knee is torn. Code reading these columns must treat body_part as
-- an injury signal in its own right, not as decoration on a status.
--
-- Coverage is partial and always will be: of 809 rostered skill players,
-- 105 had a body part and 19 had notes. NULL means "Sleeper said nothing",
-- never "healthy".
--
-- Deliberately NOT importing Sleeper's `status` field ('Active' / 'Inactive'
-- / 'Practice Squad'). It tracks roster standing rather than health, and
-- 'Inactive' on a free agent would read to a language model as an injury
-- when it means nothing of the kind.

alter table player_values add column if not exists injury_body_part text;
alter table player_values add column if not exists injury_notes     text;

notify pgrst, 'reload schema';
