import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n")
  .filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]));
const BASE = env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1";
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const q = async (path) => {
  const r = await fetch(`${BASE}/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(path + " -> " + r.status + " " + await r.text());
  return r.json();
};
const [lg] = await q("leagues?slug=eq.pams&select=id,name,slug");
console.log("league:", lg.name, lg.id);
const seasons = await q(`seasons?league_id=eq.${lg.id}&select=id,year,playoff_weeks,settings,champion_manager_id&order=year`);
console.log("seasons:", seasons.map(s => `${s.year} pw=${JSON.stringify(s.playoff_weeks)} set=${JSON.stringify(s.settings)}`).join("\n          "));
const mgrs = await q(`managers?league_id=eq.${lg.id}&select=id,display_name,external_id`);
const byId = Object.fromEntries(mgrs.map(m => [m.id, m.display_name]));
for (const y of [2021]) {
  const s = seasons.find(x => x.year === y);
  const ms = await q(`manager_seasons?season_id=eq.${s.id}&select=manager_id,wins,losses,ties,points_for,final_rank,regular_rank`);
  console.log(`\n${y} manager_seasons (by final_rank):`);
  for (const r of ms.sort((a,b)=>(a.final_rank||99)-(b.final_rank||99)))
    console.log(`  ${String(byId[r.manager_id]).padEnd(12)} ${r.wins}-${r.losses}-${r.ties}  pf=${r.points_for}  final=${r.final_rank}  reg=${r.regular_rank}`);
  const mu = await q(`matchups?season_id=eq.${s.id}&is_playoff=eq.true&select=week,manager_a_id,manager_b_id,score_a,score_b,is_championship&order=week`);
  console.log(`${y} playoff matchups (${mu.length}):`);
  for (const m of mu) console.log(`  wk${m.week} ${String(byId[m.manager_a_id]).padEnd(10)} ${m.score_a} v ${m.score_b} ${byId[m.manager_b_id]}${m.is_championship ? "  [CHIP]" : ""}`);
}
