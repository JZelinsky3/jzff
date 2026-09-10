// ======================== pickems.js ========================
import {
  getFirestore, collection, doc, getDoc, setDoc, query, where, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const db = getFirestore();
const tz = "America/New_York";
const fmt = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz
});

/* ----- Grab canonical tabs and views, remove accidental duplicates ----- */
function canonicalById(id){
  const all = Array.from(document.querySelectorAll(`#${id}`));
  if(all.length > 1){
    for(let i = 1; i < all.length; i++) all[i].remove();
  }
  return all[0] || null;
}
const elTabs  = canonicalById("weekTabs");
const elViews = canonicalById("weekViews");

/* Auth and submit UI */
const loginForm  = document.getElementById("loginForm");
const elWhoami   = document.getElementById("whoami");
const logoutBtn  = document.getElementById("logoutBtn");
const submitBtn  = document.getElementById("submitPicks");
const submitHint = document.getElementById("submitHint");

const state = {
  teams: {},
  weeks: [],                // [{ meta, data }]
  activeWeekId: null,       // currently viewed
  currentWeekId: null,      // most recent week that is open
  accounts: [],             // from users.json
  user: null,               // { name, teamId }
  pending: { picks:{}, hl:{} } // local buffer per active week
};

initAuthUI();
boot().catch(console.error);

/* ---- Voting Records leaderboard ---- */
const recordsState = {
  // per weekId  Map of docId to vote data
  weekVotes: {},   // { w01: { "w01_Name": {...} }, ... }
};

function initRecords(){
  // Weeks that count are those with winners filled in
  const weeksWithWinners = state.weeks
    .map(w => w.data)
    .filter(w => w.winners && Object.values(w.winners).some(x => !!x));

  // listen for each counted week
  weeksWithWinners.forEach(w => {
    const qRef = query(collection(db, "pickems_votes"), where("weekId", "==", w.id));
    onSnapshot(qRef, snap => {
      const bucket = recordsState.weekVotes[w.id] = {};
      snap.forEach(ds => { bucket[ds.id] = ds.data(); });
      renderRecords(weeksWithWinners);
    });
  });

  // render once if no listeners yet but winners exist
  if(weeksWithWinners.length === 0){
    renderRecords([]);
  }
}

/* Modal helpers */
function showRecords(){ 
  const m = document.getElementById("recordsModal");
  if(!m) return;
  m.hidden = false;
  // focus the close for quick escape
  const c = document.getElementById("recordsClose");
  if(c) c.focus();
}
function hideRecords(){ 
  const m = document.getElementById("recordsModal");
  if(m) m.hidden = true;
}

/* wire up modal controls once DOM is ready */
document.addEventListener("click", e=>{
  const t = e.target;
  if(t.id === "recordsBtn"){ showRecords(); }
  if(t.id === "recordsClose" || t.dataset.close === "1"){ hideRecords(); }
});
document.addEventListener("keydown", e=>{
  if(e.key === "Escape") hideRecords();
});

function renderRecords(weeks){
  // Map name to { right, wrong }
  const byUser = new Map();
  // start everyone at 0 0 so list always shows full roster
  for(const a of state.accounts){
    byUser.set(a.name, { right:0, wrong:0, teamId:a.teamId });
  }

  for(const w of weeks){
    const winners = w.winners || {};
    const ownSetByTeam = new Map();
    // build a quick set of each team own matchups for this week
    for(const m of w.matchups){
      ownSetByTeam.set(m.home, (ownSetByTeam.get(m.home)||new Set()).add(m.id));
      ownSetByTeam.set(m.away, (ownSetByTeam.get(m.away)||new Set()).add(m.id));
    }

    const votes = recordsState.weekVotes[w.id] || {};
    for(const data of Object.values(votes)){
      const person = data.user;
      const teamId = data.teamId;
      const picks = data.picks || {};
      const userRow = byUser.get(person) || { right:0, wrong:0, teamId };
      for(const [mid, pickTid] of Object.entries(picks)){
        const winTid = winners[mid];
        if(!winTid) continue;                         // only score decided games
        // skip own matchup for fairness
        const ownMids = ownSetByTeam.get(teamId) || new Set();
        if(ownMids.has(mid)) continue;

        if(pickTid === winTid) userRow.right += 1;
        else userRow.wrong += 1;
      }
      byUser.set(person, userRow);
    }
  }

  // turn into array and sort by most right then fewest wrong then name
  const rows = [...byUser.entries()].map(([name, rw]) => ({ name, ...rw }));
  rows.sort((a,b)=>{
    if(b.right !== a.right) return b.right - a.right;
    if(a.wrong !== b.wrong) return a.wrong - b.wrong;
    return a.name.localeCompare(b.name);
  });

  // paint
  const list = document.getElementById("recordsList");
  if(!list) return;
  list.innerHTML = rows.map(r => {
    const teamName = state.teams[r.teamId]?.name || r.teamId || "";
    return `<li><span class="name" title="${teamName}">${r.name}</span><span class="rw">${r.right}-${r.wrong}</span></li>`;
  }).join("");
}

/* -------------------- Auth (name and PIN) -------------------- */
function initAuthUI(){
  const saved = localStorage.getItem("jzff_user");
  if(saved){
    try {
      const u = JSON.parse(saved);
      if(u && u.name && u.teamId) state.user = u;
    } catch {}
  }
  updateAuthUI();

  if(loginForm){
    loginForm.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const name = (document.getElementById("username").value||"").trim();
      const pin  = (document.getElementById("password").value||"").trim();
      if(!name || !pin) return;

      const acct = state.accounts.find(
        a => a.name.toLowerCase() === name.toLowerCase() && a.pin === pin
      );
      if(!acct){ alert("Invalid name or PIN."); return; }

      state.user = { name: acct.name, teamId: acct.teamId };
      localStorage.setItem("jzff_user", JSON.stringify(state.user));
      updateAuthUI();

      if(state.activeWeekId){
        const w = state.weeks.find(x => x.data.id === state.activeWeekId)?.data;
        if(w) await hydrateWeek(w, true);
      }
    });
  }

  if(logoutBtn){
    logoutBtn.addEventListener("click", ()=>{
      localStorage.removeItem("jzff_user");
      state.user = null;
      updateAuthUI();
      document.querySelectorAll(".vote-btn").forEach(b=> b.dataset.picked = "");
      state.pending = { picks:{}, hl:{} };
      updateSubmitEnabled();
    });
  }

  if(submitBtn) submitBtn.addEventListener("click", onSubmitPicks);
}

function updateAuthUI(){
  const loggedIn = !!state.user;
  if(loginForm) loginForm.hidden = loggedIn ? true : false;
  if(elWhoami)  { elWhoami.hidden  = loggedIn ? false : true; elWhoami.textContent = loggedIn ? `Logged in as ${state.user.name}` : ""; }
  if(logoutBtn) logoutBtn.hidden = loggedIn ? false : true;
}

/* -------------------- Boot -------------------- */
async function boot(){
  const [teams, manifest, users] = await Promise.all([
    fetch("./teams.json").then(r=>r.json()),
    fetch("./manifest.json").then(r=>r.json()),
    fetch("./users.json").then(r=>r.json())
  ]);

  state.accounts = users.accounts || [];
  state.teams = indexBy(teams.teams, t => t.id);

  const now = Date.now();
  const openWeeks = [];
  for(const w of manifest.weeks){
    const data = await fetch(`./${w.data}`).then(r=>r.json());
    if(new Date(data.openAt).getTime() <= now){
      openWeeks.push({ meta:w, data });
    }
  }
  openWeeks.sort((a,b)=> new Date(a.data.openAt) - new Date(b.data.openAt));
  state.weeks = openWeeks;

  // compute current week as the most recent open
  state.currentWeekId = state.weeks.length ? state.weeks[state.weeks.length - 1].data.id : null;

  // render tabs with current tag
  if(elTabs){
    elTabs.innerHTML = state.weeks.map(w => {
      const isCurrent = w.data.id === state.currentWeekId;
      const sub = isCurrent ? `<span class="tab-sub">current</span>` : "";
      return `<button class="pe-tab" data-week="${w.data.id}" data-current="${isCurrent ? "true" : ""}">${w.data.label} ${sub}</button>`;
    }).join("");

    elTabs.addEventListener("click", e => {
      const btn = e.target.closest(".pe-tab");
      if(btn) setActive(btn.dataset.week);
    });
  }

  // render week containers
  if(elViews){
    elViews.innerHTML = state.weeks.map(w => weekViewHTML(w.data)).join("");
  }

  // default to current week
  if(state.currentWeekId) setActive(state.currentWeekId);

  // hydrate each week into its own container
  for(const w of state.weeks){
    await hydrateWeek(w.data);
  }

  // now build the records board
  initRecords();
}

/* -------------------- View builders -------------------- */
function setActive(weekId){
  state.activeWeekId = weekId;

  // tabs
  document.querySelectorAll(".pe-tab").forEach(x=>{
    if(x.dataset.week === weekId){
      x.setAttribute("data-active","true");
    } else {
      x.removeAttribute("data-active");
    }
  });

  // week sections
  document.querySelectorAll(".week").forEach(x=>{
    if(x.dataset.week === weekId){
      x.setAttribute("data-active","true");
    } else {
      x.removeAttribute("data-active");
    }
  });

  state.pending = { picks:{}, hl:{} };
  updateSubmitEnabled();
}

function weekViewHTML(w){
  const when = `
    <span class="badge">Opens: Wednesday</span>
    <span class="badge">Reveals: Thursday 12:00 pm</span>
    <span class="badge">Locks: Thursday 8:00 pm</span>
  `;
  return `
    <section class="week" data-week="${w.id}">
      <div class="week-info">${when}</div>
      <div id="lock-msg-${w.id}" class="week-locked"></div>
      <div id="current-msg-${w.id}" class="week-locked"></div>

      ${w.gameOfWeek ? `
        <div class="gotw-title">
          🏆 Game of the Week
          <span class="sub">Matchup spotlight</span>
        </div>` : ``}

      <div class="pe-grid" id="grid-${w.id}"></div>

      <div class="hl-card">
        <div class="hl-row">
          <div class="select" data-hl="highest">
            <label class="bar-label">Highest Scorer</label><br>
            <select id="hl-high-${w.id}">
              <option value="">Select team</option>
            </select>
          </div>
          <div class="select" data-hl="lowest">
            <label class="bar-label">Lowest Scorer</label><br>
            <select id="hl-low-${w.id}">
              <option value="">Select team</option>
            </select>
          </div>
        </div>
        <div id="hl-reveal-${w.id}" style="margin-top:8px"></div>
      </div>
    </section>
  `;
}

async function hydrateWeek(w, force=false){
  // projections
  let proj = {};
  try{ proj = await fetch(`./${w.projections}`).then(r=>r.json()); }catch{}

  const grid = document.getElementById(`grid-${w.id}`);
  if(!grid) return;

  const now = new Date();
  const revealAt = new Date(w.revealAt);
  const lockAt   = new Date(w.lockAt);
  const locked   = now >= lockAt;

  // global lock message and current message
  const lockMsg = document.getElementById(`lock-msg-${w.id}`);
  if(lockMsg) lockMsg.textContent = locked ? "Locked" : "";

  // High and Low dropdown options
  const opts = w.highestLowestOptions && w.highestLowestOptions.length
    ? w.highestLowestOptions
    : Array.from(new Set(w.matchups.flatMap(m => [m.home, m.away])));

  const highSel = document.getElementById(`hl-high-${w.id}`);
  const lowSel  = document.getElementById(`hl-low-${w.id}`);

  if(highSel && lowSel && highSel.options.length <= 1){
    for(const tid of opts){
      const team = state.teams[tid];
      if(!team) continue;
      const o = document.createElement("option");
      o.value = tid; o.textContent = team.name;
      highSel.appendChild(o.cloneNode(true));
      lowSel.appendChild(o);
    }
  }

  // order with game of the week first
  const order = [...w.matchups];
  if(w.gameOfWeek){
    const idx = order.findIndex(m => m.id === w.gameOfWeek);
    if(idx > -1){ const [gotw] = order.splice(idx,1); order.unshift(gotw); }
  }

  // render only into this week's grid
  grid.innerHTML = order.map(m => matchHTML(w, m, proj, locked, w.gameOfWeek===m.id)).join("");

  // bind handlers once per grid
  if(!grid.dataset.bound){
    grid.addEventListener("click", e => {
      const btn = e.target.closest(".vote-btn");
      if(!btn) return;

      if(!state.user){ alert("Login first name and PIN."); return; }
      if(locked){ alert("Voting is locked for this week."); return; }

      const mid = btn.dataset.matchup;
      const m = w.matchups.find(x => x.id === mid);
      if(state.user?.teamId && (m.home === state.user.teamId || m.away === state.user.teamId)){
        alert("You cannot vote on your own matchup.");
        return;
      }

      const teamId = btn.dataset.team;
      state.pending.picks[mid] = teamId;

      // mark chosen button only inside this matchup and this week
      grid.querySelectorAll(`.match[data-mid="${mid}"] .vote-btn`).forEach(b=>{
        b.dataset.picked = (b.dataset.team === teamId) ? "true" : "";
      });

      updateSubmitEnabled();
    });
    grid.dataset.bound = "1";
  }

  if(highSel && !highSel.dataset.bound){
    highSel.addEventListener("change", ()=>{
      if(!state.user){ alert("Login first."); highSel.value=""; return; }
      if(locked){ alert("Voting is locked for this week."); highSel.value=""; return; }
      state.pending.hl.highest = highSel.value || undefined;
      updateSubmitEnabled();
    });
    highSel.dataset.bound = "1";
  }

  if(lowSel && !lowSel.dataset.bound){
    lowSel.addEventListener("change", ()=>{
      if(!state.user){ alert("Login first."); lowSel.value=""; return; }
      if(locked){ alert("Voting is locked for this week."); lowSel.value=""; return; }
      state.pending.hl.lowest = lowSel.value || undefined;
      updateSubmitEnabled();
    });
    lowSel.dataset.bound = "1";
  }

  // if logged in, load prior submission
  if(state.user){
    await loadExistingSubmission(w);
  }

  // live tally scoped to this week
  liveTally(w, revealAt);
  updateSubmitEnabled();
}

function matchHTML(w, m, proj, locked, isGOTW){
  const A = state.teams[m.home];
  const B = state.teams[m.away];
  const recA = (w.records && w.records[m.home]) || "";
  const recB = (w.records && w.records[m.away]) || "";
  const pA = proj[m.home];
  const pB = proj[m.away];

  const block = (side, teamObj, rec, projVal) => `
    <div class="team" data-team="${side}">
      <div class="logo">${logoHTML(teamObj)}</div>
      <div class="meta">
        <div class="team-name">${teamObj?.name || side} ${teamObj?.isChampion ? crownHTML() : ""} <span class="record">${rec}</span></div>
        <div class="manager">${teamObj?.manager || ""}</div>
        ${projVal != null ? `<div class="proj">${projVal.toFixed(1)} pts</div>` : ""}
      </div>
    </div>
  `;

  return `
    <div class="match" ${isGOTW ? 'data-gotw="true"' : ""} data-mid="${m.id}">
      <div class="match-top">
        ${block(m.home, A, recA, pA)}
        <div class="vs">vs</div>
        ${block(m.away, B, recB, pB)}
      </div>

      <div class="vote">
        <div class="buttons">
          <button class="vote-btn" data-matchup="${m.id}" data-team="${m.home}">${A?.name || m.home}</button>
          <button class="vote-btn" data-matchup="${m.id}" data-team="${m.away}">${B?.name || m.away}</button>
        </div>
        <div class="bar2" id="bar-${w.id}-${m.id}">
            <span class="left"  id="l-${w.id}-${m.id}">50%</span>
            <span class="right" id="r-${w.id}-${m.id}">50%</span>
        </div>
      </div>

      ${winnerHighlight(w, m)}
    </div>
  `;
}

/* -------------------- Submit and load -------------------- */
async function onSubmitPicks(){
  const w = state.weeks.find(x => x.data.id === state.activeWeekId)?.data;
  if(!w) return;
  if(!state.user){ alert("Login first."); return; }
  if(new Date() >= new Date(w.lockAt)){ alert("Voting is locked for this week."); return; }

  const need = new Set(
    w.matchups
      .filter(m => !(state.user?.teamId && (m.home === state.user.teamId || m.away === state.user.teamId)))
      .map(m => m.id)
  );
  const have = new Set(Object.keys(state.pending.picks || {}));
  const missing = [...need].filter(x => !have.has(x));

  if(missing.length){ alert(`You still need to pick ${missing.length} matchup(s).`); return; }
  if(!state.pending.hl.highest || !state.pending.hl.lowest){ alert("Choose both Highest and Lowest Scorer."); return; }

  const docId = `${w.id}_${state.user.name}`;
  const ref = doc(db, "pickems_votes", docId);
  const snap = await getDoc(ref);
  if(snap.exists()){ alert("Your picks were already submitted for this week."); return; }

  const payload = {
    weekId: w.id,
    user: state.user.name,
    teamId: state.user.teamId,
    createdAt: serverTimestamp(),
    picks: state.pending.picks,
    hl: state.pending.hl
  };
  await setDoc(ref, payload, { merge:false });

  disableWeekInputs(w.id);
  submitBtn.disabled = true;
  submitHint.textContent = "Picks submitted!";
}

async function loadExistingSubmission(w){
  if(!state.user) return;
  const ref = doc(db, "pickems_votes", `${w.id}_${state.user.name}`);
  const snap = await getDoc(ref);
  if(!snap.exists()) return;

  const data = snap.data();
  for(const [mid, teamId] of Object.entries(data.picks || {})){
    document.querySelectorAll(`.week[data-week="${w.id}"] .match[data-mid="${mid}"] .vote-btn`).forEach(b=>{
      b.dataset.picked = (b.dataset.team === teamId) ? "true" : "";
      b.disabled = true;
    });
  }

  if(data.hl?.highest) {
    const sel = document.getElementById(`hl-high-${w.id}`);
    if(sel){ sel.value = data.hl.highest; sel.disabled = true; }
  }
  if(data.hl?.lowest) {
    const sel = document.getElementById(`hl-low-${w.id}`);
    if(sel){ sel.value = data.hl.lowest; sel.disabled = true; }
  }

  submitBtn.disabled = true;
  submitHint.textContent = "You already submitted this week.";
}

function disableWeekInputs(weekId){
  document.querySelectorAll(`.week[data-week="${weekId}"] .vote-btn`).forEach(b => b.disabled = true);
  const hi = document.getElementById(`hl-high-${weekId}`);
  const lo = document.getElementById(`hl-low-${weekId}`);
  if(hi) hi.disabled = true;
  if(lo) lo.disabled = true;
}

function updateSubmitEnabled(){
  const w = state.weeks.find(x => x.data.id === state.activeWeekId)?.data;
  if(!w || !state.user){
    submitBtn.disabled = true;
    submitHint.textContent = state.user ? "" : "Login to vote";
    return;
  }
  if(new Date() >= new Date(w.lockAt)){
    submitBtn.disabled = true;
    submitHint.textContent = "Locked";
    return;
  }

  const need = new Set(
    w.matchups
      .filter(m => !(state.user?.teamId && (m.home === state.user.teamId || m.away === state.user.teamId)))
      .map(m => m.id)
  );
  const have = new Set(Object.keys(state.pending.picks || {}));
  const missing = [...need].filter(x => !have.has(x));
  const hlOK = !!state.pending.hl.highest && !!state.pending.hl.lowest;

  submitBtn.disabled = (missing.length > 0 || !hlOK);
  submitHint.textContent = submitBtn.disabled
    ? `Select ${missing.length} more matchup(s) and High/Low`
    : "Ready to submit";
}

/* -------------------- Live tally and HL reveal -------------------- */
function liveTally(w, revealAt){
  const qRef = query(collection(db, "pickems_votes"), where("weekId", "==", w.id));
  onSnapshot(qRef, snap => {
    const show = new Date() >= revealAt;

    // init counts for this week
    const counts = {};
    for (const m of w.matchups) counts[m.id] = { [m.home]: 0, [m.away]: 0 };

    const hl = { highest: {}, lowest: {} };

    // aggregate votes
    snap.forEach(docSnap => {
      const d = docSnap.data();
      if (d.picks) {
        for (const [mid, tid] of Object.entries(d.picks)) {
          if (counts[mid] && counts[mid][tid] != null) counts[mid][tid]++;
        }
      }
      if (d.hl) {
        for (const k of ["highest", "lowest"]) {
          if (d.hl[k]) hl[k][d.hl[k]] = (hl[k][d.hl[k]] || 0) + 1;
        }
      }
    });

    // update each matchup bar and text
    for (const m of w.matchups) {
      const bar   = document.getElementById(`bar-${w.id}-${m.id}`);
      const left  = document.getElementById(`l-${w.id}-${m.id}`);
      const right = document.getElementById(`r-${w.id}-${m.id}`);
      if (!bar || !left || !right) continue;

      const a = counts[m.id][m.home];
      const b = counts[m.id][m.away];
      const total = a + b;

      let pctA = 50, pctB = 50;        // default neutral display
      if (show && total > 0) {
        pctA = Math.round((a / total) * 100);
        pctB = 100 - pctA;
      }

      // widths and the numbers you see inside the bar
      left.style.width  = pctA + "%";
      right.style.width = pctB + "%";
      left.textContent  = pctA + "%";
      right.textContent = pctB + "%";

      if (!show) {
        left.style.color = "transparent";
        right.style.color = "transparent";
        left.style.textShadow = "none";
        right.style.textShadow = "none";
      } else {
        left.style.color = "#041016";   // your normal text color
        right.style.color = "#041016";
        left.style.textShadow = "0 1px 0 rgba(255,255,255,.25)";
        right.style.textShadow = "0 1px 0 rgba(255,255,255,.25)";
      }

      // helpful tooltip
      bar.title = show
        ? `${state.teams[m.home]?.name || m.home} ${pctA}%  •  ${state.teams[m.away]?.name || m.away} ${pctB}%  •  ${total} votes`
        : "Votes hidden until reveal";
    }

    // highest lowest box stays as you had it
    const hlBox = document.getElementById(`hl-reveal-${w.id}`);
    if (hlBox) {
      if (w.hlWinners) {
        const hi = (w.hlWinners.highest || []).map(id => state.teams[id]?.name || id).join(", ") || "TBD";
        const lo = (w.hlWinners.lowest  || []).map(id => state.teams[id]?.name || id).join(", ") || "TBD";
        hlBox.innerHTML = `<span class="badge">Highest winner ${hi}</span> <span class="badge">Lowest winner ${lo}</span>`;
      } else if (show) {
        const hi = leaders(hl.highest);
        const lo = leaders(hl.lowest);
        const hiNames = hi.length ? hi.map(id => state.teams[id]?.name || id).join(", ") : "TBD";
        const loNames = lo.length ? lo.map(id => state.teams[id]?.name || id).join(", ") : "TBD";
        hlBox.innerHTML = `<span class="badge">Highest leader ${hiNames}</span> <span class="badge">Lowest leader ${loNames}</span>`;
      } else {
        hlBox.innerHTML = `<span class="bar-label">Highest and Lowest leaders reveal at Thursday 12 pm</span>`;
      }
    }
  });
}

/* -------------------- Helpers -------------------- */
function logoHTML(team){
  if(!team) return "";
  return `<img src="${team.logo}" alt="${team.name} logo" loading="lazy">`;
}
function crownHTML(){
  return `<span class="crown" title="Defending Champion">👑</span>`;
}

/* Winner highlighting replaces floating badge */
function winnerHighlight(w, m){
  const win = w.winners && w.winners[m.id];
  if(!win) return "";
  requestAnimationFrame(()=>{
    const weekEl = document.querySelector(`.week[data-week="${w.id}"]`);
    if(!weekEl) return;

    const matchEl = weekEl.querySelector(`.match[data-mid="${m.id}"]`);
    if(!matchEl) return;

    matchEl.dataset.winner = win;

    matchEl.querySelectorAll(`.team[data-team]`).forEach(t=>{
      if(t.dataset.team === win) t.classList.add("win");
    });

    matchEl.querySelectorAll(`.vote-btn[data-team="${win}"]`).forEach(btn=>{
      btn.dataset.winner = "true";
    });
  });
  return "";
}

function leaders(map){
  let top = 0, out = [];
  for(const [k,v] of Object.entries(map||{})){
    if(v>top){ top = v; out = [k]; }
    else if(v===top){ if(!out.includes(k)) out.push(k); }
  }
  return out;
}
function indexBy(arr, keyFn){
  const o = {}; for(const x of arr) o[keyFn(x)] = x; return o;
}
