# One card a rarity for every man, across every position he's listed at. Joey's
# rule (2026-10-31): when two of a man's seasons land on one rarity, a card within
# PUSH_WITHIN of a rarity line crosses it, up or down, to the side that's free. A
# card in the middle of the band can't be moved honestly, so the lesser season
# goes in the vault: never dealt, never re-picked, and any lineup or binder that
# already holds it still reads it (data/vaulted.json). The pool gets more cards
# to fill the gap, not a season at a value it didn't earn.
import json, os
import pandas as pd

from select_skill import BANDS, SCORE_AT, rarity_for
from seasons import VAULT_FILE

PUSH_WITHIN = 200
UP = {b: BANDS[i - 1] for i, b in enumerate(BANDS) if i}       # the band above
DOWN = {b: BANDS[i + 1] for i, b in enumerate(BANDS[:-1])}     # the band below


def settle(cards):
    """cards: every dealt season, with `true` (its value on the curve). Sets each
    one's score and band, and returns (cards, indexes to vault, notes)."""
    cards = cards.copy()
    cards['score'] = cards.true
    cards['band'] = cards.true.map(rarity_for)
    vault, notes = [], []
    for pid, mine in cards.groupby('pid', sort=False):
        order = list(mine.sort_values('true', ascending=False).index)
        while True:
            live = [i for i in order if i not in vault]
            bands = {}
            clash = None
            for i in live:
                b = cards.at[i, 'band']
                if b in bands:
                    clash = (bands[b], i)
                    break
                bands[b] = i
            if clash is None: break
            hi, lo = clash
            band = cards.at[hi, 'band']
            moves = []
            if band in UP and UP[band] not in bands:
                gap = SCORE_AT[UP[band]] - cards.at[hi, 'score']
                moves.append((gap, hi, UP[band], SCORE_AT[UP[band]]))
            if band in DOWN and DOWN[band] not in bands:
                gap = cards.at[lo, 'score'] - SCORE_AT[band]
                moves.append((gap, lo, DOWN[band], SCORE_AT[band] - 5))
            moves = sorted(m for m in moves if m[0] <= PUSH_WITHIN)
            name = f"{cards.at[lo, 'display']} {cards.at[lo, 'season']} ({cards.at[lo, 'pos']})"
            if moves:
                _, i, to, value = moves[0]
                notes.append(f"  push {cards.at[i, 'display']} {cards.at[i, 'season']} ({cards.at[i, 'pos']}): {cards.at[i, 'band']} {cards.at[i, 'score']} -> {to} {value}")
                cards.at[i, 'band'] = to
                cards.at[i, 'score'] = value
            else:
                vault.append(lo)
                notes.append(f"  vault {name}: {band} {cards.at[lo, 'score']}, {cards.at[hi, 'display']} {cards.at[hi, 'season']} holds {band} at {cards.at[hi, 'score']}")
    return cards, vault, notes


def remember(vaulted):
    """Add to the list the selection steps read, so a rebuild can't re-pick them."""
    have = json.load(open(VAULT_FILE)) if os.path.exists(VAULT_FILE) else []
    seen = {(c['pid'], c['year']) for c in have}
    have += [{'pid': c['pid'], 'year': c['year'], 'id': c['id']} for c in vaulted if (c['pid'], c['year']) not in seen]
    with open(VAULT_FILE, 'w') as f:
        json.dump(have, f, indent=1)
        f.write('\n')
