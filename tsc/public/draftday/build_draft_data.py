#!/usr/bin/env python3
"""
Build the static data files that back the PAMS 2026 draft day board.

Outputs into draftday/data/:
  players.json   - every draftable NFL player, Sleeper ranked, with rookie flag
  history.json   - player name -> every time PAMS has drafted him, 2019-2025
  managers.json  - the twelve managers: Sleeper identity + PAMS career + draft habits

Run this any time before the draft to refresh rankings. It only reads public
Sleeper endpoints and the site's own data/ folder, so it is safe to re-run.
"""

import json
import os
import re
import subprocess
import sys
import unicodedata
from collections import defaultdict
from urllib.request import urlopen

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data")

# PAMS draft history, 2019-2025. Vendored into source/ rather than read from
# Supabase or another repo: completed drafts are frozen history, they will
# never change, and the board must build with nothing else running.
SRC = os.path.join(HERE, "source")

LEAGUE_ID = "1304235036874149888"
DRAFT_ID = "1304235037553590272"

FANTASY_POS = {"QB", "RB", "WR", "TE", "K", "DEF"}

# Sleeper account -> PAMS manager. Confirmed by Joey 2026-08-19.
# Sleeper display names are unreliable here: "Cnnr430" is Connie, and Connor
# drafts as "Atkinsson". Always key on these ids, never on the handle.
MANAGER_MAP = [
    # sleeper_id,             pams_id,   name,      slot
    ("458329320843112448",    21680682, "Ricci",    1),
    ("868712689332031488",    21239480, "Connor",   2),
    ("1346560472878452736",   30533399, "Evan",     3),
    ("739747288599150592",    21680417, "Chris",    4),
    ("591884559361040384",    21679440, "Joey",     5),
    ("1360402900567728128",   22539599, "Charlie",  6),
    ("1358933101526409216",   21679454, "Connie",   7),
    ("728702248099663872",    21688760, "Sean",     8),
    (None,                    25036608, "Luke",     9),   # not on Sleeper yet
    ("866125212939329536",    21679447, "Mason",   10),
    ("609426003600670720",    21680087, "Kyle",    11),
    ("739751326224969728",    25033943, "Isaac",   12),
]

CONFERENCE = {
    "Joey": "Whole", "Sean": "Whole", "Kyle": "Whole",
    "Evan": "Whole", "Connor": "Whole", "Connie": "Whole",
    "Ricci": "Skim", "Chris": "Skim", "Isaac": "Skim",
    "Mason": "Skim", "Charlie": "Skim", "Luke": "Skim",
}

SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}


def norm_name(name):
    """Fold a player name down to something that matches across data sources.

    PAMS history comes from NFL.com and Sleeper spells plenty of names
    differently (accents, periods, Jr.). This strips all of that.
    """
    if not name:
        return ""
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("&", "and")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    parts = [p for p in s.split() if p and p not in SUFFIXES]
    return " ".join(parts)


def fetch(url):
    """Sleeper over HTTPS.

    Prefer curl: this Mac's Python has no CA bundle installed, so urlopen
    fails cert verification. Fall back to urlopen where curl is absent.
    """
    try:
        out = subprocess.run(
            ["curl", "-sSfL", "--max-time", "120", url],
            capture_output=True, check=True,
        ).stdout
        return json.loads(out)
    except (FileNotFoundError, subprocess.CalledProcessError):
        with urlopen(url, timeout=120) as r:
            return json.load(r)


def fetch_consensus():
    """Real 1QB draft rankings from TSC's own consensus board.

    Sleeper's `search_rank` is a search-popularity order, not a draft board:
    it had Josh Allen 4th overall because superflex and dynasty players search
    quarterbacks constantly. TSC already blends ESPN, Sleeper ADP and
    FantasyPros into a proper redraft board at /api/mock-board, and asking it
    for qbs=1 puts Allen at 29 where he belongs.

    Needs the TSC server running (`npm run dev`) or TSC_BASE pointed at
    production. Falls back to search_rank order if neither answers, so the
    build never hard-fails the week of the draft.
    """
    base = os.environ.get("TSC_BASE", "http://localhost:3000").rstrip("/")
    url = f"{base}/api/mock-board?scoring=ppr&qbs=1"
    print(f"fetching consensus draft board from {base} ...")
    try:
        board = fetch(url)
        rows = board.get("players") or []
        if not rows:
            raise ValueError("empty board")
        ok = [s["label"] for s in board.get("sources", []) if s.get("ok")]
        print(f"  consensus over {', '.join(ok)} -> {len(rows)} ranked players")
        return {str(p["id"]): i + 1 for i, p in enumerate(rows)}
    except Exception as e:
        print(f"  WARNING: consensus board unavailable ({e}).")
        print("  Falling back to Sleeper search_rank, which ranks QBs too high.")
        print("  Start the TSC dev server and re-run before draft night.")
        return {}


def build_players():
    print("fetching Sleeper player dump (~14mb)...")
    raw = fetch("https://api.sleeper.app/v1/players/nfl")
    consensus = fetch_consensus()

    players = []
    for pid, p in raw.items():
        pos = p.get("position")
        if pos not in FANTASY_POS:
            continue
        rank = p.get("search_rank")
        # Sleeper parks unranked players at 9999999.
        if not rank or rank >= 9999999:
            continue
        if pos != "DEF" and not p.get("active"):
            continue

        name = p.get("full_name") or (
            f"{p.get('first_name','')} {p.get('last_name','')}".strip()
        )
        if pos == "DEF":
            # Defenses come through with the team as the id.
            name = f"{p.get('first_name','')} {p.get('last_name','')}".strip() or pid

        yrs = p.get("years_exp")
        players.append({
            "id": pid,
            "name": name,
            "n": norm_name(name),
            "pos": pos,
            "team": p.get("team") or "FA",
            "rank": rank,
            "rookie": yrs == 0,
            "exp": yrs,
            "age": p.get("age"),
            "num": p.get("number"),
            "inj": p.get("injury_status") or None,
        })

    # Order the board: everyone the consensus ranks goes first, in its order.
    # Everyone else follows in Sleeper's order, which is fine that deep since
    # those players are waiver fodder anyway. search_rank ties are settled by
    # name so the ordering is stable between builds.
    ranked = len(consensus)
    for p in players:
        c = consensus.get(p["id"])
        p["consensus"] = c
        p["sort"] = (0, c) if c else (1, p["rank"], p["name"])

    players.sort(key=lambda x: x["sort"])
    for i, p in enumerate(players, 1):
        p["board"] = i
        del p["sort"]

    if ranked:
        print(f"  {ranked} players carry a consensus rank, "
              f"{len(players) - ranked} fall in behind on Sleeper order")

    # Positional rank off the same ordering (the RB4, WR12 chips).
    seen = defaultdict(int)
    for p in players:
        seen[p["pos"]] += 1
        p["posrank"] = seen[p["pos"]]

    print(f"  {len(players)} draftable players")
    return players


def build_history(players):
    """Map every player to the times PAMS has drafted him."""
    by_norm = defaultdict(list)
    pams_ids = {m[1]: m[2] for m in MANAGER_MAP}

    years = []
    for year in range(2019, 2026):
        path = os.path.join(SRC, "drafts", f"{year}.json")
        if not os.path.exists(path):
            continue
        years.append(year)
        with open(path) as f:
            d = json.load(f)
        for pick in d["picks"]:
            n = norm_name(pick["player_name"])
            if not n:
                continue
            # Prefer the mapped current-manager name; fall back to whatever the
            # scrape called them (covers departed managers like Krish and CJ).
            mgr = pams_ids.get(pick.get("user_id"), pick.get("manager_name"))
            by_norm[n].append({
                "y": year,
                "p": pick["overall_pick"],
                "r": pick["round"],
                "m": mgr,
                "pos": pick.get("position"),
                "active": pick.get("user_id") in pams_ids,
            })

    for n in by_norm:
        by_norm[n].sort(key=lambda x: -x["y"])

    # Only ship history for players actually on this year's board.
    board_names = {p["n"] for p in players}
    history = {n: v for n, v in by_norm.items() if n in board_names}

    matched = len(history)
    print(f"  {matched} of {len(players)} board players have PAMS draft history "
          f"({years[0]}-{years[-1]})")
    return history


def load_power_ranks():
    """The Milk Order, this offseason's 1-12 power ranking.

    Keyed by the nickname the ranking used, where Connor is "Cat".
    """
    path = os.path.join(SRC, "dossier.json")
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        d = json.load(f)
    alias = {"Cat": "Connor"}
    return {alias.get(k, k): v.get("rank") for k, v in d.items()}


def load_season_file():
    """source/seasons.json — every PAMS season, built from TSC's database.

    Written by build_seasons.mjs, vendored the same way the drafts are. It
    replaces what used to be read out of the hand-built dossier: the ledger,
    the career record, the playoff record, points a game, titles and top-three
    finishes all come from here now, so they are one set of numbers that agree
    with each other and with the site. See build_seasons.mjs for the three
    playoff rules it applies, and why the dossier's version of them was wrong.
    """
    path = os.path.join(SRC, "seasons.json")
    if not os.path.exists(path):
        print("  WARNING: source/seasons.json missing. Run build_seasons.mjs.")
        return {}
    with open(path) as f:
        return json.load(f).get("managers", {})


def load_last_season(seasons):
    """Each manager's 2025: record, where he finished, points rank, seed.

    Feeds the facts strip beside the clock and the on-the-clock card. Off the
    corrected ledger, so a manager who missed the playoffs shows the finish he
    actually earned in the regular season rather than wherever the consolation
    bracket left him.
    """
    out = {}
    for name, m in seasons.items():
        year = next((y for y in m.get("ledger", []) if y.get("y") == 2025), None)
        if not year:
            continue
        out[name] = {
            "record": year.get("rec"),
            "finish": year.get("fin"),
            "points_rank": year.get("pfr"),
            "seed": year.get("seed"),
        }
    return out


def load_finishes(seasons):
    """Each manager's final standing in every season he has played."""
    return {name: {y["y"]: y["fin"] for y in m.get("ledger", [])}
            for name, m in seasons.items()}


def load_round_picks():
    """Every pick a manager has made, filed by the round he made it in.

    The showcase's history band follows the round the draft is actually in —
    on the clock in round two it shows every second rounder the man has ever
    taken — so it needs all fourteen rounds rather than just the first the way
    round1_history does. Oldest year first, which is the order it reads in.
    """
    pams_ids = {m[1]: m[2] for m in MANAGER_MAP}
    out = defaultdict(lambda: defaultdict(list))
    for year in range(2019, 2026):
        path = os.path.join(SRC, "drafts", f"{year}.json")
        if not os.path.exists(path):
            continue
        with open(path) as f:
            d = json.load(f)
        for pick in d["picks"]:
            name = pams_ids.get(pick.get("user_id"))
            if not name:
                continue
            out[name][pick["round"]].append({
                "y": year,
                "ov": pick["overall_pick"],
                "pos": pick["position"],
                "player": pick["player_name"],
            })
    return {
        name: {str(r): sorted(v, key=lambda p: p["y"])
               for r, v in sorted(rounds.items())}
        for name, rounds in out.items()
    }


def load_last_year():
    """Each manager's 2025 pick in each round.

    Feeds the "he took X here last year" line on the clock, so the round the
    board is in maps to the pick he made in that same round a year ago.
    """
    path = os.path.join(SRC, "drafts", "2025.json")
    if not os.path.exists(path):
        return {}
    pams_ids = {m[1]: m[2] for m in MANAGER_MAP}
    out = {}
    with open(path) as f:
        d = json.load(f)
    for pick in d["picks"]:
        name = pams_ids.get(pick.get("user_id"))
        if not name:
            continue
        out.setdefault(name, {})[str(pick["round"])] = {
            "name": pick["player_name"],
            "pos": pick["position"],
            "team": pick.get("nfl_team"),
            "overall": pick["overall_pick"],
        }
    return out


def build_managers():
    print("fetching Sleeper league users + rosters...")
    users = {u["user_id"]: u for u in fetch(
        f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/users")}
    power = load_power_ranks()
    last_year = load_last_year()
    seasons = load_season_file()
    last_season = load_last_season(seasons)
    finishes = load_finishes(seasons)
    round_picks = load_round_picks()

    with open(os.path.join(SRC, "managers_directory.json")) as f:
        pams = {m["user_id"]: m for m in json.load(f)["managers"]}

    # Per-manager draft tendencies from their own history.
    tend = defaultdict(lambda: {"r1": defaultdict(int), "all": defaultdict(int),
                                "n": 0, "years": set()})
    # Every first-round pick a manager has ever made, oldest to newest as
    # read, re-sorted most-recent-first below. Raw material for voice.js's
    # tendency lines (streaks, repeat players, rare positions) rather than
    # a pre-decided sentence, so it stays correct as each new draft adds a
    # year without anyone hand-editing prose again.
    r1seq = defaultdict(list)
    pams_ids = {m[1]: m[2] for m in MANAGER_MAP}
    for year in range(2019, 2026):
        path = os.path.join(SRC, "drafts", f"{year}.json")
        if not os.path.exists(path):
            continue
        with open(path) as f:
            d = json.load(f)
        for pick in d["picks"]:
            name = pams_ids.get(pick.get("user_id"))
            if not name:
                continue
            t = tend[name]
            t["n"] += 1
            t["years"].add(year)
            t["all"][pick["position"]] += 1
            if pick["round"] == 1:
                t["r1"][pick["position"]] += 1
                r1seq[name].append({
                    "y": year,
                    "slot": pick["overall_pick"],
                    "pos": pick["position"],
                    "player": pick["player_name"],
                })

    # Position(s) in round one that only a single manager in the whole league
    # has ever drafted — the "nobody else does this" fact. Computed globally,
    # across every manager's history at once, so it can never drift out of
    # sync the way a per-manager guess could (a fact that was true of Ricci
    # alone last year might not be true anymore once someone else copies him).
    pos_managers = defaultdict(set)
    for pname, picks in r1seq.items():
        for p in picks:
            pos_managers[p["pos"]].add(pname)
    solo_pos = {pos for pos, mgrs in pos_managers.items() if len(mgrs) == 1}

    out = []
    for sleeper_id, pams_id, name, slot in MANAGER_MAP:
        u = users.get(sleeper_id) if sleeper_id else None
        c = pams.get(pams_id, {})
        t = tend.get(name)

        avatar = None
        if u and u.get("avatar"):
            avatar = f"https://sleepercdn.com/avatars/thumbs/{u['avatar']}"

        # The cut-out portraits from the power rankings. Much better on a
        # television than a 40px Sleeper avatar, and they are already trimmed
        # to the subject so every head sits at the same height.
        cut = os.path.join(HERE, "cutouts", f"{name.lower()}.webp")
        cutout = f"cutouts/{name.lower()}.webp" if os.path.exists(cut) else None

        team = None
        if u:
            team = (u.get("metadata") or {}).get("team_name")
        team = team or c.get("team_latest") or name

        s = seasons.get(name, {})
        r1 = dict(sorted(t["r1"].items(), key=lambda x: -x[1])) if t else {}
        allp = dict(sorted(t["all"].items(), key=lambda x: -x[1])) if t else {}

        seq = sorted(r1seq.get(name, []), key=lambda p: -p["y"])
        # Most recent first-round pick he made from a top-three slot, and
        # what became of that season — the fact behind "unfamiliar territory"
        # lines. None if he has never picked top three.
        top3_last = next((p for p in seq if p["slot"] <= 3), None)
        if top3_last:
            top3_last = {**top3_last, "finish": finishes.get(name, {}).get(top3_last["y"])}
        rare_positions = sorted({p["pos"] for p in seq if p["pos"] in solo_pos})

        out.append({
            "slot": slot,
            "name": name,
            "sleeper_id": sleeper_id,
            "pams_id": pams_id,
            "handle": u["display_name"] if u else None,
            "team": team,
            "avatar": avatar,
            "cutout": cutout,
            "power_rank": power.get(name),
            "last_season": last_season.get(name, {}),
            "last_year": last_year.get(name, {}),
            "conference": CONFERENCE.get(name),
            "joined": bool(u),
            # Every one of these is counted in build_seasons.mjs off the same
            # rows as the ledger below, rather than half here and half from
            # managers_directory.json the way it used to be. That split is
            # what had Mason carrying one career in the strip and a different
            # one in his seasons.
            "career": {
                "record": s.get("record"),
                "regular_record": s.get("regular_record"),
                "playoff_record": s.get("playoff_record"),
                "win_pct": s.get("win_pct"),
                "seasons": s.get("seasons"),
                "titles": s.get("titles", 0),
                "title_years": s.get("title_years", []),
                "top3": s.get("top3", 0),
                "playoffs": s.get("playoffs", 0),
                "ppg": s.get("ppg"),
            },
            # Season by season, oldest first, for the showcase table.
            "ledger": s.get("ledger", []),
            # Every pick he has made, filed by round, for the showcase band
            # that follows whatever round the draft is in.
            "round_picks": round_picks.get(name, {}),
            "draft_tendency": {
                "picks": t["n"] if t else 0,
                "drafts": len(t["years"]) if t else 0,
                "round1": r1,
                "overall": allp,
            },
            "round1_history": {
                "seq": seq,
                "top3_last": top3_last,
                "rare_positions": rare_positions,
            },
        })

    missing = [m["name"] for m in out if not m["joined"]]
    if missing:
        print(f"  NOT ON SLEEPER YET: {', '.join(missing)} "
              f"(board will bind them automatically once they join)")
    return out


def main():
    os.makedirs(OUT, exist_ok=True)

    players = build_players()
    history = build_history(players)
    managers = build_managers()

    meta = {
        "league_id": LEAGUE_ID,
        "draft_id": DRAFT_ID,
        "rounds": 14,
        "teams": 12,
        "pick_seconds": 120,
        "type": "snake",
        "scoring": "Full PPR / 6pt pass TD / TE premium +0.5",
        "roster": ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"],
        "bench": 5,
    }

    for fname, payload in [
        ("players.json", players),
        ("history.json", history),
        ("managers.json", managers),
        ("meta.json", meta),
    ]:
        path = os.path.join(OUT, fname)
        with open(path, "w") as f:
            json.dump(payload, f, separators=(",", ":"))
        print(f"wrote {fname}  {os.path.getsize(path)/1024:.0f}kb")


if __name__ == "__main__":
    sys.exit(main())
