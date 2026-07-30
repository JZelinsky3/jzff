// ============================================================
// ALL-TIME TEAM - shared squad builder.
//
// Lifted out of managers/all-time.html so the desktop annual and the
// mobile app read the same squads. One copy of the slot rules, one copy
// of the bench rules, one place to tune them.
//
// Per manager: every player they drafted or started is scouted, credited
// with his single best season while on that roster, then dealt into the
// starting lineup (best available per slot, one slot per player). The
// leftovers fill a six-deep bench picked by positional finish, capped at
// two per position so it reads like a real bench.
//
// Usage:
//   AllTimeTeam.buildRankLookup(rankFile.players)   -> ranks[year]
//   AllTimeTeam.buildAll(pool.managers, {
//     ranks:     { 2019: <lookup>, ... },
//     superflex: false,
//   })
//   -> { teams: { <uid>: team }, order: [ <uid> ... ] }   // order = by total
//
// A team carries: uid, name, isCurrent, seasonsScouted, poolSize, slots
// (7, or 8 in superflex), bench, total, ppw, captainKey. Each player carries
// gp + ppg alongside its season totals.
// ============================================================
(function (root) {
'use strict';

function normName(name) {
    return (name || '').toLowerCase()
        // Curly apostrophes escaped rather than literal so the class survives
        // any re-encoding of this file. Matches draft-grade.js's normName, and
        // is one char wider than the page's old copy: a curly-quote name in the
        // rank file now joins a straight-quote name in the pool.
        .replace(/[.\u2018\u2019']/g, '')
        .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// players[] out of /data/fantasy_ranks/<profile>/<year>.json -> one year's
// lookup. Positional rank is recomputed from points so it always matches the
// profile the league is graded on, whatever order the file arrived in.
function buildRankLookup(players) {
    var byPos = {};
    (players || []).forEach(function (p) {
        var pos = (p.position || '?').toUpperCase();
        (byPos[pos] = byPos[pos] || []).push(p);
    });
    Object.keys(byPos).forEach(function (pos) {
        byPos[pos].sort(function (a, b) { return (b.fpts || 0) - (a.fpts || 0); });
    });
    var lookup = {};
    Object.keys(byPos).forEach(function (pos) {
        byPos[pos].forEach(function (p, i) {
            lookup[normName(p.player_name)] = {
                fpts: p.fpts || 0,
                posRank: i + 1,
                overall: p.rank,
                pid: p.player_id || null,
                pos: pos,
                gp: p.gp != null ? p.gp : null,
            };
        });
    });
    return lookup;
}

// One manager out of all_time_pool.json -> their all-time squad.
function buildTeam(mgr, opts) {
    opts = opts || {};
    var ranks = opts.ranks || {};
    var superflex = !!opts.superflex;

    var best = {};   // normName -> best candidate season
    (mgr.seasons || []).forEach(function (se) {
        var lookup = ranks[se.year];
        if (!lookup) return;
        (se.players || []).forEach(function (p) {
            var key = normName(p.name);
            var lk = lookup[key];
            if (!lk || !lk.fpts) return;
            var cand = {
                name: p.name, key: key,
                pos: lk.pos, year: se.year,
                fpts: lk.fpts, posRank: lk.posRank, overall: lk.overall, pid: lk.pid,
                // Games played comes from the rank file. Per-game rate is the
                // honest read on a season: 300 points over 17 games is a very
                // different player from 300 over 11.
                gp: lk.gp,
                ppg: lk.gp ? Math.round((lk.fpts / lk.gp) * 10) / 10
                           : Math.round((lk.fpts / (se.year >= 2021 ? 17 : 16)) * 10) / 10,
                src: p.source,
                round: p.round, roundPick: p.round_pick, overallPick: p.overall,
                starts: p.weeks_started || 0, startPts: p.started_pts || 0,
                teamRank: se.final_rank != null ? se.final_rank : null,
            };
            if (!best[key] || cand.fpts > best[key].fpts) best[key] = cand;
        });
    });

    var all = Object.keys(best).map(function (k) { return best[k]; })
        .sort(function (a, b) { return b.fpts - a.fpts; });

    var used = {};
    function take(filter) {
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (used[c.key]) continue;
            if (filter(c)) { used[c.key] = 1; return c; }
        }
        return null;
    }
    var slots = [
        { slot: 'QB',   player: take(function (c) { return c.pos === 'QB'; }) },
        { slot: 'RB1',  player: take(function (c) { return c.pos === 'RB'; }) },
        { slot: 'RB2',  player: take(function (c) { return c.pos === 'RB'; }) },
        { slot: 'WR1',  player: take(function (c) { return c.pos === 'WR'; }) },
        { slot: 'WR2',  player: take(function (c) { return c.pos === 'WR'; }) },
        { slot: 'TE',   player: take(function (c) { return c.pos === 'TE'; }) },
        { slot: 'FLEX', player: take(function (c) { return c.pos === 'RB' || c.pos === 'WR' || c.pos === 'TE'; }) },
    ];
    // Superflex leagues start a second QB-eligible slot. Taken after FLEX so
    // the flex still pulls from the RB/WR/TE pool first; the SF then grabs the
    // best remaining QB-eligible season (usually the manager's 2nd-best QB).
    if (superflex) {
        slots.push({ slot: 'SF', player: take(function (c) {
            return c.pos === 'QB' || c.pos === 'RB' || c.pos === 'WR' || c.pos === 'TE';
        }) });
    }
    /* The reserves: picked by positional finish, not raw points (raw
       totals would stack the bench with QB seasons), and capped at two
       per position so it reads like a real bench. Backfill by finish
       if the cap leaves seats empty. */
    var leftovers = all.filter(function (c) { return !used[c.key]; })
        .sort(function (a, b) { return a.posRank - b.posRank || b.fpts - a.fpts; });
    var bench = [];
    var perPos = {};
    leftovers.forEach(function (c) {
        if (bench.length >= 6) return;
        if ((perPos[c.pos] || 0) >= 2) return;
        perPos[c.pos] = (perPos[c.pos] || 0) + 1;
        bench.push(c);
    });
    if (bench.length < 6) {
        leftovers.forEach(function (c) {
            if (bench.length >= 6) return;
            if (bench.indexOf(c) === -1) bench.push(c);
        });
    }
    var total = 0;
    var captain = null;
    var ppw = 0;
    slots.forEach(function (s) {
        if (!s.player) return;
        total += s.player.fpts;
        // Weekly-output estimate: each starter's season total spread over
        // that season's schedule (17 games from 2021 on, 16 before).
        ppw += s.player.fpts / (s.player.year >= 2021 ? 17 : 16);
        // Captain: the squad's best positional finish, not raw points --
        // raw totals would pin the star on the QB every time. Ties break
        // on points.
        if (!captain
            || s.player.posRank < captain.posRank
            || (s.player.posRank === captain.posRank && s.player.fpts > captain.fpts)) {
            captain = s.player;
        }
    });
    return {
        uid: mgr.user_id,
        name: mgr.name,
        isCurrent: mgr.is_current !== false,
        seasonsScouted: (mgr.seasons || []).length,
        poolSize: all.length,
        slots: slots,
        bench: bench,
        total: Math.round(total * 10) / 10,
        ppw: Math.round(ppw * 10) / 10,
        captainKey: captain ? captain.key : null,
    };
}

// Every manager in the pool -> { teams, order }. Managers whose pool came
// back empty (no season joined a rank file) are dropped: there is no squad
// to show, and they would otherwise sit at the bottom of the gallery on 0.
function buildAll(managers, opts) {
    var teams = {};
    (managers || []).forEach(function (mgr) {
        if (!mgr || !mgr.user_id) return;
        var team = buildTeam(mgr, opts);
        if (team.poolSize > 0) teams[mgr.user_id] = team;
    });
    var order = Object.keys(teams);
    order.sort(function (a, b) { return teams[b].total - teams[a].total; });
    return { teams: teams, order: order };
}

root.AllTimeTeam = {
    normName:        normName,
    buildRankLookup: buildRankLookup,
    buildTeam:       buildTeam,
    buildAll:        buildAll,
};

})(typeof window !== 'undefined' ? window : this);
