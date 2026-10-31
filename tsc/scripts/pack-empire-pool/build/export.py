# Write the pool the game reads: src/lib/packEmpire/data/season-pool.json
import os, sys, re, json, unicodedata
import pandas as pd, numpy as np

S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.environ.get('PE_OUT', os.path.join(S, '..', '..', 'src', 'lib', 'packEmpire', 'data', 'season-pool.json'))


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"['.]", '', s)
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def ordinal(n):
    n = int(n)
    return f'{n}{"th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")}'


def n(x):
    return f'{int(round(x)):,}'


def skill_lines(r):
    td = int(r.rush_td + r.rec_td)
    if r.pos == 'QB':
        if r.rush_yds >= 400:
            a = f'{n(r.pass_yds)} pass · {n(r.rush_yds)} rush · {int(r.pass_td + r.rush_td)} TD'
        else:
            a = f'{n(r.pass_yds)} yds · {int(r.pass_td)} TD · {int(r.ints)} INT'
    elif r.pos == 'RB':
        a = f'{n(r.rush_yds)} rush · {int(r.rec)} rec · {td} TD'
    else:
        if r.rush_yds >= 150:
            a = f'{int(r.rec)} rec · {n(r.rec_yds + r.rush_yds)} scrim · {td} TD'
        else:
            a = f'{int(r.rec)} rec · {n(r.rec_yds)} yds · {int(r.rec_td)} TD'
    b = f'{r.pts:.1f} pts · {r.pts / r.g:.1f} a game · {int(r.g)} G'
    return [a, b]


def ol_lines(r, off):
    pb = ' · Pro Bowl' if r.pro_bowl else ''
    if r.ap1: a = 'First-Team All-Pro' + pb
    elif r.ap2: a = 'Second-Team All-Pro' + pb
    elif r.others1: a = f'All-Pro ({", ".join(r.others1)})' + pb
    elif r.pro_bowl: a = 'Pro Bowl'
    else: a = f'Second-Team All-Pro ({", ".join(x[:-2] for x in r.others2)})'
    season = off[off.season == r.season]
    rank = int((season.ppg > r.ppg).sum()) + 1
    team = season[season.fr == r.fr].iloc[0]
    b = f'{ordinal(rank)} in scoring · {n(r.rpg * team.gp)} rush yds · {n(team.pass_yds)} pass yds'
    return [a, b]


def main():
    skill = pd.read_pickle(f'{S}/build/skill_pool.pkl')
    ol = pd.read_pickle(f'{S}/build/ol_pool.pkl')
    off = pd.read_pickle(f'{S}/build/offense.pkl')

    cards = []
    for r in skill.itertuples():
        cards.append(dict(pid=r.pid, name=r.display, pos=r.pos, team=r.team, club=r.club, year=int(r.season),
                          score=int(r.score), rarity=r.band, accolades=skill_lines(r),
                          img=r.img if isinstance(r.img, str) else None))
    for r in ol.itertuples():
        cards.append(dict(pid=r.pid, name=r.display, pos=r.pos, team=r.team, club=r.club, year=int(r.season),
                          score=int(r.score), rarity=r.band, accolades=ol_lines(r, off),
                          img=r.img if isinstance(r.img, str) else None))

    # One small real photo per man, or none (see headshots.py).
    import headshots
    legacy_path = f'{S}/sim/legacy.json'  # the pre-season pool, for a couple of Hall of Famers' photos
    legacy = json.load(open(legacy_path)) if os.path.exists(legacy_path) else []
    men = {}
    for c in cards: men.setdefault(c['pid'], c)
    photo = headshots.resolve([{'pid': k, 'name': c['name'], 'img': c['img']} for k, c in men.items()], legacy)
    # Then the photo from the card's own season where NFL.com has one (2016 on).
    season = headshots.season_photos([{'pid': c['pid'], 'year': c['year']} for c in cards])
    for c in cards: c['img'] = season.get((c['pid'], c['year'])) or photo.get(c['pid'])

    # Two different men under one name: the later one gets his suffix.
    by_name = {}
    for c in cards: by_name.setdefault(c['name'], set()).add(c['pid'])
    # (Two Mike Williamses share the plain name: one's a 2010 Buccaneer, the
    # other a Charger, and neither ever went by anything else.)
    SUFFIX = {'Kellen Winslow': 'Kellen Winslow II', 'Michael Pittman': 'Michael Pittman Jr.', 'Mike Williams': 'Mike Williams'}
    for c in cards:
        if len(by_name[c['name']]) > 1:
            first = min(cc['year'] for cc in cards if cc['name'] == c['name'] and cc['pid'] == c['pid'])
            others = [min(cc['year'] for cc in cards if cc['pid'] == p) for p in by_name[c['name']] if p != c['pid']]
            if first > min(others):
                c['name'] = SUFFIX.get(c['name'], c['name'] + ' (' + str(first) + ')')
    for c in cards:
        c['pid'] = c['pid'].replace('k:', 'k-')
        c['id'] = f"{c['pos'].lower()}-{slug(c['name'])}-{c['year']}"
        assert len(c['id']) <= 40, c['id']
    ids = [c['id'] for c in cards]
    assert len(ids) == len(set(ids)), [i for i in ids if ids.count(i) > 1]
    held = pd.Series([c['pid'] for c in cards]).value_counts()
    assert held.max() <= 4, held.head()

    order = ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C']
    # Ties by id: deals depend on this order, so a rebuild can't be left to shuffle it.
    cards.sort(key=lambda c: (order.index(c['pos']), -c['score'], c['id']))
    keys = ['id', 'pid', 'name', 'pos', 'team', 'club', 'year', 'score', 'rarity', 'accolades', 'img']
    cards = [{k: c[k] for k in keys} for c in cards]
    with open(OUT, 'w') as f:
        f.write('[\n' + ',\n'.join(json.dumps(c, ensure_ascii=False) for c in cards) + '\n]\n')
    print('wrote', len(cards), 'cards to', OUT)
    print(pd.DataFrame(cards).groupby(['pos', 'rarity']).size().unstack(fill_value=0)[['common', 'rare', 'dynasty', 'transcendent', 'immortal']])
    print('no headshot:', sum(1 for c in cards if not c['img']), 'cards,', len({c['pid'] for c in cards if not c['img']}), 'men')
    print('season photos:', len(season), 'of', len(cards), 'cards')
    print('max accolade len', max(len(a) for c in cards for a in c['accolades']))
    for c in cards:
        if any(x in c['name'] for x in ('(', 'II')): print('  renamed:', c['name'], c['year'])


if __name__ == '__main__':
    main()
