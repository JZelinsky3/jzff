(function () {
'use strict';

var app = document.getElementById('mock-app');

/* ── Helpers ──────────────────────────────────────────────── */
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}
function jget(url) {
    return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
}
function headThumb(pid) { return 'https://sleepercdn.com/content/nfl/players/thumb/' + pid + '.jpg'; }
function normName(name) {
    return String(name || '').toLowerCase()
        .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
        .replace(/[^a-z0-9]/g, '');
}
function pct(n) { return Math.round(n * 100) + '%'; }
function ordinal(n) {
    var v = n % 100;
    if (v >= 11 && v <= 13) return n + 'th';
    return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
}

/* Position palette. `text` tints type on the dark cloth; `cell` fills the
   board stickers and printed chips. WR runs terracotta in the Mock Room —
   the site's WR gold reads as UI accent on a board full of gold trim.
   Cell dyes are deliberately muted and warm-shifted (a drop of the cloth
   brown in every one) so the stickers sit in the room's palette instead
   of glowing like a modern draft app. */
var POS_COLORS = {
    QB:  { text: '#8fb3d6', cell: '#3c4f63' },
    RB:  { text: '#7ac795', cell: '#3a5b46' },
    WR:  { text: '#e29278', cell: '#8a4a33' },
    TE:  { text: '#c9a9ea', cell: '#5a4a6e' },
    K:   { text: '#d9b184', cell: '#6b5232' },
    DEF: { text: '#9aab9e', cell: '#4a5347' },
};
var POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
function posChip(pos) {
    var c = POS_COLORS[pos] || { text: '#8a7a60' };
    return '<span class="pos-chip" style="background:rgba(0,0,0,.25);color:' + c.text + '">' + esc(pos) + '</span>';
}

/* ── State ────────────────────────────────────────────────── */
var MOCK = null;       // data/mock_draft.json
var LEAGUE = null;     // data/league.json
var AVATARS = {};      // uid -> url
var BOARD = null;      // /api/mock-board payload
var GHOSTS = {};       // uid -> manager tendency object
var BASELINE = null;

var FEEDS = [
    { id: 'espn-draft', label: 'ESPN' },
    { id: 'nfl-draft', label: 'NFL.com' },
    { id: 'sleeper-adp', label: 'Sleeper ADP' },
    { id: 'fantasypros-draft', label: 'FantasyPros' },
];
var CFG = {
    order: [],         // uids, seat 1 first
    seats: [],         // uids the user controls; empty = watch, all = full control
    rounds: 15,
    srcs: FEEDS.map(function (f) { return f.id; }),   // outlets to blend; 1 = verbatim, 2+ = consensus
    chaos: 'human',    // faithful | human | chaos — the table's default mood
    pace: 'quick',     // instant | quick | broadcast
    strats: {},        // uid -> STRATS id, assigned in setup
    moods: {},         // uid -> chaos override for one seat; absent = table mood
};
function isUser(uid) { return CFG.seats.indexOf(uid) >= 0; }
var LS_KEY = 'tsc-mock:' + ((window.__DC && (window.__DC.id || window.__DC.slug)) || 'league');

var SIM = null;        // live draft state, built by openRoom()

// Mood scales how far past best-available a ghost will even look.
var CHAOS_WINDOW = { faithful: 0.7, human: 1, chaos: 1.7 };
var CHAOS_TIP = {
    faithful: 'Sticks to the board: picks hug the rankings, tendencies only break near-ties.',
    human: 'Follows the board with a mind of its own. Small reaches happen. The default.',
    chaos: 'The room after midnight: the board is a suggestion and reaches happen.',
};
var PACE_MS = { instant: 0, quick: 140, broadcast: 700 };
var PACE_TIP = {
    instant: 'The whole draft lands at once (pauses at your picks).',
    quick: 'A pick every beat.',
    broadcast: 'Draft-night pacing, whispers and all.',
};

/* Scripts: hand any seat a named draft strategy. It nudges the ghost's
   odds inside its reach window; it never forces a 20-slot jump. */
var STRATS = {
    'hero-rb':   { label: 'Hero RB',   tip: 'One bell-cow back early, then pivot to receivers for rounds.' },
    'zero-rb':   { label: 'Zero RB',   tip: 'No backs early. Hammer WR and TE, then buy RBs in bulk mid-draft.' },
    'robust-rb': { label: 'Robust RB', tip: 'Backs early and often until the stable is full.' },
    'double-rb': { label: 'Double RB', tip: 'Two backs inside the first three rounds, then relax.' },
    'hero-wr':   { label: 'Hero WR',   tip: 'One alpha receiver early, then backs and tight ends.' },
    'zero-wr':   { label: 'Zero WR',   tip: 'No receivers early. Load up RB and TE first.' },
    'triple-wr': { label: 'Triple WR', tip: 'Three straight receivers out of the gate.' },
    'double-wr': { label: 'Double WR', tip: 'Two receivers inside the first three rounds, then relax.' },
    'elite-qb':  { label: 'Elite QB',  tip: 'Grab a top quarterback in rounds 2-4 instead of waiting.' },
    'late-qb':   { label: 'Late QB',   tip: 'Refuse to spend early capital on a quarterback.' },
    'elite-te':  { label: 'Elite TE',  tip: 'Lock in a top tight end early and win the position.' },
};
// Grouped for the picker: backfield, receivers, onesies — each group runs
// in count order (zero, hero one, double two, then the volume script).
var STRAT_GROUPS = [
    ['Backfield', ['zero-rb', 'hero-rb', 'double-rb', 'robust-rb']],
    ['Receivers', ['zero-wr', 'hero-wr', 'double-wr', 'triple-wr']],
    ['Onesies',   ['elite-qb', 'late-qb', 'elite-te']],
];

function stratWeight(id, pos, round, counts) {
    if (!id || !STRATS[id]) return 1;
    var rb = counts.RB || 0, wr = counts.WR || 0, qb = counts.QB || 0, te = counts.TE || 0;
    switch (id) {
        case 'hero-rb':
            if (pos === 'RB') return rb === 0 ? (round <= 2 ? 2.4 : 1.4) : (round <= 6 ? 0.3 : 1);
            if (pos === 'WR' && rb >= 1 && round <= 6) return 1.35;
            return 1;
        case 'zero-rb':
            if (pos === 'RB') return round <= 4 ? 0.12 : round <= 6 ? 0.6 : 1.5;
            if ((pos === 'WR' || pos === 'TE') && round <= 4) return 1.45;
            return 1;
        case 'robust-rb':
            return (pos === 'RB' && rb < 3 && round <= 5) ? 2.1 : 1;
        case 'double-rb':
            return (pos === 'RB' && rb < 2 && round <= 3) ? 1.9 : 1;
        case 'double-wr':
            return (pos === 'WR' && wr < 2 && round <= 3) ? 1.9 : 1;
        case 'hero-wr':
            if (pos === 'WR') return wr === 0 ? (round <= 2 ? 2.4 : 1.4) : (round <= 6 ? 0.3 : 1);
            if (pos === 'RB' && wr >= 1 && round <= 6) return 1.35;
            return 1;
        case 'zero-wr':
            if (pos === 'WR') return round <= 4 ? 0.12 : round <= 6 ? 0.6 : 1.5;
            if ((pos === 'RB' || pos === 'TE') && round <= 4) return 1.45;
            return 1;
        case 'triple-wr':
            if (pos === 'WR' && wr < 3 && round <= 4) return 2.6;
            if (pos !== 'WR' && wr < 3 && round <= 3) return 0.45;
            return 1;
        case 'elite-qb':
            if (pos === 'QB' && qb === 0) return round >= 2 && round <= 4 ? 2.6 : round === 1 ? 1.3 : 1;
            return 1;
        case 'late-qb':
            return (pos === 'QB' && qb === 0 && round <= 6) ? 0.15 : 1;
        case 'elite-te':
            return (pos === 'TE' && te === 0 && round <= 4) ? 2.4 : 1;
    }
    return 1;
}

/* Film study: read each ghost's real opening sequences (rounds 1-8 of
   every synced draft, from mock_draft.json) and spot the named strategy
   they actually run. A script needs to show up in at least two drafts
   and half their filmed seasons to count as their lean. */
// Doubles sit last: they hit often, so a double only becomes the lean
// when it strictly out-hits every sharper script.
var DETECT_PRIORITY = ['triple-wr', 'robust-rb', 'hero-rb', 'zero-rb', 'hero-wr', 'zero-wr', 'elite-te', 'elite-qb', 'late-qb', 'double-rb', 'double-wr'];
function detectScript(m) {
    var seasons = m.openings || [];
    var tallies = {};
    var counted = 0;
    seasons.forEach(function (se) {
        var picks = se.picks || [];   // [[round, pos], ...] in draft order
        if (picks.length < 4) return; // partial seasons don't get a vote
        counted++;
        var firstRound = {};
        picks.forEach(function (pk) { if (firstRound[pk[1]] == null) firstRound[pk[1]] = pk[0]; });
        var cnt = function (pos, maxR) {
            var n = 0;
            picks.forEach(function (pk) { if (pk[1] === pos && pk[0] <= maxR) n++; });
            return n;
        };
        var seq = picks.map(function (pk) { return pk[1]; });
        var hits = {};
        if (seq[0] === 'WR' && seq[1] === 'WR' && seq[2] === 'WR') hits['triple-wr'] = 1;
        if (cnt('RB', 2) >= 2 && cnt('RB', 5) >= 3) hits['robust-rb'] = 1;
        if (firstRound.RB === 1 && cnt('RB', 4) === 1) hits['hero-rb'] = 1;
        if ((firstRound.RB || 99) >= 5) hits['zero-rb'] = 1;
        if (firstRound.WR === 1 && cnt('WR', 4) === 1) hits['hero-wr'] = 1;
        if ((firstRound.WR || 99) >= 5) hits['zero-wr'] = 1;
        if ((firstRound.TE || 99) <= 3) hits['elite-te'] = 1;
        if ((firstRound.QB || 99) <= 3) hits['elite-qb'] = 1;
        if ((firstRound.QB || 99) >= 7) hits['late-qb'] = 1;
        // Doubles read on a 3-round window: two backs (or receivers) inside
        // four rounds is so common it isn't a scheme, it's a Tuesday.
        if (cnt('RB', 3) >= 2) hits['double-rb'] = 1;
        if (cnt('WR', 3) >= 2) hits['double-wr'] = 1;
        // A double is the fallback read: when a sharper script already
        // explains the same behavior this season, the double stays quiet
        // (Zero RB seasons are full of early WR pairs by definition).
        if (hits['zero-rb'] || hits['triple-wr']) delete hits['double-wr'];
        if (hits['zero-wr'] || hits['robust-rb']) delete hits['double-rb'];
        Object.keys(hits).forEach(function (k) { tallies[k] = (tallies[k] || 0) + 1; });
    });
    if (counted < 2) return null;
    var best = null;
    DETECT_PRIORITY.forEach(function (id) {
        var n = tallies[id] || 0;
        if (n >= 2 && n >= Math.ceil(counted / 2) && (!best || n > best.n)) best = { id: id, n: n, of: counted };
    });
    return best;
}
var DETECTED = {};   // uid -> { id, n, of } or null, filled on boot

// The script a seat actually plays: an explicit assignment wins, 'none'
// silences it, and the default ('auto') is whatever the film says.
function scriptFor(uid) {
    var v = CFG.strats[uid];
    if (v == null || v === 'auto') return DETECTED[uid] ? DETECTED[uid].id : null;
    if (v === 'none') return null;
    return STRATS[v] ? v : null;
}
function filmLine(uid) {
    var d = DETECTED[uid];
    if (d) return 'Film study: ' + STRATS[d.id].label + ' in ' + d.n + ' of ' + d.of + ' drafts.';
    var g = GHOSTS[uid];
    if (!g || !(g.openings || []).length) return 'No film on this seat yet. Plays it straight.';
    return 'No strong pattern on film. Plays it straight.';
}

// One line for the projection sheet when a pick is clearly the script
// talking. Null when the script had nothing to do with it.
function stratExplain(id, pos, round, counts) {
    if (!id || !STRATS[id]) return null;
    var rb = counts.RB || 0, wr = counts.WR || 0, qb = counts.QB || 0, te = counts.TE || 0;
    switch (id) {
        case 'hero-rb':
            if (pos === 'RB' && rb === 0 && round <= 2) return 'The Hero RB script: one bell-cow, then pivot.';
            if (pos === 'WR' && rb >= 1 && round <= 5) return 'Hero RB in motion: the back is banked, now receiver volume.';
            return null;
        case 'zero-rb':
            if ((pos === 'WR' || pos === 'TE') && round <= 4) return 'The Zero RB script: pass-catchers first, backs can wait.';
            if (pos === 'RB' && round >= 5) return 'The Zero RB pivot arrives right on schedule.';
            return null;
        case 'robust-rb':
            if (pos === 'RB' && round <= 5) return 'Robust RB doctrine: keep stacking backs.';
            return null;
        case 'double-rb':
            if (pos === 'RB' && rb < 2 && round <= 3) return 'Double RB script: back number ' + (rb + 1) + ' of two, early.';
            return null;
        case 'double-wr':
            if (pos === 'WR' && wr < 2 && round <= 3) return 'Double WR script: receiver number ' + (wr + 1) + ' of two, early.';
            return null;
        case 'hero-wr':
            if (pos === 'WR' && wr === 0 && round <= 2) return 'The Hero WR script: one alpha, then pivot.';
            if (pos === 'RB' && wr >= 1 && round <= 5) return 'Hero WR in motion: the alpha is banked, now backfield volume.';
            return null;
        case 'zero-wr':
            if ((pos === 'RB' || pos === 'TE') && round <= 4) return 'The Zero WR script: backs and tight ends first.';
            if (pos === 'WR' && round >= 5) return 'The Zero WR pivot arrives right on schedule.';
            return null;
        case 'triple-wr':
            if (pos === 'WR' && wr < 3 && round <= 4) return 'Triple WR script: receiver number ' + (wr + 1) + ' of three straight.';
            return null;
        case 'elite-qb':
            if (pos === 'QB' && qb === 0 && round <= 4) return 'The Elite QB script cashes in: no waiting at the position.';
            return null;
        case 'late-qb':
            if (pos === 'QB' && round >= 6) return 'The Late QB script finally blinks.';
            return null;
        case 'elite-te':
            if (pos === 'TE' && te === 0 && round <= 4) return 'The Elite TE script: win the position outright.';
            return null;
    }
    return null;
}

/* ── Boot ─────────────────────────────────────────────────── */
Promise.all([
    jget('data/mock_draft.json'),
    jget('data/league.json'),
    jget('data/managers_directory.json'),
]).then(function (res) {
    MOCK = res[0];
    LEAGUE = res[1];
    var dir = res[2];
    if (!MOCK || !Array.isArray(MOCK.managers) || MOCK.managers.length === 0) {
        app.innerHTML = '<div class="mk-plate">The room is dark.<br>' +
            '<small style="font-size:.85rem">The Mock Room needs at least one synced season to seat the ghosts.</small></div>';
        return;
    }
    if (dir && Array.isArray(dir.managers)) {
        dir.managers.forEach(function (m) { if (m.user_id != null) AVATARS[m.user_id] = m.avatar || ''; });
    }
    MOCK.managers.forEach(function (m) {
        GHOSTS[m.user_id] = m;
        DETECTED[m.user_id] = detectScript(m);
    });
    BASELINE = MOCK.baseline || null;

    CFG.rounds = Math.min(20, Math.max(8, MOCK.meta.rounds || 15));
    CFG.order = MOCK.managers.map(function (m) { return m.user_id; });
    restoreConfig();
    fetchBoard();
    renderSetup();
    loadScoutFilm();
}).catch(function (err) {
    app.innerHTML = '<div class="mk-plate" style="color:#c96a55">The room would not open. ' + esc(err.message) + '</div>';
});

/* The deep film: the last three real drafts, pick by pick, from the
   Draft Annual's own files. Feeds the dossiers what mock_draft.json's
   aggregates can't: who each seat actually called first every year,
   from what slot, and how the season ended. Loads after first paint and
   upgrades the cards in place. */
var SCOUT_YEARS = null;   // [{ y, first: {uid: {name,pos,round,rp,overall}}, finish: {uid: rank} }] newest first
function loadScoutFilm() {
    jget('data/drafts/drafts_directory.json').then(function (dir) {
        var years = ((dir && dir.drafts) || [])
            .map(function (d) { return d.year; })
            .sort(function (a, b) { return b - a; })
            .slice(0, 3);
        if (!years.length) return;
        Promise.all(years.map(function (y) { return jget('data/drafts/' + y + '.json'); })).then(function (files) {
            var out = [];
            files.forEach(function (f, i) {
                if (!f || !Array.isArray(f.picks)) return;
                var entry = { y: years[i], first: {}, finish: {} };
                var nameByUid = {};
                f.picks.forEach(function (p) {
                    if (p.user_id == null) return;
                    nameByUid[p.user_id] = p.manager_name;
                    var cur = entry.first[p.user_id];
                    if (!cur || p.overall_pick < cur.overall) {
                        entry.first[p.user_id] = {
                            name: p.player_name, pos: p.position,
                            round: p.round, rp: p.round_pick, overall: p.overall_pick,
                        };
                    }
                });
                Object.keys(nameByUid).forEach(function (uid) {
                    var fin = (f.finishes || {})[nameByUid[uid]];
                    if (fin != null) entry.finish[uid] = fin;
                });
                out.push(entry);
            });
            if (out.length) {
                SCOUT_YEARS = out;
                renderScoutGrid();
            }
        });
    });
}

function restoreConfig() {
    try {
        var saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
        if (!saved) return;
        if (Array.isArray(saved.order)) {
            var current = {};
            CFG.order.forEach(function (u) { current[u] = true; });
            var kept = saved.order.filter(function (u) { return current[u]; });
            var missing = CFG.order.filter(function (u) { return kept.indexOf(u) < 0; });
            if (kept.length > 0) CFG.order = kept.concat(missing);
        }
        if (Array.isArray(saved.seats)) CFG.seats = saved.seats.filter(function (u) { return GHOSTS[u]; });
        else if (saved.seat && GHOSTS[saved.seat]) CFG.seats = [saved.seat];   // pre-multi-seat config
        if (saved.rounds) CFG.rounds = Math.min(20, Math.max(8, saved.rounds));
        var feedIds = FEEDS.map(function (f) { return f.id; });
        if (Array.isArray(saved.srcs)) {
            var keptSrcs = saved.srcs.filter(function (s) { return feedIds.indexOf(s) >= 0; });
            if (keptSrcs.length) CFG.srcs = keptSrcs;
        } else if (saved.source && feedIds.indexOf(saved.source) >= 0) {
            CFG.srcs = [saved.source];   // pre-multi-source config; 'consensus' = keep all
        }
        if (CHAOS_WINDOW[saved.chaos]) CFG.chaos = saved.chaos;
        if (PACE_MS[saved.pace] != null) CFG.pace = saved.pace;
        if (saved.strats && typeof saved.strats === 'object') {
            Object.keys(saved.strats).forEach(function (u) {
                var v = saved.strats[u];
                if (GHOSTS[u] && (v === 'none' || STRATS[v])) CFG.strats[u] = v;
            });
        }
        if (saved.moods && typeof saved.moods === 'object') {
            Object.keys(saved.moods).forEach(function (u) {
                if (GHOSTS[u] && CHAOS_WINDOW[saved.moods[u]]) CFG.moods[u] = saved.moods[u];
            });
        }
    } catch (e) { /* fresh defaults */ }
}
function saveConfig() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(CFG)); } catch (e) { /* full/blocked */ }
}

function qbStarters() {
    var slots = MOCK.meta.slots || {};
    return (slots.SFLEX >= 1 || (slots.QB || 0) >= 2) ? 2 : 1;
}
function boardScoring() {
    var profile = (LEAGUE && LEAGUE.draft_scoring_profile) || 'ppr_6pt';
    return profile.indexOf('half') === 0 ? 'half' : 'ppr';
}
/* Board tiers, read from the outlets themselves: a tier stays open while
   a player's most bullish book still lands him inside it (one slot of
   grace), and caps out so the deep board doesn't chain into one blob.
   The result is the structure real rooms draft by: a top tier that can
   go in any order, then the next shelf, and so on. */
function computeTiers(players) {
    var tier = 1, hi = -1, size = 0;
    players.forEach(function (p, i) {
        var lo = p.rank, phi = p.rank;
        if (p.rks) Object.keys(p.rks).forEach(function (k) {
            lo = Math.min(lo, p.rks[k]);
            phi = Math.max(phi, p.rks[k]);
        });
        var cap = 4 + tier * 2;   // tiers widen as the board deepens
        if (i > 0 && (lo > hi + 1 || size >= cap)) {
            tier++; size = 0; hi = phi;
        } else {
            hi = Math.max(hi, phi);
        }
        p.tierNo = tier;
        size++;
    });
}

function fetchBoard() {
    BOARD = null;
    var url = '/api/mock-board?scoring=' + boardScoring() + '&qbs=' + qbStarters();
    if (CFG.srcs.length && CFG.srcs.length < FEEDS.length) {
        url += '&srcs=' + encodeURIComponent(CFG.srcs.slice().sort().join(','));
    }
    fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (d && Array.isArray(d.players) && d.players.length > 50) {
            d.players.forEach(function (p, i) { p.rank = i + 1; p.norm = normName(p.name); });
            computeTiers(d.players);
            BOARD = d;
        }
        var el = document.getElementById('board-status');
        if (el) updateBoardStatus(el);
    }).catch(function () {
        var el = document.getElementById('board-status');
        if (el) updateBoardStatus(el);
    });
}
function updateBoardStatus(el) {
    if (BOARD) {
        el.className = 'board-status ok';
        el.textContent = 'Board ready · ' + BOARD.players.length + ' players · ' + BOARD.label;
    } else {
        el.className = 'board-status bad';
        el.textContent = 'Board unavailable · try another source';
    }
    var start = document.getElementById('mk-open');
    if (start) start.disabled = !BOARD;
    var proj = document.getElementById('mk-proj');
    if (proj) proj.disabled = !BOARD;
}

/* ── Scene I: setup ───────────────────────────────────────── */
function ghostLine(g) {
    var bits = [];
    var r1 = g.r1 || {};
    var top = null;
    Object.keys(r1).forEach(function (p) { if (!top || r1[p] > r1[top]) top = p; });
    if (top && r1[top] >= 0.5) bits.push('Opens <b>' + top + '</b> ' + pct(r1[top]) + ' of the time');
    else if (top) bits.push('Leans <b>' + top + '</b> early');
    var fq = (g.first_round_by_pos || {}).QB;
    if (fq != null && fq <= 3) bits.push('QB by <b>RD' + fq + '</b>');
    else if (fq != null && fq >= 8) bits.push('waits on QB');
    if (g.favorites && g.favorites.length) {
        bits.push('has drafted <b>' + esc(g.favorites[0].name) + '</b> ' + g.favorites[0].count + ' times');
    }
    if (!bits.length) {
        return g.total_picks > 0 ? 'Keeps the book close. No loud habits.' : 'No draft history. Pure instinct.';
    }
    return bits.join(' · ') + '.';
}

/* ── The scouting file: one paper dossier per seat ────────── */
// Draft form, like a form line but for drafts: the first five calls of
// each of the last three filmed drafts, the newest year on top. Once the
// deep film loads, each year gains the receipt: the actual first call
// by name and slot, and where the season finished.
function scoutOpens(m) {
    var uid = m.user_id;
    var seasons = (m.openings || []).slice().sort(function (a, b) { return b.y - a.y; }).slice(0, 3);
    if (!seasons.length) return '<div class="scout-none">No film on this seat yet. Pure instinct.</div>';
    return seasons.map(function (se) {
        var chips = (se.picks || []).slice(0, 5).map(function (pk) {
            var c = POS_COLORS[pk[1]] || { cell: '#57503f' };
            return '<span class="scout-pick" style="background:' + c.cell + '" title="Round ' + pk[0] + '">' + esc(pk[1]) + '</span>';
        }).join('');
        var sub = '';
        if (SCOUT_YEARS) {
            var yr = null;
            for (var i = 0; i < SCOUT_YEARS.length; i++) { if (SCOUT_YEARS[i].y === se.y) { yr = SCOUT_YEARS[i]; break; } }
            var first = yr && yr.first[uid];
            var fin = yr ? yr.finish[uid] : null;
            if (first) {
                sub = '<div class="scout-open-sub">' +
                    first.round + '.' + (first.rp < 10 ? '0' : '') + first.rp +
                    ' <b>' + esc(first.name) + '</b>' +
                    (fin != null ? (fin === 1 ? ' · won it all ★' : ' · finished ' + ordinal(fin)) : '') +
                    '</div>';
            }
        }
        return '<div class="scout-open-row"><span class="scout-year">’' + esc(String(se.y).slice(-2)) + '</span>' + chips + '</div>' + sub;
    }).join('');
}
// One labeled block of the report body.
function statBlock(label, body) {
    return '<div class="scout-stat"><div class="scout-stat-label">' + label + '</div>' + body + '</div>';
}
function medianNum(a) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}
/* Predictability: how much the film can be trusted. Three signals:
   round-one habit concentration, how often the opening sequence repeats
   year over year, and volume drift in the eight-round diet. The read
   that tells you whether the rest of this file is a map or a mood. */
function scoutPredict(m) {
    var seasons = (m.openings || []).filter(function (se) { return (se.picks || []).length >= 4; });
    if (seasons.length < 3) return '';
    var share = {};
    var seqs = seasons.map(function (se) { return se.picks.map(function (pk) { return pk[1]; }); });
    seasons.forEach(function (se) {
        var n = {}, len = se.picks.length;
        se.picks.forEach(function (pk) { n[pk[1]] = (n[pk[1]] || 0) + 1; });
        ['QB', 'RB', 'WR', 'TE'].forEach(function (p) {
            (share[p] = share[p] || []).push((n[p] || 0) / len);
        });
    });
    var drift = 0;
    ['QB', 'RB', 'WR', 'TE'].forEach(function (p) {
        var xs = share[p];
        var mean = xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
        drift += xs.reduce(function (a, b) { return a + Math.abs(b - mean); }, 0) / xs.length;
    });
    // Sequence agreement: of any two filmed years, how much of the first
    // four calls repeats position for position.
    var pairs = 0, agree = 0;
    for (var a = 0; a < seqs.length; a++) {
        for (var b = a + 1; b < seqs.length; b++) {
            var hits = 0;
            for (var i = 0; i < 4; i++) { if (seqs[a][i] && seqs[a][i] === seqs[b][i]) hits++; }
            agree += hits / 4; pairs++;
        }
    }
    agree = pairs ? agree / pairs : 0;
    var conc = 0;
    Object.keys(m.r1 || {}).forEach(function (p) { conc = Math.max(conc, m.r1[p]); });
    var score = conc * 0.35 + agree * 0.4 + Math.max(0, 1 - drift * 3) * 0.25;
    var read = score >= 0.7 ? ['High', 'Runs the same draft every year. Trust the film.']
        : score >= 0.45 ? ['Medium', 'The habits are real, but so are the detours.']
        : ['Low', 'The film is a mood, not a map. Watch the board instead.'];
    return statBlock('Predictability',
        '<div class="scout-bar"><i style="width:' + Math.round(score * 100) + '%;background:var(--gold-print)"></i></div>' +
        '<div class="scout-stat-line">' + read[0] + '</div>' +
        '<div class="scout-flame">' + read[1] + '</div>');
}
/* Versus the room: where this seat buys the onesies relative to the
   league's own baseline. The actionable read: who will snipe your QB,
   and whom you can wait out. */
function scoutVsRoom(m) {
    var base = (BASELINE && BASELINE.first_round_by_pos) || null;
    if (!base) return '';
    var fr = m.first_round_by_pos || {};
    var bits = [];
    ['QB', 'TE'].forEach(function (p) {
        if (fr[p] == null || base[p] == null) return;
        var diff = base[p] - fr[p];   // positive = buys earlier than the room
        var c = POS_COLORS[p] || { cell: '#57503f' };
        var tag = diff >= 1 ? Math.round(diff) + ' RD earlier'
            : diff <= -1 ? Math.abs(Math.round(diff)) + ' RD later'
            : 'on schedule';
        bits.push('<span style="color:' + c.cell + '">' + p + '</span> ' + tag);
    });
    if (!bits.length) return '';
    return statBlock('Versus the room · first call', '<div class="scout-stat-line">' + bits.join(' · ') + '</div>');
}
// Positional volume through eight rounds, averaged over every filmed
// draft: the number that separates a Robust RB room from a receiver room
// better than any single year can.
function scoutVolume(m) {
    var seasons = (m.openings || []).filter(function (se) { return (se.picks || []).length >= 4; });
    if (seasons.length < 2) return '';
    var tot = {};
    seasons.forEach(function (se) {
        se.picks.forEach(function (pk) { tot[pk[1]] = (tot[pk[1]] || 0) + 1; });
    });
    var bits = ['RB', 'WR', 'QB', 'TE'].filter(function (p) { return tot[p]; }).map(function (p) {
        var c = POS_COLORS[p] || { cell: '#57503f' };
        return '<span style="color:' + c.cell + '">' + (tot[p] / seasons.length).toFixed(1) + ' ' + p + '</span>';
    });
    return bits.length
        ? statBlock('Eight-round diet · avg picks', '<div class="scout-stat-line">' + bits.join(' · ') + '</div>')
        : '';
}
// Round-one split: how their first pick has actually broken, as a bar.
// The cell dyes double as ink on the paper; the dark-cloth text tints
// would wash out here.
function scoutR1(g) {
    var r1 = g.r1 || {};
    var order = POS_ORDER.filter(function (p) { return (r1[p] || 0) > 0; })
        .sort(function (a, b) { return r1[b] - r1[a]; });
    if (!order.length) return '';
    var bar = order.map(function (p) {
        var c = POS_COLORS[p] || { cell: '#57503f' };
        return '<i style="width:' + (r1[p] * 100) + '%;background:' + c.cell + '"></i>';
    }).join('');
    var legend = order.map(function (p) {
        var c = POS_COLORS[p] || { cell: '#57503f' };
        return '<span style="color:' + c.cell + '">' + p + ' ' + pct(r1[p]) + '</span>';
    }).join(' · ');
    return statBlock('Round one split',
        '<div class="scout-bar">' + bar + '</div><div class="scout-stat-line">' + legend + '</div>');
}
// When the onesies come off the board for this seat, typically — and
// when the second back and second receiver land, because that second
// call is what starts a position run.
function scoutTiming(m) {
    var fr = m.first_round_by_pos || {};
    var bits = ['QB', 'TE'].filter(function (p) { return fr[p] != null; })
        .map(function (p) {
            var c = POS_COLORS[p] || { cell: '#57503f' };
            return '<span style="color:' + c.cell + '">' + p + '</span> RD' + fr[p];
        });
    var secs = ['RB', 'WR'].map(function (p) {
        var rounds = [];
        (m.openings || []).forEach(function (se) {
            var n = 0;
            for (var i = 0; i < (se.picks || []).length; i++) {
                if (se.picks[i][1] !== p) continue;
                n++;
                if (n === 2) { rounds.push(se.picks[i][0]); break; }
            }
        });
        if (rounds.length < 2) return null;
        var c = POS_COLORS[p] || { cell: '#57503f' };
        return '2nd <span style="color:' + c.cell + '">' + p + '</span> RD' + medianNum(rounds);
    }).filter(function (b) { return b; });
    var lines = '';
    if (bits.length) lines += '<div class="scout-stat-line">' + bits.join(' · ') + '</div>';
    if (secs.length) lines += '<div class="scout-stat-line">' + secs.join(' · ') + '</div>';
    return lines ? statBlock('Position timing · first call', lines) : '';
}
function scoutFlames(m) {
    var favs = (m.favorites || []).slice(0, 2);
    if (!favs.length) return '';
    return statBlock('Old flames', '<div class="scout-flame">' + favs.map(function (f) {
        return esc(f.name) + ' ×' + f.count;
    }).join(', ') + '.</div>');
}
function scoutPhoto(uid) {
    var url = AVATARS[uid];
    return url
        ? '<img class="scout-photo" src="' + esc(url) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">'
        : '<span class="scout-photo"></span>';
}
function scoutCard(m, i) {
    var uid = m.user_id;
    var cur = CFG.strats[uid] || 'auto';
    var mood = CFG.moods[uid] || 'table';
    var tells = scoutR1(m) + scoutVolume(m) + scoutTiming(m) + scoutVsRoom(m) + scoutFlames(m);
    var filmed = m.seasons_drafted || 0;
    var meta = filmed
        ? filmed + (filmed === 1 ? ' draft' : ' drafts') + ' on film · ' + (m.total_picks || 0) + ' picks logged'
        : 'no film on record';
    // The identity stamp reads the seat's ACTIVE script: the film's read
    // by default, or whatever the dial below hands them.
    var sc = scriptFor(uid);
    var fromFilm = CFG.strats[uid] == null || CFG.strats[uid] === 'auto';
    var stamp = sc
        ? '<div class="scout-stamp">' + esc(STRATS[sc].label) + '<small>' + (fromFilm ? 'on film' : 'assigned') + '</small></div>'
        : '';
    return '<div class="scout-file">' +
        '<div class="scout-tab">File No. ' + (i + 1 < 10 ? '0' : '') + (i + 1) + '</div>' +
        '<div class="scout-paper">' + stamp +
        '<div class="scout-head' + (stamp ? ' stamped' : '') + '">' + scoutPhoto(uid) +
        '<div class="scout-id"><div class="scout-kicker">Scouting file</div>' +
        '<div class="scout-name">' + esc(m.name) + '</div>' +
        '<div class="scout-meta">' + meta + '</div></div>' +
        '</div>' +
        '<div class="scout-line">' + ghostLine(m) + '</div>' +
        '<div class="scout-body">' +
        '<div class="scout-col">' + statBlock('The opens · first five calls, newest first', scoutOpens(m)) + scoutPredict(m) + '</div>' +
        '<div class="scout-col">' + tells + '</div>' +
        '</div>' +
        '</div>' +
        '<div class="scout-knobs">' +
        '<div class="ghost-knob"><span class="mk-label">Script</span>' +
        '<select class="mk-select strat-sel" data-uid="' + esc(uid) + '">' +
        '<option value="auto"' + (cur === 'auto' ? ' selected' : '') + '>Auto, read the film</option>' +
        '<option value="none"' + (cur === 'none' ? ' selected' : '') + '>None, play it straight</option>' +
        STRAT_GROUPS.map(function (grp) {
            return '<optgroup label="' + grp[0] + '">' + grp[1].map(function (id) {
                return '<option value="' + id + '"' + (cur === id ? ' selected' : '') + '>' + STRATS[id].label + '</option>';
            }).join('') + '</optgroup>';
        }).join('') + '</select></div>' +
        '<div class="ghost-knob"><span class="mk-label">Mood</span>' +
        '<select class="mk-select mood-sel" data-uid="' + esc(uid) + '" ' +
        'title="How far off the board this one seat will wander. Overrides the table’s ghost mood.">' +
        '<option value="table"' + (mood === 'table' ? ' selected' : '') + '>Table mood</option>' +
        [['faithful', 'Faithful'], ['human', 'Human'], ['chaos', 'Chaos']].map(function (c) {
            return '<option value="' + c[0] + '"' + (mood === c[0] ? ' selected' : '') + '>' + c[1] + '</option>';
        }).join('') + '</select></div>' +
        '<div class="ghost-strat-tip">' + stratTip(uid, cur) + '</div>' +
        '</div></div>';
}

function renderSetup() {
    stopTimer();
    closeProj();
    SIM = null;
    renderWarRoom();   // the overlay lives on <body>; drop it on scene change
    var html = '<div class="setup-grid">';

    html += '<div class="mk-card setup-panel"><div class="setup-panel-head">' +
        '<div class="setup-panel-title">The <em>Table.</em></div>' +
        '<div class="order-presets">' +
        '<button class="mk-btn" data-preset="random">Randomize</button>' +
        (MOCK.meta.last_draft_order && MOCK.meta.last_draft_order.some(function (u) { return u && GHOSTS[u]; })
            ? '<button class="mk-btn" data-preset="last">' + esc(String(MOCK.meta.last_draft_year || 'Last')) + ' order</button>' : '') +
        (Object.keys(MOCK.meta.last_final_ranks || {}).length
            ? '<button class="mk-btn" data-preset="reverse">Reverse standings</button>' : '') +
        '</div></div>' +
        '<p class="setup-hint">Drag a name to its slot, or nudge with the arrows. Tap the seat pill to take a team (take as many as you want).</p>' +
        '<div id="seat-list"></div></div>';

    html += '<div class="mk-card setup-panel"><div class="setup-panel-head">' +
        '<div class="setup-panel-title">House <em>Rules.</em></div></div>';

    html += rulesRow('Your seats', '<div class="ba-pos" id="rule-seats">' +
        '<button data-seats="none" title="Every seat plays itself; you watch.">Watch only</button>' +
        '<button data-seats="all" title="You make every pick for every team.">Play all</button>' +
        '<span class="seats-count" id="seats-count"></span></div>');
    html += rulesRow('Rounds', '<select class="mk-select" id="rule-rounds">' +
        Array.from({ length: 13 }, function (_, i) { return i + 8; }).map(function (r) {
            return '<option value="' + r + '"' + (CFG.rounds === r ? ' selected' : '') + '>' + r + '</option>';
        }).join('') + '</select>');
    html += rulesRow('Rankings', '<div class="ba-pos" id="rule-srcs">' +
        FEEDS.map(function (f) {
            return '<button data-src="' + f.id + '" title="Pick any mix: one outlet reads verbatim, two or more blend into a consensus." class="' +
                (CFG.srcs.indexOf(f.id) >= 0 ? 'active' : '') + '">' + f.label + '</button>';
        }).join('') + '</div>');
    html += '<div class="rules-hint">Toggle any mix of boards. One reads as-is; two or more average into a consensus.</div>';
    html += rulesRow('Ghost mood', '<div class="ba-pos" id="rule-chaos">' +
        [['faithful', 'Faithful'], ['human', 'Human'], ['chaos', 'Chaos']].map(function (c) {
            return '<button data-chaos="' + c[0] + '" title="' + esc(CHAOS_TIP[c[0]]) + '" class="' + (CFG.chaos === c[0] ? 'active' : '') + '">' + c[1] + '</button>';
        }).join('') + '</div>');
    html += rulesRow('Pace', '<div class="ba-pos" id="rule-pace">' +
        [['instant', 'Instant'], ['quick', 'Quick'], ['broadcast', 'Broadcast']].map(function (c) {
            return '<button data-pace="' + c[0] + '" title="' + esc(PACE_TIP[c[0]]) + '" class="' + (CFG.pace === c[0] ? 'active' : '') + '">' + c[1] + '</button>';
        }).join('') + '</div>');
    html += '<div class="rules-hint">Faithful ghosts stick to their history. Chaos ghosts remember it, loosely.</div>';
    html += '<div class="setup-start"><button class="mk-btn primary" id="mk-open" disabled>Open the draft room</button>' +
        '<button class="mk-btn gold" id="mk-proj" disabled title="Run 300 silent drafts, then call one draft night from the odds, pick by pick">Run the projection</button>' +
        '<span class="board-status" id="board-status">Setting the board…</span></div>';
    html += '</div></div>';

    html += vaultStripHtml();
    html += '<div class="ghost-strip"><div class="mk-label">★ The Scouting Files · the opens, the first calls, the finishes on every seat, and the dials to overrule the film</div><div class="ghost-grid" id="ghost-grid"></div></div>';

    app.innerHTML = html;
    renderSeatList();
    renderScoutGrid();
    bindVault();
    updateBoardStatus(document.getElementById('board-status'));

    app.querySelectorAll('[data-preset]').forEach(function (btn) {
        btn.addEventListener('click', function () { applyPreset(btn.getAttribute('data-preset')); });
    });
    document.getElementById('rule-seats').addEventListener('click', function (e) {
        var v = e.target.getAttribute && e.target.getAttribute('data-seats');
        if (!v) return;
        CFG.seats = v === 'all' ? CFG.order.slice() : [];
        saveConfig(); renderSeatList();
    });
    document.getElementById('rule-rounds').addEventListener('change', function (e) {
        CFG.rounds = Number(e.target.value); saveConfig();
    });
    document.getElementById('rule-srcs').addEventListener('click', function (e) {
        var v = e.target.getAttribute && e.target.getAttribute('data-src');
        if (!v) return;
        var at = CFG.srcs.indexOf(v);
        if (at >= 0) {
            if (CFG.srcs.length === 1) return;   // at least one board stays on
            CFG.srcs.splice(at, 1);
        } else {
            CFG.srcs.push(v);
        }
        saveConfig();
        this.querySelectorAll('button').forEach(function (b) {
            b.classList.toggle('active', CFG.srcs.indexOf(b.getAttribute('data-src')) >= 0);
        });
        var el = document.getElementById('board-status');
        el.className = 'board-status'; el.textContent = 'Setting the board…';
        document.getElementById('mk-open').disabled = true;
        fetchBoard();
    });
    document.getElementById('rule-chaos').addEventListener('click', function (e) {
        var v = e.target.getAttribute && e.target.getAttribute('data-chaos');
        if (!v) return;
        CFG.chaos = v; saveConfig();
        this.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-chaos') === v); });
    });
    document.getElementById('rule-pace').addEventListener('click', function (e) {
        var v = e.target.getAttribute && e.target.getAttribute('data-pace');
        if (!v) return;
        CFG.pace = v; saveConfig();
        this.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-pace') === v); });
    });
    document.getElementById('mk-open').addEventListener('click', openRoom);
    document.getElementById('mk-proj').addEventListener('click', renderProjection);
}

/* The dossier grid alone: repainted in place when the deep film lands,
   without disturbing the rest of the setup scene. Dial state lives in
   CFG, so a repaint keeps every selection. */
function renderScoutGrid() {
    var grid = document.getElementById('ghost-grid');
    if (!grid) return;   // not on the setup scene
    grid.innerHTML = MOCK.managers.map(scoutCard).join('');
    grid.querySelectorAll('.strat-sel').forEach(function (sel) {
        sel.addEventListener('change', function () {
            var uid = sel.getAttribute('data-uid');
            if (sel.value === 'auto') delete CFG.strats[uid];
            else CFG.strats[uid] = sel.value;
            saveConfig();
            renderScoutGrid();   // the stamp and tip both read the active script
        });
    });
    grid.querySelectorAll('.mood-sel').forEach(function (sel) {
        sel.addEventListener('change', function () {
            var uid = sel.getAttribute('data-uid');
            if (sel.value === 'table') delete CFG.moods[uid];
            else CFG.moods[uid] = sel.value;
            saveConfig();
        });
    });
}
function stratTip(uid, sel) {
    if (sel === 'auto') return filmLine(uid);
    if (sel === 'none') return 'Scripts off. Tendencies only.';
    return STRATS[sel] ? esc(STRATS[sel].tip) : '';
}
function rulesRow(label, control) {
    return '<div class="rules-row"><span class="mk-label">' + label + '</span>' + control + '</div>';
}
function avatarImg(uid) {
    var url = AVATARS[uid];
    return url
        ? '<img class="mk-avatar" src="' + esc(url) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">'
        : '<span class="mk-avatar"></span>';
}
/* Seat list: drag-and-drop reorder (arrows kept as the precise fallback) */
var dragFrom = null;
function renderSeatList() {
    var el = document.getElementById('seat-list');
    if (!el) return;
    el.innerHTML = CFG.order.map(function (uid, i) {
        var g = GHOSTS[uid];
        var mine = isUser(uid);
        return '<div class="seat-row" draggable="true" data-i="' + i + '">' +
            '<span class="seat-grip" aria-hidden="true">⠿</span>' +
            '<span class="seat-num">' + (i + 1) + '</span>' +
            avatarImg(uid) +
            '<span class="seat-name">' + esc(g ? g.name : uid) + '</span>' +
            '<button class="seat-take' + (mine ? ' on' : '') + '" data-take="' + esc(uid) + '" ' +
            'title="' + (mine ? 'You make this team’s picks. Tap to hand it back to the ghost.' : 'The ghost picks here. Tap to take this seat.') + '">' +
            (mine ? 'You' : 'Ghost') + '</button>' +
            '<span class="seat-move">' +
            '<button data-move="up" data-i="' + i + '"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
            '<button data-move="down" data-i="' + i + '"' + (i === CFG.order.length - 1 ? ' disabled' : '') + '>▼</button>' +
            '</span></div>';
    }).join('');
    var count = document.getElementById('seats-count');
    if (count) {
        count.textContent = CFG.seats.length === 0 ? 'watching'
            : CFG.seats.length === CFG.order.length ? 'all yours'
            : CFG.seats.length + ' of ' + CFG.order.length;
    }

    el.querySelectorAll('[data-take]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var uid = btn.getAttribute('data-take');
            var at = CFG.seats.indexOf(uid);
            if (at >= 0) CFG.seats.splice(at, 1);
            else CFG.seats.push(uid);
            saveConfig(); renderSeatList();
        });
    });

    el.querySelectorAll('[data-move]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var i = Number(btn.getAttribute('data-i'));
            var j = btn.getAttribute('data-move') === 'up' ? i - 1 : i + 1;
            if (j < 0 || j >= CFG.order.length) return;
            var t = CFG.order[i]; CFG.order[i] = CFG.order[j]; CFG.order[j] = t;
            saveConfig(); renderSeatList();
        });
    });

    el.querySelectorAll('.seat-row').forEach(function (row) {
        row.addEventListener('dragstart', function (e) {
            dragFrom = Number(row.getAttribute('data-i'));
            row.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', String(dragFrom)); } catch (err) { /* IE */ }
        });
        row.addEventListener('dragend', function () {
            dragFrom = null;
            el.querySelectorAll('.seat-row').forEach(function (r) { r.classList.remove('dragging', 'drag-over'); });
        });
        row.addEventListener('dragover', function (e) {
            if (dragFrom == null) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            el.querySelectorAll('.seat-row').forEach(function (r) { r.classList.remove('drag-over'); });
            row.classList.add('drag-over');
        });
        row.addEventListener('drop', function (e) {
            e.preventDefault();
            var to = Number(row.getAttribute('data-i'));
            if (dragFrom == null || to === dragFrom) return;
            var moved = CFG.order.splice(dragFrom, 1)[0];
            CFG.order.splice(to, 0, moved);
            dragFrom = null;
            saveConfig(); renderSeatList();
        });
    });
}
function applyPreset(kind) {
    if (kind === 'random') {
        for (var i = CFG.order.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = CFG.order[i]; CFG.order[i] = CFG.order[j]; CFG.order[j] = t;
        }
    } else if (kind === 'last') {
        var seen = {};
        var next = [];
        (MOCK.meta.last_draft_order || []).forEach(function (u) {
            if (u && GHOSTS[u] && !seen[u]) { seen[u] = true; next.push(u); }
        });
        CFG.order.forEach(function (u) { if (!seen[u]) { seen[u] = true; next.push(u); } });
        CFG.order = next;
    } else if (kind === 'reverse') {
        var ranks = MOCK.meta.last_final_ranks || {};
        CFG.order = CFG.order.slice().sort(function (a, b) {
            return (ranks[b] || 0) - (ranks[a] || 0);
        });
    }
    saveConfig(); renderSeatList();
}

/* ── The ghost engine ─────────────────────────────────────── */
function bucketFor(round) { return round <= 3 ? 'early' : round <= 8 ? 'mid' : 'late'; }

// Blend a ghost's bucket share toward the league baseline by sample size:
// a six-season regular reads mostly as themselves, a newcomer reads as the room.
function tendencyShare(ghost, bucket, pos) {
    var base = (BASELINE && BASELINE.buckets && BASELINE.buckets[bucket] && BASELINE.buckets[bucket][pos]) || 0;
    var own = (ghost.buckets && ghost.buckets[bucket] && ghost.buckets[bucket][pos]) || 0;
    var trust = Math.min(1, (ghost.seasons_drafted || 0) / 5);
    return base + (own - base) * trust;
}
function firstRoundFor(ghost, pos, dflt) {
    var own = ghost.first_round_by_pos && ghost.first_round_by_pos[pos];
    if (own != null) return own;
    var base = BASELINE && BASELINE.first_round_by_pos && BASELINE.first_round_by_pos[pos];
    return base != null ? base : dflt;
}

/* Roster math the ghosts obey. Dedicated starter slots are hard
   requirements; FLEX is an extra starter that RB/WR fill (TE almost never
   does, since TEs score less than the backs and receivers who'd take the
   slot); SFLEX plays as a second QB seat. */
function starterReq(pos) {
    var slots = MOCK.meta.slots || {};
    var req = { QB: slots.QB || 1, RB: slots.RB || 2, WR: slots.WR || 2, TE: slots.TE || 1, K: slots.K || 0, DEF: slots.DEF || 0 };
    if ((slots.SFLEX || 0) > 0) req.QB += 1;
    return req[pos] || 0;
}
function flexOpen(counts) {
    var open = (MOCK.meta.slots || {}).FLEX || 0;
    ['RB', 'WR', 'TE'].forEach(function (pos) {
        open -= Math.max(0, (counts[pos] || 0) - starterReq(pos));
    });
    return Math.max(0, open);
}
// Starter holes this roster still has to buy, flex and K/DEF included.
function requiredLeft(counts) {
    var need = flexOpen(counts);
    ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(function (pos) {
        need += Math.max(0, starterReq(pos) - (counts[pos] || 0));
    });
    return need;
}

// Positional appetite given what the roster already holds. Dedicated
// starters first, then flex depth, then a bench appetite that stays shy
// until the starting lineup is actually bought: nobody drafts a backup
// in round 5 while a starting slot sits open.
function needWeight(pos, counts, round) {
    var have = counts[pos] || 0;
    var req = starterReq(pos);

    if (pos === 'K' || pos === 'DEF') {
        return have >= Math.max(1, req || 1) ? 0 : 1;
    }

    var picksLeft = CFG.rounds - round + 1;
    var spare = picksLeft - requiredLeft(counts);

    if (have < req) {
        // An open starting slot. It gets louder as the draft ages, and
        // near-mandatory once the spare picks run out.
        if (spare <= 2) return 2.5;
        return round >= 6 ? 1.6 : 1;
    }
    // No spare picks left: anything that doesn't fill a hole is a wasted card.
    if (spare <= 0) return 0.02;

    // Dedicated slots bought; an open flex is next. RB/WR carry it, TE is
    // a distant third choice (they average fewer points in the slot).
    if ((pos === 'RB' || pos === 'WR' || pos === 'TE') && flexOpen(counts) > 0) {
        var fw = pos === 'TE' ? 0.12 : 0.8;
        return spare <= 2 ? fw * 0.5 : fw;
    }

    // Pure bench. Onesie backups (QB2, TE2) are near-dead money in a
    // lineup that starts one; RB/WR depth warms up mid-draft and the
    // last rounds turn into lottery tickets for everyone.
    var slots = MOCK.meta.slots || {};
    var hardCap = pos === 'QB' ? ((slots.SFLEX || 0) > 0 ? req + 1 : 2)
                : pos === 'TE' ? req + 1
                : req + 4;
    if (have >= hardCap) return 0.01;
    var over = have - req;
    var base;
    if (pos === 'QB' || pos === 'TE') base = round > CFG.rounds - 4 ? 0.35 : round > 8 ? 0.12 : 0.04;
    else base = round > CFG.rounds - 4 ? 1 : round > 5 ? 0.45 : 0.15;
    // Bench shopping waits its turn: while any startable slot besides
    // K/DEF is still open, backups stay on the shelf.
    var holes = flexOpen(counts);
    ['QB', 'RB', 'WR', 'TE'].forEach(function (q) {
        holes += Math.max(0, starterReq(q) - (counts[q] || 0));
    });
    if (holes > 0) base *= 0.35;
    return base * Math.pow(0.6, Math.max(0, over - 1));
}

// Three of the same position with your first three picks is a scheme,
// not a draft. Only a script that calls for it, or a board offering
// nothing else in the top five, gets a pass.
function tripleGuard(uid, pos, round, counts, avail) {
    if (round > 3 || (counts[pos] || 0) < 2) return 1;
    var sc = scriptFor(uid);
    if (pos === 'RB' && (sc === 'robust-rb' || sc === 'zero-wr')) return 1;
    if (pos === 'WR' && (sc === 'triple-wr' || sc === 'zero-rb')) return 1;
    var same = 0;
    for (var i = 0; i < avail.length && i < 5; i++) { if (avail[i].pos === pos) same++; }
    return same >= 5 ? 0.6 : 0.07;
}

// How far past best-available a ghost will even consider, in board slots.
// Tight at the top (the first picks are chalk everywhere), widening as the
// draft deepens. Rounds 1-2 are hard-capped: nobody jumps 10 spots forward.
// A per-seat mood from the scouting file overrides the table's setting.
function reachWindow(overall, round, uid) {
    var w = 2 + overall * 0.11;              // pick 1 ≈ 2 · pick 30 ≈ 5 · pick 90 ≈ 12
    if (round <= 2) w = Math.min(w, 4);
    else if (round <= 4) w = Math.min(w, 8);
    var mood = CHAOS_WINDOW[(CFG.moods && CFG.moods[uid]) || CFG.chaos] || 1;
    return Math.max(1, Math.round(w * mood));
}

// ADP is trustworthy at the top of drafts: rounds one and two are chalk
// territory, where a tier shuffles internally but nobody's 13th-ranked
// guy goes 5th. Penalize early jumps past a candidate's most bullish
// outlet rank; an active script pointing at the position earns the pass,
// and a chaos table gets a longer leash.
function chalkGuard(p, overall, round, uid, scripted) {
    if (round > 2 || scripted) return 1;
    var lo = p.rank;
    if (p.rks) Object.keys(p.rks).forEach(function (k) { lo = Math.min(lo, p.rks[k]); });
    var jump = lo - overall;
    if (jump <= 2) return 1;
    var mood = (CFG.moods && CFG.moods[uid]) || CFG.chaos;
    return Math.pow(mood === 'chaos' ? 0.7 : 0.5, jump - 2);
}

// The book never deals fewer than three names: when the real distribution
// is shorter, the next players off the board join at longshot odds. Pads
// are display-only — ghostPick skips them, so the engine's actual pick
// never rides on a padded card.
function padDist(dist, available, n) {
    if (dist.length >= n) return dist;
    var have = {};
    dist.forEach(function (d) { have[d.p.id] = true; });
    var total = dist.reduce(function (a, d) { return a + d.prob; }, 0);
    for (var i = 0; i < available.length && dist.length < n; i++) {
        var p = available[i];
        if (have[p.id]) continue;
        have[p.id] = true;
        dist.push({ p: p, prob: 0.03, pad: true });
        total += 0.03;
    }
    if (total <= 0) return dist;
    return dist.map(function (d) { return { p: d.p, prob: d.prob / total, pad: d.pad }; });
}

// The full pick distribution for a seat: [{ p, prob }] sorted by prob desc,
// probs summing to 1. ghostPick samples from it; the book displays it.
// ctx carries draft state ({ overall, posCounts }); omitted = the live SIM,
// passed explicitly by the projection's headless runs.
function pickDistribution(uid, round, available, ctx) {
    var st = ctx || SIM;
    var ghost = GHOSTS[uid] || { buckets: {}, r1: {}, favorites: [], seasons_drafted: 0 };
    var bucket = bucketFor(round);
    var counts = st.posCounts[uid];
    var favs = {};
    (ghost.favorites || []).forEach(function (f) { favs[normName(f.name)] = f.count; });

    var mustKD = [];
    ['K', 'DEF'].forEach(function (pos) {
        var slots = MOCK.meta.slots || {};
        var wants = (slots[pos] || 0) > 0 || tendencyShare(ghost, 'late', pos) > 0.02;
        if (!wants) return;
        if ((counts[pos] || 0) > 0) return;
        var due = firstRoundFor(ghost, pos, CFG.rounds - (pos === 'K' ? 1 : 2));
        if (round >= Math.min(due, CFG.rounds - 1) || round >= CFG.rounds - (pos === 'K' ? 0 : 1)) mustKD.push(pos);
    });
    var kdBest = null;
    if (mustKD.length) {
        kdBest = available.filter(function (p) { return p.pos === mustKD[0]; })[0] || null;
    }
    // Out of runway: the missing kicker or defense is the whole book.
    if (kdBest && round >= CFG.rounds - 1) return padDist([{ p: kdBest, prob: 1 }], available, 3);

    // Candidate set: the first W draft-eligible players in board order.
    // The board decides who is in the conversation; tendencies decide the
    // close calls inside it.
    var W = reachWindow(st.overall, round, uid);
    var valid = [];
    for (var i = 0; i < available.length && valid.length < W; i++) {
        var p = available[i];
        // Ghosts don't take K/DEF before their historical round.
        if (p.pos === 'K' || p.pos === 'DEF') {
            var due2 = firstRoundFor(ghost, p.pos, CFG.rounds - 1);
            if (round < due2 - 1) continue;
        }
        var needW = needWeight(p.pos, counts, round);
        if (needW <= 0) continue;
        valid.push({ p: p, needW: needW, slot: valid.length });
    }
    // A hole the window can't see: when a still-required position has no
    // candidate inside W, the ghost goes looking for one. Real managers
    // reach for the roster spot, not the board slot. The reach candidate
    // joins the conversation at half-window depth, discounted but live.
    // Only once the hole is actually pressing, though: in the early rounds
    // every slot is technically open and this reach was how a top-15 QB
    // went 5th overall. Early boards are chalk; the window rules there.
    var spare = (CFG.rounds - round + 1) - requiredLeft(counts);
    var seenPos = {};
    valid.forEach(function (c) { seenPos[c.p.pos] = true; });
    if (round >= 5 || spare <= 2) {
        ['QB', 'RB', 'WR', 'TE'].forEach(function (pos) {
            if (seenPos[pos]) return;
            if ((counts[pos] || 0) >= starterReq(pos)) return;
            var limit = spare <= 1 ? available.length : W * 6;
            for (var k = 0; k < available.length && k < limit; k++) {
                if (available[k].pos !== pos) continue;
                valid.push({ p: available[k], needW: needWeight(pos, counts, round), slot: Math.ceil(W / 2) });
                seenPos[pos] = true;
                break;
            }
        });
    }
    // A script is the one sanctioned early reach: when the scripted
    // position has no candidate inside the window, its best available
    // joins the conversation at full-window discount, as long as he is
    // within shouting distance of the pick.
    var scriptId = scriptFor(uid);
    if (scriptId) {
        ['QB', 'RB', 'WR', 'TE'].forEach(function (pos) {
            if (seenPos[pos]) return;
            if (stratWeight(scriptId, pos, round, counts) <= 1) return;
            for (var k2 = 0; k2 < available.length; k2++) {
                if (available[k2].pos !== pos) continue;
                if (available[k2].rank - st.overall > W * 2 + 4) break;   // too far even for the script
                var nw = needWeight(pos, counts, round);
                if (nw > 0) { valid.push({ p: available[k2], needW: nw, slot: W }); seenPos[pos] = true; }
                break;
            }
        });
    }
    if (!valid.length) {
        return available.length ? padDist([{ p: available[0], prob: 1 }], available, 3) : [];
    }

    // Tendencies matter little at the very top (everyone takes the guy) and
    // more as the board flattens out.
    var alpha = round <= 2 ? 0.45 : round <= 8 ? 0.9 : 1.3;
    var lambda = Math.max(0.9, W / 3);       // board-order decay: slot 0 → 1, slot W → e^-3
    var sum = 0;
    var scores = valid.map(function (c) {
        var boardW = Math.exp(-c.slot / lambda);
        var tend = tendencyShare(ghost, bucket, c.p.pos) * 2.2;
        if (round === 1 && ghost.r1 && ghost.r1[c.p.pos]) tend += ghost.r1[c.p.pos] * 1.5;
        var tendW = 1 + alpha * tend;
        var favW = favs[c.p.norm] ? (round <= 3 ? 1.15 : 1.5) : 1;
        var stratW = stratWeight(scriptId, c.p.pos, round, counts);
        var s = boardW * tendW * c.needW * favW * stratW *
            tripleGuard(uid, c.p.pos, round, counts, available) *
            chalkGuard(c.p, st.overall, round, uid, stratW > 1);
        sum += s;
        return s;
    });

    var dist = valid.map(function (c, j) { return { p: c.p, prob: scores[j] / sum }; });
    // Inside their historical K/DEF window with the seat still empty: 45%
    // of the book is "just take the kicker" so they land where they really
    // go, not only at the death.
    if (kdBest) {
        dist = dist.filter(function (d) { return d.p.id !== kdBest.id; });
        var rest = dist.reduce(function (a, d) { return a + d.prob; }, 0);
        if (rest <= 0) return [{ p: kdBest, prob: 1 }];
        var scale = 0.55 / rest;
        dist = [{ p: kdBest, prob: 0.45 }].concat(dist.map(function (d) {
            return { p: d.p, prob: d.prob * scale };
        }));
    }
    dist.sort(function (a, b) { return b.prob - a.prob; });
    return padDist(dist, available, 3);
}

function ghostPick(uid, round, available, ctx) {
    var dist = pickDistribution(uid, round, available, ctx);
    // Padded longshots are for the reader, not the ghost.
    var live = dist.filter(function (d) { return !d.pad; });
    if (!live.length) live = dist;
    if (!live.length) return available[0] || null;
    var sum = live.reduce(function (a, d) { return a + d.prob; }, 0);
    var roll = Math.random() * sum;
    for (var k = 0; k < live.length; k++) {
        roll -= live[k].prob;
        if (roll <= 0) return live[k].p;
    }
    return live[live.length - 1].p;
}

/* ── Scene II: the room ───────────────────────────────────── */
function seatFor(overall) {
    var teams = CFG.order.length;
    var round = Math.floor((overall - 1) / teams) + 1;
    // roundPick is the slot within the round (a snake's 2.01 belongs to the
    // seat that just took 1.12); idx is the seat column it lands in.
    var pickInRound = (overall - 1) % teams;
    var idx = pickInRound;
    var snake = (MOCK.meta.draft_type || 'snake') !== 'linear';
    if (snake && round % 2 === 0) idx = teams - 1 - idx;
    return { round: round, idx: idx, uid: CFG.order[idx], roundPick: pickInRound + 1 };
}

// Opens the room in an armed-but-idle state: the board is drawn, the first
// seat is on deck, and nothing moves until "Start the draft".
function openRoom() {
    if (!BOARD) return;
    closeProj();
    SIM = {
        started: false,
        overall: 1,
        total: CFG.order.length * CFG.rounds,
        taken: {},          // player id -> true
        picks: [],          // { overall, round, uid, player, boardRank, fav }
        posCounts: {},      // uid -> { QB: n, ... }
        rosters: {},        // uid -> [player]
        paused: false,
        done: false,
        railTab: 'ba',
        railSeat: CFG.seats[0] || CFG.order[0],
        baPos: 'ALL',
        baQuery: '',
        queue: [],          // player ids the user starred, in order
        warOpen: false,     // war room overlay; sticky once opened
    };
    CFG.order.forEach(function (u) { SIM.posCounts[u] = {}; SIM.rosters[u] = []; });
    renderRoom();
    updateClock(seatFor(1));
}

function available() {
    return BOARD.players.filter(function (p) { return !SIM.taken[p.id]; });
}

function stopTimer() { if (SIM && SIM.timer) { clearTimeout(SIM.timer); SIM.timer = null; } }

function tick() {
    stopTimer();
    if (!SIM || !SIM.started || SIM.done || SIM.paused) return;
    if (SIM.overall > SIM.total) return finishDraft();
    var seat = seatFor(SIM.overall);
    updateClock(seat);
    if (isUser(seat.uid)) {
        // The user's turn: open the rail and wait.
        SIM.railTab = 'ba';
        var tabs = app.querySelectorAll('.rail-tab');
        tabs.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-rail') === 'ba'); });
        renderRail();
        return;
    }
    var delay = PACE_MS[CFG.pace];
    SIM.timer = setTimeout(function () {
        var p = ghostPick(seat.uid, seat.round, available());
        if (p) commitPick(seat, p);
        tick();
    }, delay);
}

function commitPick(seat, player) {
    SIM.taken[player.id] = true;
    var qi = SIM.queue.indexOf(player.id);
    if (qi >= 0) SIM.queue.splice(qi, 1);
    var ghost = GHOSTS[seat.uid] || {};
    var favs = {};
    (ghost.favorites || []).forEach(function (f) { favs[normName(f.name)] = f.count; });
    var pick = {
        overall: SIM.overall,
        round: seat.round,
        roundPick: seat.roundPick,
        uid: seat.uid,
        player: player,
        boardRank: player.rank,
        fav: favs[player.norm] || 0,
    };
    SIM.picks.push(pick);
    SIM.posCounts[seat.uid][player.pos] = (SIM.posCounts[seat.uid][player.pos] || 0) + 1;
    SIM.rosters[seat.uid].push(player);
    SIM.overall++;
    paintPick(pick);
    appendLog(pick);
    renderRail();
}

function finishDraft() {
    SIM.done = true;
    stopTimer();
    renderRecap();
}

function whisperFor(uid, round) {
    var g = GHOSTS[uid];
    if (!g) return '';
    if (round === 1) {
        var top = null;
        Object.keys(g.r1 || {}).forEach(function (p) { if (!top || g.r1[p] > g.r1[top]) top = p; });
        if (top) return esc(g.name) + ' opens ' + top + ' ' + pct(g.r1[top]) + ' of the time.';
    }
    var bucket = bucketFor(round);
    var counts = SIM.posCounts[uid];
    if ((g.favorites || []).length) {
        for (var i = 0; i < g.favorites.length; i++) {
            var f = g.favorites[i];
            var onBoard = available().some(function (p) { return p.norm === normName(f.name); });
            if (onBoard) return esc(f.name) + ' is still on the board. ' + esc(g.name) + ' has drafted him ' + f.count + ' times.';
        }
    }
    if (!counts.QB && round >= firstRoundFor(g, 'QB', 6)) return 'Still no quarterback. History says this is the round.';
    var top2 = null;
    var shares = (g.buckets || {})[bucket] || {};
    Object.keys(shares).forEach(function (p) { if (!top2 || shares[p] > shares[top2]) top2 = p; });
    if (top2 && shares[top2] >= 0.4) return 'In the ' + bucket + ' rounds, ' + esc(g.name) + ' goes ' + top2 + ' ' + pct(shares[top2]) + ' of the time.';
    var sc = scriptFor(uid);
    if (sc && round <= 6) {
        return esc(g.name) + ' is on the ' + STRATS[sc].label + ' script tonight' +
            (CFG.strats[uid] == null || CFG.strats[uid] === 'auto' ? ', straight off the film.' : '.');
    }
    return '';
}

function renderRoom() {
    var teams = CFG.order.length;
    var fit = teams <= 12;
    var html = '<div class="mk-card clock-strip" id="clock-strip">' +
        '<span class="clock-pick" id="clock-pick"></span>' +
        '<span id="clock-avatar"></span>' +
        '<span class="clock-name" id="clock-name"></span>' +
        '<span class="clock-whisper" id="clock-whisper"></span>' +
        '<span class="clock-controls">' +
        '<button class="mk-btn primary" id="ctl-start">Start the draft</button>' +
        '<button class="mk-btn" id="ctl-pause" style="display:none">Pause</button>' +
        (CFG.seats.length ? '<button class="mk-btn" id="ctl-ghostme" title="Hand this pick back to its ghost">Let the ghost pick</button>' : '') +
        '<button class="mk-btn" id="ctl-abandon">Back to setup</button>' +
        '</span></div>';

    html += '<div class="mk-card book-panel" id="odds-strip" style="display:none"></div>';

    var snake = (MOCK.meta.draft_type || 'snake') !== 'linear';
    html += '<div class="room-grid"><div class="board-bind">' +
        '<div class="board-bind-label"><span>★ The Board</span><small id="board-progress">' + esc(BOARD.label) + '</small></div>' +
        '<div class="board-wrap' + (fit ? ' fit' : '') + '"><table class="mock-board"><thead><tr><th class="round-col"></th>' +
        CFG.order.map(function (uid) {
            var g = GHOSTS[uid];
            var av = AVATARS[uid];
            return '<th' + (isUser(uid) ? ' class="you"' : '') + ' title="' + esc(g ? g.name : '') + '">' +
                '<span class="th-plate">' +
                (av ? '<img src="' + esc(av) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' : '<span class="th-dot"></span>') +
                '<span>' + esc(g ? g.name : uid) + '</span></span></th>';
        }).join('') + '</tr></thead><tbody>' +
        Array.from({ length: CFG.rounds }, function (_, r) {
            var round = r + 1;
            var arrow = !snake ? '→' : (round % 2 === 1 ? '→' : '←');
            return '<tr><td class="round-cell">' + round + '<span>' + arrow + '</span></td>' +
                Array.from({ length: teams }, function (_, c) {
                    var pickNo = (snake && round % 2 === 0) ? teams - c : c + 1;
                    return '<td id="cell-' + round + '-' + c + '">' +
                        '<span class="cell-slot">' + round + '.' + (pickNo < 10 ? '0' : '') + pickNo + '</span></td>';
                }).join('') + '</tr>';
        }).join('') + '</tbody></table></div></div>';

    html += '<div class="mk-card rail"><div class="rail-tabs">' +
        '<button class="rail-tab active" data-rail="ba">Available</button>' +
        '<button class="rail-tab" data-rail="ros">Rosters</button>' +
        '<button class="rail-tab" data-rail="log">The Wire</button>' +
        '</div><div class="rail-body" id="rail-body"></div></div></div>';

    app.innerHTML = html;

    document.getElementById('ctl-start').addEventListener('click', function () {
        SIM.started = true;
        this.style.display = 'none';
        document.getElementById('ctl-pause').style.display = '';
        tick();
    });
    document.getElementById('ctl-pause').addEventListener('click', function () {
        SIM.paused = !SIM.paused;
        this.textContent = SIM.paused ? 'Resume' : 'Pause';
        this.classList.toggle('gold', SIM.paused);
        if (!SIM.paused) tick();
    });
    document.getElementById('ctl-abandon').addEventListener('click', function () {
        stopTimer(); renderSetup();
    });
    var ghostMe = document.getElementById('ctl-ghostme');
    if (ghostMe) ghostMe.addEventListener('click', function () {
        if (!SIM.started || SIM.done) return;
        var seat = seatFor(SIM.overall);
        if (!isUser(seat.uid)) return;
        var p = ghostPick(seat.uid, seat.round, available());
        if (p) { commitPick(seat, p); tick(); }
    });
    app.querySelectorAll('[data-rail]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            SIM.railTab = btn.getAttribute('data-rail');
            app.querySelectorAll('.rail-tab').forEach(function (b) { b.classList.toggle('active', b === btn); });
            renderRail();
        });
    });
    bindKeys();
    renderRail();
}

function updateClock(seat) {
    var g = GHOSTS[seat.uid];
    var strip = document.getElementById('clock-strip');
    if (!strip) return;
    var mine = isUser(seat.uid);
    strip.classList.toggle('user-turn', !!(mine && SIM.started));
    document.getElementById('clock-pick').textContent = 'R' + seat.round + ' · P' + seat.roundPick;
    document.getElementById('clock-avatar').innerHTML = avatarImg(seat.uid);
    var seatName = g ? g.name : seat.uid;
    if (!SIM.started) {
        document.getElementById('clock-name').textContent = 'The table is set';
        document.getElementById('clock-whisper').textContent =
            CFG.order.length + ' ghosts seated · ' + seatName + ' holds the first pick.';
    } else {
        document.getElementById('clock-name').textContent = mine
            ? (CFG.seats.length > 1 ? 'You are up · ' + seatName + "'s seat" : 'You are on the clock')
            : seatName + ' is up';
        document.getElementById('clock-whisper').textContent = mine
            ? 'Take the book’s call below, or pick your own from the rail.'
            : whisperFor(seat.uid, seat.round);
    }
    renderBookPanel(seat, mine);
    renderWarRoom();
    var prog = document.getElementById('board-progress');
    if (prog) {
        prog.textContent = SIM.started
            ? 'Round ' + seat.round + ' · Pick ' + SIM.overall + ' of ' + SIM.total + ' · ' + BOARD.label
            : BOARD.label;
    }
    var cell = document.getElementById('cell-' + seat.round + '-' + seat.idx);
    app.querySelectorAll('.on-clock-cell').forEach(function (el) { el.classList.remove('on-clock-cell'); });
    if (cell) cell.classList.add('on-clock-cell');
}

/* The book: what this seat's ghost would do with this pick, dealt as big
   clickable cards. Shown when a controlled seat is up. */
function spreadTitle(p) {
    if (!p.rks) return '';
    return Object.keys(p.rks).map(function (k) { return k + ' ' + p.rks[k]; }).join(' · ');
}
function spreadRange(p) {
    if (!p.rks) return null;
    var vals = Object.keys(p.rks).map(function (k) { return p.rks[k]; });
    if (vals.length < 2) return null;
    return { lo: Math.min.apply(null, vals), hi: Math.max.apply(null, vals) };
}
function draftAsUser(pid) {
    var p = BOARD.players.find(function (x) { return x.id === pid && !SIM.taken[x.id]; });
    if (!p) return;
    var s = seatFor(SIM.overall);
    if (!isUser(s.uid)) return;
    commitPick(s, p);
    tick();
}
/* The call card's reasoning, in words: the loudest one or two signals
   behind the ghost's favorite. */
function whyLine(uid, p, round) {
    var g = GHOSTS[uid] || {};
    var counts = SIM.posCounts[uid];
    var bits = [];
    var fav = 0;
    (g.favorites || []).forEach(function (f) { if (normName(f.name) === p.norm) fav = f.count; });
    var sc = scriptFor(uid);
    var r1 = (g.r1 || {})[p.pos] || 0;
    var bucket = bucketFor(round);
    var share = ((g.buckets || {})[bucket] || {})[p.pos] || 0;
    var diff = p.rank - SIM.overall;
    if (fav >= 2) bits.push('has drafted him ' + fav + ' times before');
    if (sc && stratWeight(sc, p.pos, round, counts) > 1) bits.push('the ' + STRATS[sc].label + ' script points here');
    if (round === 1 && r1 >= 0.4) bits.push('opens ' + p.pos + ' ' + pct(r1) + ' of the time');
    else if (share >= 0.4) bits.push('goes ' + p.pos + ' ' + pct(share) + ' in the ' + bucket + ' rounds');
    if (diff >= 5) bits.push('the board had him ' + diff + ' spots earlier');
    if (!bits.length && !counts[p.pos]) bits.push('first ' + p.pos + ' for this roster');
    if (!bits.length) return 'Best available, and the roster agrees.';
    var line = bits.slice(0, 2).join(', and ');
    return line.charAt(0).toUpperCase() + line.slice(1) + '.';
}
/* One-word read on a field card: the single loudest signal. */
function fieldTag(uid, p, round) {
    var g = GHOSTS[uid] || {};
    var counts = SIM.posCounts[uid];
    var fav = 0;
    (g.favorites || []).forEach(function (f) { if (normName(f.name) === p.norm) fav = f.count; });
    if (fav >= 2) return 'old flame';
    var sc = scriptFor(uid);
    if (sc && stratWeight(sc, p.pos, round, counts) > 1) return 'script';
    if (p.rank - SIM.overall >= 5) return 'falling';
    var share = ((g.buckets || {})[bucketFor(round)] || {})[p.pos] || 0;
    if (share >= 0.4) return 'the habit';
    if (!counts[p.pos]) return 'need';
    return 'board';
}
var BOOK_PIDS = [];   // the book's candidates, for the number keys

/* The inline book: fixed-size cards above the board, so the board and
   the rail stay in view while you decide. */
function renderBookPanel(seat, mine) {
    var el = document.getElementById('odds-strip');
    if (!el) return;
    BOOK_PIDS = [];
    if (!mine || !SIM.started || SIM.done) { el.style.display = 'none'; return; }
    var g = GHOSTS[seat.uid];
    var dist = pickDistribution(seat.uid, seat.round, available()).slice(0, 6);
    if (!dist.length) { el.style.display = 'none'; return; }
    BOOK_PIDS = dist.map(function (d) { return d.p.id; });
    el.style.display = '';
    var sc = scriptFor(seat.uid);
    var fromFilm = CFG.strats[seat.uid] == null || CFG.strats[seat.uid] === 'auto';

    el.innerHTML = '<div class="book-head">' +
        '<span class="book-title">On the clock · the book on <em>' + esc(g ? g.name : seat.uid) + '.</em></span>' +
        (sc ? '<span class="book-strat-tag">' + STRATS[sc].label + (fromFilm ? ' · from the film' : ' script') + '</span>' : '') +
        '<span class="book-hint">tap a card or the rail to draft · Enter takes the call</span>' +
        '<button class="mk-btn" id="wr-open" title="The full desk: book, player pool, your roster and queue">War room</button></div>' +
        '<div class="book-strip">' + dist.map(function (d, i) {
            var c = POS_COLORS[d.p.pos] || { text: '#8a7a60' };
            var range = spreadRange(d.p);
            var isCall = i === 0;
            return '<button class="bk-card' + (isCall ? ' call' : '') + '" data-pid="' + esc(d.p.id) + '" ' +
                'data-pos="' + esc(d.p.pos) + '" style="--pos:' + c.text + '" title="' + esc(spreadTitle(d.p)) + '">' +
                (isCall ? '<span class="bk-tag">★ The call</span>' : '') +
                '<span class="bk-key">' + (i + 1) + '</span>' +
                '<span class="bk-top">' +
                '<img class="bk-headshot" src="' + headThumb(d.p.id) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
                '<span class="bk-id"><span class="bk-name">' + esc(d.p.name) + '</span>' +
                '<span class="bk-meta" style="color:' + c.text + '">' + esc(d.p.pos) +
                (d.p.team ? ' · ' + esc(d.p.team) : '') + ' · #' + d.p.rank +
                (range ? ' · ' + range.lo + '-' + range.hi : '') + '</span></span></span>' +
                '<span class="bk-oddsrow">' +
                '<span class="bk-bar"><i style="width:' + Math.max(6, Math.round(d.prob / (dist[0].prob || 1) * 100)) + '%;background:' + c.text + '"></i></span>' +
                '<span class="bk-odds">' + Math.round(d.prob * 100) + '%</span></span>' +
                (isCall
                    ? '<span class="bk-why">' + whyLine(seat.uid, d.p, seat.round) + '</span>'
                    : '<span class="bk-read">' + (d.pad ? 'longshot' : fieldTag(seat.uid, d.p, seat.round)) + '</span>') +
                '</button>';
        }).join('') + '</div>';

    document.getElementById('wr-open').addEventListener('click', function () {
        SIM.warOpen = true;
        renderWarRoom();
    });
    el.querySelectorAll('.bk-card').forEach(function (card) {
        card.addEventListener('click', function () { draftAsUser(card.getAttribute('data-pid')); });
    });
}

/* The war room: the full-screen desk where a controlled pick actually
   happens. The ghost's book on the left, the whole player pool in the
   middle, your roster and queue on the right. */
function renderWarRoom() {
    // The overlay lives on <body>, outside the page's .section stacking
    // context; inside it the sticky nav sat on top of the modal and the
    // close button was unclickable.
    var wrap = document.getElementById('war-room');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'war-room';
        wrap.style.display = 'none';
        document.body.appendChild(wrap);
    }
    var seat = SIM && SIM.overall <= SIM.total ? seatFor(SIM.overall) : null;
    var mine = !!(seat && isUser(seat.uid) && SIM.started && !SIM.done);
    if (!SIM || !mine || !SIM.warOpen) {
        wrap.style.display = 'none'; wrap.innerHTML = '';
        return;
    }
    var dist = pickDistribution(seat.uid, seat.round, available()).slice(0, 6);
    var g = GHOSTS[seat.uid];
    var sc = scriptFor(seat.uid);
    var fromFilm = CFG.strats[seat.uid] == null || CFG.strats[seat.uid] === 'auto';

    var bookRows = dist.map(function (d, i) {
        var c = POS_COLORS[d.p.pos] || { text: '#8a7a60' };
        var range = spreadRange(d.p);
        var isCall = i === 0;
        return '<button class="wrb-row' + (isCall ? ' call' : '') + '" data-pid="' + esc(d.p.id) + '"' +
            ' style="--pos:' + c.text + '" title="' + esc(spreadTitle(d.p)) + '">' +
            '<span class="wrb-key">' + (i + 1) + '</span>' +
            '<img class="wrb-head" src="' + headThumb(d.p.id) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
            '<span class="wrb-main"><span class="wrb-name">' + esc(d.p.name) + '</span>' +
            '<span class="wrb-meta" style="color:' + c.text + '">' + esc(d.p.pos) +
            (d.p.team ? ' · ' + esc(d.p.team) : '') + ' · #' + d.p.rank +
            (range ? ' · books ' + range.lo + '-' + range.hi : '') + '</span>' +
            (isCall ? '<span class="wrb-why">' + whyLine(seat.uid, d.p, seat.round) + '</span>' : '') +
            '</span>' +
            '<span class="wrb-right"><span class="wrb-odds">' + Math.round(d.prob * 100) + '%</span>' +
            '<span class="wrb-bar"><i style="width:' + Math.max(4, Math.round(d.prob / (dist[0].prob || 1) * 100)) + '%;background:' + c.text + '"></i></span>' +
            (isCall ? '' : '<span class="wrb-tag">' + (d.pad ? 'longshot' : fieldTag(seat.uid, d.p, seat.round)) + '</span>') +
            '</span></button>';
    }).join('');

    var roster = (SIM.rosters[seat.uid] || []).slice().sort(function (a, b) { return a.rank - b.rank; });
    var lu = assignLineup(roster);
    var rosterHtml = lu.starters.map(function (r) {
        return '<div class="ros-slot-row"><span class="ros-slot">' + esc(r.slot) + '</span>' +
            (r.player
                ? '<span class="ros-player">' + esc(r.player.name) + '</span>' + posChip(r.player.pos)
                : '<span class="ros-player empty">open</span>') + '</div>';
    }).join('') + lu.bench.map(function (p) {
        return '<div class="ros-slot-row"><span class="ros-slot">BN</span>' +
            '<span class="ros-player">' + esc(p.name) + '</span>' + posChip(p.pos) + '</div>';
    }).join('');

    var queued = SIM.queue.filter(function (id) { return !SIM.taken[id]; });
    var queueHtml = queued.length
        ? '<div class="wr-queue-block">' + queued.map(function (id) {
            var p = BOARD.players.find(function (x) { return x.id === id; });
            if (!p) return '';
            var c = POS_COLORS[p.pos] || { text: '#8a7a60' };
            return '<button class="queue-chip" data-pid="' + esc(p.id) + '" title="Tap to draft">' +
                '<span class="star">★</span>' + esc(p.name) +
                '<span style="font-family:var(--mono);font-size:.54rem;color:' + c.text + '">' + esc(p.pos) + '</span></button>';
        }).join('') + '</div>'
        : '<div class="wr-empty">Star players in the pool to build a queue.</div>';

    wrap.style.display = '';
    wrap.innerHTML = '<div class="wr-overlay"><div class="wr-modal">' +
        '<div class="wr-head">' +
        '<span class="wr-pick">R' + seat.round + ' · P' + seat.roundPick + '</span>' +
        '<span class="wr-title">You are on the <em>clock.</em></span>' +
        '<span class="wr-sub">' + (CFG.seats.length > 1 ? esc(g ? g.name : '') + '’s seat · ' : '') +
        (sc ? STRATS[sc].label + (fromFilm ? ', straight off the film.' : ' script tonight.') : 'No script tonight.') + '</span>' +
        '<button class="mk-btn" id="wr-ghost" title="Hand this pick to the ghost">Let the ghost pick</button>' +
        '<button class="wr-close" id="wr-close" title="Close and view the board; the book stays above it">×</button>' +
        '</div>' +
        '<div class="wr-body">' +
        '<div class="wr-col"><div class="wr-col-head">★ The book on <b>' + esc(g ? g.name : seat.uid) + '</b></div>' + bookRows + '</div>' +
        '<div class="wr-col"><div class="wr-col-head">The player pool</div>' +
        '<div class="ba-controls" style="top:0">' +
        '<input class="ba-search" id="wrba-search" placeholder="Find a player" value="' + esc(SIM.baQuery) + '">' +
        '<div class="ba-pos" id="wrba-pos">' + ['ALL'].concat(POS_ORDER).map(function (p) {
            return '<button data-pos="' + p + '" class="' + (SIM.baPos === p ? 'active' : '') + '">' + p + '</button>';
        }).join('') + '</div></div>' +
        '<div id="wrba-list"></div></div>' +
        '<div class="wr-col"><div class="wr-col-head">Your room so far</div>' + rosterHtml +
        '<div class="wr-col-head">Your queue</div>' + queueHtml + '</div>' +
        '</div>' +
        '<div class="wr-keys">Enter takes the call · 1-6 draft from the book · Esc closes the room</div>' +
        '</div></div>';

    fillWarPool();

    wrap.querySelector('.wr-overlay').addEventListener('click', function (e) {
        if (e.target === e.currentTarget) { SIM.warOpen = false; renderWarRoom(); }
    });
    wrap.querySelectorAll('.wrb-row, .queue-chip').forEach(function (btn) {
        btn.addEventListener('click', function () { draftAsUser(btn.getAttribute('data-pid')); });
    });
    document.getElementById('wr-ghost').addEventListener('click', function () {
        var s = seatFor(SIM.overall);
        if (!isUser(s.uid)) return;
        var p = ghostPick(s.uid, s.round, available());
        if (p) { commitPick(s, p); tick(); }
    });
    document.getElementById('wr-close').addEventListener('click', function () {
        SIM.warOpen = false; renderWarRoom();
    });
    document.getElementById('wrba-search').addEventListener('input', function (e) {
        SIM.baQuery = e.target.value;
        fillWarPool();
    });
    document.getElementById('wrba-pos').addEventListener('click', function (e) {
        var v = e.target.getAttribute && e.target.getAttribute('data-pos');
        if (!v) return;
        SIM.baPos = v;
        this.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-pos') === v); });
        fillWarPool();
    });
}

/* The pool list inside the war room; re-fills on its own so typing in
   the search box keeps focus. */
function fillWarPool() {
    var list = document.getElementById('wrba-list');
    if (!list) return;
    var rows = available();
    if (SIM.baPos !== 'ALL') rows = rows.filter(function (p) { return p.pos === SIM.baPos; });
    if (SIM.baQuery) {
        var q = normName(SIM.baQuery);
        rows = rows.filter(function (p) { return p.norm.indexOf(q) >= 0; });
    }
    rows = rows.slice(0, 40);
    var lastTier = 0;
    list.innerHTML = rows.map(function (p) {
        var rule = '';
        if (p.tierNo && p.tierNo !== lastTier) {
            rule = '<div class="tier-rule"><span>Tier ' + p.tierNo + '</span></div>';
            lastTier = p.tierNo;
        }
        var c = POS_COLORS[p.pos] || { text: '#8a7a60' };
        var range = spreadRange(p);
        var starred = SIM.queue.indexOf(p.id) >= 0;
        return rule + '<div class="ba-row pickable" data-pid="' + esc(p.id) + '" title="' + esc(spreadTitle(p)) + '">' +
            '<span class="ba-rank">' + p.rank + '</span>' +
            '<img class="ba-head" src="' + headThumb(p.id) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
            '<div class="ba-main"><div class="ba-name">' + esc(p.name) + '</div>' +
            '<div class="ba-meta" style="color:' + c.text + '">' + esc(p.pos) + (p.team ? ' · ' + esc(p.team) : '') + (p.tier ? ' · ' + esc(p.tier) : '') +
            (range ? ' · ' + range.lo + '-' + range.hi : '') + '</div></div>' +
            '<button class="ba-star' + (starred ? ' on' : '') + '" data-star="' + esc(p.id) + '" title="' + (starred ? 'Drop from your queue' : 'Star for your queue') + '">' + (starred ? '★' : '☆') + '</button>' +
            '<span class="ba-draft">Draft</span>' +
            '</div>';
    }).join('') || '<div class="wr-empty">Nobody matches.</div>';
    list.querySelectorAll('.ba-row').forEach(function (row) {
        row.addEventListener('click', function (e) {
            if (e.target.closest && e.target.closest('.ba-star')) return;
            draftAsUser(row.getAttribute('data-pid'));
        });
    });
    list.querySelectorAll('.ba-star').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var pid = btn.getAttribute('data-star');
            var at = SIM.queue.indexOf(pid);
            if (at >= 0) SIM.queue.splice(at, 1); else SIM.queue.push(pid);
            renderWarRoom();
        });
    });
}
var keyHandler = null;
function bindKeys() {
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = function (e) {
        if (!SIM) return;
        var seat = SIM.started && !SIM.done && SIM.overall <= SIM.total ? seatFor(SIM.overall) : null;
        var mine = !!(seat && isUser(seat.uid));
        var t = e.target;
        var typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
        if (e.key === 'Escape') {
            // Esc always closes an open war room, even mid-pause.
            e.preventDefault();
            if (typing && t.blur) t.blur();
            if (SIM.warOpen) { SIM.warOpen = false; renderWarRoom(); }
            else if (mine && !SIM.paused) { SIM.warOpen = true; renderWarRoom(); }
            return;
        }
        if (!mine || SIM.paused || typing || !BOOK_PIDS.length) return;
        if (e.key === 'Enter' || e.key === '1') { e.preventDefault(); draftAsUser(BOOK_PIDS[0]); }
        else if (e.key >= '2' && e.key <= '6') {
            var i = Number(e.key) - 1;
            if (BOOK_PIDS[i]) { e.preventDefault(); draftAsUser(BOOK_PIDS[i]); }
        }
    };
    document.addEventListener('keydown', keyHandler);
}

function paintPick(pick) {
    var teams = CFG.order.length;
    var idx = (pick.overall - 1) % teams;
    var snake = (MOCK.meta.draft_type || 'snake') !== 'linear';
    if (snake && pick.round % 2 === 0) idx = teams - 1 - idx;
    var cell = document.getElementById('cell-' + pick.round + '-' + idx);
    if (!cell) return;
    var c = POS_COLORS[pick.player.pos] || { cell: '#57503f' };
    var prev = app.querySelector('.pick-card.latest');
    if (prev) prev.classList.remove('latest');
    cell.innerHTML = '<div class="pick-card latest" style="background-color:' + c.cell + '">' +
        '<div class="pick-card-name" title="' + esc(pick.player.name) + '">' + esc(pick.player.name) + '</div>' +
        '<div class="pick-card-meta">' + esc(pick.player.pos) + (pick.player.team ? ' · ' + esc(pick.player.team) : '') + '</div></div>';
}

/* The rail */
function renderRail() {
    var body = document.getElementById('rail-body');
    if (!body || !SIM) return;
    if (SIM.railTab === 'ba') return renderRailBA(body);
    if (SIM.railTab === 'ros') return renderRailRosters(body);
    return renderRailLog(body);
}
function renderRailBA(body) {
    var seat = SIM.overall <= SIM.total ? seatFor(SIM.overall) : null;
    var userTurn = !!(seat && isUser(seat.uid) && SIM.started && !SIM.done);
    var rows = available();
    if (SIM.baPos !== 'ALL') rows = rows.filter(function (p) { return p.pos === SIM.baPos; });
    if (SIM.baQuery) {
        var q = normName(SIM.baQuery);
        rows = rows.filter(function (p) { return p.norm.indexOf(q) >= 0; });
    }
    rows = rows.slice(0, 60);
    // Starred players float to the top of the list, in queue order.
    if (SIM.queue.length) {
        var qOrder = {};
        SIM.queue.forEach(function (id, i) { qOrder[id] = i + 1; });
        rows = rows.slice().sort(function (a, b) {
            var qa = qOrder[a.id] || 1e9, qb = qOrder[b.id] || 1e9;
            return qa !== qb ? qa - qb : a.rank - b.rank;
        });
    }
    // Tier rules between rows, so you can see where the shelves break.
    // Skipped while the queue floats players out of board order.
    var lastTier = 0;
    var showTiers = !SIM.queue.length;
    body.innerHTML = '<div class="ba-controls">' +
        '<input class="ba-search" id="ba-search" placeholder="Find a player" value="' + esc(SIM.baQuery) + '">' +
        '<div class="ba-pos" id="ba-pos">' + ['ALL'].concat(POS_ORDER).map(function (p) {
            return '<button data-pos="' + p + '" class="' + (SIM.baPos === p ? 'active' : '') + '">' + p + '</button>';
        }).join('') + '</div></div>' +
        rows.map(function (p) {
            var rule = '';
            if (showTiers && p.tierNo && p.tierNo !== lastTier) {
                rule = '<div class="tier-rule"><span>Tier ' + p.tierNo + '</span></div>';
                lastTier = p.tierNo;
            }
            var range = spreadRange(p);
            var starred = SIM.queue.indexOf(p.id) >= 0;
            // Position lives in the colored chip alone; the meta line stays
            // short so it never wraps in the narrow rail.
            var meta = [];
            if (p.team) meta.push(esc(p.team));
            if (p.tier) meta.push(esc(p.tier));
            if (range) meta.push('<span style="color:var(--an-accent)">' + range.lo + '-' + range.hi + '</span>');
            return rule + '<div class="ba-row' + (userTurn ? ' pickable' : '') + '" data-pid="' + esc(p.id) + '" title="' + esc(spreadTitle(p)) + '">' +
                '<span class="ba-rank">' + p.rank + '</span>' +
                '<img class="ba-head" src="' + headThumb(p.id) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
                '<div class="ba-main"><div class="ba-name">' + esc(p.name) + '</div>' +
                '<div class="ba-meta">' + meta.join(' · ') + '</div></div>' +
                posChip(p.pos) +
                '<button class="ba-star' + (starred ? ' on' : '') + '" data-star="' + esc(p.id) + '" title="' + (starred ? 'Drop from your queue' : 'Star for your queue') + '">' + (starred ? '★' : '☆') + '</button>' +
                (userTurn ? '<span class="ba-draft">Draft</span>' : '') +
                '</div>';
        }).join('');
    document.getElementById('ba-search').addEventListener('input', function (e) {
        SIM.baQuery = e.target.value;
        var scroll = body.scrollTop;
        renderRailBA(body);
        var input = document.getElementById('ba-search');
        input.focus(); input.setSelectionRange(input.value.length, input.value.length);
        body.scrollTop = scroll;
    });
    document.getElementById('ba-pos').addEventListener('click', function (e) {
        var v = e.target.getAttribute && e.target.getAttribute('data-pos');
        if (!v) return;
        SIM.baPos = v; renderRailBA(body);
    });
    body.querySelectorAll('.ba-star').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var pid = btn.getAttribute('data-star');
            var at = SIM.queue.indexOf(pid);
            if (at >= 0) SIM.queue.splice(at, 1);
            else SIM.queue.push(pid);
            var scroll = body.scrollTop;
            renderRailBA(body);
            body.scrollTop = scroll;
            renderWarRoom();   // keep the war room's queue in step
        });
    });
    if (userTurn) {
        body.querySelectorAll('.ba-row').forEach(function (row) {
            row.addEventListener('click', function (e) {
                if (e.target.closest && e.target.closest('.ba-star')) return;
                draftAsUser(row.getAttribute('data-pid'));
            });
        });
    }
}
function starterSlots() {
    var slots = MOCK.meta.slots || { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 };
    var order = [];
    ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SFLEX', 'K', 'DEF'].forEach(function (s) {
        for (var i = 0; i < (slots[s] || 0); i++) order.push(s);
    });
    return order;
}
function assignLineup(players) {
    var elig = {
        QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], K: ['K'], DEF: ['DEF'],
        FLEX: ['RB', 'WR', 'TE'], SFLEX: ['QB', 'RB', 'WR', 'TE'],
    };
    var used = {};
    var rows = [];
    var pool = players.slice();  // board order = value order within the roster
    starterSlots().forEach(function (slot) {
        var found = null;
        for (var i = 0; i < pool.length; i++) {
            var p = pool[i];
            if (used[p.id]) continue;
            if ((elig[slot] || []).indexOf(p.pos) >= 0) { found = p; break; }
        }
        if (found) used[found.id] = true;
        rows.push({ slot: slot, player: found });
    });
    var bench = pool.filter(function (p) { return !used[p.id]; });
    return { starters: rows, bench: bench };
}
function renderRailRosters(body) {
    var html = '<div class="ros-seat-select"><select class="mk-select" id="ros-seat" style="width:100%">' +
        CFG.order.map(function (uid) {
            var g = GHOSTS[uid];
            return '<option value="' + esc(uid) + '"' + (SIM.railSeat === uid ? ' selected' : '') + '>' +
                esc(g ? g.name : uid) + (isUser(uid) ? ' (you)' : '') + '</option>';
        }).join('') + '</select></div>';
    var roster = SIM.rosters[SIM.railSeat] || [];
    var sorted = roster.slice().sort(function (a, b) { return a.rank - b.rank; });
    var lu = assignLineup(sorted);
    html += lu.starters.map(function (r) {
        return '<div class="ros-slot-row"><span class="ros-slot">' + esc(r.slot) + '</span>' +
            (r.player
                ? '<span class="ros-player">' + esc(r.player.name) + '</span>' + posChip(r.player.pos)
                : '<span class="ros-player empty">open</span>') + '</div>';
    }).join('');
    html += lu.bench.map(function (p) {
        return '<div class="ros-slot-row"><span class="ros-slot">BN</span>' +
            '<span class="ros-player">' + esc(p.name) + '</span>' + posChip(p.pos) + '</div>';
    }).join('');
    if (!roster.length) html += '<div class="mk-plate" style="padding:2rem 1rem">No picks yet.</div>';
    body.innerHTML = html;
    document.getElementById('ros-seat').addEventListener('change', function (e) {
        SIM.railSeat = e.target.value; renderRailRosters(body);
    });
}
function renderRailLog(body) {
    if (!SIM.picks.length) {
        body.innerHTML = '<div class="mk-plate" style="padding:2rem 1rem">Nothing on the wire yet.</div>';
        return;
    }
    body.innerHTML = '<div id="log-list">' + SIM.picks.slice().reverse().map(logRow).join('') + '</div>';
}
function posRunLength(pick) {
    var at = SIM.picks.indexOf(pick);
    if (at < 0) return 0;
    var n = 0;
    for (var i = at; i >= 0; i--) {
        if (SIM.picks[i].player.pos !== pick.player.pos) break;
        n++;
    }
    return n;
}
function logRow(pick) {
    var g = GHOSTS[pick.uid];
    var diff = pick.boardRank - pick.overall;   // positive = slid to them
    var run = posRunLength(pick);
    var flavor = '';
    if (pick.fav) flavor = '<span class="log-flavor">The reunion: drafted him ' + pick.fav + ' times before.</span>';
    else if (diff >= 15) flavor = '<span class="log-flavor slide">A gift. Board had him ' + diff + ' spots earlier.</span>';
    else if (diff <= -15) flavor = '<span class="log-flavor reach">A reach. ' + Math.abs(diff) + ' spots early.</span>';
    else if (run >= 3) flavor = '<span class="log-flavor">That is ' + run + ' straight ' + esc(pick.player.pos) + 's. A run is on.</span>';
    return '<div class="log-row"><span class="log-pick">' + pick.round + '.' + (pick.roundPick < 10 ? '0' : '') + pick.roundPick + '</span>' +
        '<span class="log-body"><b>' + esc(g ? g.name : pick.uid) + '</b> takes ' +
        '<b>' + esc(pick.player.name) + '</b> ' + posChip(pick.player.pos) + ' ' + flavor + '</span></div>';
}
function appendLog(pick) {
    var list = document.getElementById('log-list');
    if (!list) return;
    list.insertAdjacentHTML('afterbegin', logRow(pick));
}

/* ── The projection: 300 silent drafts, then draft night ──────
   Runs the ghost engine headless (no DOM, no user seats) to build the
   odds, then deals ONE more draft from those same odds and calls it like
   draft night: every seat announced on the podium, every pick revealed
   on a beat, the printed sheet filling in below. Because the walk is
   sampled — not the top of each distribution — every run breaks
   different, the way the ghosts actually would. Enter jumps a pick,
   Esc prints the whole sheet. */
var PROJ_SIMS = 300;
var PROJ_ROUNDS = 3;
var PROJ = null;       // { walk, agg, at, phase, stamped, timer, paused, done }
var projKeys = null;

function headlessSim(rounds) {
    var ctx = { overall: 1, posCounts: {} };
    CFG.order.forEach(function (u) { ctx.posCounts[u] = {}; });
    var taken = {};
    var picks = [];
    var total = CFG.order.length * rounds;
    for (var o = 1; o <= total; o++) {
        ctx.overall = o;
        var seat = seatFor(o);
        var av = BOARD.players.filter(function (p) { return !taken[p.id]; });
        var p = ghostPick(seat.uid, seat.round, av, ctx);
        if (!p) break;
        var before = {};
        Object.keys(ctx.posCounts[seat.uid]).forEach(function (k) { before[k] = ctx.posCounts[seat.uid][k]; });
        taken[p.id] = true;
        ctx.posCounts[seat.uid][p.pos] = (ctx.posCounts[seat.uid][p.pos] || 0) + 1;
        picks.push({ overall: o, round: seat.round, roundPick: seat.roundPick, uid: seat.uid, player: p, before: before });
    }
    return picks;
}

function explainPick(pk) {
    var g = GHOSTS[pk.uid] || {};
    var p = pk.player;
    var counts = pk.before;
    var fav = 0;
    (g.favorites || []).forEach(function (f) { if (normName(f.name) === p.norm) fav = f.count; });
    var r1 = (g.r1 || {})[p.pos] || 0;
    var bucket = bucketFor(pk.round);
    var share = ((g.buckets || {})[bucket] || {})[p.pos] || 0;
    var diff = p.rank - pk.overall;   // positive = value fell to them

    if (pk.overall === 1 && p.rank === 1) return 'The consensus best player this year. Easy pick.';
    if (pk.round === 1 && diff >= 0 && p.rank <= 5) {
        var bpa = [
            'Best player available by every book in the room.',
            'The board says take him and the ghost agrees.',
            'Top-shelf chalk. Nobody overthinks it.',
        ];
        return bpa[pk.overall % bpa.length];
    }
    if (fav >= 2) return esc(g.name) + ' has drafted him ' + fav + ' times. The reunion writes itself.';
    var sLine = stratExplain(scriptFor(pk.uid), p.pos, pk.round, counts);
    if (sLine) return sLine;
    if (pk.round === 1 && r1 >= 0.45) return 'Opens ' + p.pos + ' ' + pct(r1) + ' of the time. The ghost stays in character.';
    if (share >= 0.45) return 'Goes ' + p.pos + ' ' + pct(share) + ' of the time in the ' + bucket + ' rounds.';
    if (diff >= 8) return 'A slide. The board had him ' + diff + ' spots earlier; someone had to take the value.';
    if (diff <= -5) return 'A small reach, but this seat has history taking ' + p.pos + ' right about here.';
    if (!counts[p.pos]) return 'First ' + p.pos + ' in the building. Roster math as much as taste.';
    return 'Best available at a spot the roster still needs.';
}

function projStat(pk, agg) {
    var slot = agg.slots[pk.overall] || {};
    var herePct = Math.round((slot[pk.player.id] || 0) / PROJ_SIMS * 100);
    var slots = (agg.playerSlots[pk.player.id] || []).slice().sort(function (a, b) { return a - b; });
    var range = '';
    if (slots.length >= 10) {
        var lo = slots[Math.floor(slots.length * 0.1)];
        var hi = slots[Math.floor(slots.length * 0.9)];
        if (lo !== hi) range = ' · usually goes ' + lo + '-' + hi;
    }
    var altId = null, altN = 0;
    Object.keys(slot).forEach(function (id) {
        if (id !== pk.player.id && slot[id] > altN) { altN = slot[id]; altId = id; }
    });
    var alt = '';
    if (altId && altN / PROJ_SIMS >= 0.12) {
        var ap = BOARD.players.find(function (x) { return x.id === altId; });
        if (ap) alt = ' · the room also likes ' + esc(ap.name) + ' (' + Math.round(altN / PROJ_SIMS * 100) + '%)';
    }
    return 'lands here in ' + herePct + '% of sims' + range + alt;
}

function stopProjTimer() { if (PROJ && PROJ.timer) { clearTimeout(PROJ.timer); PROJ.timer = null; } }
function closeProj() {
    stopProjTimer();
    if (projKeys) { document.removeEventListener('keydown', projKeys); projKeys = null; }
    PROJ = null;
}

// The night's pacing: a long "on the clock" beat so the suspense lands,
// then a shorter dwell on the revealed pick before the next seat comes
// up. Round one gets the full ceremony; later rounds pick up the tempo
// the way real nights do.
var PROJ_BEAT = { clock: 2200, dwell: 1650 };
function projBeat(kind, round) {
    var tempo = round <= 1 ? 1 : round === 2 ? 0.85 : 0.7;
    return Math.round(PROJ_BEAT[kind] * tempo);
}

function renderProjection() {
    if (!BOARD) return;
    stopTimer();
    closeProj();
    SIM = null;
    renderWarRoom();   // the overlay lives on <body>; drop it on scene change
    app.innerHTML = '<div class="loading-state">Running ' + PROJ_SIMS + ' silent drafts…</div>';
    setTimeout(function () {
        var agg = { slots: {}, playerSlots: {} };
        for (var s = 0; s < PROJ_SIMS; s++) {
            headlessSim(PROJ_ROUNDS).forEach(function (pk) {
                var slot = agg.slots[pk.overall] || (agg.slots[pk.overall] = {});
                slot[pk.player.id] = (slot[pk.player.id] || 0) + 1;
                (agg.playerSlots[pk.player.id] || (agg.playerSlots[pk.player.id] = [])).push(pk.overall);
            });
        }
        // The 301st draft is the one that gets called on the podium.
        PROJ = {
            walk: headlessSim(PROJ_ROUNDS),
            agg: agg,
            at: -1,             // index of the pick on the podium
            phase: 'reveal',    // 'clock' (announcing) | 'reveal' (pick shown)
            stamped: 0,         // picks printed on the sheet so far
            timer: null,
            paused: false,
            done: false,
        };
        paintProjStage();
        projStep();
    }, 40);
}

function paintProjStage() {
    var roundNames = ['Round One', 'Round Two', 'Round Three'];
    var scripts = CFG.order.filter(function (u) { return scriptFor(u); }).map(function (u) {
        var fromFilm = CFG.strats[u] == null || CFG.strats[u] === 'auto';
        return esc(GHOSTS[u] ? GHOSTS[u].name : u) + ' runs ' + STRATS[scriptFor(u)].label + (fromFilm ? ' (film)' : '');
    });

    var html = '<div class="mk-card proj-desk" id="proj-desk">' +
        '<div class="pd-top">' +
        '<span class="clock-pick" id="pd-pick"></span>' +
        '<span class="pd-status" id="pd-status">Draft night, dealt from the odds.</span>' +
        '<span class="clock-controls">' +
        '<button class="mk-btn" id="proj-pause">Pause</button>' +
        '<button class="mk-btn" id="proj-next" title="Jump to the next pick. Enter works too.">Next pick</button>' +
        '<button class="mk-btn gold" id="proj-skip" title="Skip the ceremony and print every pick now. Esc works too.">Print the full sheet</button>' +
        '<button class="mk-btn" id="proj-exit">Back to setup</button>' +
        '</span></div>' +
        '<div class="pd-stage" id="pd-stage"></div></div>';

    html += '<div class="board-bind">' +
        '<div class="board-bind-label"><span>★ The Projection · draft night</span>' +
        '<small id="proj-progress">' + PROJ_SIMS + ' drafts · ghosts on ' + esc(CFG.chaos) + ' · ' + esc(BOARD.label) + '</small></div>' +
        '<div class="proj-paper">' +
        '<div class="proj-head"><div class="proj-kicker">' + PROJ_SIMS + ' silent drafts · one night dealt from the odds</div>' +
        '<div class="proj-title">The <em>Projection.</em></div>' +
        '<div class="proj-note">How draft night falls when every ghost plays its real odds. ' +
        'The fine print under each pick is how often that landing came up across the field' +
        (scripts.length ? '. Scripts in play: ' + scripts.join(', ') : '') + '.</div></div>' +
        '<div class="proj-grid">' +
        Array.from({ length: PROJ_ROUNDS }, function (_, r) {
            return '<div><div class="proj-round-head">' + (roundNames[r] || ('Round ' + (r + 1))) + '</div>' +
                '<div id="proj-col-' + (r + 1) + '"></div></div>';
        }).join('') + '</div></div></div>';

    html += '<div class="proj-actions" id="proj-final" style="display:none">' +
        '<button class="mk-btn primary" id="proj-open">Open the draft room</button>' +
        '<button class="mk-btn gold" id="proj-save">Save to the Vault</button>' +
        '<button class="mk-btn" id="proj-again">Run it again</button>' +
        '<button class="mk-btn" id="proj-back">Back to setup</button></div>';
    app.innerHTML = html;

    document.getElementById('proj-pause').addEventListener('click', function () {
        if (!PROJ || PROJ.done) return;
        PROJ.paused = !PROJ.paused;
        this.textContent = PROJ.paused ? 'Resume' : 'Pause';
        this.classList.toggle('gold', PROJ.paused);
        if (PROJ.paused) stopProjTimer();
        else projStep();
    });
    document.getElementById('proj-next').addEventListener('click', projAdvance);
    document.getElementById('proj-skip').addEventListener('click', projSkip);
    document.getElementById('proj-exit').addEventListener('click', renderSetup);
    document.getElementById('proj-open').addEventListener('click', openRoom);
    document.getElementById('proj-again').addEventListener('click', renderProjection);
    document.getElementById('proj-back').addEventListener('click', renderSetup);
    document.getElementById('proj-save').addEventListener('click', function () {
        if (!PROJ || !PROJ.done) return;
        if (saveProjectionToVault()) { this.textContent = 'Saved to the Vault ★'; this.disabled = true; }
        else { this.textContent = 'Storage is full'; this.disabled = true; }
    });

    projKeys = function (e) {
        if (!PROJ || PROJ.done) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); projAdvance(); }
        else if (e.key === 'Escape') { e.preventDefault(); projSkip(); }
    };
    document.addEventListener('keydown', projKeys);
}

// One beat of the ceremony: announce the seat, then reveal its pick.
function projStep() {
    stopProjTimer();
    if (!PROJ || PROJ.done || PROJ.paused) return;
    if (PROJ.phase === 'clock') {
        PROJ.phase = 'reveal';
        paintPodium();
        stampNext();
        PROJ.timer = setTimeout(projStep, projBeat('dwell', PROJ.walk[PROJ.at].round));
    } else {
        if (PROJ.at + 1 >= PROJ.walk.length) return projFinish();
        PROJ.at++;
        PROJ.phase = 'clock';
        paintPodium();
        PROJ.timer = setTimeout(projStep, projBeat('clock', PROJ.walk[PROJ.at].round));
    }
}

// The Next button: straight to the next reveal, no waiting.
function projAdvance() {
    if (!PROJ || PROJ.done) return;
    stopProjTimer();
    PROJ.paused = false;
    var pauseBtn = document.getElementById('proj-pause');
    if (pauseBtn) { pauseBtn.textContent = 'Pause'; pauseBtn.classList.remove('gold'); }
    if (PROJ.phase === 'clock') return projStep();   // reveal the announced pick now
    if (PROJ.at + 1 >= PROJ.walk.length) return projFinish();
    PROJ.at++;
    PROJ.phase = 'clock';
    projStep();   // skip the announce beat entirely
}

function projSkip() {
    if (!PROJ || PROJ.done) return;
    projFinish();
}

function pdAvatar(uid) {
    var url = AVATARS[uid];
    return url
        ? '<img class="pd-avatar" src="' + esc(url) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">'
        : '';
}

function paintPodium() {
    var stage = document.getElementById('pd-stage');
    var desk = document.getElementById('proj-desk');
    if (!stage || !desk || !PROJ) return;
    var pk = PROJ.walk[PROJ.at];
    if (!pk) return;
    var g = GHOSTS[pk.uid];
    var name = g ? g.name : pk.uid;
    document.getElementById('pd-pick').textContent =
        'R' + pk.round + ' · P' + pk.roundPick + ' · pick ' + pk.overall + ' of ' + PROJ.walk.length;
    var status = document.getElementById('pd-status');
    if (PROJ.phase === 'clock') {
        desk.classList.add('on-clock');
        if (status) status.textContent = 'The card is coming to the podium…';
        stage.innerHTML = '<div class="pd-clock">' + pdAvatar(pk.uid) +
            '<div class="pd-clockname">' + esc(name) +
            ' <span class="pd-ell">is on the clock<span>.</span><span>.</span><span>.</span></span></div>' +
            '<div class="pd-flavor">' + ghostLine(g || {}) + '</div></div>';
    } else {
        desk.classList.remove('on-clock');
        if (status) status.textContent = 'The pick is in.';
        var p = pk.player;
        var c = POS_COLORS[p.pos] || { text: '#8a7a60' };
        stage.innerHTML = '<div class="pd-reveal">' +
            '<div class="pd-selline">With the ' + ordinal(pk.overall) + ' pick, <b>' + esc(name) + '</b> selects</div>' +
            '<div class="pd-card">' +
            '<img class="pd-headshot" style="--pos:' + c.text + '" src="' + headThumb(p.id) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
            '<div><div class="pd-name">' + esc(p.name) + '</div>' +
            '<div class="pd-meta" style="color:' + c.text + '">' + esc(p.pos) +
            (p.team ? ' · ' + esc(p.team) : '') + ' · board #' + p.rank + '</div></div></div>' +
            '<div class="pd-why">' + explainPick(pk) + '</div>' +
            '<div class="pd-stat">' + projStat(pk, PROJ.agg) + '</div></div>';
    }
}

// Print the next pick onto the paper sheet below the podium.
function stampNext() {
    if (!PROJ) return;
    var pk = PROJ.walk[PROJ.stamped];
    if (!pk) return;
    PROJ.stamped++;
    var col = document.getElementById('proj-col-' + pk.round);
    if (!col) return;
    var prev = document.querySelector('.proj-pick.fresh');
    if (prev) prev.classList.remove('fresh');
    var g = GHOSTS[pk.uid];
    var c = POS_COLORS[pk.player.pos] || { cell: '#57503f' };
    col.insertAdjacentHTML('beforeend', '<div class="proj-pick fresh">' +
        '<div class="proj-pick-top"><span class="proj-num">' + pk.round + '.' + (pk.roundPick < 10 ? '0' : '') + pk.roundPick + '</span>' +
        '<span class="proj-player">' + esc(pk.player.name) + '</span>' +
        '<span class="proj-pos" style="background:' + c.cell + '">' + esc(pk.player.pos) + '</span></div>' +
        '<div class="proj-mgr">' + esc(g ? g.name : pk.uid) + '</div>' +
        '<div class="proj-line">' + explainPick(pk) + '</div>' +
        '<div class="proj-stat">' + projStat(pk, PROJ.agg) + '</div></div>');
    var prog = document.getElementById('proj-progress');
    if (prog) {
        prog.textContent = 'Pick ' + PROJ.stamped + ' of ' + PROJ.walk.length + ' · ' +
            PROJ_SIMS + ' drafts · ghosts on ' + CFG.chaos + ' · ' + BOARD.label;
    }
}

function projFinish() {
    if (!PROJ || PROJ.done) return;
    stopProjTimer();
    while (PROJ.stamped < PROJ.walk.length) stampNext();
    PROJ.done = true;
    var fresh = document.querySelector('.proj-pick.fresh');
    if (fresh) fresh.classList.remove('fresh');
    var desk = document.getElementById('proj-desk');
    if (desk) desk.classList.remove('on-clock');
    var pickEl = document.getElementById('pd-pick');
    if (pickEl) pickEl.textContent = PROJ.walk.length + ' picks called';
    var status = document.getElementById('pd-status');
    if (status) status.textContent = 'One night at the table, dealt from ' + PROJ_SIMS + ' silent drafts.';
    var stage = document.getElementById('pd-stage');
    var first = PROJ.walk[0];
    if (stage) {
        stage.innerHTML = '<div class="pd-done">' +
            '<div class="pd-clockname">That’s the draft.</div>' +
            '<div class="pd-flavor">' + (first ? esc(first.player.name) + ' first overall · ' : '') +
            'the full sheet is printed below · run it again and the night breaks different.</div></div>';
    }
    ['proj-pause', 'proj-next', 'proj-skip'].forEach(function (id) {
        var b = document.getElementById(id);
        if (b) b.style.display = 'none';
    });
    var fin = document.getElementById('proj-final');
    if (fin) fin.style.display = '';
}

/* ── Scene III: the recap ─────────────────────────────────── */
function renderRecap() {
    renderWarRoom();   // SIM.done: fold the overlay before the recap paints
    var teams = CFG.order.map(function (uid) {
        var roster = SIM.rosters[uid] || [];
        var total = 0;
        roster.forEach(function (p) { total += p.value; });
        var best = null;
        SIM.picks.forEach(function (pk) {
            if (pk.uid !== uid) return;
            var diff = pk.boardRank != null ? (pk.overall - pk.boardRank) : 0;
            if (pk.player.pos === 'K' || pk.player.pos === 'DEF') return;
            if (!best || diff > best.diff) best = { pick: pk, diff: diff };
        });
        return { uid: uid, total: total, best: best };
    });
    var sorted = teams.slice().sort(function (a, b) { return b.total - a.total; });
    var rankOf = {};
    sorted.forEach(function (t, i) { rankOf[t.uid] = i + 1; });
    var grades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-'];
    function gradeFor(rank) {
        var slot = Math.floor((rank - 1) / Math.max(1, teams.length) * grades.length);
        return grades[Math.min(slot, grades.length - 1)];
    }

    var html = '<div class="recap-head"><div class="recap-title">The board is <em>set.</em></div>' +
        '<div class="recap-sub">' + teams.length + ' teams · ' + CFG.rounds + ' rounds · rankings by ' + esc(BOARD.label) + '</div></div>';
    html += '<div class="recap-grid">' + CFG.order.map(function (uid) {
        var t = teams.find(function (x) { return x.uid === uid; });
        var g = GHOSTS[uid];
        var roster = (SIM.rosters[uid] || []).slice().sort(function (a, b) { return a.rank - b.rank; });
        var lu = assignLineup(roster);
        var verdict;
        if (t.best && t.best.diff >= 15) verdict = esc(t.best.pick.player.name) + ' at ' + t.best.pick.round + '.' + t.best.pick.roundPick + ' was the call of the day.';
        else if (rankOf[uid] === 1) verdict = 'The board loved every minute of it.';
        else if (rankOf[uid] === teams.length) verdict = 'The ghosts have questions.';
        else verdict = 'A draft the room will defend at the bar.';
        return '<div class="mk-card recap-card' + (isUser(uid) ? ' user-card' : '') + '">' +
            '<div class="recap-grade">' + gradeFor(rankOf[uid]) + '</div>' +
            '<div class="recap-card-head">' + avatarImg(uid) +
            '<div><div class="recap-card-name">' + esc(g ? g.name : uid) + (isUser(uid) ? ' · you' : '') + '</div>' +
            '<div class="recap-card-sub">board value #' + rankOf[uid] + ' of ' + teams.length + '</div></div></div>' +
            lu.starters.map(function (r) {
                return '<div class="ros-slot-row"><span class="ros-slot">' + esc(r.slot) + '</span>' +
                    (r.player
                        ? '<span class="ros-player">' + esc(r.player.name) + '</span>' + posChip(r.player.pos)
                        : '<span class="ros-player empty">open</span>') + '</div>';
            }).join('') +
            '<div class="recap-verdict">' + verdict + '</div></div>';
    }).join('') + '</div>';
    html += '<div class="recap-actions">' +
        '<button class="mk-btn primary" id="recap-again">Run it back</button>' +
        '<button class="mk-btn gold" id="recap-save">Save to the Vault</button>' +
        '<button class="mk-btn" id="recap-setup">New setup</button></div>';
    app.innerHTML = html;
    document.getElementById('recap-again').addEventListener('click', function () {
        openRoom();
    });
    document.getElementById('recap-setup').addEventListener('click', renderSetup);
    document.getElementById('recap-save').addEventListener('click', function () {
        if (!SIM || !SIM.done) return;
        if (saveMockToVault()) { this.textContent = 'Saved to the Vault ★'; this.disabled = true; }
        else { this.textContent = 'Storage is full'; this.disabled = true; }
    });
}

/* ── The Vault: saved nights ──────────────────────────────────
   Finished projections and mock drafts, kept in localStorage per
   league and reopened read-only from the setup desk. Each entry
   snapshots the picks (with the reasoning lines for projections),
   the seat order, and the names as they were that night. */
var VAULT_KEY = 'tsc-mock-vault:' + ((window.__DC && (window.__DC.id || window.__DC.slug)) || 'league');
var VAULT_MAX = 12;

function vaultList() {
    try { return JSON.parse(localStorage.getItem(VAULT_KEY) || '[]') || []; }
    catch (e) { return []; }
}
function vaultWrite(list) {
    try { localStorage.setItem(VAULT_KEY, JSON.stringify(list)); return true; }
    catch (e) { return false; }
}
function vaultSave(entry) {
    var list = vaultList();
    list.unshift(entry);
    while (list.length > VAULT_MAX) list.pop();
    return vaultWrite(list);
}
function vaultDelete(id) {
    vaultWrite(vaultList().filter(function (e) { return e.id !== id; }));
}
function vaultWhen(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' +
        d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function buildVaultBase(kind) {
    var names = {};
    CFG.order.forEach(function (u) { names[u] = GHOSTS[u] ? GHOSTS[u].name : String(u); });
    return {
        id: 'v' + Date.now() + '-' + Math.floor(Math.random() * 1e4),
        kind: kind,
        at: Date.now(),
        label: BOARD ? BOARD.label : '',
        chaos: CFG.chaos,
        order: CFG.order.slice(),
        seats: CFG.seats.slice(),
        names: names,
    };
}
function saveProjectionToVault() {
    if (!PROJ || !PROJ.walk.length) return false;
    var e = buildVaultBase('projection');
    e.picks = PROJ.walk.map(function (pk) {
        return {
            o: pk.overall, r: pk.round, rp: pk.roundPick, uid: pk.uid,
            pid: pk.player.id, name: pk.player.name, pos: pk.player.pos,
            team: pk.player.team, rank: pk.player.rank, value: pk.player.value || 0,
            line: explainPick(pk), stat: projStat(pk, PROJ.agg),
        };
    });
    return vaultSave(e);
}
function saveMockToVault() {
    if (!SIM || !SIM.picks.length) return false;
    var e = buildVaultBase('mock');
    e.rounds = CFG.rounds;
    e.picks = SIM.picks.map(function (pk) {
        return {
            o: pk.overall, r: pk.round, rp: pk.roundPick, uid: pk.uid,
            pid: pk.player.id, name: pk.player.name, pos: pk.player.pos,
            team: pk.player.team, rank: pk.player.rank, value: pk.player.value || 0,
        };
    });
    return vaultSave(e);
}
function vaultName(entry, uid) {
    return (entry.names && entry.names[uid]) || (GHOSTS[uid] ? GHOSTS[uid].name : String(uid));
}
function vaultStripHtml() {
    var list = vaultList();
    if (!list.length) return '';
    return '<div class="vault-strip"><div class="mk-label">★ The Vault · saved nights, reopened any time</div>' +
        '<div class="mk-card vault-list">' + list.map(function (e) {
            return '<div class="vault-row">' +
                '<span class="vault-kind">' + (e.kind === 'projection' ? 'Projection' : 'Mock draft') + '</span>' +
                '<span class="vault-when">' + esc(vaultWhen(e.at)) + '</span>' +
                '<span class="vault-meta">' + esc(e.label || '') + ' · ghosts on ' + esc(e.chaos || 'human') +
                ' · ' + e.picks.length + ' picks</span>' +
                '<button class="mk-btn" data-vault-open="' + esc(e.id) + '">Open</button>' +
                '<button class="vault-del" data-vault-del="' + esc(e.id) + '" title="Remove from the Vault">×</button>' +
                '</div>';
        }).join('') + '</div></div>';
}
function bindVault() {
    app.querySelectorAll('[data-vault-open]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-vault-open');
            var entry = vaultList().find(function (x) { return x.id === id; });
            if (entry) renderVaultView(entry);
        });
    });
    app.querySelectorAll('[data-vault-del]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            vaultDelete(btn.getAttribute('data-vault-del'));
            renderSetup();
        });
    });
}

function renderVaultView(entry) {
    stopTimer();
    closeProj();
    SIM = null;
    renderWarRoom();
    var kindLabel = entry.kind === 'projection' ? 'The Projection' : 'Mock draft';
    var html = '<div class="mk-card proj-desk"><div class="pd-top">' +
        '<span class="clock-pick">★ From the Vault</span>' +
        '<span class="pd-status">' + kindLabel + ' · saved ' + esc(vaultWhen(entry.at)) +
        (entry.label ? ' · ' + esc(entry.label) : '') + ' · ghosts on ' + esc(entry.chaos || 'human') + '</span>' +
        '<span class="clock-controls">' +
        '<button class="mk-btn" id="vault-back">Back to setup</button>' +
        '<button class="mk-btn" id="vault-remove">Remove</button>' +
        '</span></div></div>';

    html += '<div class="vault-body">' +
        (entry.kind === 'projection' ? vaultProjectionHtml(entry) : vaultMockHtml(entry)) +
        '</div>';
    app.innerHTML = html;
    document.getElementById('vault-back').addEventListener('click', renderSetup);
    document.getElementById('vault-remove').addEventListener('click', function () {
        vaultDelete(entry.id);
        renderSetup();
    });
}

/* A saved projection re-prints its sheet exactly as it fell that night. */
function vaultProjectionHtml(entry) {
    var roundNames = ['Round One', 'Round Two', 'Round Three'];
    var byRound = {};
    entry.picks.forEach(function (pk) { (byRound[pk.r] || (byRound[pk.r] = [])).push(pk); });
    return '<div class="board-bind">' +
        '<div class="board-bind-label"><span>★ The Projection</span><small>' +
        entry.picks.length + ' picks · saved ' + esc(vaultWhen(entry.at)) + '</small></div>' +
        '<div class="proj-paper">' +
        '<div class="proj-head"><div class="proj-kicker">From the Vault · one night as it fell</div>' +
        '<div class="proj-title">The <em>Projection.</em></div></div>' +
        '<div class="proj-grid">' +
        Object.keys(byRound).map(function (r) {
            return '<div><div class="proj-round-head">' + (roundNames[r - 1] || ('Round ' + r)) + '</div>' +
                byRound[r].map(function (pk) {
                    var c = POS_COLORS[pk.pos] || { cell: '#57503f' };
                    return '<div class="proj-pick">' +
                        '<div class="proj-pick-top"><span class="proj-num">' + pk.r + '.' + (pk.rp < 10 ? '0' : '') + pk.rp + '</span>' +
                        '<span class="proj-player">' + esc(pk.name) + '</span>' +
                        '<span class="proj-pos" style="background:' + c.cell + '">' + esc(pk.pos) + '</span></div>' +
                        '<div class="proj-mgr">' + esc(vaultName(entry, pk.uid)) + '</div>' +
                        (pk.line ? '<div class="proj-line">' + pk.line + '</div>' : '') +
                        (pk.stat ? '<div class="proj-stat">' + pk.stat + '</div>' : '') +
                        '</div>';
                }).join('') + '</div>';
        }).join('') + '</div></div></div>';
}

/* A saved mock reopens as its recap (grades recomputed from the stored
   board values) plus the full wire, pick by pick. */
function vaultMockHtml(entry) {
    var teams = entry.order.map(function (uid) {
        var roster = entry.picks.filter(function (pk) { return pk.uid === uid; });
        var total = 0;
        roster.forEach(function (pk) { total += pk.value || 0; });
        var best = null;
        roster.forEach(function (pk) {
            if (pk.pos === 'K' || pk.pos === 'DEF') return;
            var diff = pk.o - pk.rank;
            if (!best || diff > best.diff) best = { pk: pk, diff: diff };
        });
        return { uid: uid, total: total, best: best, roster: roster };
    });
    var sorted = teams.slice().sort(function (a, b) { return b.total - a.total; });
    var rankOf = {};
    sorted.forEach(function (t, i) { rankOf[t.uid] = i + 1; });
    var grades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-'];
    function gradeFor(rank) {
        var slot = Math.floor((rank - 1) / Math.max(1, teams.length) * grades.length);
        return grades[Math.min(slot, grades.length - 1)];
    }
    var wasUser = function (uid) { return (entry.seats || []).indexOf(uid) >= 0; };

    var html = '<div class="recap-head"><div class="recap-title">The board, <em>as it was.</em></div>' +
        '<div class="recap-sub">' + teams.length + ' teams · ' + (entry.rounds || '?') + ' rounds' +
        (entry.label ? ' · rankings by ' + esc(entry.label) : '') + '</div></div>';
    html += '<div class="recap-grid">' + entry.order.map(function (uid) {
        var t = teams.find(function (x) { return x.uid === uid; });
        var roster = t.roster.slice().sort(function (a, b) { return a.rank - b.rank; })
            .map(function (pk) { return { id: pk.pid, name: pk.name, pos: pk.pos, rank: pk.rank }; });
        var lu = assignLineup(roster);
        var verdict;
        if (t.best && t.best.diff >= 15) verdict = esc(t.best.pk.name) + ' at ' + t.best.pk.r + '.' + t.best.pk.rp + ' was the call of the day.';
        else if (rankOf[uid] === 1) verdict = 'The board loved every minute of it.';
        else if (rankOf[uid] === teams.length) verdict = 'The ghosts have questions.';
        else verdict = 'A draft the room will defend at the bar.';
        return '<div class="mk-card recap-card' + (wasUser(uid) ? ' user-card' : '') + '">' +
            '<div class="recap-grade">' + gradeFor(rankOf[uid]) + '</div>' +
            '<div class="recap-card-head">' + avatarImg(uid) +
            '<div><div class="recap-card-name">' + esc(vaultName(entry, uid)) + (wasUser(uid) ? ' · you' : '') + '</div>' +
            '<div class="recap-card-sub">board value #' + rankOf[uid] + ' of ' + teams.length + '</div></div></div>' +
            lu.starters.map(function (r) {
                return '<div class="ros-slot-row"><span class="ros-slot">' + esc(r.slot) + '</span>' +
                    (r.player
                        ? '<span class="ros-player">' + esc(r.player.name) + '</span>' + posChip(r.player.pos)
                        : '<span class="ros-player empty">open</span>') + '</div>';
            }).join('') +
            '<div class="recap-verdict">' + verdict + '</div></div>';
    }).join('') + '</div>';

    html += '<div class="mk-card vault-log">' + entry.picks.map(function (pk) {
        return '<div class="log-row"><span class="log-pick">' + pk.r + '.' + (pk.rp < 10 ? '0' : '') + pk.rp + '</span>' +
            '<span class="log-body"><b>' + esc(vaultName(entry, pk.uid)) + '</b> takes ' +
            '<b>' + esc(pk.name) + '</b> ' + posChip(pk.pos) + '</span></div>';
    }).join('') + '</div>';
    return html;
}

})();
