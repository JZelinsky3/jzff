// ── control.js — the commissioner's console ───────────────────────────────
// Joey drives the night from here: hold the pick, announce it, advance.

import * as C from "./core.js";

const $ = id => document.getElementById(id);

let STATE = { ...C.DEFAULT_STATE };
let PICKS = [];
let wipeArmed = false;
let armedAt = null;        // delayed-announce countdown, ms timestamp
let armedTimer = null;

const PICK_MS = () => STATE.pickMs || (C.DATA.meta.pick_seconds || 120) * 1000;

/**
 * Going to `revealed` also starts the next manager's clock.
 *
 * The board says the next man is on the clock the moment a pick lands — the
 * wall lights his slot and the ticker names him — so the clock may as well be
 * true from that moment too. It used to start on Next Pick, which meant
 * leaving a reveal up to talk about it quietly ate into nobody's time and then
 * the next man got a fresh two minutes; the practical effect was that lingering
 * on a good pick felt like it was costing the draft time when it wasn't.
 * Advancing carries this clock forward rather than restarting it — see the
 * Next Pick branch of the main button — so what starts here just keeps running.
 */
const startNextClock = () => C.freshClock(PICK_MS());

/**
 * Whether there is a clock to act on, for Pause / +30s / Reset.
 *
 * It asks the clock, not the status. That is the whole fix: these three were
 * gated on `status === "clock"`, and the next man's clock starts at the
 * *reveal*, so from the moment a pick landed until Next Pick was pressed there
 * was a countdown running in the corner of the board that all three buttons
 * silently refused to touch. Adding "or revealed" to the list was the obvious
 * repair and it is still a list — the states this console can be in are not
 * the thing being asked about. A clock exists exactly when `clockEnds` is set
 * or the thing is already stopped, in any status, and that is the question.
 *
 * It also answers the turn of a round correctly for free: there is
 * deliberately no clock between the last pick of a round and the advance (see
 * holdNextClock), `clockEnds` is null there, and pausing a clock that has not
 * started would have written a paused 0:00 onto all three screens.
 */
const clockLive = () => !!STATE.clockEnds || !!STATE.paused;

/** In words, for the line under the buttons. Never leave the console guessing
    why a tap did nothing — on the night there is no time to work it out. */
function clockState() {
  if (STATE.paused) return "Paused. Resume puts it back where it stopped.";
  if (STATE.clockEnds) return STATE.status === "revealed"
    ? "Running — this is the next man's clock, started at the reveal."
    : "Running.";
  if (STATE.status === "idle") return "No clock until the draft starts.";
  return "Held for the turn of the round. It starts when you hit Next Pick.";
}

/**
 * Except at the turn of a round. The last pick of a round is followed by the
 * round card and then the on-the-clock card before anyone is really up, and
 * the man leading off the next round is usually the one who just picked at
 * the other end of the snake — starting his clock under a reveal of his own
 * pick is the one case where the clock running early is wrong. Cleared rather
 * than left stale so every screen shows a full clock rather than the last
 * one's remains.
 */
const holdNextClock = () => C.heldClock();

/**
 * Anything that moves the draft on takes the showcase down with it.
 *
 * It is a clock-time screen: it goes up while a man is thinking and comes off
 * the moment his pick is in, so nothing that changes `status` should ever have
 * to remember to close it. Spread into every such patch rather than left to
 * the board to ignore, so the console's own button never reads "Close the
 * showcase" over a television that has already moved on. The phone clears it
 * the same way from `submitPick` in core.js.
 */
const CLOSED = { showcase: null };
const roundTurnsAfter = o => C.roundOf(o + 1) > C.roundOf(o);
const clockForReveal = o => (roundTurnsAfter(o) ? holdNextClock() : startNextClock());

await C.loadData();
await C.refreshLateJoiners();

C.watchState(s => { STATE = s; render(); director(); });
C.watchPicks(p => { PICKS = p; renderLog(); render(); director(); });
C.startSleeperSync(() => PICKS);
setInterval(renderClock, 250);
setInterval(director, 1500);

// ── the director ──────────────────────────────────────────────────────────
// Keeps the board moving on its own. Two jobs:
//   1. In LIVE FEED, play a short reveal for each pick Sleeper hands us and
//      then move to the next open pick, with nobody touching a button.
//   2. In either mode, if the pick on the clock has already been made in
//      Sleeper, don't sit there waiting for a phone that is never coming.
// This console is the only writer, so there is no race with the board.

let directing = false;

async function director() {
  if (directing || !PICKS.length) return;
  const have = new Set(PICKS.map(p => p.overall));
  const o = STATE.current || 1;

  // Where should the clock actually be? First pick nobody has made.
  let open = 1;
  while (have.has(open) && open <= C.TOTAL) open++;

  if (!have.has(o)) {
    // Current pick is still genuinely open. Only correct a stale position.
    if (STATE.status === "clock" && open < o) {
      directing = true;
      await C.setState({
        current: open, pending: null, ...CLOSED, ...startNextClock(),
      });
      directing = false;
    }
    return;
  }

  // The pick on the clock has been made.
  const made = PICKS.find(p => p.overall === o);

  if (STATE.mode === "mirror") {
    if (STATE.status !== "revealed") {
      directing = true;
      await C.setState({ status: "revealed", pending: pendingFrom(made), ...CLOSED,
                        ...clockForReveal(o) });
      directing = false;
      setTimeout(advanceToOpen, 5000);
    }
    return;
  }

  // Ceremony mode: someone drafted straight in Sleeper. Show it, then wait
  // for Joey to hit next like normal.
  if (STATE.status === "clock") {
    directing = true;
    await C.setState({ status: "revealed", pending: pendingFrom(made), ...CLOSED,
                      ...clockForReveal(o) });
    directing = false;
  }
}

function pendingFrom(p) {
  return {
    id: p.playerId, name: p.name, pos: p.pos, team: p.nflTeam,
    board: p.board, posrank: p.posrank, rookie: !!p.rookie, n: p.n,
  };
}

async function advanceToOpen() {
  if (STATE.mode !== "mirror") return;
  const have = new Set(PICKS.map(p => p.overall));
  let open = (STATE.current || 1) + 1;
  while (have.has(open) && open <= C.TOTAL) open++;
  if (open > C.TOTAL) return;
  directing = true;
  await C.setState({
    status: "clock", current: open, pending: null, ...CLOSED,
    ...(STATE.clockEnds ? { clockEnds: STATE.clockEnds } : startNextClock()),
  });
  directing = false;
}

// ── render ────────────────────────────────────────────────────────────────

/**
 * `C. Lamb` rather than `CeeDee Lamb`, for the two-column roster in the strip.
 *
 * Full names in that column truncate on a 1280 laptop and truncation is worse
 * than an initial: `CeeDee L...` and `Tetairoa ...` identify nobody, where a
 * surname always does. Defences are left whole — "Arizona Cardinals" shortened
 * to "A. Cardinals" is not a thing anybody says.
 */
function shortName(name, pos) {
  if (pos === "DEF") return name;
  const parts = String(name || "").split(" ");
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

function render() {
  const o = STATE.current || 1;
  const m = C.managerOf(o);

  // Sized in console.css, not here. It carried an inline height, which beats a
  // stylesheet rule outright — so the console's own portrait was the one thing
  // on the page that never got bigger when the rest of it did.
  $("nowAv").innerHTML = m && m.cutout
    ? `<img src="${m.cutout}" alt="" onerror="this.remove()">`
    : `<div class="now-av-fb">${m ? C.escapeHtml(m.name[0]) : "?"}</div>`;

  $("nowName").textContent = m ? m.name : "—";
  $("nowTeam").textContent = m ? m.team.trim() : "";

  // Where the pick sits, as three numbers rather than one run-on line. The
  // overall is the one that gets said out loud, so it is the one set biggest.
  $("nowStats").innerHTML = `
    <span class="ns"><b>${C.roundOf(o)}</b><i>ROUND</i></span>
    <span class="ns"><b>${C.roundPickOf(o)}</b><i>PICK</i></span>
    <span class="ns wide"><b>${C.ordinal(o)}</b><i>OVERALL</i></span>`;

  // What he already has. The laptop has the room for it and it is what makes
  // the next two minutes predictable — four backs and no quarterback tells you
  // what is coming better than anything else on this screen.
  const mine = m ? PICKS.filter(p => p.slot === m.slot) : [];
  $("nowCt").textContent = mine.length ? `${mine.length} PICK${mine.length > 1 ? "S" : ""}` : "";
  $("nowList").innerHTML = mine.length
    ? mine.map(p => `<span class="nl">
        <u>${p.round}.${String(p.roundPick).padStart(2, "0")}</u>
        <b>${C.escapeHtml(shortName(p.name, p.pos))}</b>
        <i class="pos-${p.pos}">${p.pos}</i></span>`).join("")
    : `<span class="nl-none">Nothing yet.</span>`;

  renderPickCard(o, m);

  renderLength();

  [...$("modeSeg").children].forEach(b =>
    b.classList.toggle("on", b.dataset.mode === (STATE.mode || "ceremony")));
  $("modeHint").textContent = (STATE.mode === "mirror")
    ? "Picks flow straight from Sleeper onto the board. No holding, no announce. Use this once you speed up."
    : "Pick is held on THE PICK IS IN until you hit announce. Use this for the early rounds.";

  // Lit or dead according to whether there is actually a clock to act on, with
  // the reason spelled out underneath — a dead button on its own is
  // indistinguishable from a broken one.
  $("btnPause").textContent = STATE.paused ? "Resume" : "Pause";
  const live = clockLive();
  for (const id of ["btnPause", "btnPlus", "btnReset"]) $(id).disabled = !live;
  $("clockWhat").textContent = clockState();

  const btn = $("mainBtn"), hint = $("mainHint");
  btn.classList.remove("danger");
  btn.disabled = false;

  switch (STATE.status) {
    case "idle":
      btn.textContent = "START THE DRAFT";
      btn.className = "btn go big-go";
      hint.textContent = "Puts Ricci on the clock at pick 1.";
      break;
    case "clock":
      if (STATE.pending) {
        btn.textContent = "ANNOUNCE THE PICK";
        btn.className = "btn go big-go";
        hint.textContent = "Say the name, then hit this.";
      } else {
        btn.textContent = "WAITING ON THE PICK";
        btn.className = "btn big-go";
        btn.disabled = true;
        // Who it is waiting on is on the card in the middle of the strip.
        hint.textContent = "";
      }
      break;
    case "pick_in":
      btn.textContent = "ANNOUNCE THE PICK";
      btn.className = "btn go big-go";
      // The name itself is on the card beside this now, at three times the
      // size, so the hint is about the button rather than about the pick.
      hint.textContent = "Say the name, then hit this.";
      break;
    case "revealed": {
      const done = o >= C.TOTAL;
      btn.textContent = done ? "DRAFT COMPLETE" : "NEXT PICK";
      btn.className = "btn go big-go";
      btn.disabled = done;
      const nxt = C.managerOf(o + 1);
      hint.textContent = done ? "" : `Puts ${nxt ? nxt.name : "—"} on the clock.`;
      break;
    }
  }

  // The delayed announce only matters while a pick is being held. It must
  // stay visible while armed so the countdown can be cancelled.
  const holding = !!STATE.pending &&
    (STATE.status === "pick_in" || STATE.status === "clock");
  $("delayBtn").hidden = !holding;

  renderShowcase(m);
  renderRail();
  renderBand();
}

/**
 * What is being announced, on the console, with his photograph on it.
 *
 * This used to be a sentence of grey body copy under the button — "It's Jahmyr
 * Gibbs. Say the name, then hit this." — which is the one thing on this page
 * that gets read out loud to a room, set smaller than the buttons around it.
 * Now the cell either says who it is waiting on or turns into the card, and
 * which one is decided by a class rather than by two elements each guessing.
 *
 * The tags are the facts worth having in your mouth before you say the name:
 * where he was on the board against where he is going, and whether he is a
 * rookie. Nothing that needs working out while a room is watching.
 */
function renderPickCard(o, m) {
  const cell = $("cmdPick");
  const p = STATE.pending;
  cell.classList.toggle("holding", !!p);

  if (!p) {
    $("pcWaitName").textContent = m ? `Waiting on ${m.name}` : "—";
    $("pcWaitSub").textContent = STATE.status === "idle"
      ? "The draft has not started."
      : STATE.status === "revealed"
        ? "The pick is on the board. Next Pick moves the clock on."
        : "He picks on his phone, or you enter it below.";
    return;
  }

  const full = C.DATA.byId.get(p.id) || p;
  $("pcShot").src = C.headshot(full);
  $("pcOwner").textContent = m
    ? `${m.name} selects · ${C.ordinal(o)} overall`
    : `${C.ordinal(o)} overall`;
  $("pcName").textContent = p.name;
  $("pcMeta").innerHTML =
    `<b>${C.escapeHtml(p.pos)}${p.posrank || ""}</b> · ${C.escapeHtml(p.team || "FA")}` +
    (p.board ? ` · board ${p.board}` : "");

  const tags = [];
  const v = C.verdict(o, p.board);
  if (v && v.level !== 0) {
    tags.push(`<span class="${v.level > 0 ? "hot" : "cold"}">${v.tag} ${
      v.gap > 0 ? `+${v.gap}` : v.gap}</span>`);
  }
  if (p.rookie) tags.push(`<span class="hot">ROOKIE</span>`);
  // Already on the board somewhere else. doAnnounce refuses this pick when it
  // happens, so say so here rather than letting the refusal be the first
  // anybody hears about it.
  const dup = PICKS.find(x => x.playerId === p.id && x.overall !== o);
  if (dup) tags.push(`<span class="cold">ALREADY GONE ${dup.round}.${
    String(dup.roundPick).padStart(2, "0")}</span>`);
  $("pcTags").innerHTML = tags.join("");
}

/**
 * The rail list. Each option carries its own description, so there is no
 * shared hint line under it saying what the thing you just pressed was.
 *
 * These do not disable themselves the way the showcase button does — the
 * panels are about the room and the pool rather than about one man, so there
 * is no moment in the night when swapping one in is wrong.
 */
function renderRail() {
  const mode = STATE.rail || "wall";
  for (const b of $("railSeg").children) b.classList.toggle("on", b.dataset.rail === mode);
}

/**
 * How the two cards in the bottom band are dressed.
 *
 * Both of these ship built and the choice is made on the night, because it is
 * not a question a stylesheet can answer: a card that is right on a laptop at a
 * desk can be wrong on a television across a room, and eight o'clock is not the
 * time to be editing CSS. Pressing one writes state and every screen follows,
 * so nothing has to be undone later.
 *
 * The default is stored as null rather than as the string, exactly as `rail`
 * is, so a state document written before any of this existed still means the
 * look each card shipped with.
 */
function renderBand() {
  const ba = STATE.baSkin === "steel" ? "steel" : "plate";
  const lu = STATE.luSkin === "paper" ? "paper" : "dark";
  for (const b of $("baSeg").children) b.classList.toggle("on", b.dataset.ba === ba);
  for (const b of $("luSeg").children) b.classList.toggle("on", b.dataset.lu === lu);
}

/**
 * The showcase button, which is the same button both ways round.
 *
 * Lit gold while it is on the television, the way the segmented controls
 * above it are, so a glance at the console says whether the board is showing
 * the draft or showing a man. It is only offered while a clock is running:
 * during a reveal the board has a pick to get through, and a showcase over
 * that would be covering the thing everyone is looking at.
 */
function renderShowcase(m) {
  const b = $("btnShowcase");
  const up = STATE.showcase != null;
  const live = STATE.status === "clock" && !STATE.pending;

  b.textContent = up ? "Close the showcase"
    : m ? `Show ${m.name}'s showcase` : "Show the showcase";
  b.className = "btn wide" + (up ? " go" : "");
  b.disabled = !up && !live;

  $("showcaseHint").textContent = up
    ? "On the television now. His clock, the last pick and who is up next run along the bottom of it. Close it whenever."
    : live
      ? "Takes the board over with his seasons, his career and every pick he owns tonight. Comes down on its own the moment the pick is in."
      : "Goes up while a manager is on the clock.";
}

function renderLength() {
  const ms = PICK_MS();
  for (const b of $("lenSeg").children) b.classList.toggle("on", Number(b.dataset.ms) === ms);
  $("btnReset").textContent = `Reset ${C.mmss(ms)}`;
  $("lenHint").textContent = `${C.mmss(ms)} a pick${
    STATE.pickMs ? "" : " (league default)"}. Applies to every pick from here.`;
}

function renderClock() {
  const el = $("nowClock");
  // Through the reveal as well, because it is running through the reveal.
  // While a pick is being held there is deliberately no clock on the board
  // either, so this empties rather than sitting there as a stray dash under
  // the card that has taken over the strip.
  if (STATE.status === "pick_in") { el.textContent = ""; return; }
  if (STATE.status !== "clock" && STATE.status !== "revealed") { el.textContent = "—"; return; }
  // No clock at all means it is being held for the turn of a round: say so,
  // because a held 2:00 looks exactly like a 2:00 that started a moment ago.
  // The word rides at a fraction of the digits' size, because the digits are
  // the reading and the word is the caveat. Set at the same size it was as
  // wide as the number itself, and on a narrow console that pushed the
  // manager's name into an ellipsis to make room for "paused".
  if (!STATE.clockEnds && !STATE.paused) {
    el.innerHTML = `${C.mmss(PICK_MS())}<i>held</i>`;
    el.style.color = "var(--mute)";
    return;
  }
  const left = STATE.paused
    ? (STATE.pausedLeft ?? 0)
    : (STATE.clockEnds ? STATE.clockEnds - Date.now() : PICK_MS());
  // Says so when it is stopped. A frozen number and a running one are the same
  // picture for the first second you look at them, which is exactly long enough
  // to conclude the button did nothing and tap it again.
  el.innerHTML = C.mmss(left) + (STATE.paused ? "<i>paused</i>" : "");
  el.style.color = STATE.paused ? "var(--brass)"
                 : left <= 10000 ? "var(--qb)"
                 : left <= 30000 ? "var(--brass)" : "var(--milk)";
}

/**
 * The log, a round at a time.
 *
 * A hundred and eighty rows in one scroller is a list you cannot find anything
 * in, and undoing the wrong pick because you miscounted rows is not a mistake
 * this console should make available. `logRound` is null for the round the
 * draft is actually in — it follows along on its own, which is the round
 * anything is likely to need undoing from — or a pinned round, or "all".
 */
let logRound = null;

function renderLog() {
  const live = C.roundOf(C.nextOpenPick(PICKS));
  const rounds = [...new Set(PICKS.map(p => p.round))].sort((a, b) => a - b);
  const showing = logRound === "all" ? null : (logRound ?? live);

  $("logSeg").innerHTML =
    `<button data-r="live" class="${logRound === null ? "on" : ""}">THIS ROUND</button>` +
    rounds.map(r => `<button data-r="${r}" class="${logRound === r ? "on" : ""}">${r}</button>`).join("") +
    `<button data-r="all" class="${logRound === "all" ? "on" : ""}">ALL</button>`;

  const shown = showing == null ? PICKS : PICKS.filter(p => p.round === showing);
  const rows = shown.slice().reverse().map(p => `
    <div class="row">
      <span class="pk">${p.round}.${String(p.roundPick).padStart(2, "0")}</span>
      <span class="nm">${C.escapeHtml(p.manager || "")} &middot; ${C.escapeHtml(p.name)}
        <span class="pos-${p.pos}">${p.pos}</span>
        ${p.source === "sleeper" ? '<span style="color:var(--mute)">sleeper</span>' : ""}</span>
      <span class="un" data-undo="${p.overall}">&times;</span>
    </div>`).join("");

  $("clog").innerHTML = rows || `<div class="tiny">${
    PICKS.length ? `Nothing in round ${showing}.` : "No picks yet."}</div>`;
  $("clog").onclick = async e => {
    const u = e.target.closest("[data-undo]");
    if (!u) return;
    const overall = Number(u.dataset.undo);
    await C.undoPick(overall);
    // Rewind the board to that pick and put them back on the clock.
    await C.setState({
      status: "clock", current: overall, pending: null, ...CLOSED,
      ...startNextClock(),
    });
  };
}

// ── the one big button ────────────────────────────────────────────────────

$("mainBtn").onclick = async () => {
  const o = STATE.current || 1;
  disarm();   // an explicit tap always wins over a running countdown

  if (STATE.status === "idle") {
    await C.setState({
      status: "clock", current: 1, pending: null, ...CLOSED, ...startNextClock(),
    });
    return;
  }

  if ((STATE.status === "pick_in" || STATE.status === "clock") && STATE.pending) {
    await doAnnounce();
    return;
  }

  if (STATE.status === "revealed") {
    const next = o + 1;
    if (next > C.TOTAL) return;
    await C.setState({
      status: "clock", current: next, pending: null, ...CLOSED,
      // Carried, not restarted: it has been running since the reveal. Paused
      // and pausedLeft are left alone for the same reason — if it was stopped
      // on the reveal it stays stopped, and Reset clock is right there. At the
      // turn of a round there is nothing to carry — see holdNextClock — so the
      // new round's leadoff man gets a whole one, starting now.
      ...(STATE.clockEnds ? { clockEnds: STATE.clockEnds } : startNextClock()),
    });
  }
};

// ── delayed announce ──────────────────────────────────────────────────────
// Joey announces standing in front of the TV. Tapping this gives him five
// seconds to get there and start the sentence; the board pops on the name.

async function doAnnounce() {
  const o = STATE.current || 1;
  if (!STATE.pending) return;

  // Refuse to put a player on the board twice. This can only happen if the
  // pick also went through Sleeper while it was being held.
  const dup = PICKS.find(p => p.playerId === STATE.pending.id && p.overall !== o);
  if (dup) {
    $("mainHint").textContent =
      `${STATE.pending.name} already went at ${dup.round}.${
        String(dup.roundPick).padStart(2, "0")} to ${dup.manager}. Pick again.`;
    await C.setState({ status: "clock", pending: null, ...CLOSED });
    return;
  }

  const player = C.DATA.byId.get(STATE.pending.id) || STATE.pending;
  await C.commitPick(o, player, "app");
  await C.setState({ status: "revealed", ...CLOSED, ...clockForReveal(o) });
}

const DELAY_LABEL = "Announce in 5s. Walk up first.";

function disarm() {
  clearInterval(armedTimer);
  armedTimer = null;
  armedAt = null;
  const b = $("delayBtn");
  b.classList.remove("danger");
  b.textContent = DELAY_LABEL;
}

// One handler, both jobs: arm the countdown, or cancel it if already running.
$("delayBtn").onclick = () => {
  if (armedAt !== null) { disarm(); render(); return; }

  const b = $("delayBtn");
  armedAt = Date.now() + 5000;
  b.classList.add("danger");
  b.textContent = "Revealing in 5… tap to cancel";

  armedTimer = setInterval(() => {
    const left = Math.ceil((armedAt - Date.now()) / 1000);
    if (left > 0) { b.textContent = `Revealing in ${left}… tap to cancel`; return; }
    disarm();
    doAnnounce();
  }, 200);
};

// ── keep the screen awake ─────────────────────────────────────────────────

let wakeLock = null;
async function keepAwake() {
  try {
    if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
  } catch (_) { /* not supported or denied; harmless */ }
}
document.addEventListener("click", keepAwake, { once: true });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !wakeLock) keepAwake();
});

// ── clock controls ────────────────────────────────────────────────────────

// Resuming banks however long the stoppage lasted, so the clock room can take
// it back off his time. A pause is the room's, not the picker's.
$("btnPause").onclick = async () => {
  if (!clockLive()) return;
  if (STATE.paused) {
    await C.setState({
      paused: false,
      clockEnds: Date.now() + (STATE.pausedLeft ?? PICK_MS()),
      pausedLeft: null,
      clockPausedMs: (STATE.clockPausedMs || 0) +
        (STATE.pausedAt ? Math.max(0, Date.now() - STATE.pausedAt) : 0),
      pausedAt: null,
    });
  } else {
    await C.setState({
      paused: true,
      pausedLeft: Math.max(0, (STATE.clockEnds || Date.now()) - Date.now()),
      pausedAt: Date.now(),
    });
  }
};

$("btnPlus").onclick = async () => {
  if (!clockLive()) return;
  if (STATE.paused) await C.setState({ pausedLeft: (STATE.pausedLeft ?? 0) + 30000 });
  else await C.setState({ clockEnds: (STATE.clockEnds || Date.now()) + 30000 });
};

// A reset is a clock starting over, timing included: whatever he had already
// burned is gone with the countdown it belonged to.
$("btnReset").onclick = async () => {
  if (!clockLive()) return;
  await C.setState(startNextClock());
};

/**
 * Pick length, for this pick and the rest of the draft.
 *
 * It goes into state rather than staying local, because three screens read it:
 * the board's clock, the phone's, and the console's own. Pressing one of these
 * also restarts whatever clock is running, since changing the length and then
 * watching the old one run out would be the wrong answer every time.
 */
$("lenSeg").onclick = async e => {
  const b = e.target.closest("[data-ms]");
  if (!b) return;
  const ms = Number(b.dataset.ms);
  await C.setState({
    pickMs: ms,
    ...(clockLive() ? C.freshClock(ms) : {}),
  });
};

// ── the showcase ──────────────────────────────────────────────────────────
// One button, both jobs. It carries the slot rather than a flag so the board
// is never left working out who it is meant to be showing.

$("btnShowcase").onclick = async () => {
  if (STATE.showcase != null) { await C.setState(CLOSED); return; }
  if (STATE.status !== "clock") return;
  await C.setState({ showcase: C.slotOf(STATE.current || 1) });
};

$("logSeg").onclick = e => {
  const b = e.target.closest("[data-r]");
  if (!b) return;
  const r = b.dataset.r;
  logRound = r === "live" ? null : r === "all" ? "all" : Number(r);
  renderLog();
};

// ── the right rail ────────────────────────────────────────────────────────
// Stored as null for the wall rather than the string, so a state document
// written before any of this existed still means the board.

$("railSeg").onclick = async e => {
  const b = e.target.closest("[data-rail]");
  if (!b) return;
  await C.setState({ rail: b.dataset.rail === "wall" ? null : b.dataset.rail });
};

// ── the bottom band ───────────────────────────────────────────────────────
// Same convention as the rail: the default is written as null, never as the
// word for it, so an old state document and a fresh one agree.

$("baSeg").onclick = async e => {
  const b = e.target.closest("[data-ba]");
  if (b) await C.setState({ baSkin: b.dataset.ba === "steel" ? "steel" : null });
};

$("luSeg").onclick = async e => {
  const b = e.target.closest("[data-lu]");
  if (b) await C.setState({ luSkin: b.dataset.lu === "paper" ? "paper" : null });
};

// ── mode ──────────────────────────────────────────────────────────────────

$("modeSeg").onclick = async e => {
  const b = e.target.closest("[data-mode]");
  if (b) await C.setState({ mode: b.dataset.mode });
};

// ── manual entry ──────────────────────────────────────────────────────────

$("cq").oninput = () => renderSearch();

function renderSearch() {
  const q = $("cq").value.trim().toLowerCase();
  if (!q) { $("cresults").innerHTML = ""; return; }
  const gone = new Set(PICKS.map(p => p.playerId));
  const list = C.DATA.players
    .filter(p => !gone.has(p.id) && (p.n.includes(q) || p.name.toLowerCase().includes(q)))
    .slice(0, 8);

  $("cresults").innerHTML = list.map(p => `
    <div class="prow" data-id="${p.id}" style="border-left-color:var(--${p.pos.toLowerCase()})">
      <img src="${C.headshot(p)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <div style="min-width:0">
        <div class="nm">${C.escapeHtml(p.name)}</div>
        <div class="sub"><span class="pos-${p.pos}">${p.pos}${p.posrank}</span>
          <span>${C.escapeHtml(p.team)}</span></div>
      </div>
      <span class="rk">${p.board}</span>
    </div>`).join("") || `<div class="tiny">Nobody available by that name.</div>`;

  $("cresults").onclick = async e => {
    const row = e.target.closest(".prow");
    if (!row) return;
    const player = C.DATA.byId.get(row.dataset.id);
    if (!player) return;
    $("cq").value = ""; $("cresults").innerHTML = "";

    if (STATE.mode === "mirror") {
      // No ceremony: straight onto the board and move on.
      await C.commitPick(STATE.current, player, "app");
      const next = STATE.current + 1;
      await C.setState({
        status: next > C.TOTAL ? "revealed" : "clock",
        current: Math.min(next, C.TOTAL), pending: null, ...CLOSED,
        ...startNextClock(),
      });
    } else {
      // Hold it, same as if the phone had sent it.
      await C.submitPick(STATE.current, player);
    }
  };
}

// ── wipe ──────────────────────────────────────────────────────────────────

$("btnWipe").onclick = async () => {
  const b = $("btnWipe");
  if (!wipeArmed) {
    wipeArmed = true;
    b.textContent = "Tap again to wipe everything";
    setTimeout(() => {
      if (!wipeArmed) return;
      wipeArmed = false;
      b.textContent = "Wipe the whole draft";
    }, 4000);
    return;
  }
  wipeArmed = false;
  b.textContent = "Wiping…";
  await C.resetDraft();
  b.textContent = "Wipe the whole draft";
};
