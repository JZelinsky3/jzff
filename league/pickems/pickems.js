// ======================== pickems.js ========================
// No Google auth. We still use Firestore; make sure your rules allow writes from the web.
// If you prefer not to use Firestore, I can switch this to local-only or your RTDB.

import {
  getFirestore, collection, doc, getDoc, setDoc, query, where, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const db = getFirestore();          // Using your existing Firebase config on the page
const tz = "America/New_York";
// New (no year, e.g., "Sep 3, 8:00 PM")
const fmt = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit',
  timeZone: 'America/New_York'
});


const elTabs  = document.getElementById("weekTabs");
const elViews = document.getElementById("weekViews");

// New elements for auth + submit
const loginForm = document.getElementById("loginForm");
const elWhoami  = document.getElementById("whoami");
const logoutBtn = document.getElementById("logoutBtn");
const submitBtn = document.getElementById("submitPicks");
const submitHint= document.getElementById("submitHint");

const state = {
  teams: {},
  weeks: [],
  activeWeekId: null,
  // custom login
  accounts: [],           // loaded from users.json
  user: null,             // { name, teamId }
  // selection buffer (one-week at a time)
  pending: { picks:{}, hl:{} }, // picks[mid]=teamId; hl.highest/hl.lowest=teamId
};

initAuthUI();
boot().catch(console.error);

// -------------------- Auth (name + PIN) --------------------
function initAuthUI(){
  // restore session
  const saved = localStorage.getItem("jzff_user");
  if(saved){
    try {
      const u = JSON.parse(saved);
      if(u && u.name && u.teamId){
        state.user = u;
      }
    } catch {}
  }
  updateAuthUI();

  loginForm.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const name = (document.getElementById("username").value||"").trim();
    const pin  = (document.getElementById("password").value||"").trim();
    if(!name || !pin){ return; }

    // validate against users.json loaded later in boot()
    const acct = state.accounts.find(
        a => a.name.toLowerCase() === name.toLowerCase() && a.pin === pin
    );
    if(!acct){
      alert("Invalid name or PIN.");
      return;
    }
    state.user = { name: acct.name, teamId: acct.teamId };
    localStorage.setItem("jzff_user", JSON.stringify(state.user));
    updateAuthUI();
    // re-hydrate current week view to apply own-game block and fetch existing votes
    if(state.activeWeekId){
      const w = state.weeks.find(x => x.data.id === state.activeWeekId)?.data;
      if(w) await hydrateWeek(w, true);
    }
  });

  logoutBtn.addEventListener("click", ()=>{
    localStorage.removeItem("jzff_user");
    state.user = null;
    updateAuthUI();
    // clear picked marks
    document.querySelectorAll(".vote-btn").forEach(b=> b.dataset.picked = "");
    state.pending = { picks:{}, hl:{} };
    updateSubmitEnabled();
  });

  submitBtn.addEventListener("click", onSubmitPicks);
}

function updateAuthUI(){
  if(state.user){
    loginForm.hidden = true;
    elWhoami.hidden  = false;
    logoutBtn.hidden = false;
    elWhoami.textContent = `Logged in as ${state.user.name}`;
  } else {
    loginForm.hidden = false;
    elWhoami.hidden  = true;
    logoutBtn.hidden = true;
  }
}

// -------------------- Boot --------------------
async function boot(){
  const [teams, manifest, users] = await Promise.all([
    fetch("./teams.json").then(r=>r.json()),
    fetch("./manifest.json").then(r=>r.json()),
    fetch("./users.json").then(r=>r.json())
  ]);

  state.accounts = users.accounts || [];
  state.teams = indexBy(teams.teams, t => t.id);

  // only weeks that have opened
  const now = new Date();
  const openWeeks = [];
  for(const w of manifest.weeks){
    const data = await fetch(`./${w.data}`).then(r=>r.json());
    if(new Date(data.openAt) <= now){
      openWeeks.push({ meta:w, data });
    }
  }
  openWeeks.sort((a,b)=> new Date(a.data.openAt) - new Date(b.data.openAt));
  state.weeks = openWeeks;

  // tabs
  elTabs.innerHTML = state.weeks.map(w => `<button class="pe-tab" data-week="${w.data.id}">${w.data.label}</button>`).join("");
  elTabs.addEventListener("click", e => {
    const btn = e.target.closest(".pe-tab");
    if(btn){ setActive(btn.dataset.week); }
  });

  // views
  elViews.innerHTML = state.weeks.map(w => weekViewHTML(w.data)).join("");

  // default: latest
  const last = state.weeks[state.weeks.length-1];
  if(last) setActive(last.data.id);

  // hydrate all (or lazily only active—keeping all for simplicity)
  for(const w of state.weeks){ await hydrateWeek(w.data); }
}

// -------------------- View Builders --------------------
function setActive(weekId){
  state.activeWeekId = weekId;
  document.querySelectorAll(".pe-tab").forEach(x=> x.dataset.active = (x.dataset.week===weekId));
  document.querySelectorAll(".week").forEach(x=> x.dataset.active = (x.dataset.week===weekId));
  // reset pending when switching weeks
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
  </section>`;
}

async function hydrateWeek(w, force=false){
  // projections
  let proj = {};
  try{ proj = await fetch(`./${w.projections}`).then(r=>r.json()); }catch{}

  const grid = document.getElementById(`grid-${w.id}`);
  const now = new Date();
  const revealAt = new Date(w.revealAt);
  const lockAt   = new Date(w.lockAt);
  const locked   = now >= lockAt;

  // High/Low options
  const opts = w.highestLowestOptions || Array.from(new Set(w.matchups.flatMap(m => [m.home, m.away])));
  const highSel = document.getElementById(`hl-high-${w.id}`);
  const lowSel  = document.getElementById(`hl-low-${w.id}`);
  if(highSel.options.length <= 1){   // populate once
    for(const tid of opts){
      const team = state.teams[tid];
      if(!team) continue;
      const o = document.createElement("option");
      o.value = tid; o.textContent = team.name;
      highSel.appendChild(o.cloneNode(true));
      lowSel.appendChild(o);
    }
  }

  // order: GOTW first
  const order = [...w.matchups];
  if(w.gameOfWeek){
    const idx = order.findIndex(m => m.id === w.gameOfWeek);
    if(idx > -1){ const [gotw] = order.splice(idx,1); order.unshift(gotw); }
  }

  grid.innerHTML = order.map(m => matchHTML(w, m, proj, locked, w.gameOfWeek===m.id)).join("");

  // click handler (local buffer only)
  grid.addEventListener("click", e => {
    const btn = e.target.closest(".vote-btn");
    if(!btn) return;

    if(!state.user){ alert("Login first (name + PIN)."); return; }
    if(locked){ alert("Voting is locked for this week."); return; }

    // block own game
    const mid = btn.dataset.matchup;
    const m = w.matchups.find(x => x.id === mid);
    if(state.user?.teamId && (m.home === state.user.teamId || m.away === state.user.teamId)){
      alert("You can’t vote on your own matchup.");
      return;
    }

    // set local pick
    const teamId = btn.dataset.team;
    state.pending.picks[mid] = teamId;

    // UI mark
    document.querySelectorAll(`.match[data-mid="${mid}"] .vote-btn`).forEach(b=>{
      b.dataset.picked = (b.dataset.team === teamId) ? "true" : "";
    });

    updateSubmitEnabled();
  });

  // dropdown changes (local buffer only)
  highSel.addEventListener("change", ()=>{
    if(!state.user){ alert("Login first."); highSel.value=""; return; }
    if(locked){ alert("Voting is locked for this week."); highSel.value=""; return; }
    state.pending.hl.highest = highSel.value || undefined;
    updateSubmitEnabled();
  });
  lowSel.addEventListener("change", ()=>{
    if(!state.user){ alert("Login first."); lowSel.value=""; return; }
    if(locked){ alert("Voting is locked for this week."); lowSel.value=""; return; }
    state.pending.hl.lowest = lowSel.value || undefined;
    updateSubmitEnabled();
  });

  // if logged in, load previous submission and freeze UI
  if(state.user){
    await loadExistingSubmission(w);
  }

  // live tally for reveal time (same behavior as before)
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

  return `
  ${isGOTW ? `
    <div class="match" data-gotw="true" data-mid="${m.id}" ${locked ? 'data-locked="true"' : ""}>
      <div class="match-top">
        <div class="team">
          <div class="logo">${logoHTML(A)}</div>
          <div class="meta">
            <div class="team-name">${A?.name || m.home} ${A?.isChampion ? crownHTML() : ""} <span class="record">${recA}</span></div>
            <div class="manager">${A?.manager || ""}</div>
            ${pA != null ? `<div class="proj">${pA.toFixed(1)} pts</div>` : ""}
          </div>
        </div>
        <div class="vs">vs</div>
        <div class="team">
          <div class="logo">${logoHTML(B)}</div>
          <div class="meta">
            <div class="team-name">${B?.name || m.away} ${B?.isChampion ? crownHTML() : ""} <span class="record">${recB}</span></div>
            <div class="manager">${B?.manager || ""}</div>
            ${pB != null ? `<div class="proj">${pB.toFixed(1)} pts</div>` : ""}
          </div>
        </div>
      </div>
      <div class="vote">
        <div class="buttons">
          <button class="vote-btn" data-matchup="${m.id}" data-team="${m.home}">${A?.name || m.home}</button>
          <button class="vote-btn" data-matchup="${m.id}" data-team="${m.away}">${B?.name || m.away}</button>
        </div>
        <div class="bar" aria-hidden="true"><span id="bar-${w.id}-${m.id}" style="width:0%"></span></div>
        <div class="bar-label" id="lab-${w.id}-${m.id}"></div>
      </div>
      ${winnerBadge(w, m)}
    </div>
  ` : `
    <div class="match" data-mid="${m.id}" ${locked ? 'data-locked="true"' : ""}>
      <div class="match-top">
        <div class="team">
          <div class="logo">${logoHTML(A)}</div>
          <div class="meta">
            <div class="team-name">${A?.name || m.home} ${A?.isChampion ? crownHTML() : ""} <span class="record">${recA}</span></div>
            <div class="manager">${A?.manager || ""}</div>
            ${pA != null ? `<div class="proj">${pA.toFixed(1)} pts</div>` : ""}
          </div>
        </div>
        <div class="vs">vs</div>
        <div class="team">
          <div class="logo">${logoHTML(B)}</div>
          <div class="meta">
            <div class="team-name">${B?.name || m.away} ${B?.isChampion ? crownHTML() : ""} <span class="record">${recB}</span></div>
            <div class="manager">${B?.manager || ""}</div>
            ${pB != null ? `<div class="proj">${pB.toFixed(1)} pts</div>` : ""}
          </div>
        </div>
      </div>
      <div class="vote">
        <div class="buttons">
          <button class="vote-btn" data-matchup="${m.id}" data-team="${m.home}">${A?.name || m.home}</button>
          <button class="vote-btn" data-matchup="${m.id}" data-team="${m.away}">${B?.name || m.away}</button>
        </div>
        <div class="bar" aria-hidden="true"><span id="bar-${w.id}-${m.id}" style="width:0%"></span></div>
        <div class="bar-label" id="lab-${w.id}-${m.id}"></div>
      </div>
      ${winnerBadge(w, m)}
    </div>
  `}`;
}

// -------------------- Submit / Load --------------------
async function onSubmitPicks(){
  const w = state.weeks.find(x => x.data.id === state.activeWeekId)?.data;
  if(!w) return;
  if(!state.user){ alert("Login first."); return; }
  if(new Date() >= new Date(w.lockAt)){ alert("Voting is locked for this week."); return; }

  // figure out which matchups the user must pick
const need = new Set(
  w.matchups
    .filter(m => !(state.user?.teamId && (m.home === state.user.teamId || m.away === state.user.teamId)))
    .map(m => m.id)
);
const have = new Set(Object.keys(state.pending.picks || {}));
const missing = [...need].filter(x => !have.has(x));

  if(missing.length){
    alert(`You still need to pick ${missing.length} matchup(s).`);
    return;
  }
  if(!state.pending.hl.highest || !state.pending.hl.lowest){
    alert("Choose both Highest and Lowest Scorer.");
    return;
  }

  const docId = `${w.id}_${state.user.name}`;
  const ref = doc(db, "pickems_votes", docId);
  const snap = await getDoc(ref);
  if(snap.exists()){
    alert("Your picks were already submitted for this week.");
    return;
  }

  const payload = {
    weekId: w.id,
    user: state.user.name,
    teamId: state.user.teamId,
    createdAt: serverTimestamp(),
    picks: state.pending.picks,
    hl: state.pending.hl
  };
  await setDoc(ref, payload, { merge:false });

  // lock UI locally
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
  // mark buttons
  for(const [mid, teamId] of Object.entries(data.picks || {})){
    document.querySelectorAll(`.match[data-mid="${mid}"] .vote-btn`).forEach(b=>{
      b.dataset.picked = (b.dataset.team === teamId) ? "true" : "";
      b.disabled = true;
    });
  }
  // dropdowns
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
  if(!w || !state.user){ submitBtn.disabled = true; submitHint.textContent = state.user? "" : "Login to vote"; return; }
  if(new Date() >= new Date(w.lockAt)){ submitBtn.disabled = true; submitHint.textContent = "Locked"; return; }

  const need = new Set(
  w.matchups
    .filter(m => !(state.user?.teamId && (m.home === state.user.teamId || m.away === state.user.teamId)))
    .map(m => m.id)
);
  const have = new Set(Object.keys(state.pending.picks||{}));
  const missing = [...need].filter(x => !have.has(x));
  const hlOK = !!state.pending.hl.highest && !!state.pending.hl.lowest;

  submitBtn.disabled = (missing.length > 0 || !hlOK);
  submitHint.textContent = submitBtn.disabled ? `Select ${missing.length} more matchup(s) and High/Low` : "Ready to submit";
}

// -------------------- Live tally / reveal --------------------
function liveTally(w, revealAt){
  const qRef = query(collection(db, "pickems_votes"), where("weekId", "==", w.id));
  onSnapshot(qRef, snap => {
    const show = new Date() >= revealAt;

    // matchups
    const counts = {};
    for(const m of w.matchups){ counts[m.id] = { [m.home]:0, [m.away]:0 }; }

    const hl = { highest:{}, lowest:{} };

    snap.forEach(docSnap => {
      const d = docSnap.data();
      if(d.picks){
        for(const [mid, tid] of Object.entries(d.picks)){
          if(counts[mid] && counts[mid][tid] != null){ counts[mid][tid]++; }
        }
      }
      if(d.hl){
        for(const k of ["highest","lowest"]){
          if(d.hl[k]) hl[k][d.hl[k]] = (hl[k][d.hl[k]]||0)+1;
        }
      }
    });

    for(const m of w.matchups){
      const bar = document.getElementById(`bar-${w.id}-${m.id}`);
      const lab = document.getElementById(`lab-${w.id}-${m.id}`);
      if(!lab) continue;

      const a = counts[m.id][m.home];
      const b = counts[m.id][m.away];
      const total = a+b;
      let pctA = 0, pctB = 0;
      if(total>0){ pctA = Math.round((a/total)*100); pctB = 100-pctA; }

      if(show){
        if(bar){ bar.style.width = `${Math.max(pctA,pctB)}%`; }
        lab.textContent = `${state.teams[m.home]?.name||m.home} ${pctA}%  •  ${state.teams[m.away]?.name||m.away} ${pctB}%  •  ${total} votes`;
      } else {
        if(bar){ bar.style.width = "0%"; }
        lab.textContent = "Votes hidden until reveal";
      }
    }

    // HL leader reveal
    const box = document.getElementById(`hl-reveal-${w.id}`);
    if(box){
      if(show){
        const hi = leaders(hl.highest);
        const lo = leaders(hl.lowest);
        const hiNames = hi.length? hi.map(id=> state.teams[id]?.name||id).join(", ") : "TBD";
        const loNames = lo.length? lo.map(id=> state.teams[id]?.name||id).join(", ") : "TBD";
        box.innerHTML = `<span class="badge">Highest leader ${hiNames}</span> <span class="badge">Lowest leader ${loNames}</span>`;
      } else {
        box.innerHTML = `<span class="bar-label">Leaders reveal at ${fmt.format(new Date(w.revealAt))}</span>`;
      }
    }
  });
}

// -------------------- helpers --------------------
function logoHTML(team){
  if(!team) return "";
  return `<img src="${team.logo}" alt="${team.name} logo" loading="lazy">`;
}
function crownHTML(){
  return `<span class="crown" title="Defending Champion">👑</span>`;
}
function winnerBadge(w, m){
  const win = w.winners && w.winners[m.id];
  if(!win) return "";
  const who = state.teams[win]?.name || win;
  return `<div style="position:absolute;bottom:8px;right:8px" class="badge win">Winner ${who}</div>`;
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
