#!/bin/zsh
# Pack Empire season pool: rebuild src/lib/packEmpire/data/season-pool.json.
#
#   ./fetch.sh      once (and again after a season ends, with LAST_SEASON=YYYY)
#   ./build.sh      seasons -> team offense -> skill picks -> line picks -> JSON
#   python3 sim/fastsim.py ../../src/lib/packEmpire/data/season-pool.json
#                   greedy runs on the ladder; the old pool sat at a median of
#                   about 18.3k with about 30% reaching GOAT
#
# Reports of every pick land in build/skill_report.txt and build/ol_report.txt.
# After a rebuild, bump POOL_VERSION in src/lib/packEmpire/pool.ts.
#
# A rebuild adds nothing and drops nothing: every card already dealt stays,
# re-valued, because people hold them in binders (seasons.dealt). PE_ADD=1 fills
# each rarity to its target, PE_FRESH=1 samples from scratch. A man's two seasons
# landing on one rarity settle in build/settle.py; vault.json is what it took out.
set -e
cd "$(dirname $0)"
python3 build/seasons.py
python3 build/offense.py > /dev/null
python3 build/photos.py
python3 build/select_skill.py > build/skill_report.txt
python3 build/select_ol.py > build/ol_report.txt 2>&1
python3 build/export.py
