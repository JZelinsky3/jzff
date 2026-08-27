// ── core.js — shared brain for the PAMS 2026 draft day board ──────────────
// Loaded by board.js, pick.js and control.js. Owns the data files, the snake
// order, the Firestore state machine and the Sleeper reconciliation loop.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const app = initializeApp({
  apiKey:            "AIzaSyAUk7lfFezJ-pL_-MaDSIoL5RzogPnJw4c",
  authDomain:        "ffootball-1ffa4.firebaseapp.com",
  projectId:         "ffootball-1ffa4",
  storageBucket:     "ffootball-1ffa4.appspot.com",
  messagingSenderId: "214820317243",
  appId:             "1:214820317243:web:00907255d3ee230f21541e",
}, "pamsdraft");

const db = getFirestore(app);

// Bump this to wipe the slate and start a fresh draft (e.g. "2026-mock").
export const ROOM = new URLSearchParams(location.search).get("room") || "2026";
const ROOT   = doc(db, "pams_draft", ROOM);
const PICKS  = collection(db, "pams_draft", ROOM, "picks");
const STATE  = doc(db, "pams_draft", ROOM, "meta", "state");

export const TEAMS  = 12;
// Fifteen from 2026: the league went to six bench spots (Sleeper had five,
// and was corrected there too). Everything downstream reads this — the
// showcase's board of his own picks, nextPickForSlot, the console's advance,
// and the three-columns-of-five grid the board is drawn in, which happens to
// hold exactly fifteen.
export const ROUNDS = 15;
export const TOTAL  = TEAMS * ROUNDS;

export const SLEEPER_LEAGUE = "1304235036874149888";
export const SLEEPER_DRAFT  = "1304235037553590272";

// ── static data ───────────────────────────────────────────────────────────

export const DATA = {
  players: [], history: {}, managers: [], meta: {}, schedule: null,
  byId: new Map(), bySlot: new Map(), byNorm: new Map(),
};

export async function loadData() {
  const [players, history, managers, meta, schedule] = await Promise.all(
    ["players", "history", "managers", "meta", "schedule"].map(f =>
      fetch(`data/${f}.json`, { cache: "no-cache" })
        // The schedule is the one file the board can live without, so a
        // missing or malformed one degrades to "no schedule facts" rather
        // than taking the whole page down on draft night.
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null))
  );
  DATA.players = players;
  DATA.history = history;
  DATA.managers = managers;
  DATA.meta = meta;
  DATA.schedule = schedule;
  players.forEach(p => DATA.byId.set(p.id, p));
  players.forEach(p => {
    if (!DATA.byNorm.has(p.n)) DATA.byNorm.set(p.n, p);
  });
  managers.forEach(m => DATA.bySlot.set(m.slot, m));
  return DATA;
}

// ── snake order ───────────────────────────────────────────────────────────

export function roundOf(overall)     { return Math.floor((overall - 1) / TEAMS) + 1; }
export function roundPickOf(overall) { return ((overall - 1) % TEAMS) + 1; }

/** Draft slot (1-12) that owns a given overall pick, snaking each round. */
export function slotOf(overall) {
  const r = roundOf(overall), i = (overall - 1) % TEAMS;
  return r % 2 === 1 ? i + 1 : TEAMS - i;
}

export function managerOf(overall) { return DATA.bySlot.get(slotOf(overall)); }

/**
 * The first pick nobody has made yet — where the action actually is, whether
 * or not the console has formally walked the clock there. `STATE.current`
 * sticks on the pick that just landed for the whole reveal ceremony (it only
 * moves when the commissioner hits Next Pick), so anything that stays on
 * screen through that ceremony — the round wall, the ticker — should point
 * here instead, or it sits showing nobody on the clock and the next slot
 * dangling as a vague "on deck" for as long as the reveal runs.
 */
export function nextOpenPick(picks) {
  const have = new Set(picks.map(p => p.overall));
  let o = 1;
  while (have.has(o) && o <= TOTAL) o++;
  return o;
}

/** Every remaining pick belonging to a slot, for "your next pick is #34". */
export function nextPickForSlot(slot, after) {
  for (let o = after; o <= TOTAL; o++) if (slotOf(o) === slot) return o;
  return null;
}

// ── live state ────────────────────────────────────────────────────────────
//
// status:
//   idle     nothing started yet
//   clock    a manager is on the clock, timer running
//   pick_in  the pick has been submitted but NOT shown (the held beat)
//   revealed the player is on screen; board is updating
//
// mode:
//   ceremony  full pick-is-in / announce / reveal sequence (rounds 1-4)
//   mirror    picks flow straight from Sleeper with a short reveal

/**
 * How long a LIVE FEED pick takes to play, beat by beat.
 *
 * It lives here because two files have to agree on it and they cannot see each
 * other: the board draws the beats and the console decides when the draft has
 * moved on. When they disagreed, the console won — it used to advance five
 * seconds after a pick landed while the selection graphic was still on screen
 * for another second, so the next man's card cut in over the top of the pick
 * and you never actually saw who had been taken. That is the whole bug.
 *
 * The order is deliberate. The big graphic says who it is, the next man's card
 * comes over the top of it, and then the board comes back to the pick's own
 * screen with his clock already running underneath. The room gets the news,
 * then gets told who is up, then gets ten seconds to argue about it, and
 * nobody has touched the console.
 */
export const LIVE_FEED = {
  selection: 6000,   // the full-screen pick graphic
  oncard:    5200,   // the next man's card, over the top of it
  roundcard: 4600,   // and the new round's card ahead of it, at a round turn
  details:   9000,   // the pick's own screen, his clock counting down on it
};
export const LIVE_FEED_TOTAL =
  LIVE_FEED.selection + LIVE_FEED.oncard + LIVE_FEED.details;

/**
 * The same, for the last pick of a round, which has a round card to play
 * before the next man's. Without the extra the round card eats half the beat
 * the pick was supposed to get, at exactly the moment of the night with the
 * most to look at.
 */
export const liveFeedTotal = roundTurns =>
  LIVE_FEED_TOTAL + (roundTurns ? LIVE_FEED.roundcard : 0);

export const DEFAULT_STATE = {
  status: "idle",
  current: 1,
  pending: null,
  clockEnds: null,
  // How long a pick gets, in ms. Null means the league default in meta.json
  // (120s). The console can change it mid-draft — the rounds are not all worth
  // the same amount of time — and it lives in state so every screen agrees.
  pickMs: null,
  paused: false,
  pausedLeft: null,
  // The manager showcase: the draft slot (1-12) whose full profile is up on
  // the television, or null for nothing. Only the console writes it, and only
  // while someone is on the clock — the board takes it down for the ceremony
  // whatever this says, because THE PICK IS IN owns the screen when it comes.
  showcase: null,
  // What the right-hand rail is showing. Null is the round wall, which is what
  // it has always been and what it goes back to. The others are the alternate
  // panels in board.js — see renderRail(). Unlike the showcase this is NOT
  // cleared when a pick lands: these are panels about the room and the pool
  // rather than about the man on the clock, so they stay up until the console
  // swaps them back. Anything that is only true while one man is thinking has
  // no business being in here.
  rail: null,
  // ── how the two cards in the bottom band are dressed ─────────────────────
  // Both null by default, and null means the look each card shipped with, so a
  // state document written before any of this existed still reads correctly.
  // They are in state rather than in the stylesheet because the point of them
  // is that the commissioner picks on the night, on a television, in a room —
  // which is the only place the answer is knowable.
  //   baSkin  null | "steel"  the brass-mounted plate, or the plain card the
  //                           band shipped with, identical to the lineup's
  //   luSkin  null | "paper"  the dark card, or a printed team sheet: cream
  //                           stock, ink type, the same stock as the phone's
  //                           selection card
  baSkin: null,
  luSkin: null,
  mode: "ceremony",
  autoReveal: false,
  sound: true,
  // ── how long the man on the clock has actually been on it ────────────────
  // `clockEnds` alone cannot answer this. It moves every time the clock is
  // extended, paused, resumed or reset, so working backwards from it gives the
  // time a pick was *allowed*, not the time it took. These three are written
  // beside it and never adjusted: when the clock started, how much of that has
  // been spent stopped, and when the current stoppage began.
  clockStartedAt: null,
  clockPausedMs: 0,
  pausedAt: null,
};

/**
 * The last state every page has seen.
 *
 * commitPick needs to know what the clock was doing at the moment a pick
 * landed, and it is called from four places across three pages — the console's
 * announce, the console's manual entry, the director in live feed, and the
 * Sleeper sync loop, which lives in this file and has no state of its own. A
 * module-level copy kept fresh by watchState means the clock is timed the same
 * way from all four rather than at whichever call sites remembered to pass it.
 */
let LIVE = { ...DEFAULT_STATE };

export function watchState(cb) {
  return onSnapshot(STATE, snap => {
    const s = snap.exists() ? { ...DEFAULT_STATE, ...snap.data() } : { ...DEFAULT_STATE };
    LIVE = s;
    cb(s);
  });
}

/**
 * A clock starting from scratch, as a state patch.
 *
 * Every site that starts one uses this, so a new clock can never be written
 * with the timing fields left over from the last one — which would hand the
 * new man the previous manager's start time and score him for a pick he had
 * nothing to do with.
 */
export function freshClock(ms) {
  const now = Date.now();
  return {
    clockEnds: now + ms, paused: false, pausedLeft: null,
    clockStartedAt: now, clockPausedMs: 0, pausedAt: null,
  };
}

/** No clock at all — held for the turn of a round. */
export function heldClock() {
  return {
    clockEnds: null, paused: false, pausedLeft: null,
    clockStartedAt: null, clockPausedMs: 0, pausedAt: null,
  };
}

/**
 * Time actually spent on the clock, in ms, or null if it cannot be known.
 *
 * Paused time is subtracted, including an ongoing pause, because a draft that
 * stops for ten minutes while the pizza arrives did not make anybody a slow
 * picker. Extensions are deliberately *not* subtracted: +30s changes what he
 * was allowed, not what he took.
 */
export function elapsedOnClock(state, endAt = Date.now()) {
  const s = state || LIVE;
  if (!s.clockStartedAt) return null;
  let ms = endAt - s.clockStartedAt - (s.clockPausedMs || 0);
  if (s.pausedAt) ms -= Math.max(0, endAt - s.pausedAt);
  return ms > 0 ? ms : null;
}

export function watchPicks(cb) {
  return onSnapshot(PICKS, snap => {
    const picks = [];
    snap.forEach(d => picks.push(d.data()));
    picks.sort((a, b) => a.overall - b.overall);
    cb(picks);
  });
}

export async function getState() {
  const s = await getDoc(STATE);
  LIVE = s.exists() ? { ...DEFAULT_STATE, ...s.data() } : { ...DEFAULT_STATE };
  return LIVE;
}

export async function setState(patch) {
  await setDoc(STATE, { ...patch, at: serverTimestamp() }, { merge: true });
}

export async function resetDraft() {
  const snap = await getDocs(PICKS);
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  await setDoc(STATE, { ...DEFAULT_STATE, at: serverTimestamp() });
}

// ── making picks ──────────────────────────────────────────────────────────

const pad = n => String(n).padStart(3, "0");

/** Phone page: submit the pick. Held as `pending` until it is announced. */
export async function submitPick(overall, player) {
  await setState({
    status: "pick_in",
    current: overall,
    // A pick landing takes the screen back off the showcase. The phone is a
    // writer here as well as the console, so it clears it rather than leaving
    // the console to notice — the board would otherwise be showing a career
    // table at the moment THE PICK IS IN is meant to cover everything.
    showcase: null,
    pending: {
      id: player.id, name: player.name, pos: player.pos,
      team: player.team, board: player.board, posrank: player.posrank,
      rookie: !!player.rookie, n: player.n,
    },
    submittedAt: Date.now(),
  });
}

/**
 * How long this pick sat on the clock, for the clock room panel.
 *
 * Two guards, and both matter. Only the pick that is currently on the clock
 * gets a time: the Sleeper loop backfills older picks whenever it finds one the
 * board missed, and those would otherwise be scored against whatever clock
 * happens to be running now. And when the pick was held on the phone the
 * stopwatch stops at `submittedAt`, not at the announce — the ceremony is the
 * commissioner's time, not the manager's.
 */
function tookMsFor(overall, player) {
  if (overall !== (LIVE.current || 1)) return null;
  const p = LIVE.pending;
  const end = (p && p.id === player.id && LIVE.submittedAt) ? LIVE.submittedAt : Date.now();
  return elapsedOnClock(LIVE, end);
}

/** Console: reveal the held pick and write it to the board. */
export async function commitPick(overall, player, source = "app") {
  const mgr = managerOf(overall);
  const rec = {
    tookMs: tookMsFor(overall, player),
    overall,
    round: roundOf(overall),
    roundPick: roundPickOf(overall),
    slot: slotOf(overall),
    manager: mgr ? mgr.name : null,
    playerId: player.id,
    name: player.name,
    pos: player.pos,
    nflTeam: player.team,
    board: player.board ?? null,
    posrank: player.posrank ?? null,
    rookie: !!player.rookie,
    n: player.n,
    source,
    at: Date.now(),
  };
  await setDoc(doc(PICKS, pad(overall)), rec);
  return rec;
}

export async function undoPick(overall) {
  await deleteDoc(doc(PICKS, pad(overall)));
}

// ── Sleeper reconciliation ────────────────────────────────────────────────
//
// Managers enter their pick into Sleeper right after it is announced, and in
// the later rounds they will likely stop using the phone page entirely. This
// pulls anything Sleeper knows that the board does not, so the two can never
// drift apart and the board keeps working if the app is abandoned mid-draft.

let sleeperTimer = null;

export function startSleeperSync(getPicks, onAbsorb, everyMs = 4000) {
  async function tick() {
    try {
      const r = await fetch(
        `https://api.sleeper.app/v1/draft/${SLEEPER_DRAFT}/picks`,
        { cache: "no-store" });
      if (!r.ok) return;
      const remote = await r.json();
      if (!Array.isArray(remote) || !remote.length) return;

      const have = new Set(getPicks().map(p => p.overall));
      for (const rp of remote) {
        const overall = rp.pick_no;
        if (!overall || have.has(overall)) continue;
        const player = DATA.byId.get(String(rp.player_id));
        if (!player) continue;
        await commitPick(overall, player, "sleeper");
        have.add(overall);
        onAbsorb?.(overall, player);
      }
    } catch (_) {
      // Offline or Sleeper hiccup: the board runs fine on Firestore alone.
    }
  }
  clearInterval(sleeperTimer);
  sleeperTimer = setInterval(tick, everyMs);
  tick();
  return () => clearInterval(sleeperTimer);
}

/** Ask Sleeper whether Luke (or anyone) has joined since the data was built. */
export async function refreshLateJoiners() {
  // Before the network, not after it. Once every manager has a Sleeper id
  // there is nothing this can find, and it used to fetch a league and a draft
  // every sixty seconds all night to reach a `return false` two lines later.
  if (DATA.managers.every(m => m.sleeper_id)) return false;
  try {
    const [users, draft] = await Promise.all([
      fetch(`https://api.sleeper.app/v1/league/${SLEEPER_LEAGUE}/users`).then(r => r.json()),
      fetch(`https://api.sleeper.app/v1/draft/${SLEEPER_DRAFT}`).then(r => r.json()),
    ]);
    const order = draft?.draft_order || {};
    const taken = new Set(DATA.managers.filter(m => m.sleeper_id).map(m => m.sleeper_id));
    const open  = DATA.managers.filter(m => !m.sleeper_id);
    if (!open.length) return false;

    let changed = false;
    for (const u of users) {
      if (taken.has(u.user_id)) continue;
      // A new account: seat it in whatever slot the draft order gives it,
      // falling back to the one empty seat we already know about.
      const slot = order[u.user_id];
      const m = (slot && DATA.bySlot.get(slot) && !DATA.bySlot.get(slot).sleeper_id)
        ? DATA.bySlot.get(slot)
        : open[0];
      if (!m) continue;
      m.sleeper_id = u.user_id;
      m.handle = u.display_name;
      m.joined = true;
      m.team = (u.metadata || {}).team_name || m.team;
      if (u.avatar) m.avatar = `https://sleepercdn.com/avatars/thumbs/${u.avatar}`;
      changed = true;
    }
    return changed;
  } catch (_) {
    return false;
  }
}

// ── draft intelligence ────────────────────────────────────────────────────

export const POS_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];
export const STARTERS  = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1, FLEX: 1 };

/** Value verdict for a pick, against Sleeper's own board ordering. */
export function verdict(overall, board) {
  if (!board) return null;
  const gap = overall - board;          // + means he fell, - means reached
  if (gap >= 24) return { tag: "STEAL",  level: 2, gap };
  if (gap >= 12) return { tag: "VALUE",  level: 1, gap };
  if (gap <= -24) return { tag: "REACH", level: -2, gap };
  if (gap <= -12) return { tag: "EARLY", level: -1, gap };
  return { tag: "ON BOARD", level: 0, gap };
}

/** A manager's roster after their picks so far, and what they still need. */
export function rosterFor(picks, slot) {
  const mine = picks.filter(p => p.slot === slot);
  const count = {};
  mine.forEach(p => { count[p.pos] = (count[p.pos] || 0) + 1; });

  const need = [];
  for (const pos of POS_ORDER) {
    const short = (STARTERS[pos] || 0) - (count[pos] || 0);
    for (let i = 0; i < short; i++) need.push(pos);
  }
  // FLEX is filled by any spare RB/WR/TE.
  const spare = ["RB", "WR", "TE"].reduce(
    (a, p) => a + Math.max(0, (count[p] || 0) - (STARTERS[p] || 0)), 0);
  if (spare < 1) need.push("FLEX");

  return { picks: mine, count, need };
}

/**
 * What counts as a run, by position.
 *
 * Not one shape for all four. Backs and receivers come off the board in bunches
 * all night, so four in six picks is the bar. Quarterbacks and tight ends never
 * go four deep in six picks — twelve of each start in this league and most
 * managers wait — so the same event at those positions is three in seven, which
 * is what the room actually reacts to. Kickers and defenses are left out
 * entirely: in round eleven everyone takes one, which is not news.
 */
/**
 * `gap` is what ends one. A run is not over because the next pick was a tight
 * end — it is over when the room has moved on, and three straight picks
 * somewhere else is the room moving on. Quarterbacks and tight ends get one
 * more, because twelve of each start in this league and nobody takes two in a
 * row: three other picks between two quarterbacks is what a quarterback run
 * looks like, not what the end of one looks like.
 */
/**
 * `gap` picks somewhere else end a run, but only if they arrive together.
 *
 * They used to have to be consecutive, which ended runs that had not ended.
 * Three receivers, a back, two receivers, a quarterback, three more receivers:
 * nobody in the room thinks that stopped being a receiver run, but the back
 * and the quarterback each reset the count, so the board only ever reported
 * the tail of it. And the opposite reading — any three picks elsewhere,
 * wherever they fell — ends a run that is plainly still going, because over
 * eleven picks three of something else is nothing.
 *
 * So the interruptions have to be clustered: `gap` of them inside `endSpan`
 * picks is the room moving on, and the same `gap` spread across a dozen picks
 * is the room drafting receivers with the odd back in between.
 */
const RUN_SHAPE = {
  QB: { window: 7, n: 3, gap: 4, endSpan: 6 },
  TE: { window: 7, n: 3, gap: 4, endSpan: 6 },
};
const RUN_DEFAULT = { window: 6, n: 4, gap: 3, endSpan: 4 };
export const runShape = pos => RUN_SHAPE[pos] || RUN_DEFAULT;

/**
 * The run at one position as it stands right now, or null.
 *
 * Two questions, and they used to be answered by one number. *Is* this a run
 * is a question about density — four backs in six picks is one, four backs in
 * twelve is Tuesday. *How far back does it go* is a question about where it
 * started, and a fixed six-pick window could not answer it: four receivers in
 * the last five picks got reported as "four of the last six" because six was
 * the only window the code had, and four straight receivers got reported the
 * same way, when the thing worth saying is that they were straight.
 *
 * So the run is walked backwards from the most recent pick and it ends where
 * the board says it ends — at `gap` consecutive picks somewhere else. That
 * fixes both. The span is measured from the run's own first pick to now, so
 * the sentence is always the tightest one that is true, and `all` is set when
 * there is nothing else in it at all.
 *
 * Starting the walk at the last pick is also what retires a finished run: if
 * three other picks have gone since the last receiver, the walk breaks before
 * it reaches one and there is no run to report, which is the whole point.
 */
export function runAt(picks, pos) {
  const shape = runShape(pos);
  const base = shape.window - shape.n;

  /**
   * How many picks somewhere else a window of this size may carry.
   *
   * A flat allowance cannot describe both ends of this: two other picks is
   * generous inside a six-pick window and meaningless inside a sixteen-pick
   * one. The bar is a ratio — twice as many of this position as everything
   * else put together — with the shape's own allowance as a floor so the short
   * runs behave exactly as they always did.
   */
  const slackFor = n => Math.max(base, Math.floor(n / 2));

  // The best window ending at the most recent pick, not the whole walk.
  //
  // This used to walk all the way back and then test the one span it arrived
  // at, which failed in exactly the case the panel exists for: a receiver-heavy
  // stretch walks a long way before the run retires, and by then the span had
  // collected more interruptions than a flat allowance permitted, so a board
  // that had just taken eight receivers in twelve picks reported no run at all.
  // Every window along the walk is tested now and the biggest one that holds is
  // the answer.
  let best = null, n = 0;
  // Indices of the picks at other positions, in walk order, so the most
  // recently seen `gap` of them can be checked for being clustered.
  const others = [];

  for (let i = picks.length - 1; i >= 0; i--) {
    if (picks[i].pos === pos) {
      n++;
      const span = picks.length - i;
      // A run starts on a pick of its own position, so only these indices are
      // candidates. Bigger wins: six of nine says more than four of six.
      if (n >= shape.n && span - n <= slackFor(n) && (!best || n > best.n)) {
        best = { pos, n, span, all: n === span };
      }
    } else {
      others.push(i);
      // `gap` picks elsewhere inside `endSpan` picks of each other: the room
      // has moved on, and everything before this belongs to an older run.
      if (others.length >= shape.gap) {
        const group = others.slice(others.length - shape.gap);
        if (group[0] - group[group.length - 1] + 1 <= shape.endSpan) break;
      }
    }
  }
  return best;
}

/** Is a position run happening right now? */
export function positionRun(picks) {
  let best = null, bestOver = -1;
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    const r = runAt(picks, pos);
    if (!r) continue;
    // Two at once is rare, and when it happens the one furthest past its own
    // bar is the one the board should be shouting about. Ties go to the
    // tighter of the two.
    const over = r.n - runShape(pos).n;
    if (over > bestOver || (over === bestOver && r.span < best.span)) {
      best = r; bestOver = over;
    }
  }
  return best;
}

/** Best players still on the board, optionally filtered to a position. */
export function bestAvailable(picks, pos = null, n = 10) {
  const gone = new Set(picks.map(p => p.playerId));
  const out = [];
  for (const p of DATA.players) {
    if (gone.has(p.id)) continue;
    if (pos && p.pos !== pos) continue;
    out.push(p);
    if (out.length >= n) break;
  }
  return out;
}

export function isTaken(picks, playerId) {
  return picks.some(p => p.playerId === playerId);
}

/** Every time PAMS has drafted this player before. */
export function historyFor(player) {
  if (!player) return [];
  return DATA.history[player.n] || [];
}

/** Counts by position of everyone drafted so far. */
export function positionTally(picks) {
  const c = {};
  POS_ORDER.forEach(p => { c[p] = 0; });
  picks.forEach(p => { if (c[p.pos] !== undefined) c[p.pos]++; });
  return c;
}

// ── presentation helpers ──────────────────────────────────────────────────

export function headshot(player) {
  if (!player) return null;
  return player.pos === "DEF"
    ? `https://sleepercdn.com/images/team_logos/nfl/${String(player.id).toLowerCase()}.png`
    : `https://sleepercdn.com/content/nfl/players/${player.id}.jpg`;
}

// ── the 2026 schedule ─────────────────────────────────────────────────────
// Fourteen weeks, hand-built: everyone plays all eleven opponents once, then
// three conference opponents a second time. Week 11 is rivalry week. Built
// from the schedule artifact into data/schedule.json; see the README.

/** Who a manager opens against, or null if there's no schedule loaded. */
export function week1For(name) {
  const wk = DATA.schedule && DATA.schedule.weeks
    && DATA.schedule.weeks.find(w => w.week === 1);
  if (!wk) return null;
  const g = wk.games.find(x => x.a === name || x.b === name);
  return g ? (g.a === name ? g.b : g.a) : null;
}

/** A manager's rivalry-week opponent, or null. */
export function rivalOf(name) {
  return (DATA.schedule && DATA.schedule.rivals && DATA.schedule.rivals[name]) || null;
}

/**
 * The three men he plays twice.
 *
 * Everyone plays all eleven opponents once and three of them a second time,
 * and those three are the ones his season actually turns on. Counted off the
 * schedule rather than stored, so it can never disagree with the fixtures the
 * file lists. Empty array when there is no schedule loaded.
 */
export function doublesFor(name) {
  const weeks = (DATA.schedule && DATA.schedule.weeks) || [];
  const seen = {};
  for (const w of weeks) {
    for (const g of w.games) {
      const other = g.a === name ? g.b : g.b === name ? g.a : null;
      if (other) seen[other] = (seen[other] || 0) + 1;
    }
  }
  return Object.keys(seen).filter(o => seen[o] > 1);
}

export function teamLogo(abbr) {
  if (!abbr || abbr === "FA") return null;
  return `https://sleepercdn.com/images/team_logos/nfl/${abbr.toLowerCase()}.png`;
}

// Primary brand colour per team, for the glow behind a player's photo on the
// selection graphic and the detail screen. Deliberately not used on the
// round wall — that grid reads by draft position and picking colour, not
// by which 32 teams are on the board at once.
const TEAM_COLOR = {
  ARI: "#97233f", ATL: "#a71930", BAL: "#241773", BUF: "#00338d",
  CAR: "#0085ca", CHI: "#0b162a", CIN: "#fb4f14", CLE: "#311d00",
  DAL: "#003594", DEN: "#fb4f14", DET: "#0076b6", GB:  "#203731",
  HOU: "#03202f", IND: "#002c5f", JAX: "#006778", KC:  "#e31837",
  LAC: "#0080c6", LAR: "#003594", LV:  "#a5acaf", MIA: "#008e97",
  MIN: "#4f2683", NE:  "#002244", NO:  "#d3bc8d", NYG: "#0b2265",
  NYJ: "#125740", PHI: "#004c54", PIT: "#ffb612", SEA: "#002244",
  SF:  "#aa0000", TB:  "#d50a0a", TEN: "#4b92db", WAS: "#5a1414",
};

export function teamColor(abbr) {
  return TEAM_COLOR[abbr] || null;
}

/** All 32, so the board can pull their crests once at boot instead of one at
    a time in the frame each is first needed. */
export const TEAM_ABBRS = Object.keys(TEAM_COLOR);

export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function mmss(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export const escapeHtml = str => String(str ?? "").replace(
  /[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
                      '"': "&quot;", "'": "&#39;" }[c]));
