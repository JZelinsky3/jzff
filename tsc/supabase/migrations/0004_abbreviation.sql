-- Optional commissioner-supplied abbreviation for the league
-- (e.g. "PAMS" for "PA Milk Society"). When null the exporter and route
-- handler derive initials from the league name.

alter table leagues
  add column abbreviation text;
