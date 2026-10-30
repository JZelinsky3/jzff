# Unified skill-position season table, 1970-2025, full PPR with 4pt passing TDs.
#
# Official stats (PFR, via the fantasydatapros mirror) for 1970-2021; nflverse
# for 2022-2025. nflverse rebuilds its numbers from play-by-play, which misses
# plays in the early 2000s (Faulk 1999: 1,327 rushing yards vs the official
# 1,381), so it only supplies what PFR's table lacks for 1999-2021: two-point
# conversions, return TDs, ids and headshots.
import glob, re, unicodedata, os
import pandas as pd, numpy as np

S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def season_len(y):
    if y <= 1977: return 14
    if y == 1982: return 9
    if y == 1987: return 15
    if y >= 2021: return 17
    return 16

def min_games(y):
    """The 'played most of the year' floor the average is divided by."""
    L = season_len(y)
    if L >= 16: return 14
    return 12  # 14-game era, and 1987 (12 games once the strike games are out)

def norm(name):
    s = unicodedata.normalize('NFKD', str(name)).encode('ascii', 'ignore').decode()
    s = re.sub(r'[*+]', '', s).lower()
    s = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b\.?', '', s)
    s = re.sub(r'[^a-z]', '', s)
    return ALIAS.get(s, s)

# the same man spelled two ways across the sources
ALIAS = {'mikevick': 'michaelvick', 'raghibismail': 'rocketismail', 'benjaminwatson': 'benwatson',
         'chriswells': 'beaniewells', 'robbiechosen': 'robbyanderson', 'robbieanderson': 'robbyanderson'}

# ---- franchises -------------------------------------------------------------

FRANCHISE = {  # franchise code -> current name (what chemistry keys on)
    'ARI': 'Arizona Cardinals', 'ATL': 'Atlanta Falcons', 'BAL': 'Baltimore Ravens', 'BUF': 'Buffalo Bills',
    'CAR': 'Carolina Panthers', 'CHI': 'Chicago Bears', 'CIN': 'Cincinnati Bengals', 'CLE': 'Cleveland Browns',
    'DAL': 'Dallas Cowboys', 'DEN': 'Denver Broncos', 'DET': 'Detroit Lions', 'GB': 'Green Bay Packers',
    'HOU': 'Houston Texans', 'IND': 'Indianapolis Colts', 'JAX': 'Jacksonville Jaguars', 'KC': 'Kansas City Chiefs',
    'LAC': 'Los Angeles Chargers', 'LAR': 'Los Angeles Rams', 'LV': 'Las Vegas Raiders', 'MIA': 'Miami Dolphins',
    'MIN': 'Minnesota Vikings', 'NE': 'New England Patriots', 'NO': 'New Orleans Saints', 'NYG': 'New York Giants',
    'NYJ': 'New York Jets', 'PHI': 'Philadelphia Eagles', 'PIT': 'Pittsburgh Steelers', 'SEA': 'Seattle Seahawks',
    'SF': 'San Francisco 49ers', 'TB': 'Tampa Bay Buccaneers', 'TEN': 'Tennessee Titans', 'WAS': 'Washington Commanders',
}

def pfr_franchise(code, y):
    c = str(code)
    m = {'GNB': 'GB', 'KAN': 'KC', 'NWE': 'NE', 'BOS': 'NE', 'NOR': 'NO', 'SFO': 'SF', 'TAM': 'TB',
         'SDG': 'LAC', 'LAC': 'LAC', 'RAM': 'LAR', 'LAR': 'LAR', 'RAI': 'LV', 'OAK': 'LV', 'LVR': 'LV',
         'PHO': 'ARI', 'ARI': 'ARI', 'TEN': 'TEN', 'IND': 'IND', 'JAX': 'JAX', 'CAR': 'CAR'}
    if c in m: return m[c]
    if c == 'STL': return 'ARI' if y <= 1987 else 'LAR'
    if c == 'HOU': return 'TEN' if y <= 1996 else 'HOU'
    if c == 'BAL': return 'IND' if y <= 1983 else 'BAL'
    if c in FRANCHISE: return c
    return None  # 2TM / 3TM

def nflverse_franchise(code):
    return {'LA': 'LAR', 'STL': 'LAR', 'SD': 'LAC', 'OAK': 'LV', 'LVR': 'LV'}.get(code, code) if code in (
        'LA', 'STL', 'SD', 'OAK', 'LVR') or code in FRANCHISE else None

def club(fr, y):
    """The team's name in that season."""
    if fr == 'ARI': return 'St. Louis Cardinals' if y <= 1987 else 'Phoenix Cardinals' if y <= 1993 else 'Arizona Cardinals'
    if fr == 'LAR': return 'St. Louis Rams' if 1995 <= y <= 2015 else 'Los Angeles Rams'
    if fr == 'LV': return 'Los Angeles Raiders' if 1982 <= y <= 1994 else 'Las Vegas Raiders' if y >= 2020 else 'Oakland Raiders'
    if fr == 'LAC': return 'San Diego Chargers' if y <= 2016 else 'Los Angeles Chargers'
    if fr == 'TEN': return 'Houston Oilers' if y <= 1996 else 'Tennessee Oilers' if y <= 1998 else 'Tennessee Titans'
    if fr == 'IND': return 'Baltimore Colts' if y <= 1983 else 'Indianapolis Colts'
    if fr == 'NE': return 'Boston Patriots' if y <= 1970 else 'New England Patriots'
    if fr == 'WAS': return 'Washington Redskins' if y <= 2019 else 'Washington Football Team' if y <= 2021 else 'Washington Commanders'
    return FRANCHISE[fr]

# ---- scoring ----------------------------------------------------------------

def ppr(r):
    return (r.pass_yds * 0.04 + r.pass_td * 4 - r.ints * 2
            + r.rush_yds * 0.1 + r.rush_td * 6
            + r.rec + r.rec_yds * 0.1 + r.rec_td * 6
            + r.two_pt * 2 - r.fum_lost * 2 + r.st_td * 6)

# ---- loaders ----------------------------------------------------------------

def load_nflverse():
    out = []
    for f in sorted(glob.glob(f'{S}/nflv/raw/reg_*.csv')):
        d = pd.read_csv(f, low_memory=False)
        d = d[d.position.isin(['QB', 'RB', 'WR', 'TE', 'FB', 'HB'])].copy()
        out.append(pd.DataFrame({
            'gsis': d.player_id, 'name': d.player_display_name,
            'pos': d.position.replace({'FB': 'RB', 'HB': 'RB'}), 'season': d.season,
            'fr': d.recent_team.map(nflverse_franchise), 'g': d.games,
            'pass_yds': d.passing_yards, 'pass_td': d.passing_tds, 'ints': d.passing_interceptions,
            'carries': d.carries, 'rush_yds': d.rushing_yards, 'rush_td': d.rushing_tds,
            'rec': d.receptions, 'rec_yds': d.receiving_yards, 'rec_td': d.receiving_tds,
            'two_pt': d.passing_2pt_conversions.fillna(0) + d.rushing_2pt_conversions.fillna(0) + d.receiving_2pt_conversions.fillna(0),
            'fum_lost': d.rushing_fumbles_lost.fillna(0) + d.receiving_fumbles_lost.fillna(0) + d.sack_fumbles_lost.fillna(0),
            'st_td': d.special_teams_tds.fillna(0), 'nflverse_ppr': d.fantasy_points_ppr,
        }))
    t = pd.concat(out, ignore_index=True)
    t['key'] = t.name.map(norm)
    return t

def lost_rates():
    rows = [pd.read_csv(f'{S}/fdp/{y}.csv')[['Pos', 'Fumbles', 'FumblesLost']] for y in range(1994, 2002)]
    g = pd.concat(rows).groupby('Pos')[['Fumbles', 'FumblesLost']].sum()
    return (g.FumblesLost / g.Fumbles).to_dict()

def load_pfr(rate):
    out = []
    for y in range(1970, 2022):
        d = pd.read_csv(f'{S}/fdp/{y}.csv')
        d = d[d.Pos.isin(['QB', 'RB', 'WR', 'TE'])].copy()
        est = y < 1994
        fl = (d.Fumbles.fillna(0) * d.Pos.map(rate)).round() if est else d.FumblesLost.fillna(0)
        out.append(pd.DataFrame({
            'name': d.Player.str.replace(r'[*+]', '', regex=True).str.strip(),
            'pro_bowl': d.Player.str.contains(r'\*', regex=True), 'all_pro': d.Player.str.contains(r'\+', regex=True),
            'pos': d.Pos, 'season': y, 'tm': d.Tm, 'fr': [pfr_franchise(c, y) for c in d.Tm], 'g': d.G,
            'pass_yds': d.PassingYds, 'pass_td': d.PassingTD, 'ints': d.Int,
            'carries': d.RushingAtt, 'rush_yds': d.RushingYds, 'rush_td': d.RushingTD,
            'rec': d.Rec, 'rec_yds': d.ReceivingYds, 'rec_td': d.ReceivingTD,
            'fum_lost': fl, 'fl_est': est,
        }))
    t = pd.concat(out, ignore_index=True)
    t['key'] = t.name.map(norm)
    return t

def build():
    rate = lost_rates()
    nv = load_nflverse()
    pf = load_pfr(rate)

    # 1999-2021: attach nflverse's extras to the official rows.
    nvx = nv[nv.season <= 2021][['key', 'season', 'fr', 'pos', 'gsis', 'two_pt', 'st_td']]
    a = pf.merge(nvx.drop(columns='pos'), on=['key', 'season', 'fr'], how='left', suffixes=('', '_nv'))
    # multi-team seasons (2TM) and team mismatches: fall back to name + season when unique
    miss = a.gsis.isna() & (a.season >= 1999)
    uniq = nvx.groupby(['key', 'season']).filter(lambda g: len(g) == 1)
    fb = a[miss].drop(columns=['gsis', 'two_pt', 'st_td', 'fr_nv'], errors='ignore').merge(
        uniq.rename(columns={'fr': 'fr_nv'}).drop(columns='pos'), on=['key', 'season'], how='left')
    a.loc[miss, ['gsis', 'two_pt', 'st_td']] = fb[['gsis', 'two_pt', 'st_td']].values
    a.loc[miss & a.fr.isna(), 'fr'] = fb.loc[(miss & a.fr.isna())[miss].values, 'fr_nv'].values
    a['two_pt'] = a.two_pt.fillna(0); a['st_td'] = a.st_td.fillna(0)
    a['src'] = 'pfr'
    a['two_pt_known'] = a.season >= 1999

    b = nv[nv.season >= 2022].copy()
    b['src'] = 'nflverse'; b['fl_est'] = False; b['two_pt_known'] = True
    b['pro_bowl'] = False; b['all_pro'] = False

    t = pd.concat([a, b], ignore_index=True)
    num = ['g', 'pass_yds', 'pass_td', 'ints', 'carries', 'rush_yds', 'rush_td', 'rec', 'rec_yds', 'rec_td', 'two_pt', 'fum_lost', 'st_td']
    t[num] = t[num].astype(float).fillna(0)
    t = t[t.season != 1982]
    t['pts'] = t.apply(ppr, axis=1).round(2)
    t['L'] = t.season.map(season_len); t['ming'] = t.season.map(min_games)
    t['ppg'] = t.pts / t.g.clip(lower=1)
    t['avg_eff'] = t.pts / np.maximum(t.g, t.ming)
    t['full'] = t.pts / t.L
    t['metric'] = 0.65 * t.avg_eff + 0.35 * t.full
    t['club'] = [club(f, y) if isinstance(f, str) else None for f, y in zip(t.fr, t.season)]
    t['team'] = [FRANCHISE[f] if isinstance(f, str) else None for f in t.fr]
    t = resolve_people(t.reset_index(drop=True))
    return t, rate

# ---- people -------------------------------------------------------------------

def resolve_people(t):
    """One id per man: nflverse's gsis id, found by name + career span when the
    row didn't come with one. Also his canonical name, headshot and main position."""
    pl = pd.read_csv(f'{S}/nflv/players.csv', low_memory=False)
    pl['key'] = pl.display_name.map(norm)
    pl = pl[pl.position.isin(['QB', 'RB', 'FB', 'HB', 'WR', 'TE'])]
    by_key = {k: g for k, g in pl.groupby('key')}
    pos_of = {'FB': 'RB', 'HB': 'RB'}
    ids = []
    for r in t.itertuples():
        if isinstance(r.gsis, str):
            ids.append(r.gsis); continue
        g = by_key.get(r.key)
        if g is None:
            ids.append('k:' + r.key); continue
        span = g[(g.rookie_season - 1 <= r.season) & (r.season <= g.last_season + 1)]
        if len(span) == 0:
            # early-70s careers often start late in the file; take the only man of that name at the position
            same = g[g.position.map(lambda p: pos_of.get(p, p)) == r.pos]
            span = same if len(same) == 1 else span
        g = span
        if len(g) > 1:
            g2 = g[g.position.map(lambda p: pos_of.get(p, p)) == r.pos]
            g = g2 if len(g2) else g
        ids.append(g.gsis_id.iloc[0] if len(g) else 'k:' + r.key)
    t['pid'] = ids
    info = pl.set_index('gsis_id')
    t['display'] = [re.sub(r'\s+Sr\.$', '', info.display_name.get(i, n)) if not i.startswith('k:') else n
                    for i, n in zip(t.pid, t.name)]
    t['img'] = [info.headshot.get(i) if not i.startswith('k:') else None for i in t.pid]
    # main position: where he scored most of his points
    main = t.groupby(['pid', 'pos']).pts.sum().reset_index().sort_values('pts').drop_duplicates('pid', keep='last')
    t['pos'] = t.pid.map(main.set_index('pid').pos)
    return t


if __name__ == '__main__':
    t, rate = build()
    print('fumble-lost rates (pre-1994 estimate):', {k: round(v, 3) for k, v in rate.items()})
    t.to_pickle(f'{S}/build/seasons.pkl')
    print('rows', len(t), 'no team', int(t.team.isna().sum()))
    q = t[(t.season >= 1999) & (t.season <= 2021) & (t.pts > 150)]
    print('1999-2021 rows >150 pts without an nflverse match:', int(q.gsis.isna().sum()))
    print(q[q.gsis.isna()][['name', 'season', 'tm', 'pos', 'pts']].head(20).to_string())
    for n, y in [('Marshall Faulk', 1999), ('Cooper Kupp', 2021), ('LaDainian Tomlinson', 2006), ('Travis Fulgham', 2020), ('Patrick Mahomes', 2018)]:
        r = t[(t.name == n) & (t.season == y)].iloc[0]
        print(n, y, r.club, r.g, r.pts, round(r.metric, 2), 'two_pt', r.two_pt, 'st', r.st_td)
