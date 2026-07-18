// Offline harness for the pams draft grader. Extracts the scoring code
// verbatim from the template and replays it on the static old/pams snapshot.
const fs = require('fs');
const path = require('path');

const TPL = '/Users/jojo/Desktop/jzff/tsc/src/templates/pams/draft/index.html';
const DRAFTS = '/Users/jojo/Desktop/jzff/tsc/public/old/pams/data/drafts';
const RANKS = '/Users/jojo/Desktop/jzff/tsc/public/data/fantasy_ranks/ppr_6pt';

const html = fs.readFileSync(TPL, 'utf8');
const start = html.indexOf('var GRADER_POS');
const end = html.indexOf('// Entry point (kept the original name');
if (start < 0 || end < 0 || end <= start) throw new Error('extract markers not found');
const graderSrc = html.slice(start, end);

function normName(name) {
    return (name || '').toLowerCase()
        .replace(/[.''']/g, '')
        .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

const YEARS = fs.readdirSync(DRAFTS)
    .filter(f => /^\d{4}\.json$/.test(f))
    .map(f => +f.slice(0, 4))
    .sort();

const LIVE_2019 = path.join(__dirname, 'live2019.json');
const yearData = {}, yearTeamCount = {}, rankData = {}, draftPosRanks = {}, yearFinishes = {};
YEARS.forEach(y => {
    const d = y === 2019
        ? JSON.parse(fs.readFileSync(LIVE_2019, 'utf8')) // live curated board (old snapshot is stale for 2019)
        : JSON.parse(fs.readFileSync(path.join(DRAFTS, y + '.json'), 'utf8'));
    yearData[y] = d.picks;
    yearTeamCount[y] = d.team_count || Math.round(d.picks.length / 15);
    yearFinishes[y] = d.finishes || {};
    const r = JSON.parse(fs.readFileSync(path.join(RANKS, y + '.json'), 'utf8'));
    const players = r.players || [];
    const byPos = {};
    players.forEach(p => {
        const pos = (p.position || '?').toUpperCase();
        (byPos[pos] = byPos[pos] || []).push(p);
    });
    Object.keys(byPos).forEach(pos => byPos[pos].sort((a, b) => (b.fpts || 0) - (a.fpts || 0)));
    const lookup = {};
    players.forEach(p => {
        const pos = (p.position || '?').toUpperCase();
        const pr = (byPos[pos] || []).findIndex(q => q.player_name === p.player_name) + 1;
        lookup[normName(p.player_name)] = {
            rank: p.rank, pos_rank: pr > 0 ? pr : null, position: pos,
            fpts: p.fpts, gp: p.gp != null ? p.gp : null, player_name: p.player_name,
        };
    });
    rankData[y] = lookup;
});
YEARS.forEach(y => {
    const byPos = {};
    yearData[y].forEach(p => {
        if (!p.manager_name) return;
        const pos = (p.position || '').toUpperCase();
        if (['QB', 'RB', 'WR', 'TE'].indexOf(pos) < 0) return;
        (byPos[pos] = byPos[pos] || []).push(p);
    });
    draftPosRanks[y] = {};
    Object.keys(byPos).forEach(pos => {
        byPos[pos].sort((a, b) => a.overall_pick - b.overall_pick);
        byPos[pos].forEach((p, i) => {
            draftPosRanks[y][normName(p.player_name)] = {
                pos_draft_rank: i + 1, position: pos, overall_pick: p.overall_pick,
                manager_name: p.manager_name, player_name: p.player_name, year: y,
            };
        });
    });
});

eval(graderSrc);

function qbPicks(g) {
    const out = [];
    g.classes.forEach(c => c.picks.forEach(p => {
        if (p.pos === 'QB') out.push({ year: c.year, mgr: c.manager, ...p });
    }));
    return out;
}

function allPicksOf(g, pos) {
    const out = [];
    g.classes.forEach(c => c.picks.forEach(p => {
        if (p.pos === pos) out.push({ year: c.year, mgr: c.manager, ...p });
    }));
    return out;
}

const withBonus = computeGrader();
const savedHeist = FLX_HEIST_W;
FLX_HEIST_W = 0;
const noBonus = computeGrader(); // baseline = before the heist premium
FLX_HEIST_W = savedHeist;

const before = {};
['QB', 'TE', 'RB', 'WR'].forEach(pos => allPicksOf(noBonus, pos).forEach(p => { before[p.year + '|' + p.player_name] = p.score; }));

console.log('=== Flex picks moved by the heist premium ===');
['RB', 'WR'].forEach(pos => allPicksOf(withBonus, pos).forEach(p => {
    const old = before[p.year + '|' + p.player_name];
    if (Math.abs(p.score - old) > 0.5) {
        console.log(`${p.year} ${p.player_name} ${p.pos}${p.pos_draft_rank}->${p.pos}${p.pos_final_rank} (FLX ${p.flex_dr}->${p.flex_fr}): ${old.toFixed(0)} -> ${p.score.toFixed(0)}`);
    }
}));
console.log('\n=== Top 15 flex scores all-time (after) ===');
allPicksOf(withBonus, 'RB').concat(allPicksOf(withBonus, 'WR'))
    .sort((a, b) => b.score - a.score).slice(0, 15).forEach(p => {
        console.log(`${p.year} ${p.player_name} FLX ${p.flex_dr}->${p.flex_fr}: ${p.score.toFixed(0)} (was ${before[p.year + '|' + p.player_name].toFixed(0)})`);
    });

const rows = qbPicks(withBonus).map(p => ({
    ...p, old: before[p.year + '|' + p.player_name],
})).sort((a, b) => (a.pos_final_rank || 99) - (b.pos_final_rank || 99));

const teRows = allPicksOf(withBonus, 'TE').map(p => ({
    ...p, old: before[p.year + '|' + p.player_name],
})).sort((a, b) => (a.pos_final_rank || 99) - (b.pos_final_rank || 99));

console.log('=== TE elite finishes (margin kicker) ===');
teRows.filter(p => p.pos_final_rank >= 1 && p.pos_final_rank <= 7 && Math.abs(p.score - p.old) > 0.5).forEach(p => {
    console.log(`${p.year} ${p.player_name} TE${p.pos_draft_rank}->TE${p.pos_final_rank}: ${p.old.toFixed(0)} -> ${p.score.toFixed(0)}`);
});

console.log('=== QB picks: finish rank 1-4 (elite step zone) ===');
rows.filter(p => p.pos_final_rank >= 1 && p.pos_final_rank <= 4).forEach(p => {
    console.log(`${p.year} ${p.player_name} QB${p.pos_draft_rank}->QB${p.pos_final_rank}: ${p.old.toFixed(0)} -> ${p.score.toFixed(0)}`);
});

console.log('\n=== QB picks: finish rank 5-7 (must be unchanged from flat-20) ===');
rows.filter(p => p.pos_final_rank >= 5 && p.pos_final_rank <= 7).forEach(p => {
    console.log(`${p.year} ${p.player_name} QB${p.pos_draft_rank}->QB${p.pos_final_rank}: ${p.old.toFixed(0)} -> ${p.score.toFixed(0)}${Math.abs(p.score - p.old) > 0.01 ? '  <-- CHANGED' : ''}`);
});

console.log('\n=== Tuned fall windows (must be unchanged) ===');
rows.filter(p => p.old < -20).forEach(p => {
    console.log(`${p.year} ${p.player_name} QB${p.pos_draft_rank}->QB${p.pos_final_rank || 'NR'}: ${p.old.toFixed(0)} -> ${p.score.toFixed(0)}${Math.abs(p.score - p.old) > 0.01 ? '  <-- CHANGED' : ''}`);
});

console.log('\n=== Ramp zone (old score between -20 and 0, starter finish) ===');
rows.filter(p => p.old >= -20 && p.old < 0).forEach(p => {
    console.log(`${p.year} ${p.player_name} QB${p.pos_draft_rank}->QB${p.pos_final_rank || 'NR'}: ${p.old.toFixed(0)} -> ${p.score.toFixed(0)}`);
});

const changed = rows.filter(p => Math.abs(p.score - p.old) > 0.01);
const teamsMax = Math.max(...Object.values(yearTeamCount));
const badGate = changed.filter(p => !p.pos_final_rank || p.pos_final_rank > teamsMax);
console.log(`\n${rows.length} QB picks, ${changed.length} bumped, max teams ${teamsMax}, bumps outside starter ranks: ${badGate.length}`);

console.log('\n=== Exemplars across the board ===');
[['Ryan Tannehill', 2019], ['Justin Herbert', 2022], ['Jalen Hurts', 2024], ['Patrick Mahomes', 2023], ['Lamar Jackson', 2020], ['Aaron Rodgers', 2020], ['Dak Prescott', 2023], ['Josh Allen', 2023]].forEach(([name, y]) => {
    const p = rows.find(r => r.player_name === name && r.year === y);
    if (p) console.log(`${p.year} ${p.player_name} QB${p.pos_draft_rank}->QB${p.pos_final_rank || 'NR'}: ${p.old.toFixed(0)} -> ${p.score.toFixed(0)}`);
});

console.log('\n=== Class ranking movement (top 10 all-time, with bonus) ===');
withBonus.classes.slice(0, 10).forEach(c => {
    const oldC = noBonus.classes.find(o => o.manager === c.manager && o.year === c.year);
    console.log(`#${c.rank} ${c.manager} ${c.year} ${c.score.toFixed(0)} (${c.grade})  was #${oldC.rank} ${oldC.score.toFixed(0)} (${oldC.grade})`);
});
const total = withBonus.classes.length;
const totalPicks = withBonus.classes.reduce((a, c) => a + c.picks.length, 0);
console.log(`\n${total} classes, ${totalPicks} picks total`);

console.log('\n=== Rounded-score class ties (within a year) ===');
Object.keys(withBonus.classesByYear).forEach(y => {
    const l = withBonus.classesByYear[y];
    for (let i = 0; i < l.length - 1; i++) {
        if (Math.round(l[i].score) === Math.round(l[i + 1].score)) {
            [l[i], l[i + 1]].forEach(c => console.log(
                `${y} ${c.manager}: score ${c.score.toFixed(2)} (${Math.round(c.score)}), +picks ${c.posPicks}, best pick ${Math.round(c.picks[0].score)} -> ${ordinalish(c.yearRank)} of year`));
        }
    }
});
function ordinalish(n) { return n + (['th','st','nd','rd'][((n % 100) - 20) % 10] || ['th','st','nd','rd'][n % 100] || 'th'); }

console.log('\n=== Drafters board (ledger order) ===');
withBonus.drafters.forEach((d, i) => {
    console.log(`#${i + 1} ${d.manager}: avg ${d.avgRank.toFixed(3)}, best ${d.best}, ${d.classes} classes, career ${Math.round(d.totalScore)}${d.qualified ? '' : ' (provisional)'}`);
});
