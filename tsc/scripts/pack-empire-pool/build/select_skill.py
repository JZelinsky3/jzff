# Pick the QB / RB / WR / TE seasons and put a value on each.
import os, sys
import pandas as pd, numpy as np

S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, f'{S}/build')
from seasons import norm

BANDS = ['immortal', 'transcendent', 'dynasty', 'rare', 'common']

# How many of each, per position: the old pool's sizes (QB 71, RB 80, WR 87,
# TE 70), with the mix tuned so greedy play lands where it did on the old pool
# (median about 18.5k, about 30% GOAT). sim/fastsim.py checks it.
TARGETS = {
    'QB': {'immortal': 5, 'transcendent': 5, 'dynasty': 9, 'rare': 15, 'common': 38},
    'RB': {'immortal': 6, 'transcendent': 6, 'dynasty': 10, 'rare': 17, 'common': 42},
    'WR': {'immortal': 7, 'transcendent': 7, 'dynasty': 11, 'rare': 19, 'common': 44},
    'TE': {'immortal': 5, 'transcendent': 5, 'dynasty': 9, 'rare': 15, 'common': 38},
}

# Metric floors for the middle bands, off the median season at each finish,
# 2000-2025: dynasty sits between what the 2nd and 3rd best at the position do
# in a year, rare at the 10th. M_FLOOR is where a card bottoms out at 120;
# SAMPLE_FLOOR is the weakest season the sampler takes on its own.
T_DYN = {'QB': 20.6, 'RB': 21.0, 'WR': 19.9, 'TE': 13.8}
T_RARE = {'QB': 16.5, 'RB': 15.0, 'WR': 16.1, 'TE': 9.4}
M_FLOOR = {'QB': 9.0, 'RB': 7.0, 'WR': 7.5, 'TE': 4.5}
SAMPLE_FLOOR = {'QB': 9.5, 'RB': 7.5, 'WR': 8.0, 'TE': 5.0}

SCORE_AT = {'floor': 120, 'rare': 700, 'dynasty': 1600, 'transcendent': 2800, 'immortal': 4000, 'top': 5600}

# Calibration runs (sim/variant.sh) override these from the environment.
import json as _json
TARGETS.update(_json.loads(os.environ.get('PE_TARGETS', '{}')))
T_DYN.update(_json.loads(os.environ.get('PE_T_DYN', '{}')))
SAMPLE_FLOOR.update(_json.loads(os.environ.get('PE_SAMPLE_FLOOR', '{}')))

MAX_PER_MAN = 4

# Where the sampled (non-headline) seasons come from, by band. Joey: the old
# names are known for their great years, so pre-2000 seasons only go in at
# dynasty and up; the bronze and rare cards are men people have watched.
DECADES = {
    'dynasty': {1970: 0.08, 1980: 0.12, 1990: 0.18, 2000: 0.22, 2010: 0.22, 2020: 0.18},
    'rare': {2000: 0.26, 2010: 0.38, 2020: 0.36},
    'common': {2000: 0.22, 2010: 0.38, 2020: 0.40},
}
LEGEND_BEFORE = 2000

# Names people know from before 2000: each gets his best pre-2000 season at
# whatever it's worth, as long as that's rare or better (never a bronze). Some
# of them never had a fantasy year past rare (Montana, Elway, Kelly), and the
# rest just miss the headline bands.
LEGENDS = {
    'QB': ['Joe Montana', 'John Elway', 'Jim Kelly', 'Warren Moon', 'Dan Fouts', 'Kurt Warner', 'Randall Cunningham'],
    'RB': ['Eric Dickerson', 'Marcus Allen', 'Roger Craig', 'Thurman Thomas', 'Earl Campbell', 'Jerome Bettis',
           'Tony Dorsett', 'Franco Harris', 'Barry Sanders', 'Emmitt Smith', 'Walter Payton'],
    'WR': ['Sterling Sharpe', 'Randy Moss', 'Steve Largent', 'Art Monk', 'Tim Brown', 'Andre Reed', 'Cris Carter',
           'Michael Irvin', 'Jerry Rice', 'Isaac Bruce'],
    'TE': ['Ben Coates', 'Mark Bavaro', 'Ozzie Newsome', 'Kellen Winslow', 'Shannon Sharpe', 'Dave Casper',
           'Tony Gonzalez'],
}

# Players people have on their fantasy teams now: each gets at least one card,
# his best season (dynasty at most, since the top bands were already walked).
CURRENT = {
    'QB': ['Kyler Murray', 'Jordan Love', 'Tua Tagovailoa', 'Trevor Lawrence', 'Caleb Williams', 'Jared Goff',
           'Justin Herbert'],
    'RB': ['Jahmyr Gibbs', 'Bijan Robinson', "De'Von Achane", 'Josh Jacobs', 'Kyren Williams', 'Breece Hall',
           'James Cook', 'Jonathan Taylor', 'Alvin Kamara', 'Ashton Jeanty'],
    'WR': ['Deebo Samuel', 'Garrett Wilson', 'Drake London', 'Mike Evans', 'DK Metcalf', 'Terry McLaurin',
           'Chris Olave', 'DJ Moore', 'Tee Higgins', 'George Pickens', 'Jaylen Waddle', 'Marvin Harrison Jr.',
           'Justin Jefferson', 'Amon-Ra St. Brown', 'Malik Nabers', 'Jaxon Smith-Njigba', 'Brian Thomas'],
    'TE': ['Dalton Kincaid', 'T.J. Hockenson', 'Kyle Pitts', 'Evan Engram', 'David Njoku', 'Jake Ferguson',
           'Tucker Kraft', 'Dallas Goedert', 'Tyler Warren', 'George Kittle', 'Sam LaPorta'],
}

# Seasons people remember, pulled in wherever they land.
MUST = {
    'QB': [('Kurt Warner', 1999), ('Tom Brady', 2001), ('Peyton Manning', 1998), ('Nick Foles', 2013),
           ('Derek Anderson', 2007), ('Matt Cassel', 2008), ('Jameis Winston', 2019), ('Ryan Fitzpatrick', 2015),
           ('Blake Bortles', 2015), ('Robert Griffin', 2012), ('Michael Vick', 2010), ('Tim Tebow', 2011), ('Geno Smith', 2022), ('Sam Darnold', 2024), ('Jayden Daniels', 2024),
           ('Baker Mayfield', 2018), ('Gardner Minshew', 2019), ('Case Keenum', 2017), ('Brock Purdy', 2023),
           ('Dan Marino', 1984), ('Steve Young', 1998), ('Doug Flutie', 1998),
           ('Vince Young', 2006), ('Brett Favre', 1995), ('Joe Burrow', 2024), ('Russell Wilson', 2020), ('Justin Herbert', 2021), ('Dak Prescott', 2025), ('C.J. Stroud', 2023)],
    'RB': [('Peyton Hillis', 2010), ('BenJarvus Green-Ellis', 2010), ('Alfred Morris', 2012), ('Jamaal Williams', 2022),
           ('James Robinson', 2020), ('Phillip Lindsay', 2018), ('Chris Johnson', 2009), ('Adrian Peterson', 2012), ('Derrick Henry', 2020), ('Saquon Barkley', 2024),
           ('Knowshon Moreno', 2013), ('LeGarrette Blount', 2016), ('Raheem Mostert', 2023),
           ('Ickey Woods', 1988), ('Terrell Davis', 1998),
           ('Barry Sanders', 1997), ('Eric Dickerson', 1984), ('Walter Payton', 1977),
           ('Earl Campbell', 1980), ('Jerome Bettis', 1997), ('Mike Alstott', 2001), ('Kareem Hunt', 2017), ('Shaun Alexander', 2005),
           ("Le'Veon Bell", 2014), ('Bijan Robinson', 2023)],
    'WR': [('Travis Fulgham', 2020), ('Brandon Lloyd', 2010), ('Laurent Robinson', 2011), ('Victor Cruz', 2011),
           ('Mike Williams', 2010), ('Josh Gordon', 2013), ('Steve Johnson', 2010), ('Marques Colston', 2006),
           ('Steve Smith', 2005), ('Randy Moss', 1998), ('Allen Hurns', 2015),
           ('Hunter Renfrow', 2021), ('Puka Nacua', 2023), ('Malik Nabers', 2024),
           ('Brian Thomas', 2024), ('Jaxon Smith-Njigba', 2025), ("Ja'Marr Chase", 2024), ('Michael Irvin', 1995), ('Herman Moore', 1995),
           ('Chad Johnson', 2005), ('Odell Beckham', 2015), ('Kenny Golladay', 2019),
           ('Plaxico Burress', 2007), ('Justin Jefferson', 2022), ('Amon-Ra St. Brown', 2023), ('Terrell Owens', 2002),
           ('Larry Fitzgerald', 2008), ('A.J. Brown', 2022),
           ('Keenan Allen', 2017), ('Nico Collins', 2023)],
    'TE': [('Gary Barnidge', 2015), ('Sam LaPorta', 2023),
           ('Brock Bowers', 2024), ('Robert Tonyan', 2020),
           ('Jared Cook', 2018), ('Kellen Winslow', 1980), ('Mark Bavaro', 1986), ('Shannon Sharpe', 1996),
           ('Jeremy Shockey', 2002), ('Dawson Knox', 2021),
           ('Chris Cooley', 2005), ('Jimmy Graham', 2013), ('Tony Gonzalez', 2004),
           ('George Kittle', 2018), ('Kyle Pitts', 2021), ('Evan Engram', 2017)],
}


def interp(x, pts):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    if x <= xs[0]: return ys[0]
    if x >= xs[-1]: return ys[-1]
    for i in range(1, len(xs)):
        if x <= xs[i]:
            f = (x - xs[i - 1]) / (xs[i] - xs[i - 1])
            return ys[i - 1] + f * (ys[i] - ys[i - 1])


def rarity_for(score):
    if score >= 4000: return 'immortal'
    if score >= 2800: return 'transcendent'
    if score >= 1600: return 'dynasty'
    if score >= 700: return 'rare'
    return 'common'


def choose(pos, t):
    t = t[t.pos == pos]
    p = t[t.team.notna() & (t.g >= np.where(t.L >= 16, 10, 9))].sort_values('metric', ascending=False).reset_index(drop=True)
    career = t.groupby('pid').pts.sum()
    real = career[career >= 400]
    # fame: half the career, half the best year, so a young star counts as a
    # name next to a long-career vet
    peak = t.groupby('pid').metric.max()
    p['fame'] = 0.5 * p.pid.map(real.rank(pct=True)).fillna(0) + 0.5 * p.pid.map(peak.rank(pct=True))
    p['share'] = p.pts / p.pid.map(career)
    p['decade'] = (p.season // 10 * 10).clip(lower=1970)

    target = TARGETS[pos]
    held = {}                      # pid -> set of bands
    picked = {}                    # row index -> band

    def can_take(pid, band):
        have = held.get(pid, set())
        return len(have) < MAX_PER_MAN and band not in have

    def take(i, band):
        held.setdefault(p.at[i, 'pid'], set()).add(band); picked[i] = band

    # 1. The top two bands walk the all-time list. Each floor sits halfway
    #    between the last season in and the next one that could have been.
    floors = {}
    ceiling = 1e9
    for band in ['immortal', 'transcendent']:
        n, last = 0, None
        for r in p.itertuples():
            if r.metric >= ceiling or r.Index in picked: continue
            if not can_take(r.pid, band): continue
            if n == target[band]:
                floors[band] = (last + r.metric) / 2; break
            take(r.Index, band); n += 1; last = r.metric
        ceiling = floors[band]
    m_top = p.metric.max()
    anchors = [(M_FLOOR[pos], SCORE_AT['floor']), (T_RARE[pos], SCORE_AT['rare']), (T_DYN[pos], SCORE_AT['dynasty']),
               (floors['transcendent'], SCORE_AT['transcendent']), (floors['immortal'], SCORE_AT['immortal']),
               (m_top, SCORE_AT['top'])]
    # rounded DOWN to the 5, so rounding never lifts a season over a rarity floor
    p['score'] = [int(interp(m, anchors) // 5 * 5) for m in p.metric]
    p['band'] = p.score.map(rarity_for)

    # 2. Must-includes, wherever they land (the top was already walked).
    for name, year in MUST.get(pos, []):
        rows = p[(p.key == norm(name)) & (p.season == year)]
        if not len(rows):
            print('  MUST missing from data:', name, year); continue
        r = rows.iloc[0]
        if r.name in picked: continue
        if r.band in ('immortal', 'transcendent'):
            print('  MUST left out (top band full / repeat):', name, year, r.band); continue
        if r.season < LEGEND_BEFORE and r.band == 'common':
            print('  MUST left out (old season, bronze):', name, year); continue
        if can_take(r.pid, r.band): take(r.name, r.band)
        else: print('  MUST left out (man already has that band):', name, year)

    # 2b. Legends: best pre-2000 season, rare or better, if it isn't in yet.
    for name in LEGENDS.get(pos, []):
        old = p[(p.key == norm(name)) & (p.season < LEGEND_BEFORE)]
        if not len(old): print('  LEGEND missing from data:', name); continue
        r = old.iloc[0]
        if r.name in picked: continue
        if r.band == 'common': print('  LEGEND has no season past bronze:', name); continue
        if r.band in ('immortal', 'transcendent'):
            # just missed the top walk; his next-best old year can stand in at dynasty
            nxt = old[old.band == 'dynasty']
            if not len(nxt): print('  LEGEND left out (top band full):', name); continue
            r = nxt.iloc[0]
        if can_take(r.pid, r.band): take(r.name, r.band)

    # 2c. Current players: one card each, if they have none yet.
    for name in CURRENT.get(pos, []):
        mine = p[p.key == norm(name)]
        if not len(mine): print('  CURRENT missing from data:', name); continue
        if any(i in picked for i in mine.index): continue
        for r in mine.itertuples():
            if r.band in ('immortal', 'transcendent'): continue
            if can_take(r.pid, r.band): take(r.Index, r.band); break

    # 3. The rest of each lower band: decade quotas, spread across the band's
    #    range, favouring names people know and a man's one big year.
    per_season = {}
    for i in picked: per_season[p.at[i, 'season']] = per_season.get(p.at[i, 'season'], 0) + 1
    for band in ['dynasty', 'rare', 'common']:
        need = target[band] - sum(1 for b in picked.values() if b == band)
        if need <= 0: continue
        pool = p[(p.band == band) & (~p.index.isin(picked.keys())) & (p.metric >= SAMPLE_FLOOR[pos])
                 & p.decade.isin(DECADES[band].keys())].copy()
        pool['interest'] = 0.7 * pool.fame + 0.3 * np.clip(pool.share * 2.5, 0, 1)
        quota = {d: need * w for d, w in DECADES[band].items()}
        got = {d: 0 for d in DECADES[band]}
        lo, hi = pool.metric.min(), pool.metric.max()
        nb = max(3, need // 3)
        pool['bin'] = np.minimum(((pool.metric - lo) / max(hi - lo, 1e-6) * nb).astype(int), nb - 1)
        b = nb - 1
        stall = 0
        while need > 0 and stall < nb * 3:
            # the decade furthest behind its quota, among those with someone left in this bin
            cand = pool[(pool.bin == b) & (~pool.index.isin(picked.keys()))]
            cand = cand[[can_take(x, band) for x in cand.pid]]
            cand = cand[[per_season.get(s, 0) < 4 for s in cand.season]]
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

    out = p.loc[list(picked.keys())].copy()
    out['band'] = [picked[i] for i in out.index]
    bad = out[out.band != out.score.map(rarity_for)]
    assert not len(bad), bad[['name', 'season', 'score', 'band']]
    return out.sort_values('score', ascending=False), anchors


if __name__ == '__main__':
    t = pd.read_pickle(f'{S}/build/seasons.pkl')
    allp = []
    for pos in ['QB', 'RB', 'WR', 'TE']:
        print(f'\n===== {pos}')
        out, anchors = choose(pos, t)
        print(f'n={len(out)}', {b: int((out.band == b).sum()) for b in BANDS},
              'decades', dict(out.decade.value_counts().sort_index()), 'men', out.pid.nunique())
        print('anchors', [(round(a, 2), b) for a, b in anchors])
        print(out[['display', 'season', 'club', 'g', 'pts', 'metric', 'score', 'band']].to_string(index=False))
        allp.append(out)
    pd.concat(allp).to_pickle(f'{S}/build/skill_pool.pkl')
