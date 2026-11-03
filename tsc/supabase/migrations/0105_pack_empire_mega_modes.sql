-- 0105_pack_empire_mega_modes.sql
--
-- Mega Draft modes: a format (Classic, Chemistry's team-stacked board, or three
-- Battles) and the same four card difficulties as Empire Builder and Versus.
-- The board, the cap and the Battles all follow from the seed and these two,
-- so nothing else is stored. Additive: every existing draft is Classic Standard.

alter table pe_mega_drafts add column if not exists format text not null default 'classic';
alter table pe_mega_drafts add column if not exists difficulty text not null default 'open';

alter table pe_mega_drafts drop constraint if exists pe_mega_drafts_format_check;
alter table pe_mega_drafts add constraint pe_mega_drafts_format_check check (format in ('classic', 'chem', 'battles'));
alter table pe_mega_drafts drop constraint if exists pe_mega_drafts_difficulty_check;
alter table pe_mega_drafts add constraint pe_mega_drafts_difficulty_check check (difficulty in ('open', 'range', 'season', 'cap'));
