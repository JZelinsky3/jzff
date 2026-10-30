# Headshots: one small, real photo per man, or none; then, per card, the
# photo from that card's season where there is one (season_photos).
#
# nflverse's headshot for a man NFL.com has no photo of is NFL.com's generic
# helmet silhouette (125 of 404 men in the 2026-10 pool, each under its own
# id), and the real ones are full-size originals, 1.7MB at the median: five of
# those in a pack is why cards came up late or blank. So, per man:
#
#   1. NFL.com, resized on their CDN (w_360, ~25KB), unless it's the silhouette
#   2. ESPN's cut-out, resized through ESPN's combiner
#   3. the old pool's photo (a couple of Hall of Famers), resized
#   4. none: the card draws its own portrait
#
# Checks are cached in ../headshots.json, so a pool rebuild refetches nothing.
# Delete an entry (or the file) to check that man again.
import os, sys, json, hashlib, subprocess, urllib.parse
import pandas as pd

S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, f'{S}/build')
from seasons import norm

CACHE = f'{S}/headshots.json'
NFL_SIZE = 'f_auto,q_auto,w_360'
# One of the silhouette's many ids: whatever it resizes to is the image to refuse.
SILHOUETTE = 'https://static.www.nfl.com/image/private/f_auto,q_auto/league/bfvionxxsfckmjqtw4kv'


def fetch(url):
    """(status, md5 of the body), through curl for the system's certificates."""
    out = subprocess.run(['curl', '-s', '-L', '-A', 'Mozilla/5.0', '-o', '-', '-w', '\n%{http_code}', url],
                         capture_output=True, timeout=60).stdout
    body, _, code = out.rpartition(b'\n')
    return int(code or 0), hashlib.md5(body).hexdigest()


def nfl_small(url):
    if not url or 'static.www.nfl.com' not in url: return url
    for t in ('f_auto,q_auto', 't_player_profile_landscape/f_auto', 'f_auto'):
        if f'/{t}/' in url: return url.replace(f'/{t}/', f'/{NFL_SIZE}/', 1)
    return url.replace('/league/', f'/{NFL_SIZE}/league/', 1)


def espn_small(espn_id):
    img = f'/i/headshots/nfl/players/full/{int(espn_id)}.png'
    return 'https://a.espncdn.com/combiner/i?' + urllib.parse.urlencode(
        {'img': img, 'w': 360, 'h': 262, 'scale': 'crop', 'cquality': 80})


def resolve(cards, legacy):
    """cards: one {pid, name, img} per man. Returns {pid: url or None}."""
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    todo = [c for c in cards if c['pid'] not in cache]
    if todo:
        from concurrent.futures import ThreadPoolExecutor
        pl = pd.read_csv(f'{S}/nflv/players.csv', low_memory=False).drop_duplicates('gsis_id').set_index('gsis_id')
        leg = {norm(x['name']): x['img'] for x in legacy if x.get('img')}
        blank = fetch(nfl_small(SILHOUETTE))[1]

        def one(c):
            pid, pick = c['pid'], None
            nfl = nfl_small(c['img'])
            if nfl:
                code, md5 = fetch(nfl)
                if code == 200 and md5 != blank: pick = nfl
            espn = pl.espn_id.get(pid) if pid in pl.index else None
            if not pick and pd.notna(espn):
                if fetch(f'https://a.espncdn.com/i/headshots/nfl/players/full/{int(espn)}.png')[0] == 200:
                    pick = espn_small(espn)
            if not pick and norm(c['name']) in leg:
                pick = nfl_small(leg[norm(c['name'])])
            return pid, pick

        # A pool rebuild checks hundreds of new men; one at a time took minutes.
        with ThreadPoolExecutor(16) as ex:
            for pid, pick in ex.map(one, todo):
                cache[pid] = pick
        with open(CACHE, 'w') as f:
            json.dump(cache, f, indent=0, sort_keys=True)
    return {c['pid']: cache.get(c['pid']) for c in cards}


SEASON_CACHE = f'{S}/headshots_season.json'
SEASON_FROM = 2016


def season_photos(cards):
    """cards: {pid, year} per card. Returns {(pid, year): url} for the cards
    that have a photo from their own season.

    nflverse's season rosters keep NFL.com's headshot as it was that year, a
    new one most seasons from 2020 on and one photo from about 2019 for
    2016-19. Before 2016 the rosters were filled in later with a recent photo,
    so an older card takes its man's EARLIEST photo from 2016 on: for anyone
    who retired before then that's the only photo there is (the same one he
    has now), and for a long career it's the closest to the card's year (a
    2011 Rodgers is a Packer, not a Steeler). No season photo, or a dead or
    blank one: the man's own photo from resolve() stands.
    """
    roster = {}
    for y in range(SEASON_FROM, 2100):
        path = f'{S}/nflv/rosters/roster_{y}.csv'
        if not os.path.exists(path): break
        r = pd.read_csv(path, low_memory=False, usecols=['gsis_id', 'headshot_url'])
        for g, u in zip(r.gsis_id, r.headshot_url):
            if isinstance(g, str) and isinstance(u, str) and (g, y) not in roster:
                roster[(g, y)] = u
    first = {}
    for (g, y) in sorted(roster, key=lambda k: k[1]):
        first.setdefault(g, y)

    want = {}
    for c in cards:
        pid, year = c['pid'], c['year']
        y = year if year >= SEASON_FROM else first.get(pid)
        if y is not None and (pid, y) in roster:
            want[(pid, year)] = nfl_small(roster[(pid, y)])

    cache = json.load(open(SEASON_CACHE)) if os.path.exists(SEASON_CACHE) else {}
    todo = sorted({u for u in want.values() if u not in cache})
    if todo:
        from concurrent.futures import ThreadPoolExecutor
        blank = fetch(nfl_small(SILHOUETTE))[1]

        def one(u):
            code, md5 = fetch(u)
            return u, code == 200 and md5 != blank

        with ThreadPoolExecutor(16) as ex:
            for u, ok in ex.map(one, todo):
                cache[u] = ok
        with open(SEASON_CACHE, 'w') as f:
            json.dump(cache, f, indent=0, sort_keys=True)
    return {k: u for k, u in want.items() if cache.get(u)}


def has_photo():
    """{pid: True/False} for every man checked so far (build/photos.py checks
    every candidate before selection, so the pickers can prefer real faces)."""
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    return {k: bool(v) for k, v in cache.items()}
