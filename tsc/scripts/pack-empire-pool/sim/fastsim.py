# Approximate greedy Empire Builder: same weights, captain table on one slot,
# one boosted card per pack, best of five kept, no repeats of a man.
import json, random, sys
import numpy as np
W = {'normal': {'common': 43.4, 'rare': 11.6, 'dynasty': 7.8, 'transcendent': 2.8, 'immortal': 0.7},
     'captain': {'common': 4.3, 'rare': 14.8, 'dynasty': 33.5, 'transcendent': 21.5, 'immortal': 3.5}}
B = {'normal': dict(W['normal'], common=41.2, rare=14.2), 'captain': dict(W['captain'], rare=12.1, transcendent=23.9, immortal=1.4)}
SLOTS = ['QB', 'RB', 'WR', 'WR', 'WR', 'TE', 'OT', 'OG', 'C', 'OG', 'OT']
TIERS = [(20001, 'GOAT'), (17001, 'HOF'), (14001, 'SB Dynasty'), (11001, 'All-Pro'), (8001, 'Pro Bowl'), (5001, 'Starter'), (2001, 'Backup'), (0, 'PS')]

def run(pool, n=4000, seed=1):
    rng = random.Random(seed)
    by = {}
    for c in pool: by.setdefault(c['pos'], []).append(c)
    tot = []
    for i in range(n):
        cap = i % 11
        taken = set(); s = 0
        for k, pos in enumerate(SLOTS):
            t = 'captain' if k == cap else 'normal'
            cards = [c for c in by[pos] if c.get('pid', c['id']) not in taken]
            pack = []; men = set()
            boost = rng.randrange(5)
            for j in range(5):
                w = B[t] if j == boost else W[t]
                ws = [w[c['rarity']] if c.get('pid', c['id']) not in men else 0 for c in cards]
                c = rng.choices(cards, ws)[0]
                men.add(c.get('pid', c['id'])); pack.append(c)
            best = max(pack, key=lambda c: c['score'])
            taken.add(best.get('pid', best['id'])); s += best['score']
        tot.append(s)
    a = np.array(tot)
    dist = {lab: 0 for _, lab in TIERS}
    for x in a:
        for m, lab in TIERS:
            if x >= m: dist[lab] += 1; break
    return int(np.median(a)), {k: round(100 * v / n, 1) for k, v in dist.items() if v}

if __name__ == '__main__':
    pool = json.load(open(sys.argv[1]))
    print(run(pool, int(sys.argv[2]) if len(sys.argv) > 2 else 3000))
