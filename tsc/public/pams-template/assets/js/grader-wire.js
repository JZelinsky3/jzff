// grader-wire.js — The Grader, wire-room edition (desktop).
//
// A season of trades rendered as a story, not a list:
//   • The FRONT PAGE: the season's biggest deal set as a full Transaction
//     Times front page. Recomputed on every load, so a bigger (or equally
//     big but newer) deal takes the page over the moment it lands.
//   • The VERDICT DESK: four-week revisits are their own bulletins in
//     ruling-blue ink. Fresh rulings (revisited within 7 days) pin near
//     the top of the wire; the full docket lives on its own tab so old
//     rulings never hide under old trades.
//   • The WIRE: everything else rides a left rail, split into week
//     editions — a chip + rule divider per week. Every card is a page of
//     the Transaction Times (folio line at the foot, numbered from the
//     front page down). Paper stock varies by tier: blockbusters print
//     bright fresh-off-the-press, headline deals cream, telegrams manila,
//     depth moves grey newsprint scraps, rulings blue.
//   • SEALED DISPATCHES: a trade from the last 48h this reader hasn't
//     opened arrives sealed — wax seal, managers named, no details.
//     Breaking the seal reveals the packages piece by piece. Seen-state
//     lives in localStorage; an unbroken seal expires after 48h.
//   • THE EMBARGO: grades don't print the instant a deal clears. Each
//     trade gets a deterministic grade-drop time 26-36h after execution
//     (hash of the trade id — after the daily 14:00 UTC grading cron has
//     had time to run, so the grade is in the data before the clock ends).
//     Until then the card shows the packages plus a live countdown; when
//     the clock hits zero on an open page the wire re-renders and the
//     stamps slam in.
//
// Test hooks (query params, no server involvement):
//   ?reveal=1  seal every card on the wire regardless of age/seen-state,
//              and don't persist seen-state, so reveals can be replayed.
//   ?timer=1   put every card's grades under a short (~½-2 min) embargo
//              so the countdown and the live grade-drop can be watched.
//
// Season control matches the other desk rooms: a quiet "Live" line under
// the hero that opens a native select of every season with trades.
//
// The mobile grader keeps the old trades.js/trades.css pipeline.

(function () {
  'use strict';

  var content = document.getElementById('wire-content');
  var yearSel = document.getElementById('wire-year-select');
  var metaEl  = document.getElementById('wire-meta');
  var tabsEl  = document.getElementById('wire-tabs');

  var params = new URLSearchParams(location.search);
  var forceReveal = params.get('reveal') === '1';
  var forceTimer  = params.get('timer') === '1';
  var bootTime = Date.now();

  // ── Helpers ────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtDate(iso, withYear) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var opts = { month: 'short', day: 'numeric' };
    if (withYear) opts.year = 'numeric';
    return d.toLocaleDateString(undefined, opts);
  }
  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'];
    var v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function gradeClass(g) {
    if (!g) return 'g-none';
    var first = g[0];
    if (first === 'A') return 'g-a';
    if (first === 'B') return 'g-b';
    if (first === 'C') return 'g-c';
    return 'g-d';
  }
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function sideNames(t) {
    return (t.sides || []).map(function (s) {
      return s.manager.team_name || s.manager.display_name;
    });
  }
  function joinNames(names) {
    if (names.length === 2) return names[0] + ' and ' + names[1];
    return names.join(', ');
  }

  // ── Seen-state (sealed dispatches) ─────────────────────────────────────
  var SEEN_KEY = 'tsc_grader_seen_v1';
  var SEAL_MS  = 48 * 60 * 60 * 1000;   // seals expire on their own after 48h
  var SEEN_TTL = 30 * 24 * 60 * 60 * 1000;

  function loadSeen() {
    try {
      var m = JSON.parse(localStorage.getItem(SEEN_KEY)) || {};
      var cutoff = Date.now() - SEEN_TTL, out = {}, dirty = false;
      Object.keys(m).forEach(function (k) {
        if (m[k] >= cutoff) out[k] = m[k]; else dirty = true;
      });
      if (dirty) saveSeen(out);
      return out;
    } catch (e) { return {}; }
  }
  function saveSeen(m) {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(m)); } catch (e) {}
  }
  var seen = loadSeen();

  function isSealed(t) {
    if (forceReveal) return !seen[t.id];
    return Date.now() - Date.parse(t.executed_at) < SEAL_MS && !seen[t.id];
  }

  // ── The embargo — when do this trade's grades drop? ────────────────────
  // Deterministic per trade: 26-36h after execution, hashed off the trade
  // id so different deals drop at different hours. The daily grading cron
  // (14:00 UTC) lands inside 24h, so by drop time the grade is already in
  // the payload — the client is just holding the curtain.
  var EMBARGO_BASE_MS = 26 * 60 * 60 * 1000;
  var EMBARGO_SPAN_MS = 10 * 60 * 60 * 1000;

  function embargoEnd(t) {
    if (forceTimer) return bootTime + 30 * 1000 + (hashStr(t.id) % 90) * 1000;
    return Date.parse(t.executed_at) + EMBARGO_BASE_MS + hashStr(t.id) % EMBARGO_SPAN_MS;
  }
  function gradesHeld(t) {
    var end = embargoEnd(t);
    return !isNaN(end) && Date.now() < end;
  }
  function fmtClock(ms) {
    if (ms < 0) ms = 0;
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var ss = s % 60;
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return h > 0 ? h + ':' + pad(m) + ':' + pad(ss) : m + ':' + pad(ss);
  }

  // ── Headline writer ────────────────────────────────────────────────────
  var TEMPLATES = [
    function (n) { return n + ' changes hands.'; },
    function (n) { return n + ' on the move.'; },
    function (n) { return 'The ' + n + ' deal.'; },
    function (n) { return n + ' traded.'; },
    function (n) { return n + ' finds a new home.'; },
  ];
  function lastName(full) {
    var parts = String(full || '').trim().split(/\s+/);
    if (parts.length < 2) return full || '';
    var last = parts[parts.length - 1];
    if (/^(jr|sr|ii|iii|iv|v)\.?$/i.test(last) && parts.length >= 3) last = parts[parts.length - 2];
    return last;
  }
  function headlineFor(t) {
    var piece = t.headline_piece;
    if (piece && piece.name) {
      var tpl = TEMPLATES[hashStr(t.id) % TEMPLATES.length];
      return tpl(lastName(piece.name));
    }
    var hasPlayers = (t.sides || []).some(function (s) {
      return (s.assets || []).some(function (a) { return a.kind === 'player'; });
    });
    return hasPlayers ? 'Deal struck.' : 'Picks swap hands.';
  }
  function dekFor(t) {
    var names = sideNames(t);
    var when = t.week != null ? 'Week ' + t.week : 'the offseason';
    if (names.length === 2) {
      return names[0] + ' and ' + names[1] + ' shake on it in ' + when + '.';
    }
    return names.join(', ') + ' close a ' + names.length + '-team deal in ' + when + '.';
  }
  // Telegram variant rewrites the headline in clipped wire-operator
  // voice: short declaratives, like the machine typed it.
  function telegramHeadlineFor(t) {
    var piece = t.headline_piece;
    var base = piece && piece.name ? lastName(piece.name) + ' traded.' : 'Deal struck.';
    return base + ' Terms agreed. Grades to follow.';
  }
  function verdictHeadlineFor(t) {
    var piece = t.headline_piece;
    if (piece && piece.name) {
      var n = lastName(piece.name);
      var tpls = [
        'Four weeks on, the ' + n + ' deal gets its ruling.',
        'The ' + n + ' deal, revisited.',
        'Ruling filed on the ' + n + ' trade.',
      ];
      return tpls[hashStr(t.id) % tpls.length];
    }
    return 'The four-week ruling is in.';
  }

  // ── Shared bulletin pieces ─────────────────────────────────────────────
  // Asset rows and side headers carry the .rv class so a sealed dispatch
  // can reveal them piece by piece; outside .opening the class is inert.
  function renderAsset(a) {
    if (a.kind === 'player') {
      // rank_now is refreshed daily by the grading cron, so it reads as
      // "where they sit in the points race today". When the at-trade rank
      // differs, show the drift; otherwise a single current chip.
      var rank = '';
      if (a.rank_now && a.rank_at_trade && a.rank_now !== a.rank_at_trade) {
        rank = '<span class="rk"><span class="then">' + escapeHtml(a.rank_at_trade) + '</span>' + escapeHtml(a.rank_now) + '</span>';
      } else if (a.rank_now || a.rank_at_trade) {
        rank = '<span class="rk">' + escapeHtml(a.rank_now || a.rank_at_trade) + '</span>';
      }
      return '<div class="bl-asset rv">' +
        '<span class="pos">' + escapeHtml(a.position || '?') + '</span>' +
        '<span class="nm">' + escapeHtml(a.name || ('Player ' + (a.player_id || ''))) + '</span>' +
        (a.team ? '<span class="tm">' + escapeHtml(a.team) + '</span>' : '') +
        rank +
      '</div>';
    }
    if (a.kind === 'pick') {
      return '<div class="bl-asset rv"><span class="pos">PK</span><span class="nm">' +
        escapeHtml(a.season_year + ' ' + ordinal(a.round) + ' round') + '</span></div>';
    }
    if (a.kind === 'faab') {
      return '<div class="bl-asset rv"><span class="pos">$</span><span class="nm">' +
        escapeHtml('$' + a.amount + ' FAAB') + '</span></div>';
    }
    return '';
  }

  // Grade stamp. Rendered ONLY when a grade exists and its embargo has
  // passed — an ungraded or still-embargoed side shows nothing rather
  // than a placeholder.
  function renderStamp(s) {
    var g = s.grade;
    if (!g) return '';
    var revisit = s.revisit_grade && s.revisit_grade !== g
      ? '<span class="re ' + gradeClass(s.revisit_grade) + '">' + escapeHtml(s.revisit_grade) + '</span>'
      : '';
    return '<span class="bl-stamp ' + gradeClass(g) + '"><span class="g">' + escapeHtml(g) + '</span>' + revisit + '</span>';
  }

  function renderSide(s, held) {
    var assets = (s.assets || []).map(renderAsset).join('') ||
      '<div class="bl-asset rv"><span class="nm" style="color:var(--ink-faint);font-style:italic;">Nothing received</span></div>';
    var avatar = s.manager.avatar_url
      ? '<img class="bl-side-avatar" src="' + escapeHtml(s.manager.avatar_url) + '" alt="">'
      : '<span class="bl-side-avatar" aria-hidden="true"></span>';
    var team = s.manager.team_name && s.manager.team_name !== s.manager.display_name
      ? '<div class="bl-side-team">' + escapeHtml(s.manager.display_name) + '</div>'
      : '';
    return '<div class="bl-side">' +
      (held ? '' : renderStamp(s)) +
      '<div class="bl-side-head rv">' + avatar +
        '<div><div class="bl-side-name">' + escapeHtml(s.manager.team_name || s.manager.display_name) + '</div>' + team + '</div>' +
      '</div>' +
      '<div class="bl-side-label rv">Receives</div>' +
      '<div class="bl-assets">' + assets + '</div>' +
    '</div>';
  }

  function renderSides(t, held) {
    return (t.sides || []).map(function (s) { return renderSide(s, held); }).join('');
  }

  var FRESH_MS = 7 * 24 * 60 * 60 * 1000;
  function isFresh(t) { return Date.now() - Date.parse(t.executed_at) < FRESH_MS; }

  // Live countdown to the grade drop. The ticker updates .clock every
  // second and re-renders the wire when one runs out.
  function renderTimer(t) {
    var end = embargoEnd(t);
    return '<div class="bl-timer" data-embargo="' + end + '">' +
      '<span class="lbl">Grades under review</span>' +
      '<span class="clock">' + fmtClock(end - Date.now()) + '</span>' +
      '<span class="note">The desk has the tape. Marks print when the clock runs out.</span>' +
    '</div>';
  }

  // Every card is a page of the paper — folio line at the foot.
  function renderFolio(t, pageNo) {
    var edition = t.week != null ? 'Week ' + t.week + ' edition' : 'Offseason edition';
    return '<div class="bl-folio">' +
      '<span>The Transaction Times</span>' +
      '<span>' + escapeHtml(edition) + '</span>' +
      '<span>' + escapeHtml(pageNo) + '</span>' +
    '</div>';
  }

  // ── The front page — deal of the season ────────────────────────────────
  function renderFrontPage(t, year) {
    var dc = window.__DC || {};
    var leagueName = (dc.name || 'The League').toUpperCase();
    var held = gradesHeld(t);
    var copy;
    if (held) {
      copy = renderTimer(t);
    } else if (t.ai_summary) {
      copy = '<p class="fp-copy">' + escapeHtml(t.ai_summary) + '</p>';
    } else {
      copy = '<p class="fp-copy pending">Wire copy to follow. The desk grades every new deal on its next pass; this one is still in the machine.</p>';
    }
    return '<article class="fp" id="fp">' +
      '<span class="fp-tag">Deal of the season</span>' +
      '<div class="fp-masthead">' +
        '<div class="fp-masthead-top">' +
          '<span>' + escapeHtml(leagueName) + '</span>' +
          '<span>' + escapeHtml(fmtDate(t.executed_at, true)) + '</span>' +
        '</div>' +
        '<div class="fp-masthead-name">The Transaction Times</div>' +
      '</div>' +
      '<div class="fp-edition">' +
        '<span class="siren">Special edition</span>' +
        '<span>Vol. ' + escapeHtml(String(year)) + '</span>' +
        '<span>' + (t.week != null ? 'Week ' + escapeHtml(String(t.week)) : 'Offseason') + '</span>' +
      '</div>' +
      '<h2 class="fp-headline">' + escapeHtml(headlineFor(t)) + '</h2>' +
      '<p class="fp-dek">' + escapeHtml(dekFor(t)) + '</p>' +
      '<div class="bl-sides">' + renderSides(t, held) + '</div>' +
      copy +
      renderFolio(t, 'Page one') +
    '</article>';
  }

  // ── The verdict desk — rulings as their own bulletins ──────────────────
  function renderVerdictChange(s) {
    if (!s.grade) return '';
    var who = s.manager.team_name || s.manager.display_name;
    var grades;
    if (s.revisit_grade && s.revisit_grade !== s.grade) {
      grades = '<span class="gg ' + gradeClass(s.grade) + '">' + escapeHtml(s.grade) + '</span>' +
        '<span class="arrow">→</span>' +
        '<span class="gg ' + gradeClass(s.revisit_grade) + '">' + escapeHtml(s.revisit_grade) + '</span>';
    } else {
      grades = '<span class="gg ' + gradeClass(s.grade) + '">' + escapeHtml(s.grade) + '</span>' +
        '<span class="held">Grade held</span>';
    }
    return '<div class="vd-change"><span class="who">' + escapeHtml(who) + '</span>' + grades + '</div>';
  }

  // Rank drift per player: where they ranked when the deal was struck vs
  // where they sit now. Players with no rank data are skipped.
  function renderVerdictRanks(t) {
    var rows = [];
    (t.sides || []).forEach(function (s) {
      (s.assets || []).forEach(function (a) {
        if (a.kind !== 'player' || !a.name) return;
        if (a.rank_at_trade && a.rank_now) {
          var rr = a.rank_at_trade === a.rank_now
            ? escapeHtml(a.rank_now) + ' · held'
            : escapeHtml(a.rank_at_trade) + ' → ' + escapeHtml(a.rank_now);
          rows.push('<span class="vd-rank"><span class="nm">' + escapeHtml(a.name) + '</span><span class="rr">' + rr + '</span></span>');
        } else if (a.rank_now) {
          rows.push('<span class="vd-rank"><span class="nm">' + escapeHtml(a.name) + '</span><span class="rr">now ' + escapeHtml(a.rank_now) + '</span></span>');
        }
      });
    });
    if (rows.length === 0) return '';
    return '<div class="vd-ranks"><span class="lbl">The tape · at the trade and now</span>' + rows.join('') + '</div>';
  }

  function renderVerdictBulletin(t) {
    var when = t.week != null ? 'the Week ' + t.week : 'the offseason';
    var dek = 'The desk pulls the tape on ' + when + ' deal between ' + joinNames(sideNames(t)) + '.';
    var filed = fmtDate(t.revisited_at, true);
    return '<article class="bl bl--vd">' +
      '<div class="bl-paper">' +
        '<div class="bl-bar">' +
          '<span class="dot" aria-hidden="true"></span>' +
          '<span>The verdict desk</span>' +
          '<span class="spacer"><span class="when">' + (filed ? 'Ruling filed ' + escapeHtml(filed) : 'Ruling filed') + '</span></span>' +
        '</div>' +
        '<div class="bl-head">' +
          '<h2 class="bl-headline">' + escapeHtml(verdictHeadlineFor(t)) + '</h2>' +
          '<p class="bl-dek">' + escapeHtml(dek) + '</p>' +
        '</div>' +
        '<div class="vd-changes">' + (t.sides || []).map(renderVerdictChange).join('') + '</div>' +
        renderVerdictRanks(t) +
        '<div class="bl-copy"><span class="lbl">The ruling · four weeks later</span>' + escapeHtml(t.revisit_summary || '') + '</div>' +
      '</div>' +
    '</article>';
  }

  // ── Sealed dispatch cover ──────────────────────────────────────────────
  function renderCover(t, mag) {
    var sup = 'Sealed dispatch' + (mag === 'block' ? ' · special bulletin inside' : '');
    var line = joinNames(sideNames(t)) + ' have made a deal.';
    var when = (t.week != null ? 'Week ' + t.week : 'Offseason') + ' · ' + fmtDate(t.executed_at);
    return '<div class="bl-cover">' +
      '<div class="bl-cover-sup">' + escapeHtml(sup) + '</div>' +
      '<div class="bl-seal" aria-hidden="true">✦</div>' +
      '<div class="bl-cover-line">' + escapeHtml(line) + '</div>' +
      '<div class="bl-cover-when">' + escapeHtml(when) + '</div>' +
      '<button type="button" class="bl-break" data-break>Break the seal</button>' +
    '</div>';
  }

  // ── Wire bulletins ─────────────────────────────────────────────────────
  function renderBulletin(t, pageNo) {
    var mag = t.magnitude === 'blockbuster' ? 'block'
            : t.magnitude === 'depth' ? 'depth'
            : 'head';
    // Headline-tier deals alternate paper/telegram by hash so neighboring
    // cards never look identical.
    var telegram = mag === 'head' && (hashStr(t.id) & 4) !== 0;
    var sealed = isSealed(t);
    var held = gradesHeld(t);
    // A sealed scrap reveals open; only an unsealed depth move starts folded.
    var folded = mag === 'depth' && !sealed;
    var cls = 'bl bl--' + mag + (telegram ? ' bl--tg' : '') + (sealed ? ' bl--sealed' : '');

    var barLabel = mag === 'block' ? 'Special bulletin'
                 : mag === 'depth' ? 'Minor move'
                 : telegram ? 'Incoming telegram'
                 : 'Trade bulletin';
    var when = fmtDate(t.executed_at);
    var headline = telegram ? telegramHeadlineFor(t) : headlineFor(t);

    // The summary rides in a .txt span so a sealed reveal can type it out.
    var copy;
    if (held) {
      copy = renderTimer(t);
    } else if (t.ai_summary) {
      copy = '<div class="bl-copy"><span class="lbl">Wire copy · the grade explained</span><span class="txt">' + escapeHtml(t.ai_summary) + '</span></div>';
    } else {
      copy = '<div class="bl-copy pending"><span class="lbl">Wire copy</span>Grade pending. New deals are marked up on the next pass of the desk.</div>';
    }
    var more = mag === 'depth'
      ? '<button type="button" class="bl-more" data-more>' + (folded ? 'Unfold the scrap ▾' : 'Fold it back ▴') + '</button>'
      : '';

    var paper =
      '<div class="bl-paper">' +
        '<div class="bl-bar rv">' +
          (mag === 'depth' || telegram ? '' : '<span class="dot" aria-hidden="true"></span>') +
          '<span>' + barLabel + '</span>' +
          '<span class="spacer">' +
            (isFresh(t) ? '<span class="bl-fresh">Just in</span>' : '') +
            '<span class="when">' + escapeHtml(when) + '</span>' +
          '</span>' +
        '</div>' +
        '<div class="bl-head rv">' +
          '<h2 class="bl-headline">' + escapeHtml(headline) + '</h2>' +
          '<p class="bl-dek">' + escapeHtml(dekFor(t)) + '</p>' +
        '</div>' +
        '<div class="bl-sides">' + renderSides(t, held) + '</div>' +
        copy + more +
        renderFolio(t, 'Page ' + pageNo) +
      '</div>';

    return '<article class="' + cls + '" data-trade-id="' + escapeHtml(t.id) + '" data-open="' + (folded ? 'false' : 'true') + '">' +
      (sealed ? renderCover(t, mag) : '') +
      '<div class="bl-inner">' + paper + '</div>' +
    '</article>';
  }

  // ── Season plumbing ────────────────────────────────────────────────────
  // Two tabs: 'wire' (the season feed) and 'verdicts' (every four-week
  // ruling ever, newest first — its own room so rulings don't get lost
  // under old trades). The year picker only applies to the wire.
  var state = { all: [], verdicts: [], allVerdicts: [], year: null, tab: 'wire' };

  function yearsAvailable() {
    var seen = {};
    state.all.forEach(function (t) { seen[t.season_year] = (seen[t.season_year] || 0) + 1; });
    return Object.keys(seen).map(Number).sort(function (a, b) { return b - a; })
      .map(function (y) { return { year: y, count: seen[y] }; });
  }

  // "Live" is the newest season with trades; older years show as numbers,
  // matching the Analyzer's quiet picker.
  function renderYearSelect() {
    var ys = yearsAvailable();
    if (ys.length === 0) { yearSel.parentElement.hidden = true; return; }
    yearSel.parentElement.hidden = false;
    yearSel.innerHTML = ys.map(function (y, i) {
      return '<option value="' + y.year + '"' + (y.year === state.year ? ' selected' : '') + '>' +
        (i === 0 ? 'Live' : y.year) + '</option>';
    }).join('');
  }

  // Deal of the season: best magnitude first, printed-grade preferred
  // (a grade still under embargo doesn't count yet), then the bigger date
  // wins — so a newer deal of equal or greater weight takes the front
  // page the moment it lands. A still-sealed dispatch never takes the
  // page (that would spoil its own reveal); it gets promoted on the first
  // load after the seal is broken or expires.
  var MAG_RANK = { blockbuster: 0, headline: 1, depth: 2 };
  function pickFrontPage(trades) {
    if (trades.length < 2) return null;   // one trade = it IS the wire; no split
    var pool = trades.filter(function (t) { return !isSealed(t); });
    var best = null;
    pool.forEach(function (t) {
      if (!best) { best = t; return; }
      var a = MAG_RANK[t.magnitude] != null ? MAG_RANK[t.magnitude] : 1;
      var b = MAG_RANK[best.magnitude] != null ? MAG_RANK[best.magnitude] : 1;
      if (a !== b) { if (a < b) best = t; return; }
      var ag = t.ai_summary && !gradesHeld(t) ? 0 : 1;
      var bg = best.ai_summary && !gradesHeld(best) ? 0 : 1;
      if (ag !== bg) { if (ag < bg) best = t; return; }
      if (Date.parse(t.executed_at) > Date.parse(best.executed_at)) best = t;
    });
    return best;
  }

  function weekLabel(t) {
    return t.week != null ? 'Week ' + t.week : 'Offseason';
  }

  function renderFeed() {
    // Week groups first (late weeks at the top, offseason at the bottom),
    // newest deal first within a week — so each week appears exactly once
    // on the rail even when executed_at timestamps interleave.
    var trades = state.all
      .filter(function (t) { return t.season_year === state.year; })
      .sort(function (a, b) {
        var wa = a.week != null ? a.week : -1;
        var wb = b.week != null ? b.week : -1;
        if (wa !== wb) return wb - wa;
        return Date.parse(b.executed_at) - Date.parse(a.executed_at);
      });

    var graded = trades.filter(function (t) { return t.ai_summary; }).length;
    metaEl.hidden = false;
    metaEl.textContent = trades.length + ' trade' + (trades.length === 1 ? '' : 's') + ' on the ' +
      state.year + ' wire · ' + graded + ' graded';

    if (trades.length === 0) {
      content.innerHTML = '<div class="wire-empty"><h2>The wire is quiet.</h2>' +
        '<p>No trades on record for ' + state.year + '. The moment one clears, it gets announced here.</p></div>';
      return;
    }

    var ys = yearsAvailable();
    var isCurrent = ys.length > 0 && state.year === ys[0].year;
    var archiveNote = '';
    if (!isCurrent && graded === 0) {
      archiveNote = '<div class="wire-meta" style="margin:1.6rem 0 0;">' +
        'Archive season · deals made before this league joined the wire carry no grades</div>';
    }

    var front = pickFrontPage(trades);
    var rest = front ? trades.filter(function (t) { return t.id !== front.id; }) : trades;

    // Fresh rulings pin near the top — only on the live wire, and only
    // while the revisit is under 7 days old (the server does the windowing).
    var deskHtml = '';
    if (isCurrent && state.verdicts.length > 0) {
      deskHtml = '<div class="wire-feed wire-feed--desk">' +
        '<div class="wk-divider wk-divider--vd"><span class="wk-chip">The verdict desk</span>' +
        '<span class="wk-count">Rulings just in</span></div>' +
        state.verdicts.map(renderVerdictBulletin).join('') +
      '</div>';
    }

    // Week editions: chip + deal count + rule between groups, cards
    // numbered as pages of the paper (front page is page one).
    var counts = {};
    rest.forEach(function (t) { var k = weekLabel(t); counts[k] = (counts[k] || 0) + 1; });

    var html = '';
    var lastWeekKey = null;
    var pageNo = 2;
    rest.forEach(function (t) {
      var wk = weekLabel(t);
      if (wk !== lastWeekKey) {
        var n = counts[wk];
        html += '<div class="wk-divider"><span class="wk-chip">' + escapeHtml(wk) + '</span>' +
          '<span class="wk-count">' + n + ' deal' + (n === 1 ? '' : 's') + '</span></div>';
        lastWeekKey = wk;
      }
      html += renderBulletin(t, pageNo);
      pageNo += 1;
    });
    html += '<div class="wire-end">End of the ' + escapeHtml(String(state.year)) + ' wire</div>';

    content.innerHTML =
      archiveNote +
      (front ? renderFrontPage(front, state.year) : '') +
      deskHtml +
      '<div class="wire-feed">' + html + '</div>';
    observeReveals();
    startTicker();
  }

  // ── The verdicts tab — every ruling on file ────────────────────────────
  function renderVerdictsTab() {
    yearSel.parentElement.hidden = true;
    var vs = state.allVerdicts;
    metaEl.hidden = false;
    metaEl.textContent = vs.length + ' ruling' + (vs.length === 1 ? '' : 's') + ' on file';

    if (vs.length === 0) {
      content.innerHTML = '<div class="wire-empty"><h2>No rulings yet.</h2>' +
        '<p>The desk revisits every graded deal four weeks after it clears. The first ruling lands here.</p></div>';
      return;
    }

    // Grouped by season, newest ruling first (server order).
    var counts = {};
    vs.forEach(function (t) { counts[t.season_year] = (counts[t.season_year] || 0) + 1; });
    var html = '';
    var lastYear = null;
    vs.forEach(function (t) {
      if (t.season_year !== lastYear) {
        var n = counts[t.season_year];
        html += '<div class="wk-divider wk-divider--vd"><span class="wk-chip">' + escapeHtml(String(t.season_year)) + '</span>' +
          '<span class="wk-count">' + n + ' ruling' + (n === 1 ? '' : 's') + '</span></div>';
        lastYear = t.season_year;
      }
      html += renderVerdictBulletin(t);
    });

    content.innerHTML = '<div class="wire-feed wire-feed--desk">' + html + '</div>';
    observeReveals();
  }

  function render() {
    if (state.tab === 'verdicts') { renderVerdictsTab(); return; }
    renderYearSelect();
    renderFeed();
  }

  function setYear(y) {
    state.year = y;
    render();
  }

  function setTab(tab) {
    if (tab === state.tab) return;
    state.tab = tab;
    if (tabsEl) {
      tabsEl.querySelectorAll('.wire-tab').forEach(function (b) {
        b.classList.toggle('is-on', b.getAttribute('data-tab') === tab);
      });
    }
    render();
  }

  // ── Reveal observer ────────────────────────────────────────────────────
  function observeReveals() {
    var cards = content.querySelectorAll('.bl, .fp');
    if (!('IntersectionObserver' in window)) {
      cards.forEach(function (c) { c.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    cards.forEach(function (c) { io.observe(c); });
  }

  // ── The grade-drop ticker ──────────────────────────────────────────────
  // One interval for every countdown on the page. When a clock runs out
  // the wire re-renders, so the stamps print (and slam in) live.
  var tickerId = null;
  function startTicker() {
    if (tickerId) { clearInterval(tickerId); tickerId = null; }
    if (!content.querySelector('[data-embargo]')) return;
    tickerId = setInterval(function () {
      var expired = false;
      content.querySelectorAll('[data-embargo]').forEach(function (el) {
        var left = Number(el.getAttribute('data-embargo')) - Date.now();
        if (left <= 0) { expired = true; return; }
        var clock = el.querySelector('.clock');
        if (clock) clock.textContent = fmtClock(left);
      });
      if (expired) {
        clearInterval(tickerId); tickerId = null;
        render();
      }
    }, 1000);
  }

  // ── Breaking a seal — the staged reveal ────────────────────────────────
  // Cover lifts, then the reveal runs in dramatic order:
  //   1. the bar and headline
  //   2. the manager names, both sides
  //   3. the packages, one asset at a time, alternating sides
  //   4. the wire copy, typed out like it's coming off the machine
  //   5. the grade stamps slam LAST
  // Reduced-motion readers get everything at once via CSS (and no typing).
  var REVEAL_BASE = 0.5;   // s before the first row
  var REVEAL_STEP = 0.32;  // s between rows

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Type the wire copy into its .txt span, then call done. The whole
  // write-up lands in ~2-4.5s regardless of length.
  function typeCopy(card, done) {
    card.classList.add('copy-go');
    var txt = card.querySelector('.bl-copy .txt');
    if (!txt || reducedMotion()) { done(); return; }
    var full = txt.textContent;
    txt.textContent = '';
    txt.classList.add('typing');
    var totalMs = Math.min(15000, Math.max(5000, full.length * 28));
    var stepMs = 30;
    var per = Math.max(1, Math.round(full.length / (totalMs / stepMs)));
    var i = 0;
    var iv = setInterval(function () {
      i += per;
      txt.textContent = full.slice(0, i);
      if (i >= full.length) {
        clearInterval(iv);
        txt.classList.remove('typing');
        txt.textContent = full;
        done();
      }
    }, stepMs);
  }

  function breakSeal(card) {
    var id = card.getAttribute('data-trade-id');
    if (id && !forceReveal) { seen[id] = Date.now(); saveSeen(seen); }

    card.classList.add('opening', 'is-in');

    // Build the reveal order by hand rather than document order.
    var ordered = [];
    card.querySelectorAll('.bl-bar, .bl-head').forEach(function (el) { ordered.push(el); });
    var sides = card.querySelectorAll('.bl-side');
    sides.forEach(function (s) {
      var h = s.querySelector('.bl-side-head');
      if (h) ordered.push(h);
    });
    sides.forEach(function (s) {
      var l = s.querySelector('.bl-side-label');
      if (l) ordered.push(l);
    });
    var lists = [];
    sides.forEach(function (s) {
      lists.push(Array.prototype.slice.call(s.querySelectorAll('.bl-asset')));
    });
    var maxLen = lists.reduce(function (m, l) { return Math.max(m, l.length); }, 0);
    for (var i = 0; i < maxLen; i++) {
      lists.forEach(function (l) { if (l[i]) ordered.push(l[i]); });
    }

    ordered.forEach(function (el, idx) {
      el.style.transitionDelay = (REVEAL_BASE + idx * REVEAL_STEP).toFixed(2) + 's';
    });
    void card.offsetWidth;   // let the delay styles land before the flip
    requestAnimationFrame(function () { card.classList.add('rv-go'); });

    var rowsDone = (REVEAL_BASE + ordered.length * REVEAL_STEP) * 1000 + 500;
    if (reducedMotion()) rowsDone = 0;
    setTimeout(function () {
      typeCopy(card, function () {
        setTimeout(function () { card.classList.add('stamps-go'); }, 450);
      });
    }, rowsDone);
  }

  // ── Events ─────────────────────────────────────────────────────────────
  yearSel.addEventListener('change', function () {
    var y = Number(yearSel.value);
    if (y && y !== state.year) setYear(y);
  });

  if (tabsEl) {
    tabsEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-tab]') : null;
      if (btn) setTab(btn.getAttribute('data-tab'));
    });
  }

  content.addEventListener('click', function (e) {
    var closest = function (sel) { return e.target.closest ? e.target.closest(sel) : null; };

    var breakBtn = closest('[data-break]');
    if (breakBtn) {
      var sealedCard = breakBtn.closest('.bl');
      if (sealedCard) breakSeal(sealedCard);
      return;
    }

    var moreBtn = closest('[data-more]');
    if (moreBtn) {
      var card = moreBtn.closest('.bl');
      if (!card) return;
      var open = card.getAttribute('data-open') === 'true';
      card.setAttribute('data-open', open ? 'false' : 'true');
      moreBtn.textContent = open ? 'Unfold the scrap ▾' : 'Fold it back ▴';
    }
  });

  // ── States ─────────────────────────────────────────────────────────────
  function showEmpty(title, sub, cta) {
    yearSel.parentElement.hidden = true; metaEl.hidden = true;
    if (tabsEl) tabsEl.hidden = true;
    content.innerHTML = '<div class="wire-empty"><h2>' + escapeHtml(title) + '</h2>' +
      '<p>' + escapeHtml(sub) + '</p>' + (cta || '') + '</div>';
  }

  // ── Boot ───────────────────────────────────────────────────────────────
  async function boot() {
    try {
      var res = await fetch('live/trades/data', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();

      if (data.status === 'no-league') return showEmpty('League not found', 'Check the URL and try again.');
      if (data.status === 'tier-locked') {
        return showEmpty(
          'The wire is a Veteran feature.',
          'Announced, graded, and revisited trades unlock when this league’s commissioner is on the Veteran plan.',
          '<a class="wire-lock-cta" href="/pricing">See Veteran plan</a>'
        );
      }
      if (data.status === 'no-trades') {
        return showEmpty('The wire is quiet.', 'The moment a trade clears on your platform, it gets announced here like it shook the whole league.');
      }

      state.all = (data.current_trades || []).concat(data.past_trades || []);
      state.verdicts = data.current_verdicts || [];
      state.allVerdicts = data.all_verdicts || [];
      var ys = yearsAvailable();
      if (ys.length === 0) return showEmpty('The wire is quiet.', 'No completed trades on record yet.');
      if (tabsEl) tabsEl.hidden = false;
      setYear(ys[0].year);
    } catch (e) {
      console.error(e);
      showEmpty('Wire trouble.', 'Couldn’t load trades: ' + (e && e.message ? e.message : e));
    }
  }

  boot();
})();
