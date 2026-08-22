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
const startNextClock = () => ({
  clockEnds: Date.now() + PICK_MS(), paused: false, pausedLeft: null,
});

/**
 * Except at the turn of a round. The last pick of a round is followed by the
 * round card and then the on-the-clock card before anyone is really up, and
 * the man leading off the next round is usually the one who just picked at
 * the other end of the snake — starting his clock under a reveal of his own
 * pick is the one case where the clock running early is wrong. Cleared rather
 * than left stale so every screen shows a full clock rather than the last
 * one's remains.
 */
const holdNextClock = () => ({ clockEnds: null, paused: false, pausedLeft: null });

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
        current: open, pending: null, ...CLOSED,
        clockEnds: Date.now() + PICK_MS(), paused: false, pausedLeft: null,
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

function render() {
  const o = STATE.current || 1;
  const m = C.managerOf(o);

  $("nowAv").innerHTML = m && m.cutout
    ? `<img src="${m.cutout}" style="height:56px;width:auto;object-fit:contain" alt=""
         onerror="this.remove()">`
    : `<div style="width:46px;height:46px;border-radius:50%;background:var(--panel-2);
        display:grid;place-items:center;color:var(--brass);font-weight:700">${
        m ? C.escapeHtml(m.name[0]) : "?"}</div>`;

  $("nowName").textContent = m ? m.name : "—";
  $("nowMeta").textContent =
    `ROUND ${C.roundOf(o)} · PICK ${C.roundPickOf(o)} · ${o} OVERALL` +
    (m ? ` · ${m.team}` : "");

  renderLength();

  [...$("modeSeg").children].forEach(b =>
    b.classList.toggle("on", b.dataset.mode === (STATE.mode || "ceremony")));
  $("modeHint").textContent = (STATE.mode === "mirror")
    ? "Picks flow straight from Sleeper onto the board. No holding, no announce. Use this once you speed up."
    : "Pick is held on THE PICK IS IN until you hit announce. Use this for the early rounds.";

  $("btnPause").textContent = STATE.paused ? "Resume" : "Pause";

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
        hint.textContent = "";
      } else {
        btn.textContent = "WAITING ON THE PICK";
        btn.className = "btn big-go";
        btn.disabled = true;
        hint.textContent = m
          ? `${m.name} picks on their phone. Or enter it yourself below.`
          : "";
      }
      break;
    case "pick_in":
      btn.textContent = "ANNOUNCE THE PICK";
      btn.className = "btn go big-go";
      hint.textContent = STATE.pending
        ? `It's ${STATE.pending.name}. Say the name, then hit this.`
        : "";
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
  if (STATE.status !== "clock" && STATE.status !== "revealed") { el.textContent = "—"; return; }
  // No clock at all means it is being held for the turn of a round: say so,
  // because a held 2:00 looks exactly like a 2:00 that started a moment ago.
  if (!STATE.clockEnds && !STATE.paused) {
    el.textContent = `${C.mmss(PICK_MS())} held`;
    el.style.color = "var(--mute)";
    return;
  }
  const left = STATE.paused
    ? (STATE.pausedLeft ?? 0)
    : (STATE.clockEnds ? STATE.clockEnds - Date.now() : PICK_MS());
  el.textContent = C.mmss(left);
  el.style.color = left <= 10000 ? "var(--qb)"
                 : left <= 30000 ? "var(--brass)" : "var(--milk)";
}

function renderLog() {
  const rows = PICKS.slice().reverse().map(p => `
    <div class="row">
      <span class="pk">${p.round}.${String(p.roundPick).padStart(2, "0")}</span>
      <span class="nm">${C.escapeHtml(p.manager || "")} &middot; ${C.escapeHtml(p.name)}
        <span class="pos-${p.pos}">${p.pos}</span>
        ${p.source === "sleeper" ? '<span style="color:var(--mute)">sleeper</span>' : ""}</span>
      <span class="un" data-undo="${p.overall}">&times;</span>
    </div>`).join("");
  $("clog").innerHTML = rows || `<div class="tiny">No picks yet.</div>`;
  $("clog").onclick = async e => {
    const u = e.target.closest("[data-undo]");
    if (!u) return;
    const overall = Number(u.dataset.undo);
    await C.undoPick(overall);
    // Rewind the board to that pick and put them back on the clock.
    await C.setState({
      status: "clock", current: overall, pending: null, ...CLOSED,
      clockEnds: Date.now() + PICK_MS(), paused: false, pausedLeft: null,
    });
  };
}

// ── the one big button ────────────────────────────────────────────────────

$("mainBtn").onclick = async () => {
  const o = STATE.current || 1;
  disarm();   // an explicit tap always wins over a running countdown

  if (STATE.status === "idle") {
    await C.setState({
      status: "clock", current: 1, pending: null, ...CLOSED,
      clockEnds: Date.now() + PICK_MS(), paused: false, pausedLeft: null,
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

$("btnPause").onclick = async () => {
  if (STATE.status !== "clock") return;
  if (STATE.paused) {
    await C.setState({
      paused: false,
      clockEnds: Date.now() + (STATE.pausedLeft ?? PICK_MS()),
      pausedLeft: null,
    });
  } else {
    await C.setState({
      paused: true,
      pausedLeft: Math.max(0, (STATE.clockEnds || Date.now()) - Date.now()),
    });
  }
};

$("btnPlus").onclick = async () => {
  if (STATE.status !== "clock") return;
  if (STATE.paused) await C.setState({ pausedLeft: (STATE.pausedLeft ?? 0) + 30000 });
  else await C.setState({ clockEnds: (STATE.clockEnds || Date.now()) + 30000 });
};

$("btnReset").onclick = async () => {
  if (STATE.status !== "clock") return;
  await C.setState({ clockEnds: Date.now() + PICK_MS(), paused: false, pausedLeft: null });
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
    ...(STATE.status === "clock"
      ? { clockEnds: Date.now() + ms, paused: false, pausedLeft: null }
      : {}),
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
        clockEnds: Date.now() + PICK_MS(), paused: false, pausedLeft: null,
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
