# Every card's season as numbers: src/lib/packEmpire/data/card-stats.json
#
# A card's face prints its season as two lines of text, which is all the packs
# need. The Season sim needs more, and as numbers: an RB's catches AND yards, a
# QB's sacks, a line's sacks allowed, how often a receiver went for 20+. This
# reads the same build data the pool comes from and writes it out by card id.
#
# It only READS the pool. season-pool.json and vaulted.json are untouched, so a
# deal, a value, a rarity or a Daily can't move because of this. Run it after
# build.sh, or on its own any time: python3 build/stats.py
#
# Official season totals (PFR, nflverse from 2022) come from seasons.pkl, the
# same rows the values were built on. From 1999 the nflverse season files add
# attempts, targets, sacks taken, air yards and the 20-yard plays; they're used
# for shares and rates, never for a total that the official rows already give
# (nflverse's early-2000s totals are off, Faulk 1999). Before 1999 a card has the
# basics only. A line card has its honors and its team's offense, with sacks
# allowed from 1999.

import os, json
import pandas as pd

S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(S, '..', '..', 'src', 'lib', 'packEmpire', 'data')
OUT = os.environ.get('PE_STATS_OUT', os.path.join(DATA, 'card-stats.json'))

SKILL = ('QB', 'RB', 'WR', 'TE')
NFLV_FROM = 1999


def num(x, nd=0):
    if x is None or pd.isna(x):
        return None
    v = round(float(x), nd)
    return int(v) if nd == 0 else v


def put(d, k, v):
    # Zeros and blanks stay out: most of a WR's passing line is nothing.
    if v is not None and v != 0:
        d[k] = v


def nflverse():
    frames = []
    for y in range(NFLV_FROM, 2100):
        p = f'{S}/nflv/raw/reg_{y}.csv'
        if not os.path.exists(p):
            continue
        cols = ['player_id', 'season', 'attempts', 'completions', 'sacks_suffered', 'passing_20', 'passing_air_yards',
                'rushing_20', 'targets', 'receiving_20', 'receiving_air_yards']
        f = pd.read_csv(p, usecols=lambda c: c in cols, low_memory=False)
        frames.append(f)
    nv = pd.concat(frames)
    # A traded man can have a row per team: one season, summed.
    return nv.groupby(['player_id', 'season']).sum(numeric_only=True)


def skill_stats(card, row, nv):
    d = {}
    put(d, 'g', num(row.g))
    if card['pos'] == 'QB':
        put(d, 'py', num(row.pass_yds))
        put(d, 'ptd', num(row.pass_td))
        put(d, 'int', num(row.ints))
    put(d, 'car', num(row.carries))
    put(d, 'ry', num(row.rush_yds))
    put(d, 'rtd', num(row.rush_td))
    put(d, 'rec', num(row.rec))
    put(d, 'recy', num(row.rec_yds))
    put(d, 'rectd', num(row.rec_td))
    key = (card['pid'], card['year'])
    if card['year'] >= NFLV_FROM and key in nv.index:
        x = nv.loc[key]
        if card['pos'] == 'QB':
            put(d, 'att', num(x.attempts))
            put(d, 'cmp', num(x.completions))
            put(d, 'sk', num(x.sacks_suffered))
            put(d, 'p20', num(x.passing_20))
            put(d, 'pay', num(x.passing_air_yards))
        put(d, 'r20', num(x.rushing_20))
        if card['pos'] != 'QB':
            put(d, 'tgt', num(x.targets))
            put(d, 'c20', num(x.receiving_20))
            put(d, 'ay', num(x.receiving_air_yards))
    return d


def honor(r):
    # 3 First-Team AP, 2 Second-Team AP or another First-Team, 1 Pro Bowl alone,
    # 0.5 a Second-Team from another selector: the same ladder the card prints.
    if r.ap1: return 3
    if r.ap2 or len(r.others1): return 2
    if r.pro_bowl: return 1
    return 0.5


def line_stats(card, row, off):
    season = off[off.season == card['year']]
    team = season[season.fr == row.fr]
    d = {'hon': honor(row)}
    if row.pro_bowl:
        d['pb'] = 1
    if len(team):
        t = team.iloc[0]
        put(d, 'g', num(t.gp))
        put(d, 'ppg', num(t.ppg, 1))
        put(d, 'rpg', num(t.rpg, 1))
        put(d, 'pypg', num(t.pass_yds / t.gp, 1))
        put(d, 'spg', num(t.spg, 2))
        d['rank'] = int((season.ppg > t.ppg).sum()) + 1
    return d


def main():
    seasons = pd.read_pickle(f'{S}/build/seasons.pkl')
    ol = pd.read_pickle(f'{S}/build/ol_pool.pkl')
    off = pd.read_pickle(f'{S}/build/offense.pkl')
    nv = nflverse()

    pool = json.load(open(os.path.join(DATA, 'season-pool.json')))
    vaulted = json.load(open(os.path.join(DATA, 'vaulted.json')))
    cards = pool + [c for c in vaulted if c['id'] not in {p['id'] for p in pool}]

    # A man listed at two positions in one year has two rows: take his card's.
    sk = seasons.assign(pid=seasons.pid.astype(str))
    by_skill = {}
    for r in sk.itertuples():
        k = (r.pid, int(r.season), r.pos)
        if k not in by_skill or r.g > by_skill[k].g:
            by_skill[k] = r
    by_line = {(r.pid, int(r.season), r.pos): r for r in ol.itertuples()}
    # A vaulted line card can be missing from the line pool: its club's code
    # off any line card for that franchise.
    fr_of = {r.team: r.fr for r in ol.itertuples()}

    out, missing = {}, []
    for c in cards:
        pid = c['pid'].replace('k-', 'k:', 1)
        if c['pos'] in SKILL:
            r = by_skill.get((pid, c['year'], c['pos']))
            if r is None:
                r = next((v for (p, y, _), v in by_skill.items() if p == pid and y == c['year']), None)
            if r is None:
                missing.append(c['id'])
                continue
            out[c['id']] = skill_stats({**c, 'pid': pid}, r, nv)
        else:
            r = by_line.get((pid, c['year'], c['pos']))
            if r is None:
                fr = fr_of.get(c['team'])
                if not fr:
                    missing.append(c['id'])
                    continue
                honors = c['accolades'][0]
                r = pd.Series({
                    'fr': fr,
                    'ap1': honors.startswith('First-Team'),
                    'ap2': honors.startswith('Second-Team All-Pro') and '(' not in honors,
                    'others1': [1] if honors.startswith('All-Pro (') else [],
                    'pro_bowl': 'Pro Bowl' in honors,
                })
            out[c['id']] = line_stats(c, r, off)

    with open(OUT, 'w') as f:
        json.dump(dict(sorted(out.items())), f, separators=(',', ':'))
        f.write('\n')
    print(f'{len(out)} cards, {len(missing)} missing: {missing[:10]}')


if __name__ == '__main__':
    main()
