"""Points-after-trade record for pams, 2019-2025.

Run from tsc/: set -a; source .env.local; set +a
  SSL_CERT_FILE=/etc/ssl/cert.pem python3 scripts/trade-record-pams.py [--since 2022] [Name] [--refresh]

For every trade side: points above replacement the receiving manager got from
the players they received, in weeks those players started for them, from the
trade week until the player next changed hands in a trade (or the season
ended). Bench weeks count nothing. Replacement is per season and position: the
average PPG of the rostered players ranked just past the league's starters at
that position (the guy who'd fill the slot instead), which keeps 3-for-1 deals
and QBs from winning on volume alone. Regular season always counts; playoff
weeks count only when the receiver had a playoff matchup that week.
Net = what you got minus what the other side(s) got (avg for 3-way trades).
"""
import json, os, sys, tempfile, urllib.request
from collections import defaultdict

URL = os.environ['NEXT_PUBLIC_SUPABASE_URL'] + '/rest/v1/'
KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
LEAGUE = '1f7ccf54-d49d-4050-af1c-55ac27e73abf'
CACHE = os.path.join(tempfile.gettempdir(), 'pams_trade_record_cache_v3.json')
PUSH = 10.0  # within this many points either way = even

def get(path):
    out, start = [], 0
    while True:
        req = urllib.request.Request(URL + path, headers={
            'apikey': KEY, 'Authorization': 'Bearer ' + KEY,
            'Range-Unit': 'items', 'Range': f'{start}-{start + 999}'})
        rows = json.load(urllib.request.urlopen(req))
        out += rows
        if len(rows) < 1000:
            return out
        start += 1000

def load():
    if os.path.exists(CACHE) and '--refresh' not in sys.argv:
        return json.load(open(CACHE))
    seasons = get(f'seasons?select=id,year,settings&league_id=eq.{LEAGUE}&year=lte.2025')
    sids = ','.join(s['id'] for s in seasons)
    d = {
        'seasons': seasons,
        'managers': get(f'managers?select=id,display_name&league_id=eq.{LEAGUE}'),
        'trades': get(f'trades?select=id,season_id,week,executed_at&league_id=eq.{LEAGUE}&season_id=in.({sids})&status=eq.completed&order=executed_at'),
        'matchups': get(f'matchups?select=season_id,week,manager_a_id,manager_b_id,is_playoff&season_id=in.({sids})&is_playoff=eq.true&order=id'),
    }
    tids = [t['id'] for t in d['trades']]
    d['sides'] = []
    for i in range(0, len(tids), 50):
        d['sides'] += get('trade_sides?select=trade_id,manager_id,assets&trade_id=in.(' + ','.join(tids[i:i+50]) + ')&order=id')
    d['lineups'] = []
    for s in seasons:
        d['lineups'] += get(f"weekly_lineups?select=season_id,week,manager_id,player_external_id,position,is_starter,points&season_id=eq.{s['id']}&order=id")
    json.dump(d, open(CACHE, 'w'))
    return d

d = load()
names = {m['id']: m['display_name'] for m in d['managers']}
PAMS = {}
for line in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'lib', 'pamsNames.ts')):
    line = line.strip()
    if line.startswith("'") and ':' in line:
        k, v = line.split(':', 1)
        PAMS[k.strip(" '")] = v.strip(" ',")
who = lambda mid: PAMS.get(mid, names.get(mid, mid[:8]))
year = {s['id']: s['year'] for s in d['seasons']}
pws = {s['id']: (s['settings'] or {}).get('playoff_week_start', 15) for s in d['seasons']}

in_playoffs = set()
for m in d['matchups']:
    in_playoffs.add((m['season_id'], m['week'], m['manager_a_id']))
    in_playoffs.add((m['season_id'], m['week'], m['manager_b_id']))

RAW = '--raw' in sys.argv  # raw starter points, no replacement (the first prototype)
args = [a for a in sys.argv[1:] if a not in ('--refresh', '--raw')]
out_json = None
if '--json' in args:
    i = args.index('--json')
    out_json = args[i + 1]
    del args[i:i + 2]
since = 0
if '--since' in args:
    i = args.index('--since')
    since = int(args[i + 1])
    del args[i:i + 2]
only = args[0] if args else None

# Replacement level per (season, position). Starters per position = average
# weekly starters league-wide (so FLEX usage is counted where it actually
# went); replacement = mean PPG of the next three rostered players by PPG,
# using weeks they scored (a zero is a bye or an injury, not a performance).
starters = defaultdict(lambda: defaultdict(int))  # (sid, pos) -> week -> n
games = defaultdict(list)                          # (sid, pos, player) -> [pts]
pos_of = {}
for r in d['lineups']:
    sid, pos, p = r['season_id'], r['position'], float(r['points'] or 0)
    if not pos or r['week'] >= pws[sid]:
        continue
    pos_of[(sid, r['player_external_id'])] = pos
    if r['is_starter']:
        starters[(sid, pos)][r['week']] += 1
    if p > 0:
        games[(sid, pos, r['player_external_id'])].append(p)
repl = {}
for (sid, pos), wk in starters.items():
    n = round(sum(wk.values()) / len(wk))
    ppg = sorted((sum(g) / len(g) for (s2, p2, _), g in games.items()
                  if s2 == sid and p2 == pos and len(g) >= 4), reverse=True)
    nxt = ppg[n:n + 3] or ppg[-3:]
    repl[(sid, pos)] = 0.0 if RAW else (sum(nxt) / len(nxt) if nxt else 0.0)

pts = defaultdict(float)  # (season, manager, player, week) -> starter points above replacement
max_week = defaultdict(int)
for r in d['lineups']:
    max_week[r['season_id']] = max(max_week[r['season_id']], r['week'])
    if not r['is_starter']:
        continue
    sid = r['season_id']
    pos = r['position'] or pos_of.get((sid, r['player_external_id']))
    pts[(sid, r['manager_id'], r['player_external_id'], r['week'])] += \
        float(r['points'] or 0) - repl.get((sid, pos), 0.0)

sides_by_trade = defaultdict(list)
for s in d['sides']:
    sides_by_trade[s['trade_id']].append(s)

# when each player next moves in a trade, per season
moves = defaultdict(list)  # (season, player) -> [(week, trade_id)]
for t in d['trades']:
    for s in sides_by_trade[t['id']]:
        for a in s['assets']:
            if a.get('kind') == 'player':
                moves[(t['season_id'], a['player_id'])].append((t['week'] or 1, t['id']))

def counted(sid, mid, w):
    return w < pws[sid] or (sid, w, mid) in in_playoffs

trade_by_id = {t['id']: t for t in d['trades']}
order = {t['id']: i for i, t in enumerate(d['trades'])}

def asset_value(t, mid, a, depth):
    """Starter points the player produced for mid, and, if mid flipped him in a
    later trade, for whoever got him down that chain. The flip is graded as its
    own trade, so a bad flip never drags down the trade that acquired him.
    Returns (value, flipped)."""
    sid, wk = t['season_id'], t['week'] or 1
    later = sorted((w, order[tid], tid) for (w, tid) in moves[(sid, a['player_id'])]
                   if order[tid] > order[t['id']])
    end = later[0][0] if later else max_week[sid] + 1
    p = sum(pts.get((sid, mid, a['player_id'], w), 0)
            for w in range(wk, end) if counted(sid, mid, w))
    if not later or depth > 6:
        return p, False
    nxt = trade_by_id[later[0][2]]
    parties = {s['manager_id'] for s in sides_by_trade[nxt['id']]}
    receivers = [s['manager_id'] for s in sides_by_trade[nxt['id']]
                 if any(x.get('player_id') == a['player_id'] for x in s['assets'])]
    if mid not in parties or mid in receivers or len(receivers) != 1:
        return p, False  # he left mid's roster some other way before moving again
    return p + asset_value(nxt, receivers[0], a, depth + 1)[0], True

rows, skipped = [], 0
for t in d['trades']:
    sides = sides_by_trade[t['id']]
    if len(sides) < 2:
        skipped += 1
        continue
    sid, wk = t['season_id'], t['week'] or 1
    if year[sid] < since:
        continue
    got = {}
    detail = {}
    items = {}
    for s in sides:
        total, parts, its = 0.0, [], []
        for a in s['assets']:
            if a.get('kind') != 'player':
                parts.append(f"{a.get('kind')}")
                continue
            p, flipped = asset_value(t, s['manager_id'], a, 0)
            total += p
            its.append([a['name'], round(p, 1), a.get('position')])
            parts.append(f"{a['name']} {p:.0f}" + (" (flipped)" if flipped else ''))
        got[s['manager_id']] = total
        detail[s['manager_id']] = parts
        items[s['manager_id']] = its
    for mid, g in got.items():
        others = [v for k, v in got.items() if k != mid]
        net = g - sum(others) / len(others)
        rows.append(dict(trade=t['id'], year=year[sid], week=wk, mid=mid, got=g, net=net,
                         partners=[who(k) for k in got if k != mid], partner_ids=[k for k in got if k != mid],
                         parts=detail[mid],
                         gave=[x for k in got if k != mid for x in detail[k]],
                         got_items=items[mid], gave_items=[x for k in got if k != mid for x in items[k]]))

career = defaultdict(lambda: dict(w=0, l=0, p=0, net=0.0, n=0))
for r in rows:
    c = career[who(r['mid'])]
    c['n'] += 1
    c['net'] += r['net']
    if r['net'] > PUSH: c['w'] += 1
    elif r['net'] < -PUSH: c['l'] += 1
    else: c['p'] += 1

print('REPLACEMENT PPG  ' + '  '.join(
    f"{year[sid]}: " + ' '.join(f"{p} {repl[(sid, p)]:.1f}" for p in ('QB', 'RB', 'WR', 'TE') if (sid, p) in repl)
    for sid in sorted(year, key=year.get) if year[sid] >= since and year[sid] in (since or 2019, 2025)))
print(f"{len({r['trade'] for r in rows})} completed trades {since or 2019}-2025, {skipped} skipped (missing a side)\n")
print(f"{'MANAGER':<10} {'TRADES':>6} {'W-L-E':>9} {'NET PTS OVER REPL':>18} {'PER TRADE':>10}")
for name, c in sorted(career.items(), key=lambda kv: -kv[1]['net']):
    print(f"{name:<10} {c['n']:>6} {c['w']:>3}-{c['l']}-{c['p']:<3} {c['net']:>+18.1f} {c['net']/c['n']:>+10.1f}")

print('\nBIGGEST WINS')
for r in sorted(rows, key=lambda r: -r['net'])[:8]:
    print(f"  {r['year']} wk{r['week']:<2} {who(r['mid']):<8} {r['net']:+6.0f} vs {', '.join(r['partners'])}: got {'; '.join(r['parts'])}")

if only:
    print(f'\nEVERY TRADE: {only}')
    for r in sorted((r for r in rows if who(r['mid']) == only), key=lambda r: (r['year'], r['week'])):
        print(f"  {r['year']} wk{r['week']:<2} {r['net']:+6.0f} vs {', '.join(r['partners']):<8} got {'; '.join(r['parts'])}")
        print(f"  {'':<9} {'':>6}    {'':<8} they got {'; '.join(r['gave'])}")

if out_json:
    json.dump([dict(r, name=who(r['mid'])) for r in rows], open(out_json, 'w'), indent=1)
    print(f'\nwrote {len(rows)} trade sides to {out_json}')
