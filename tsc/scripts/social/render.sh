#!/bin/bash
# ============================================================
# Renders the social artboards to PNG with headless Chrome.
#
#   ./render.sh triptych
#   ./render.sh cover --label "The Clubhouse" --accent steel
#   ./render.sh cover --label "Leagues" --kicker "Section" \
#                     --sub "Every season, every manager, one page." \
#                     --accent rust --num "02" --out leagues
#
# Everything is drawn at 2x (--force-device-scale-factor=2) and then
# downsampled to 1080x1350 with sips. Rendering at 1x and rendering at
# 2x-then-down are not the same picture: the second supersamples the
# hairlines, the crop marks and the serif stems, all of which are
# sub-pixel at 1x and would otherwise alias. The 2x files are kept in
# out/2x/ in case a crop or a larger placement is ever wanted.
#
# 1080x1350 is what actually gets uploaded. Instagram re-encodes
# anything wider than 1080 on the way in, and its downscaler is worse
# than sips.
# ============================================================
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/out"
OUT2X="$OUT/2x"
mkdir -p "$OUT2X"

[ -x "$CHROME" ] || { echo "Google Chrome not found at $CHROME"; exit 1; }

# shot <url-with-query> <basename> <css-width> <css-height>
#
# Chrome is launched detached and killed once the PNG has stopped
# growing. --headless=new writes the screenshot and then does not exit
# on this build (it sits there holding the profile), so waiting on the
# process never returns. Polling the output file is the reliable
# signal: two identical byte counts a second apart means the encoder
# has finished.
shot() {
  local url="$1" name="$2" w="$3" h="$4"
  local profile target pid last size
  profile="$(mktemp -d)"
  target="$OUT2X/${name}.png"
  rm -f "$target"

  "$CHROME" \
    --headless=new \
    --disable-gpu \
    --hide-scrollbars \
    --force-device-scale-factor=2 \
    --window-size="${w},${h}" \
    --user-data-dir="$profile" \
    --virtual-time-budget=4000 \
    --screenshot="$target" \
    "$url" >/dev/null 2>&1 &
  pid=$!

  last=-1
  for _ in $(seq 1 40); do
    sleep 1
    [ -f "$target" ] || continue
    size=$(stat -f%z "$target")
    [ "$size" = "$last" ] && [ "$size" -gt 0 ] && break
    last="$size"
  done

  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  rm -rf "$profile"

  [ -s "$target" ] || { echo "  FAILED: $name"; return 1; }

  cp "$OUT2X/${name}.png" "$OUT/${name}.png"
  sips -z "$h" "$w" "$OUT/${name}.png" >/dev/null
  echo "  out/${name}.png  (${w}x${h})"
}

case "${1:-}" in

  triptych)
    echo "Rendering pinned triptych:"
    shot "file://$HERE/triptych.html?sheet=1" "triptych-spread" 3240 1350
    for n in 1 2 3; do
      shot "file://$HERE/triptych.html?panel=$n" "triptych-$n" 1080 1350
    done
    echo
    echo "Post order: 3, then 2, then 1. See README.md."
    ;;

  cover)
    shift
    LABEL="Section"; SUB=""; KICKER="The Sunday Chronicle"
    ACCENT="gold"; NUM=""; SHOT=""; PHONE=""; NAME=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --label)  LABEL="$2";  shift 2 ;;
        --sub)    SUB="$2";    shift 2 ;;
        --kicker) KICKER="$2"; shift 2 ;;
        --accent) ACCENT="$2"; shift 2 ;;
        --num)    NUM="$2";    shift 2 ;;
        --shot)   SHOT="$2";   shift 2 ;;
        --phone)  PHONE="$2";  shift 2 ;;
        --out)    NAME="$2";   shift 2 ;;
        *) echo "unknown option: $1"; exit 1 ;;
      esac
    done

    # Default filename from the label: lowercase, non-alphanumerics to
    # hyphens, no leading/trailing hyphen.
    if [ -z "$NAME" ]; then
      NAME="cover-$(echo "$LABEL" \
        | tr '[:upper:]' '[:lower:]' \
        | sed -e 's/[^a-z0-9]\{1,\}/-/g' -e 's/^-//' -e 's/-$//')"
    fi

    # URL-encode each value. python3 is present on every macOS that can
    # run this; the alternative (a sed table) breaks on the first
    # apostrophe in a subtitle.
    enc() { python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$1"; }

    Q="label=$(enc "$LABEL")&kicker=$(enc "$KICKER")&accent=$(enc "$ACCENT")"
    [ -n "$SUB"   ] && Q="$Q&sub=$(enc "$SUB")"
    [ -n "$NUM"   ] && Q="$Q&num=$(enc "$NUM")"
    # Screenshot paths are passed through as-is: they are file:// or
    # relative paths, and encoding the slashes would break them.
    [ -n "$SHOT"  ] && Q="$Q&shot=$SHOT"
    [ -n "$PHONE" ] && Q="$Q&phone=$PHONE"

    echo "Rendering cover \"$LABEL\":"
    shot "file://$HERE/cover.html?$Q" "$NAME" 1080 1350
    ;;

  # ./render.sh carousel [slide-number ...]
  #
  # The offseason carousel. With no arguments it renders all ten
  # slides; with numbers it renders only those, which is what you want
  # while iterating on one panel.
  carousel)
    shift
    SLIDES=("$@")
    [ ${#SLIDES[@]} -eq 0 ] && SLIDES=(1 2 3 4 5 6 7 8 9 10)
    echo "Rendering offseason carousel:"
    for i in "${SLIDES[@]}"; do
      shot "file://$HERE/offseason.html?slide=$i" \
           "offseason-$(printf '%02d' "$i")" 1080 1350
    done
    ;;

  # ./render.sh grab <url> <name> [width] [height]
  #
  # Captures a page into shots/ so it can be fed to cover.html's
  # --shot / --phone. Defaults to a phone viewport, with a phone UA so
  # the site serves its mobile tree (getViewMode() sniffs the agent).
  grab)
    shift
    URL="${1:?usage: render.sh grab <url> <name> [w] [h]}"
    NAME="${2:?usage: render.sh grab <url> <name> [w] [h]}"
    W="${3:-430}"; H="${4:-932}"
    mkdir -p "$HERE/shots"
    profile="$(mktemp -d)"
    echo "Grabbing $URL:"
    "$CHROME" \
      --headless=new --disable-gpu --hide-scrollbars \
      --force-device-scale-factor=2 \
      --window-size="${W},${H}" \
      --user-data-dir="$profile" \
      --virtual-time-budget=9000 \
      --user-agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" \
      --screenshot="$HERE/shots/${NAME}.png" \
      "$URL" >/dev/null 2>&1 &
    pid=$!
    last=-1
    for _ in $(seq 1 45); do
      sleep 1
      [ -f "$HERE/shots/${NAME}.png" ] || continue
      size=$(stat -f%z "$HERE/shots/${NAME}.png")
      [ "$size" = "$last" ] && [ "$size" -gt 0 ] && break
      last="$size"
    done
    kill "$pid" 2>/dev/null || true
    rm -rf "$profile"
    echo "  shots/${NAME}.png"
    ;;

  *)
    sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
