#!/usr/bin/env node
// ── build_seasons.mjs ─────────────────────────────────────────────────────
// Writes source/seasons.json: every PAMS season 2019-2025, per manager, from
// TSC's own database rather than from a hand-built dossier.
//
//   node build_seasons.mjs          (from tsc/public/draftday)
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY out of
// tsc/.env.local and talks to PostgREST directly, so it needs no packages and
// no dev server. The output is vendored into source/ like the drafts are:
// completed seasons never change, and draft night must not depend on a
// database being reachable.
//
// ── why this file exists ─────────────────────────────────────────────────
//
// The showcase used to read its seasons out of source/dossier.json, which was
// written by hand for the power rankings, and two things in it were wrong in a
// way that showed on the television: Mason came out as the 6 seed in 2021 and
// 10th at the end of it, which cannot happen.
//
// Three rules, all confirmed against the real brackets:
//
//   1. WHO ACTUALLY MADE THE PLAYOFFS is the championship bracket, walked
//      backwards from the game flagged is_championship. It is NOT the top N by
//      record: PAMS seeds out of divisions and conferences, so in 2025 the
//      fourth and fifth best records (Connor and Connie, by the board's names)
//      both sat home while two worse ones played. Every season's bracket comes
//      out the same size as settings.playoff_team_count, and the same set as
//      final_rank <= that count, which is what makes the next rule safe.
//
//   2. A TEAM THAT MISSED THE PLAYOFFS FINISHES ON ITS REGULAR SEASON. The
//      platform ranks the consolation bracket into places 7-12 and TSC stores
//      that, so Mason's 8-6 in 2021 came out 10th because he lost a game in a
//      bracket nobody cares about, below a 6-8 team that won one. Non-playoff
//      teams are re-seated here in regular-season order under the playoff
//      field: Mason is 7th, the best team that missed.
//
//   3. SEED IS THE PLAYOFF SEED, and it only exists for teams that made it.
//      Within the bracket it is regular-season order — verified against the
//      first-round pairings every year (3v6 and 4v5 with the top two on a
//      bye), which is what proves the seeding is done inside the field rather
//      than off the raw standings.
//
// Everything else here is counted from the same rows rather than carried over
// from the directory: record, playoff record, points a game, titles, top-three
// finishes. That is deliberate. The old career line and the old ledger came
// from two different places and disagreed for Mason by one playoff trip and
// two losses, and the showcase had to be written around the disagreement.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV = path.join(HERE, "..", "..", ".env.local");
const OUT = path.join(HERE, "source", "seasons.json");

// Sleeper account -> PAMS manager, keyed on the NFL.com user id. Same map as
// build_draft_data.py and for the same reason: TSC's own display names are
// crossed. The row called "Cat" over there is Connor and the row called
// "Connor" is Connie. Never key on a display name.
const MANAGERS = {
  21680682: "Ricci", 21239480: "Connor", 30533399: "Evan", 21680417: "Chris",
  21679440: "Joey", 22539599: "Charlie", 21679454: "Connie", 21688760: "Sean",
  25036608: "Luke", 21679447: "Mason", 21680087: "Kyle", 25033943: "Isaac",
};

const env = Object.fromEntries(
  fs.readFileSync(ENV, "utf8").split("\n")
    .filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => [l.slice(0, l.indexOf("=")).trim(),
               l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]));

const BASE = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local");

async function q(p) {
  const r = await fetch(`${BASE}/${p}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) throw new Error(`${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}

const rec = (w, l, t) => (t ? `${w}-${l}-${t}` : `${w}-${l}`);

const [league] = await q("leagues?slug=eq.pams&select=id,name");
console.log(`league: ${league.name}`);

const seasons = await q(
  `seasons?league_id=eq.${league.id}&year=lte.2025` +
  `&select=id,year,settings&order=year`);
const managerRows = await q(
  `managers?league_id=eq.${league.id}&select=id,display_name,external_id`);
const nameOf = Object.fromEntries(
  managerRows.map(m => [m.id, MANAGERS[Number(m.external_id)] || null]));

const out = {};
const ensure = n => (out[n] ||= {
  ledger: [], regW: 0, regL: 0, regT: 0, poW: 0, poL: 0,
  pts: 0, games: 0, titles: [], top3: 0, playoffs: 0,
});

for (const s of seasons) {
  const rows = await q(`manager_seasons?season_id=eq.${s.id}` +
    `&select=manager_id,wins,losses,ties,points_for,final_rank,regular_rank`);
  const games = await q(`matchups?season_id=eq.${s.id}` +
    `&select=week,manager_a_id,manager_b_id,score_a,score_b,is_playoff,is_championship`);
  const teams = rows.length;
  const N = s.settings?.playoff_team_count || 6;
  const po = games.filter(g => g.is_playoff);

  // ── rule 1: who made it ──
  // final_rank inside the season's playoff_team_count, which is what
  // madePlayoffs() in src/lib/export/pams.ts uses, and what the site shows.
  // Cross-checked here against the championship bracket walked backwards from
  // the game flagged is_championship: the two agree in all seven seasons, and
  // this throws if they ever stop agreeing.
  const field = new Set(rows.filter(r => r.final_rank <= N).map(r => r.manager_id));
  const chip = po.find(g => g.is_championship);
  if (!chip) throw new Error(`${s.year}: no championship game flagged`);
  const bracket = new Set([chip.manager_a_id, chip.manager_b_id]);
  for (const w of [...new Set(po.map(g => g.week))].sort((a, b) => b - a)) {
    for (const g of po.filter(x => x.week === w)) {
      if (bracket.has(g.manager_a_id) || bracket.has(g.manager_b_id)) {
        bracket.add(g.manager_a_id); bracket.add(g.manager_b_id);
      }
    }
  }
  if (field.size !== N || bracket.size !== N ||
      ![...field].every(id => bracket.has(id))) {
    throw new Error(`${s.year}: final_rank 1-${N} and the bracket disagree`);
  }

  // ── rule 3: seed is regular-season order inside the field ──
  const seeds = new Map([...field]
    .sort((a, b) => byId(a).regular_rank - byId(b).regular_rank)
    .map((id, i) => [id, i + 1]));

  // ── rule 2: everyone else is re-seated on their regular season ──
  const missed = rows.filter(r => !field.has(r.manager_id))
    .sort((a, b) => a.regular_rank - b.regular_rank);
  const finish = new Map(rows.filter(r => field.has(r.manager_id))
    .map(r => [r.manager_id, r.final_rank]));
  missed.forEach((r, i) => finish.set(r.manager_id, N + i + 1));

  // Points rank is off the regular season, same as the standings page.
  const pfOrder = rows.slice().sort((a, b) => b.points_for - a.points_for);

  for (const r of rows) {
    const name = nameOf[r.manager_id];
    if (!name) continue;              // departed managers keep their history
    const m = ensure(name);           // out of the board's twelve
    const made = field.has(r.manager_id);
    const fin = finish.get(r.manager_id);

    // Points a game is the regular season only, counted off the games
    // themselves rather than the season's points_for, which carries the
    // playoff weeks for whoever played them and so quietly rewards a deep run.
    let sp = 0, sg = 0;
    for (const g of games) {
      if (g.is_playoff) continue;
      if (g.manager_a_id === r.manager_id) { sp += Number(g.score_a); sg++; }
      else if (g.manager_b_id === r.manager_id) { sp += Number(g.score_b); sg++; }
    }

    m.ledger.push({
      y: s.year,
      rec: rec(r.wins, r.losses, r.ties),
      fin,
      ppg: sg ? Number((sp / sg).toFixed(1)) : null,
      pfr: pfOrder.findIndex(x => x.manager_id === r.manager_id) + 1,
      seed: made ? seeds.get(r.manager_id) : null,
      br: made,
      teams,
    });

    m.regW += r.wins; m.regL += r.losses; m.regT += r.ties;
    m.pts += sp; m.games += sg;
    if (made) m.playoffs++;
    if (fin === 1) m.titles.push(s.year);
    if (fin <= 3) m.top3++;
    // Playoff record, on TSC's own definition so the board and the site never
    // show a manager two different careers: championship-bracket games only
    // (isChampionshipBracketGame — one side seated in the top four), and the
    // run ends at the first loss, so the 3rd-place game the semifinal losers
    // play afterwards is not a playoff game. Counting placement games instead
    // gave Mason 60-43 where the site says 59-42.
    let out = false;
    for (const g of po.slice().sort((a, b) => a.week - b.week)) {
      const mine = g.manager_a_id === r.manager_id ? g.score_a
        : g.manager_b_id === r.manager_id ? g.score_b : null;
      if (mine === null || out) continue;
      const oppId = g.manager_a_id === r.manager_id ? g.manager_b_id : g.manager_a_id;
      const top4 = id => (rows.find(x => x.manager_id === id)?.final_rank ?? 99) <= 4;
      if (!top4(r.manager_id) && !top4(oppId)) continue;
      const theirs = g.manager_a_id === r.manager_id ? g.score_b : g.score_a;
      if (Number(mine) > Number(theirs)) m.poW++; else { m.poL++; out = true; }
    }
  }

  function byId(id) { return rows.find(r => r.manager_id === id); }
  console.log(`${s.year}  ${teams} teams, ${N} in the bracket, ` +
    `${missed.length} re-seated on the regular season`);
}

const payload = {};
for (const [name, m] of Object.entries(out)) {
  m.ledger.sort((a, b) => a.y - b.y);
  const w = m.regW + m.poW, l = m.regL + m.poL;
  payload[name] = {
    ledger: m.ledger,
    seasons: m.ledger.length,
    record: rec(w, l, m.regT),            // all-time, playoffs included
    regular_record: rec(m.regW, m.regL, m.regT),
    playoff_record: `${m.poW}-${m.poL}`,
    win_pct: Number((w / (w + l + m.regT)).toFixed(4)),
    ppg: Number((m.pts / m.games).toFixed(2)),
    titles: m.titles.length,
    title_years: m.titles,
    top3: m.top3,
    playoffs: m.playoffs,
  };
}

fs.writeFileSync(OUT, JSON.stringify({
  built: new Date().toISOString().slice(0, 10),
  source: "TSC database, league pams, seasons 2019-2025",
  managers: payload,
}, null, 1));
console.log(`\nwrote ${path.relative(HERE, OUT)}  ${Object.keys(payload).length} managers`);
for (const [n, m] of Object.entries(payload)) {
  console.log(`  ${n.padEnd(9)} ${m.record.padEnd(9)} reg ${m.regular_record.padEnd(8)} ` +
    `po ${m.playoff_record.padEnd(5)} ${m.playoffs} trips, ${m.titles} title(s), ` +
    `${m.ppg} ppg`);
}
