-- 0103_pack_empire_league_rebuild.sql
--
-- League Mode, rebuilt (2026-11-02): Standings Packs for every team, a weekly
-- twist, mulligans for the bottom half, locks that run out, and packs kept as
-- they're dealt. Additive: old rows read as before.

-- The cards each opened pack held, by slot: { "3": [card, ...] }. A pick is
-- taken from here, so a pool update mid-week can't change a pack already open.
-- Drafts from before this re-deal off their seed, as they always did.
alter table pe_league_drafts add column if not exists packs jsonb not null default '{}'::jsonb;
-- The week's twist the draft was started under (null: none).
alter table pe_league_drafts add column if not exists rule_id text;
-- The slot whose pack was thrown back, and what was in it, for the record.
alter table pe_league_drafts add column if not exists mulligan_slot int;
alter table pe_league_drafts add column if not exists thrown jsonb;

-- Earned at the close of a week by finishing in the bottom half of it.
alter table pe_league_members add column if not exists mulligan boolean not null default false;

-- The commissioner can turn the weekly twist off. On for every league.
alter table pe_leagues add column if not exists week_rules boolean not null default true;
