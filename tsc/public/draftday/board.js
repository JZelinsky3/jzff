// ── board.js — the television ─────────────────────────────────────────────
// Read-only. It never writes state; the phone and the console drive it.

import * as C from "./core.js";
import { onClockLine, pickLine, selectionLine, ordinalPick } from "./voice.js";

const $ = id => document.getElementById(id);
const body = document.body;

// For the ghosted numeral behind the power-rank badge. Twelve teams, so the
// table only has to run that far.
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI",
               "VII", "VIII", "IX", "X", "XI", "XII"];

/** #rrggbb -> rgba(...) at the given alpha, for the team-colour glows. */
function tcAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
/** Sets the --tc custom property a photo's glow reads, from the player's
    team. Falls back to gold (the CSS default) when there's no team — FA,
    or a defense, whose "team" field is its own abbreviation anyway. */
function setTeamGlow(el, teamAbbr, alpha) {
  const hex = C.teamColor(teamAbbr);
  el.style.setProperty("--tc", hex ? tcAlpha(hex, alpha) : "");
}

// Floor for Still On The Board, matching the lineup's seven named slots.
// It's only a floor: the list is rendered to whatever the lineup came out
// at, and the rows divide the card, so this never has to match a row height
// in the CSS the way it used to.
const BA_ROWS = 7;

// How long the big selection graphic holds before it collapses into the
// detail screen. Override with ?sel=8000 to retime it on the night, or a huge
// number to park on the graphic and look at it.
const SELECTION_MS = Number(
  new URLSearchParams(location.search).get("sel")) || 6000;

let STATE = { ...C.DEFAULT_STATE };
let PICKS = [];
let lastPickCount = 0;
let phase = null;              // 'selection' | 'details'
let phaseTimer = null;
// How many rows the lineup panel actually drew, set by renderLineup() and
// read by renderBestAvailable() right after — so best available never sits
// shorter than the lineup beside it once a manager is a few picks deep.
let lineupRows = BA_ROWS;

await C.loadData();
C.refreshLateJoiners().then(() => renderAll());
setInterval(() => C.refreshLateJoiners().then(ch => ch && renderAll()), 60000);

C.watchState(s => {
  const prev = STATE;
  STATE = s;
  applyPhase(prev.status, s.status);
  renderAll();
});

C.watchPicks(p => {
  PICKS = p; lastPickCount = p.length;
  renderAll();
});

C.startSleeperSync(() => PICKS);

window.addEventListener("online",  () => body.classList.remove("is-offline"));
window.addEventListener("offline", () => body.classList.add("is-offline"));

/**
 * Fit the 1920x1080 canvas to whatever screen it lands on.
 *
 * The board used to mix vw and vh units, so mirroring a 16:10 laptop onto a
 * 16:9 television stretched the cards out of proportion. Now the whole
 * broadcast is one fixed canvas fit by a single factor: it is proportionally
 * identical at any size, and any leftover space is letterbox showing the set.
 *
 * `zoom` rather than `transform: scale()`. A CSS transform paints the frame
 * at its native 1920x1080 size and then resamples that bitmap down to fit —
 * and the fit factor is essentially never a clean number (a 1512-wide laptop
 * gives 0.7875), so every hairline border lands on a fractional pixel and
 * blurs. `zoom` instead changes the box's used values before layout, the same
 * as if every length in the stylesheet were multiplied by it, so the browser
 * lays out and rasterizes directly at the final size — no resample, no
 * softness. Falls back to the old transform for browsers without `zoom`
 * (Firefox before 126).
 */
function fitFrame() {
  const f = $("frame");
  if (!f) return;
  const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  if (window.CSS && CSS.supports("zoom", "1")) {
    f.style.zoom = s;
    f.style.transform = "translate(-50%, -50%)";
  } else {
    f.style.zoom = "";
    f.style.transform = `translate(-50%, -50%) scale(${s})`;
  }
}
fitFrame();
window.addEventListener("resize", fitFrame);
// Mirroring to a television often reports the new size a beat late.
window.addEventListener("orientationchange", () => setTimeout(fitFrame, 250));
setTimeout(fitFrame, 500);

let wakeLock = null;
async function keepAwake() {
  try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); }
  catch (_) { /* unsupported or denied */ }
}
document.addEventListener("click", keepAwake, { once: true });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") keepAwake();
});

/**
 * The reveal runs as one continuous sequence on the board rather than as
 * extra states in Firestore, so the console stays a simple four-state
 * machine and the timing never depends on the network.
 *
 *   status -> revealed   phase = selection   (big graphic, 5s)
 *                        phase = details     (portrait shrinks, board returns)
 */
// The round the board has already announced. Seeded on the first state we
// see rather than at zero, so opening the page in the middle of round four
// doesn't play a round-four card at whoever is watching.
let lastRound = null;

function applyPhase(prevStatus, nextStatus) {
  clearTimeout(phaseTimer);

  if (nextStatus !== "revealed") {
    phase = null;
    body.className = `board state-${nextStatus}`;

    const round = C.roundOf(STATE.current || 1);
    // Only the formal advance — Next Pick, revealed to clock — earns a card.
    // Not idle to clock at the very start: the resting state already makes an
    // entrance of its own there.
    if (nextStatus === "clock" && prevStatus === "revealed") {
      // A new round leads, then the manager who opens it. showAnnounce()
      // queues them so they play in that order rather than on top of us.
      if (lastRound !== null && round > lastRound) announceRound(round);
      announceOnClock();
    } else if (nextStatus === "idle" || nextStatus === "pick_in") {
      clearAnnounce();
    }
    lastRound = round;
    return;
  }

  lastRound = C.roundOf(STATE.current || 1);

  if (prevStatus !== "revealed") {
    phase = "selection";
    sting();
    phaseTimer = setTimeout(() => {
      phase = "details";
      body.className = "board state-revealed phase-details";
      renderAll();
    }, SELECTION_MS);
  }
  body.className = `board state-revealed phase-${phase || "details"}`;
}

// ── the full-screen announcements ─────────────────────────────────────────
//
// A queue rather than a pair of independent timers. The last pick of a round
// fires both of these at once — new round, and the manager who leads it off —
// and without a queue the second would overwrite the first mid-animation. One
// plays out, then the next starts.

const ONCARD_MS = 5200;
const ROUNDCARD_MS = 4600;

let annQueue = [];
let annTimer = null;
let annShowing = null;

function showAnnounce(el, ms) {
  annQueue.push([el, ms]);
  if (!annShowing) runAnnounce();
}

function runAnnounce() {
  const next = annQueue.shift();
  if (!next) { annShowing = null; return; }
  const [el, ms] = next;
  annShowing = el;
  el.classList.add("show");
  annTimer = setTimeout(() => {
    el.classList.remove("show");
    // Let the card clear before the next one paints over the same space.
    annTimer = setTimeout(runAnnounce, 260);
  }, ms);
}

/** Drop everything queued or showing — a state jump shouldn't leave a card up. */
function clearAnnounce() {
  clearTimeout(annTimer);
  annQueue = [];
  annShowing = null;
  $("onCard").classList.remove("show");
  $("roundCard").classList.remove("show");
}

/** "X is now on the clock", full screen, the way the pick reveal is. */
function announceOnClock() {
  const o = STATE.current || 1;
  const m = C.managerOf(o);
  if (!m) return;

  const img = $("ocShot");
  if (m.cutout || m.avatar) {
    img.src = m.cutout || m.avatar;
    img.style.display = "";
    img.onerror = () => { img.style.display = "none"; };
  } else img.style.display = "none";

  $("ocEyebrow").textContent =
    `ROUND ${C.roundOf(o)} · PICK ${C.roundPickOf(o)} · ${ordinalPick(o).toUpperCase()} OVERALL`;

  const nameEl = $("ocName");
  nameEl.textContent = m.name.toUpperCase();
  nameEl.classList.toggle("long", m.name.length > 7);

  $("ocTeam").innerHTML = teamLine(m);

  const facts = [];
  if (m.power_rank) {
    facts.push(`<div><span class="k">Power rank</span>
      <span class="v">#${m.power_rank}</span></div>`);
  }
  const ls = m.last_season || {};
  if (ls.record) {
    facts.push(`<div><span class="k">2025</span>
      <span class="v">${C.escapeHtml(ls.record)}${ls.finish ? `, ${ordinalPick(ls.finish)}` : ""}</span></div>`);
  }
  const next = C.nextPickForSlot(m.slot, o + 1);
  if (next) {
    facts.push(`<div><span class="k">Next pick</span>
      <span class="v">${ordinalPick(next)}</span></div>`);
  }
  // The 2026 schedule. This card has the room for it and nothing else on the
  // board says who anyone actually plays.
  const wk1 = C.week1For(m.name);
  if (wk1) {
    facts.push(`<div><span class="k">Week 1</span>
      <span class="v">${C.escapeHtml(wk1)}</span></div>`);
  }
  const rival = C.rivalOf(m.name);
  if (rival) {
    facts.push(`<div><span class="k">Rival</span>
      <span class="v">${C.escapeHtml(rival)}</span></div>`);
  }
  $("ocFacts").innerHTML = facts.join("");

  showAnnounce($("onCard"), ONCARD_MS);
}

/** The top of a round: the numeral, the pick range, and the order it runs in. */
function announceRound(round) {
  $("rcNum").textContent = round;
  const first = (round - 1) * C.TEAMS + 1;
  $("rcOf").textContent = `of ${C.DATA.meta.rounds}`;
  $("rcSub").textContent = `Picks ${first}–${first + C.TEAMS - 1}`;
  // Which way the snake is pointing. It is the one thing about a new round
  // that is actually news, and the order underneath is the proof of it.
  $("rcTurn").textContent = round % 2 ? "Order runs 1 through 12" : "Order runs 12 through 1";

  const cells = [];
  for (let i = 0; i < C.TEAMS; i++) {
    const n = first + i;
    const m = C.managerOf(n);
    // The cut-out on the leadoff slot only. Twelve of them would be a team
    // photo; one is a face to put to the name that is about to be called.
    const face = i === 0 && m && m.cutout
      ? `<img class="rc-face" src="${m.cutout}" alt="" onerror="this.remove()">` : "";
    cells.push(`<span class="rc-slot${i === 0 ? " first" : ""}">
      ${face}<i>${round}.${String(i + 1).padStart(2, "0")}</i>
      <b>${m ? C.escapeHtml(m.name) : ""}</b></span>`);
  }
  $("rcOrder").innerHTML = cells.join("");

  showAnnounce($("roundCard"), ROUNDCARD_MS);
}

// ── clock ─────────────────────────────────────────────────────────────────

/** How long a pick gets: whatever the console set, else the league default. */
const pickMs = () => STATE.pickMs || (C.DATA.meta.pick_seconds || 120) * 1000;

setInterval(tickClock, 200);
function tickClock() {
  const el = $("clkTimer");
  if (!el) return;
  // `revealed` counts too. The next manager's clock starts the moment a pick
  // is revealed (see startNextClock in control.js), so the reveal is not a
  // pause in the draft and the board should not pretend it is: the wall tile
  // for the slot on the clock runs the countdown underneath the reveal.
  const live = STATE.status === "clock" || STATE.status === "revealed";
  const wall = $("wallClk");
  const next = $("nextClk");
  // The showcase covers the board's own timer, so it carries one of its own.
  const sc = $("scClock");
  if (!live) {
    el.className = "timer";
    if (sc) { sc.textContent = C.mmss(pickMs()); sc.className = "sc-clock held"; }
    if (wall) wall.textContent = "ON THE CLOCK";
    if (next) {
      next.textContent = C.mmss(pickMs());
      next.className = "next-clock held";
      $("nextNote").textContent = "";
    }
    return;
  }
  const left = STATE.paused
    ? (STATE.pausedLeft ?? 0)
    : (STATE.clockEnds ? STATE.clockEnds - Date.now() : pickMs());
  el.textContent = C.mmss(left);
  el.className = "timer"
    + (STATE.paused ? " paused" : left <= 10000 ? " panic" : left <= 30000 ? " warn" : "");
  if (sc) {
    sc.textContent = STATE.clockEnds || STATE.paused ? C.mmss(left) : C.mmss(pickMs());
    sc.className = "sc-clock" + (!STATE.clockEnds && !STATE.paused ? " held"
      : STATE.paused ? " paused"
      : left <= 10000 ? " panic" : left <= 30000 ? " warn" : "");
  }
  if (wall) {
    wall.textContent = STATE.paused ? "PAUSED" : C.mmss(left);
    wall.className = "wc"
      + (STATE.paused ? " paused" : left <= 10000 ? " panic" : left <= 30000 ? " warn" : "");
  }
  if (next) {
    // At the turn of a round there is no clock yet — it starts when the
    // commissioner advances — so this shows the full pick length, greyed, and
    // says so. A held 2:00 and a 2:00 that started a second ago are the same
    // picture otherwise, which is no way to know which one you are looking at.
    const started = !!STATE.clockEnds;
    next.textContent = C.mmss(started ? left : pickMs());
    next.className = "next-clock"
      + (!started ? " held" : STATE.paused ? " paused"
        : left <= 10000 ? " panic" : left <= 30000 ? " warn" : "");
    $("nextNote").textContent = started
      ? (STATE.paused ? "clock paused" : "")
      : "starts on next pick";
  }
}

const DRAFT_AT = new Date("2026-08-28T19:15:00-04:00").getTime();
setInterval(() => {
  if (STATE.status !== "idle") return;
  const d = DRAFT_AT - Date.now();
  if (d <= 0) { $("idleCount").textContent = "DRAFT DAY"; return; }
  const days = Math.floor(d / 864e5), h = Math.floor(d / 36e5) % 24;
  const m = Math.floor(d / 6e4) % 60, s = Math.floor(d / 1000) % 60;
  $("idleCount").textContent = days > 0 ? `${days}D ${h}H ${m}M`
    : `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}, 500);

// ── render ────────────────────────────────────────────────────────────────

function renderAll() {
  renderHeader(); renderClock(); renderLineup(); renderPickIn();
  renderSelection(); renderReveal(); renderNextUp();
  renderBestAvailable(); renderRoundBoard();
  renderIdleLineup(); renderShowcase();
  renderTicker();
}

function renderHeader() {
  const o = STATE.current || 1;
  $("hdrRound").textContent = C.roundOf(o);
  $("hdrPick").textContent  = C.roundPickOf(o);
}

function renderIdleLineup() {
  if (STATE.status !== "idle") return;
  const el = $("idleLineup");
  if (el.childElementCount) return;
  el.innerHTML = C.DATA.managers.filter(m => m.cutout).slice(0, 12)
    .map(m => `<img src="${m.cutout}" alt="" onerror="this.remove()">`).join("");
}

/**
 * The conference, next to the team name. Two of them, Skim and Whole, and they
 * are the halves of the league — the schedule is built on them and nothing on
 * the board said which one anybody was in. Coloured rather than labelled
 * twice: warm for Whole, cold for Skim.
 */
function confChip(m) {
  const c = m && m.conference;
  if (!c) return "";
  return `<span class="conf conf-${c.toLowerCase()}">${C.escapeHtml(c)}</span>`;
}

/**
 * A team name with its conference beside it. The name is its own element so
 * the row can be a flex line — the chip centres on the type that way, where
 * as an inline box it sat on the baseline and read low — and so a long team
 * name is the thing that gets the ellipsis rather than the chip.
 */
function teamLine(m) {
  if (!m) return "";
  return `<span class="tn">${C.escapeHtml(m.team || "")}</span>${confChip(m)}`;
}

function portrait(m) {
  if (!m) return `<div class="mgr-av fallback">?</div>`;
  if (m.cutout) return `<img class="mgr-cut" src="${m.cutout}" alt="" onerror="this.remove()">`;
  if (m.avatar) return `<img class="mgr-av" src="${m.avatar}" alt="">`;
  return `<div class="mgr-av fallback">${C.escapeHtml(m.name[0])}</div>`;
}

function renderClock() {
  const o = STATE.current || 1;
  const m = C.managerOf(o);
  $("clkPortrait").innerHTML = portrait(m);

  const nameEl = $("clkName");
  nameEl.textContent = m ? m.name.toUpperCase() : "—";
  nameEl.classList.toggle("long", !!m && m.name.length > 7);
  $("clkTeam").innerHTML = teamLine(m);
  $("clkNote").textContent = m ? onClockLine(m, o, C.roundOf(o), PICKS) : "";

  // The power rank gets its own badge next to the name instead of sitting in
  // the facts list as a line item.
  const rankEl = $("clkRank");
  if (m && m.power_rank) {
    rankEl.innerHTML = `<span class="rb-k">Power Rank</span>` +
      `<span class="rb-n">${ROMAN[m.power_rank] || m.power_rank}.</span>`;
    rankEl.classList.add("show");
  } else {
    rankEl.innerHTML = "";
    rankEl.classList.remove("show");
  }

  // Labelled facts rather than one run-on line of small caps. Short keys on
  // purpose — "2025 RD 1" beats "Round 1 last year" in a row this narrow, and
  // the year is the useful half of it.
  if (m) {
    const round = C.roundOf(o);
    const ly = (m.last_year || {})[String(round)];
    const ls = m.last_season || {};
    const next = C.nextPickForSlot(m.slot, o + 1);
    const facts = [];
    if (ly) {
      facts.push(`<div class="f"><span class="k">2025 RD ${round}</span>
        <span class="v">${C.escapeHtml(ly.name)}</span></div>`);
    }
    if (ls.record) {
      facts.push(`<div class="f"><span class="k">2025</span>
        <span class="v">${C.escapeHtml(ls.record)}${ls.finish ? `, ${ordinalPick(ls.finish)}` : ""}</span></div>`);
    }
    if (ls.points_rank) {
      facts.push(`<div class="f"><span class="k">2025 points</span>
        <span class="v">${ordinalPick(ls.points_rank)}</span></div>`);
    }
    if (next) {
      facts.push(`<div class="f"><span class="k">Next pick</span>
        <span class="v">${ordinalPick(next)}</span></div>`);
    }
    $("clkFacts").innerHTML = facts.join("");
  } else $("clkFacts").innerHTML = "";
}

/**
 * The lineup of whoever the draft is currently focused on: the manager on
 * the clock while the timer runs, the same manager (now with his new pick)
 * through the reveal. One panel in the bottom band, always visible, instead
 * of the old split between a clock-wrap column and a reveal-only roster.
 */
/**
 * Where a player was taken, for the lineup: round and pick in the round.
 * `1.12` rather than `RD 1 PK 12` because that is already how the board says
 * it everywhere else — the ticker, the pick log and the wall all use it — and
 * this column sits between a name and a team abbreviation with no room to
 * spell anything out.
 */
function pickLabel(p) {
  return p.round ? `${p.round}.${String(p.roundPick).padStart(2, "0")}` : "";
}

function renderLineup() {
  const o = STATE.current || 1;
  const m = C.managerOf(o);
  if (!m) { $("luGrid").innerHTML = ""; $("luCount").textContent = ""; return; }

  const mine = PICKS.filter(p => p.slot === m.slot);
  const justNow = (STATE.status === "revealed" && STATE.pending) ? STATE.pending.id : null;
  // Kickers and defenses don't earn a row on a broadcast panel this size —
  // nobody's watching to see if the K slot is open in round six.
  const pool = mine.filter(p => p.pos !== "K" && p.pos !== "DEF");
  const rows = [];
  for (const s of ["QB","RB","RB","WR","WR","TE","FLEX"]) {
    const idx = s === "FLEX"
      ? pool.findIndex(p => ["RB","WR","TE"].includes(p.pos))
      : pool.findIndex(p => p.pos === s);
    const p = idx >= 0 ? pool.splice(idx, 1)[0] : null;
    const isNew = p && p.playerId === justNow;
    // FLEX takes the colour of whoever actually landed there, not a fixed
    // RB tint — the first extra RB/WR/TE past the named slots, in draft
    // order, is who ends up here.
    const posClass = s === "FLEX" ? (p ? "pos-" + p.pos : "pos-RB") : "pos-" + s;
    rows.push(`
      <div class="lu-row${p ? "" : " empty"}${isNew ? " new" : ""}">
        <span class="s ${posClass}">${s}</span>
        <span class="nm">${p ? C.escapeHtml(p.name) : "open"}</span>
        <span class="pk">${p ? pickLabel(p) : ""}</span>
        <span class="tm">${p ? C.escapeHtml(p.nflTeam || "") : ""}</span>
      </div>`);
  }
  pool.forEach(p => rows.push(`
    <div class="lu-row${p.playerId === justNow ? " new" : ""}">
      <span class="s" style="color:var(--mute)">BN</span>
      <span class="nm">${C.escapeHtml(p.name)}</span>
      <span class="pk">${pickLabel(p)}</span>
      <span class="tm">${C.escapeHtml(p.nflTeam || "")}</span>
    </div>`));

  lineupRows = rows.length;
  $("luGrid").innerHTML = rows.join("");
  $("luCount").textContent = `${mine.length} PICK${mine.length === 1 ? "" : "S"}`;
}

function renderPickIn() {
  const o = STATE.current || 1;
  const m = C.managerOf(o);

  // The big outlined numeral is the overall pick; round and pick cross its
  // middle. From pick 100 the third digit would reach back into the headline,
  // so the numeral steps down a size for the rest of the draft.
  $("pickinNum").textContent = o;
  $("pickinNum").classList.toggle("wide", o >= 100);
  $("pickinRp").textContent = `Round ${C.roundOf(o)} · Pick ${C.roundPickOf(o)}`;

  $("pickinName").textContent = m ? m.name.toUpperCase() : "";
  $("pickinSub").textContent = `${ordinalPick(o)} overall`;

  const face = $("pickinFace");
  if (m && (m.cutout || m.avatar)) {
    face.src = m.cutout || m.avatar;
    face.style.display = "";
    face.onerror = () => { face.style.display = "none"; };
  } else face.style.display = "none";
}

/** The five second selection graphic. */
function renderSelection() {
  if (STATE.status !== "revealed" || !STATE.pending) return;
  const p = STATE.pending, o = STATE.current;
  const player = C.DATA.byId.get(p.id) || p;
  const m = C.managerOf(o);

  const shot = $("selShot");
  shot.src = C.headshot(player) || "";
  shot.onerror = () => { shot.style.display = "none"; };
  shot.style.display = "";

  const teamBg = $("selTeamBg"), lg = C.teamLogo(p.team);
  if (lg) { teamBg.src = lg; teamBg.style.display = ""; } else teamBg.style.display = "none";
  setTeamGlow(document.querySelector(".sel-shot"), p.team, .3);

  $("selNum").textContent = String(C.roundPickOf(o)).padStart(2, "0");
  $("selOwner").textContent = m ? `${m.name.toUpperCase()} SELECTION` : "THE SELECTION";

  const nameEl = $("selName");
  nameEl.textContent = p.name.toUpperCase();
  nameEl.className = "sel-name" +
    (p.name.length > 20 ? " xlong" : p.name.length > 15 ? " long" : "");

  $("selPos").textContent = `${p.pos} · ${C.escapeHtml(p.team || "FA")}`;
  $("selBadge").textContent = `RD ${C.roundOf(o)}   PK ${C.roundPickOf(o)}`;
  $("selTag").textContent = selectionLine(m, p, o, C.roundOf(o), PICKS, C.historyFor(player));
}

/** The detail screen the selection collapses into. */
function renderReveal() {
  if (STATE.status !== "revealed" || !STATE.pending) return;
  const p = STATE.pending, o = STATE.current;
  const player = C.DATA.byId.get(p.id) || p;
  const m = C.managerOf(o);

  $("revEyebrow").innerHTML =
    `ROUND ${C.roundOf(o)} &middot; ${ordinalPick(o).toUpperCase()} OVERALL &middot; ` +
    `<b>${m ? C.escapeHtml(m.name.toUpperCase()) : ""}</b>`;

  const nameEl = $("revName");
  nameEl.textContent = p.name.toUpperCase();
  nameEl.className = "reveal-name" +
    (p.name.length > 21 ? " xlong" : p.name.length > 16 ? " long" : "");

  const shot = $("revShot");
  shot.src = C.headshot(player) || "";
  shot.style.visibility = "visible";
  shot.onerror = () => { shot.style.visibility = "hidden"; };

  const revTeamBg = $("revTeamBg"), revBgLg = C.teamLogo(p.team);
  if (revBgLg) { revTeamBg.src = revBgLg; revTeamBg.style.display = ""; } else revTeamBg.style.display = "none";
  setTeamGlow(document.querySelector(".reveal-shot-wrap"), p.team, .3);

  const logo = $("revLogo"), lg = C.teamLogo(p.team);
  if (lg) { logo.src = lg; logo.style.display = ""; } else logo.style.display = "none";

  $("revLine").innerHTML =
    `<span class="pos-${p.pos}">${p.pos}${p.posrank || ""}</span>` +
    `<span class="sep"> / </span>${C.escapeHtml(p.team || "FA")}` +
    (player.age ? `<span class="sep"> / </span>${player.age} yrs` : "");

  const tags = [];
  const v = C.verdict(o, p.board);
  if (v && v.level !== 0) {
    const cls = { 2: "steal", 1: "value", "-1": "early", "-2": "reach" }[v.level];
    const how = v.gap > 0 ? `FELL ${v.gap} SPOTS` : `${Math.abs(v.gap)} EARLY`;
    tags.push(`<span class="tag ${cls}">${v.tag} &middot; ${how}</span>`);
  }
  // "BOARD 32" meant nothing on its own. Say what the number is.
  if (p.board) tags.push(`<span class="tag">RANKED #${p.board} OVERALL</span>`);
  if (p.posrank) tags.push(`<span class="tag pos-${p.pos}">${p.pos}${p.posrank} ON THE BOARD</span>`);
  if (p.rookie) tags.push(`<span class="tag rookie">ROOKIE</span>`);
  // A position run is a fact about the last six picks, not about this player,
  // and sitting it in a row of his own rankings read as if it were one. It
  // lives in the round wall's header now (see renderBestAvailable), which is
  // where the rest of the "what is happening in this round" copy already is.
  $("revTags").innerHTML = tags.join("");

  const hist = C.historyFor(player);
  $("revNote").textContent = pickLine(m, p, o, C.roundOf(o), PICKS, hist);

  // Who is left at his position, which is the question the room asks out loud
  // the second a name is called — and best available has just been swapped out
  // of the band for the next man's clock, so this is the only place it lives
  // while a reveal is up.
  const left = C.bestAvailable(PICKS, p.pos, 4);
  $("revAlso").innerHTML = left.length
    ? `<span class="k">${p.pos}s still on the board</span><ul>` +
      left.map(x => `<li><span class="pr pos-${x.pos}">${x.pos}${x.posrank}</span>` +
        `<span class="nm">${C.escapeHtml(x.name)}</span>` +
        `<span class="tm">${C.escapeHtml(x.team || "")}</span></li>`).join("") + `</ul>`
    : "";

  const box = $("revHist");
  if (!hist.length) {
    box.innerHTML = `<span class="k">${p.rookie ? "First time on a PAMS board" : "Never drafted in PAMS"}</span>`;
  } else {
    // Most recent first — "last time" is the interesting fact live, not
    // whatever order the history file happens to store him in.
    const sorted = hist.slice().sort((a, b) => b.y - a.y);
    // Five deep, except when that would leave exactly one behind: a "+1 more"
    // line takes the same row the year it is standing in for would have.
    const rows = sorted.slice(0, sorted.length === 6 ? 6 : 5);
    const extra = sorted.length - rows.length;
    box.innerHTML = `<span class="k">Drafted ${hist.length}x in PAMS</span><ul>` +
      rows.map(h => {
        // He had this exact player before — worth catching at a glance.
        const rep = m && h.m === m.name;
        return `<li><b>${h.y}</b><span class="pk">pk ${h.p}</span>` +
          `<span class="mgr${rep ? " rep" : ""}">${C.escapeHtml(h.m)}</span></li>`;
      }).join("") +
      (extra > 0 ? `<li class="more">+${extra} more</li>` : "") +
      `</ul>`;
  }
}

/**
 * The card that takes best available's place in the band while a reveal is up:
 * who is next, which pick it is, and their clock — the clock being the point,
 * since it is running under the reveal and the board's own timer is behind it.
 */
function renderNextUp() {
  const o = (STATE.current || 1) + 1;
  const m = o <= C.TOTAL ? C.managerOf(o) : null;
  const label = m ? `PICK ${o} · ${C.roundOf(o)}.${String(C.roundPickOf(o)).padStart(2, "0")}` : "";

  // At the turn of a round the card is about the round, not the clock — there
  // is no clock yet, it starts when the commissioner advances.
  const turning = !!m && C.roundOf(o) > C.roundOf(STATE.current || 1);
  document.querySelector(".bb-next").classList.toggle("turning", turning);
  $("nextHd").textContent = turning ? "UP NEXT" : "NEXT ON THE CLOCK";
  if (turning) {
    $("ruNum").textContent = C.roundOf(o);
    $("ruName").textContent = m.name.toUpperCase();
    $("ruPick").textContent = `Leads it off · pick ${o}`;
    const rf = $("ruFace");
    if (m.cutout || m.avatar) {
      rf.src = m.cutout || m.avatar;
      rf.style.display = "";
      rf.onerror = () => { rf.style.display = "none"; };
    } else rf.style.display = "none";
  }

  $("nextPk").textContent = label;
  $("nextName").textContent = m ? m.name.toUpperCase() : "THAT IS THE DRAFT";
  $("nextGhost").textContent = m ? o : "";
  $("nextTeam").innerHTML = teamLine(m);

  const face = $("nextFace");
  if (m && (m.cutout || m.avatar)) {
    face.src = m.cutout || m.avatar;
    face.style.display = "";
    face.onerror = () => { face.style.display = "none"; };
  } else face.style.display = "none";
}

function renderBestAvailable() {
  // Match the lineup's height rather than a fixed count, so once a manager
  // is deep enough into the bench to out-grow best available, best available
  // just grows with it instead of leaving a visibly shorter card beside it.
  const rows = Math.max(BA_ROWS, lineupRows);
  // Both cards in the band divide their height into exactly this many rows,
  // so they fill rather than stopping short, and stay level with each other.
  document.querySelector(".bottom-band")?.style.setProperty("--band-rows", rows);
  $("baList").innerHTML = C.bestAvailable(PICKS, null, rows).map(p => `
    <div class="ba">
      <span class="rk">${p.board}</span>
      <span class="nm">${C.escapeHtml(p.name)}</span>
      <span class="pr pos-${p.pos}">${p.pos}${p.posrank}</span>
      <span class="tm">${C.escapeHtml(p.team)}</span>
    </div>`).join("");
  // Says what the run actually is, now that it is the only place the board
  // reports one. A small tag in the position's own colour and then the fact
  // in plain words — it used to be one mono chip set larger than the
  // BEST AVAILABLE label beside it, which made the header look like it had
  // two headers in it.
  const run = C.positionRun(PICKS);
  $("runAlert").innerHTML = run
    ? `<span class="run-tag pos-${run.pos}">RUN ALERT</span>` +
      `<span class="run-txt">${run.pos}s have gone ${run.n} of the last ${run.window} picks</span>`
    : "";
}

/**
 * The round in progress, Madden style: two across, six deep, filled tiles
 * carrying the manager cut-out and the player, the current pick lit gold.
 * No "on deck" any more — the moment a pick lands, the next open slot lights
 * up gold too, using `nextOpenPick` rather than `STATE.current` so it doesn't
 * sit waiting on the commissioner to formally advance the clock.
 */
/**
 * The pick the board's furniture is pointed at — the round wall and the
 * ticker, not the reveal.
 *
 * Normally the next open pick, so a slot lights up the moment one lands
 * rather than waiting on the commissioner to formally advance. The exception
 * is the last pick of a round: while its reveal is up, both stay on the round
 * that just finished. Otherwise the wall flips to round two and the ticker
 * starts saying ROUND 2 while the twelfth pick of round one is still on
 * screen, which announces the new round before the round card gets to.
 */
function boardPick() {
  const open = C.nextOpenPick(PICKS);
  const cur = STATE.current || 1;
  if (STATE.status === "revealed" && C.roundOf(open) > C.roundOf(cur)) return cur;
  return open;
}

function renderRoundBoard() {
  const o = boardPick();
  const round = C.roundOf(o);
  const start = (round - 1) * C.TEAMS + 1;
  const made = new Map(PICKS.map(p => [p.overall, p]));

  // Just the round. The "4 OF 12" counter that used to sit beside it was
  // saying what the twelve tiles underneath it already say by being filled in.
  $("roundHd").textContent = `ROUND ${round}`;

  // Where each pick sits in the run on his own position, in draft order —
  // the second back off the board is RB2 here whatever Sleeper had him
  // ranked at preseason. Counted across the whole draft, not the round, so
  // it keeps climbing as the rounds turn over.
  const posOrder = new Map();
  const posSeen = {};
  for (const p of PICKS.slice().sort((a, b) => a.overall - b.overall)) {
    posSeen[p.pos] = (posSeen[p.pos] || 0) + 1;
    posOrder.set(p.overall, posSeen[p.pos]);
  }

  const cells = [];
  for (let i = 0; i < C.TEAMS; i++) {
    const n = start + i;
    const m = C.managerOf(n);
    const p = made.get(n);
    const newest = PICKS.length ? PICKS[PICKS.length - 1].overall : 0;
    const cls = p
      ? (p.overall === newest ? "filled just" : "filled")
      : n === o ? "onclock" : "empty";
    const face = m && m.cutout
      ? `<img class="face" src="${m.cutout}" alt="" onerror="this.remove()">` : "";
    const avatarRow = p
      ? `<div class="ar">
          <img class="pav" src="${C.headshot({ id: p.playerId, pos: p.pos })}" alt="" onerror="this.remove()">
          <span class="pos pos-${p.pos}">${p.pos}${posOrder.get(p.overall) || ""}</span>
        </div>`
      : "";
    const nm = p ? C.escapeHtml(p.name)
      // tickClock() writes the countdown into this one every 200ms
      : n === o ? `<span class="wc" id="wallClk">ON THE CLOCK</span>`
      : "&mdash;";
    cells.push(`
      <div class="wt ${cls}"${p ? ` style="border-top-color:var(--${p.pos.toLowerCase()})"` : ""}>
        ${face}
        <div class="who">
          <div class="hd"><span class="n">${i + 1}</span><span class="mg">${m ? C.escapeHtml(m.name) : ""}</span></div>
          <div class="foot">
            ${avatarRow}
            <span class="nm">${nm}</span>
          </div>
        </div>
      </div>`);
  }
  $("roundList").innerHTML = cells.join("");
}

// ── the manager showcase ──────────────────────────────────────────────────
//
// The commissioner's screen: a man's whole PAMS career while his clock runs.
// Everything on it comes from managers.json and the picks already in hand, so
// it needs nothing live and can go up at any point in the night.
//
// Two rules it lives by. It only shows while a clock is actually running —
// the ceremony owns the screen the moment a pick lands, and the console
// clears the state to match (see CLOSED in control.js), so this is a second
// lock rather than the only one. And it rebuilds only when what it says has
// changed: renderAll runs on every clock adjustment, and rebuilding the
// markup would restart every entrance animation on the card each time.

let showcaseKey = "";

/** Career record as the board says it: `51-53`, ties only when there are any. */
function record(rec) {
  return String(rec || "").replace(/-0$/, "");
}

function renderShowcase() {
  const el = $("showcase");
  const slot = STATE.showcase;
  const m = slot != null ? C.DATA.bySlot.get(slot) : null;
  const on = !!m && STATE.status === "clock";

  el.classList.toggle("show", on);
  if (!on) { showcaseKey = ""; return; }

  const o = STATE.current || 1;
  // The clock is not in the key: it is written straight into #scClock by
  // tickClock, five times a second, and has nothing to do with the markup.
  const key = `${slot}|${PICKS.length}|${o}`;
  if (key === showcaseKey) return;
  showcaseKey = key;

  const face = $("scFace");
  if (m.cutout || m.avatar) {
    face.src = m.cutout || m.avatar;
    face.style.display = "";
    face.onerror = () => { face.style.display = "none"; };
  } else face.style.display = "none";

  $("scName").textContent = m.name.toUpperCase();
  $("scTeam").innerHTML = teamLine(m);

  const rank = $("scRank");
  if (m.power_rank) {
    rank.innerHTML = `<span class="rb-k">Power Rank</span>` +
      `<span class="rb-n">${ROMAN[m.power_rank] || m.power_rank}.</span>`;
    rank.classList.add("show");
  } else {
    rank.innerHTML = "";
    rank.classList.remove("show");
  }

  renderShowcaseCareer(m);
  renderShowcaseSched(m, o);
  renderShowcaseSeasons(m);
  renderShowcaseTendencies(m);
  renderShowcaseBoard(m, o);
  renderShowcaseRounds(m, C.roundOf(o));
  renderShowcaseFoot(o);
}

/**
 * The career strip.
 *
 * All-time and the playoff record are two different numbers and are labelled
 * as two: `career.record` in managers.json is every game he has played,
 * regular season and playoffs together, and the W-L column in the seasons
 * table underneath is the regular season on its own. Ricci is 51-53 up here
 * and 46-50 down there, and the 5-3 between them is the playoff record in
 * this same strip, so all three agree if anybody adds them up.
 */
function renderShowcaseCareer(m) {
  const c = m.career || {};
  const items = [];
  const add = (k, v, cls) => v && items.push(
    `<div${cls ? ` class="${cls}"` : ""}><span class="k">${k}</span>
       <span class="v">${v}</span></div>`);

  // Counted off the ledger this screen is about to draw, not off the
  // directory's own playoff_appearances, so the strip and the table can never
  // disagree in front of everyone: Mason's two sources differ by one trip
  // (see selftest.html), and the seasons underneath would have shown four
  // while this said three.
  const led = m.ledger || [];
  const trips = led.filter(y => y.br).length;

  add("All-time", record(c.record) +
    (c.win_pct ? ` <i>${String(c.win_pct.toFixed(3)).replace(/^0/, "")}</i>` : ""));
  add("Playoffs", c.playoff_record
    ? `${c.playoff_record} <i>${trips} of ${led.length}</i>`
    : `${trips} of ${led.length}`);
  add("Titles", c.titles
    ? `${c.titles} <i>${(c.title_years || []).join(", ")}</i>`
    : "None yet", c.titles ? "gold" : "");
  add("Top three", `${c.top3 || 0}`);
  add("Points a game", c.ppg ? c.ppg.toFixed(1) : null);
  add("Drafts", `${(m.draft_tendency || {}).drafts || 0}`);

  $("scCareer").innerHTML = items.join("");
}

/**
 * The career as a row of seasons, left to right.
 *
 * It was a five-column table down half the screen, and for all that room it
 * only ever said what had already happened — year by year, in the order a
 * spreadsheet would. Laid across instead, at a third of the height, it reads
 * as the shape of a career: where the good years sit, where the title sits,
 * how long the bad run went. The room it gives up goes to his tendencies,
 * which is the thing worth knowing while he is on the clock.
 *
 * One grid, filled column by column, so the record line, the finish and the
 * note underneath stay level across every season whether or not that season
 * has a title badge in it.
 */
function renderShowcaseSeasons(m) {
  const led = m.ledger || [];
  const cells = [];
  led.forEach((y, i) => {
    const champ = y.fin === 1;
    const cls = "sn" + (champ ? " champ" : y.br ? "" : " miss") + (i ? "" : " first");
    cells.push(`<span class="${cls} y">${y.y}</span>`);
    cells.push(`<span class="${cls} rec">${C.escapeHtml(y.rec || "")}</span>`);
    // PAMS had fourteen teams in 2019, so 2nd that year is 2nd of fourteen
    // and 12th is last but one. The field size rides on the finish itself,
    // where the number that needs it is, rather than on a line of its own.
    cells.push(`<span class="${cls} fin">${ordinalPick(y.fin)}${
      y.teams && y.teams !== C.TEAMS ? `<i>/${y.teams}</i>` : ""}</span>`);
    // `seed` is the playoff seed and only exists for a team that made it —
    // see build_seasons.mjs. A team that missed says so, and its finish is
    // its regular season rather than wherever the consolation bracket left it.
    cells.push(`<span class="${cls} sub">${
      champ ? `<span class="tt">Title</span>`
        : y.br ? `${y.seed} seed` : "missed"}</span>`);
    // What he scored, then where that put him. "1st in points" on its own
    // was a rank with nothing behind it; the average is the fact and the rank
    // is what it was worth. Gold, silver and bronze on the top three, which
    // is the one place on this board a number is allowed to be a medal.
    const medal = ["", " one", " two", " three"][y.pfr] || "";
    cells.push(`<span class="${cls} pf">${
      y.ppg ? `${y.ppg.toFixed(1)} <b class="pl${medal}">${ordinalPick(y.pfr)}</b>` : ""}</span>`);
  });

  const el = $("scSeasons");
  el.style.setProperty("--seasons", led.length || 1);
  el.innerHTML = cells.join("");
  // PAMS has been running since 2019; three of the twelve came in later, and
  // a strip that starts in 2023 with nothing said about it reads as a gap.
  $("scSeasonsCt").textContent = led.length
    ? (led[0].y > 2019 ? `In PAMS since ${led[0].y}` : `${led[0].y}–${led[led.length - 1].y}`)
    : "";
}

/**
 * How he drafts, out of every pick he has ever made.
 *
 * Two things, both counted rather than said. The mix is his whole career by
 * position, as wide as it is common. Under it, the round he takes each
 * position in: the average across his drafts and the earliest and latest he
 * has ever gone. That is the fact the room actually argues about while a man
 * is on the clock — whether he is the one who waits on a quarterback — and
 * nothing else on the board answered it.
 */
function firstRoundFor(m, pos) {
  const rp = m.round_picks || {};
  const byYear = {};
  for (const r of Object.keys(rp).map(Number).sort((a, b) => a - b)) {
    for (const p of rp[String(r)]) {
      if (p.pos === pos && byYear[p.y] === undefined) byYear[p.y] = r;
    }
  }
  const rounds = Object.values(byYear);
  if (!rounds.length) return null;
  return {
    avg: rounds.reduce((a, b) => a + b, 0) / rounds.length,
    lo: Math.min(...rounds), hi: Math.max(...rounds), n: rounds.length,
  };
}

const POS_ONE = { QB: "Quarterback", RB: "Running Back", WR: "Receiver", TE: "Tight End" };
const POS_MANY = { QB: "Quarterbacks", RB: "Running Backs", WR: "Receivers", TE: "Tight Ends" };

/** The whole room's average first round at a position, for comparison. */
function leagueFirstRound(pos) {
  const all = [];
  for (const x of C.DATA.managers) {
    const f = firstRoundFor(x, pos);
    if (f) all.push(f.avg * f.n, f.n);
  }
  let sum = 0, n = 0;
  for (let i = 0; i < all.length; i += 2) { sum += all[i]; n += all[i + 1]; }
  return n ? sum / n : null;
}

/**
 * The player he has taken more than any other. Actual players only.
 *
 * Ties broken on where he takes him: three men taken twice each is common,
 * and the one he spends a first rounder on is the one he is actually about.
 * Averaged over his own picks of that player, earliest wins.
 */
function hisGuy(m) {
  const seen = new Map();
  for (const list of Object.values(m.round_picks || {})) {
    for (const p of list) {
      if (p.pos === "K" || p.pos === "DEF") continue;
      const e = seen.get(p.player) || { name: p.player, n: 0, sum: 0 };
      e.n++; e.sum += p.ov;
      seen.set(p.player, e);
    }
  }
  let best = null;
  for (const e of seen.values()) {
    e.avg = e.sum / e.n;
    if (!best || e.n > best.n || (e.n === best.n && e.avg < best.avg)) best = e;
  }
  return best && best.n > 1 ? best : null;
}

function renderShowcaseTendencies(m) {
  const t = m.draft_tendency || {};
  const drafts = t.drafts || 0;
  const cells = [];

  const guy = hisGuy(m);
  if (guy) {
    cells.push(`<div class="v"><span class="k">His guy</span>
      <b>${C.escapeHtml(guy.name)}</b>
      <span class="rng">${guy.n} of ${drafts} drafts</span></div>`);
  }

  // What he opens with, and how often. `round1` is already counted by
  // position in the build.
  const r1 = Object.entries(t.round1 || {}).sort((a, b) => b[1] - a[1])[0];
  if (r1) {
    cells.push(`<div class="v"><span class="k">Round one</span>
      <b class="pos-${r1[0]}">${POS_ONE[r1[0]] || r1[0]}</b>
      <span class="rng">${r1[1]} of ${drafts} drafts</span></div>`);
  }

  // Where he sits against everybody else. The position he is furthest from
  // the room on, and which way. Half a round is noise; three quarters of one
  // is a habit, and every manager in this league clears it somewhere.
  let far = null;
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    const f = firstRoundFor(m, pos), room = leagueFirstRound(pos);
    if (!f || room == null) continue;
    const d = f.avg - room;
    if (!far || Math.abs(d) > Math.abs(far.d)) far = { pos, d, mine: f.avg, room };
  }
  if (far) {
    const verdict = Math.abs(far.d) < .75 ? `Drafts with the room`
      : far.d > 0 ? `Waits on ${POS_MANY[far.pos]}`
      : `Early on ${POS_MANY[far.pos]}`;
    cells.push(`<div class="v"><span class="k">Against the room</span>
      <b>${verdict}</b>
      <span class="cmp"><i>${C.escapeHtml(m.name)}</i> ${far.mine.toFixed(1)}
        <em>&middot;</em> <i>room</i> ${far.room.toFixed(1)}</span></div>`);
  }

  // The word FIRST is in the caption over the row rather than four times
  // inside it, so a cell is the position, the round, and how far he has
  // strayed from it — three things on one line, keyed to the position's
  // colour down its edge.
  const firsts = ["QB", "RB", "WR", "TE"].map(pos => {
    const f = firstRoundFor(m, pos);
    if (!f) return "";
    // One round every year means there is no range to give.
    const range = f.lo === f.hi ? `always` : `${f.lo} to ${f.hi}`;
    return `<div class="f f-${pos}">
      <span class="pc pos-${pos}">${pos}</span>
      <b>Rd ${Math.round(f.avg)}</b>
      <span class="rng">${range}</span>
    </div>`;
  }).join("");

  $("scTend").innerHTML =
    `<div class="verdicts">${cells.join("")}</div>` +
    `<div class="fhd"><span>First off the board</span></div>` +
    `<div class="firsts">${firsts}</div>`;
  $("scTendCt").textContent = t.picks
    ? `${t.picks} picks · ${drafts} draft${drafts === 1 ? "" : "s"}` : "";
}

/**
 * His own draft: all fourteen picks he owns tonight, in order.
 *
 * The same shape as the lineup in the bottom band, on purpose — the position
 * chip, the name, the team — but this is the pick order rather than the
 * starting eleven, so the ones he has not reached yet are still rows. They
 * carry the round and the pick they will be, which is the useful thing to
 * know while a man is on the clock: how long until he is up again, and how
 * many swings he has left.
 */
function renderShowcaseBoard(m, current) {
  const made = new Map(PICKS.filter(p => p.slot === m.slot).map(p => [p.overall, p]));
  const rows = [];
  for (let r = 1; r <= C.ROUNDS; r++) {
    const o = C.nextPickForSlot(m.slot, (r - 1) * C.TEAMS + 1);
    if (!o) continue;
    const p = made.get(o);
    const now = !p && o === current;
    const cls = "sb" + (p ? " made" : now ? " now" : " open");
    // The two labels trade places depending on whether the pick has happened.
    // A pick he has made is filed the way the whole board files a pick, 3.10,
    // with the player beside it. A pick he has not reached is the other way
    // round: the overall number is the useful one there (how far away it is),
    // and where it lands in its round is the thing being spelled out.
    const body = p
      ? `<span class="pos pos-${p.pos}">${p.pos}</span>
         <span class="nm">${C.escapeHtml(p.name)}</span>
         <span class="tm">${C.escapeHtml(p.nflTeam || "")}</span>`
      : now
        ? `<span class="pos"></span><span class="nm">On the clock</span>
           <span class="tm"></span>`
        : `<span class="pos"></span>
           <span class="nm">Round ${r} &middot; pick ${C.roundPickOf(o)}</span>
           <span class="tm"></span>`;
    rows.push(`<div class="${cls}">
      <span class="pk">${p
        ? `${r}.${String(C.roundPickOf(o)).padStart(2, "0")}`
        : ordinalPick(o)}</span>
      ${body}
    </div>`);
  }
  $("scBoard").innerHTML = rows.join("");
  $("scBoardCt").textContent = `${made.size} of ${C.ROUNDS}`;
}

const ORD_WORD = ["", "first", "second", "third", "fourth", "fifth", "sixth",
  "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth",
  "fourteenth", "fifteenth"];

/**
 * The same round he is picking in, every year he has picked in it.
 *
 * It followed round one whatever round the draft was in, which is the least
 * useful version of it after the first twelve picks: what a man does with his
 * ninth rounder is the question while he is sitting on his ninth rounder.
 * Oldest year first, left to right, so the row reads as a run of drafts, and
 * with the overall pick on each because a television has the room for it.
 */
function renderShowcaseRounds(m, round) {
  const seq = (m.round_picks || {})[String(round)] || [];
  const word = ORD_WORD[round];
  $("scR1").innerHTML = seq.length
    ? `<span class="k">Every ${word ? `${word} rounder` : `round ${round} pick`}</span>` +
      seq.map(p => `<span class="c">
        <span class="top"><i>${p.y}</i><em>pk ${p.ov}</em></span>
        <span class="bot"><b>${C.escapeHtml(p.player)}</b>
          <span class="pos-${p.pos}">${p.pos}</span></span></span>`).join("")
    : "";
}

/**
 * The season he is drafting for, which nothing else on this screen is about.
 *
 * Week one and rivalry week carry the other manager's own cut-out: these are
 * the two fixtures anybody in the room reacts to, and a name beside a face
 * gets that reaction faster than a name on its own.
 */
function renderShowcaseSched(m, o) {
  const faceOf = name => {
    const x = C.DATA.managers.find(z => z.name === name);
    const src = x && (x.cutout || x.avatar);
    return src ? `<img src="${src}" alt="" onerror="this.remove()">` : "";
  };
  const cells = [];
  const wk1 = C.week1For(m.name);
  if (wk1) {
    cells.push(`<div class="cell"><span class="lb">Week 1</span>
      ${faceOf(wk1)}<b>${C.escapeHtml(wk1.toUpperCase())}</b></div>`);
  }
  const rival = C.rivalOf(m.name);
  if (rival) {
    cells.push(`<div class="cell"><span class="lb">Rivalry week</span>
      ${faceOf(rival)}<b>${C.escapeHtml(rival.toUpperCase())}</b></div>`);
  }
  const dbl = C.doublesFor(m.name);
  if (dbl.length) {
    cells.push(`<div class="cell"><span class="lb">Plays twice</span>
      <b class="small">${dbl.map(C.escapeHtml).join(", ")}</b></div>`);
  }
  const next = C.nextPickForSlot(m.slot, o + 1);
  if (next) {
    cells.push(`<div class="cell"><span class="lb">Picks again</span>
      <b>${ordinalPick(next)}</b>
      <span class="sub">round ${C.roundOf(next)}</span></div>`);
  }
  // The schedule is the one data file the board tolerates missing, so this
  // band simply is not there on a night the fetch failed.
  $("scSched").innerHTML = cells.length
    ? `<span class="k">The 2026 season</span>${cells.join("")}` : "";
}

/**
 * The bottom edge: the pick that just went, the clock, and who is up next.
 * The showcase covers the header, the wall and the ticker, so this band is
 * the only thing left on screen saying where the draft actually is.
 */
function renderShowcaseFoot(o) {
  const prev = PICKS.length
    ? PICKS.slice().sort((a, b) => a.overall - b.overall)[PICKS.length - 1] : null;

  // The manager's cut-out, on both ends of the band. The player's own NFL
  // photo was in here too and it was one picture too many: at this size a
  // headshot is a thumbnail of a helmet, and the name beside it is already
  // the thing being read.
  const cut = m => (m && (m.cutout || m.avatar))
    ? `<img class="cut" src="${m.cutout || m.avatar}" alt="" onerror="this.remove()">` : "";

  $("scPrev").innerHTML = prev
    ? `${cut(C.DATA.bySlot.get(prev.slot))}
       <span class="pk">${prev.round}.${String(prev.roundPick).padStart(2, "0")}</span>
       <span class="mg">${C.escapeHtml(prev.manager || "")}</span>
       <b>${C.escapeHtml(prev.name)}</b>
       <span class="pos-${prev.pos}">${prev.pos}</span>`
    : `<b>Nothing yet</b>`;

  $("scClockK").textContent = `On the clock · ${ordinalPick(o)} overall`;

  const nx = o + 1 <= C.TOTAL ? C.managerOf(o + 1) : null;
  $("scNext").innerHTML = nx
    ? `<span class="pk">${C.roundOf(o + 1)}.${String(C.roundPickOf(o + 1)).padStart(2, "0")}</span>
       <b>${C.escapeHtml(nx.name.toUpperCase())}</b>${cut(nx)}`
    : `<b>That is the draft</b>`;
}

// ── ticker ────────────────────────────────────────────────────────────────
//
// A queue, not a loop. Each section enters from the right, scrolls all the way
// off to the left exactly once, and then hands over to the next one, which
// flies up into place. Nothing repeats and nothing trails a half-empty strip,
// so round one does not sit there cycling the same two picks.
//
//   1. THIS ROUND      the twelve slots of the round in progress
//   2. STILL AVAILABLE the top twenty left on the board
//   3. EVERY PICK      the whole draft so far, once there is enough of it

let viewIndex = 0;
let tickerKey = "";

function tickerViews() {
  const views = ["round", "available"];
  if (PICKS.length >= C.TEAMS) views.push("all");
  return views;
}

function roundStrip() {
  const o = boardPick();
  const round = C.roundOf(o);
  const start = (round - 1) * C.TEAMS + 1;
  const made = new Map(PICKS.map(p => [p.overall, p]));
  const out = [];

  for (let i = 0; i < C.TEAMS; i++) {
    const n = start + i;
    const m = C.managerOf(n);
    const p = made.get(n);
    const label = `${round}.${String(i + 1).padStart(2, "0")}`;
    if (p) {
      out.push(`<span class="tk"><span class="pk">${label}</span>
        <span class="mg">${C.escapeHtml(p.manager || "")}</span>
        <b>${C.escapeHtml(p.name)}</b>
        <span class="pp pos-${p.pos}">${p.pos}</span>
        <span class="tm">${C.escapeHtml(p.nflTeam || "")}</span></span>`);
    } else if (n === o) {
      out.push(`<span class="tk onclock"><span class="pk">${label}</span>
        <span class="mg">${C.escapeHtml(m ? m.name : "")}</span><b>ON THE CLOCK</b></span>`);
    } else {
      out.push(`<span class="tk pending"><span class="pk">${label}</span>
        <span class="mg">${C.escapeHtml(m ? m.name : "")}</span><b>&mdash;</b></span>`);
    }
  }
  return { tag: `ROUND ${round}`, html: out.join("") };
}

function availableStrip() {
  const html = C.bestAvailable(PICKS, null, 20).map(p => `
    <span class="tk"><span class="pk">#${p.board}</span>
      <b>${C.escapeHtml(p.name)}</b>
      <span class="pp pos-${p.pos}">${p.pos}${p.posrank}</span>
      <span class="tm">${C.escapeHtml(p.team)}</span></span>`).join("");
  return { tag: "STILL AVAILABLE", html };
}

function allStrip() {
  // Draft order, 1.01 first. It ran newest-first, which meant the strip
  // crossed the screen backwards through the night and you had to read it
  // right to left to follow the draft.
  const html = PICKS.slice().sort((a, b) => a.overall - b.overall).map(p => `
    <span class="tk"><span class="pk">${p.round}.${String(p.roundPick).padStart(2,"0")}</span>
      <span class="mg">${C.escapeHtml(p.manager || "")}</span>
      <b>${C.escapeHtml(p.name)}</b>
      <span class="pp pos-${p.pos}">${p.pos}</span>
      <span class="tm">${C.escapeHtml(p.nflTeam || "")}</span></span>`).join("");
  return { tag: "EVERY PICK", html };
}

// Rise into place, hold, then scroll — the whole strip floats up from
// exactly one bar-height below (`translateY(100%)`, "as much space as
// there is showing") to its resting spot, sits still long enough to read,
// then crosses left until the last entry clears the view.
const LIFT_MS = 420;
// The beat it sits still after rising, before it starts crossing.
const PAUSE_MS = 820;
// How fast the strip crosses, in pixels a second. Lower is slower.
const TICKER_PPS = 124;

let tickerAnim = null;

function renderTicker() {
  const track = $("tickerTrack");
  const view = track.parentElement;

  if (STATE.status === "idle") {
    if (tickerKey === "idle") return;
    tickerKey = "idle";
    $("tickerTag").textContent = "PA MILK SOCIETY";
    tickerAnim?.cancel();
    track.innerHTML = `<span class="tk">2026 DRAFT &middot; 14 ROUNDS &middot; SNAKE &middot; FULL PPR &middot; 6PT PASSING TD &middot; TE PREMIUM</span>`;
    return;
  }

  const views = tickerViews();
  const which = views[viewIndex % views.length];
  const strip = which === "round" ? roundStrip()
              : which === "available" ? availableStrip() : allStrip();

  // Rebuild only when this pass's content actually changed, so a clock tick
  // does not restart the run halfway through. Content only ever depends on
  // PICKS now (on-deck is gone, and with it the last STATE.current-only
  // change that could alter a strip) — leaving STATE.current in this key
  // used to mean hitting Next Pick, which doesn't touch PICKS, would still
  // restart whatever strip was mid-scroll for no visible reason.
  const key = `${viewIndex}|${which}|${strip.tag}|${strip.html.length}|${PICKS.length}`;
  if (key === tickerKey) return;
  tickerKey = key;

  $("tickerTag").textContent = strip.tag;
  tickerAnim?.cancel();
  track.innerHTML = strip.html;

  const w = track.scrollWidth;
  if (!w || !(view.clientWidth || 0)) return;

  // The scroll-off distance is just the strip's own width now — it starts
  // at rest (x:0), not off-screen right, so there's no extra viewport-width
  // run-up to cover first the way there used to be.
  const scrollMs = Math.max(12000, (w / TICKER_PPS) * 1000);
  const totalMs = LIFT_MS + PAUSE_MS + scrollMs;
  const liftFrac = LIFT_MS / totalMs;
  const holdFrac = (LIFT_MS + PAUSE_MS) / totalMs;

  tickerAnim = track.animate([
    { offset: 0,        transform: "translate(0, 100%)", opacity: 0, easing: "cubic-bezier(.2,.85,.3,1)" },
    { offset: liftFrac,  transform: "translate(0, 0)",     opacity: 1, easing: "linear" },
    { offset: holdFrac,  transform: "translate(0, 0)",                 easing: "linear" },
    { offset: 1,        transform: `translate(${-w}px, 0)` },
  ], { duration: totalMs, fill: "both" });

  tickerAnim.onfinish = () => {
    viewIndex++;
    tickerKey = "";
    renderTicker();
  };
}

// ── the noise ─────────────────────────────────────────────────────────────

let ac = null;
function audio() {
  if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === "suspended") ac.resume();
  return ac;
}
document.addEventListener("click", () => audio(), { once: true });

function note(freq, start, dur, type = "sine", gain = 0.16) {
  const a = audio();
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g); g.connect(a.destination);
  o.start(a.currentTime + start); o.stop(a.currentTime + start + dur + 0.05);
}

function sting() {
  if (STATE.sound === false) return;
  try {
    [261.6, 329.6, 392.0, 523.3].forEach((f, i) => note(f, i * 0.07, 0.8, "triangle", 0.14));
    note(65.4, 0, 1.05, "sine", 0.26);
  } catch (_) { /* audio not permitted yet; the visuals carry it */ }
}
