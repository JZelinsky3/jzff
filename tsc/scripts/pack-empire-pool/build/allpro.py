# Offensive line honors, 1970-2025, off Wikipedia's All-Pro Team pages.
import os, re, sys
import pandas as pd

S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, f'{S}/build')
from seasons import norm

NICK = {
    'Cardinals': 'ARI', 'Falcons': 'ATL', 'Ravens': 'BAL', 'Bills': 'BUF', 'Panthers': 'CAR', 'Bears': 'CHI',
    'Bengals': 'CIN', 'Browns': 'CLE', 'Cowboys': 'DAL', 'Broncos': 'DEN', 'Lions': 'DET', 'Packers': 'GB',
    'Texans': 'HOU', 'Colts': 'IND', 'Jaguars': 'JAX', 'Chiefs': 'KC', 'Chargers': 'LAC', 'Rams': 'LAR',
    'Raiders': 'LV', 'Dolphins': 'MIA', 'Vikings': 'MIN', 'Patriots': 'NE', 'Saints': 'NO', 'Giants': 'NYG',
    'Jets': 'NYJ', 'Eagles': 'PHI', 'Steelers': 'PIT', 'Seahawks': 'SEA', '49ers': 'SF', 'Buccaneers': 'TB',
    'Oilers': 'TEN', 'Titans': 'TEN', 'Redskins': 'WAS', 'Commanders': 'WAS', 'Football Team': 'WAS',
}
CITY = {
    'Arizona': 'ARI', 'Phoenix': 'ARI', 'Atlanta': 'ATL', 'Baltimore': None, 'Buffalo': 'BUF', 'Carolina': 'CAR',
    'Chicago': 'CHI', 'Cincinnati': 'CIN', 'Cleveland': 'CLE', 'Dallas': 'DAL', 'Denver': 'DEN', 'Detroit': 'DET',
    'Green Bay': 'GB', 'Houston': None, 'Indianapolis': 'IND', 'Jacksonville': 'JAX', 'Kansas City': 'KC',
    'San Diego': 'LAC', 'Las Vegas': 'LV', 'Oakland': 'LV', 'Miami': 'MIA', 'Minnesota': 'MIN',
    'New England': 'NE', 'New Orleans': 'NO', 'Philadelphia': 'PHI', 'Pittsburgh': 'PIT', 'Seattle': 'SEA',
    'San Francisco': 'SF', 'Tampa Bay': 'TB', 'Tennessee': 'TEN', 'Washington': 'WAS', 'St. Louis': None,
}


def franchise(text, year):
    for k, v in NICK.items():
        if k in text: return v
    for k, v in CITY.items():
        if k in text:
            if v: return v
            if k == 'Baltimore': return 'IND' if year <= 1983 else 'BAL'
            if k == 'Houston': return 'TEN' if year <= 1996 else 'HOU'
            if k == 'St. Louis': return 'ARI' if year <= 1987 else 'LAR'
    return None


LINK = re.compile(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]')


def entry(chunk, year):
    """'[[Name]], [[Team]] (AP, PFWA)' -> (name, franchise, [tags])."""
    m = re.search(r'\(([^()]*)\)\s*$', chunk.strip())
    if not m: return None
    # 'AP-t' / 'AP-2t' are ties, same team
    tags = [re.sub(r'(-t|(?<=\d)t)$', '', t.strip()) for t in m.group(1).split(',') if t.strip()]
    body = chunk[:m.start()]
    links = LINK.findall(body)
    plain = LINK.sub(lambda x: x.group(2) or x.group(1), body)
    plain = re.sub(r"'''?|<[^>]+>|\{\{[^}]*\}\}", '', plain).strip(' ,|')
    parts = [p.strip() for p in plain.split(',') if p.strip()]
    if not parts: return None
    name = parts[0]
    team_txt = ' '.join([l[0] for l in links[1:]] + parts[1:])
    fr = franchise(team_txt, year)
    return name, fr, tags


def parse(year):
    f = f'{S}/wiki/ap{year}.txt'
    t = open(f).read()
    # the offense table only
    i = t.find('Offense')
    j = min([k for k in (t.find('Defense', i), t.find('Special teams', i), t.find('Defensive', i)) if k > 0] or [len(t)])
    t = t[i:j]
    out = []
    for row in re.split(r'\n\|-', t):
        lines = [l for l in row.split('\n') if l.strip()]
        if not lines: continue
        # the position is the label's link text; 'align=center' would read as Center
        label = ' '.join(a or b for b, a in LINK.findall(lines[0])) or re.sub(r'align=\w+\|?', '', lines[0])
        if 'efensive' in label or 'Nose' in label: continue
        if re.search(r'ackle', label): pos = 'OT'
        elif re.search(r'uard', label): pos = 'OG'
        elif re.search(r'[Cc]enter', label): pos = 'C'
        else: continue
        first = lines[0]
        k = first.find(']]')
        body = '\n'.join([first[k + 2:] if k >= 0 else ''] + lines[1:])
        for chunk in re.split(r'<\s*br\s*/?\s*>|\n\|', body, flags=re.I):
            e = entry(chunk.strip().lstrip('|').strip(), year)
            if e: out.append((year, pos) + e)
    return out


def score(tags):
    ap1 = any(t == 'AP' for t in tags)
    ap2 = any(t == 'AP-2' for t in tags)
    other1 = [t for t in tags if t != 'AP' and not t.endswith('-2')]
    other2 = [t for t in tags if t != 'AP-2' and t.endswith('-2')]
    return 10 * ap1 + 5 * ap2 + min(1.5 * len(other1), 4.5) + min(0.5 * len(other2), 1.5), ap1, ap2, other1, other2


def build():
    rows = []
    for y in range(1970, 2026):
        if not os.path.exists(f'{S}/wiki/ap{y}.txt') or os.path.getsize(f'{S}/wiki/ap{y}.txt') < 2000:
            print('missing page', y); continue
        rows += parse(y)
    d = pd.DataFrame(rows, columns=['season', 'pos', 'name', 'fr', 'tags'])
    d['key'] = d.name.map(norm)
    # one row per man per season: tags from every row he appears in
    g = d.groupby(['season', 'key']).agg(name=('name', 'first'), pos=('pos', lambda s: s.mode().iloc[0]),
                                         fr=('fr', lambda s: s.dropna().mode().iloc[0] if s.notna().any() else None),
                                         tags=('tags', lambda s: sorted(set(sum(s, []))))).reset_index()
    sc = g.tags.map(score)
    g['honors'] = [x[0] for x in sc]; g['ap1'] = [x[1] for x in sc]; g['ap2'] = [x[2] for x in sc]
    g['others1'] = [x[3] for x in sc]; g['others2'] = [x[4] for x in sc]
    return g


if __name__ == '__main__':
    g = build()
    g.to_pickle(f'{S}/build/allpro.pkl')
    print(len(g), 'OL seasons;', 'no team:', int(g.fr.isna().sum()))
    print(g.groupby('season').size().describe())
    print(g[g.fr.isna()].head(10).to_string())
    print(g.groupby(['pos']).ap1.sum(), g.groupby('pos').ap2.sum())
    for y in (1970, 1985, 2003, 2021):
        print(g[g.season == y][['pos', 'name', 'fr', 'tags', 'honors']].to_string(index=False))


# ---- Pro Bowl -----------------------------------------------------------------

NFLPLAYER = re.compile(r"\{\{NFLplayer\|\s*\d*\s*\|\s*([^|}]+?)\s*\|[^{}]*?\(\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*\)\s*\}\}")


def read_pro_bowl(season):
    t = open(f'{S}/wiki/pb/s{season}.txt').read()
    return NFLPLAYER.sub(lambda m: f'[[{m.group(1)}]], [[{m.group(2)}]]', t)


def parse_pro_bowl(season):
    """Every OT / OG / C on the roster for the game after `season`: starters,
    reserves and replacements alike."""
    f = f'{S}/wiki/pb/s{season}.txt'
    if not os.path.exists(f) or os.path.getsize(f) < 3000: return None
    t = read_pro_bowl(season)
    out = []
    for row in re.split(r'\n\|-', t):
        lines = [l for l in row.split('\n') if l.strip()]
        if not lines: continue
        label = ' '.join(a or b for b, a in LINK.findall(lines[0]))
        if not label or 'efensive' in label or 'Nose' in label: continue
        if re.search(r'ackle', label): pos = 'OT'
        elif re.search(r'uard', label): pos = 'OG'
        elif re.fullmatch(r'\s*Center\s*', label) or label.startswith('Center'): pos = 'C'
        else: continue
        k = lines[0].find(']]')
        body = '\n'.join([lines[0][k + 2:]] + lines[1:])
        body = re.sub(r'\{\{\s*[Ss]mall\|[^}]*\}\}|\{\{ref label[^}]*\}\}|\{\{[^}]*\}\}', '', body)
        body = body.replace("'''", '')
        for chunk in re.split(r'<\s*br\s*/?\s*>|\n\||\n\*', body, flags=re.I):
            links = LINK.findall(chunk)
            if not links: continue
            name = links[0][1] or links[0][0]
            team = ' '.join(l[0] for l in links[1:]) or chunk
            out.append((season, pos, re.sub(r'\s*\(.*\)$', '', name).strip(), franchise(team, season)))
    return out or parse_pro_bowl_lists(season)


ABBR = {'OAK': 'LV', 'RAI': 'LV', 'LV': 'LV', 'MIA': 'MIA', 'NE': 'NE', 'PIT': 'PIT', 'SD': 'LAC', 'LAC': 'LAC',
        'DEN': 'DEN', 'CLE': 'CLE', 'CIN': 'CIN', 'BUF': 'BUF', 'NYJ': 'NYJ', 'KC': 'KC', 'SEA': 'SEA', 'IND': 'IND',
        'JAX': 'JAX', 'TEN': 'TEN', 'RAM': 'LAR', 'LAR': 'LAR', 'NYG': 'NYG', 'WAS': 'WAS', 'PHI': 'PHI', 'DAL': 'DAL',
        'CHI': 'CHI', 'GB': 'GB', 'MIN': 'MIN', 'DET': 'DET', 'TB': 'TB', 'NO': 'NO', 'ATL': 'ATL', 'SF': 'SF',
        'ARI': 'ARI', 'PHO': 'ARI', 'CAR': 'CAR', 'HOU': None, 'BAL': None, 'STL': None, 'LA': None}


def parse_pro_bowl_lists(season):
    """The list-style pages: headings or bold labels, then one man per line."""
    t = read_pro_bowl(season)
    t = re.sub(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>', '', t, flags=re.S)
    out, ctx, conf = [], None, None
    for raw in re.split(r'\n|<\s*br\s*/?\s*>', t, flags=re.I):
        line = raw.strip()
        if not line: continue
        if re.search(r'\bAFC\b', line) and len(line) < 40 and not LINK.search(line.replace('[[AFC', '')): conf = 'AFC'
        if re.search(r'\bNFC\b', line) and len(line) < 40 and not LINK.search(line.replace('[[NFC', '')): conf = 'NFC'
        label = re.sub(r"'''|=+", ' ', LINK.sub(lambda x: x.group(2) or x.group(1), line)).strip()
        is_label = (line.startswith('=') or (line.startswith("'''") and line.endswith("'''"))) and len(label) < 40
        if is_label:
            L = label.lower()
            if 'defens' in L or L in ('dl', 'lb', 'db') or 'line' in L and 'defensive' in L: ctx = None
            elif 'tackle' in L: ctx = 'OT'
            elif 'guard' in L: ctx = 'OG'
            elif 'center' in L: ctx = 'C'
            elif 'offensive line' in L or L in ('ol', 'offensive linemen'): ctx = 'OL'
            else: ctx = None
            continue
        if ctx is None: continue
        links = LINK.findall(line)
        if not links: continue
        name = links[0][1] or links[0][0]
        team_txt = ' '.join(l[0] for l in links[1:]) + ' ' + LINK.sub('', line)
        name = re.sub(r'\s*\(.*\)$', '', name).strip()
        fr = franchise(team_txt, season)
        if fr is None:
            ab = re.search(r'\(([A-Z.]{2,5})\)|–\s*([A-Z.]{2,5})\b', line)
            code = (ab.group(1) or ab.group(2)).replace('.', '') if ab else None
            if code in ABBR:
                fr = ABBR[code]
                if code == 'HOU': fr = 'TEN' if season <= 1996 else 'HOU'
                if code == 'BAL': fr = 'IND' if season <= 1983 else 'BAL'
                if code == 'STL': fr = 'ARI' if season <= 1987 else 'LAR'
                if code == 'LA': fr = 'LV' if conf == 'AFC' else 'LAR'
        pos = ctx
        if ctx == 'OL':
            tail = re.search(r'\)\s*([TGC])\s*$', line)
            pos = {'T': 'OT', 'G': 'OG', 'C': 'C'}[tail.group(1)] if tail else 'OL'
        out.append((season, pos, name, fr))
    return out
