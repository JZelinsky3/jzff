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

/**
 * Nothing on this board should be waiting on a network fetch while it is on
 * screen.
 *
 * Player photographs and team crests come off sleepercdn, and the first time
 * either one is asked for is the frame the selection graphic is painted in —
 * so the biggest beat of the night opened on an empty card and filled in
 * afterward, which is most of what "a slight pause" was. The pick is announced
 * on the phone before it is revealed, so `pending` is known for as long as THE
 * PICK IS IN is up: that is the window, and it is seconds wide.
 *
 * The 32 crests are pulled once at boot instead. They are small, they never
 * change, and every one of them will be wanted before the night is out.
 */
const warmed = new Set();
function warm(url) {
  if (!url || warmed.has(url)) return;
  warmed.add(url);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
}

for (const abbr of C.TEAM_ABBRS) warm(C.teamLogo(abbr));

function warmPending() {
  const p = STATE.pending;
  if (!p) return;
  warm(C.headshot(C.DATA.byId.get(p.id) || p));
  warm(C.teamLogo(p.team));
}

C.watchState(s => {
  const prev = STATE;
  STATE = s;
  // Before anything is drawn: the pick is known on the phone well before it is
  // revealed, so the photograph is in cache by the time the graphic wants it.
  warmPending();
  applyPhase(prev.status, s.status);
  renderAll();
});

// Bumped on every picks snapshot, and used in the paint keys below instead of
// a pick count: undoing a pick and entering a different player at the same
// slot leaves the count where it was, and a count is what the keys used to be.
let picksRev = 0;

C.watchPicks(p => {
  PICKS = p; lastPickCount = p.length; picksRev++;
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

/**
 * The overlap that keeps the live board from showing between two screens.
 *
 * Every full-screen beat here fades in from transparent, and the screen it is
 * replacing used to be switched off in the same frame the fade started — so
 * for a third of a second you were looking straight through the incoming card
 * at the resting board. That is the half-second "pause" between THE PICK IS IN
 * and the selection graphic, and the break between the round card and the man
 * on the clock: not a pause at all, a hole.
 *
 * `handoff` holds the outgoing screen up (see the display rules in the CSS)
 * for exactly as long as the incoming one takes to become opaque. Nothing is
 * timed against the network and nothing waits on a load; it is one class and
 * one timer.
 */
const HANDOFF_MS = 440;
let handoff = false;
let handoffTimer = null;

function setBodyClass(cls) {
  body.className = cls + (handoff ? " handoff" : "");
}

/**
 * The two and a half seconds before the next man's countdown appears.
 *
 * His clock has in fact been running since the pick was revealed — the console
 * starts it there on purpose — but the card in the corner used to simply have
 * a countdown on it one frame and a different countdown the next, which is the
 * only handover in the whole draft that happened without anybody saying so.
 * The card says whose clock it is first, in words, and the numbers arrive
 * after. Nothing is held up by it: this is what is drawn, not what is true.
 */
const NEXT_CUE_MS = 2600;
let cueTimer = null;

function cueNextOnClock() {
  const el = document.querySelector(".bb-next");
  clearTimeout(cueTimer);
  if (!el) return;
  // Not at the turn of a round: that card is about the round, and there is no
  // clock on it to introduce — it does not start until the console advances.
  if (el.classList.contains("turning")) { el.classList.remove("cue", "ready"); return; }
  el.classList.remove("ready");
  el.classList.add("cue");
  cueTimer = setTimeout(() => {
    el.classList.remove("cue");
    el.classList.add("ready");
  }, NEXT_CUE_MS);
}

function clearCue() {
  clearTimeout(cueTimer);
  document.querySelector(".bb-next")?.classList.remove("cue", "ready");
}

function beginHandoff() {
  handoff = true;
  clearTimeout(handoffTimer);
  handoffTimer = setTimeout(() => {
    handoff = false;
    body.classList.remove("handoff");
  }, HANDOFF_MS);
}

function applyPhase(prevStatus, nextStatus) {
  clearTimeout(phaseTimer);

  if (nextStatus !== "revealed") {
    phase = null;
    clearCue();

    const round = C.roundOf(STATE.current || 1);
    // Only the formal advance — Next Pick, revealed to clock — earns a card.
    // Not idle to clock at the very start: the resting state already makes an
    // entrance of its own there.
    if (nextStatus === "clock" && prevStatus === "revealed") {
      // The detail screen stays up under the card that is fading in over it.
      beginHandoff();
      // A new round leads, then the manager who opens it. showAnnounce()
      // queues them so they play in that order rather than on top of us.
      if (lastRound !== null && round > lastRound) announceRound(round);
      announceOnClock();
    } else if (nextStatus === "idle" || nextStatus === "pick_in") {
      clearAnnounce();
    }
    setBodyClass(`board state-${nextStatus}`);
    lastRound = round;
    return;
  }

  lastRound = C.roundOf(STATE.current || 1);

  if (prevStatus !== "revealed") {
    phase = "selection";
    sting();
    // THE PICK IS IN stays up under the selection graphic's fade.
    if (prevStatus === "pick_in") beginHandoff();
    phaseTimer = setTimeout(() => {
      phase = "details";
      setBodyClass("board state-revealed phase-details");
      renderAll();
      // After renderAll, which is what decides whether this card is a clock
      // or the turn of a round.
      cueNextOnClock();
    }, SELECTION_MS);
  }
  setBodyClass(`board state-revealed phase-${phase || "details"}`);
}

// ── the full-screen announcements ─────────────────────────────────────────
//
// A queue rather than a pair of independent timers. The last pick of a round
// fires both of these at once — new round, and the manager who leads it off —
// and without a queue the second would overwrite the first mid-animation. One
// plays out, then the next starts.

const ONCARD_MS = 5200;
const ROUNDCARD_MS = 4600;
// How long a card's own fade takes, in both directions. Matches the `dim` and
// `undim` animations on .announce.
const ANN_FADE_MS = 360;

let annQueue = [];
let annTimer = null;
let annOutTimer = null;
let annShowing = null;

function showAnnounce(el, ms) {
  annQueue.push([el, ms]);
  if (!annShowing) runAnnounce();
}

/**
 * One card at a time, but never a frame with neither of them up.
 *
 * The round card used to be switched off and the on-the-clock card started a
 * quarter second later, on top of which the incoming card faded in from
 * nothing — so the two announcements had most of a second of live board
 * between them. The incoming card is lifted over the outgoing one instead and
 * the outgoing one is dropped once the new one is opaque, so the cut happens
 * behind a screen that is already covering it.
 */
function runAnnounce() {
  const next = annQueue.shift();
  const out = annShowing;

  if (!next) {
    annShowing = null;
    if (out) fadeOutAnnounce(out);
    return;
  }

  const [el, ms] = next;
  annShowing = el;
  clearTimeout(annOutTimer);
  el.classList.remove("out");
  el.classList.add("show");

  if (out && out !== el) {
    el.classList.add("over");
    annOutTimer = setTimeout(() => {
      out.classList.remove("show", "over", "out");
      el.classList.remove("over");
    }, ANN_FADE_MS);
  }

  annTimer = setTimeout(runAnnounce, ms);
}

/** The last card of a run: fades back to the board rather than cutting to it. */
function fadeOutAnnounce(el) {
  el.classList.add("out");
  clearTimeout(annOutTimer);
  annOutTimer = setTimeout(() => el.classList.remove("show", "over", "out"), ANN_FADE_MS);
}

/** Drop everything queued or showing — a state jump shouldn't leave a card up. */
function clearAnnounce() {
  clearTimeout(annTimer);
  clearTimeout(annOutTimer);
  annQueue = [];
  annShowing = null;
  for (const id of ["onCard", "roundCard"]) {
    $(id).classList.remove("show", "over", "out");
  }
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
      ? `<img class="rc-face" src="${m.cutout}" alt="" decoding="async" onerror="this.remove()">` : "";
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

/**
 * Five times a second, four countdowns. Both writes are guarded because both
 * are more expensive than they look: assigning `className` invalidates style
 * for the element whether or not the string differs, and assigning
 * `textContent` tears down the text node and builds another. At 5Hz across
 * four elements that is 40 needless invalidations a second, all of them on
 * elements sitting inside cards the compositor would otherwise leave alone.
 */
function put(el, text, cls) {
  if (!el) return;
  if (el.textContent !== text) el.textContent = text;
  if (cls != null && el.className !== cls) el.className = cls;
}

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
    if (el.className !== "timer") el.className = "timer";
    put(sc, C.mmss(pickMs()), "sc-clock held");
    put(wall, "ON THE CLOCK", null);
    put(next, C.mmss(pickMs()), "next-clock held");
    put($("nextNote"), "", null);
    return;
  }
  const left = STATE.paused
    ? (STATE.pausedLeft ?? 0)
    : (STATE.clockEnds ? STATE.clockEnds - Date.now() : pickMs());
  const heat = STATE.paused ? " paused" : left <= 10000 ? " panic" : left <= 30000 ? " warn" : "";
  put(el, C.mmss(left), "timer" + heat);
  put(sc,
    STATE.clockEnds || STATE.paused ? C.mmss(left) : C.mmss(pickMs()),
    "sc-clock" + (!STATE.clockEnds && !STATE.paused ? " held" : heat));
  put(wall, STATE.paused ? "PAUSED" : C.mmss(left), "wc" + heat);
  // At the turn of a round there is no clock yet — it starts when the
  // commissioner advances — so this shows the full pick length, greyed, and
  // says so. A held 2:00 and a 2:00 that started a second ago are the same
  // picture otherwise, which is no way to know which one you are looking at.
  const started = !!STATE.clockEnds;
  put(next, C.mmss(started ? left : pickMs()), "next-clock" + (started ? heat : " held"));
  put($("nextNote"),
    started ? (STATE.paused ? "clock paused" : "") : "starts on next pick", null);
}

/**
 * The countdown on the pre-draft screen.
 *
 * Set as the second biggest thing on that screen, because on the days before
 * the draft it is the only thing on it that is news — everything else up there
 * is the same as it was yesterday. Units are labelled rather than run together
 * as `5D 12H 30M`, which reads as a part number from across a room.
 *
 * Inside the last day it drops the days column and picks up seconds, so the
 * screen is visibly counting rather than sitting on a number that changes once
 * a minute. Rebuilt only when the digits actually differ: this ticks twice a
 * second and the markup is four elements deep.
 */
const DRAFT_AT = new Date("2026-08-28T19:20:00-04:00").getTime();
let countKey = "";
setInterval(() => {
  if (STATE.status !== "idle") return;
  const d = DRAFT_AT - Date.now();
  const el = $("idleCount");
  if (d <= 0) {
    if (countKey !== "now") { countKey = "now"; el.innerHTML = `<b class="now">DRAFT DAY</b>`; }
    return;
  }
  const days = Math.floor(d / 864e5), h = Math.floor(d / 36e5) % 24;
  const m = Math.floor(d / 6e4) % 60, s = Math.floor(d / 1000) % 60;

  const parts = days > 0
    ? [[days, days === 1 ? "DAY" : "DAYS"], [h, "HRS"], [m, "MIN"]]
    : [[h, "HRS"], [m, "MIN"], [s, "SEC"]];

  const key = parts.map(p => p[0]).join(":");
  if (key === countKey) return;
  countKey = key;
  el.innerHTML = parts.map(([n, label], i) =>
    `${i ? `<u></u>` : ""}<span><b>${days > 0 && i === 0 ? n : String(n).padStart(2, "0")}</b>` +
    `<i>${label}</i></span>`).join("");
}, 500);

// ── render ────────────────────────────────────────────────────────────────

/**
 * Only rebuild a panel when what it would say has actually changed.
 *
 * renderAll runs on every write to the state document and every pick that
 * lands — pause, resume, adjust the clock, absorb a pick off Sleeper — and
 * every one of those used to re-`innerHTML` the whole board: seven lists, and
 * upward of thirty <img> elements thrown away and made again, each one a fresh
 * cache lookup and a fresh decode. That is the lag: not the work of drawing
 * the board once, but the work of drawing it again for no reason.
 *
 * Each panel now declares what its content depends on. If that has not moved,
 * the panel is left alone — which also means its entrance animations are not
 * restarted, which is the other half of what made the board feel twitchy.
 */
const paintKeys = new Map();
function changed(id, key) {
  if (paintKeys.get(id) === key) return false;
  paintKeys.set(id, key);
  return true;
}

function renderAll() {
  renderHeader(); renderClock(); renderLineup(); renderPickIn();
  renderSelection(); renderReveal(); renderNextUp();
  renderBestAvailable(); renderRail();
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
    .map(m => `<img src="${m.cutout}" alt="" decoding="async" onerror="this.remove()">`).join("");
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
  if (m.cutout) return `<img class="mgr-cut" src="${m.cutout}" alt="" decoding="async" onerror="this.remove()">`;
  if (m.avatar) return `<img class="mgr-av" src="${m.avatar}" alt="" decoding="async">`;
  return `<div class="mgr-av fallback">${C.escapeHtml(m.name[0])}</div>`;
}

function renderClock() {
  const o = STATE.current || 1;
  // The note and the facts read the board, so the pick count is in the key.
  if (!changed("clock", `${o}|${picksRev}`)) return;
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
    // The two middle facts alternate with the round. The outer two do not:
    // what he did with this round last year and when he is up again are both
    // about the pick in front of him and belong on every screen. The pair in
    // between is last season on the odd rounds and his whole career on the
    // even ones — four numbers about a man are enough to read at a glance, and
    // the same four for fourteen rounds is wallpaper.
    const c = m.career || {};
    const facts = [];
    if (ly) {
      facts.push(`<div class="f"><span class="k">2025 RD ${round}</span>
        <span class="v">${C.escapeHtml(ly.name)}</span></div>`);
    }
    if (round % 2 === 0) {
      if (c.record) {
        facts.push(`<div class="f"><span class="k">All-time</span>
          <span class="v">${record(c.record)}${c.win_pct
            ? ` <i>${String(c.win_pct.toFixed(3)).replace(/^0/, "")}</i>` : ""}</span></div>`);
      }
      facts.push(`<div class="f"><span class="k">Titles</span>
        <span class="v">${c.titles
          ? `${c.titles} <i>${(c.title_years || []).join(", ")}</i>`
          : "None yet"}</span></div>`);
    } else {
      if (ls.record) {
        facts.push(`<div class="f"><span class="k">2025</span>
          <span class="v">${C.escapeHtml(ls.record)}${ls.finish ? `, ${ordinalPick(ls.finish)}` : ""}</span></div>`);
      }
      if (ls.points_rank) {
        facts.push(`<div class="f"><span class="k">2025 points</span>
          <span class="v">${ordinalPick(ls.points_rank)}</span></div>`);
      }
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
  const justNow = (STATE.status === "revealed" && STATE.pending) ? STATE.pending.id : null;
  if (!changed("lineup", `${o}|${picksRev}|${justNow || ""}`)) return;
  const m = C.managerOf(o);
  if (!m) { $("luGrid").innerHTML = ""; $("luCount").textContent = ""; return; }

  const mine = PICKS.filter(p => p.slot === m.slot);
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
  if (!changed("pickin", String(o))) return;
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
  // The tagline reads the board, so the pick count belongs in the key.
  if (!changed("selection", `${o}|${p.id}|${picksRev}`)) return;
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
  // Who is left at his position moves with the board, so it is in the key.
  if (!changed("reveal", `${o}|${p.id}|${picksRev}`)) return;
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

  // Read left to right, the row goes from what the player is to what the pick
  // was: rookie first, then where he sat on the board, then the verdict on
  // taking him here. The verdict is the loudest thing on the row — a solid
  // red or green box — and it was leading, which put the judgement in front of
  // the facts it is drawn from. It ends the row now.
  const tags = [];
  if (p.rookie) tags.push(`<span class="tag rookie">ROOKIE</span>`);
  // "BOARD 32" meant nothing on its own. Say what the number is.
  if (p.board) tags.push(`<span class="tag">RANKED #${p.board} OVERALL</span>`);
  if (p.posrank) tags.push(`<span class="tag pos-${p.pos}">${p.pos}${p.posrank} ON THE BOARD</span>`);
  const v = C.verdict(o, p.board);
  if (v && v.level !== 0) {
    const cls = { 2: "steal", 1: "value", "-1": "early", "-2": "reach" }[v.level];
    // Both halves say the same kind of thing now. "REACH · 45 EARLY" was a
    // label, a dot and a fragment; a man does not fall 45 spots and then get
    // taken "45 early", he gets jumped 45 spots. Same verb shape either
    // direction, and the tag word is set apart by weight rather than by a
    // separator sitting in the middle of the phrase.
    const how = v.gap > 0 ? `FELL ${v.gap} SPOTS` : `JUMPED ${Math.abs(v.gap)} SPOTS`;
    tags.push(`<span class="tag verdict ${cls}"><b>${v.tag}</b>${how}</span>`);
  }
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
  // while a reveal is up. Five, not four: it is a five-row card either way now
  // that it has a five-row card beside it.
  const left = C.bestAvailable(PICKS, p.pos, 5);
  $("revAlso").innerHTML = left.length
    ? `<span class="k">${p.pos} still available</span><ul>` +
      left.map(x => `<li><span class="pr pos-${x.pos}">${x.pos}${x.posrank}</span>` +
        `<span class="nm">${C.escapeHtml(x.name)}</span>` +
        `<span class="tm">${C.escapeHtml(x.team || "")}</span></li>`).join("") + `</ul>`
    : "";

  renderRevealRoster(p, o, m);

  const box = $("revHist");
  // Nothing under the heading in either of these cases, so it is not a heading
  // — it is the whole card, and .solo sets it as one: centred under the
  // photograph instead of left-aligned over a list of years that isn't there.
  box.classList.toggle("solo", !hist.length);
  if (!hist.length) {
    // Two different men end up here and the line has to tell them apart: one
    // has never been draftable, the other has been sitting there every year
    // and nobody has taken him.
    box.innerHTML = `<span class="k">${
      p.rookie ? "Rookie's first draft" : "First time drafted"}</span>`;
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
        // The pick is the fact and the year is the filing, so the pick is set
        // brighter and spelled out. It read `pk 39` in grey beside a white
        // year, which had it exactly backwards.
        const rep = m && h.m === m.name;
        return `<li><b>${h.y}</b><span class="pk">pick ${h.p}</span>` +
          `<span class="mgr${rep ? " rep" : ""}">${C.escapeHtml(h.m)}</span></li>`;
      }).join("") +
      (extra > 0 ? `<li class="more">+${extra} more</li>` : "") +
      `</ul>`;
  }
}

const NTH = ["", "first", "second", "third", "fourth", "fifth", "sixth",
             "seventh", "eighth", "ninth", "tenth"];

/**
 * The round a manager has historically taken his nth man at a position.
 *
 * `firstRoundFor` below answers this for n = 1 only, which is the question the
 * showcase asks while he is on the clock. Once a pick has landed the question
 * is sharper — this is his third receiver, not his first — so this walks the
 * same data one step further: for each draft he has made, the round he was in
 * when he took his nth at that position, and then the average, the earliest and
 * the latest across those drafts.
 *
 * Ordered by overall pick within a year rather than by round, because
 * `round_picks` is keyed by round and a manager with two picks in a round has
 * them in file order, not board order.
 */
const nthRoundCache = new Map();

function nthRoundFor(m, pos, n) {
  const key = `${m.slot}|${pos}|${n}`;
  if (nthRoundCache.has(key)) return nthRoundCache.get(key);

  const byYear = new Map();
  for (const [r, list] of Object.entries(m.round_picks || {})) {
    for (const p of list) {
      if (!byYear.has(p.y)) byYear.set(p.y, []);
      byYear.get(p.y).push({ r: Number(r), ov: p.ov, pos: p.pos });
    }
  }

  const rounds = [];
  for (const picks of byYear.values()) {
    picks.sort((a, b) => a.ov - b.ov);
    let seen = 0;
    for (const x of picks) {
      if (x.pos !== pos) continue;
      if (++seen === n) { rounds.push(x.r); break; }
    }
  }

  // `rounds` comes back with the rest of it now. The average and the two ends
  // say where he usually lands; the list is what says whether "usually" means
  // anything — four drafts inside one round and four spread across six carry
  // the same average and are not the same manager.
  const out = rounds.length ? {
    avg: rounds.reduce((a, b) => a + b, 0) / rounds.length,
    lo: Math.min(...rounds), hi: Math.max(...rounds), n: rounds.length,
    rounds: rounds.slice().sort((a, b) => a - b),
  } : null;
  nthRoundCache.set(key, out);
  return out;
}

/** `3.4`, `3` — a round average, without a trailing zero on a whole number. */
const rd = x => (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, "");

/*
 * The range used to be set as ordinals with the word after the figure —
 * `3rd earliest`, `7th latest` — and read as a rank rather than as a round:
 * his third-earliest pick instead of round three, his earliest. The word goes
 * first now and the ordinal comes off, so both figures are plain round numbers
 * exactly like the two above them, and the row reads label then value the way
 * a labelled figure does. See .hb-r in draft.css for the other half of it.
 */

/**
 * Every draft he has taken this player at, as a strip, with tonight lit.
 *
 * The card had a verdict line here that said "1.3 rounds earlier than usual",
 * which was the subtraction of the two numbers directly above it, written out
 * for a room that can subtract. Taking it out was right and left a hole, and
 * putting back anything derived from those same two numbers would be the same
 * mistake with different words.
 *
 * So this is the thing the numbers cannot say: the spread. An average of 6
 * from 5-6-7 and an average of 6 from 2-6-10 are the same figure and a
 * completely different habit, and one tick per draft on a round axis shows
 * which one it is at a glance. Underneath, where tonight ranks inside his own
 * history — also not a difference, a position.
 */
function historyStrip(h, round, pos) {
  if (!h || !h.rounds || !h.rounds.length) return "";

  // The axis is his own range with three rounds of air either side, not the
  // whole draft. A man whose sevens all sit between the fourth and the seventh
  // round was drawing five dots inside the first third of a fifteen-round line
  // and leaving two thirds of the card empty to make a point about rounds he
  // has never used. Zoomed to what he actually does, the same five dots have
  // the width to show a gap.
  //
  // Tonight is folded into the bounds before the padding, so a pick outside
  // everything he has ever done still lands on the line rather than pinned to
  // an end of it. A floor on the span stops a man with one prior draft getting
  // a four-round axis, where two dots at opposite ends would read as a wide
  // habit instead of a narrow one.
  const MIN_SPAN = 8;
  let a = Math.max(1, Math.min(h.lo, round) - 3);
  let b = Math.min(C.ROUNDS, Math.max(h.hi, round) + 3);
  if (b - a < MIN_SPAN) {
    const need = MIN_SPAN - (b - a);
    a = Math.max(1, a - Math.ceil(need / 2));
    b = Math.min(C.ROUNDS, b + Math.floor(need / 2));
    // Ran into an end of the draft: spend what is left on the other side.
    if (b - a < MIN_SPAN) {
      if (a === 1) b = Math.min(C.ROUNDS, a + MIN_SPAN);
      else a = Math.max(1, b - MIN_SPAN);
    }
  }
  const at = r => ((r - a) / (b - a)) * 100;

  // One dot per round, sized by how many times he has done it — not one dot per
  // draft. A dot per draft puts every repeat at the same coordinate as the one
  // under it, so a man who took his second back in the sixth round four years
  // running drew four dots in the same pixel and the strip said he had done it
  // once. Weight is the honest way to show a repeat on a single axis: the round
  // he keeps going back to is the fattest thing on the line.
  //
  // Capped at three. The step has to stay under the lit dot's size or a habit
  // outdraws tonight's pick, which is the one mark on here that must read first.
  // A tick per round, so the line is a ruler and not just a line — without them
  // the gap between two dots is a distance and with them it is a number of
  // rounds, which is the thing the strip is actually about.
  const rules = [];
  for (let r = a; r <= b; r++) rules.push(`<i class="hb-rd" style="left:${at(r).toFixed(2)}%"></i>`);

  const tally = {};
  h.rounds.forEach(r => { tally[r] = (tally[r] || 0) + 1; });
  const ticks = Object.keys(tally).map(Number).sort((x, y) => x - y)
    .map(r => {
      const d = (0.75 + (Math.min(tally[r], 3) - 1) * 0.28).toFixed(2);
      return `<i class="hb-was" style="left:${at(r).toFixed(2)}%;--d:${d}"></i>`;
    }).join("");

  // Strictly earlier, so a tie puts tonight at the front of the equals. That is
  // the right call everywhere except when he has taken it in the same round
  // every year and tonight is that round again — "earliest" for a column of
  // identical numbers reads as a finding when the fact is there is nothing to
  // find.
  //
  // No "of seven" on the end of any of them. How many drafts he has is the same
  // number on every card he appears on all night, so it is not news — the rank
  // is the whole sentence.
  const rank = h.rounds.filter(r => r < round).length + 1;
  const solo = h.lo === h.hi && h.lo === round;
  const where = solo ? "Same round every time"
    : rank === 1 ? "Earliest taken"
    : rank === h.n + 1 ? "Latest taken"
    : `${ordinalPick(rank)} earliest`;

  // Ruler first, then his drafts, then tonight. None of them carry a z-index —
  // paint order is document order, so a dot always covers the tick it sits on
  // and tonight always covers everything. That is the right way round: the tick
  // is the scale and the dot is the reading, and where they collide the reading
  // is what you want to see.
  const track = `<div class="hb-track">${rules.join("")}${ticks}<i class="hb-now"
    style="left:${at(round).toFixed(2)}%;background:var(--${pos.toLowerCase()}-hi)"></i></div>`;

  return `<div class="hb-plot">${track}` + (solo
    ? `<div class="hb-cap solo"><b>${where}</b></div>`
    : `<div class="hb-cap"><span>RD ${a}</span><b>${where}</b><span>RD ${b}</span></div>`) +
    `</div>`;
}

/**
 * How this pick sits against how he normally drafts.
 *
 * This slot used to hold his roster as four position counts. It was true, and
 * for the first several rounds the lineup card in the band underneath was
 * already showing the same thing in names — so the reveal was spending a card
 * on a fact the room could read two inches lower.
 *
 * What it holds instead is the one thing on this screen that is about the
 * manager rather than the player: he has drafted in this league seven times,
 * and this is where he usually takes his second back. The counts got less
 * interesting as the night went on; this gets more so, because by round six
 * every position has a history behind it.
 *
 * Four lines and no more. It carried the count of drafts the average was taken
 * over, and the "up again at pick 41, seventeen picks away" foot the counts
 * used to sit on — both true, both costing the card height it was making the
 * still-available list beside it match. The foot in particular is a fact about
 * the next twenty minutes on a card that is about the last seven years.
 *
 * Everything here is off `round_picks`, which is written at build time and does
 * not move while the draft runs, so it is cached per manager and position.
 */
function renderRevealRoster(p, o, m) {
  const el = $("revGone");
  if (!m) { el.innerHTML = ""; return; }

  // Which one of these he now has, this pick included — PICKS already carries
  // the pick being revealed.
  const nth = PICKS.filter(x => x.slot === m.slot && x.pos === p.pos).length || 1;
  const round = C.roundOf(o);
  const noun = (POS_ONE[p.pos] || p.pos).toLowerCase();
  const label = `His ${NTH[nth] || `${nth}th`} ${noun}`;

  const h = nthRoundFor(m, p.pos, nth);

  // There is no verdict line under the numbers any more. It read "1.3 rounds
  // earlier than usual" beneath a 6 sitting next to a 7.3, which is the same
  // sentence the numbers were already saying, in words, to a room that can
  // subtract. The four figures are the card.
  el.innerHTML =
    `<span class="k">${C.escapeHtml(label)}</span>` +
    (h
      // Four columns, not two big numbers over a line of small print. Earliest
      // and latest were set at 1.2u under a pair of 4.4u numerals, which made
      // the range — the half of this card that says whether the average means
      // Tonight and his average across the top, the two ends of the range
      // underneath them. The pair on top come down a size and the range comes
      // up two, so the row underneath reads as the other half of the same
      // module rather than as a caption to it.
      //
      // Where he has only ever done it once there is no average and no range:
      // all three numbers are the same number, and printing it three times
      // under three different words is worse than not printing it at all.
      ? (h.n > 1
        ? `<div class="hb">
             <div class="hb-c">
               <span class="hb-n pos-${p.pos}">${round}</span>
               <span class="hb-l">tonight</span>
             </div>
             <div class="hb-c">
               <span class="hb-n">${rd(h.avg)}</span>
               <span class="hb-l">his average</span>
             </div>
           </div>
           <div class="hb-range">
             <span class="hb-r"><i>earliest</i><b>${h.lo}</b></span>
             <span class="hb-r"><i>latest</i><b>${h.hi}</b></span>
           </div>
           ${historyStrip(h, round, p.pos)}`
        : `<div class="hb">
             <div class="hb-c">
               <span class="hb-n pos-${p.pos}">${round}</span>
               <span class="hb-l">tonight</span>
             </div>
             <div class="hb-c">
               <span class="hb-n">${h.lo}</span>
               <span class="hb-l">the one before</span>
             </div>
           </div>
           ${historyStrip(h, round, p.pos)}`)
      // Either he is new to the league or he has never gone this deep at the
      // position before, and "never" is the whole fact.
      : `<div class="hb-none">He has never taken
           a ${NTH[nth] || `${nth}th`} ${C.escapeHtml(noun)} in PAMS</div>`);
}

/**
 * The card that takes best available's place in the band while a reveal is up:
 * who is next, which pick it is, and their clock — the clock being the point,
 * since it is running under the reveal and the board's own timer is behind it.
 */
function renderNextUp() {
  const o = (STATE.current || 1) + 1;
  if (!changed("nextup", String(o))) return;
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
  // Outside the guard: it is a custom property, not markup, and the lineup
  // beside it can grow on a render that leaves this list untouched.
  document.querySelector(".bottom-band")?.style.setProperty("--band-rows", rows);
  if (!changed("bestavail", `${picksRev}|${rows}`)) return;
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
  // The tightest true sentence, which is not always the same sentence. Four
  // receivers in the last five picks is not "four of the last six", and four
  // straight receivers is not "four of the last four" — it is four straight.
  $("runAlert").innerHTML = run
    ? `<span class="run-tag pos-${run.pos}">RUN ALERT</span>` +
      `<span class="run-txt">${run.all
        ? `the last ${run.n} picks have all been ${run.pos}s`
        : `${run.pos}s have gone ${run.n} of the last ${run.span} picks`}</span>`
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
  if (!changed("wall", `${o}|${picksRev}`)) return;
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
    // Which conference he is in, as the colour of the tile. The wall is the
    // only place all twelve are on screen at once and it was the only place
    // that never said which half of the league anybody was in — the chip is on
    // the cards that show one man at a time, so the split was never visible as
    // a split. Nothing is added when a manager has no conference set: the
    // class is simply absent and the tile keeps its old blue.
    const conf = m && m.conference ? ` cf-${m.conference.toLowerCase()}` : "";
    const face = m && m.cutout
      ? `<img class="face" src="${m.cutout}" alt="" decoding="async" onerror="this.remove()">` : "";
    const avatarRow = p
      ? `<div class="ar">
          <img class="pav" src="${C.headshot({ id: p.playerId, pos: p.pos })}" alt="" decoding="async" onerror="this.remove()">
          <span class="pos pos-${p.pos}">${p.pos}${posOrder.get(p.overall) || ""}</span>
        </div>`
      : "";
    const nm = p ? C.escapeHtml(p.name)
      // tickClock() writes the countdown into this one every 200ms
      : n === o ? `<span class="wc" id="wallClk">ON THE CLOCK</span>`
      : "&mdash;";
    cells.push(`
      <div class="wt ${cls}${conf}"${p ? ` style="--pc:var(--${p.pos.toLowerCase()}-hi)"` : ""}>
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

// ── the right rail ────────────────────────────────────────────────────────
//
// The wall is what the rail shows unless the console says otherwise. The three
// alternates are all about the room and the pool rather than about the man on
// the clock, which is the reason they are allowed to stay up through a pick
// and the showcase is not — a career table over THE PICK IS IN is covering the
// thing everyone is looking at, and a board of what twelve rosters still need
// is a thing to talk about while the pick is going in.
//
// They share one paint key, `rail`, with the mode inside it, so switching
// panels always repaints and sitting on one does not. The wall keeps its own,
// because it is only hidden rather than torn down and does not need rebuilding
// to come back.

function renderRail() {
  const mode = STATE.rail || "wall";
  body.classList.toggle("rail-alt", mode !== "wall");
  if (mode === "needs")     return renderNeeds();
  if (mode === "run")       return renderRun();
  if (mode === "lastyear")  return renderStillThere();
  if (mode === "clockroom") return renderClockRoom();
  $("railSub").textContent = "";
  renderRoundBoard();
}

/** Header and sub-header of whichever panel is up. */
function railHead(title, sub) {
  $("roundHd").textContent = title;
  $("railSub").textContent = sub || "";
}

// ── team needs ────────────────────────────────────────────────────────────
//
// Not a lineup card. A lineup card is nine slots per manager, twelve managers
// deep, and by round three it is a wall of empty boxes saying nobody has a
// kicker — true, and not a thing anybody in the room needs told for ten
// rounds. What the room actually argues about is who is behind, at what, and
// whether the man they want will still be there when it comes back around.
//
// So the panel is a pace check. Every position carries a round by which you
// would want your first, second and third of them, a manager is behind at a
// position when he is under that number, and the panel says so in words.
// Kickers and defences have no targets at all and never appear.

/**
 * A need is a hole in the starting lineup, and nothing else.
 *
 * The first version of this measured against a table of "how many of each you
 * want by round N", which sounded right and said nothing: by round four every
 * manager in the league has a back and a receiver, so the panel reported
 * eleven men on pace and one behind. A gap in the nine spots you actually
 * start on Sunday discriminates on its own, all night, with no tuning.
 *
 * Kickers and defences are left out entirely — everybody fills them in the
 * last two rounds and nobody is behind for not having one in the fifth.
 */
const START = { QB: 1, RB: 2, WR: 2, TE: 1 };
// Chips are always drawn in this order, whatever the urgency: the panel is
// twelve rows of chips read as a column, and a row that reorders itself as the
// draft moves means comparing two managers means reading rather than glancing.
const NEED_ORDER = ["QB", "RB", "WR", "TE", "FLEX"];
const FLEXABLE = ["RB", "WR", "TE"];
const POS_WORDS = {
  QB: "quarterback", RB: "running back", WR: "receiver",
  TE: "tight end", FLEX: "flex",
};

/**
 * The round from which a gap is worth shouting about.
 *
 * Every gap is reported from the first pick — a manager with no quarterback in
 * round three has one and the board says so — but it is drawn quiet until the
 * round the room would actually start needling him about it. Twelve
 * quarterbacks and twelve tight ends start in this league and everybody waits;
 * backs and receivers are gone by the fourth.
 */
const URGENT_FROM = { RB: 3, WR: 3, FLEX: 6, QB: 7, TE: 8 };

/**
 * What a manager is missing from his starting nine.
 *
 * `needs` is in position order, for the chips. `urgent` is the same list
 * sorted by how much it matters, which is what the sentence and the shortlist
 * read from — those are about one man at a time and should lead with the thing
 * he should actually be worried about.
 */
function needsFor(slot, round) {
  const count = {};
  for (const p of PICKS) if (p.slot === slot) count[p.pos] = (count[p.pos] || 0) + 1;

  const out = [];
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    const short = START[pos] - (count[pos] || 0);
    if (short > 0) out.push({ pos, short, hot: round >= URGENT_FROM[pos] });
  }
  // The flex is filled by any spare back, receiver or tight end.
  const spare = FLEXABLE.reduce((a, p) => a + Math.max(0, (count[p] || 0) - START[p]), 0);
  if (spare < 1) out.push({ pos: "FLEX", short: 1, hot: round >= URGENT_FROM.FLEX });

  out.sort((a, b) => NEED_ORDER.indexOf(a.pos) - NEED_ORDER.indexOf(b.pos));
  const urgent = out.slice().sort((a, b) => (b.hot - a.hot) || (b.short - a.short) ||
    (URGENT_FROM[a.pos] - URGENT_FROM[b.pos]));
  return { count, needs: out, urgent };
}

/** "Needs a receiver and a tight end", "Needs two backs" — the whole point. */
function needSentence(needs) {
  if (!needs.length) return "Starting nine is full";
  const say = ({ pos, short }) => short > 1
    ? `${short === 2 ? "two" : short} ${POS_WORDS[pos]}s`
    : `a ${POS_WORDS[pos]}`;
  return `Needs ${needs.slice(0, 2).map(say).join(" and ")}`;
}

/** Who is left to fill a hole, flex included. */
function bestForNeed(pos, n) {
  if (pos !== "FLEX") return C.bestAvailable(PICKS, pos, n);
  const gone = new Set(PICKS.map(p => p.playerId));
  const out = [];
  for (const p of C.DATA.players) {
    if (gone.has(p.id) || !FLEXABLE.includes(p.pos)) continue;
    out.push(p);
    if (out.length >= n) break;
  }
  return out;
}

const posChip = (pos, extra = "") => pos === "FLEX"
  ? `<span class="pchip flex ${extra}">FLEX</span>`
  : `<span class="pchip ${extra}" style="--c:var(--${pos.toLowerCase()})">${pos}</span>`;

function renderNeeds() {
  const o = boardPick();
  if (!changed("rail", `needs|${o}|${picksRev}`)) return;

  const round = C.roundOf(o);
  const onClock = C.slotOf(o);

  // ── the man on the clock, in full ──
  const me = C.DATA.bySlot.get(onClock);
  const mine = needsFor(onClock, round);
  const next = C.nextPickForSlot(onClock, o + 1);
  const gap = next ? next - o : null;

  // What is actually left at what he is short of, which is the other half of
  // the question — a need is only interesting alongside who is there to fill
  // it. Two names per position: the one he would take and the one he would be
  // left with if somebody takes the first.
  const shortlist = mine.urgent.slice(0, 2).map(({ pos }) => {
    const left = bestForNeed(pos, 2);
    return `<div class="nb-row">
      <span class="nb-k">${posChip(pos)} LEFT</span>
      <span class="nb-v">${left.map(p => C.escapeHtml(p.name)).join(", ") || "nobody"}</span>
    </div>`;
  }).join("");

  // The man on the clock expands in place. He is not lifted to the top of the
  // panel and he does not leave a hole at his seat: the block is his row, in
  // his slot, opened up. The room reads this list by seat, and a name that
  // moves depending on whose turn it is has to be hunted for.
  const head = `
    <div class="nb">
      <div class="nb-hd"><span class="n">${onClock}</span>ON THE CLOCK</div>
      <div class="nb-name">${me ? C.escapeHtml(me.name) : "&mdash;"}</div>
      <div class="nb-say">${needSentence(mine.urgent)}</div>
      <div class="nb-chips">${mine.needs.length
        ? mine.needs.map(n => posChip(n.pos, n.hot ? "hot" : "")).join("")
        : `<span class="pchip set">STARTING NINE FULL</span>`}</div>
      ${shortlist}
      <div class="nb-next">${next
        ? `Next pick <b>${C.ordinal(next)}</b> &middot; ${gap} away`
        : "No picks left"}</div>
    </div>`;

  // ── the room, in draft order ──
  const rows = [];
  const behind = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0 };
  for (let slot = 1; slot <= C.TEAMS; slot++) {
    const { needs } = needsFor(slot, round);
    needs.forEach(n => { behind[n.pos]++; });
    if (slot === onClock) { rows.push(head); continue; }
    const m = C.DATA.bySlot.get(slot);
    rows.push(`
      <div class="nrow">
        <span class="n">${slot}</span>
        <span class="mg">${m ? C.escapeHtml(m.name) : ""}</span>
        <span class="nch">${needs.length
          ? needs.map(n => posChip(n.pos, n.hot ? "hot" : "")).join("")
          : `<span class="pchip set">FULL</span>`}</span>
      </div>`);
  }

  // The gap the most of the room shares. "9 STILL WITHOUT A QB" is the line
  // that explains the next two rounds before they happen.
  const worst = NEED_ORDER.slice().sort((a, b) => behind[b] - behind[a])[0];
  railHead("TEAM NEEDS", behind[worst]
    ? `${behind[worst]} STILL WITHOUT ${worst === "FLEX" ? "A FLEX" : `A ${worst}`}`
    : "EVERY STARTING SPOT FILLED");
  $("railPanel").innerHTML = `<div class="needs">${rows.join("")}</div>`;
}

// ── the run ───────────────────────────────────────────────────────────────
//
// Best available already flags a run with a chip the size of a word. This is
// that chip with the evidence under it: which position, how far back it goes,
// the last twelve picks laid out so the shape of it is visible rather than
// asserted, what is left at the position it is happening at, and how the last
// two rounds actually broke down.
//
// The panel is worth putting up when there is no run on, too, which is why
// nothing here is behind that condition — the makeup of the round and what is
// left at each position are the same questions asked more quietly.

const RUN_POS = ["QB", "RB", "WR", "TE"];
const STRIP = 12;

/**
 * Every run the draft has had, in order, by replaying it.
 *
 * `positionRun` only ever answers "right now", which is the whole board's
 * question but not the panel's — a run that ended four picks ago is the reason
 * the last four picks look the way they do, and it vanished the moment it
 * retired. So the draft is walked from the top and the answer recorded at each
 * pick: consecutive readings at the same position are one event, and the
 * biggest reading it ever gave is what that event is remembered as.
 *
 * A hundred and eighty prefixes of a short backwards walk, computed only when
 * the panel is on screen and only when a pick has landed since the last time,
 * which is nothing.
 */
function runHistory(picks) {
  const out = [];
  const open = {};

  for (let i = 1; i <= picks.length; i++) {
    const prefix = picks.slice(0, i);
    // Each position tracked on its own, with runAt rather than positionRun.
    // positionRun answers "which run is the board's story right now", so it
    // returns one position and drops the others — which meant a receiver run
    // was closed and reopened every time a back briefly outranked it, and the
    // panel listed the same run twice with two overlapping ranges.
    for (const pos of RUN_POS) {
      const r = C.runAt(prefix, pos);
      const cur = open[pos];
      if (!r) {
        if (cur) { out.push(cur); delete open[pos]; }
        continue;
      }
      if (cur) {
        // Still the same run. Keep its high-water mark, move its end.
        if (r.n > cur.n) { cur.n = r.n; cur.span = r.span; cur.from = prefix[i - r.span]; }
        cur.to = prefix[i - 1];
      } else {
        open[pos] = { pos, n: r.n, span: r.span, from: prefix[i - r.span], to: prefix[i - 1] };
      }
    }
  }
  // Anything still open is running now and belongs to the block at the top of
  // the panel, not to the list of what has already been and gone.
  for (const pos of RUN_POS) if (open[pos]) { open[pos].live = true; out.push(open[pos]); }
  out.sort((a, b) => a.to.overall - b.to.overall);
  return out;
}

function renderRun() {
  const o = boardPick();
  if (!changed("rail", `run|${o}|${picksRev}`)) return;

  const run = C.positionRun(PICKS);
  const round = C.roundOf(o);

  // ── the headline ──
  // "5 of the last 7" when the run has other picks mixed into it, "5 straight"
  // when it does not, because those are different events and the second one is
  // the one the room is shouting about.
  // Who is doing it, which is the half of a run the board never said. The
  // right of this block was empty and the answer to "who started this" was
  // sitting in the same picks the left half is counting.
  //
  // Names on their own row across the foot of the block, not stacked in the
  // right column: one per line meant the height of the headline was set by how
  // many men were in the run, so a six-deep receiver run — the one worth
  // putting on screen — pushed the block down over the sections under it. A
  // wrapped row is two lines at the very worst and the same height at four
  // names as it is at one.
  const inIt = run
    ? PICKS.slice(-run.span).filter(p => p.pos === run.pos)
    : [];
  const whoIn = [...new Set(inIt.map(p => p.manager).filter(Boolean))];

  // How many each of them took, because at a turn a man picks twice inside the
  // same run and the row read as if eight separate people had all decided the
  // same thing. Two of the eight being one man at the turn is a different
  // event, and it is the one that starts these — he is the reason the position
  // came off the board twice with nobody in between.
  const takenIn = {};
  inIt.forEach(p => { if (p.manager) takenIn[p.manager] = (takenIn[p.manager] || 0) + 1; });

  const head = run
    ? `<div class="rn-live">
         <div class="rn-main">
           <div class="rn-k">RUN ON THE BOARD</div>
           <div class="rn-pos" style="--c:var(--${run.pos.toLowerCase()})">${POS_WORDS[run.pos].toUpperCase()}S</div>
           <div class="rn-n">${run.all
             ? `<b>${run.n}</b> STRAIGHT`
             : `<b>${run.n}</b> OF THE LAST <b>${run.span}</b>`}</div>
         </div>
         <div class="rn-who">
           <div class="rn-k">${whoIn.length} IN IT</div>
           <div class="rn-span">${pickLabel(inIt[0])} to ${pickLabel(inIt[inIt.length - 1])}</div>
         </div>
         <div class="rn-names">${whoIn.map(n => {
           const k = takenIn[n] || 1;
           return `<span${k > 1 ? ` class="dbl"` : ""}>${C.escapeHtml(n)}${
             k > 1 ? `<b>&times;${k}</b>` : ""}</span>`;
         }).join("")}</div>
       </div>`
    : `<div class="rn-live quiet">
         <div class="rn-main">
           <div class="rn-k">NO RUN ON THE BOARD</div>
           <div class="rn-pos">THE ROOM IS SPREAD OUT</div>
           <div class="rn-n">Nothing has gone ${C.runShape("RB").n} deep without the room moving on</div>
         </div>
       </div>`;

  // ── the last twelve picks ──
  // In board order, oldest on the left, so it reads the way the draft ran. The
  // picks inside the run are lit and everything else is a grey tick.
  const tail = PICKS.slice(-STRIP);
  const runFrom = run ? PICKS.length - run.span : Infinity;
  const strip = tail.map((p, i) => {
    const idx = PICKS.length - tail.length + i;
    const lit = run && idx >= runFrom && p.pos === run.pos;
    return `<span class="rn-tick${lit ? " lit" : ""}" style="--c:var(--${p.pos.toLowerCase()})">
      <i>${p.pos}</i><u>${p.round}.${String(p.roundPick).padStart(2, "0")}</u></span>`;
  }).join("") || `<span class="rn-none">No picks yet</span>`;

  // ── what is left ──
  const gone = C.positionTally(PICKS);
  const most = Math.max(1, ...RUN_POS.map(p => gone[p] || 0));
  // Two names, not one. The second is what you are left with if the man in
  // front of you takes the first, which during a run is the entire question.
  const left = RUN_POS.map(pos => {
    const top = C.bestAvailable(PICKS, pos, 2);
    return `<div class="rn-lrow${run && run.pos === pos ? " hot" : ""}">
      ${posChip(pos)}
      <span class="rn-bar"><i style="width:${((gone[pos] || 0) / most) * 100}%;
        background:var(--${pos.toLowerCase()})"></i></span>
      <span class="rn-ct">${gone[pos] || 0}</span>
      <span class="rn-top">
        <b>${top[0] ? C.escapeHtml(top[0].name) : "&mdash;"}</b>
        <i>${top[1] ? C.escapeHtml(top[1].name) : "&nbsp;"}</i>
      </span>
    </div>`;
  }).join("");

  // ── how the last two rounds broke down ──
  // Two, not all of them: fifteen rounds of this is a table nobody reads from
  // a couch, and the round before this one is the only history that explains
  // what is happening in this one.
  const roundRow = r => {
    const inR = PICKS.filter(p => p.round === r);
    if (!inR.length) return "";
    const c = {};
    inR.forEach(p => { c[p.pos] = (c[p.pos] || 0) + 1; });
    const cells = RUN_POS.map(pos => `<span class="rm-c${c[pos] ? "" : " zero"}"
      style="--c:var(--${pos.toLowerCase()})"><b>${c[pos] || 0}</b><i>${pos}</i></span>`).join("");
    const other = inR.length - RUN_POS.reduce((a, p) => a + (c[p] || 0), 0);
    return `<div class="rm-row">
      <span class="rm-r">RD ${r}</span>${cells}
      <span class="rm-o">${other ? `+${other}` : ""}</span>
      <span class="rm-n">${inR.length}/${C.TEAMS}</span></div>`;
  };

  // ── every run the night has had ──
  // The one on the board now is already the block at the top, so it is not
  // repeated here: this is what came before it, most recent first, and it is
  // the section that makes the panel worth putting up in a quiet stretch.
  const past = runHistory(PICKS).filter(r => !r.live).reverse().slice(0, 5);
  const runs = past.length
    ? past.map(r => `<div class="rh-row">
        ${posChip(r.pos)}
        <span class="rh-n"><b>${r.n}</b> of ${r.span}</span>
        <span class="rh-at">${r.from ? pickLabel(r.from) : ""} to ${pickLabel(r.to)}</span>
        <span class="rh-ago">${PICKS.length - PICKS.indexOf(r.to) - 1} picks ago</span>
      </div>`).join("")
    : `<div class="rh-none">No run has come and gone yet.</div>`;

  railHead("THE RUN", run
    ? `${run.n} ${run.pos} IN ${run.span} PICKS`
    : `ROUND ${round}`);
  $("railPanel").innerHTML = `
    <div class="runp">
      ${head}
      <div class="rn-sec"><div class="rn-hd">LAST ${tail.length} PICKS</div>
        <div class="rn-strip">${strip}</div></div>
      <div class="rn-sec grow"><div class="rn-hd"><span>GONE TONIGHT</span><span>BEST LEFT</span></div>
        ${left}</div>
      <div class="rn-sec grow runs"><div class="rn-hd"><span>RUNS ALREADY GONE</span><span>${
        past.length ? `${past.length} TONIGHT` : ""}</span></div>
        ${runs}</div>
      <div class="rn-sec rounds"><div class="rn-hd">HOW THE ROUNDS BROKE</div>
        ${roundRow(round)}${roundRow(round - 1)}</div>
    </div>`;
}

// ── still on the board ────────────────────────────────────────────────────
//
// Best available, but answering the question the room actually asks about a
// name it is surprised to still see: where did he go last year? A consensus
// ranking cannot land that. "He went in the second round to Connie and he is
// still sitting here in the fifth" lands with everyone in the room, because
// everyone in the room was there.

const LAST_YEAR = 2025;
const LAST_YEAR_TEAMS = 12;

/** How many drafts the history file covers, worked out once and kept. */
let draftYearCount = 0;
function draftYears() {
  if (!draftYearCount) {
    const years = new Set();
    for (const rows of Object.values(C.DATA.history)) for (const h of rows) years.add(h.y);
    draftYearCount = years.size;
  }
  return draftYearCount;
}

function renderStillThere() {
  const o = boardPick();
  if (!changed("rail", `still|${o}|${picksRev}`)) return;

  // Ten, not twelve. The slot each of them went at a year ago is the point of
  // the panel and it needs to be legible from a couch, which means it needs
  // room — twelve rows made it small print on the right of a name.
  const avail = C.bestAvailable(PICKS, null, 10);

  const rows = avail.map(p => {
    const hist = C.historyFor(p);
    const was = hist.find(h => h.y === LAST_YEAR);
    // Past his own slot from a year ago. Worth a highlight and not worth a
    // sentence: nobody is ranked the same two years running, so a man sitting
    // twenty picks past where he went last year is a mild curiosity rather
    // than the scandal the panel used to report it as. It was carrying a count
    // in the header and a line of gold type under every name it applied to.
    const past = was && was.p < o;

    // Where he went, as a draft slot rather than a sentence. `4.04` is how
    // everybody in the league says it out loud, so it is what the badge says,
    // with the year over it and who took him under it. Round pick is worked
    // out from the overall because history.json only stores the overall, and
    // it is safe here because this branch is 2025 only — earlier drafts ran
    // fourteen teams and the arithmetic would be wrong for them.
    let badge;
    if (was) {
      // No year on the badge. The header says the whole column is last year's
      // draft, and repeating 2025 ten times down the panel says it ten times
      // to a room that read it once.
      // The separator is its own element so it can be pulled in on both sides.
      // Teko hangs a lot of air either side of its period and `4.08` was
      // setting as `4 . 08`; negative tracking on the whole string fixes that
      // by squeezing the digits together too, which is a worse trade.
      const rp = was.p - (was.r - 1) * LAST_YEAR_TEAMS;
      badge = `<div class="sb${past ? " past" : ""}">
        <span class="sb-p">${was.r}<s>.</s>${String(rp).padStart(2, "0")}</span>
        <span class="sb-m">${C.escapeHtml(was.m)}</span>
      </div>`;
    } else if (hist.length) {
      badge = `<div class="sb none">
        <span class="sb-y">LAST TAKEN</span>
        <span class="sb-p">${hist[0].y}</span>
        <span class="sb-m">${C.escapeHtml(hist[0].m)}</span>
      </div>`;
    } else {
      badge = `<div class="sb none">
        <span class="sb-y">PAMS</span>
        <span class="sb-p sb-word">${p.rookie ? "ROOKIE" : "NEVER"}</span>
        <span class="sb-m">${p.rookie ? "first draft" : `in ${draftYears()} drafts`}</span>
      </div>`;
    }

    return `
      <div class="srow${past ? " past" : ""}">
        <img class="sh" src="${C.headshot(p)}" alt="" decoding="async"
             onerror="this.style.visibility='hidden'">
        <div class="sid">
          <div class="snm">${C.escapeHtml(p.name)}</div>
          <div class="ssub"><span class="pos pos-${p.pos}">${p.pos}${p.posrank || ""}</span>
            <span class="tm">${C.escapeHtml(p.team || "FA")}</span></div>
        </div>
        ${badge}
      </div>`;
  }).join("");

  railHead("STILL ON THE BOARD", `${LAST_YEAR} DRAFT SLOT`);
  $("railPanel").innerHTML = `<div class="still">${rows}</div>`;
}

// ── the clock room ────────────────────────────────────────────────────────
//
// How long everybody is taking. The times come off the pick records, where
// commitPick stamps `tookMs` from the state clock — paused time already taken
// back out, and stopping at the moment the phone locked the pick rather than
// at the announce, so the ceremony is not billed to the manager. Picks made
// before any of this existed simply have no time on them and sit out.

function renderClockRoom() {
  if (!changed("rail", `clockroom|${picksRev}`)) return;

  const timed = PICKS.filter(p => typeof p.tookMs === "number" && p.tookMs > 0);
  if (!timed.length) {
    railHead("THE CLOCK ROOM", "NO TIMES YET");
    $("railPanel").innerHTML =
      `<div class="croom empty"><p>Nobody has been timed yet.</p>
        <p class="sub">Every pick from here is on the stopwatch. Paused time
        does not count against anyone.</p></div>`;
    return;
  }

  const by = new Map();
  for (const p of timed) {
    const e = by.get(p.slot) || { slot: p.slot, total: 0, n: 0, worst: null };
    e.total += p.tookMs; e.n++;
    if (!e.worst || p.tookMs > e.worst.tookMs) e.worst = p;
    by.set(p.slot, e);
  }
  for (const e of by.values()) e.avg = e.total / e.n;

  // Slowest first. Anyone yet to be timed goes to the bottom, greyed, rather
  // than being left off — twelve rows every time means the panel does not
  // reflow under the room's eyes as the night goes on.
  const ranked = [...by.values()].sort((a, b) => b.avg - a.avg);
  const idle = C.DATA.managers
    .filter(m => !by.has(m.slot))
    .map(m => ({ slot: m.slot, avg: 0, n: 0, worst: null }));
  const top = ranked.length ? ranked[0].avg : 1;

  const longest = timed.reduce((a, b) => (b.tookMs > a.tookMs ? b : a), timed[0]);
  const roomAvg = timed.reduce((a, p) => a + p.tookMs, 0) / timed.length;

  const rows = [...ranked, ...idle].map((e, i) => {
    const m = C.DATA.bySlot.get(e.slot);
    if (!e.n) {
      return `<div class="crow none">
        <span class="cn">&mdash;</span>
        <span class="cmg">${m ? C.escapeHtml(m.name) : ""}</span>
        <span class="cbar"></span>
        <span class="cav">no picks timed</span></div>`;
    }
    return `<div class="crow${i === 0 ? " slowest" : ""}">
      <span class="cn">${i + 1}</span>
      <span class="cmg">${m ? C.escapeHtml(m.name) : ""}</span>
      <span class="cbar"><i style="width:${Math.max(3, (e.avg / top) * 100)}%"></i></span>
      <span class="cav">${C.mmss(e.avg)}<em>${e.n}</em></span>
    </div>`;
  }).join("");

  railHead("THE CLOCK ROOM", `ROOM AVERAGE ${C.mmss(roomAvg)}`);
  $("railPanel").innerHTML = `
    <div class="croom">
      <div class="clong">
        <div class="ck">LONGEST PICK OF THE NIGHT</div>
        <div class="ct">${C.mmss(longest.tookMs)}</div>
        <div class="cw">${C.escapeHtml(longest.manager || "")}
          <span>${longest.round}.${String(longest.roundPick).padStart(2, "0")}
          &middot; ${C.escapeHtml(longest.name)}</span></div>
      </div>
      <div class="chd"><span>AVERAGE ON THE CLOCK</span><span>PICKS</span></div>
      <div class="clist">${rows}</div>
    </div>`;
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
  const key = `${slot}|${picksRev}|${o}`;
  if (key === showcaseKey) return;
  showcaseKey = key;

  const face = $("scFace");
  if (m.cutout || m.avatar) {
    face.src = m.cutout || m.avatar;
    face.style.display = "";
    face.onerror = () => { face.style.display = "none"; };
  } else face.style.display = "none";

  $("scName").textContent = m.name.toUpperCase();
  $("scIntroName").textContent = m.name.toUpperCase();
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
  renderShowcaseTendencies(m, C.roundOf(o));
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
/**
 * Everything on this card is computed off `round_picks`, which is a file
 * written at build time and does not change while the draft runs — so none of
 * it needs computing twice.
 *
 * It was: for each of four positions, walk every round of every draft this
 * manager has made, and then do the same for all twelve managers to get the
 * room's average to compare him against. Forty-eight walks of the whole
 * league's draft history, every time the showcase was rebuilt, for four
 * numbers that are the same every time. Now they are worked out once each and
 * kept.
 */
const firstRoundCache = new Map();
const hisGuyCache = new Map();
const roomFirstRound = new Map();

function firstRoundFor(m, pos) {
  const key = `${m.slot}|${pos}`;
  if (firstRoundCache.has(key)) return firstRoundCache.get(key);
  const rp = m.round_picks || {};
  const byYear = {};
  for (const r of Object.keys(rp).map(Number).sort((a, b) => a - b)) {
    for (const p of rp[String(r)]) {
      if (p.pos === pos && byYear[p.y] === undefined) byYear[p.y] = r;
    }
  }
  const rounds = Object.values(byYear);
  const out = rounds.length ? {
    avg: rounds.reduce((a, b) => a + b, 0) / rounds.length,
    lo: Math.min(...rounds), hi: Math.max(...rounds), n: rounds.length,
  } : null;
  firstRoundCache.set(key, out);
  return out;
}

// K and DEF are in here only because the round cell follows the draft: by the
// fourteenth round what most of this league does is take a kicker, and this
// line is set at 2.45u — "K" on its own is not a sentence.
const POS_ONE = {
  QB: "Quarterback", RB: "Running Back", WR: "Receiver", TE: "Tight End",
  K: "Kicker", DEF: "Defense",
};
const POS_MANY = { QB: "Quarterbacks", RB: "Running Backs", WR: "Receivers", TE: "Tight Ends" };

/** The whole room's average first round at a position, for comparison. */
function leagueFirstRound(pos) {
  if (roomFirstRound.has(pos)) return roomFirstRound.get(pos);
  let sum = 0, n = 0;
  for (const x of C.DATA.managers) {
    const f = firstRoundFor(x, pos);
    if (f) { sum += f.avg * f.n; n += f.n; }
  }
  const out = n ? sum / n : null;
  roomFirstRound.set(pos, out);
  return out;
}

/**
 * The player he has taken more than any other. Actual players only.
 *
 * Ties broken on where he takes him: three men taken twice each is common,
 * and the one he spends a first rounder on is the one he is actually about.
 * Averaged over his own picks of that player, earliest wins.
 */
function hisGuy(m) {
  if (hisGuyCache.has(m.slot)) return hisGuyCache.get(m.slot);
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
  const out = best && best.n > 1 ? best : null;
  hisGuyCache.set(m.slot, out);
  return out;
}

/**
 * What he does with the round the draft is actually in.
 *
 * Counted in drafts, not in picks: a man who owned two ninth rounders one
 * year and took a receiver with both did not do it twice, he did it once. So
 * a position is credited with the years it appeared in that round, and the
 * denominator is the years he had a pick in that round at all — which is not
 * always his whole career, since picks get traded.
 */
function roundHabit(m, round) {
  const rp = m.round_picks || {};
  // Walks down rather than giving up. 2026 is the league's first fifteen-round
  // draft, so in round fifteen there is no round fifteen behind it to look at —
  // and every manager would have fallen through to the round-one count, which
  // is both wrong and identical on all twelve screens. The deepest round he has
  // ever owned is the honest answer and the heading says which round that was.
  for (let r = round; r >= 1; r--) {
    const list = rp[String(r)];
    if (!list || !list.length) continue;
    const years = new Set();
    const byPos = new Map();
    for (const p of list) {
      years.add(p.y);
      if (!byPos.has(p.pos)) byPos.set(p.pos, new Set());
      byPos.get(p.pos).add(p.y);
    }
    let best = null;
    for (const [pos, ys] of byPos) if (!best || ys.size > best.n) best = { pos, n: ys.size };
    if (best) return { ...best, of: years.size, round: r };
  }
  return null;
}

function renderShowcaseTendencies(m, round) {
  const t = m.draft_tendency || {};
  const drafts = t.drafts || 0;
  const cells = [];

  const guy = hisGuy(m);
  if (guy) {
    cells.push(`<div class="v"><span class="k">His guy</span>
      <b>${C.escapeHtml(guy.name)}</b>
      <span class="rng">${guy.n} of ${drafts} drafts</span></div>`);
  }

  // What he does with the round he is sitting in, the way the round band
  // underneath already follows the draft. It said ROUND ONE all night, which
  // is the least useful version of it after the first twelve picks: what a man
  // opens a draft with is not the question while he is on a ninth rounder.
  // Falls back to the build's own round-one count if a round has no history —
  // a manager who has never owned a pick that deep.
  const hab = roundHabit(m, round);
  const r1 = hab ? null : Object.entries(t.round1 || {}).sort((a, b) => b[1] - a[1])[0];
  // `hab.round` is the round it actually found, which is this one unless the
  // draft has gone deeper than any before it.
  const rn = hab ? hab.round : 1;
  const word = CARD_WORD[rn];
  if (hab || r1) {
    const pos = hab ? hab.pos : r1[0];
    cells.push(`<div class="v"><span class="k">Round ${word || rn}</span>
      <b class="pos-${pos}">${POS_ONE[pos] || pos}</b>
      <span class="rng">${hab ? hab.n : r1[1]} of ${hab ? hab.of : drafts} drafts</span></div>`);
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
    // `sbr`, not `sb`. There is an unrelated `.sb` in this stylesheet — the
    // year/slot/manager badge on the still-on-the-board panel — and it is a
    // bordered, rounded, filled box. These rows were sharing its class name, so
    // every one of them was picking up a border on all four sides, a radius, a
    // background and 13px of vertical padding it never asked for, none of which
    // `.sc-board .sb` overrode because it only ever set border-bottom. Fifteen
    // table rows drawing themselves as fifteen little cards.
    const cls = "sbr" + (p ? " made" : now ? " now" : " open");
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

// The same list said the other way, for a heading that names the round rather
// than counting into it: "Round nine", not "Round ninth".
const CARD_WORD = ["", "one", "two", "three", "four", "five", "six", "seven",
  "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen"];

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
    return src ? `<img src="${src}" alt="" decoding="async" onerror="this.remove()">` : "";
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
    // No scoring settings. They came off the idle screen's own format line and
    // this is the same line said twice on the same screen — and it had the
    // round count wrong besides, at 14 against C.ROUNDS' 15.
    track.innerHTML = `<span class="tk">2026 DRAFT &middot; ${C.ROUNDS} ROUNDS &middot; SNAKE</span>`;
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
  const key = `${viewIndex}|${which}|${strip.tag}|${strip.html.length}|${picksRev}`;
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
