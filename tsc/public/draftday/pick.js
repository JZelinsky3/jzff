// ── pick.js — the phone page a manager makes their pick on ────────────────
//
// The page is built around what a pick physically is: a card. He fills one
// out, he holds a button to hand it over, and it sits at the podium until the
// commissioner reads it out on the television. Nothing about that is
// decoration — it is why the ceremony on the board works, and the phone is the
// only place in the whole thing where a person actually does something.

import * as C from "./core.js";

const $ = id => document.getElementById(id);
const LS_ME = "pams_draft_me";
const LS_STAR = "pams_draft_stars";
const HOLD_MS = 900;

let STATE = { ...C.DEFAULT_STATE };
let PICKS = [];
let ME = null;                       // the manager object for this phone
let filter = "ALL";
let query = "";
let limit = 40;
let chosen = null;                   // player queued on the card
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
  $("pbar").hidden = true;
  $("room").hidden = true;

  // In draft order, and every seat carries the number as well as the face:
  // half the room is looking for where they pick rather than for themselves.
  $("mgrid").innerHTML = C.DATA.managers
    .slice().sort((a, b) => a.slot - b.slot)
    .map(m => {
      const ls = m.last_season || {};
      const conf = (m.conference || "").toLowerCase();
      const champ = ls.finish === 1;
      const tag = champ
        ? "&#9733; Defending champion"
        : [m.conference, ls.record].filter(Boolean).join(" &middot; ");
      return `
        <button class="ci-seat${conf ? ` conf-${conf}` : ""}${champ ? " champ" : ""}"
                type="button" data-name="${C.escapeHtml(m.name)}">
          <div class="ci-no">${m.slot}</div>
          <div class="ci-shot${m.cutout ? "" : " nof"}">
            <div class="ci-fb">${C.escapeHtml(m.name[0])}</div>
            ${m.cutout
              ? `<img src="${m.cutout}" alt=""
                      onerror="this.parentElement.classList.add('nof');this.remove()">`
              : ""}
          </div>
          <div class="ci-id">
            <div class="ci-n">${C.escapeHtml(m.name)}</div>
            <div class="ci-t">${C.escapeHtml((m.team || "").trim())}</div>
            <div class="ci-tag">${tag || "&nbsp;"}</div>
          </div>
        </button>`;
    }).join("");

  $("mgrid").onclick = e => {
    const seat = e.target.closest(".ci-seat");
    if (!seat) return;
    ME = C.DATA.managers.find(m => m.name === seat.dataset.name);
    localStorage.setItem(LS_ME, ME.name);
    $("chooser").hidden = true;
    enterRoom();
  };
}

function enterRoom() {
  $("pbar").hidden = false;
  $("room").hidden = false;
  $("who").innerHTML =
    (ME.cutout ? `<img src="${ME.cutout}" alt="" onerror="this.remove()">` : "") +
    `<span>${C.escapeHtml(ME.name.toUpperCase())}</span>`;
  $("who").style.cursor = "pointer";
  // Native dialogs are unreliable inside some phone shells, so handing the
  // seat back is not gated on one: it drops the saved name and reloads into
  // check-in, which is a screen he can simply walk back out of.
  $("who").onclick = () => {
    localStorage.removeItem(LS_ME);
    location.href = location.pathname;
  };

  buildFilters();
  C.watchState(s => { STATE = s; renderStatus(); renderSent(); renderList(); });
  C.watchPicks(p => { PICKS = p; renderRoster(); renderList(); });
  C.startSleeperSync(() => PICKS);
  setInterval(renderClock, 250);
}

// ── status ────────────────────────────────────────────────────────────────

function onTheClock() {
  return STATE.status === "clock" && C.slotOf(STATE.current) === ME.slot;
}

/** His own card is at the podium, waiting to be read out. */
function myCardIsIn() {
  return STATE.status === "pick_in" && C.slotOf(STATE.current) === ME.slot;
}

function renderStatus() {
  const box = $("status"), o = STATE.current || 1;
  const mgr = C.managerOf(o);
  const mine = C.slotOf(o) === ME.slot;
  const live = mine && STATE.status === "clock";

  box.classList.toggle("live", live);
  // One class on the body, so the list header and the rows can answer the
  // question the status card is answering rather than each working it out.
  document.body.classList.toggle("armed", live);

  // The clock is running through the reveal now — it starts the moment a pick
  // lands rather than when the commissioner advances — so the phone shows it
  // through the reveal too, and says whose it is.
  // Nothing to show through a reveal at the turn of a round: the next round's
  // clock does not start until the commissioner advances into it.
  $("stClock").hidden = STATE.status !== "clock" &&
    !(STATE.status === "revealed" && STATE.clockEnds);

  if (STATE.status === "idle") {
    $("stEb").textContent = "PA Milk Society";
    $("stBig").textContent = "Not started";
    $("stSm").innerHTML =
      `You are seat <b>${ME.slot}</b>, and you open with pick <b>${ME.slot}</b>.`;
    $("plistHd").textContent = "The board";
    return;
  }

  if (STATE.status === "pick_in") {
    $("stEb").textContent = "Hold";
    $("stBig").textContent = "The card is in";
    // Nothing about who. The board is deliberately not telling the room yet,
    // and eleven phones saying the name would be the same leak by another
    // route — the same reason the player is left on the list until the reveal.
    $("stSm").innerHTML = mine
      ? "Your card is at the podium. Watch the television."
      : `<b>${C.escapeHtml(mgr ? mgr.name : "")}</b> is up on the screen.`;
    $("plistHd").textContent = "The board";
    return;
  }

  if (STATE.status === "revealed") {
    const nextO = Math.min(o + 1, C.TOTAL);
    const nextM = C.managerOf(nextO);
    const upNext = C.slotOf(nextO) === ME.slot;
    $("stEb").textContent = `Pick ${o}`;
    $("stBig").textContent = STATE.pending ? STATE.pending.name : "On the board";
    $("stSm").innerHTML = mine
      ? `Enter him in Sleeper now. <b>${C.escapeHtml(nextM ? nextM.name : "The next man")}</b> is on the clock.`
      : upNext
        ? "You are up next and your clock is already running."
        : `<b>${C.escapeHtml(nextM ? nextM.name : "")}</b> is on the clock.`;
    $("plistHd").textContent = "The board";
    return;
  }

  if (mine) {
    $("stEb").textContent = "You are on the clock";
    $("stBig").textContent = `Pick ${o}`;
    $("stSm").innerHTML =
      `Round <b>${C.roundOf(o)}</b>, pick <b>${C.roundPickOf(o)}</b>. Tap a man to fill out the card.`;
    $("plistHd").textContent = "Fill out the card";
  } else {
    const next = C.nextPickForSlot(ME.slot, o);
    $("stEb").textContent = "On the clock";
    $("stBig").textContent = mgr ? mgr.name : "—";
    $("stSm").innerHTML = next
      ? `You are up at pick <b>${next}</b>, ${next - o} away.`
      : "Your draft is done.";
    $("plistHd").textContent = "Scouting";
  }
}

function renderClock() {
  if (STATE.status !== "clock" && STATE.status !== "revealed") return;
  const el = $("stTime");
  const total = STATE.pickMs || (C.DATA.meta.pick_seconds || 120) * 1000;
  // Held at the full pick length while the board is still announcing him — his
  // phone must not be counting down time he has not been given yet.
  const left = C.msLeft(STATE) ?? 0;

  el.textContent = C.mmss(left);
  el.classList.toggle("held",  !!STATE.paused);
  el.classList.toggle("warn",  !STATE.paused && left <= 30000 && left > 10000);
  el.classList.toggle("panic", !STATE.paused && left <= 10000);
  $("stTag").hidden = !STATE.paused;

  // The bar is the clock said a second way, for the half of the room that is
  // looking at the phone out of the corner of an eye. Scaled rather than
  // resized so it is one composited property and not a layout every 250ms.
  const frac = Math.max(0, Math.min(1, total ? left / total : 0));
  $("stBarFill").style.transform = `scaleX(${frac})`;
}

// ── the card at the podium ────────────────────────────────────────────────

/**
 * His own sent card, held until the board reveals it.
 *
 * Only ever on the phone that sent it. The other eleven get the status card's
 * "the card is in" and nothing else — no name, and no gap in the list where
 * the name used to be.
 */
function renderSent() {
  const on = myCardIsIn() && STATE.pending;
  $("sent").classList.toggle("open", !!on);
  if (!on) return;

  const p = STATE.pending;
  const img = $("sentImg");
  const src = C.headshot(p);
  if (img.getAttribute("src") !== src) { img.style.visibility = ""; img.src = src; }
  img.onerror = () => { img.style.visibility = "hidden"; };
  $("sentName").textContent = p.name;
  $("sentSub").textContent =
    `${p.pos}${p.posrank || ""} · ${p.team || ""}`.replace(/ · $/, "");
  $("sentPk").textContent = STATE.current;
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

/**
 * Everyone still on the board.
 *
 * `PICKS` and nothing else, and that is load-bearing rather than incidental.
 * A pick only becomes a document in `PICKS` when the commissioner commits it,
 * which is at the announce — while a card is at the podium the man on it is
 * still in this list on all twelve phones, exactly as he was a minute ago.
 *
 * `STATE.pending` must never be filtered here. Every phone can read it, so
 * taking the pending man out of the list would hand the whole room the pick
 * the board is holding back — not by naming him, but by leaving a hole where
 * he was, which anybody scrolling their own board would spot inside a few
 * seconds. The ceremony on the television is only worth running if the phones
 * give nothing away.
 */
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

  $("more").textContent = list.length > limit ? `${limit} of ${list.length}` : `${list.length}`;
  $("hint").textContent = list.length > limit
    ? "Scroll for more"
    : (list.length ? "" : "Nobody matches that");

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
    openCard(C.DATA.byId.get(row.dataset.id));
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

// ── the card ──────────────────────────────────────────────────────────────

function openCard(p) {
  if (!p) return;
  chosen = p;
  const o = STATE.current || 1;

  $("csRound").textContent = C.roundOf(o);
  $("csPick").textContent  = C.roundPickOf(o);
  $("csOv").textContent    = o;
  $("csClub").textContent  = (ME.team || "").trim() || ME.name;

  $("shImg").src = C.headshot(p);
  $("shName").textContent = p.name;
  $("shSub").innerHTML =
    `<span class="pos">${p.pos}${p.posrank}</span> · ${C.escapeHtml(p.team)}` +
    ` · Sleeper rank ${p.board}` + (p.rookie ? " · Rookie" : "");

  const v = C.verdict(o, p.board);
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
  $("shNote").innerHTML = note.join(" ");

  const { need } = C.rosterFor(PICKS, ME.slot);
  const filling = need.includes(p.pos) || (need.includes("FLEX") && ["RB","WR","TE"].includes(p.pos));
  $("shWarn").textContent = filling
    ? ""
    : `Heads up, your ${p.pos} starters are already set. This is a bench pick.`;

  resetHold();
  $("sheet").classList.add("open");
}

function closeCard() {
  $("sheet").classList.remove("open");
  resetHold();
  chosen = null;
}

$("shCancel").onclick = closeCard;
$("sheet").onclick = e => { if (e.target === $("sheet")) closeCard(); };

// ── hold to send ──────────────────────────────────────────────────────────
//
// The only irreversible thing anybody does on this phone, and it used to be a
// tap on a button an inch under a list he was scrolling with his thumb. The
// hold is not an extra confirmation step bolted on top of that button — it is
// that button, and it cannot fire by brushing the screen.

let holdTimer = null;

function resetHold() {
  clearTimeout(holdTimer); holdTimer = null;
  const btn = $("shGo");
  btn.classList.remove("arm", "done", "fail");
  btn.disabled = false;
  btn.style.setProperty("--hold-ms", `${HOLD_MS}ms`);
  $("shGoL").textContent = "Hold to send";
}

function startHold(e) {
  if (!chosen || !onTheClock() || $("shGo").disabled) return;
  e.preventDefault();
  const btn = $("shGo");
  btn.classList.add("arm");
  $("shGoL").textContent = "Keep holding";
  holdTimer = setTimeout(send, HOLD_MS);
}

function cancelHold() {
  if (holdTimer === null) return;
  clearTimeout(holdTimer); holdTimer = null;
  const btn = $("shGo");
  if (btn.classList.contains("done")) return;
  btn.classList.remove("arm");
  $("shGoL").textContent = "Hold to send";
}

const go = $("shGo");
go.addEventListener("pointerdown", startHold);
go.addEventListener("pointerup", cancelHold);
go.addEventListener("pointercancel", cancelHold);
go.addEventListener("pointerleave", cancelHold);
// Safari fires a synthetic click after the pointer sequence; without this the
// card can close underneath a hold that was deliberately let go of early.
go.addEventListener("click", e => e.preventDefault());

async function send() {
  holdTimer = null;
  const btn = $("shGo"), player = chosen;
  if (!player || !onTheClock()) { resetHold(); return; }

  // He may have gone in Sleeper in the seconds since this list drew.
  if (C.isTaken(PICKS, player.id)) {
    btn.classList.remove("arm");
    btn.classList.add("fail");
    $("shGoL").textContent = `${player.name} is gone`;
    setTimeout(() => { closeCard(); renderList(); }, 1800);
    return;
  }

  btn.disabled = true;
  btn.classList.add("done");
  $("shGoL").textContent = "To the podium";
  try {
    await C.submitPick(STATE.current, player);
    if (navigator.vibrate) navigator.vibrate([40, 60, 120]);
    // The sent-card screen takes over from the state write, so the card is
    // simply cleared out from under it rather than animated away.
    $("sheet").classList.remove("open");
    chosen = null;
    resetHold();
  } catch (err) {
    btn.disabled = false;
    btn.classList.remove("arm", "done");
    btn.classList.add("fail");
    $("shGoL").textContent = "Failed, hold again";
    setTimeout(() => {
      if (!$("shGo").classList.contains("done")) resetHold();
    }, 2200);
  }
}
