import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n")
  .filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]));
const BASE = env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1", KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const q = async p => { const r = await fetch(`${BASE}/${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }); return r.json(); };
const [lg] = await q("leagues?slug=eq.pams&select=id");
const mgrs = await q(`managers?league_id=eq.${lg.id}&select=id,display_name,external_id&order=display_name`);
const MAP = { 21680682:"Ricci",21239480:"Connor",30533399:"Evan",21680417:"Chris",21679440:"Joey",
  22539599:"Charlie",21679454:"Connie",21688760:"Sean",25036608:"Luke",21679447:"Mason",
  21680087:"Kyle",25033943:"Isaac" };
console.log("TSC display_name -> external_id -> draft board name");
for (const m of mgrs) {
  const board = MAP[Number(m.external_id)];
  console.log(`  ${String(m.display_name).padEnd(12)} ${String(m.external_id).padEnd(12)} ${board ? "=> " + board : "(not in MANAGER_MAP)"}`);
}
