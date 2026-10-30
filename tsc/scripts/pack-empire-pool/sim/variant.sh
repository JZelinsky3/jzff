#!/bin/zsh
# usage: variant.sh name '<skill targets json>' '<ol targets json>' '<sample floor json>'
cd "$(dirname $0)/.."
SF="$4"; [ -z "$SF" ] && SF='{}'
PE_FRESH=1 PE_TARGETS="$2" PE_SAMPLE_FLOOR="$SF" python3 build/select_skill.py > sim/$1.skill.txt 2>&1 || { tail -5 sim/$1.skill.txt; exit 1; }
PE_FRESH=1 PE_TARGETS="$3" python3 build/select_ol.py > sim/$1.ol.txt 2>&1 || { tail -5 sim/$1.ol.txt; exit 1; }
PE_OUT=sim/$1.json python3 build/export.py | sed -n 2,10p
python3 sim/fastsim.py sim/$1.json 2000
