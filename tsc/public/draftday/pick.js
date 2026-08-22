// ── pick.js — the phone page a manager makes their pick on ────────────────

import * as C from "./core.js";

const $ = id => document.getElementById(id);
const LS_ME = "pams_draft_me";
const LS_STAR = "pams_draft_stars";

let STATE = { ...C.DEFAULT_STATE };
let PICKS = [];
let ME = null;                       // the manager object for this phone
let filter = "ALL";
let query = "";
let limit = 40;
let chosen = null;                   // player queued in the confirm sheet
let stars = new Set(JSON.parse(localStorage.getItem(LS_STAR) || "[]"));

await C.loadData();
await C.refreshLateJoiners();

// ── identity ──────────────────────────────────────────────────────────────

const urlMe = new URLSearchParams(location.search).get("me");
const savedMe = urlMe || localStorage.getItem(LS_ME);
if (savedMe) ME = C.DATA.managers.find(m => m.name.toLowerCase() === savedMe.toLowerCase());

if (ME) enterRoom(); else showChooser();

function showChooser() {
  $("chooser").hidden = false;
  $("room").hidden = true;
  $("mgrid").innerHTML = C.DATA.managers
    .slice().sort((a, b) => a.slot - b.slot)
    .map(m => `
      <div class="mcard" data-name="${C.escapeHtml(m.name)}">
        ${m.cutout
          ? `<img src="${m.cutout}" alt="">`
          : `<div class="fb">${C.escapeHtml(m.name[0])}</div>`}
        <div class="n">${C.escapeHtml(m.name)}</div>
        <div class="s">PICK ${m.slot}</div>
      </div>`).join("");

  $("mgrid").onclick = e => {
    const card = e.target.closest(".mcard");
    if (!card) return;
    ME = C.DATA.managers.find(m => m.name === card.dataset.name);
    localStorage.setItem(LS_ME, ME.name);
    $("chooser").hidden = true;
    enterRoom();
  };
}

function enterRoom() {
  $("room").hidden = false;
  $("who").innerHTML =
    (ME.cutout ? `<img src="${ME.cutout}" alt="" onerror="this.remove()">` : "") +
    `<span>${C.escapeHtml(ME.name.toUpperCase())}</span>`;
  $("who").style.cursor = "pointer";
  $("who").onclick = () => {
    if (confirm) { /* dialogs are unreliable in some shells; just switch */ }
    localStorage.removeItem(LS_ME);
    location.href = location.pathname;
  };

  buildFilters();
  C.watchState(s => { STATE = s; renderStatus(); renderList(); });
  C.watchPicks(p => { PICKS = p; renderRoster(); renderList(); });
  C.startSleeperSync(() => PICKS);
  setInterval(renderClock, 250);
}

// ── status ────────────────────────────────────────────────────────────────

function onTheClock() {
  return STATE.status === "clock" && C.slotOf(STATE.current) === ME.slot;
}

function renderStatus() {
  const box = $("status"), o = STATE.current || 1;
  const mgr = C.managerOf(o);
  const mine = C.slotOf(o) === ME.slot;

  box.classList.toggle("live", mine && STATE.status === "clock");
  // The clock is running through the reveal now — it starts the moment a pick
  // lands rather than when the commissioner advances — so the phone shows it
  // through the reveal too, and says whose it is.
  // Nothing to show through a reveal at the turn of a round: the next round's
  // clock does not start until the commissioner advances into it.
  $("stClock").hidden = STATE.status !== "clock" &&
    !(STATE.status === "revealed" && STATE.clockEnds);

  if (STATE.status === "idle") {
    $("stEb").textContent = "PA MILK SOCIETY";
    $("stBig").textContent = "NOT STARTED";
    $("stSm").textContent = `You pick ${C.ordinal(ME.slot)} in round one.`;
    return;
  }

  if (STATE.status === "pick_in") {
    $("stEb").textContent = "HOLD";
    $("stBig").textContent = "THE PICK IS IN";
    $("stSm").textContent = mine
      ? "Your pick is locked. Watch the TV."
      : `${mgr ? mgr.name : ""} is up on the screen.`;
    return;
  }

  if (STATE.status === "revealed") {
    const nextO = Math.min(o + 1, C.TOTAL);
    const nextM = C.managerOf(nextO);
    const upNext = C.slotOf(nextO) === ME.slot;
    $("stEb").textContent = `PICK ${o}`;
    $("stBig").textContent = STATE.pending ? STATE.pending.name : "ON THE BOARD";
    $("stSm").textContent = mine
      ? `Enter him in Sleeper now. ${nextM ? nextM.name : "The next man"} is on the clock.`
      : upNext
        ? "You are up next and your clock is already running."
        : `${mgr ? mgr.name : ""} · ${nextM ? nextM.name : ""} is on the clock.`;
    return;
  }

  if (mine) {
    $("stEb").textContent = "YOU ARE ON THE CLOCK";
    $("stBig").textContent = `PICK ${o}`;
    $("stSm").textContent = `Round ${C.roundOf(o)}, pick ${C.roundPickOf(o)}. Tap a player.`;
  } else {
    const next = C.nextPickForSlot(ME.slot, o);
    $("stEb").textContent = "ON THE CLOCK";
    $("stBig").textContent = mgr ? mgr.name : "—";
    $("stSm").textContent = next
      ? `You're up at pick ${next}, ${next - o} away.`
      : "Your draft is done.";
  }
}

function renderClock() {
  if (STATE.status !== "clock" && STATE.status !== "revealed") return;
  const el = $("stClock");
  let left = STATE.paused
    ? (STATE.pausedLeft ?? 0)
    : (STATE.clockEnds ? STATE.clockEnds - Date.now() : 0);
  el.textContent = STATE.paused ? `${C.mmss(left)} paused` : C.mmss(left);
  el.classList.toggle("warn",  left <= 30000 && left > 10000);
  el.classList.toggle("panic", left <= 10000);
}

// ── roster ────────────────────────────────────────────────────────────────

function renderRoster() {
  const { picks } = C.rosterFor(PICKS, ME.slot);
  const next = C.nextPickForSlot(ME.slot, (STATE.current || 1));
  const slots = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"];
  const pool = picks.slice();
  const rows = [];

  for (const s of slots) {
    let idx = -1;
    if (s === "FLEX") idx = pool.findIndex(p => ["RB", "WR", "TE"].includes(p.pos));
    else idx = pool.findIndex(p => p.pos === s);
    const p = idx >= 0 ? pool.splice(idx, 1)[0] : null;
    rows.push(`
      <div class="rslot">
        <span class="s ${s === "FLEX" ? "pos-RB" : "pos-" + s}">${s}</span>
        ${p ? `<span class="nm">${C.escapeHtml(p.name)}</span>
              <span class="t">${C.escapeHtml(p.nflTeam || "")}</span>`
            : `<span class="nm e">open</span><span class="t"></span>`}
      </div>`);
  }
  pool.forEach(p => rows.push(`
    <div class="rslot">
      <span class="s" style="color:var(--mute)">BN</span>
      <span class="nm">${C.escapeHtml(p.name)}</span>
      <span class="t">${C.escapeHtml(p.nflTeam || "")}</span>
    </div>`));

  $("rosterBox").innerHTML = `
    <div class="hd">
      <span>YOUR ROSTER · ${picks.length} PICK${picks.length === 1 ? "" : "S"}</span>
      ${next ? `<span class="np">NEXT: ${next}</span>` : ""}
    </div>
    <div class="rgrid">${rows.join("")}</div>`;
}

// ── player list ───────────────────────────────────────────────────────────

function buildFilters() {
  // "SAVED" rather than a star glyph: JetBrains Mono renders U+2605 as a
  // thin asterisk that reads as a typo on the chip.
  const opts = ["ALL", "SAVED", ...C.POS_ORDER];
  $("filters").innerHTML = opts.map(o =>
    `<button class="fbtn${o === filter ? " on" : ""}" data-f="${o}">${o}</button>`).join("");
  $("filters").onclick = e => {
    const b = e.target.closest(".fbtn");
    if (!b) return;
    filter = b.dataset.f; limit = 40;
    [...$("filters").children].forEach(c => c.classList.toggle("on", c === b));
    renderList();
  };
  $("q").oninput = e => { query = e.target.value.trim().toLowerCase(); limit = 40; renderList(); };
}

function candidates() {
  const gone = new Set(PICKS.map(p => p.playerId));
  let list = C.DATA.players.filter(p => !gone.has(p.id));
  if (filter === "SAVED") list = list.filter(p => stars.has(p.id));
  else if (filter !== "ALL") list = list.filter(p => p.pos === filter);
  if (query) {
    list = list.filter(p =>
      p.n.includes(query) || p.team.toLowerCase() === query || p.name.toLowerCase().includes(query));
  }
  return list;
}

function renderList() {
  const list = candidates();
  const shown = list.slice(0, limit);
  const mine = onTheClock();

  // Fixed sub-line columns so position, team and flags line up down the list
  // instead of shifting with name length. No previous-owner note here: it is
  // the reveal's job on the television, and it made every row read the same.
  $("plist").innerHTML = shown.map(p => `
      <div class="prow${stars.has(p.id) ? " starred" : ""}" data-id="${p.id}"
           style="border-left-color:var(--${p.pos.toLowerCase()})">
        <img src="${C.headshot(p)}" alt="" loading="lazy"
             onerror="this.style.visibility='hidden'">
        <div style="min-width:0">
          <div class="nm">${C.escapeHtml(p.name)}</div>
          <div class="sub">
            <span class="c-pos pos-${p.pos}">${p.pos}${p.posrank}</span>
            <span class="c-tm">${C.escapeHtml(p.team)}</span>
            <span class="c-flag">${
              p.rookie ? '<span class="r">ROOKIE</span>'
              : p.inj ? `<span class="inj">${C.escapeHtml(p.inj)}</span>` : ""}</span>
          </div>
        </div>
        <div class="prow-right">
          <span class="rk">${p.board}</span>
          <span class="star" data-star="${p.id}">&#9733;</span>
        </div>
      </div>`).join("");

  $("more").textContent = list.length > limit
    ? `Showing ${limit} of ${list.length}, scroll for more`
    : (list.length ? `${list.length} available` : "Nobody matches that");

  $("plist").onclick = e => {
    const star = e.target.closest("[data-star]");
    if (star) {
      const id = star.dataset.star;
      stars.has(id) ? stars.delete(id) : stars.add(id);
      localStorage.setItem(LS_STAR, JSON.stringify([...stars]));
      renderList();
      return;
    }
    const row = e.target.closest(".prow");
    if (!row) return;
    if (!mine) { flashNotYours(); return; }
    openSheet(C.DATA.byId.get(row.dataset.id));
  };
}

// Infinite-ish scroll.
window.addEventListener("scroll", () => {
  if (window.innerHeight + window.scrollY < document.body.offsetHeight - 400) return;
  const list = candidates();
  if (limit >= list.length) return;
  limit += 40;
  renderList();
}, { passive: true });

function flashNotYours() {
  const box = $("status");
  box.animate(
    [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" },
     { transform: "translateX(6px)" }, { transform: "translateX(0)" }],
    { duration: 260 });
}

// ── confirm sheet ─────────────────────────────────────────────────────────

function openSheet(p) {
  if (!p) return;
  chosen = p;
  $("shImg").src = C.headshot(p);
  $("shName").textContent = p.name;
  $("shSub").innerHTML =
    `<span class="pos-${p.pos}">${p.pos}${p.posrank}</span> · ${C.escapeHtml(p.team)}` +
    ` · SLEEPER RANK ${p.board}` + (p.rookie ? " · ROOKIE" : "");

  const v = C.verdict(STATE.current, p.board);
  const hist = C.historyFor(p);
  const note = [];
  if (v && v.gap >= 12) note.push(`He has fallen <b>${v.gap} past</b> his ranking.`);
  if (v && v.gap <= -12) note.push(`That is <b>${Math.abs(v.gap)} picks early</b>.`);
  if (hist.length) {
    const last = hist[0];
    note.push(`Last drafted in PAMS <b>${last.y}</b>, pick ${last.p}, by <b>${last.m}</b>.`);
  } else if (!p.rookie) {
    note.push(`<b>Never drafted</b> in PA Milk Society.`);
  }
  $("shNote").innerHTML = note.join(" ") || "&nbsp;";

  const { need } = C.rosterFor(PICKS, ME.slot);
  const filling = need.includes(p.pos) || (need.includes("FLEX") && ["RB","WR","TE"].includes(p.pos));
  $("shWarn").textContent = filling
    ? ""
    : `Heads up, your ${p.pos} starters are already set. This is a bench pick.`;

  $("sheet").classList.add("open");
}

$("shCancel").onclick = () => { $("sheet").classList.remove("open"); chosen = null; };
$("sheet").onclick = e => { if (e.target === $("sheet")) $("shCancel").click(); };

$("shGo").onclick = async () => {
  if (!chosen || !onTheClock()) return;
  const btn = $("shGo");

  // He may have been taken in Sleeper in the seconds since this list drew.
  if (C.isTaken(PICKS, chosen.id)) {
    btn.textContent = `${chosen.name} is already gone`;
    setTimeout(() => {
      $("sheet").classList.remove("open");
      btn.textContent = "Send the pick";
      chosen = null;
      renderList();
    }, 1600);
    return;
  }

  btn.disabled = true;
  btn.textContent = "Sending…";
  try {
    await C.submitPick(STATE.current, chosen);
    $("sheet").classList.remove("open");
    if (navigator.vibrate) navigator.vibrate([40, 60, 120]);
  } catch (err) {
    btn.textContent = "Failed, tap to retry";
  } finally {
    btn.disabled = false;
    setTimeout(() => { btn.textContent = "Send the pick"; }, 1200);
    chosen = null;
  }
};
