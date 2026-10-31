# Offensive line seasons: that year's honors plus what his offense put up.
import os, sys, re
import pandas as pd, numpy as np

S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, f'{S}/build')
from seasons import dealt, norm, club, FRANCHISE
import allpro
from select_skill import interp, next_open_band, rarity_for, BANDS, SCORE_AT, TOP_BANDS

TARGETS = {
    'OT': {'immortal': 3, 'transcendent': 8, 'dynasty': 13, 'rare': 24, 'common': 56},
    'OG': {'immortal': 3, 'transcendent': 7, 'dynasty': 13, 'rare': 25, 'common': 44},  # one common per man caps it
    'C': {'immortal': 3, 'transcendent': 6, 'dynasty': 10, 'rare': 19, 'common': 41},
}
# Calibration runs (sim/variant.sh) override these from the environment.
import json as _json
TARGETS.update(_json.loads(os.environ.get('PE_TARGETS', '{}')))

MAX_PER_MAN = 4
PER_SEASON = 10
# By band, 2000 on (see select_skill.DECADES). The 1970s and 80s line seasons
# that used to fill the top bands were the names nobody had heard of.
DECADES = {
    'dynasty': {2000: 0.05, 2010: 0.30, 2020: 0.65},
    'rare': {2000: 0.03, 2010: 0.27, 2020: 0.70},
    'common': {2000: 0.02, 2010: 0.23, 2020: 0.75},
}
LEGEND_BEFORE = 2000
# Linemen people know from before 2000: the only old line seasons dealt.
LEGENDS = ['Anthony Munoz', 'John Hannah', 'Mike Webster', 'Bruce Matthews', 'Gary Zimmerman', 'Tony Boselli',
           'Larry Allen', 'Randall McDaniel', 'Will Shields', 'Dermontti Dawson', 'Jonathan Ogden', 'Orlando Pace',
           'Willie Roaf', 'Kevin Mawae', 'Mike Munchak']

try:
    from headshots import has_photo
    PHOTO = has_photo()
except Exception:
    PHOTO = {}
OFFENSE_WEIGHT = 2.5
# Honors top out (first team, Pro Bowl, every selector), so the best line
# seasons are separated by their offense alone; a flatter top keeps a few tenths
# of a point from being worth 1,500.
OL_TOP = 4800

# Wikipedia vandalism / typos, by (season, name as parsed)
FIX = {(2003, 'Brennan'): 'Alan Faneca'}


def honors_table():
    ap = allpro.build()
    pb = []
    for y in range(1970, 2026):
        r = allpro.parse_pro_bowl(y)
        if r is None: print('  no Pro Bowl page for season', y); continue
        pb += r
    pb = pd.DataFrame(pb, columns=['season', 'pos', 'name', 'fr'])
    pb['name'] = [FIX.get((s, n), n) for s, n in zip(pb.season, pb.name)]
    pb['key'] = pb.name.map(norm)
    pb = pb.drop_duplicates(['season', 'key'])
    pb['pro_bowl'] = True
    t = ap.merge(pb[['season', 'key', 'pro_bowl', 'name', 'pos', 'fr']], on=['season', 'key'], how='outer', suffixes=('', '_pb'))
    for c in ('name', 'pos', 'fr'):
        t[c] = t[c].fillna(t[c + '_pb'])
    t = t.drop(columns=['name_pb', 'pos_pb', 'fr_pb'])
    t['pro_bowl'] = t.pro_bowl.notna() & (t.pro_bowl == True)
    for c in ('ap1', 'ap2'):
        t[c] = t[c] == True
    for c in ('others1', 'others2', 'tags'):
        t[c] = t[c].apply(lambda v: v if isinstance(v, list) else [])
    # list-style Pro Bowl pages only say "OL", and a few lines drop the team:
    # fill both from the man's other honors, else nflverse's position
    pl = pd.read_csv(f'{S}/nflv/players.csv', low_memory=False)
    pl = pl[pl.position.isin(['T', 'OT', 'G', 'OG', 'C', 'OL'])].copy()
    pl['key'] = pl.display_name.map(norm)
    pl_pos = pl.drop_duplicates('key').set_index('key').position.map({'T': 'OT', 'OT': 'OT', 'G': 'OG', 'OG': 'OG', 'C': 'C'})
    known = t[t.pos != 'OL'].groupby('key').pos.agg(lambda s: s.mode().iloc[0])
    t['pos'] = [p if p != 'OL' else known.get(k, pl_pos.get(k, 'OL')) for p, k in zip(t.pos, t.key)]
    t = t[t.pos.isin(['OT', 'OG', 'C'])].copy()
    for i in t.index[t.fr.isna()]:
        k, y = t.at[i, 'key'], t.at[i, 'season']
        o = t[(t.key == k) & t.fr.notna()]
        if len(o): t.at[i, 'fr'] = o.iloc[(o.season - y).abs().argsort().iloc[0]].fr
    t['honors'] = (10 * t.ap1 + 5 * t.ap2 + np.minimum(1.5 * t.others1.str.len(), 3.0)
                   + np.minimum(0.5 * t.others2.str.len(), 1.0) + 3 * t.pro_bowl)
    return t


def resolve(t):
    pl = pd.read_csv(f'{S}/nflv/players.csv', low_memory=False)
    pl = pl[pl.position.isin(['T', 'OT', 'G', 'OG', 'C', 'OL'])]
    pl['key'] = pl.display_name.map(norm)
    by = {k: g for k, g in pl.groupby('key')}
    pids, imgs, names = [], [], []
    for r in t.itertuples():
        g = by.get(r.key)
        hit = None
        if g is not None:
            span = g[(g.rookie_season - 1 <= r.season) & (r.season <= g.last_season + 1)]
            hit = span.iloc[0] if len(span) else (g.iloc[0] if len(g) == 1 else None)
        pids.append(hit.gsis_id if hit is not None else 'k:' + r.key)
        imgs.append(hit.headshot if hit is not None and isinstance(hit.headshot, str) else None)
        names.append(hit.display_name if hit is not None else r.name)
    t['pid'] = pids; t['img'] = imgs; t['display'] = names
    t['matched'] = ~t.pid.str.startswith('k:')
    return t


def choose(pos, t, off):
    p = t[(t.pos == pos) & t.fr.notna()].merge(off[['season', 'fr', 'ppg', 'rpg', 'spg', 'offense']], on=['season', 'fr'], how='left')
    p['offense'] = p.offense.fillna(0)
    p['metric'] = p.honors + OFFENSE_WEIGHT * p.offense
    p = p.sort_values('metric', ascending=False).reset_index(drop=True)
    career = t.groupby('pid').honors.sum()
    p['fame'] = p.pid.map(career.rank(pct=True))
    p['decade'] = (p.season // 10 * 10)

    target = TARGETS[pos]
    held, picked = {}, {}
    legends = {norm(n) for n in LEGENDS}
    p['face'] = p.pid.map(lambda x: PHOTO.get(x, False))
    p['era'] = (p.season >= LEGEND_BEFORE) | p.key.isin(legends)

    def can_take(pid, band):
        have = held.get(pid, set())
        return len(have) < MAX_PER_MAN and band not in have

    def take(i, band):
        held.setdefault(p.at[i, 'pid'], set()).add(band); picked[i] = band

    kept = dealt()
    held_under = []  # kept just below the immortal line (see select_skill)

    # The all-time walk, over seasons from 2000 on (or a legend's) with a photo.
    floors, ceiling = {}, 1e9
    for band in ['immortal', 'transcendent']:
        n, last = 0, None
        for r in p.itertuples():
            if r.metric >= ceiling or r.Index in picked or not can_take(r.pid, band): continue
            if not r.era or not r.face: continue
            if n == target[band]:
                floors[band] = (last + r.metric) / 2; break
            take(r.Index, band); n += 1; last = r.metric
        ceiling = floors[band]
        if band == 'immortal':
            for r in p.itertuples():
                if r.metric < ceiling: break
                if (r.pid, r.season) in kept and r.Index not in picked and can_take(r.pid, 'transcendent'):
                    take(r.Index, 'transcendent'); held_under.append(r.Index)

    # Dynasty: an All-Pro first-teamer on an average offense. Rare: a
    # second-teamer who also made the Pro Bowl. Below that, common.
    t_dyn, t_rare, m_floor = 13.0, 7.0, -2.0
    anchors = [(m_floor, SCORE_AT['floor']), (t_rare, SCORE_AT['rare']), (t_dyn, SCORE_AT['dynasty']),
               (floors['transcendent'], SCORE_AT['transcendent']), (floors['immortal'], SCORE_AT['immortal']),
               (p.metric.max(), OL_TOP)]
    p['score'] = [int(interp(m, anchors) // 5 * 5) for m in p.metric]
    p.loc[held_under, 'score'] = SCORE_AT['immortal'] - 5
    p['band'] = p.score.map(rarity_for)

    # What's already dealt stays in, at its new value (see seasons.dealt). If two
    # of a man's cards land on one rarity, the other sits at the top of the next
    # band down: it's in people's binders.
    for r in p.itertuples():
        if (r.pid, r.season) not in kept or r.Index in picked: continue
        band = next_open_band(r.band, r.pid, can_take)
        if band is None:
            print('  DROPPED (man already has every band):', r.display, r.season, r.band); continue
        if band != r.band:
            p.at[r.Index, 'score'] = SCORE_AT[BANDS[BANDS.index(band) - 1]] - 5
            p.at[r.Index, 'band'] = band
        take(r.Index, band)

    # Legends: best pre-2000 season, rare or better, if he isn't in yet.
    for name in LEGENDS:
        old = p[(p.key == norm(name)) & (p.season < LEGEND_BEFORE) & p.face]
        if not len(old) or any(i in picked for i in p.index[p.key == norm(name)]): continue
        for r in old.itertuples():
            if r.band in ('immortal', 'transcendent', 'common'): continue
            if can_take(r.pid, r.band): take(r.Index, r.band); break

    per_season = {}
    for i in picked: per_season[p.at[i, 'season']] = per_season.get(p.at[i, 'season'], 0) + 1
    for band in ['dynasty', 'rare', 'common']:
        need = target[band] - sum(1 for b in picked.values() if b == band)
        if need <= 0: continue
        pool = p[(p.band == band) & (~p.index.isin(picked.keys())) & p.decade.isin(DECADES[band].keys())
                 & p.face].copy()
        pool['interest'] = pool.fame + 0.15 * pool.offense
        quota = {d: need * w for d, w in DECADES[band].items()}
        got = {d: 0 for d in DECADES[band]}
        lo, hi = pool.metric.min(), pool.metric.max()
        nb = max(3, need // 3)
        pool['bin'] = np.minimum(((pool.metric - lo) / max(hi - lo, 1e-6) * nb).astype(int), nb - 1)
        b, stall = nb - 1, 0
        while need > 0 and stall < nb * 3:
            cand = pool[(pool.bin == b) & (~pool.index.isin(picked.keys()))]
            if len(cand): cand = cand[[can_take(x, band) for x in cand.pid]]
            if len(cand): cand = cand[[per_season.get(s, 0) < PER_SEASON for s in cand.season]]
            if len(cand):
                lag = {d: got[d] - quota[d] for d in DECADES[band]}
                cand = cand.assign(lag=cand.decade.map(lag)).sort_values(['lag', 'interest'], ascending=[True, False])
                i = cand.index[0]
                take(i, band); need -= 1; got[p.at[i, 'decade']] += 1
                per_season[p.at[i, 'season']] = per_season.get(p.at[i, 'season'], 0) + 1
                stall = 0
            else:
                stall += 1
            b = (b - 1) % nb

    # A man on a single card at dynasty or better gets a lesser year too, so his
    # binder page has somewhere to go: his best rare or best common, taking turns.
    turn = 0
    for pid, bands in list(held.items()):
        if len(bands) != 1 or not bands & TOP_BANDS: continue
        mine = p[(p.pid == pid) & (~p.index.isin(picked.keys())) & p.band.isin(['rare', 'common']) & p.era & p.face]
        mine = mine[[s >= LEGEND_BEFORE or b != 'common' for s, b in zip(mine.season, mine.band)]]
        if not len(mine):
            print('  ONE CARD, no lesser year:', p[p.pid == pid].display.iloc[0], list(bands)); continue
        want = mine[mine.band == ('rare' if turn % 2 == 0 else 'common')]
        take((want if len(want) else mine).index[0], (want if len(want) else mine).band.iloc[0])
        turn += 1

    out = p.loc[list(picked.keys())].copy()
    out['band'] = [picked[i] for i in out.index]
    assert (out.band == out.score.map(rarity_for)).all()
    out['club'] = [club(f, y) for f, y in zip(out.fr, out.season)]
    out['team'] = out.fr.map(FRANCHISE)
    return out.sort_values('score', ascending=False), anchors


if __name__ == '__main__':
    off = pd.read_pickle(f'{S}/build/offense.pkl')
    t = resolve(honors_table())
    print('honored OL seasons', len(t), 'unmatched to nflverse:', int((~t.matched).sum()))
    print(t[~t.matched][['season', 'name', 'pos', 'fr', 'tags', 'pro_bowl']].head(15).to_string())
    t = t[t.matched]
    allp = []
    for pos in ['OT', 'OG', 'C']:
        out, anchors = choose(pos, t, off)
        print(f'\n===== {pos} n={len(out)}', {b: int((out.band == b).sum()) for b in BANDS},
              'decades', dict(out.decade.value_counts().sort_index()), 'men', out.pid.nunique())
        print('anchors', [(round(a, 2), b) for a, b in anchors])
        out['tagstr'] = [('AP ' if a else '') + ('AP2 ' if b2 else '') + ('PB ' if pb else '') + ','.join(o1)
                         for a, b2, pb, o1 in zip(out.ap1, out.ap2, out.pro_bowl, out.others1)]
        print(out[['display', 'season', 'club', 'tagstr', 'honors', 'offense', 'metric', 'score', 'band']].to_string(index=False))
        allp.append(out)
    pd.concat(allp).to_pickle(f'{S}/build/ol_pool.pkl')
