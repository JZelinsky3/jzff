-- 0101_pack_empire_versus_mystery.sql
--
-- Mystery Versus: each seat's own captain, then ten packs of mixed positions in a
-- line, on Classic Versus's richer odds. The seed says it's a Mystery seat, so
-- nothing else in the table changes; the format column just has to allow it.
-- Additive: every existing row is 'classic' or 'even'.

alter table pe_versus drop constraint if exists pe_versus_format_check;
alter table pe_versus add constraint pe_versus_format_check check (format in ('classic', 'even', 'mystery'));
