import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n")
  .filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]));
const BASE = env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1", KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const q = async p => { const r = await fetch(`${BASE}/${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(p + " " + r.status); return r.json(); };

const [lg] = await q("leagues?slug=eq.pams&select=id");
const seasons = await q(`seasons?league_id=eq.${lg.id}&year=lte.2025&select=id,year,settings,champion_manager_id,runner_up_manager_id&order=year`);
const mgrs = await q(`managers?league_id=eq.${lg.id}&select=id,display_name`);
const nm = Object.fromEntries(mgrs.map(m => [m.id, m.display_name]));

for (const s of seasons) {
  const ms = await q(`manager_seasons?season_id=eq.${s.id}&select=manager_id,wins,losses,ties,final_rank,regular_rank`);
  const mu = await q(`matchups?season_id=eq.${s.id}&is_playoff=eq.true&select=week,manager_a_id,manager_b_id,score_a,score_b,is_championship&order=week`);
  const N = s.settings?.playoff_team_count;
  const chip = mu.find(m => m.is_championship);
  if (!chip) { console.log(`${s.year}  NO CHAMPIONSHIP GAME FLAGGED`); continue; }

  // Walk the championship bracket backwards: the teams in the final, then
  // whoever they played the week before, and so on.
  const weeks = [...new Set(mu.map(m => m.week))].sort((a, b) => b - a);
  let field = new Set([chip.manager_a_id, chip.manager_b_id]);
  for (const w of weeks) {
    for (const m of mu.filter(x => x.week === w)) {
      if (field.has(m.manager_a_id) || field.has(m.manager_b_id)) {
        field.add(m.manager_a_id); field.add(m.manager_b_id);
      }
    }
  }
  const inField = [...field];
  const top = ms.filter(r => r.final_rank <= N).map(r => r.manager_id);
  const same = inField.length === top.length && inField.every(id => top.includes(id));
  const seeds = inField.slice().sort((a, b) =>
    (ms.find(r => r.manager_id === a).regular_rank) - (ms.find(r => r.manager_id === b).regular_rank));
  console.log(`${s.year}  teams=${ms.length} playoff_field=${inField.length} (setting ${N})  ` +
    `final_rank<=N matches bracket: ${same ? "YES" : "NO"}`);
  if (!same) {
    console.log(`   bracket: ${inField.map(i => nm[i]).join(", ")}`);
    console.log(`   top-N:   ${top.map(i => nm[i]).join(", ")}`);
  }
  console.log(`   seeds:   ${seeds.map((id, i) => `${i + 1} ${nm[id]}`).join("  ")}`);
  const missed = ms.filter(r => !field.has(r.manager_id))
    .sort((a, b) => a.regular_rank - b.regular_rank);
  console.log(`   missed:  ${missed.map((r, i) => `${N + i + 1} ${nm[r.manager_id]}(reg ${r.regular_rank}, was ${r.final_rank})`).join("  ")}`);
}
