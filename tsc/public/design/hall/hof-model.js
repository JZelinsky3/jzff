// ============================================================
// HALL OF FAME MODEL - prototype computation layer.
//
// Loads a league's exported almanac feeds and derives two things the
// site does not carry yet:
//
//   1. The HOF Index      - a career score per manager, plus the
//                           enshrinement rule that decides who is in.
//   2. Manager of the Year - a per-season ballot, one row per manager,
//                           built from result, scoring, draft, coaching
//                           and roster building.
//
// Three prototype pages (rotunda / trophy-room / induction) render the
// same model, so a design can be judged on real numbers instead of
// lorem. Whichever design wins, this file is the thing that gets ported
// into the exporter as hall_of_fame.json.
//
//   HOF.load({ league: 'pams' })  -> real league data (needs a session)
//   HOF.load({})                  -> the demo league
// ============================================================
(function (root) {
'use strict';

// ── Trophy case weights ──────────────────────────────────────
// A title is the point of the whole exercise, so it dwarfs everything
// else. Runner-up is worth real money because losing a final is a
// season nobody forgets. Berths accumulate slowly: showing up to the
// playoffs eight times is a career, not an accolade.
var TROPHY_PTS = {
    title:       32,   // the anchor everything else is priced against
    // Reaching the final is its own achievement, not a consolation. A title
    // is worth exactly two of them: winning it all doubles what getting
    // there was worth, and a career of near-misses can still build a case.
    runner_up:   16,
    // Manager of the Year. Priced BELOW its apparent importance on purpose:
    // most of the ballot (final standing, all-play, scoring) re-reads data
    // the trophy case and the rate term already count, so paying full
    // freight for it would reward one good season three times over. Only
    // the draft and in-season halves are genuinely new information.
    moty:         8,
    points_title:10,   // most points scored — schedule-proof, so it outranks the crown
    reg_crown:    8,   // best regular-season record
    third:        6,
    berth:        3,   // longevity, deliberately slow to accumulate
};
// Saturation constant for the trophy curve: T = 100 * pts / (pts + K).
// Every additional title is worth less than the last, which is what
// keeps a 0-100 index from running away in a twenty-year league while
// still separating one ring from three.
var TROPHY_K = 45;

// Index mix. Trophies lead, but a case built only on hardware loses to
// one that also shows up every year.
var W_TROPHY = 0.40;
var W_RATE   = 0.35;
var W_PEAK   = 0.25;

// Per-season quality q, the unit both the rate and peak terms average.
var Q_FINISH = 0.45;   // where you finished, as a percentile of the field
var Q_WINPCT = 0.30;   // how often you won
var Q_POINTS = 0.25;   // how hard you scored, z-scored inside the season

// ── Enshrinement ─────────────────────────────────────────────
// Deliberately not the real Hall's rules. In a fantasy league the same
// faces play for a decade, so the bar is "clearly the top of the room
// you actually play in", floated against the field, with an absolute
// floor so a young or weak league cannot enshrine a thin resume.
// Seasons required to be eligible at all. Scales with the league's own
// history: three seasons is a real body of work in a five-year league and a
// cameo in a twenty-year one. A third of the league's life, floored at 3 so
// young leagues are unaffected (a 7-season league still asks for 3, a
// 15-season league asks for 5), and never more than the league has existed.
var MIN_SEASONS       = 3;
var ELIGIBLE_SHARE    = 1 / 3;
var ABSOLUTE_FLOOR   = 55;    // no field is weak enough to get you in below this
var FIELD_SD_ABOVE   = 0.75;  // how far above the eligible mean the bar sits
var HALL_SHARE       = 0.25;  // at most this share of eligible managers get in
var BALLOT_WINDOW    = 10;    // within this many points of the bar = On the Ballot

// ── Manager of the Year ──────────────────────────────────────
// Balanced, with the old single "result" term broken into the three
// things it was blending. Where you finished still leads, but the
// regular season and the schedule-proof all-play record are scored on
// their own, so a manager who was the best team all year and got
// smoked by one bad bracket week keeps most of the credit.
//
// Anything listed here must be computable for EVERY season the league
// has on file. A component that only exists for the most recent year
// would quietly re-weight the older ballots against each other.
var MOTY_W = {
    result:  0.35,   // final standing
    reg:     0.07,   // regular-season finish
    allplay: 0.15,   // all-play record, every manager against the field
    scoring: 0.15,   // points per game inside the season
    draft:   0.20,   // DraftGrade class score
    roster:  0.08,   // what got built after the draft, net of what it cost
};

// ============================================================
// helpers
// ============================================================
function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; }
function sd(a) {
    if (a.length < 2) return 0;
    var m = mean(a);
    return Math.sqrt(mean(a.map(function (x) { return (x - m) * (x - m); })));
}
// z-score against a population, clamped so one freak season cannot
// swing a weighted blend by itself.
function zOf(v, pop, clamp) {
    var s = sd(pop);
    if (!s) return 0;
    var z = (v - mean(pop)) / s;
    var c = clamp == null ? 2.5 : clamp;
    return Math.max(-c, Math.min(c, z));
}
// z -> 0..1, with 0 mapping to the middle of the range.
function zTo01(z, clamp) {
    var c = clamp == null ? 2.5 : clamp;
    return Math.max(0, Math.min(1, (z + c) / (2 * c)));
}
function pctOfRank(rank, of) {
    if (!rank || !of || of < 2) return 0.5;
    return 1 - (rank - 1) / (of - 1);
}

// Corrected final standings. Some platforms (NFL.com in particular) only
// rank the playoff field and hand every eliminated team the same filler
// final_rank, so a season can contain four managers all "7th". Keep the
// bracket's own ordering, then order everyone it did not rank by their
// regular-season finish. Returns uid -> rank.
//
// The cutoff is derived rather than hard-coded: it is the deepest point
// the bracket ranked cleanly, so a six-team playoff and an eight-team
// playoff both come out right without knowing which one this is.
function correctedRanks(standings) {
    var seen = {};
    standings.forEach(function (s) {
        var r = s.final_rank;
        if (r != null) seen[r] = (seen[r] || 0) + 1;
    });
    var cutoff = 0;
    for (var r = 1; r <= standings.length; r++) {
        if (seen[r] !== 1) break;
        cutoff = r;
    }
    var out = {};
    var rest = [];
    standings.forEach(function (s) {
        var uid = String(s.owner_user_id);
        if (s.final_rank != null && s.final_rank <= cutoff) out[uid] = s.final_rank;
        else rest.push(s);
    });
    rest.sort(function (a, b) {
        var ar = a.reg_season_rank == null ? 999 : a.reg_season_rank;
        var br = b.reg_season_rank == null ? 999 : b.reg_season_rank;
        if (ar !== br) return ar - br;
        return (b.points_for || 0) - (a.points_for || 0);
    });
    rest.forEach(function (s, i) { out[String(s.owner_user_id)] = cutoff + i + 1; });
    return out;
}
function round(v, p) {
    var m = Math.pow(10, p == null ? 1 : p);
    return Math.round(v * m) / m;
}

function jget(url) {
    return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
}

// ============================================================
// load
// ============================================================
function load(opts) {
    opts = opts || {};
    // A league slug reads that league's real exported feeds (the browser
    // session decides whether it is allowed to); no slug falls back to
    // the demo league, which every prototype can render signed-out.
    var base = opts.base || (opts.league ? '/leagues/' + opts.league + '/data' : '/demo/data');
    var ranksBase = opts.ranksBase || '/data/fantasy_ranks';

    var out = { base: base, league: null, managers: [], seasons: {}, years: [] };

    return jget(base + '/league.json').then(function (league) {
        if (!league) throw new Error('Could not load ' + base + '/league.json');
        out.league = league;
        var years = (league.all_seasons || []).slice().sort(function (a, b) { return a - b; });
        out.years = years;
        return Promise.all([
            jget(base + '/managers_directory.json'),
            Promise.all(years.map(function (y) { return jget(base + '/seasons/' + y + '.json'); })),
            Promise.all(years.map(function (y) { return jget(base + '/drafts/' + y + '.json'); })),
            jget(base + '/roster_building.json'),
        ]);
    }).then(function (res) {
        var dir = res[0], seasonFiles = res[1], draftFiles = res[2];
        if (!dir) throw new Error('Could not load managers_directory.json');
        out.directory = dir.managers || [];
        out.rosterBuilding = res[3];
        out.years.forEach(function (y, i) {
            if (seasonFiles[i]) out.seasons[y] = seasonFiles[i];
            if (draftFiles[i]) out.drafts = out.drafts || {}, out.drafts[y] = draftFiles[i];
        });
        // Per-manager files carry the season ledger, which is the spine of
        // every career number on the page.
        return Promise.all(out.directory.map(function (m) {
            return jget(base + '/managers/' + m.user_id + '.json');
        }));
    }).then(function (details) {
        out.details = {};
        out.directory.forEach(function (m, i) { out.details[String(m.user_id)] = details[i] || null; });
        // Draft grades are the one MOTY input the site computes in the
        // browser. Pull the rank files for the league's scoring profile
        // and run the shared engine.
        return loadDraftGrades(out, ranksBase).catch(function () { return null; });
    }).then(function (grades) {
        out.grades = grades;
        return build(out);
    });
}

function loadDraftGrades(ctx, ranksBase) {
    if (!root.DraftGrade || !ctx.drafts) return Promise.resolve(null);
    var DG = root.DraftGrade;
    var profile = ctx.league.draft_scoring_profile || 'ppr_6pt';
    var years = ctx.years.filter(function (y) { return ctx.drafts[y] && ctx.drafts[y].picks; });
    if (!years.length) return Promise.resolve(null);
    return Promise.all(years.map(function (y) {
        return jget(ranksBase + '/' + profile + '/' + y + '.json');
    })).then(function (files) {
        var rankData = {}, draftPosRanks = {}, yearTeamCount = {}, yearData = {}, yearFinishes = {};
        var usable = [];
        years.forEach(function (y, i) {
            if (!files[i] || !files[i].players) return;
            usable.push(y);
            rankData[y] = DG.buildRankLookup(files[i].players);
            yearData[y] = ctx.drafts[y].picks;
            draftPosRanks[y] = DG.buildDraftPosRanks(ctx.drafts[y].picks, y);
            var sf = ctx.seasons[y];
            yearTeamCount[y] = sf ? sf.total_teams : 12;
            yearFinishes[y] = {};
            if (sf) (sf.standings || []).forEach(function (s) { yearFinishes[y][s.owner_name] = s.final_rank; });
        });
        if (!usable.length) return null;
        return DG.compute({
            years: usable, rankData: rankData, draftPosRanks: draftPosRanks,
            yearTeamCount: yearTeamCount, yearData: yearData, yearFinishes: yearFinishes,
        });
    });
}

// ============================================================
// build - the model every prototype renders
// ============================================================
function build(ctx) {
    var seasonCtx = {};   // year -> derived league context

    // ── Per-season league context ────────────────────────────
    // A season counts as history once it has a champion — the same test
    // the archive, the record book and career totals use, so the Hall can
    // never disagree with the season pages about who won what. It also
    // keeps an unplayed year out: leagues sync the upcoming season the
    // moment rosters exist, and that would otherwise hand every manager a
    // neutral 0.5 quality score and print a ballot for games nobody played.
    var years = ctx.years.filter(function (y) {
        var sf = ctx.seasons[y];
        if (!sf || !sf.standings || !sf.standings.length) return false;
        if (!sf.champion) return false;
        return sf.standings.some(function (s) {
            return (s.wins || 0) + (s.losses || 0) + (s.ties || 0) > 0;
        });
    });
    var onRecord = {};
    years.forEach(function (y) { onRecord[y] = true; });
    // The eligibility bar, scaled to league age. Doubles as the credibility
    // denominator, which means every ELIGIBLE manager sits at full credit —
    // the ramp below only shapes how the not-yet-eligible are ranked on the
    // wall, so a one-season wonder can't sit above a decade-long career.
    var minSeasons = Math.min(
        years.length,
        Math.max(MIN_SEASONS, Math.ceil(years.length * ELIGIBLE_SHARE)),
    );

    years.forEach(function (y) {
        var sf = ctx.seasons[y];
        var teams = sf.total_teams || sf.standings.length;
        var ppgs = [], pfs = [];
        var games = {};
        sf.standings.forEach(function (s) {
            var g = (s.wins || 0) + (s.losses || 0) + (s.ties || 0);
            games[String(s.owner_user_id)] = g;
            if (g > 0) ppgs.push((s.points_for || 0) / g);
            pfs.push(s.points_for || 0);
        });
        // All-play: score every manager against the whole field every
        // week. This is the schedule-proof read of a season and it is
        // what keeps a manager who led the league in points and drew the
        // hot team six times from reading as a bad year.
        var allPlay = allPlayRecords(sf, teams);
        // The scoring title is a regular-season award: standings points_for
        // is the regular-season total, so a deep playoff run cannot buy it.
        var pointsLeader = null, bestPf = -Infinity;
        sf.standings.forEach(function (s) {
            if ((s.points_for || 0) > bestPf) { bestPf = s.points_for || 0; pointsLeader = String(s.owner_user_id); }
        });
        seasonCtx[y] = {
            year: y, teams: teams, file: sf, ppgs: ppgs, games: games,
            allPlay: allPlay, pointsLeader: pointsLeader,
            ranks: correctedRanks(sf.standings),
            byUid: sf.standings.reduce(function (acc, s) { acc[String(s.owner_user_id)] = s; return acc; }, {}),
        };
    });

    // Manager of the Year runs BEFORE the careers, because a MOTY win is
    // now an item in the trophy case and the Index has to be able to count
    // it. Nothing in the ballot depends on career numbers, so the order is
    // free to flip.
    var moty = buildMoty(ctx, seasonCtx, years);
    var motyByUid = {};
    moty.forEach(function (s) {
        var uid = s.winner.uid;
        (motyByUid[uid] = motyByUid[uid] || []).push(s.year);
    });

    // ── Career: one record per manager ───────────────────────
    var managers = ctx.directory.map(function (m) {
        var uid = String(m.user_id);
        var detail = ctx.details[uid] || {};
        var ledger = (detail.season_ledger || [])
            .filter(function (r) { return onRecord[r.year]; })
            .sort(function (a, b) { return a.year - b.year; });

        var seasons = ledger.map(function (r) {
            var sc = seasonCtx[r.year];
            var teams = sc ? sc.teams : null;
            var row = sc ? sc.byUid[uid] : null;
            var g = row ? (row.wins || 0) + (row.losses || 0) + (row.ties || 0) : null;
            // Regular season only, both here and in the population it is
            // z-scored against. The ledger's avg_ppg folds championship-
            // bracket games into the average, so a manager who played three
            // extra weeks was being compared against a field measured over
            // the regular season alone — and against his own 13-game 2019.
            // Everything else on this row (record, all-play, crown, scoring
            // title) is regular season, so the PPG column matches it.
            var ppg = row && g ? row.points_for / g : (num(r.avg_ppg) != null ? r.avg_ppg : null);
            var ppgZ = sc && ppg != null ? zOf(ppg, sc.ppgs) : 0;
            var winPct = row && g ? ((row.wins || 0) + 0.5 * (row.ties || 0)) / g : null;
            // Ledger rows carry the platform's raw final_rank, which can be
            // filler for eliminated teams. Prefer the season's corrected one.
            var finalRank = (sc && sc.ranks[uid] != null) ? sc.ranks[uid] : r.final_rank;
            var finishPct = teams ? pctOfRank(finalRank, teams) : 0.5;
            // Season quality, 0..1. Finish leads, record and scoring
            // fill in behind it. Every term is normalised inside its own
            // season, so 2019's scoring era never competes with 2025's.
            var q = Q_FINISH * finishPct
                  + Q_WINPCT * (winPct == null ? 0.5 : winPct)
                  + Q_POINTS * zTo01(ppgZ);
            return {
                year: r.year, teams: teams,
                final_rank: finalRank, reg_rank: r.reg_season_rank,
                record: r.reg_record, ppg: ppg, ppg_z: ppgZ,
                win_pct: winPct, finish_pct: finishPct,
                points_title: sc ? sc.pointsLeader === uid : false,
                reg_crown: r.reg_season_rank === 1,
                all_play: sc && sc.allPlay ? sc.allPlay[uid] || null : null,
                q: q,
            };
        });

        // Trophy case, counted off the ledger so it never disagrees with
        // the season pages.
        var motyYears = (motyByUid[uid] || []).slice().sort();
        var tc = { title: 0, moty: motyYears.length, runner_up: 0, third: 0,
                   reg_crown: 0, points_title: 0, berth: 0, last: 0 };
        var titleYears = [], runnerYears = [], thirdYears = [];
        seasons.forEach(function (s) {
            if (s.final_rank === 1) { tc.title++; titleYears.push(s.year); }
            else if (s.final_rank === 2) { tc.runner_up++; runnerYears.push(s.year); }
            else if (s.final_rank === 3) { tc.third++; thirdYears.push(s.year); }
            if (s.reg_crown) tc.reg_crown++;
            if (s.points_title) tc.points_title++;
            if (s.teams && s.final_rank === s.teams) tc.last++;
        });
        tc.berth = m.playoff_appearances || 0;

        var trophyPts = tc.title * TROPHY_PTS.title
                      + tc.moty * TROPHY_PTS.moty
                      + tc.runner_up * TROPHY_PTS.runner_up
                      + tc.third * TROPHY_PTS.third
                      + tc.reg_crown * TROPHY_PTS.reg_crown
                      + tc.points_title * TROPHY_PTS.points_title
                      + tc.berth * TROPHY_PTS.berth;

        var qs = seasons.map(function (s) { return s.q; });
        var T = 100 * trophyPts / (trophyPts + TROPHY_K);
        var R = 100 * mean(qs);
        var P = 100 * bestRun(qs, peakWindow(qs.length));
        // Short careers ramp in rather than scoring off one hot year.
        //
        // The ramp is a SQUARE ROOT, not linear, and that shape is the whole
        // point. 60% of the Index (rate + peak) does not accumulate with
        // time — they are per-season averages, and a three-year star's can
        // beat a fifteen-year veteran's precisely because he has no bad
        // seasons dragging them down. Only the trophy term rewards
        // longevity, and it saturates. So a short career needs discounting
        // or it walks into an old league's hall off one good run.
        //
        // Linear discounting overdid it: in a 15-season league it locked out
        // a manager who won the title in ALL THREE of his seasons. The sqrt
        // is gentle enough that a genuinely all-time short career still
        // clears the bar, while a merely very good one (one title in three
        // years) does not.
        var cred = Math.min(1, Math.sqrt(seasons.length / minSeasons));
        var index = cred * (W_TROPHY * T + W_RATE * R + W_PEAK * P);

        return {
            uid: uid, name: m.name, team: m.team_latest,
            avatar: m.avatar_url || m.avatar || m.logo || null,
            is_current: m.is_current !== false,
            seasons_played: seasons.length,
            record: m.total_record, win_pct: m.win_pct, ppg: m.ppg,
            avg_finish: m.avg_finish,
            playoff_record: m.playoff_record,
            trophies: tc, trophy_pts: trophyPts,
            title_years: titleYears, runner_years: runnerYears, third_years: thirdYears,
            moty_years: motyYears,
            parts: { trophy: T, rate: R, peak: P, credibility: cred },
            index: index,
            ledger: seasons,
            best_season: seasons.slice().sort(function (a, b) { return b.q - a.q; })[0] || null,
        };
    });

    managers.sort(function (a, b) { return b.index - a.index; });

    // ── Enshrinement ─────────────────────────────────────────
    // The bar floats against the field the manager actually played in,
    // sits above an absolute floor, and the hall itself is capped so it
    // stays scarce whether the league is three years old or twenty.
    var eligible = managers.filter(function (m) { return m.seasons_played >= minSeasons; });
    var idx = eligible.map(function (m) { return m.index; });
    var fieldBar = idx.length ? mean(idx) + FIELD_SD_ABOVE * sd(idx) : Infinity;
    var bar = Math.max(ABSOLUTE_FLOOR, fieldBar);
    var cap = Math.max(1, Math.ceil(eligible.length * HALL_SHARE));

    var inducted = eligible.filter(function (m) { return m.index >= bar; }).slice(0, cap);
    var inductedSet = {};
    inducted.forEach(function (m) { inductedSet[m.uid] = true; });

    managers.forEach(function (m) {
        if (inductedSet[m.uid]) { m.status = 'enshrined'; m.status_label = 'Enshrined'; return; }
        if (m.seasons_played < minSeasons) {
            m.status = 'ineligible';
            m.status_label = 'Not Yet Eligible';
            m.status_note = m.seasons_played + ' of ' + minSeasons + ' seasons';
            return;
        }
        if (m.index >= bar - BALLOT_WINDOW) {
            m.status = 'ballot';
            m.status_label = 'On the Ballot';
            m.status_note = round(bar - m.index, 1) + ' short of the bar';
            return;
        }
        m.status = 'building';
        m.status_label = 'Building a Case';
        m.status_note = round(bar - m.index, 1) + ' short of the bar';
    });

    // Induction year: the first season by which the manager's case
    // cleared the bar, so the wall can read as classes rather than a
    // flat list. Recomputed on the ledger prefix, which is why a late
    // bloomer gets a recent class and a founder gets an early one.
    inducted.forEach(function (m) { m.class_year = inductionYear(m, bar, motyByUid[m.uid] || [], minSeasons); });

    return {
        league: ctx.league,
        years: years,
        managers: managers,
        inducted: inducted,
        bar: bar,
        field_bar: fieldBar,
        cap: cap,
        eligible_count: eligible.length,
        moty: moty,
        weights: { trophy: TROPHY_PTS, mix: { T: W_TROPHY, R: W_RATE, P: W_PEAK }, moty: MOTY_W },
        constants: { MIN_SEASONS: minSeasons, ABSOLUTE_FLOOR: ABSOLUTE_FLOOR, HALL_SHARE: HALL_SHARE },
    };
}

// How many consecutive seasons a "peak" covers. Three, except when the
// career is too short to have three to choose from.
//
// The window has to be strictly shorter than the career or peak stops
// being a peak: with a flat 3, anyone with 3 seasons or fewer had their
// whole ledger as the window, so peak came out EXACTLY equal to rate and a
// quarter of the Index silently collapsed into another quarter.
//
// Scaling the window UP for long careers — the obvious "make it a
// percentage" move — is worse than useless. A 7-season window averages so
// much that peak regresses to the career mean and stops measuring
// dominance at all (a 20-season career gets +2.1 over rate at window 7,
// versus +12.0 at window 3). Dominance is a three-year idea at any league
// age, so the cap stays put.
function peakWindow(seasons) {
    return Math.min(3, Math.max(1, seasons - 1));
}

// Best mean over any window of `n` consecutive seasons. Shorter careers
// fall back to their whole ledger so nobody is punished for having had
// fewer chances at a peak.
function bestRun(qs, n) {
    if (!qs.length) return 0;
    if (qs.length <= n) return mean(qs);
    var best = 0;
    for (var i = 0; i + n <= qs.length; i++) {
        var m = mean(qs.slice(i, i + n));
        if (m > best) best = m;
    }
    return best;
}

// Replay the career one season at a time and return the first year the
// running index cleared the bar.
function inductionYear(m, bar, motyYears, minSeasons) {
    for (var n = minSeasons; n <= m.ledger.length; n++) {
        var slice = m.ledger.slice(0, n);
        var through = slice[n - 1].year;
        var motySoFar = (motyYears || []).filter(function (y) { return y <= through; }).length;
        var tc = { title: 0, runner_up: 0, third: 0, reg_crown: 0, points_title: 0, berth: 0 };
        slice.forEach(function (s) {
            if (s.final_rank === 1) tc.title++;
            else if (s.final_rank === 2) tc.runner_up++;
            else if (s.final_rank === 3) tc.third++;
            if (s.reg_crown) tc.reg_crown++;
            if (s.points_title) tc.points_title++;
            // Berths are not on the ledger row, so approximate with a
            // top-half finish. Only used to date the plaque.
            if (s.teams && s.final_rank <= Math.ceil(s.teams / 2)) tc.berth++;
        });
        var pts = tc.title * TROPHY_PTS.title + motySoFar * TROPHY_PTS.moty
                + tc.runner_up * TROPHY_PTS.runner_up
                + tc.third * TROPHY_PTS.third + tc.reg_crown * TROPHY_PTS.reg_crown
                + tc.points_title * TROPHY_PTS.points_title + tc.berth * TROPHY_PTS.berth;
        var qs = slice.map(function (s) { return s.q; });
        var v = Math.min(1, Math.sqrt(n / minSeasons)) * (
            W_TROPHY * (100 * pts / (pts + TROPHY_K)) +
            W_RATE * (100 * mean(qs)) +
            W_PEAK * (100 * bestRun(qs, peakWindow(qs.length))));
        if (v >= bar) return slice[n - 1].year;
    }
    return m.ledger.length ? m.ledger[m.ledger.length - 1].year : null;
}

// All-play: every manager against every other manager, every week.
// Returns uid -> { w, l, pct }. Null when the season file carries no
// matchups (older exports), in which case MOTY falls back to points.
function allPlayRecords(sf, teams) {
    var ms = sf.matchups;
    if (!Array.isArray(ms) || !ms.length) return null;
    var byWeek = {};
    ms.forEach(function (m) {
        if (m.is_playoff) return;   // the bracket is not a full field
        var w = byWeek[m.week] = byWeek[m.week] || {};
        w[String(m.a_user_id)] = m.a_score;
        w[String(m.b_user_id)] = m.b_score;
    });
    var rec = {};
    Object.keys(byWeek).forEach(function (wk) {
        var scores = byWeek[wk];
        var uids = Object.keys(scores);
        if (uids.length < 3) return;
        uids.forEach(function (u) {
            rec[u] = rec[u] || { w: 0, l: 0 };
            uids.forEach(function (o) {
                if (o === u) return;
                if (scores[u] > scores[o]) rec[u].w++;
                else if (scores[u] < scores[o]) rec[u].l++;
            });
        });
    });
    Object.keys(rec).forEach(function (u) {
        var g = rec[u].w + rec[u].l;
        rec[u].pct = g ? rec[u].w / g : 0.5;
    });
    return Object.keys(rec).length ? rec : null;
}

// ============================================================
// Manager of the Year - one ballot per season
// ============================================================
function buildMoty(ctx, seasonCtx, years) {
    var nameToUid = {};
    ctx.directory.forEach(function (m) { nameToUid[(m.name || '').toLowerCase()] = String(m.user_id); });

    return years.map(function (y) {
        var sc = seasonCtx[y];
        if (!sc) return null;
        var sf = sc.file;
        var teams = sc.teams;

        // Which components exist for this season. Weights renormalise
        // over whatever is available, so a season whose draft never got
        // synced still produces a real ballot instead of a blank one.
        var have = { result: true, reg: true, allplay: !!sc.allPlay, scoring: true, draft: false, roster: false };

        // What each manager built after the draft. net_surplus_pts is the
        // scored figure: pickups measured against what a freely available
        // player at that position was worth that week, netted against what
        // the trades sent out. Share of points is NOT used — it measures
        // how much churn the roster needed, which mostly tracks a failed
        // draft and runs slightly negative against finishing well.
        var rosterByUid = {};
        var rb = ctx.rosterBuilding && ctx.rosterBuilding.seasons && ctx.rosterBuilding.seasons[String(y)];
        if (rb && Array.isArray(rb.managers)) {
            rb.managers.forEach(function (r) {
                var uid = r.uid != null ? String(r.uid) : nameToUid[(r.name || '').toLowerCase()];
                if (uid && r.net_surplus_pts != null) rosterByUid[uid] = r;
            });
            if (Object.keys(rosterByUid).length >= 2) have.roster = true;
        }

        var draftByUid = {};
        if (ctx.grades && ctx.grades.byMgrYear) {
            Object.keys(ctx.grades.byMgrYear).forEach(function (mgrName) {
                var cell = ctx.grades.byMgrYear[mgrName][y];
                if (!cell) return;
                var uid = nameToUid[(mgrName || '').toLowerCase()];
                if (uid) draftByUid[uid] = cell;
            });
            if (Object.keys(draftByUid).length >= 2) have.draft = true;
        }

        // Raw per-manager inputs, then z-scored inside the season.
        var rows = (sf.standings || []).map(function (s) {
            var uid = String(s.owner_user_id);
            var g = (s.wins || 0) + (s.losses || 0) + (s.ties || 0);
            var ppg = g ? (s.points_for || 0) / g : 0;
            var ap = sc.allPlay ? sc.allPlay[uid] : null;
            var finalRank = sc.ranks[uid] != null ? sc.ranks[uid] : s.final_rank;
            return {
                uid: uid,
                name: s.owner_name,
                team: s.team_name,
                avatar: s.avatar_url || s.avatar || s.logo || null,
                final_rank: finalRank,
                reg_rank: s.reg_season_rank,
                record: (s.wins || 0) + '-' + (s.losses || 0) + (s.ties ? '-' + s.ties : ''),
                ppg: ppg,
                points_for: s.points_for || 0,
                all_play: ap,
                finish_pct: pctOfRank(finalRank, teams),
                reg_pct: pctOfRank(s.reg_season_rank, teams),
                // No all-play (an export from before season files carried
                // matchups) falls back to the points percentile: the same
                // idea, read at lower resolution.
                all_play_pct: ap ? ap.pct : null,
                draft: draftByUid[uid] || null,
                roster: rosterByUid[uid] || null,
            };
        });
        if (!rows.length) return null;

        var ppgPop = rows.map(function (r) { return r.ppg; });
        var ppgPctByUid = {};
        rows.slice().sort(function (a, b) { return b.ppg - a.ppg; })
            .forEach(function (r, i) { ppgPctByUid[r.uid] = pctOfRank(i + 1, rows.length); });

        var draftPop = rows.filter(function (r) { return r.draft; }).map(function (r) { return r.draft.score; });
        var rosterPop = rows.filter(function (r) { return r.roster; }).map(function (r) { return r.roster.net_surplus_pts; });

        rows.forEach(function (r) {
            r.result_score  = r.finish_pct;
            r.reg_score     = r.reg_pct;
            r.allplay_score = r.all_play_pct != null ? r.all_play_pct : ppgPctByUid[r.uid];
            r.scoring_score = zTo01(zOf(r.ppg, ppgPop));
            r.draft_score   = r.draft ? zTo01(zOf(r.draft.score, draftPop)) : null;
            r.roster_score  = r.roster ? zTo01(zOf(r.roster.net_surplus_pts, rosterPop)) : null;

            var parts = [], wsum = 0;
            function add(key, val) {
                if (val == null) return;
                parts.push({ key: key, w: MOTY_W[key], val: val });
                wsum += MOTY_W[key];
            }
            add('result', r.result_score);
            add('reg', r.reg_score);
            add('allplay', r.allplay_score);
            add('scoring', r.scoring_score);
            add('draft', r.draft_score);
            add('roster', r.roster_score);
            r.parts = parts;
            r.score = wsum ? 100 * parts.reduce(function (a, p) { return a + p.w * p.val; }, 0) / wsum : 0;
        });

        rows.sort(function (a, b) { return b.score - a.score; });
        rows.forEach(function (r, i) { r.rank = i + 1; });

        return {
            year: y,
            teams: teams,
            have: have,
            components: Object.keys(have).filter(function (k) { return have[k]; }),
            champion: sf.champion ? String(sf.champion.owner_user_id) : null,
            winner: rows[0],
            ballot: rows,
        };
    }).filter(Boolean).sort(function (a, b) { return b.year - a.year; });
}

root.HOF = { load: load, constants: {
    TROPHY_PTS: TROPHY_PTS, MOTY_W: MOTY_W, MIN_SEASONS: MIN_SEASONS,
    ABSOLUTE_FLOOR: ABSOLUTE_FLOOR, HALL_SHARE: HALL_SHARE,
} };

})(typeof window !== 'undefined' ? window : this);
