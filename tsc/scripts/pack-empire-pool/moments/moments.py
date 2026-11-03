"""Game + streak cards: candidates and their value formula. NOT in the game yet.

Joey (2026-11-03): a future update for when the season cards get dry. One
great game, or four straight great games, as a card. They sit on the rarities
that already exist but get their own names and design, Dynasty and up only
(commons and rares are in surplus), a binder tab of their own (4 a man there
too, so a man fits one row), the same man can turn up twice, OL stays seasons.

THE VALUE FORMULA IS FIXED, the same rule the season curves follow: a card's
value depends on nothing but its own game, so adding a new game never moves
another card. Each position has two frozen points, straight line between them,
and the line keeps going both ways (so a 65-point game found later just lands
higher, nothing else moves):

    DYN_AT   points that are worth 1,600, the Dynasty line
    TOP_AT   points that are worth TOP_VALUE

They were set ONCE from 1999-2025 box scores (DYN_AT = the 150th best game at
the position, TOP_AT = the average of its five best) and are now constants.
Don't recompute them from the data again: that's the rank-based drift Joey
ruled out. Scoring is the pool's: full PPR, 4 pt pass TD, -2 INT / fumble lost.

    python3 moments/moments.py            report -> moments/report.txt
                                          candidates -> moments/candidates.json

Canton stays seasons only (Joey). The line still runs past 5,200 for a value,
but what a game that high is called is his call (maybe a game tier of its own).

NEW FACES are the point (Joey): these cards are meant to bring in men who
aren't in the pool, not more of the same stars. Every card carries `face`:
new (no season card), light (only common/rare season cards) or known (a
season card at dynasty+). The draft takes the very top few at a position
whoever they are, then only new and light faces.
"""
import csv, glob, json, os, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
POOL = os.path.join(ROOT, '..', '..', 'src', 'lib', 'packEmpire', 'data', 'season-pool.json')
sys.path.insert(0, os.path.join(ROOT, 'build'))
from select_skill import CURVE as SEASON_CURVE  # noqa: E402

STREAK_LEN = 4          # consecutive games he played, one regular season
# A streak inside a season that's already great (a dynasty+ season card that
# year, or a season worth dynasty+ on the season curve) is only a card if it's
# this far over his season average: Joey, only "a crazy streak" from a great year.
STREAK_LIFT = 0.30
# The first draft, per position: the top OPEN by value whoever they are, the
# rest new and light faces only, at most PER_MAN a man across games + streaks.
DRAFT = {'games': (12, 2), 'streaks': (8, 1)}
PER_MAN = 2
# Men never made into a card. My call, flagged to Joey: no commemorative card
# for a man convicted of murder.
EXCLUDE = {'Aaron Hernandez'}
TOP_VALUE = 4500
LINES = {'dynasty': 1600, 'transcendent': 2800, 'immortal': 4000, 'canton': 5200}

# Frozen 2026-11-03. (DYN_AT, TOP_AT) in fantasy points (a game) or points a
# game (a streak).
GAME_CURVE = {
    'QB': (35.3, 48.0),
    'RB': (39.6, 57.1),
    'WR': (40.5, 57.2),
    'TE': (29.2, 44.4),
}
STREAK_CURVE = {
    'QB': (24.2, 33.6),
    'RB': (25.3, 39.5),
    'WR': (25.0, 36.7),
    'TE': (17.1, 27.1),
}

ROUND = {'WC': 'Wild Card', 'DIV': 'Divisional', 'CON': 'Conference Championship', 'SB': 'Super Bowl'}
TEAMS = {'ARI': 'Arizona Cardinals', 'ATL': 'Atlanta Falcons', 'BAL': 'Baltimore Ravens', 'BUF': 'Buffalo Bills',
    'CAR': 'Carolina Panthers', 'CHI': 'Chicago Bears', 'CIN': 'Cincinnati Bengals', 'CLE': 'Cleveland Browns',
    'DAL': 'Dallas Cowboys', 'DEN': 'Denver Broncos', 'DET': 'Detroit Lions', 'GB': 'Green Bay Packers',
    'HOU': 'Houston Texans', 'IND': 'Indianapolis Colts', 'JAX': 'Jacksonville Jaguars', 'KC': 'Kansas City Chiefs',
    'LV': 'Las Vegas Raiders', 'OAK': 'Las Vegas Raiders', 'LAC': 'Los Angeles Chargers', 'SD': 'Los Angeles Chargers',
    'LA': 'Los Angeles Rams', 'STL': 'Los Angeles Rams', 'MIA': 'Miami Dolphins', 'MIN': 'Minnesota Vikings',
    'NE': 'New England Patriots', 'NO': 'New Orleans Saints', 'NYG': 'New York Giants', 'NYJ': 'New York Jets',
    'PHI': 'Philadelphia Eagles', 'PIT': 'Pittsburgh Steelers', 'SF': 'San Francisco 49ers', 'SEA': 'Seattle Seahawks',
    'TB': 'Tampa Bay Buccaneers', 'TEN': 'Tennessee Titans', 'WAS': 'Washington Commanders'}


def value(curve, pos, pts):
    lo, hi = curve[pos]
    return round(LINES['dynasty'] + (pts - lo) / (hi - lo) * (TOP_VALUE - LINES['dynasty']))


def season_value(pos, ppg):
    pts = SEASON_CURVE[pos]
    if ppg <= pts[0][0]:
        return pts[0][1]
    for (a, va), (b, vb) in zip(pts, pts[1:]):
        if ppg <= b:
            return va + (ppg - a) / (b - a) * (vb - va)
    (a, va), (b, vb) = pts[-2], pts[-1]
    return vb + (ppg - b) / (b - a) * (vb - va)


def rarity(v):
    for r in ('canton', 'immortal', 'transcendent', 'dynasty'):
        if v >= LINES[r]:
            return r
    return None


def num(r, k):
    try:
        return float(r.get(k) or 0)
    except ValueError:
        return 0.0


def points(r):
    return (num(r, 'passing_yards') / 25 + 4 * num(r, 'passing_tds') - 2 * num(r, 'passing_interceptions')
            + num(r, 'rushing_yards') / 10 + 6 * num(r, 'rushing_tds')
            + num(r, 'receptions') + num(r, 'receiving_yards') / 10 + 6 * num(r, 'receiving_tds')
            - 2 * (num(r, 'sack_fumbles_lost') + num(r, 'rushing_fumbles_lost') + num(r, 'receiving_fumbles_lost'))
            + 2 * (num(r, 'passing_2pt_conversions') + num(r, 'rushing_2pt_conversions') + num(r, 'receiving_2pt_conversions')))


def box(pos, t):
    """The card's stat line, same shape as the season cards' accolades."""
    i = lambda k: int(t[k])
    if pos == 'QB':
        s = f"{i('pass_yds'):,} pass · {i('pass_td')} TD"
        if t['rush_yds'] >= 30 or t['rush_td']:
            s += f" · {i('rush_yds')} rush" + (f" · {i('rush_td')} rush TD" if t['rush_td'] else '')
        return s
    if pos == 'RB':
        s = f"{i('rush_yds')} rush · {i('rush_td')} TD"
        if t['rec'] >= 3 or t['rec_td']:
            s += f" · {i('rec')}-{i('rec_yds')}" + (f" · {i('rec_td')} rec TD" if t['rec_td'] else '')
        return s
    s = f"{i('rec')} rec · {i('rec_yds')} yds · {i('rec_td')} TD"
    # Taysom Hill's TE days: the points came from running and throwing.
    if t['rush_yds'] >= 30 or t['rush_td']:
        s += f" · {i('rush_yds')} rush" + (f" · {i('rush_td')} rush TD" if t['rush_td'] else '')
    if t['pass_td']:
        s += f" · {i('pass_td')} pass TD"
    return s


def totals(rows):
    keys = {'pass_yds': 'passing_yards', 'pass_td': 'passing_tds', 'rush_yds': 'rushing_yards', 'rush_td': 'rushing_tds',
            'rec': 'receptions', 'rec_yds': 'receiving_yards', 'rec_td': 'receiving_tds'}
    return {k: sum(num(r, v) for r in rows) for k, v in keys.items()}


def main():
    games = {}
    for r in csv.DictReader(open(os.path.join(ROOT, 'nflv', 'games.csv'))):
        games[r['game_id']] = r
    pool = json.load(open(POOL))
    carded = collections.defaultdict(list)
    for c in pool:
        if c.get('pid'):
            carded[c['pid']].append((c['year'], c['rarity'], c['score']))

    # nflverse stamps a man's LATEST position on every old game (Jordan Matthews'
    # 2014 WR years came through as TE). His position that year: his season card,
    # else that season's roster (2016+), else the earliest roster he's on, else
    # what nflverse says.
    card_pos = {(c['pid'], c['year']): c['pos'] for c in pool if c.get('pid')}
    roster_pos, first_pos = {}, {}
    for p in sorted(glob.glob(os.path.join(ROOT, 'nflv', 'rosters', 'roster_*.csv'))):
        for r in csv.DictReader(open(p)):
            if r['position'] in GAME_CURVE:
                roster_pos.setdefault((r['gsis_id'], int(r['season'])), r['position'])
                first_pos.setdefault(r['gsis_id'], r['position'])

    def pos_then(r):
        k = (r['player_id'], int(r['season']))
        return card_pos.get(k) or roster_pos.get(k) or first_pos.get(r['player_id']) or r['position']

    rows = []
    for p in sorted(glob.glob(os.path.join(ROOT, 'nflv', 'week', 'w_*.csv'))):
        for r in csv.DictReader(open(p)):
            if r['position'] not in GAME_CURVE and r['position'] not in ('FB', 'WR', 'TE', 'RB', 'QB'):
                continue
            r['position'] = pos_then(r)
            if r['position'] in GAME_CURVE and r['player_display_name'] not in EXCLUDE:
                r['_pts'] = points(r)
                rows.append(r)

    def who(r):
        mine = sorted(carded.get(r['player_id'], []))
        face = 'new' if not mine else 'known' if any(c[1] not in ('common', 'rare') for c in mine) else 'light'
        return {'pid': r['player_id'], 'name': r['player_display_name'], 'pos': r['position'],
                'team': TEAMS.get(r['team'], r['team']), 'abbr': r['team'],
                # card size, like the pool's photos (w_360)
                'img': (r['headshot_url'] or '').replace('f_auto,q_auto/', 'f_auto,q_auto,w_360/') or None,
                'face': face, 'seasonCards': mine}

    out_games = []
    for r in rows:
        v = value(GAME_CURVE, r['position'], r['_pts'])
        if not rarity(v):
            continue
        g = games.get(r['game_id'], {})
        t = totals([r])
        out_games.append({**who(r), 'kind': 'game', 'year': int(r['season']), 'week': int(r['week']),
            'round': ROUND.get(g.get('game_type')), 'date': g.get('gameday'), 'opp': TEAMS.get(r['opponent_team'], r['opponent_team']), 'oppAbbr': r['opponent_team'],
            'pts': round(r['_pts'], 1), 'value': v, 'rarity': rarity(v), 'line': box(r['position'], t),
            'id': f"g-{r['position'].lower()}-{r['player_display_name'].lower().replace(' ', '-').replace('.', '').replace(chr(39), '')}-{r['season']}-w{int(r['week']):02d}"})

    # Streaks: his best four in a row each season (one per man-season, so a
    # hot month isn't counted three times by sliding the window a week).
    seasons = collections.defaultdict(list)
    for r in rows:
        if r['season_type'] == 'REG':
            seasons[(r['player_id'], r['season'], r['position'])].append(r)
    out_streaks = []
    for (pid, yr, pos), gs in seasons.items():
        gs.sort(key=lambda r: int(r['week']))
        if len(gs) < STREAK_LEN:
            continue
        best = max(range(len(gs) - STREAK_LEN + 1), key=lambda i: sum(r['_pts'] for r in gs[i:i + STREAK_LEN]))
        run = gs[best:best + STREAK_LEN]
        avg = sum(r['_pts'] for r in run) / STREAK_LEN
        v = value(STREAK_CURVE, pos, avg)
        if not rarity(v):
            continue
        ppg = sum(r['_pts'] for r in gs) / len(gs)
        lift = avg / ppg - 1 if ppg > 0 else 9
        great = season_value(pos, ppg) >= LINES['dynasty'] or any(
            y == int(yr) and rr not in ('common', 'rare') for y, rr, _ in carded.get(pid, []))
        if great and lift < STREAK_LIFT:
            continue
        out_streaks.append({**who(run[-1]), 'kind': 'streak', 'year': int(yr), 'weeks': [int(run[0]['week']), int(run[-1]['week'])],
            'games': [round(r['_pts'], 1) for r in run], 'gameWeeks': [int(r['week']) for r in run], 'opps': [r['opponent_team'] for r in run],
            'avg': round(avg, 1), 'seasonPpg': round(ppg, 1), 'lift': round(lift, 2), 'greatSeason': great,
            'value': v, 'rarity': rarity(v), 'line': box(pos, totals(run)),
            'id': f"s-{pos.lower()}-{run[0]['player_display_name'].lower().replace(' ', '-').replace('.', '').replace(chr(39), '')}-{yr}-w{int(run[0]['week']):02d}"})

    out_games.sort(key=lambda c: -c['value'])
    out_streaks.sort(key=lambda c: -c['value'])

    held = collections.Counter()
    for kind, cards in (('games', out_games), ('streaks', out_streaks)):
        size, top = DRAFT[kind]
        for pos in GAME_CURVE:
            taken = 0
            for c in (c for c in cards if c['pos'] == pos):
                if taken >= size:
                    break
                if held[c['pid']] >= PER_MAN or (taken >= top and c['face'] == 'known'):
                    continue
                c['draft'] = True
                held[c['pid']] += 1
                taken += 1

    json.dump({'games': out_games, 'streaks': out_streaks}, open(os.path.join(HERE, 'candidates.json'), 'w'), indent=1)

    def row(c):
        when = (c['round'] or f"Wk {c['week']}") if c['kind'] == 'game' else f"Wks {c['weeks'][0]}-{c['weeks'][1]}"
        extra = f"{c['pts']:5.1f} pts  vs {c['opp']}" if c['kind'] == 'game' else f"{c['avg']:5.1f}/g  season {c['seasonPpg']}/g"
        return f"  {c['value']:>5}  {c['rarity'][:4]}  {c['face']:5}  {c['name']:24} {c['year']} {when:24} {extra:34} {c['line']}\n"

    with open(os.path.join(HERE, 'report.txt'), 'w') as f:
        f.write('FIRST DRAFT (top few at a position whoever, then new + light faces only)\n')
        for label, cards in (('GAMES', out_games), ('STREAKS', out_streaks)):
            for pos in GAME_CURVE:
                f.write(f"\n-- {label} {pos}\n")
                f.writelines(row(c) for c in cards if c['pos'] == pos and c.get('draft'))
        f.write('\n\nEVERY CANDIDATE AT TRANSCENDENT+ (dynasty counted only)\n')
        for label, cards in (('GAMES', out_games), ('STREAKS (4 straight)', out_streaks)):
            for pos in GAME_CURVE:
                mine = [c for c in cards if c['pos'] == pos]
                n = collections.Counter(c['rarity'] for c in mine)
                fresh = sum(1 for c in mine if c['face'] != 'known')
                f.write(f"\n== {label} {pos}: dynasty {n['dynasty']} / transcendent {n['transcendent']} / immortal {n['immortal']} / over 5,200 {n['canton']}, new or light faces {fresh}\n")
                f.writelines(row(c) for c in mine if c['rarity'] != 'dynasty')
    drafted = sum(1 for c in out_games + out_streaks if c.get('draft'))
    print(f"{len(out_games)} games, {len(out_streaks)} streaks at Dynasty+, {drafted} in the first draft; report in moments/report.txt")


if __name__ == '__main__':
    main()
