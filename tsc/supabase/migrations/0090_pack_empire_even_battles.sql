-- 0090_pack_empire_even_battles.sql
--
-- Even Versus gets three Battles, drawn when the challenge opens (see
-- lib/packEmpire/battles.ts). Additive: null on Classic, and on Even games
-- opened before this, which play on without them.

alter table pe_versus add column if not exists battles text[];
