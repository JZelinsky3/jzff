-- 0031_udfa_rename.sql
-- Repurpose the testing-window flag as the permanent UDFA (free) tier marker.
-- Semantics: is_udfa = true means this league has the free feature set
-- (all-time standings + rivalries + manager top strip only; everything else
-- blurred with an upgrade CTA). The flag is stamped at creation time when
-- the user has no active subscription and no comp grant.

alter table leagues
  rename column created_during_testing to is_udfa;
