# Headshots: one small, real photo per man, or none.
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
        pl = pd.read_csv(f'{S}/nflv/players.csv', low_memory=False).set_index('gsis_id')
        leg = {norm(x['name']): x['img'] for x in legacy if x.get('img')}
        blank = fetch(nfl_small(SILHOUETTE))[1]
        for c in todo:
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
            cache[pid] = pick
        with open(CACHE, 'w') as f:
            json.dump(cache, f, indent=0, sort_keys=True)
    return {c['pid']: cache.get(c['pid']) for c in cards}
