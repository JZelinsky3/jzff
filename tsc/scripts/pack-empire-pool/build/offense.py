# How much each team's offense put up, every season 1970-2025: points, rushing
# yards, sacks allowed (1999+ only), as z-scores within the season.
import glob, os, sys
import pandas as pd, numpy as np

S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, f'{S}/build')
from seasons import pfr_franchise, nflverse_franchise

ELO = {'WSH': 'WAS', 'OAK': 'LV'}


def points():
    e = pd.read_csv(f'{S}/nflv/elo_games.csv')
    e = e[(e.season >= 1970) & (e.season <= 1998) & (e.playoff == 0)]
    rows = []
    for r in e.itertuples():
        rows.append((r.season, ELO.get(r.team1, r.team1), r.score1))
        rows.append((r.season, ELO.get(r.team2, r.team2), r.score2))
    a = pd.DataFrame(rows, columns=['season', 'fr', 'pf'])
    g = pd.read_csv(f'{S}/nflv/games.csv')
    g = g[(g.game_type == 'REG') & (g.season <= 2025) & g.home_score.notna()]
    b = pd.concat([
        pd.DataFrame({'season': g.season, 'fr': g.home_team.map(nflverse_franchise), 'pf': g.home_score}),
        pd.DataFrame({'season': g.season, 'fr': g.away_team.map(nflverse_franchise), 'pf': g.away_score}),
    ])
    return pd.concat([a, b]).groupby(['season', 'fr']).pf.agg(['mean', 'count']).rename(
        columns={'mean': 'ppg', 'count': 'gp'}).reset_index()


def rushing():
    rows = []
    for y in range(1970, 2022):
        d = pd.read_csv(f'{S}/fdp/{y}.csv')
        d['fr'] = [pfr_franchise(c, y) for c in d.Tm]
        d = d[d.fr.notna()]
        rows.append(d.groupby('fr').RushingYds.sum().rename('rush').reset_index().assign(season=y))
    for f in sorted(glob.glob(f'{S}/nflv/raw/reg_*.csv')):
        d = pd.read_csv(f, low_memory=False, usecols=['season', 'recent_team', 'rushing_yards'])
        if d.season.iloc[0] < 2022: continue
        d['fr'] = d.recent_team.map(nflverse_franchise)
        rows.append(d.groupby(['season', 'fr']).rushing_yards.sum().rename('rush').reset_index())
    return pd.concat(rows, ignore_index=True)


def sacks():
    rows = []
    for f in sorted(glob.glob(f'{S}/nflv/raw/reg_*.csv')):
        d = pd.read_csv(f, low_memory=False, usecols=['season', 'recent_team', 'sacks_suffered'])
        d['fr'] = d.recent_team.map(nflverse_franchise)
        rows.append(d.groupby(['season', 'fr']).sacks_suffered.sum().rename('sacks').reset_index())
    return pd.concat(rows, ignore_index=True)


def build():
    t = points().merge(rushing(), on=['season', 'fr'], how='left').merge(sacks(), on=['season', 'fr'], how='left')
    t['rpg'] = t.rush / t.gp
    t['spg'] = t.sacks / t.gp

    def z(col, sign=1):
        return t.groupby('season')[col].transform(lambda s: sign * (s - s.mean()) / s.std(ddof=0))
    t['z_pts'] = z('ppg'); t['z_rush'] = z('rpg'); t['z_sack'] = z('spg', -1)
    # points carry most of it; the line's own jobs (run game, keeping the QB up) the rest
    t['offense'] = np.where(t.z_sack.notna(),
                            0.5 * t.z_pts + 0.3 * t.z_rush + 0.2 * t.z_sack,
                            0.6 * t.z_pts + 0.4 * t.z_rush)
    return t


if __name__ == '__main__':
    t = build()
    t.to_pickle(f'{S}/build/offense.pkl')
    print(t.groupby('season').size().describe())
    print(t.sort_values('offense', ascending=False).head(12)[['season', 'fr', 'ppg', 'rpg', 'spg', 'offense']].to_string(index=False))
    for y, fr in [(2007, 'NE'), (1998, 'DEN'), (2003, 'BAL'), (2000, 'LAR'), (2021, 'PHI'), (1985, 'CHI')]:
        r = t[(t.season == y) & (t.fr == fr)].iloc[0]
        print(y, fr, round(r.ppg, 1), round(r.rpg, 1), r.spg, round(r.offense, 2))
