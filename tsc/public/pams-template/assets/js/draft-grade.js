// ============================================================
// DRAFT GRADE - shared flex-VOR draft grading engine.
//
// Lifted verbatim out of draft/index.html so more than one page can read
// the same grades. The Draft Annual's report card and the Hall of Fame's
// Manager of the Year ballot both call DraftGrade.compute(): one copy of
// the weights, one copy of the curve maths, one place to tune them.
//
// Per pick:  actualVOR = fpts(actual finish) - replacement fpts   (floored at 0)
//            expectedVOR = fpts(draft slot) - replacement fpts     (floored at 0)
//            score = actualVOR + up*max(0, actualVOR - expectedVOR)
//                              - down*max(0, expectedVOR - actualVOR)
//                              + a dampened term for movement below the line
// Drafting the consensus best and landing the best = high production, zero
// delta -> a solid, expected pick. A late flier who finishes elite = high
// delta -> a steal. An early pick who busts loses on both terms. RB + WR are
// scored on one combined FLEX board (same shelf on draft day); QB/TE positional.
//
// Usage:
//   DraftGrade.compute({
//     years:         [2019, 2020, ...],
//     rankData:      { 2019: { <normName>: {rank, pos_rank, position, fpts, gp, player_name} } },
//     draftPosRanks: { 2019: { <normName>: {pos_draft_rank, position, overall_pick, manager_name, player_name, year} } },
//     yearTeamCount: { 2019: 12 },
//     yearData:      { 2019: [ ...raw picks... ] },
//     yearFinishes:  { 2019: { <manager_name>: <final finish> } },   // optional
//   })
//   -> { classes, classesByYear, drafters, byMgrYear, years, total } | null
//
// Two build helpers turn the raw league files into those inputs:
//   DraftGrade.buildRankLookup(rankFile.players)      -> rankData[year]
//   DraftGrade.buildDraftPosRanks(picks, year)        -> draftPosRanks[year]
// ============================================================
(function (root) {
'use strict';

// scored on one combined FLEX board (same shelf on draft day); QB/TE positional.
var GRADER_POS = ['QB','RB','WR','TE'];
// Replacement level per position as a multiple of team count. QB/TE sit past
// one-per-team: the QB12 finisher is the last starter, not a free stream, so
// replacement is the ~QB16 you could actually grab midseason. Keeps a QB10
// pick who returns QB12 from grading like he returned nothing.
var REPL_MULT = { QB: 1.35, RB: 2.5, WR: 3.0, TE: 1.25 };
// Flex replacement = RB 2.5 + WR 3.0 startable per team.
var REPL_FLEX = 5.5;
// Slot-delta weights per scoring board. For the single-starter positions
// (QB, TE) most of the reward now lives in the tier ladder itself, so their
// up-weights are modest; the flex board still runs on points. The down
// weights bite: a QB2 pick falling to QB9 is a real failure (~-45), while a
// fall that stays inside the elite tier is forgiven below.
var DELTA_UP   = { QB: 0.7, TE: 0.7, FLX: 1.35 };
var DELTA_DOWN = { QB: 0.7, TE: 0.85, FLX: 1.7 };
// QB and TE points curves are brutally steep, so their value is read through
// a banded lens: dampened credit above the elite tier, more-dampened credit
// from there down to replacement.
var VALUE_BANDS = {
    QB: { elite: 5, top: 0.6, band: 0.40 },
    TE: { elite: 3, top: 0.6, band: 0.45 },
};
// On top of the band, the top of the QB/TE boards is a fixed TIER ladder:
// finishing ranks 1..7 are worth the (points-based) rank-8 value plus these
// offsets. The gaps are ~20 between the top three, ~15 down through 7th,
// then ~10 into the pack, so an elite finish is separated by WHAT it was,
// not by how freakish that season's curve happened to be. Ranks 8+ stay on
// points, so the middle of the pack is untouched. TE runs ~15% richer than
// QB: late-drafted TEs that finish top-3 are the hardest hit to predict.
var TIER_OFFSETS = {
    QB: [110, 90, 70, 55, 40, 25, 10],
    TE: [127, 104, 81, 63, 46, 29, 12],
};
var TIER_FROM = 8; // ladder splices onto the points value at this rank
// Production kickers for the ladder positions. Rank owns the majority of
// elite value, but points buy back a minority stake: a finish above the
// splice adds TOP_MARGIN_W of its points over the year's pos-8 anchor, so a
// 494-point QB1 season (Lamar 19) or a TE1 who lapped the field (McBride 24)
// out-earns a routine one. Below the anchor, the first NEAR_WINDOW points of
// deficit are refunded at NEAR_REFUND of the band slope: a bunched pack
// (QB12 one ppg behind QB8) reads bunched instead of a class apart. The
// refund only reaches starter-rank finishes, so sub-line busts keep their
// tuned penalties.
var TOP_MARGIN_W = 0.25;
var NEAR_REFUND = 0.5;
var NEAR_WINDOW = { QB: 40, TE: 25 };
// The banded QB read keeps a solid full-season starter (QB5-7) down around
// 70-100, which sat light next to the other boards. Any QB pick that returned
// a starter-rank finish (top-12 in a 12-teamer) earns this flat credit: not
// steal money, just credit for landing a real weekly starter. Ramped in over
// score -20..0 so the tuned fall windows (QB2 -> QB9 at -40/-50) stay where
// they are and there's no cliff at zero. Elite finishes step the credit up
// from the flat 20: +4 per rank above QB5 (QB4 24, QB3 28, QB2 32, QB1 36),
// so even a QB3/QB4 slot that lands QB4 banks a little extra and the credit
// scales with the tier ladder instead of jumping.
var QB_STARTER_BONUS = 20;
var QB_ELITE_BONUS_STEP = 4;
// A pick that still finished inside the elite tier got what it paid for, so
// most of the slot-miss penalty is forgiven (QB1 -> QB4 is a fine outcome).
// Same idea on the flex board: FLEX 2 -> 3 (Bijan 25) is a hit, not a miss.
var DELTA_DOWN_ELITE = 0.2;
var FLX_ELITE = 6;
// Paid a top-6 flex price AND delivered a top-6 flex season: a weekly anchor
// you never had to think about. Raw VOR reads a met slot as a push (Bijan 25,
// FLEX 2 -> 3, barely +200), so the anchor guarantees at least this much
// reward on top of baseline — as a TOP-UP, not a flat add: the up-move delta
// counts toward it, so a monster season that already out-earned the guarantee
// gets nothing extra (CMC 19 stays +519) and finishing one slot better can
// never score lower than meeting the slot.
var FLX_ANCHOR_BONUS = 20;
// Totals hide missed time on the way up too: a climber who out-earned his
// slot in fewer games (Adams 25, FLEX 42 -> 24 in 14 games) gets a small
// per-missed-game credit, capped so tiny samples can't run away with it.
var CLIMB_GP_W = 0.02; var CLIMB_GP_MAX = 4;
// Heist premium: a top-6 flex finish dug out from deep in the draft is the
// defining steal, but raw VOR reads production through the year's points
// curve, so a cooler year's heist (Jacobs 22, FLEX 53 -> 6, 328 pts) was
// losing to a hot year's near-slot elite (JT 25, FLEX 20 -> 5, 362 pts)
// despite costing 33 slots more. Credit scales with depth past the elite
// line and caps, so top-of-draft picks get ~nothing and the ordering
// within a year never changes.
var FLX_HEIST_W = 0.5; var FLX_HEIST_CAP = 25;
// A flex pick from the top of the draft whose season fell below the startable
// line is nearly always injury, not a bad read. Soften those, don't erase.
// A top-10 flex pick who still finished startable but way under cost gets the
// same forgiveness IF the games-played data shows real missed time (Lamb 25
// WR2 -> WR22 in 14 games); a healthy season that just underperformed is a
// read the manager got wrong and eats the full penalty.
var INJURY_W = 0.65;
var INJURY_PARTIAL_W = 0.65;
var INJURY_GP_MAX = 14; // played this many games or fewer = missed real time
// A healthy top-10 flex pick that busted is a missed read and eats most of
// the penalty — but not every last point of it (Jefferson 25 at full freight
// felt cruel). A finish still inside the positional top-12 (WR11 from a WR2
// slot) means the flex board soured, not the position call; trim what's left.
var HEALTHY_BUST_W = 0.93;
var POS_STARTER_W = 0.8;
// Below the startable line both VOR terms floor at 0, so sub-line movement is
// scored on dampened raw points. Climbs stay token (a WR80 who reaches WR70
// still never starts); vanishing acts bleed real points, scaled by how much
// the slot promised, so a backup QB finishing QB44 lands well below a starter
// slipping two ranks.
var CLIMB_W = 0.1;  var CLIMB_CAP = 120;
var BUST_W  = 0.12; var BUST_CAP  = 250;

// Name key shared by the draft files and the fantasy-rank files. The two
// feeds disagree about punctuation and generational suffixes, so both sides
// get flattened to the same shape before they are matched.
function normName(name) {
    return (name || '').toLowerCase()
        .replace(/[.\u2018\u2019']/g, '')
        .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// players[] out of /data/fantasy_ranks/<profile>/<year>.json -> rankData[year].
function buildRankLookup(players) {
    players = players || [];
    var byPos = {};
    players.forEach(function (p) {
        var pos = (p.position || '?').toUpperCase();
        if (!byPos[pos]) byPos[pos] = [];
        byPos[pos].push(p);
    });
    Object.keys(byPos).forEach(function (pos) {
        byPos[pos].sort(function (a, b) { return (b.fpts || 0) - (a.fpts || 0); });
    });
    var lookup = {};
    players.forEach(function (p) {
        var pos = (p.position || '?').toUpperCase();
        var pList = byPos[pos] || [];
        var pr = pList.findIndex(function (q) { return q.player_name === p.player_name; }) + 1;
        lookup[normName(p.player_name)] = {
            rank:        p.rank,
            pos_rank:    pr > 0 ? pr : null,
            position:    pos,
            fpts:        p.fpts,
            gp:          p.gp != null ? p.gp : null,
            player_name: p.player_name,
        };
    });
    return lookup;
}

// picks[] out of /data/drafts/<year>.json -> draftPosRanks[year]. Positional
// draft rank is the order taken within a position, which is the price the
// manager actually paid for him.
function buildDraftPosRanks(picks, year) {
    var byPos = {};
    (picks || []).forEach(function (p) {
        if (!p.manager_name) return;
        var pos = (p.position || '').toUpperCase();
        if (GRADER_POS.indexOf(pos) < 0) return;
        if (!byPos[pos]) byPos[pos] = [];
        byPos[pos].push(p);
    });
    var out = {};
    Object.keys(byPos).forEach(function (pos) {
        byPos[pos].sort(function (a, b) { return a.overall_pick - b.overall_pick; });
        byPos[pos].forEach(function (p, i) {
            out[normName(p.player_name)] = {
                pos_draft_rank: i + 1,
                position:       pos,
                overall_pick:   p.overall_pick,
                manager_name:   p.manager_name,
                player_name:    p.player_name,
                year:           year,
            };
        });
    });
    return out;
}

// The engine. Every year-keyed feed arrives as an argument so the module
// holds no state of its own and two callers can grade different leagues on
// the same page without stepping on each other.
function compute(input) {
    input = input || {};
    var YEARS         = input.years || [];
    var rankData      = input.rankData || {};
    var draftPosRanks = input.draftPosRanks || {};
    var yearTeamCount = input.yearTeamCount || {};
    var yearData      = input.yearData || {};
    var yearFinishes  = input.yearFinishes || {};

    // year -> pos -> [fpts...] descending. Lets us read the fpts of the Nth finisher.
    function graderFptsCurves() {
        var curves = {};
        YEARS.forEach(function (y) {
            if (!rankData[y]) return;
            var byPos = {};
            Object.keys(rankData[y]).forEach(function (nn) {
                var r = rankData[y][nn];
                var pos = (r.position || '').toUpperCase();
                if (GRADER_POS.indexOf(pos) < 0) return;
                (byPos[pos] = byPos[pos] || []).push(r.fpts || 0);
            });
            Object.keys(byPos).forEach(function (pos) {
                byPos[pos].sort(function (a, b) { return b - a; });
            });
            // Combined RB+WR board for flex scoring.
            byPos.FLX = (byPos.RB || []).concat(byPos.WR || []).sort(function (a, b) { return b - a; });
            curves[y] = byPos;
        });
        return curves;
    }

    function fptsAtRank(curve, rank) {
        if (!curve || !curve.length || rank == null || rank < 1) return 0;
        return curve[Math.min(rank, curve.length) - 1] || 0;
    }

    function replacementFpts(curve, pos, teams) {
        var t = teams > 0 ? teams : 12;
        var rank = Math.max(1, Math.round((REPL_MULT[pos] || 1) * t));
        return fptsAtRank(curve, rank);
    }

    function letterForPct(pct) {
        // pct: 0 = best class in the field, 1 = worst. Fixed cutoffs so the
        // distribution of grades is stable regardless of how many classes exist.
        if (pct <= 0.06) return 'A+';
        if (pct <= 0.16) return 'A';
        if (pct <= 0.28) return 'A-';
        if (pct <= 0.40) return 'B+';
        if (pct <= 0.55) return 'B';
        if (pct <= 0.68) return 'B-';
        if (pct <= 0.78) return 'C+';
        if (pct <= 0.86) return 'C';
        if (pct <= 0.93) return 'C-';
        if (pct <= 0.98) return 'D';
        return 'F';
    }

    function gradeClass(letter) {
        if (letter === 'A+') return 'grade-Ap';
        return 'grade-' + letter.charAt(0);
    }

    function computeGrader() {
        var curves = graderFptsCurves();
        var gradeYears = YEARS.filter(function (y) { return curves[y] && draftPosRanks[y]; });
        if (!gradeYears.length) return null;

        var byMgrYear = {}; // mgr -> year -> { score, picks:[] }
        gradeYears.forEach(function (y) {
            var teams = yearTeamCount[y] || 0;

            // Flex draft rank: order taken among ALL drafted RB+WR (the real cost
            // of the pick). Keyed by normName to match draftPosRanks.
            var flexDraftRank = {};
            (yearData[y] || [])
                .filter(function (p) {
                    var pp = (p.position || '').toUpperCase();
                    return p.manager_name && (pp === 'RB' || pp === 'WR');
                })
                .sort(function (a, b) { return a.overall_pick - b.overall_pick; })
                .forEach(function (p, i) { flexDraftRank[normName(p.player_name)] = i + 1; });

            // Flex finish rank: combined RB+WR points leaderboard for the season.
            var flexFinalRank = {};
            Object.keys(rankData[y])
                .filter(function (nn) {
                    var r = rankData[y][nn];
                    return r.position === 'RB' || r.position === 'WR';
                })
                .sort(function (a, b) { return (rankData[y][b].fpts || 0) - (rankData[y][a].fpts || 0); })
                .forEach(function (nn, i) { flexFinalRank[nn] = i + 1; });

            Object.keys(draftPosRanks[y]).forEach(function (nn) {
                var d = draftPosRanks[y][nn];
                var pos = d.position;
                if (GRADER_POS.indexOf(pos) < 0 || !d.manager_name) return;
                var isFlex = pos === 'RB' || pos === 'WR';
                var curve = isFlex ? (curves[y].FLX || []) : (curves[y][pos] || []);
                var flexReplRank = Math.max(1, Math.round(REPL_FLEX * (teams > 0 ? teams : 12)));
                var repl = isFlex
                    ? fptsAtRank(curve, flexReplRank)
                    : replacementFpts(curve, pos, teams);
                var fin = rankData[y][nn];
                var finPosRank = fin ? fin.pos_rank : null;
                var dr = isFlex ? (flexDraftRank[nn] || 0) : d.pos_draft_rank;
                var actualF = fin ? (fin.fpts || 0) : 0;
                var expF = fptsAtRank(curve, dr);
                // Floor both at zero: you can't secure negative value (an unranked
                // finish is worth nothing, not a debt), and a deep slot implies ~0
                // expectation. This puts the penalty on early picks that busted.
                var band = VALUE_BANDS[pos];
                var vorOf;
                if (band) {
                    var fElite = fptsAtRank(curve, band.elite);
                    vorOf = function (x) {
                        return band.top  * Math.max(0, x - fElite)
                             + band.band * Math.max(0, Math.min(x, fElite) - repl);
                    };
                } else {
                    vorOf = function (x) { return Math.max(0, x - repl); };
                }
                var actualVor, expVor;
                if (band) {
                    // Rank-ladder value: points-based at TIER_FROM and deeper,
                    // fixed tier offsets above it. Both sides (finish and slot)
                    // are read off the same ladder.
                    var base = vorOf(fptsAtRank(curve, TIER_FROM));
                    var offs = TIER_OFFSETS[pos];
                    var vorAtRank = function (r) {
                        if (r == null || r < 1) return 0;
                        if (r >= TIER_FROM) return vorOf(fptsAtRank(curve, r));
                        return base + offs[r - 1];
                    };
                    actualVor = finPosRank ? vorAtRank(finPosRank) : 0;
                    expVor = vorAtRank(dr);
                } else {
                    actualVor = vorOf(actualF);
                    expVor = vorOf(expF);
                }
                var board = isFlex ? 'FLX' : pos;
                var downW = DELTA_DOWN[board];
                if (band && finPosRank && finPosRank <= band.elite) downW = DELTA_DOWN_ELITE;
                if (isFlex && flexFinalRank[nn] && flexFinalRank[nn] <= FLX_ELITE) downW = DELTA_DOWN_ELITE;
                var score = actualVor
                          + DELTA_UP[board] * Math.max(0, actualVor - expVor)
                          - downW           * Math.max(0, expVor - actualVor);
                // Movement below the startable line, dampened. bust = points the
                // finish fell short of what the slot promised under the line;
                // climb = points gained under the line. Continuous with the VOR
                // terms, so a pick drafted one rank past the line isn't scored on
                // a different planet than one drafted a rank before it.
                var bustPts  = Math.max(0, Math.min(repl, expF) - actualF);
                var climbPts = Math.max(0, Math.min(repl, actualF) - expF);
                score += CLIMB_W * Math.min(climbPts, CLIMB_CAP)
                       - BUST_W  * Math.min(bustPts,  BUST_CAP);
                // Production kickers (see TOP_MARGIN_W / NEAR_REFUND): points buy
                // back a minority stake on the ladder boards.
                if (band && finPosRank) {
                    var f8 = fptsAtRank(curve, TIER_FROM);
                    if (finPosRank < TIER_FROM) {
                        score += TOP_MARGIN_W * Math.max(0, actualF - f8);
                    } else if (finPosRank <= Math.round((REPL_MULT[pos] || 1) * (teams > 0 ? teams : 12))) {
                        score += NEAR_REFUND * band.band
                               * Math.min(Math.max(0, f8 - actualF), NEAR_WINDOW[pos]);
                    }
                }
                // QB starter credit (see QB_STARTER_BONUS): finished inside the
                // starter ranks, so the pick returned a weekly starter. Elite
                // finishes (QB1-4) step the credit up the tier ladder.
                if (pos === 'QB' && finPosRank && finPosRank <= (teams > 0 ? teams : 12)) {
                    var qbCred = QB_STARTER_BONUS
                               + QB_ELITE_BONUS_STEP * Math.max(0, 5 - finPosRank);
                    score += Math.max(0, Math.min(qbCred, score + qbCred));
                }
                // Positional guard: an RB/WR who met or beat his positional draft
                // slot was never a bad pick, even if the combined flex board says
                // the other position surged past him. Sometimes you need the
                // position. Met the slot -> floor at -3; beat it -> floor at 0.
                if (isFlex && finPosRank && finPosRank <= d.pos_draft_rank) {
                    score = Math.max(score, finPosRank < d.pos_draft_rank ? 0 : -3);
                }
                // Injury forgiveness: a flex pick from the first ~1.7 rounds whose
                // season landed below the startable line almost certainly got hurt.
                // That's variance, not a read the manager blew. Soften the hit.
                // The startable-but-way-under-cost tier is gated on games played
                // (missing gp data forgives, benefit of the doubt): actual missed
                // time earns the discount, a healthy bust doesn't.
                if (isFlex && score < 0 && dr <= Math.round(1.7 * (teams > 0 ? teams : 12))) {
                    var ffr = flexFinalRank[nn] || null;
                    var hurtGp = !fin || fin.gp == null || fin.gp <= INJURY_GP_MAX;
                    if (!ffr || ffr > flexReplRank) score *= INJURY_W;
                    else if (dr <= 10) score *= hurtGp ? INJURY_PARTIAL_W : HEALTHY_BUST_W;
                }
                // Positional-starter relief: still a weekly starter at his own
                // position despite the flex slide.
                if (isFlex && score < 0 && finPosRank && finPosRank <= (teams > 0 ? teams : 12)) {
                    score *= POS_STARTER_W;
                }
                // Missed-time credit on hits: the climb was earned in fewer games.
                if (isFlex && score > 0 && fin && fin.gp) {
                    var missedG = Math.max(0, (y >= 2021 ? 17 : 16) - fin.gp);
                    if (missedG) score *= 1 + CLIMB_GP_W * Math.min(missedG, CLIMB_GP_MAX);
                }
                // Elite anchor premium (see FLX_ANCHOR_BONUS): top up whatever
                // the up-move delta already paid to the guaranteed minimum.
                if (isFlex && dr >= 1 && dr <= FLX_ELITE
                    && flexFinalRank[nn] && flexFinalRank[nn] <= FLX_ELITE) {
                    var upPaid = DELTA_UP.FLX * Math.max(0, actualVor - expVor);
                    score += Math.max(0, FLX_ANCHOR_BONUS - upPaid);
                }
                // Heist premium (see FLX_HEIST_W): elite flex finish from a deep slot.
                if (isFlex && dr > FLX_ELITE && flexFinalRank[nn] && flexFinalRank[nn] <= FLX_ELITE) {
                    score += Math.min(FLX_HEIST_CAP, FLX_HEIST_W * (dr - FLX_ELITE));
                }
                var mgr = d.manager_name;
                byMgrYear[mgr] = byMgrYear[mgr] || {};
                var cell = byMgrYear[mgr][y] = byMgrYear[mgr][y] || { score: 0, picks: [] };
                cell.score += score;
                cell.picks.push({
                    player_name: d.player_name, pos: pos,
                    pos_draft_rank: d.pos_draft_rank, pos_final_rank: finPosRank,
                    flex_dr: isFlex ? (flexDraftRank[nn] || null) : null,
                    flex_fr: isFlex ? (flexFinalRank[nn] || null) : null,
                    fpts: actualF, gp: fin && fin.gp ? fin.gp : null,
                    score: score, overall_pick: d.overall_pick,
                });
            });
        });

        var classes = [];
        Object.keys(byMgrYear).forEach(function (mgr) {
            Object.keys(byMgrYear[mgr]).forEach(function (y) {
                var c = byMgrYear[mgr][y];
                if (!c.picks.length) return;
                c.picks.sort(function (a, b) { return b.score - a.score; });
                classes.push({
                    manager: mgr, year: +y, score: c.score, picks: c.picks,
                    posPicks: c.picks.filter(function (p) { return p.score > 0; }).length,
                });
            });
        });
        // Class ties are judged at displayed precision (whole points), so two
        // sheets both reading −17 break on merit instead of float dust: more
        // plus-scoring picks first, then the better single best pick, then name.
        function classCmp(a, b) {
            var as = Math.round(a.score), bs = Math.round(b.score);
            if (as !== bs) return bs - as;
            if (a.posPicks !== b.posPicks) return b.posPicks - a.posPicks;
            var ab = Math.round(a.picks[0].score), bb = Math.round(b.picks[0].score);
            if (ab !== bb) return bb - ab;
            return a.manager < b.manager ? -1 : 1;
        }
        classes.sort(classCmp);
        var N = classes.length;
        classes.forEach(function (c, i) {
            c.rank = i + 1;
            // S tier sits above the letter scale and is absolute, not percentile:
            // a four-digit class is an S no matter how crowded the top gets.
            c.grade = c.score >= 1000 ? 'S' : letterForPct(N > 1 ? i / (N - 1) : 0);
            byMgrYear[c.manager][c.year].rank = c.rank;
            byMgrYear[c.manager][c.year].grade = c.grade;
        });

        // Within-year rank: how a class finished against the other drafts of its
        // own year — the number people actually think in ("3rd best draft of 2023").
        var classesByYear = {};
        classes.forEach(function (c) { (classesByYear[c.year] = classesByYear[c.year] || []).push(c); });
        Object.keys(classesByYear).forEach(function (y) {
            classesByYear[y].sort(classCmp);
            classesByYear[y].forEach(function (c, i) {
                c.yearRank = i + 1;
                byMgrYear[c.manager][c.year].yearRank = i + 1;
            });
        });

        var drafters = [];
        Object.keys(byMgrYear).forEach(function (mgr) {
            var ranks = [], gradedYears = [];
            Object.keys(byMgrYear[mgr]).forEach(function (y) {
                var cell = byMgrYear[mgr][y];
                if (cell.yearRank) { ranks.push(cell.yearRank); gradedYears.push(+y); }
            });
            if (!ranks.length) return;
            var sum = ranks.reduce(function (a, b) { return a + b; }, 0);
            var totalScore = 0, fins = [];
            Object.keys(byMgrYear[mgr]).forEach(function (y) {
                totalScore += byMgrYear[mgr][y].score || 0;
                // Full-season standing (playoffs included) from the export's
                // finishes map; years without it just don't count in the average.
                var f = (yearFinishes[y] || {})[mgr];
                if (f) fins.push(f);
            });
            drafters.push({
                manager: mgr, avgRank: sum / ranks.length, classes: ranks.length,
                best: Math.min.apply(null, ranks), years: gradedYears.sort(),
                totalScore: totalScore,
                avgFinish: fins.length
                    ? fins.reduce(function (a, b) { return a + b; }, 0) / fins.length
                    : null,
            });
        });

        // Qualification: averages are per-class so career length is neutral, but
        // short careers are noisy — one hot draft shouldn't headline the board. A
        // manager needs 3 graded classes to fully qualify; the threshold adapts
        // down for young leagues so nobody is provisional when nobody could have 3.
        var maxClasses = 0;
        drafters.forEach(function (d) { if (d.classes > maxClasses) maxClasses = d.classes; });
        var needed = Math.min(3, maxClasses);
        drafters.forEach(function (d) { d.qualified = d.classes >= needed; });
        // Ties on avg rank used to fall through to object-key order (arbitrary).
        // Now: better single-year finish, then career score, then name for
        // stability. Class count is deliberately NOT a tiebreaker: newer managers
        // could never win one.
        drafters.sort(function (a, b) {
            if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
            if (a.avgRank !== b.avgRank) return a.avgRank - b.avgRank;
            if (a.best !== b.best) return a.best - b.best;
            if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
            return a.manager < b.manager ? -1 : 1;
        });

        return {
            classes: classes, classesByYear: classesByYear, drafters: drafters,
            byMgrYear: byMgrYear, years: gradeYears.slice().sort(), total: N,
        };
    }

    return computeGrader();
}

root.DraftGrade = {
    compute:            compute,
    normName:           normName,
    buildRankLookup:    buildRankLookup,
    buildDraftPosRanks: buildDraftPosRanks,
    GRADER_POS:         GRADER_POS,
};

})(typeof window !== 'undefined' ? window : this);
