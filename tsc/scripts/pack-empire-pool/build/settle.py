# One card a rarity for every man, across every position he's listed at. Joey's
# rule (2026-10-31): when two of a man's seasons land on one rarity, a card within
# PUSH_WITHIN of a rarity line crosses it, up or down, to the side that's free.
#
# Joey again, same day: adding cards must never cost anyone a card they've
# collected. So a NEW season always gives way: it can cross a line, but if it
# can't it simply isn't added, and a dealt card never moves for it. Two DEALT
# cards can only meet if a rating rule changes; then the lesser stays in the
# rarity under the line, however far that is, rather than leave people's binders.
# The vault (data/vaulted.json) now only takes a dealt card with nowhere lower to
# go. Anything vaulted is never dealt or re-picked, and lineups and binders that
# hold it still read it.
import json, os
import pandas as pd

from select_skill import BANDS, SCORE_AT, rarity_for
from seasons import VAULT_FILE

PUSH_WITHIN = 200
UP = {b: BANDS[i - 1] for i, b in enumerate(BANDS) if i}       # the band above
DOWN = {b: BANDS[i + 1] for i, b in enumerate(BANDS[:-1])}     # the band below


def settle(cards):
    """cards: every season, with `true` (its value on the curve), `kept` (it's
    dealt today) and `was` (its rarity today). Sets each one's score and band, and
    returns (cards, indexes to vault, indexes refused, notes)."""
    cards = cards.copy()
    cards['score'] = cards.true
    cards['band'] = cards.true.map(rarity_for)
    vault, refused, notes = [], [], []
    for pid, mine in cards.groupby('pid', sort=False):
        # Dealt cards settle first, so a new one only ever sees what's left.
        order = list(mine.sort_values(['kept', 'true'], ascending=[False, False]).index)
        while True:
            live = [i for i in order if i not in vault and i not in refused]
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
            if cards.at[hi, 'score'] < cards.at[lo, 'score'] and cards.at[lo, 'kept'] == cards.at[hi, 'kept']: hi, lo = lo, hi
            band = cards.at[hi, 'band']
            moves = []
            fresh = not cards.at[lo, 'kept']
            if band in UP and UP[band] not in bands and not fresh:
                gap = SCORE_AT[UP[band]] - cards.at[hi, 'score']
                moves.append((gap, hi, UP[band], SCORE_AT[UP[band]]))
            if band in DOWN and DOWN[band] not in bands:
                gap = cards.at[lo, 'score'] - SCORE_AT[band]
                moves.append((gap, lo, DOWN[band], SCORE_AT[band] - 5))
            # A dealt card going back to the rarity it's already on beats moving
            # anything else: that's the move nobody's binder notices.
            moves = sorted((m for m in moves if m[0] <= PUSH_WITHIN), key=lambda m: (m[2] != cards.at[m[1], 'was'], m[0]))
            name = f"{cards.at[lo, 'display']} {cards.at[lo, 'season']} ({cards.at[lo, 'pos']})"
            if not moves and not fresh and band in DOWN and DOWN[band] not in bands:
                moves = [(0, lo, DOWN[band], SCORE_AT[band] - 5)]
            if moves:
                _, i, to, value = moves[0]
                notes.append(f"  push {cards.at[i, 'display']} {cards.at[i, 'season']} ({cards.at[i, 'pos']}): {cards.at[i, 'band']} {cards.at[i, 'score']} -> {to} {value}")
                cards.at[i, 'band'] = to
                cards.at[i, 'score'] = value
            elif fresh:
                refused.append(lo)
                notes.append(f"  not added {name}: {band} {cards.at[lo, 'score']}, {cards.at[hi, 'display']} {cards.at[hi, 'season']} holds {band}")
            else:
                vault.append(lo)
                notes.append(f"  vault {name}: {band} {cards.at[lo, 'score']}, {cards.at[hi, 'display']} {cards.at[hi, 'season']} holds {band} at {cards.at[hi, 'score']}")
    return cards, vault, refused, notes


def remember(vaulted):
    """Add to the list the selection steps read, so a rebuild can't re-pick them."""
    have = json.load(open(VAULT_FILE)) if os.path.exists(VAULT_FILE) else []
    seen = {(c['pid'], c['year']) for c in have}
    have += [{'pid': c['pid'], 'year': c['year'], 'id': c['id']} for c in vaulted if (c['pid'], c['year']) not in seen]
    with open(VAULT_FILE, 'w') as f:
        json.dump(have, f, indent=1)
        f.write('\n')
