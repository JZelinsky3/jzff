# Check every man the pickers might choose for a real photo, before they
# choose. The pickers only take men with a face (see select_skill.NO_PHOTO_OK
# for the few famous exceptions), so they need to know who has one up front.
# Results land in ../headshots.json; men already in it aren't fetched again.
import os, sys, json
import pandas as pd

S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, f'{S}/build')
from seasons import norm
import headshots
import select_skill as sk


def skill_men():
    t = pd.read_pickle(f'{S}/build/seasons.pkl')
    t = t[t.team.notna()]
    legends = {norm(n) for v in sk.LEGENDS.values() for n in v}
    keep = (t.season >= sk.LEGEND_BEFORE) | t.key.isin(legends)
    floor = t.pos.map(sk.SAMPLE_FLOOR)
    t = t[keep & (t.metric >= floor)]
    return [{'pid': r.pid, 'name': r.display, 'img': r.img if isinstance(r.img, str) else None}
            for r in t.drop_duplicates('pid').itertuples()]


def line_men():
    import select_ol as ol
    t = ol.resolve(ol.honors_table())
    t = t[t.matched]
    legends = {norm(n) for n in ol.LEGENDS}
    t = t[(t.season >= ol.LEGEND_BEFORE) | t.key.isin(legends)]
    return [{'pid': r.pid, 'name': r.display, 'img': r.img if isinstance(r.img, str) else None}
            for r in t.drop_duplicates('pid').itertuples()]


if __name__ == '__main__':
    legacy_path = f'{S}/sim/legacy.json'
    legacy = json.load(open(legacy_path)) if os.path.exists(legacy_path) else []
    men = {m['pid']: m for m in skill_men() + line_men()}
    got = headshots.resolve(list(men.values()), legacy)
    print('checked', len(men), 'men,', sum(1 for v in got.values() if v), 'with a photo')
