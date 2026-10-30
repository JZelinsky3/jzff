#!/bin/zsh
# Pack Empire season pool: download every source into this folder (gitignored).
#
#   nflv/raw/reg_YYYY.csv   nflverse regular-season player stats, 1999-2025
#   nflv/players.csv        nflverse players (ids, career spans, headshots)
#   nflv/games.csv          nflverse schedules + scores, 1999+
#   nflv/elo_games.csv      FiveThirtyEight game scores, 1920-2020 (points before 1999)
#   fdp/YYYY.csv            official (PFR) season stats via fantasydatapros, 1970-2021
#   wiki/apYYYY.txt         Wikipedia "YYYY All-Pro Team", 1970-2025
#   wiki/pb/sYYYY.txt       Wikipedia Pro Bowl roster for season YYYY (game named YYYY+1)
#
# Wikipedia rate-limits hard: the loops below go one page every two seconds and
# retry with backoff. Re-running skips anything already downloaded.
set -e
cd "$(dirname $0)"
mkdir -p nflv/raw fdp wiki/pb
UA="PackEmpireResearch/1.0 (personal football stats project)"
get() { [ -s "$2" ] || curl -sSL -o "$2" "$1"; }

NV=https://github.com/nflverse/nflverse-data/releases/download
LAST=${LAST_SEASON:-2025}
for y in $(seq 1999 $LAST); do get "$NV/stats_player/stats_player_reg_$y.csv" nflv/raw/reg_$y.csv; done
get "$NV/players/players.csv" nflv/players.csv
get https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv nflv/games.csv
get https://raw.githubusercontent.com/fivethirtyeight/nfl-elo-game/master/data/nfl_games.csv nflv/elo_games.csv
for y in $(seq 1970 2021); do get "https://raw.githubusercontent.com/fantasydatapros/data/master/yearly/$y.csv" fdp/$y.csv; done

wiki() {  # title file minimum-bytes
  [ -s "$2" ] && [ $(wc -c < "$2") -gt $3 ] && return
  for attempt in 1 2 3 4; do
    curl -sSL -A "$UA" -o "$2" "https://en.wikipedia.org/w/index.php?title=$1&action=raw"
    [ $(wc -c < "$2") -gt $3 ] && break
    sleep $((attempt * 8))
  done
  sleep 2
}
for y in $(seq 1970 $LAST); do wiki "${y}_All-Pro_Team" wiki/ap$y.txt 2000; done
for y in $(seq 1970 $LAST); do
  n=$((y + 1)); [ $y -ge 2022 ] && t="${n}_Pro_Bowl_Games" || t="${n}_Pro_Bowl"
  wiki "$t" wiki/pb/s$y.txt 3000
done
echo fetched
