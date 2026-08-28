export * from "./_core-real.js";
import * as R from "./_core-real.js";
const q = new URLSearchParams(location.search);
const SEED = [];
export function watchPicks(cb) {
  const n = Number(q.get("picks") || 0);
  const ids = R.DATA.players.slice(0, 80);
  for (let i = 1; i <= n; i++) { const p = ids[i-1];
    SEED.push({ overall:i, round:R.roundOf(i), slot:R.slotOf(i),
      roundPick:((i-1)%12)+1, pick:((i-1)%12)+1, playerId:p.id, id:p.id,
      name:p.name, pos:p.pos, team:p.team, manager:R.managerOf(i).name, at:Date.now() }); }
  setTimeout(() => cb(SEED), 0); return () => {};
}
export function watchState(cb) {
  const n = Number(q.get("picks") || 0); const pl = R.DATA.players[n] || R.DATA.players[0];
  const st = { ...R.DEFAULT_STATE, status:q.get("status")||"clock", current:n+1,
    pending:{id:pl.id,name:pl.name,pos:pl.pos,team:pl.team},
    clockEnds:Date.now()+143000, clockStartedAt:Date.now()-5000,
    showcase:q.get("showcase")?Number(q.get("showcase")):null,
    rail:q.get("rail")||null, baPanel:q.get("bapanel")||null };
  setTimeout(() => cb(st), 0); return () => {};
}
export function startSleeperSync() {}
export function refreshLateJoiners() { return Promise.resolve(false); }
