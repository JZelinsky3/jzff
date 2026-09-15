// weekly.js — The Weekly.
//
// One page you send into the league chat on Tuesday and people re-open on
// Thursday. Everything comes from a single composed endpoint
// (/leagues/<slug>/live/weekly/data — see src/lib/weekly.ts); this file is
// only identity + rendering.
//
// Identity is the same no-login profile dropdown pick'ems uses, and it
// deliberately shares pick'ems' localStorage key: claim your name on either
// page and the other one already knows you.

(function () {
  'use strict';

  var SLUG = (window.__DC && window.__DC.slug) || '';
  var USER_KEY = 'dc_pickems_user_' + SLUG;

  var state = { data: null, user: null };

  function byId(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function show(el, on) { if (el) el.hidden = !on; }

  boot();

  function boot() {
    initShare();
    // Trailing slash is the canonical form (next.config trailingSlash) —
    // without it every load eats a 308 before the data arrives.
    fetch('live/weekly/data/', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (data) {
        if (!data) return offSeason('The wire is quiet', 'This week’s digest couldn’t be loaded. Try again in a minute.');
        if (data.status === 'no-live') {
          return offSeason('No season running', 'The Weekly fills up once the commissioner opens a live season. Until then the almanac is the place to be.');
        }
        if (data.status === 'no-week') {
          return offSeason('Week not open yet', 'The ' + esc(data.year) + ' season is live, but no week has been opened. Check back once it is.');
        }
        if (data.status !== 'ok') {
          return offSeason('Nothing to report', 'No digest is available for this league yet.');
        }
        state.data = data;
        restoreUser();
        renderMasthead();
        initIdentity();
        renderAll();
      });
  }

  // Replaces the whole body with a single calm card. Used for every state
  // where there is genuinely nothing to check this week.
  function offSeason(title, body) {
    var el = byId('wkBody');
    if (!el) return;
    el.innerHTML =
      '<div class="wk-sec"><div class="wk-panel"><div class="wk-claim">' +
        '<div class="wk-claim-title">' + esc(title) + '</div>' +
        '<div class="wk-claim-body">' + esc(body) + '</div>' +
      '</div></div></div>';
    show(byId('wkId'), false);
  }

  // ── Masthead ─────────────────────────────────────────────────────────

  function renderMasthead() {
    var d = state.data;
    var sup = byId('wkSup');
    if (sup) {
      sup.textContent = '★ Week ' + d.week + ' · ' + d.year + ' ★';
    }
    var left = byId('wkDateLeft');
    if (left) left.textContent = 'Updated ' + shortStamp(d.generatedAt);

    var right = byId('wkDateRight');
    if (right && d.picks) {
      var dl = deadline(d.picks);
      right.textContent = dl.text;
      right.className = 'dateline-right' + (dl.hot ? ' hot' : '');
    }
  }

  function shortStamp(iso) {
    var t = Date.parse(iso);
    if (!isFinite(t)) return '·';
    var d = new Date(t);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' +
      d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  // Deadline copy for the masthead + the pick'ems duty row. Goes hot inside
  // 24 hours, which is the only window where the wording changes behaviour.
  function deadline(picks) {
    if (picks.locked) return { text: 'Picks locked', hot: false, past: true };
    if (!picks.locksAt) return { text: 'No deadline set', hot: false, past: false };
    var ms = Date.parse(picks.locksAt) - Date.now();
    if (!isFinite(ms)) return { text: '', hot: false, past: false };
    if (ms <= 0) return { text: 'Picks locked', hot: false, past: true };

    var when = new Date(picks.locksAt);
    var stamp = when.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' +
      when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    var hours = ms / 3600000;
    if (hours < 1)  return { text: 'Locks in ' + Math.max(1, Math.round(ms / 60000)) + ' min', hot: true, past: false };
    if (hours < 24) return { text: 'Locks in ' + Math.round(hours) + 'h · ' + stamp, hot: true, past: false };
    return { text: 'Locks ' + stamp, hot: false, past: false };
  }

  // ── Identity ─────────────────────────────────────────────────────────

  function restoreUser() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) {}
    if (!saved || !saved.profileId) return;
    var match = find(state.data.profiles, function (p) { return p.profileId === saved.profileId; });
    if (match) state.user = match;
  }

  function initIdentity() {
    var sel = byId('wkSelect');
    var profiles = state.data.profiles || [];
    if (sel) {
      sel.innerHTML = '<option value="">— pick your name —</option>' +
        profiles.map(function (p) {
          return '<option value="' + esc(p.profileId) + '">' + esc(p.name) + '</option>';
        }).join('');
      sel.addEventListener('change', function () {
        setUser(find(profiles, function (p) { return p.profileId === sel.value; }) || null);
      });
    }
    var change = byId('wkChange');
    if (change) change.addEventListener('click', function () { setUser(null); });
    updateIdentity();
  }

  function setUser(profile) {
    state.user = profile;
    // Write the pick'ems shape, not ours — pickems.js reads the same key and
    // only understands { profileId, name, teamId }.
    if (profile) {
      localStorage.setItem(USER_KEY, JSON.stringify({
        profileId: profile.profileId, name: profile.name, teamId: profile.managerId,
      }));
    } else {
      localStorage.removeItem(USER_KEY);
    }
    updateIdentity();
    renderAll();
  }

  function updateIdentity() {
    var claimed = !!state.user;
    var sel = byId('wkSelect');
    if (sel) { sel.hidden = claimed; sel.value = claimed ? state.user.profileId : ''; }
    var nameEl = byId('wkWhoamiName');
    show(nameEl, claimed);
    show(byId('wkChange'), claimed);
    if (claimed && nameEl) nameEl.textContent = state.user.name;
  }

  function find(arr, fn) {
    for (var i = 0; i < (arr || []).length; i++) if (fn(arr[i])) return arr[i];
    return null;
  }

  // ── Render ───────────────────────────────────────────────────────────

  function renderAll() {
    renderYourWeek();
    renderBoard();
    renderPower();
    renderWire();
    renderRecordRoom();
  }

  function sectionHTML(num, title, titleEm, link, linkLabel, body) {
    return '<section class="wk-sec">' +
      '<div class="wk-sec-head">' +
        '<span class="wk-sec-num">' + esc(num) + '</span>' +
        '<span class="wk-sec-title">' + esc(title) + ' <em>' + esc(titleEm) + '</em></span>' +
        '<span class="wk-sec-rule"></span>' +
        (link ? '<a class="wk-sec-link" href="' + esc(link) + '">' + esc(linkLabel) + '</a>' : '') +
      '</div>' + body +
    '</section>';
  }

  var CHEV = '<span class="wk-chev"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden>' +
    '<polyline points="9 5 16 12 9 19"/></svg></span>';

  function moveArrow(dir) {
    var path = dir > 0
      ? '<path d="M5 10.4V2.3"/><path d="M1.7 5.5 5 2.2l3.3 3.3"/>'
      : '<path d="M5 2.2v8.1"/><path d="M1.7 7 5 10.3 8.3 7"/>';
    return '<svg class="m-move-arrow" viewBox="0 0 10 12.5" width="7" height="9" fill="none" ' +
      'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden>' +
      path + '</svg>';
  }

  // ── §01 Your week ────────────────────────────────────────────────────

  function myGame() {
    var d = state.data;
    if (!state.user || !state.user.uid || !d.board) return null;
    for (var i = 0; i < d.board.games.length; i++) {
      var g = d.board.games[i];
      if (g.a.uid === state.user.uid) return { game: g, me: g.a, opp: g.b, side: 'a' };
      if (g.b.uid === state.user.uid) return { game: g, me: g.b, opp: g.a, side: 'b' };
    }
    return null;
  }

  function myRank() {
    var d = state.data;
    if (!state.user || !state.user.managerId || !d.power) return null;
    return find(d.power.rows, function (r) { return r.managerId === state.user.managerId; });
  }

  function dutyRow(state_, href, label, line, sub, subClass, val) {
    return '<a class="wk-duty" data-state="' + state_ + '" href="' + esc(href) + '">' +
      '<span class="wk-lamp" aria-hidden></span>' +
      '<span class="wk-duty-body">' +
        '<span class="wk-duty-lbl">' + esc(label) + '</span>' +
        '<span class="wk-duty-line">' + line + '</span>' +
        (sub ? '<span class="wk-duty-sub' + (subClass ? ' ' + subClass : '') + '">' + esc(sub) + '</span>' : '') +
      '</span>' +
      (val || '') + CHEV +
    '</a>';
  }

  function renderYourWeek() {
    var d = state.data;
    var slot = byId('secYou');
    if (!slot) return;

    if (!state.user) {
      slot.innerHTML = sectionHTML('§ 01', 'Your', 'week.', null, null,
        '<div class="wk-panel"><div class="wk-claim">' +
          '<div class="wk-claim-title">Who’s <em>reading?</em></div>' +
          '<div class="wk-claim-body">Pick your name up top and this turns into your week: ' +
            'your picks, your game, your rank. Nothing to sign in to — it’s remembered on this phone.</div>' +
        '</div></div>');
      return;
    }

    var rows = '';

    // Pick'ems.
    if (d.picks) {
      var dl = deadline(d.picks);
      var isIn = d.picks.submitted.indexOf(state.user.profileId) !== -1;
      var lamp = isIn ? 'done' : (dl.past ? 'idle' : 'todo');
      var line = isIn
        ? 'Your picks are <strong>in</strong> for week ' + d.week
        : (dl.past
            ? 'Week ' + d.week + ' locked — <strong>no picks on file</strong>'
            : 'You haven’t picked week ' + d.week + ' <strong>yet</strong>');
      rows += dutyRow(lamp, 'live/pickems/', 'Pick’ems', line, dl.text,
        dl.hot && !isIn ? 'hot' : (isIn ? 'good' : ''), null);
    }

    // Your matchup. The readout carries the line and which way it cuts; the
    // sub carries the opponent, so neither repeats the other.
    var mine = myGame();
    if (mine) {
      var favMe = (mine.game.favorite === mine.side);
      var pk = mine.game.favorite === 'pp' || mine.game.spread === 0;
      var mSub = mine.opp.record
        ? 'They’re ' + mine.opp.record + (mine.opp.ppg ? ' · ' + mine.opp.ppg.toFixed(1) + ' a game' : '')
        : '';
      var mVal = '<span class="wk-duty-val">' +
        (pk ? 'PK' : (favMe ? '−' : '+') + mine.game.spread.toFixed(1)) +
        '<small class="' + (pk ? '' : favMe ? 'up' : 'down') + '">' +
          (pk ? 'Even' : favMe ? 'Favoured' : 'Underdog') + '</small></span>';
      var href = 'live/matchup-preview/' + (state.user.uid ? '?m=' + encodeURIComponent(state.user.uid) : '');
      rows += dutyRow('idle', href, 'Your game',
        'vs <strong>' + esc(mine.opp.team) + '</strong>', mSub, '', mVal);
    }

    // Power ranking. Same split: the numeral is the rank, the line is who
    // you are on the board, the sub is the movement.
    var rank = myRank();
    if (rank) {
      var moveSub = rank.delta === 0
        ? 'No movement on the board'
        : rank.delta > 0
          ? 'Up ' + rank.delta + (rank.delta === 1 ? ' spot' : ' spots') + ' this week'
          : 'Down ' + Math.abs(rank.delta) + (rank.delta === -1 ? ' spot' : ' spots') + ' this week';
      var rVal = '<span class="wk-duty-val">' + rank.rank +
        '<small>of ' + d.power.rows.length + '</small></span>';
      rows += dutyRow('idle', 'live/powerrank/', 'Power ranking',
        '<strong>' + esc(rank.team) + '</strong> at ' + esc(rank.record),
        moveSub, rank.delta > 0 ? 'good' : rank.delta < 0 ? 'hot' : '', rVal);
    }

    if (!rows) {
      rows = '<div class="wk-empty">Nothing personal to report this week — ' +
        'your name isn’t attached to a team in the live season yet.</div>';
    }

    // Pool progress line.
    var pool = '';
    if (d.picks && d.picks.total > 0) {
      var n = d.picks.submitted.length, total = d.picks.total;
      pool = '<div class="wk-pool">' +
        '<span>The pool</span>' +
        '<span class="wk-pool-track"><span class="wk-pool-fill" style="width:' +
          Math.round((n / total) * 100) + '%"></span></span>' +
        '<span class="wk-pool-val">' + n + '/' + total + ' in</span>' +
      '</div>';
    }

    slot.innerHTML = sectionHTML('§ 01', 'Your', 'week.', null, null,
      '<div class="wk-panel">' + rows + pool + '</div>');
  }

  // ── §02 The board ────────────────────────────────────────────────────

  function renderBoard() {
    var d = state.data;
    var slot = byId('secBoard');
    if (!slot) return;

    if (!d.board || !d.board.games.length) {
      slot.innerHTML = sectionHTML('§ 02', 'The', 'board.', 'live/matchup-preview/', 'Full preview',
        '<div class="wk-panel"><div class="wk-empty">No games scheduled for this week yet.</div></div>');
      return;
    }

    var myUid = state.user ? state.user.uid : null;
    var rows = d.board.games.map(function (g) {
      var mine = myUid && (g.a.uid === myUid || g.b.uid === myUid);
      var pk = g.favorite === 'pp' || g.spread === 0;
      // Short tokens on purpose — this sits in the narrow middle column
      // between two team names that both need the room.
      var tag = mine ? '<span class="wk-game-tag mine">★ Yours</span>'
        : g.gotw ? '<span class="wk-game-tag">★ GOTW</span>' : '';
      var href = 'live/matchup-preview/' + (g.a.uid ? '?m=' + encodeURIComponent(g.a.uid) : '');
      return '<a class="wk-game' + (mine ? ' is-mine' : g.gotw ? ' is-gotw' : '') + '" href="' + esc(href) + '">' +
        team(g.a, g.favorite === 'a', false) +
        '<span class="wk-game-mid">' +
          '<span class="wk-game-spread">' + (pk ? 'PK' : g.spread.toFixed(1)) + '</span>' +
          tag +
        '</span>' +
        team(g.b, g.favorite === 'b', true) +
      '</a>';
    }).join('');

    slot.innerHTML = sectionHTML('§ 02', 'The', 'board.', 'live/matchup-preview/', 'Full preview',
      '<div class="wk-panel">' + rows + '</div>');
  }

  function team(s, fav, right) {
    return '<span class="wk-game-team' + (right ? ' right' : '') + '">' +
      '<span class="wk-game-name' + (fav ? ' fav' : '') + '">' + esc(s.team) + '</span>' +
      '<span class="wk-game-rec">' + esc(s.record || '·') +
        (s.ppg ? ' · ' + s.ppg.toFixed(1) : '') + '</span>' +
    '</span>';
  }

  // ── §03 The pecking order ────────────────────────────────────────────

  function renderPower() {
    var d = state.data;
    var slot = byId('secPower');
    if (!slot) return;

    if (!d.power || !d.power.rows.length) {
      slot.innerHTML = sectionHTML('§ 03', 'The pecking', 'order.', 'live/powerrank/', 'Full board',
        '<div class="wk-panel"><div class="wk-empty">The board hasn’t been scored yet this season.</div></div>');
      return;
    }

    var myId = state.user ? state.user.managerId : null;
    // Top five, plus the reader's own row when it sits below the cut, so
    // nobody has to open the full board to find themselves.
    var shown = d.power.rows.slice(0, 5);
    var me = myId ? find(d.power.rows, function (r) { return r.managerId === myId; }) : null;
    if (me && me.rank > 5) shown = shown.concat([me]);

    var rows = shown.map(function (r) {
      var cls = r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : 'same';
      var delta = r.delta === 0 ? '·'
        : moveArrow(r.delta) + Math.abs(r.delta);
      return '<div class="wk-rank' + (myId && r.managerId === myId ? ' is-mine' : '') + '">' +
        '<span class="wk-rank-num">' + r.rank + '</span>' +
        '<span class="wk-rank-name">' + esc(r.team) + '<small>' + esc(r.manager) + '</small></span>' +
        '<span class="wk-rank-rec">' + esc(r.record) + '</span>' +
        '<span class="wk-rank-delta ' + cls + '">' + delta + '</span>' +
      '</div>';
    }).join('');

    var movers = '';
    if (d.power.riser || d.power.faller) {
      movers = '<div class="wk-movers">' +
        moverCell('Biggest riser', d.power.riser, 'up') +
        moverCell('Biggest fall', d.power.faller, 'down') +
      '</div>';
    }

    slot.innerHTML = sectionHTML('§ 03', 'The pecking', 'order.', 'live/powerrank/', 'Full board',
      '<div class="wk-panel">' + rows + movers + '</div>');
  }

  function moverCell(label, row, dir) {
    if (!row) {
      return '<div class="wk-mover"><span class="wk-mover-lbl">' + esc(label) + '</span>' +
        '<span class="wk-mover-name">—</span></div>';
    }
    return '<div class="wk-mover">' +
      '<span class="wk-mover-lbl">' + esc(label) + '</span>' +
      '<span class="wk-mover-name">' + esc(row.team) + '</span>' +
      '<span class="wk-mover-val ' + dir + '">' + moveArrow(row.delta) + Math.abs(row.delta) +
        ' to No. ' + row.rank + '</span>' +
    '</div>';
  }

  // ── §04 The wire ─────────────────────────────────────────────────────

  function renderWire() {
    var d = state.data;
    var slot = byId('secWire');
    if (!slot) return;
    var t = d.trades || { locked: false, recent: [], newThisWeek: 0, verdicts: 0 };

    if (t.locked) {
      slot.innerHTML = sectionHTML('§ 04', 'The', 'wire.', null, null,
        '<div class="wk-panel"><div class="wk-empty">The Trade Desk is a Veteran feature. ' +
          'Upgrade the league and every deal lands here, graded.</div></div>');
      return;
    }
    if (!t.recent.length) {
      slot.innerHTML = sectionHTML('§ 04', 'The', 'wire.', 'live/trades/', 'Trade desk',
        '<div class="wk-panel"><div class="wk-empty">No trades in the last three weeks. Quiet market.</div></div>');
      return;
    }

    var rows = t.recent.map(function (tr) {
      var age = tr.daysAgo === 0 ? 'Today' : tr.daysAgo === 1 ? 'Yesterday' : tr.daysAgo + 'd ago';
      var sides = tr.sides.map(function (s) {
        return '<span class="wk-trade-side">' +
          '<span class="wk-trade-who">' + esc(s.manager) + '</span>' +
          '<span class="wk-trade-gets">' + (s.gets.length ? esc(s.gets.join(', ')) : '·') + '</span>' +
        '</span>';
      }).join('');
      return '<a class="wk-trade" href="live/trades/grader/">' +
        '<span class="wk-trade-top">' +
          '<span class="wk-trade-head">' + esc(tr.headline) + '</span>' +
          '<span class="wk-trade-age' + (tr.daysAgo <= 7 ? ' fresh' : '') + '">' + esc(age) + '</span>' +
        '</span>' +
        '<span class="wk-trade-sides">' + sides + '</span>' +
        (tr.magnitude === 'blockbuster' ? '<span class="wk-trade-flag">Blockbuster</span>' : '') +
      '</a>';
    }).join('');

    var note = '';
    if (t.verdicts > 0) {
      note = '<div class="wk-pool"><span>Four-week verdicts just published</span>' +
        '<span class="wk-pool-track"></span>' +
        '<span class="wk-pool-val">' + t.verdicts + '</span></div>';
    }

    var label = t.newThisWeek > 0
      ? t.newThisWeek + (t.newThisWeek === 1 ? ' new deal' : ' new deals')
      : 'Trade desk';

    slot.innerHTML = sectionHTML('§ 04', 'The', 'wire.', 'live/trades/', label,
      '<div class="wk-panel">' + rows + note + '</div>');
  }

  // ── §05 The record room ──────────────────────────────────────────────

  function renderRecordRoom() {
    var d = state.data;
    var slot = byId('secRecords');
    if (!slot) return;

    var w = d.watch;
    if (!w) {
      slot.innerHTML = sectionHTML('§ 05', 'The record', 'room.', 'live/records-watch/', 'Records watch',
        '<div class="wk-panel"><div class="wk-empty">Nothing on the board yet. ' +
          'Records and milestones start showing up once a few weeks are in the books.</div></div>');
      return;
    }

    var blocks = '';

    if (w.broken.length) {
      blocks += subLabel('Already broken', w.counts.broken, true) +
        w.broken.map(function (it) { return watchRow(it, true); }).join('');
    }
    if (w.crossed.length) {
      blocks += subLabel('Just achieved', w.counts.crossed, false) +
        w.crossed.map(milestoneRow).join('');
    }
    if (w.brink.length) {
      blocks += subLabel('On the brink', w.counts.brink, false) +
        w.brink.map(function (it) { return watchRow(it, false); }).join('');
    }
    if (w.imminent.length) {
      blocks += subLabel('One away', w.counts.imminent, false) +
        w.imminent.map(milestoneRow).join('');
    }

    if (!blocks) {
      blocks = '<div class="wk-empty">No records within reach this week.</div>';
    }

    slot.innerHTML = sectionHTML('§ 05', 'The record', 'room.', null, null,
      '<div class="wk-panel">' + blocks + '</div>' +
      '<div class="wk-outlinks">' +
        '<a class="wk-outlink" href="live/records-watch/">Records watch</a>' +
        '<a class="wk-outlink" href="live/milestones/">Milestones</a>' +
      '</div>');
  }

  function subLabel(text, count, broken) {
    return '<div class="wk-sub-label' + (broken ? ' is-broken' : '') + '">' +
      '<span>' + esc(text) + '</span>' +
      '<span class="count">' + (count || 0) + '</span>' +
    '</div>';
  }

  function watchRow(it, broken) {
    return '<div class="wk-note-row' + (broken ? ' is-broken' : '') + '">' +
      '<span class="wk-note-glyph">' + (broken ? '✦' : '◌') + '</span>' +
      '<span class="wk-note-body">' +
        '<span class="wk-note-cat">' + esc(it.category) +
          (it.flag ? '<span class="flag">' + esc(it.flag) + '</span>' : '') + '</span>' +
        '<span class="wk-note-line"><em>' + esc(it.chaser) + '</em> · ' + esc(it.value) + '</span>' +
        '<span class="wk-note-sub">' + esc(it.gap) +
          (it.holder ? ' · mark: ' + esc(it.holder) + (it.holderWhen ? ' (' + esc(it.holderWhen) + ')' : '') : '') +
        '</span>' +
      '</span>' +
      // Same readout shape the milestone rows use ("99% / there") so the
      // two kinds of chase read on one scale.
      '<span class="wk-note-eta">' + Math.round(it.pct) + '%<small>there</small></span>' +
    '</div>';
  }

  // name is a plain string; html / meta are pre-escaped fragments built by
  // the milestones feed (same strings the Milestone Tracker renders).
  function milestoneRow(m) {
    return '<div class="wk-note-row">' +
      '<span class="wk-note-glyph">' + esc(m.glyph) + '</span>' +
      '<span class="wk-note-body">' +
        (m.eta && !m.etaUnit ? '<span class="wk-note-cat">' + esc(m.eta) + '</span>' : '') +
        '<span class="wk-note-line"><em>' + esc(m.name) + '</em> · ' + (m.html || '') + '</span>' +
        (m.meta ? '<span class="wk-note-sub">' + m.meta + '</span>' : '') +
      '</span>' +
      (m.etaUnit
        ? '<span class="wk-note-eta">' + esc(m.eta) + '<small>' + esc(m.etaUnit) + '</small></span>'
        : '') +
    '</div>';
  }

  // ── Share ────────────────────────────────────────────────────────────

  function initShare() {
    var btn = byId('wkShare');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var url = window.location.href.split('#')[0];
      var title = (window.__DC && window.__DC.name ? window.__DC.name : 'The league') + ' · The Weekly';
      if (navigator.share) {
        navigator.share({ title: title, url: url }).catch(function () {});
        return;
      }
      copy(url);
    });
  }

  function copy(url) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { toast('Link copied'); },
        function () { toast('Couldn’t copy'); });
      return;
    }
    toast('Copy the address bar');
  }

  function toast(msg) {
    var t = byId('wkToast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('is-on'); }, 2200);
  }
})();
