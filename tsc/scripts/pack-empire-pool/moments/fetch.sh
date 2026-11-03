#!/bin/zsh
# Weekly box scores for the game + streak cards (not in the game yet).
#   nflv/week/w_YYYY.csv   nflverse player stats per game, 1999-2025, playoffs included
set -e
cd "$(dirname $0)/.."
LAST=${LAST_SEASON:-2025}
mkdir -p nflv/week
NV=https://github.com/nflverse/nflverse-data/releases/download
for y in $(seq 1999 $LAST); do
  [ -s nflv/week/w_$y.csv ] || curl -sSL -o nflv/week/w_$y.csv "$NV/stats_player/stats_player_week_$y.csv"
done
