// pickems.js — Dynasty Codex weekly pick'ems.
//
// Ported from the PA Milk Society demo: matchup-card / week / tally / records
// rendering is kept verbatim so the page looks identical. Only the data, auth,
// and submit layers are swapped — data comes from /leagues/<slug>/live/pickems/data,
// identity is a no-login profile dropdown, submission POSTs to .../submit.

(function () {
  'use strict';

  function byId(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }

  var SLUG = (window.__DC && window.__DC.slug) || '';
  var USER_KEY = 'dc_pickems_user_' + SLUG;

  var elTabs    = byId('weekTabs');
  var elViews   = byId('weekViews');
  var elAuthSel = byId('profileSelect');
  var elWhoami  = byId('whoami');
  var changeBtn = byId('changeUserBtn');
  var submitBtn = byId('submitPicks');
  var submitHint = byId('submitHint');

  var state = {
    teams: {},
    weeks: [],
    activeWeekId: null,
    currentWeekId: null,
    profiles: [],
    submissions: {},     // profileId -> weekId -> {picks, hl}
    user: null,          // {profileId, name, teamId}
    pending: { picks: {}, hl: {} },
  };

  boot().catch(function (e) { console.error(e); showMessage('Couldn’t load pick’ems.', String(e)); });

  // ── Boot ──────────────────────────────────────────────────────────────────
  async function boot() {
    var res = await fetch('live/pickems/data', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();

    if (data.status === 'no-live') {
      return showMessage('No live season', 'Pick’ems run during the season. Check back when the commissioner sets a live week.');
    }
    if (data.status === 'no-week') {
      return showMessage('No week open yet', 'The ' + data.year + ' season is live, but no week has been opened for picks.');
    }

    state.teams       = data.teams || {};
    // Strip emoji from team names once at load so they're hidden everywhere
    // — vote buttons, headings, select labels, alts, tooltips. Emojis
    // wreck horizontal alignment with mono record/manager lines and don't
    // render consistently across iOS/Android system fonts.
    Object.keys(state.teams).forEach(function (k) {
      var t = state.teams[k];
      if (t && typeof t.name === 'string') t.name = stripEmoji(t.name);
    });
    state.weeks       = data.weeks || [];
    state.profiles    = data.profiles || [];
    state.submissions = data.submissions || {};
    state.currentWeekId = data.currentWeekId;

    initAuthUI();

    if (!state.weeks.length) {
      showPreseason();
      return;
    }

    if (elTabs) {
      elTabs.innerHTML = state.weeks.map(function (w) {
        return '<button class="pe-tab" data-week="' + esc(w.id) + '" data-current="' + (w.is_current ? 'true' : 'false') + '">'
          + esc(w.label) + (w.is_current ? ' <span class="tab-sub">current</span>' : '') + '</button>';
      }).join('');
      elTabs.addEventListener('click', function (e) {
        var btn = e.target.closest('.pe-tab');
        if (btn) setActive(btn.dataset.week);
      });
    }
    if (elViews) {
      elViews.innerHTML = state.weeks.map(function (w) { return weekViewHTML(w); }).join('');
    }

    setActive(state.currentWeekId || state.weeks[state.weeks.length - 1].id);
    state.weeks.forEach(function (w) { hydrateWeek(w); });
    renderRecords();
  }

  function showMessage(title, body) {
    if (!elViews) return;
    elViews.innerHTML = '<div class="pe-preseason"><h2>' + esc(title) + '</h2><p>' + esc(body) + '</p></div>';
    if (submitBtn) submitBtn.hidden = true;
    if (elTabs) elTabs.hidden = true;
  }
  function showPreseason() {
    showMessage('Season hasn’t started yet', 'Pick’ems will appear here once the first week’s matchups are set.');
  }

  // ── Views ───────────────────────────────────────────────────────────────────
  function setActive(weekId) {
    state.activeWeekId = weekId;
    // CSS gates on data-active="true" specifically — toggleAttribute would set
    // an empty value, so set the explicit string.
    var activeTab = null;
    document.querySelectorAll('.pe-tab').forEach(function (x) {
      if (x.dataset.week === weekId) { x.setAttribute('data-active', 'true'); activeTab = x; }
      else x.removeAttribute('data-active');
    });
    document.querySelectorAll('.week').forEach(function (x) {
      if (x.dataset.week === weekId) x.setAttribute('data-active', 'true');
      else x.removeAttribute('data-active');
    });
    // Center the active week chip in the horizontal scroll strip on mobile.
    // 'instant' so the initial load doesn't smooth-scroll the user mid-render.
    if (activeTab && elTabs && elTabs.scrollWidth > elTabs.clientWidth) {
      var target = activeTab.offsetLeft - (elTabs.clientWidth / 2) + (activeTab.clientWidth / 2);
      elTabs.scrollTo({ left: Math.max(0, target), behavior: 'instant' });
    }
    state.pending = { picks: {}, hl: {} };
    var w = weekById(weekId);
    if (w && state.user) loadExistingSubmission(w);
    updateSubmitEnabled();
  }

  function weekById(id) {
    for (var i = 0; i < state.weeks.length; i++) if (state.weeks[i].id === id) return state.weeks[i];
    return null;
  }
  function userSubmitted(weekId) {
    return !!(state.user && state.submissions[state.user.profileId]
      && state.submissions[state.user.profileId][weekId]);
  }

  function weekViewHTML(w) {
    var statusBadge = w.locked
      ? '<span class="badge">Locked · Final</span>'
      : '<span class="badge">Open for picks</span>';
    return ''
      + '<section class="week" data-week="' + esc(w.id) + '">'
      +   '<div class="week-info">' + statusBadge + '</div>'
      +   '<div id="lock-msg-' + esc(w.id) + '" class="week-locked"></div>'
      // GOTW header is now rendered inline as the first row of the GOTW
      // card itself (see matchHTML), not as a section-level title — keeps
      // the "Game of the Week | Preview" row anchored to the card it
      // belongs to.
      +   '<div class="pe-grid" id="grid-' + esc(w.id) + '"></div>'
      +   '<div class="hl-card">'
      +     '<div class="hl-row">'
      +       '<div class="select"><label class="hl-label" for="hl-high-' + esc(w.id) + '">Highest Scorer</label>'
      +         '<select id="hl-high-' + esc(w.id) + '"><option value="">Select team</option></select></div>'
      +       '<div class="select"><label class="hl-label" for="hl-low-' + esc(w.id) + '">Lowest Scorer</label>'
      +         '<select id="hl-low-' + esc(w.id) + '"><option value="">Select team</option></select></div>'
      +     '</div>'
      +     '<div id="hl-reveal-' + esc(w.id) + '" style="margin-top:8px"></div>'
      +   '</div>'
      + '</section>';
  }

  function hydrateWeek(w) {
    var grid = byId('grid-' + w.id);
    if (!grid) return;
    var locked = w.locked;

    var lockMsg = byId('lock-msg-' + w.id);
    if (lockMsg) lockMsg.textContent = locked ? 'This week is locked.' : '';

    // High/low selects — every team playing that week.
    var teamIds = [];
    var seen = {};
    w.matchups.forEach(function (m) {
      [m.home, m.away].forEach(function (t) { if (!seen[t]) { seen[t] = 1; teamIds.push(t); } });
    });
    var hiSel = byId('hl-high-' + w.id);
    var loSel = byId('hl-low-' + w.id);
    if (hiSel && loSel && hiSel.options.length <= 1) {
      teamIds.forEach(function (tid) {
        var team = state.teams[tid];
        var label = team ? team.name : tid;
        hiSel.add(new Option(label, tid));
        loSel.add(new Option(label, tid));
      });
    }

    // GOTW first. Preserve the original (1-based) slate order so the
    // "Matchup II" label on each card matches the league's posted slate,
    // not the local sort order with GOTW promoted to the top.
    var slateOrder = {};
    w.matchups.forEach(function (m, i) { slateOrder[m.id] = i + 1; });
    var order = w.matchups.slice();
    if (w.gameOfWeek) {
      var idx = order.findIndex(function (m) { return m.id === w.gameOfWeek; });
      if (idx > -1) order.unshift(order.splice(idx, 1)[0]);
    }
    grid.innerHTML = order.map(function (m) {
      return matchHTML(w, m, locked, w.gameOfWeek === m.id, slateOrder[m.id]);
    }).join('');

    if (!grid.dataset.bound) {
      grid.addEventListener('click', function (e) {
        var btn = e.target.closest('.vote-btn');
        if (!btn) return;
        if (!state.user) { alert('Pick your name first.'); return; }
        if (w.locked)    { alert('This week is locked.'); return; }
        if (userSubmitted(w.id)) { alert('You already submitted this week.'); return; }
        var mid = btn.dataset.matchup;
        var m = w.matchups.find(function (x) { return x.id === mid; });
        if (state.user.teamId && m && (m.home === state.user.teamId || m.away === state.user.teamId)) {
          alert('You can’t pick your own matchup.');
          return;
        }
        state.pending.picks[mid] = btn.dataset.team;
        grid.querySelectorAll('.match[data-mid="' + mid + '"] .vote-btn').forEach(function (b) {
          b.dataset.picked = b.dataset.team === btn.dataset.team ? 'true' : '';
        });
        updateSubmitEnabled();
      });
      grid.dataset.bound = '1';
    }
    if (hiSel && !hiSel.dataset.bound) {
      hiSel.addEventListener('change', function () {
        if (!state.user || w.locked || userSubmitted(w.id)) { hiSel.value = ''; return; }
        state.pending.hl.highest = hiSel.value || undefined;
        updateSubmitEnabled();
      });
      hiSel.dataset.bound = '1';
    }
    if (loSel && !loSel.dataset.bound) {
      loSel.addEventListener('change', function () {
        if (!state.user || w.locked || userSubmitted(w.id)) { loSel.value = ''; return; }
        state.pending.hl.lowest = loSel.value || undefined;
        updateSubmitEnabled();
      });
      loSel.dataset.bound = '1';
    }

    if (state.user) loadExistingSubmission(w);
    renderTally(w);
    updateSubmitEnabled();
    fitVoteNames(grid);
  }

  // After a week's grid is built, walk every .vote-name and .team-name
  // and shrink the font-size 1px at a time until the text fits in its
  // allotted width. For vote buttons this keeps the 50% column boundary
  // honest. For team names this prevents a long name from wrapping to a
  // second line on one side — when that happened the other team's name
  // sat lower (vertical-center alignment), making the card look lopsided.
  // 8px floor so a worst-case team name doesn't reduce to dust.
  function fitVoteNames(grid) {
    if (!grid) return;
    var sel = '.vote-name, .team-name';
    grid.querySelectorAll(sel).forEach(function (el) {
      el.style.fontSize = ''; // reset prior fit (e.g. on re-hydrate)
      var size = parseFloat(window.getComputedStyle(el).fontSize);
      var min = 8;
      var guard = 24; // hard cap so we can't loop forever
      while (el.scrollWidth > el.clientWidth && size > min && guard-- > 0) {
        size -= 1;
        el.style.fontSize = size + 'px';
      }
    });
  }

  // Strip emoji (and other pictographic glyphs) from a string. Used on
  // team names at load time — emojis fight the mono record/manager line
  // alignment and render inconsistently across platforms.
  function stripEmoji(s) {
    if (!s) return '';
    try {
      return s.replace(/\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim();
    } catch (e) {
      // Older engines without Unicode property escapes — fall back to
      // the common emoji blocks. Won't catch every codepoint but covers
      // the standard set teams typically use.
      return s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}]/gu, '').replace(/\s+/g, ' ').trim();
    }
  }

  // Roman numerals for the slate ordinal (Matchup I, II, III…). Editorial
  // numbering, not a year, so the roman reads as decoration not a riddle.
  function toRoman(n) {
    var map = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
    var out = ''; var v = Math.floor(n || 0);
    for (var i = 0; i < map.length; i++) { while (v >= map[i][0]) { out += map[i][1]; v -= map[i][0]; } }
    return out;
  }

  // Per-matchup preview link. The matchup-preview desk view keys off the
  // platform external user id (matches the `uid` in matchup_preview.json),
  // not the internal manager id we use as `m.home` here — so route through
  // teams[m.home].user_id. If we don't have a user_id (rare: a manager
  // without an external mapping), drop the ?m= and let the page land on
  // the departures board instead of silently 404'ing into hub view.
  function previewHref(m) {
    var t = state.teams[m.home];
    var uid = t && t.user_id;
    return uid
      ? 'live/matchup-preview/?m=' + encodeURIComponent(uid)
      : 'live/matchup-preview/';
  }

  // matchup card — verbatim structure from the demo.
  function matchHTML(w, m, locked, isGOTW, slateNum) {
    var A = state.teams[m.home];
    var B = state.teams[m.away];
    var recA = w.records ? (w.records[m.home] || '') : '';
    var recB = w.records ? (w.records[m.away] || '') : '';

    function teamBlock(side, team, rec, isAway) {
      var champ = team && team.isChampion ? '<span title="Defending Champion">👑</span>' : '';
      var name = esc(team ? team.name : side);
      // Record gets its own line below the name so it sits in the same
      // vertical slot for both sides — the old inline placement
      // (name + record on home, record + name on away) made the record
      // jump between top and bottom rows when names wrapped.
      var recLine = rec ? '<div class="record-line">' + esc(rec) + '</div>' : '';
      var lwk = team && team.last_week_points != null
        ? '<div class="lwk"><span class="lbl">LAST WK</span> <strong>' + team.last_week_points.toFixed(1) + '</strong></div>'
        : '';
      return ''
        + '<div class="team" data-team="' + esc(side) + '">'
        +   '<div class="logo">' + (team && team.logo ? '<img src="' + esc(team.logo) + '" alt="' + esc(team.name) + '" loading="lazy">' : '') + '</div>'
        +   '<div class="meta">'
        +     '<div class="team-name">' + name + ' ' + champ + '</div>'
        +     recLine
        +     '<div class="manager">' + esc(team ? team.manager : '') + '</div>'
        +     lwk
        +   '</div>'
        + '</div>';
    }

    var haveProj = A && B && A.projected_points != null && B.projected_points != null;
    var projCell = haveProj
      ? '<div class="vs"><span class="vs-pts home">' + A.projected_points.toFixed(1) + '</span>'
        + '<span class="vs-mid">PPG</span>'
        + '<span class="vs-pts away">' + B.projected_points.toFixed(1) + '</span></div>'
      : '<div class="vs"><span class="vs-mid">vs</span></div>';

    var previewUrl = previewHref(m);
    // GOTW gets a custom 2-row header: "Game of the Week | Preview →" up
    // top, then a bigger "Matchup Spotlight" kicker tight against the
    // card. Regular matchups get a single row: "Matchup II" left,
    // "Preview →" right.
    var header = isGOTW
      ? ''
        + '<header class="match-header is-gotw">'
        +   '<div class="gotw-row">'
        +     '<span class="gotw-main">Game of the Week</span>'
        +     '<a class="match-preview-link gotw-preview" href="' + previewUrl + '">Preview</a>'
        +   '</div>'
        +   '<div class="gotw-spotlight-label">Matchup Spotlight</div>'
        + '</header>'
      : ''
        + '<header class="match-header">'
        +   '<span class="match-num">Matchup ' + (slateNum ? toRoman(slateNum) : '') + '</span>'
        +   '<a class="match-preview-link" href="' + previewUrl + '">Preview</a>'
        + '</header>';

    return ''
      + '<div class="match-wrap' + (isGOTW ? ' is-gotw-wrap' : '') + '">'
      +   header
      +   '<div class="match"' + (isGOTW ? ' data-gotw="true"' : '') + ' data-mid="' + esc(m.id) + '">'
      +     '<div class="match-top">'
      +       teamBlock(m.home, A, recA, false)
      +       projCell
      +       teamBlock(m.away, B, recB, true)
      +     '</div>'
      +     '<div class="vote">'
      +       '<div class="buttons">'
      +         '<button class="vote-btn" data-matchup="' + esc(m.id) + '" data-team="' + esc(m.home) + '">'
      +           '<span class="vote-name">' + esc(A ? A.name : m.home) + '</span>'
      +           '<span class="vote-pct" id="vp-' + esc(w.id) + '-' + esc(m.id) + '-' + esc(m.home) + '">—</span>'
      +         '</button>'
      +         '<button class="vote-btn" data-matchup="' + esc(m.id) + '" data-team="' + esc(m.away) + '">'
      +           '<span class="vote-name">' + esc(B ? B.name : m.away) + '</span>'
      +           '<span class="vote-pct" id="vp-' + esc(w.id) + '-' + esc(m.id) + '-' + esc(m.away) + '">—</span>'
      +         '</button>'
      +       '</div>'
      +       '<div class="bar2" id="bar-' + esc(w.id) + '-' + esc(m.id) + '">'
      +         '<span class="left" id="l-' + esc(w.id) + '-' + esc(m.id) + '"></span>'
      +         '<span class="right" id="r-' + esc(w.id) + '-' + esc(m.id) + '"></span>'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      + '</div>';
  }

  function applyWinnerMarks(w) {
    if (!w.winners) return;
    Object.keys(w.winners).forEach(function (mid) {
      var win = w.winners[mid];
      var matchEl = document.querySelector('.week[data-week="' + w.id + '"] .match[data-mid="' + mid + '"]');
      if (!matchEl) return;
      matchEl.dataset.winner = win;
      matchEl.querySelectorAll('.team[data-team]').forEach(function (t) {
        var nm = t.querySelector('.team-name');
        if (nm) nm.classList.toggle('win', t.dataset.team === win);
      });
      matchEl.querySelectorAll('.vote-btn[data-team="' + win + '"]').forEach(function (b) {
        b.dataset.winner = 'true';
      });
    });
  }

  // ── Tally (vote bars) — computed from submissions, no realtime ─────────────
  function renderTally(w) {
    var reveal = w.locked || userSubmitted(w.id);
    var counts = {};
    w.matchups.forEach(function (m) { counts[m.id] = {}; counts[m.id][m.home] = 0; counts[m.id][m.away] = 0; });
    var hl = { highest: {}, lowest: {} };

    Object.keys(state.submissions).forEach(function (pid) {
      var sub = state.submissions[pid][w.id];
      if (!sub) return;
      Object.keys(sub.picks || {}).forEach(function (mid) {
        var tid = sub.picks[mid];
        if (counts[mid] && counts[mid][tid] != null) counts[mid][tid]++;
      });
      ['highest', 'lowest'].forEach(function (k) {
        if (sub.hl && sub.hl[k]) hl[k][sub.hl[k]] = (hl[k][sub.hl[k]] || 0) + 1;
      });
    });

    w.matchups.forEach(function (m) {
      var left = byId('l-' + w.id + '-' + m.id);
      var rgt  = byId('r-' + w.id + '-' + m.id);
      var bar  = byId('bar-' + w.id + '-' + m.id);
      var vpA  = byId('vp-' + w.id + '-' + m.id + '-' + m.home);
      var vpB  = byId('vp-' + w.id + '-' + m.id + '-' + m.away);
      if (!left || !rgt) return;
      var a = counts[m.id][m.home], b = counts[m.id][m.away], tot = a + b;
      var pA = reveal && tot ? Math.round(a / tot * 100) : 50;
      var pB = 100 - pA;
      left.style.width = pA + '%';
      rgt.style.width = pB + '%';
      if (vpA) vpA.textContent = reveal ? pA + '%' : '—';
      if (vpB) vpB.textContent = reveal ? pB + '%' : '—';
      if (bar) bar.title = reveal
        ? (teamName(m.home) + ' ' + pA + '% · ' + teamName(m.away) + ' ' + pB + '% · ' + tot + ' picks')
        : 'Picks hidden until you lock in';
    });

    var hlBox = byId('hl-reveal-' + w.id);
    if (hlBox) {
      hlBox.innerHTML = renderHLReveal(w, hl, reveal);
    }

    applyWinnerMarks(w);
  }

  function teamName(id) { return state.teams[id] ? state.teams[id].name : id; }

  // Renders the high/low-scorer panel under the picker selects. Was a
  // single line of comma-joined pills ("Highest: A, B  Lowest: C") which
  // ran together when multiple teams tied. New shape: a 2-column card
  // that mirrors the picker grid above — one column per category, each
  // team on its own line, color-coded to match the highest/lowest accent.
  function renderHLReveal(w, hl, reveal) {
    var hiNames, loNames, hiLabel, loLabel;
    if (w.hlWinners) {
      hiNames = (w.hlWinners.highest || []).map(teamName);
      loNames = (w.hlWinners.lowest || []).map(teamName);
      hiLabel = 'Highest Scorer';
      loLabel = 'Lowest Scorer';
    } else if (reveal) {
      hiNames = topKeys(hl.highest).map(teamName);
      loNames = topKeys(hl.lowest).map(teamName);
      hiLabel = 'Highest · Leader';
      loLabel = 'Lowest · Leader';
    } else {
      return '<div class="hl-reveal-hint">Reveals once you lock in</div>';
    }
    function col(klass, label, names) {
      var safe = names && names.length ? names : null;
      var rows = safe
        ? safe.map(function (n) { return '<div class="hl-reveal-name">' + esc(n) + '</div>'; }).join('')
        : '<div class="hl-reveal-name is-tbd">TBD</div>';
      return '<div class="hl-reveal-col ' + klass + '">'
        +   '<div class="hl-reveal-label">' + esc(label) + '</div>'
        +   rows
        + '</div>';
    }
    return '<div class="hl-reveal-grid">'
      +    col('hi', hiLabel, hiNames)
      +    col('lo', loLabel, loNames)
      +  '</div>';
  }

  // ── Existing submission ─────────────────────────────────────────────────────
  function loadExistingSubmission(w) {
    if (!state.user) return;
    var sub = (state.submissions[state.user.profileId] || {})[w.id];
    if (!sub) return;
    Object.keys(sub.picks || {}).forEach(function (mid) {
      document.querySelectorAll('.week[data-week="' + w.id + '"] .match[data-mid="' + mid + '"] .vote-btn')
        .forEach(function (b) {
          b.dataset.picked = b.dataset.team === sub.picks[mid] ? 'true' : '';
          b.disabled = true;
        });
    });
    if (sub.hl && sub.hl.highest) { var hi = byId('hl-high-' + w.id); if (hi) { hi.value = sub.hl.highest; hi.disabled = true; } }
    if (sub.hl && sub.hl.lowest)  { var lo = byId('hl-low-' + w.id);  if (lo) { lo.value = sub.hl.lowest;  lo.disabled = true; } }
  }

  function disableWeekInputs(weekId) {
    document.querySelectorAll('.week[data-week="' + weekId + '"] .vote-btn').forEach(function (b) { b.disabled = true; });
    var hi = byId('hl-high-' + weekId); if (hi) hi.disabled = true;
    var lo = byId('hl-low-' + weekId);  if (lo) lo.disabled = true;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  function requiredMatchups(w) {
    return w.matchups.filter(function (m) {
      return !(state.user && state.user.teamId && (m.home === state.user.teamId || m.away === state.user.teamId));
    });
  }

  function updateSubmitEnabled() {
    if (!submitBtn) return;
    var w = weekById(state.activeWeekId);
    if (!w || !state.user) {
      submitBtn.disabled = true;
      submitHint.textContent = state.user ? 'Select a week' : 'Pick your name to vote';
      return;
    }
    if (w.locked) { submitBtn.disabled = true; submitHint.textContent = 'This week is locked'; return; }
    if (userSubmitted(w.id)) { submitBtn.disabled = true; submitHint.textContent = 'You already submitted this week'; return; }
    var need = requiredMatchups(w).map(function (m) { return m.id; });
    var missing = need.filter(function (id) { return !state.pending.picks[id]; });
    var hlOK = !!state.pending.hl.highest && !!state.pending.hl.lowest;
    var sameHL = hlOK && state.pending.hl.highest === state.pending.hl.lowest;
    submitBtn.disabled = missing.length > 0 || !hlOK || sameHL;
    if (missing.length > 0) submitHint.textContent = 'Pick ' + missing.length + ' more matchup' + (missing.length === 1 ? '' : 's');
    else if (!hlOK) submitHint.textContent = 'Pick Highest + Lowest scorer';
    else if (sameHL) submitHint.textContent = 'Highest and Lowest must differ';
    else submitHint.textContent = 'Ready — locking in is final';
  }

  async function onSubmitPicks() {
    var w = weekById(state.activeWeekId);
    if (!w || !state.user || w.locked || userSubmitted(w.id)) return;
    var need = requiredMatchups(w);
    var missing = need.filter(function (m) { return !state.pending.picks[m.id]; });
    if (missing.length) { alert('Still need to pick ' + missing.length + ' matchup(s).'); return; }
    if (!state.pending.hl.highest || !state.pending.hl.lowest) { alert('Pick both Highest and Lowest scorer.'); return; }

    submitBtn.disabled = true;
    submitHint.textContent = 'Submitting…';
    var payload = {
      profile_id: state.user.profileId,
      week: w.week,
      picks: need.map(function (m) { return { matchup_id: m.id, picked_manager_id: state.pending.picks[m.id] }; }),
      hl: { highest: state.pending.hl.highest, lowest: state.pending.hl.lowest },
    };
    try {
      var res = await fetch('live/pickems/submit/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      var data = await res.json();
      if (!data.ok) { submitHint.textContent = data.error || 'Submission failed.'; submitBtn.disabled = false; return; }
      // Reflect locally.
      if (!state.submissions[state.user.profileId]) state.submissions[state.user.profileId] = {};
      state.submissions[state.user.profileId][w.id] = {
        picks: Object.assign({}, state.pending.picks),
        hl: { highest: state.pending.hl.highest, lowest: state.pending.hl.lowest },
      };
      disableWeekInputs(w.id);
      submitBtn.disabled = true;
      submitHint.textContent = 'Picks submitted!';
      renderTally(w);
      renderRecords();
    } catch (e) {
      submitHint.textContent = 'Network error — try again.';
      submitBtn.disabled = false;
    }
  }

  // ── Records ─────────────────────────────────────────────────────────────────
  function renderRecords() {
    var byUser = new Map();
    state.profiles.forEach(function (p) {
      byUser.set(p.profileId, { name: p.name, teamId: p.teamId, right: 0, wrong: 0 });
    });

    state.weeks.forEach(function (w) {
      if (!w.winners) return;
      Object.keys(state.submissions).forEach(function (pid) {
        var sub = state.submissions[pid][w.id];
        if (!sub) return;
        var row = byUser.get(pid);
        if (!row) return;
        Object.keys(sub.picks || {}).forEach(function (mid) {
          var win = w.winners[mid];
          if (!win) return;
          var m = w.matchups.find(function (x) { return x.id === mid; });
          if (row.teamId && m && (m.home === row.teamId || m.away === row.teamId)) return; // own game
          if (sub.picks[mid] === win) row.right++; else row.wrong++;
        });
      });
    });

    var rows = Array.from(byUser.values()).filter(function (r) { return r.right + r.wrong > 0; });
    rows.sort(function (a, b) { return b.right - a.right || a.wrong - b.wrong || a.name.localeCompare(b.name); });

    var list = byId('recordsList');
    if (!list) return;
    if (!rows.length) {
      list.innerHTML = '<li><span class="name" style="color:var(--pk-chalk-mute)">No decided picks yet.</span></li>';
      return;
    }
    list.innerHTML = rows.map(function (r) {
      return '<li><span class="name">' + esc(r.name) + '</span><span class="rw">' + r.right + '-' + r.wrong + '</span></li>';
    }).join('');
  }

  document.addEventListener('click', function (e) {
    if (e.target.id === 'recordsBtn') { var m = byId('recordsModal'); if (m) m.hidden = false; }
    if (e.target.id === 'recordsClose' || e.target.dataset.close === '1') {
      var rm = byId('recordsModal'); if (rm) rm.hidden = true;
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { var m = byId('recordsModal'); if (m) m.hidden = true; }
  });

  // ── Auth (no login — profile dropdown) ──────────────────────────────────────
  function initAuthUI() {
    if (elAuthSel) {
      elAuthSel.innerHTML = '<option value="">— pick your name —</option>'
        + state.profiles.map(function (p) {
            return '<option value="' + esc(p.profileId) + '">' + esc(p.name) + '</option>';
          }).join('');
      elAuthSel.addEventListener('change', function () {
        var p = state.profiles.find(function (x) { return x.profileId === elAuthSel.value; });
        setUser(p || null);
      });
    }
    if (changeBtn) {
      changeBtn.addEventListener('click', function () { setUser(null); });
    }
    if (submitBtn) submitBtn.addEventListener('click', onSubmitPicks);

    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) {}
    if (saved && saved.profileId) {
      var match = state.profiles.find(function (x) { return x.profileId === saved.profileId; });
      if (match) setUser(match);
    }
    updateAuthUI();
  }

  function setUser(profile) {
    state.user = profile ? { profileId: profile.profileId, name: profile.name, teamId: profile.teamId } : null;
    if (state.user) localStorage.setItem(USER_KEY, JSON.stringify(state.user));
    else localStorage.removeItem(USER_KEY);
    state.pending = { picks: {}, hl: {} };
    updateAuthUI();
    // Re-hydrate every week so picks / locks reflect the new identity.
    state.weeks.forEach(function (w) {
      var grid = byId('grid-' + w.id);
      if (grid) {
        grid.querySelectorAll('.vote-btn').forEach(function (b) { b.dataset.picked = ''; b.disabled = w.locked; });
        var hi = byId('hl-high-' + w.id), lo = byId('hl-low-' + w.id);
        if (hi) { hi.value = ''; hi.disabled = w.locked; }
        if (lo) { lo.value = ''; lo.disabled = w.locked; }
        if (state.user) loadExistingSubmission(w);
        renderTally(w);
      }
    });
    updateSubmitEnabled();
  }

  function updateAuthUI() {
    var signedIn = !!state.user;
    if (elAuthSel) { elAuthSel.hidden = signedIn; elAuthSel.value = signedIn ? state.user.profileId : ''; }
    if (elWhoami) {
      elWhoami.hidden = !signedIn;
      elWhoami.textContent = signedIn ? ('Picking as ' + state.user.name) : '';
    }
    if (changeBtn) changeBtn.hidden = !signedIn;
  }

  // ── Utilities ───────────────────────────────────────────────────────────────
  function topKeys(map) {
    var top = 0, out = [];
    Object.keys(map || {}).forEach(function (k) {
      if (map[k] > top) { top = map[k]; out = [k]; }
      else if (map[k] === top) out.push(k);
    });
    return out;
  }
})();
