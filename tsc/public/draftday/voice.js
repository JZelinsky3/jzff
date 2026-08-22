// ── voice.js — the words on the board ─────────────────────────────────────
//
// Short lines about the manager on the clock and the pick he just made.
// Two rules drove all of it:
//
//   1. Nobody sounds the same. Every manager is assigned a fixed sentence
//      shape from a seed on his name, so Chris always reads a little
//      differently from Kyle, and the shape shifts again by round.
//   2. Plain words only. No "the room", no "the bracket", no "the men",
//      no metaphor where a fact will do.

import { rosterFor, POS_ORDER, rivalOf, runShape, bestAvailable } from "./core.js";

const CURRENT_SEASON = 2026;
const LAST_SEASON = 2025;

// Small deterministic hash so a manager's voice is stable all night.
function seed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const pick = (arr, n) => arr[n % arr.length];

const POS_WORD = {
  QB: "quarterback", RB: "running back", WR: "receiver",
  TE: "tight end", K: "kicker", DEF: "defense",
};

const POS_PLURAL = {
  QB: "quarterbacks", RB: "running backs", WR: "receivers",
  TE: "tight ends", K: "kickers", DEF: "defenses",
};

const COUNT_WORD = ["", "a", "two", "three", "four", "five", "six", "seven"];
// COUNT_WORD starts "a" because it is used for things on a roster ("a receiver,
// two backs"). Anything counting against a total needs the actual number —
// "a of his six first-round picks" is not a sentence.
const NUM_WORD = ["zero", "one", "two", "three", "four", "five", "six", "seven"];
const ORDINAL_WORD = ["", "first", "second", "third", "fourth", "fifth", "sixth"];
const ordWord = n => ORDINAL_WORD[n] || `${n}th`;

/**
 * Turn a needs array into something a person would say.
 *
 * Three things matter here. Duplicates collapse ("two running backs", never
 * "a running back, a running back"). Kickers and defenses are dropped until
 * the very end of the draft, because naming them in round three is noise
 * nobody cares about. And the list is capped, because "a quarterback, a
 * running back, a running back, a receiver, a receiver, a tight end, a
 * kicker, a defense and a flex" is not a sentence, it is a spreadsheet.
 */
function listNeeds(need, round = 1, max = 3) {
  let want = need.slice();
  if (round < 11) want = want.filter(p => p !== "K" && p !== "DEF");

  const order = ["QB", "RB", "WR", "TE", "FLEX", "K", "DEF"];
  const tally = {};
  want.forEach(p => { tally[p] = (tally[p] || 0) + 1; });

  const parts = order.filter(p => tally[p]).map(p => {
    const n = tally[p];
    if (p === "FLEX") return n > 1 ? `${COUNT_WORD[n]} flex spots` : "a flex";
    return n > 1 ? `${COUNT_WORD[n] || n} ${POS_PLURAL[p]}` : `a ${POS_WORD[p]}`;
  });

  const shown = parts.slice(0, max);
  const rest = parts.length - shown.length;
  if (rest > 0) shown.push("depth after that");
  return plainList(shown);
}

/** Sentence case, for templates that start with a fragment. */
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** A name that ends a sentence. "Chris Godwin Jr.." was on the board. */
const nm = s => String(s || "").replace(/\.$/, "");

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/**
 * The same fold `norm_name` does in build_draft_data.py, so a name out of
 * managers.json (NFL.com spelling) matches a pick made tonight (Sleeper's).
 * Accents, periods and Jr. all come off.
 */
function normName(name) {
  return String(name || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/).filter(p => p && !SUFFIXES.has(p))
    .join(" ");
}

/** That player, if he has already gone tonight. */
function takenTonight(name, picks) {
  const want = normName(name);
  return (picks || []).find(p => (p.n || normName(p.name)) === want) || null;
}

/** Is he one of the five best players left on the board? */
function atopBoard(name, picks, depth = 5) {
  const want = normName(name);
  return bestAvailable(picks || [], null, depth).some(p => (p.n || normName(p.name)) === want);
}

/** Round and pick, the board's shorthand: 2.04. */
const pickLabel = p => `${p.round}.${String(p.roundPick || 0).padStart(2, "0")}`;

function plainList(words) {
  if (!words.length) return "";
  if (words.length === 1) return words[0];
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

// ── career facts ──────────────────────────────────────────────────────────

function facts(m) {
  const c = (m && m.career) || {};
  const titles = c.titles || 0;
  const years = (c.title_years || []).slice().sort((a, b) => b - a);
  const seasons = c.seasons || 0;
  const playoffs = c.playoffs || 0;
  const top3 = c.top3 || 0;
  return {
    titles, years, seasons, playoffs, top3,
    record: c.record || "",
    last: years[0] || null,
    defending: years.includes(LAST_SEASON),
    drought: years[0] ? CURRENT_SEASON - years[0] : null,
    missed: Math.max(0, seasons - playoffs),
    everMadePlayoffs: playoffs > 0,
  };
}

/**
 * He's drafting a player he already owned during one of his own title
 * seasons — "rebuilding that team," not just a random repeat. `history` is
 * every past PAMS owner of this exact player; a hit only counts if it's
 * this manager, in a year that's actually in his own title_years.
 */
function rebuildYear(m, history) {
  const years = (m && m.career && m.career.title_years) || [];
  if (!years.length) return null;
  const hit = (history || []).find(h => h.m === m.name && years.includes(h.y));
  return hit ? hit.y : null;
}

/**
 * Same position, same round he drafted last year — the "he always does this"
 * callback, off his actual round-by-round history rather than a guess.
 * Returns last year's pick so the line can name him ("he took a receiver
 * first last year too, Nico Collins"), which is the whole point of it; a
 * bare "same as last year" made the viewer do the remembering.
 */
function lastYearSamePos(m, player, round) {
  const ly = (m && m.last_year || {})[String(round)];
  return ly && ly.pos === player.pos ? ly : null;
}

/**
 * The last owner, but only when that owner is this manager's rivalry-week
 * opponent.
 *
 * A bare "Kyle had him in 2024" is not worth a sentence. The reveal screen
 * already prints every past owner with the year and the pick number, in a box
 * a few inches from this line, so saying it in prose is just reading the table
 * out loud. Taking a player off the man you meet in week 11 is a different
 * fact, and it is the only version of this one that earns the space.
 *
 * Last season only, deliberately. Counting all seven years of rival history
 * matches about a fifth of the board and would fire some thirty times in a
 * fourteen-round draft, which turns the rivalry line into the house style.
 * Held to last year it lands about ten times, once a round, and it is also
 * the version that actually stings: he had him last year, and now he doesn't.
 */
function rivalSteal(m, history) {
  const riv = rivalOf(m && m.name);
  if (!riv) return null;
  return (history || []).find(h => h.m === riv && h.y === LAST_SEASON) || null;
}

// ── round one: what is at stake ───────────────────────────────────────────
//
// This used to be four generic buckets keyed off titles/seasons/drought —
// which meant every manager without a ring got the same handful of "still
// looking for his first championship" lines, whether he'd never sniffed the
// playoffs or had the best record in the league without a trophy to show
// for it. Five people in this league haven't won it and none of them are
// winless for the same reason. Hand-written per person, off the real record
// in managers.json, for the on-the-clock line. The selection graphic used to
// pull from a matching hand-written `open` field here, but a championship
// narrative repeated under his name for two minutes and then again the
// second the pick lands reads as the same fact twice. It now runs off
// `round1TendencyLine` instead — a real generated fact about the position he
// just took, not the drought he's still in.
// Every number in here is checked against source/dossier.json. Two rules the
// first pass broke: a career total is not a since-the-title total (Isaac has
// four playoff trips in six seasons, but only three seasons and two trips
// since 2022, and "four of six seasons since" a title four years ago was
// nonsense), and a tie is not a lead (Sean and Mason are both 56-40, so
// neither "has the best record in PAMS"). No em dashes anywhere in here
// either: this is copy that goes on a screen in front of people.
const MANAGER_VOICE = {
  Ricci: {
    // 2020 title. 46-50. Top three in 2024 and 2025. Playoffs in 4 of the 5
    // seasons since the ring.
    stakes: [
      `Ricci won it in 2020 and has been back in the playoffs four times in the five years since, including a second-place finish in 2024 and a third last year. No second ring out of any of it.`,
      `Six years since the trophy. Ricci has finished top three in each of the last two seasons and neither one got him back to the top.`,
    ],
  },
  Connor: {
    // No title in seven seasons. 42-54. One top three (2024). Two playoff trips.
    stakes: [
      `One top-three finish in seven years is the closest Connor has gotten. He is chasing that feeling again, not just a ring.`,
      `Connor has made the playoffs twice in seven seasons. Most years end well before that is even a conversation.`,
    ],
  },
  Evan: {
    // Three seasons, 17-25, one playoff trip.
    stakes: [
      `Three seasons in, one playoff trip, nothing else yet. Evan is still figuring out what this team is.`,
      `The newest team in the league, and the only manager here without a fourth season behind him. Evan is still building the résumé.`,
    ],
  },
  Chris: {
    // 2021 title, second in 2022. Then ninth, fifth, ninth.
    stakes: [
      `Chris won it in 2021 and finished second the year after. The three seasons since have gone ninth, fifth, ninth.`,
      `Five years removed from the only ring he has, and Chris has not finished top three in any season since 2022.`,
    ],
  },
  Joey: {
    // 2019 title, then third, second, third. Four top-three finishes ties
    // nobody: it is the outright most in PAMS. Last three years: 12th, 8th, 8th.
    stakes: [
      `Joey won the league's first title in 2019 and finished top three in each of the next three seasons. Four top-three finishes is more than anyone else in PAMS, and only the first one ended in a trophy.`,
      `Seven years since the only ring he has. Joey has not finished better than eighth in any of the last three seasons.`,
    ],
  },
  Charlie: {
    // Seven seasons, no top three, two playoff trips, best finish fourth.
    stakes: [
      `Seven seasons, zero top-three finishes. Not once has Charlie's team finished among the best three.`,
      `Money God has made the playoffs twice in seven years and has never finished better than fourth. Tonight is about finally getting into that conversation.`,
    ],
  },
  Connie: {
    // Championship game (1st or 2nd) in 2020, 2023, 2025 — three trips, most
    // in PAMS of anyone who has ever won it. Only the 2023 one is a ring.
    stakes: [
      `Connie has been to the championship three times, in 2020, 2023 and 2025. Only the middle one ended in a ring.`,
      `Nobody in PAMS has reached the title game more than Connie's three trips. Just one of them went her way.`,
    ],
  },
  Sean: {
    // 56-40, tied with Mason for the most wins in PAMS. No title.
    stakes: [
      `Nobody in PAMS has won more games than Sean. Four playoff trips, two top-three finishes, and still no ring to go with any of it.`,
      `Seven seasons, more wins than anyone in this league, and nothing at the end of any of them. Sean is the best manager in PAMS without a title.`,
    ],
  },
  Luke: {
    // 2024 title, the only top three of six seasons. Last in 2025.
    stakes: [
      `Luke won it in 2024 with the only top-three finish of his six seasons, then finished last in 2025.`,
      `One good year out of six, and it happened to be the one that mattered. Luke is chasing proof it was not a fluke.`,
    ],
  },
  Mason: {
    // Defending champion. 56-40, level with Sean for the most wins in PAMS.
    // The old line called him "the best team in the room" while he was on the
    // clock with an empty roster, which is both a phrase this file bans and a
    // claim about twelve teams that do not exist yet. His actual record says
    // something better anyway: 4-10 and dead last in 2024, champion in 2025.
    // Worst to first, which has happened exactly twice (Ricci did it in 2020).
    stakes: [
      `Mason went 4-10 in 2024 and finished dead last. He won the whole thing a year later. Only Ricci has ever made that turn in PAMS.`,
      `The defending champion. Mason is picking with a target on him and everyone in this draft knows it.`,
    ],
  },
  Kyle: {
    // Four playoff trips in seven seasons, zero top-three finishes.
    stakes: [
      `Kyle has made the playoffs four times in seven years and has never finished top three once he got there. He gets in and he gets out.`,
      `Seven seasons, four playoff trips, zero top-three finishes. Nobody in this draft gets to the playoffs more and does less with it than Kyle.`,
    ],
  },
  Isaac: {
    // 2022 title, second in 2023. Three seasons since the ring, two playoff
    // trips in them. Six seasons, 46-37, four playoff trips all told.
    stakes: [
      `Isaac won it in 2022 and finished second the year after. The two seasons since have gone eleventh and fifth.`,
      `Four years since the title, and Isaac has been back in the playoffs in two of the three seasons since. Getting back on top is the only box left.`,
    ],
  },
};

function stakes(m) {
  const v = MANAGER_VOICE[m.name];
  if (v) return pick(v.stakes, seed(m.name));

  // Fallback for anyone not in the hand-written set — shouldn't happen with
  // a fixed twelve-team league, but a late replacement manager shouldn't
  // crash the board over a missing entry.
  const f = facts(m);
  if (f.defending) return `${m.name} won it last year and drafts from the top of the league.`;
  if (f.titles === 0) return `${m.name} is still looking for his first championship.`;
  return `${m.name} won it in ${f.last} and wants another.`;
}

/**
 * A true fact about how a manager has actually drafted round one before,
 * in order from rarest and most specific down to the generic fallback.
 * Everything here reads off `round1_history`, which build_draft_data.py
 * computes fresh from the real 2019-2025 drafts every time it runs — none
 * of it is hand-typed per manager, so it cannot go stale or drift into a
 * dynasty-league assumption this league doesn't run on. PAMS is a full
 * redraft: nobody carries a roster spot or a "need" across years, so this
 * only ever states what a manager has actually done with a pick, never
 * what a player is still doing on his roster.
 *
 * Returns null when nothing here beats the generic career-stakes line,
 * which is the common case — only three managers hold a top-three slot in
 * any given draft, and most managers don't have a three-year streak or a
 * repeat first-round player on file.
 */
function round1TendencyLine(m) {
  const hist = m.round1_history;
  if (!hist || !hist.seq || !hist.seq.length) return null;
  const seq = hist.seq;

  // 1. He is picking from a top-three slot tonight. Rarer than anything
  //    else here — three managers a year — so it outranks every other fact.
  if (m.slot <= 3) {
    const t3 = hist.top3_last;
    if (!t3) return `First time picking this early for ${m.name}.`;
    const gap = CURRENT_SEASON - t3.y;
    if (gap <= 1) {
      const timesTop3 = seq.filter(p => p.slot <= 3).length;
      return timesTop3 >= seq.length
        ? `${m.name} has never picked outside the top three. Every season of his career has started from the top of the board.`
        : `${m.name} is picking from the top of the board again after doing it last year.`;
    }
    const finishLine = t3.finish
      ? ` He took ${t3.player} that year and finished ${ordinalPick(t3.finish)}.`
      : ` He took ${t3.player} that year.`;
    return `This is unfamiliar territory for ${m.name}, who hasn't picked inside the top three since ${t3.y}.${finishLine}`;
  }

  // 2. A player he keeps going back to with a first-round pick specifically
  //    (not just anywhere on the roster) — the strongest kind of repeat
  //    tendency, since it survives a full redraft on purpose.
  const counts = {};
  seq.forEach(p => { counts[p.player] = (counts[p.player] || 0) + 1; });
  const repeat = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (repeat && repeat[1] >= 3) {
    return `${m.name} has taken ${repeat[0]} in the first round ${COUNT_WORD[repeat[1]] || repeat[1]} times.`;
  }

  // 3. A live position streak, three years running or more.
  const pos0 = seq[0].pos;
  let streak = 1;
  while (streak < seq.length && seq[streak].pos === pos0) streak++;
  if (streak >= 3) {
    return `${m.name} has taken a ${POS_WORD[pos0]} in the first round ${COUNT_WORD[streak] || streak} years running.`;
  }

  if (repeat && repeat[1] === 2) {
    return `${m.name} has taken ${repeat[0]} in the first round twice.`;
  }

  // 4. A position nobody else in PAMS has ever used a first-round pick on —
  //    checked league-wide at build time, not guessed from one manager's
  //    own history.
  if (hist.rare_positions && hist.rare_positions.length) {
    const words = hist.rare_positions.map(p => POS_WORD[p]);
    return `${m.name} is the only manager in PAMS to use a first-round pick on ${plainList(words)}.`;
  }

  return null;
}

/**
 * The selection graphic's round-one line: not the championship drought —
 * that already ran for two minutes under his name on the clock — but what
 * this specific position means for his own first-round history. No
 * standings, no finishes, just what he has actually done with a first-round
 * pick before. Same `round1_history` as the on-the-clock version, so it's
 * generated rather than one of twelve hand-typed sentences, and can't drift.
 */
function round1PositionLine(m, player) {
  const seq = (m.round1_history && m.round1_history.seq) || [];
  const word = POS_WORD[player.pos];
  const prior = seq.filter(p => p.pos === player.pos); // already most-recent-first

  if (!prior.length) {
    return `${m.name} goes ${word} in the first round for the first time.`;
  }

  const gap = CURRENT_SEASON - prior[0].y;
  if (gap === 1) {
    // How many years running, counting backward from last year, tonight's
    // pick included.
    let streak = 1;
    for (let i = 1; i < prior.length; i++) {
      if (prior[i].y === prior[i - 1].y - 1) streak++;
      else break;
    }
    return `${m.name} goes ${word} in the first round for the ${ordinalPick(streak + 1)} consecutive year.`;
  }

  return `${m.name} goes ${word} in the first round for the first time in ${gap} years.`;
}

/**
 * What his first rounds have actually looked like, in counts, off
 * `draft_tendency.round1` — every first-round pick he has ever made, by
 * position.
 *
 * Two versions of the same fact. If tonight's position is one he keeps going
 * back to, the count is the story ("his fifth back in seven first rounds").
 * If it isn't, the story is what he usually does instead ("five of his six
 * first-round picks have been running backs"), which is the more interesting
 * of the two and the reason this exists: a manager taking a receiver first for
 * only the second time in six years is a real thing to say about the pick, and
 * nothing else on the reveal says it.
 */
function round1Tendency(m, player) {
  const r1 = (m && m.draft_tendency && m.draft_tendency.round1) || {};
  const drafts = Object.values(r1).reduce((a, b) => a + b, 0);
  // Three years in, "two of his three" is a coincidence, not a tendency.
  if (drafts < 3) return null;
  const total = NUM_WORD[drafts] || drafts;
  const mine = r1[player.pos] || 0;
  if (mine >= 2) {
    return `That is his ${ordWord(mine + 1)} ${POS_WORD[player.pos]} in ${total} first rounds.`;
  }
  const top = Object.entries(r1).sort((a, b) => b[1] - a[1])[0];
  if (top && top[0] !== player.pos && top[1] >= 3) {
    return `${cap(NUM_WORD[top[1]] || top[1])} of his ${total} first-round picks have been ${POS_PLURAL[top[0]]}.`;
  }
  return null;
}

/**
 * Round one's writeup, for the picks where none of the live angles fired.
 *
 * It used to fall through to the roster inventory, which in round one is the
 * pick that was just announced: "Isaac opens with a receiver. A receiver
 * through one round." Nobody needs the sentence read back to them. He has
 * exactly one player, so there is no roster to describe — what there is
 * instead is seven years of his own first rounds, and none of it is on screen
 * anywhere else. Two facts at most, and never the one the selection graphic
 * just used.
 */
function round1Note(m, player, used) {
  const bits = [];

  const tend = round1Tendency(m, player);
  if (tend) bits.push(tend);

  // Who he opened with last year, but only when it was a different position —
  // same position is the "same round, same position as last year" line higher
  // up in pickLine, and it says it better. The position is named only when it
  // is doing the contrast on its own; after the tendency line it is repetition.
  const ly = (m.last_year || {})["1"];
  if (ly && ly.name !== player.name && ly.pos !== player.pos) {
    bits.push(bits.length
      ? `Last year he opened with ${nm(ly.name)}.`
      : `Last year he opened with a ${POS_WORD[ly.pos]}, ${nm(ly.name)}.`);
  }

  // His history at this position in the first round specifically. Skipped when
  // the selection graphic has just said it — "open" is that line.
  if (bits.length < 2 && used !== "open") {
    const line = round1PositionLine(m, player);
    if (line) bits.push(line);
  }

  return bits.length ? bits.slice(0, 2).join(" ") : null;
}

/**
 * The positions where a gap between picks is worth saying out loud.
 *
 * Twelve tight ends, twelve kickers and twelve defenses cover the whole
 * league, and most of them don't move until the back half of the draft — so
 * "nobody had taken one in nine picks" is the normal state of the board, not a
 * fact about this pick. Runs on them are still real (four tight ends in six
 * picks is something happening) and are not gated by this.
 */
const DROUGHT_POS = new Set(["QB", "RB", "WR"]);

/**
 * The pick number past which the *first* one at a position is late enough that
 * the waiting is the story. Backs and receivers are gone inside round one, so
 * anything is late; quarterbacks and tight ends start moving through round
 * two, and past the middle of it the room has noticed; kickers and defenses
 * don't exist until round eleven.
 */
const FIRST_LATE = { QB: 18, TE: 18, RB: 12, WR: 12, K: 120, DEF: 120 };

/**
 * The first one at a position, off the board. Late enough and it says so with
 * the pick number, because by then the fact is how long everybody waited —
 * "first quarterback off the board" at pick 22 undersells it, and phrasing it
 * as a gap ("first quarterback in 19 picks") reads as though one had already
 * gone.
 */
function firstOffLine(pos, overall) {
  return overall > (FIRST_LATE[pos] || 12)
    ? `The first ${POS_WORD[pos]} finally comes off the board, at pick ${overall}.`
    : `First ${POS_WORD[pos]} off the board.`;
}

/**
 * Picks since the last time this position came off the board, or null if it
 * never has in this draft (the "first" angle already covers that case).
 */
function positionDroughtGap(player, picks, overall) {
  const upTo = picks.filter(p => p.overall <= overall).sort((a, b) => a.overall - b.overall);
  const idx = upTo.findIndex(p => p.overall === overall);
  if (idx < 1) return null;
  let gap = 0;
  for (let i = idx - 1; i >= 0; i--) {
    if (upTo[i].pos === player.pos) return gap;
    gap++;
  }
  return null;
}

// ── on the clock ──────────────────────────────────────────────────────────

/**
 * One line under the manager's name while his clock runs.
 *
 * It used to read out the needs list every round after the first, which in
 * round two meant "Isaac still needs a quarterback, a running back, two
 * receivers and depth after that" — a list of seven things nobody can hold in
 * their head, about a man who has made one pick. A needs list is only worth
 * saying when it is nearly closed. Otherwise this talks about what he has done
 * instead: what he took in this round last year, or what is on the roster.
 */
function clockAngle(m, round, picks) {
  if (round === 1) return "stakes";
  const { count, need } = rosterFor(picks, m.slot);
  if (!listNeeds(need, round)) return "depth";
  // How many separate things are left, not how many words listNeeds used.
  const openSlots = need.filter(p => round >= 11 || (p !== "K" && p !== "DEF")).length;
  if (openSlots <= 2) return "needs";
  if ((m.last_year || {})[String(round)]) return "lastyear";
  if (POS_ORDER.some(p => count[p] && p !== "K" && p !== "DEF")) return "have";
  return "stakes";
}

export function onClockLine(m, overall, round, picks) {
  if (!m) return "";
  const n = seed(m.name + round);

  if (round === 1) return round1TendencyLine(m) || stakes(m);

  const { count, need } = rosterFor(picks, m.slot);
  const want = listNeeds(need, round);
  const angle = clockAngle(m, round, picks);

  if (!want) {
    return pick([
      `${m.name} has a full starting lineup and is drafting for depth now.`,
      `Every starting spot is filled. ${m.name} is adding bench pieces.`,
      `Nothing left to fill. This one is about depth for ${m.name}.`,
    ], n);
  }

  // Two or fewer holes left: naming them is the most useful thing on screen.
  if (angle === "needs") {
    return pick([
      `${m.name} still needs ${want}.`,
      `Still open for ${m.name}: ${want}.`,
      `${want} left to fill for ${m.name}.`,
    ], n);
  }

  // Otherwise, what he did in this round last year — a real fact about him,
  // and the one thing on this screen that is about him rather than his slots.
  //
  // Said the way a person says it. "Round 2 last year was Jonathan Taylor for
  // Isaac" is the same words in an order nobody speaks in, and it read as
  // filler because of it.
  //
  // Then the part that makes it live: where that player is tonight. Still
  // sitting there is the most interesting thing this screen can say while the
  // clock runs, because he can have him back with the pick he is about to
  // make. Gone is the ordinary case — by round four most of last year's board
  // is gone, and "Sean took him at 1.08" is true of nearly every early pick,
  // which is why it is only said when there is something between the two men:
  // the man he plays in week 11 has him, or it happened moments ago.
  const ly = (m.last_year || {})[String(round)];
  if (angle === "lastyear" && ly) {
    // `who` is the name, or "him" when the sentence before it has already said
    // the name. Both shapes lead with who did it — "In round 2 last year,
    // Isaac took him" is the same words in an order nobody speaks in. The
    // round is always this round (`last_year` is keyed by it), so "this pick"
    // is exact.
    const say = who => pick([
      `${m.name} took ${who} with his ${ordWord(round)}-round pick last year.`,
      `Last year ${m.name} took ${who} with this pick.`,
    ], n);
    const gone = takenTonight(ly.name, picks);
    // "Still on the board" only when that means something. In round nine half
    // the league's last-year picks are still sitting there and nobody wants
    // them; it is worth saying when the man is one of the best few players
    // left, because then he can actually have him back with this pick.
    if (!gone && atopBoard(ly.name, picks)) {
      const still = pick(["is still on the board", "is still available", "is still sitting there"], n);
      return `${ly.name} ${still}. ${say("him")}`;
    }
    if (!gone) return say(ly.name);
    if (gone.slot === m.slot) {
      return `${say(ly.name)} He already has him back, from round ${gone.round}.`;
    }
    // The man he meets in week 11 is holding last year's pick: that is worth a
    // sentence in a way that a name on somebody's roster is not.
    if (gone.manager && gone.manager === rivalOf(m.name)) {
      return `${say(ly.name)} ${gone.manager} has him now, and they meet in week 11.`;
    }
    // Or it happened while he sat there watching, which is its own thing.
    const ago = overall - gone.overall;
    if (ago <= 6) {
      return `${say(ly.name)} ${gone.manager} took him ${
        ago === 1 ? "with the pick before this" : `${NUM_WORD[ago] || ago} picks ago`}.`;
    }
    return say(ly.name);
  }

  const have = POS_ORDER
    .filter(p => count[p] && p !== "K" && p !== "DEF")
    .map(p => (count[p] === 1
      ? `a ${POS_WORD[p]}`
      : `${COUNT_WORD[count[p]] || count[p]} ${POS_PLURAL[p]}`));
  if (have.length) {
    return `${cap(plainList(have.slice(0, 3)))} on ${m.name}'s roster so far.`;
  }
  return stakes(m);
}

// ── the pick writeup ──────────────────────────────────────────────────────

/**
 * Which angle the five second selection graphic took, so the detail screen
 * that follows it can take a different one.
 *
 * Both screens used to work down their own list of the same facts, and the
 * writeup under the reveal also opened with the manager's stakes line — the
 * same sentence that had just spent two minutes under his name on the clock.
 * The result was three screens in a row saying one thing. This is the single
 * place that decides what the graphic says; `pickLine` reads it and starts
 * from whatever is left.
 *
 * Round one used to short-circuit straight to "open" (the manager's own
 * first-round position history) before any of these other checks ran, which
 * meant all twelve round-one graphics leaned on the same kind of fact even
 * though real draft-night things — a rival steal, a repeat player, a
 * position run — happen just as often in round one as anywhere else. Now
 * round one runs the same chain as every other round; "open" only becomes
 * the answer when nothing more specific fired, same as the generic fallback
 * does for every other round.
 */
function selectionAngle(m, player, overall, round, picks, history) {
  if (rebuildYear(m, history)) return "rebuild";
  if (!picks.some(p => p.pos === player.pos && p.overall !== overall)) return "first";
  if (rivalSteal(m, history)) return "steal";
  if ((history || []).some(h => h.m === m.name)) return "own";
  const gap = positionDroughtGap(player, picks, overall);
  if (gap !== null && gap >= 5 && DROUGHT_POS.has(player.pos)) return "drought";
  if (posContext(player, picks, overall).nth >= 3) return "count";
  if (round === 1) return "open";
  return "generic";
}

/**
 * How this position is going: how many are gone, how many came in the window
 * that counts as a run at this position, and whether that is a run.
 *
 * The window is `runShape`'s, so the wall's alert chip and every line written
 * about a run are the same event — six picks deep for backs and receivers,
 * seven for quarterbacks and tight ends.
 */
function posContext(player, picksAfter, overall) {
  const upTo = picksAfter.filter(p => p.overall <= overall);
  const atPos = upTo.filter(p => p.pos === player.pos).length;
  const shape = runShape(player.pos);
  const window = Math.min(shape.window, upTo.length);
  const recent = upTo.slice(-window).filter(p => p.pos === player.pos).length;
  // One short of the full window is allowed so a run that starts at the top of
  // the draft still counts; any shallower and there is no sample behind it.
  return { nth: atPos, recent, window, run: recent >= shape.n && window >= shape.window - 1 };
}

/**
 * The writeup under a revealed pick.
 *
 * One clause naming what he added, then one fact about the pick itself, in
 * this order of preference: where it landed against the board, whether it is
 * part of a run, whether he did the same thing in this round last year, who
 * owned the player before, and only at the end the shape of his roster. Any
 * angle the selection graphic has already used is skipped, and the manager's
 * stakes line — round one's on-the-clock copy — is never repeated here at all.
 */
export function pickLine(m, player, overall, round, picksAfter, history) {
  if (!m || !player) return "";
  const n = seed(m.name + round + player.pos);
  const { count, need } = rosterFor(picksAfter, m.slot);
  const pos = POS_WORD[player.pos];
  const used = selectionAngle(m, player, overall, round, picksAfter, history);
  // What was under his name while the clock ran, worked out from the roster as
  // it was before this pick landed — so the writeup does not repeat that either.
  const said = clockAngle(m, round, picksAfter.filter(p => p.overall !== overall));

  // How many of this position he now has, for "his second receiver".
  const nth = count[player.pos] || 1;
  const ord = ORDINAL_WORD[nth] || `${nth}th`;

  // The first of a position is just "a receiver". Only start counting once
  // there is more than one, otherwise every line opens with "his first".
  const addPart = round === 1
    ? pick([
        `${m.name} opens with a ${pos}.`,
        `A ${pos} to start for ${m.name}.`,
        `${m.name} takes a ${pos} first.`,
      ], n)
    : nth <= 1
    ? pick([
        `${m.name} adds a ${pos}.`,
        `A ${pos} for ${m.name}.`,
        `${m.name} goes ${pos}.`,
      ], n)
    : pick([
        `${m.name} takes his ${ord} ${pos}.`,
        `That is ${m.name}'s ${ord} ${pos}.`,
        `${cap(ord)} ${pos} for ${m.name}.`,
      ], n);

  // 1. Where he went against where the board had him. The tags above the
  //    writeup carry the numbers; this says what they amount to.
  //
  //    Never for kickers and defenses. Every league takes them in the last
  //    four rounds no matter where a national board has them, so all twenty
  //    four of those picks came out as "that is 60 picks ahead of the board" —
  //    which is true, and says nothing about the pick or the man making it.
  const skipBoard = player.pos === "K" || player.pos === "DEF";
  const board = skipBoard ? null : player.board;
  const gap = board ? overall - board : 0;
  if (board && gap >= 24) {
    return `${addPart} The board had him ${ordinalPick(board)} overall and he lasted to ${ordinalPick(overall)}.`;
  }
  if (board && gap >= 12) {
    return `${addPart} He was ranked ${ordinalPick(board)} overall and fell ${gap} picks past it.`;
  }
  if (board && gap <= -24) {
    return `${addPart} That is ${Math.abs(gap)} picks ahead of the board, which had him ${ordinalPick(board)} overall.`;
  }
  if (board && gap <= -12) {
    return `${addPart} The board had him ${ordinalPick(board)} overall. ${m.name} was not waiting.`;
  }

  // 2. He did this in this round last year too, and here is who it was.
  //    Not when it is the same player: "same position as last year, when he
  //    took Jaylen Waddle" while taking Jaylen Waddle reads as a mistake.
  //    That case has its own line further down.
  const lyEcho = lastYearSamePos(m, player, round);
  if (lyEcho && lyEcho.name !== player.name && round <= 10 && said !== "lastyear") {
    return `${addPart} Same round, same position as last year, when he took ${nm(lyEcho.name)}.`;
  }

  // 3. History on the player, if the graphic did not already use it.
  const rebuildYr = rebuildYear(m, history);
  if (rebuildYr && used !== "rebuild") {
    return `${addPart} He had ${player.name} on the ${rebuildYr} title team.`;
  }
  const steal = rivalSteal(m, history);
  if (steal && used !== "steal" && round <= 10) {
    return `${addPart} He takes him off ${steal.m}, who had him last year. They meet in week 11.`;
  }
  const own = (history || []).find(h => h.m === m.name);
  if (own && used !== "own" && used !== "rebuild") {
    return `${addPart} He drafted him in ${own.y} as well.`;
  }

  // 4. A run on the position, on the same shape the wall calls one (four in
  //    six, or three in seven at quarterback and tight end) — unless the
  //    graphic already said so a moment ago as "drought" or "count".
  const pc = posContext(player, picksAfter, overall);
  if (pc.run && used !== "drought" && used !== "count") {
    return `${addPart} That is ${COUNT_WORD[pc.recent] || pc.recent} ${
      POS_PLURAL[player.pos]} in the last ${COUNT_WORD[pc.window] || pc.window} picks.`;
  }
  if (pc.nth === 1 && used !== "first") {
    return `${addPart} ${firstOffLine(player.pos, overall)}`;
  }
  // The other side of a run: the position nobody had touched in a while. The
  // graphic has its own version of this ("drought"), so this only runs when it
  // took a different angle, and at a wider gap than the graphic's five — in
  // the middle rounds a five-pick gap at quarterback is just Tuesday. Stated
  // as what the board was doing, not as "first quarterback in 19 picks", which
  // reads as the first one of the night.
  const dgap = positionDroughtGap(player, picksAfter, overall);
  if (dgap !== null && dgap >= 8 && used !== "drought" && DROUGHT_POS.has(player.pos)) {
    return `${addPart} No ${pos} had come off the board in ${dgap} picks.`;
  }

  if (player.rookie && round <= 8) {
    return `${addPart} A rookie, in round ${round}.`;
  }

  // 5. Round one, where there is no roster worth describing: his own first
  //    rounds instead.
  if (round === 1) {
    const r1 = round1Note(m, player, used);
    if (r1) return `${addPart} ${r1}`;
  }

  // 6. Then the shape of the roster — stated as what he has, never as what
  //    he still needs, because what he still needs is the line that was under
  //    his name for the whole two minutes before this.
  //
  //    Only once it is more than the pick itself said. One player is not a
  //    roster, and "a receiver through one round" about a man who just took a
  //    receiver is the writeup reading itself back. It needs either two
  //    positions on the board or two of this one.
  const have = POS_ORDER
    .filter(p => count[p] && p !== "K" && p !== "DEF")
    .map(p => (count[p] === 1
      ? `a ${POS_WORD[p]}`
      : `${COUNT_WORD[count[p]] || count[p]} ${POS_PLURAL[p]}`));
  if (round > 1 && (have.length >= 2 || (count[player.pos] || 0) >= 2)) {
    return `${addPart} ${cap(plainList(have.slice(0, 3)))} through ${round} rounds.`;
  }

  // 7. Whatever is left: where this one sits in tonight's run on the position.
  //    Always true, always a number nobody has said yet, and it beats ending
  //    on the addPart alone.
  if (pc.nth >= 2) {
    return `${addPart} ${cap(ordWord(pc.nth))} ${pos} off the board tonight.`;
  }
  return `${addPart} ${need.length ? "" : "His starting lineup is complete."}`.trim();
}

/**
 * The one line on the five second selection graphic.
 *
 * Deliberately shorter and louder than `pickLine`: it sits under a name set
 * 13vh tall and has to be read across a room in a few seconds, so it is one
 * clause about why this pick matters, never a needs inventory.
 */
export function selectionLine(m, player, overall, round, picks, history) {
  if (!m || !player) return "";
  const n = seed(m.name + player.name);
  const pos = POS_WORD[player.pos];
  // One decision, shared with pickLine, which then takes a different one.
  const angle = selectionAngle(m, player, overall, round, picks, history);

  if (angle === "open") return round1PositionLine(m, player);

  if (angle === "rebuild") {
    return `${m.name} brings back ${player.name} from the ${rebuildYear(m, history)} title team.`;
  }

  if (angle === "first") {
    // Past the point where the position normally starts moving, the wait is
    // the fact, so the graphic carries the pick number too.
    return overall > (FIRST_LATE[player.pos] || 12)
      ? `${m.name} takes the first ${pos} of the night, at pick ${overall}.`
      : `${m.name} takes the first ${pos} off the board.`;
  }

  const steal = rivalSteal(m, history);
  if (angle === "steal" && steal) {
    return pick([
      `${m.name} takes ${player.name} straight off ${steal.m}. They meet in week 11.`,
      `${player.name} was ${steal.m}'s last year. ${m.name} just took him.`,
    ], n);
  }

  const own = (history || []).find(h => h.m === m.name);
  if (angle === "own" && own) {
    // Every prior year, oldest first, for the count phrasing's parenthetical
    // — "for the fourth time" means little on its own, but "(2019, 2020,
    // 2021, 2023)" is receipts. Rare to run past two, but Mason alone has
    // taken Saquon Barkley in the first round four times, so it needs to
    // hold up past that.
    const priorYears = (history || []).filter(h => h.m === m.name).map(h => h.y).sort((a, b) => a - b);
    const ord = ORDINAL_WORD[priorYears.length + 1] || `${priorYears.length + 1}th`;
    return pick([
      `${m.name} goes back to ${player.name}, who he took in the ${own.y} draft.`,
      `${m.name} takes ${player.name} for the ${ord} time (${priorYears.join(", ")}).`,
      `${player.name} returns to ${m.name}, who he picked back in ${own.y}.`,
    ], n);
  }

  // Draft-flow facts: what this pick means for the position, not the man.
  // A gap ending is rarer and more specific than a plain count, so it goes
  // first — but `selectionAngle` only ever hands out one of the two per pick.
  if (angle === "drought") {
    const gap = positionDroughtGap(player, picks, overall);
    return `${player.name} is the first ${pos} to come off the board in the last ${gap} picks.`;
  }

  if (angle === "count") {
    const pc = posContext(player, picks, overall);
    const isRun = pc.run;
    return isRun
      ? `${player.name} is the ${ordinalPick(pc.nth)} ${pos} off the board, after a run at the position.`
      : `${player.name} is the ${ordinalPick(pc.nth)} ${pos} off the board.`;
  }

  return pick([
    `${m.name} adds a ${pos} at ${ordinalPick(overall)} overall.`,
    `A ${pos} for ${m.name} with the ${ordinalPick(overall)} pick.`,
  ], n);
}

/** Ordinal for pick numbers: 1st overall, 23rd overall. */
export function ordinalPick(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
