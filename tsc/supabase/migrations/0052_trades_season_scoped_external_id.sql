-- Trade external ids are only unique WITHIN a season, not within a league.
--
-- NFL.com numbers transactions 1..N per season, so trade 1663 exists in both
-- 2021 and 2023. With `unique (league_id, platform, external_id)` the second
-- season's upsert overwrote the first season's row (moving its season_id and
-- replacing its sides) instead of inserting, silently dropping trades from
-- history. pams lost 3 that way: 2020/2186, 2021/1663, 2023/901.
--
-- Season-scope the constraint. Sleeper/Yahoo ids are already globally unique,
-- so this only loosens things for the platforms that need it.

alter table trades drop constraint if exists trades_league_id_platform_external_id_key;

alter table trades
  add constraint trades_league_platform_season_external_key
  unique (league_id, platform, season_id, external_id);
