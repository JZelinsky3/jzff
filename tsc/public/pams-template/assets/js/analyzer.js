// analyzer.js — Trade Desk · Analyzer · Phase 3 builder UI.
//
// Boots when the analyzer page loads. Fetches the league's rosters via
// /api/leagues/<id>/analyze-trade/rosters, lets the user pick Team A +
// Team B and toggle player chips on each side, then POSTs the proposed
// trade to /api/leagues/<id>/analyze-trade and renders the result.
//
// State lives in a single `state` object — the render functions read
// from it and the event handlers mutate it. No framework; just enough
// vanilla JS to be obvious.

(function () {
  'use strict';

  // ── DOM refs ────────────────────────────────────────────────────────
  var $ = function (id) { return document.getElementById(id); };
  var loadingEl = $('an-loading');
  var errorEl   = $('an-error');
  var errorMsg  = $('an-error-msg');
  var builderEl = $('an-builder');
  var resultEl  = $('an-result');
  var modePill  = $('an-mode-pill');

  var teamASel  = $('an-team-a');
  var teamBSel  = $('an-team-b');
  var sidesEl   = $('an-sides');
  var sideAName = $('an-side-a-name');
  var sideBName = $('an-side-b-name');
  var sideAGroups = $('an-side-a-groups');
  var sideBGroups = $('an-side-b-groups');
  var actionEl  = $('an-action');
  var actionSummary = $('an-action-summary');
  var analyzeBtn = $('an-analyze-btn');
  var resetBtn   = $('an-reset-btn');

  // ── State ───────────────────────────────────────────────────────────
  var state = {
    leagueId:   null,
    data:       null,      // AnalyzerLeagueData
    teamA:      null,      // ownerId
    teamB:      null,
    sends:      new Set(), // player ids team A sends
    receives:   new Set(),
    busy:       false,
    result:     null,
    year:       null,      // null = current; otherwise number (2025, 2024, ...)
  };

  // Smooth-scroll so `el` lands just below the sticky header stack
  // (testing strip + masthead + chapbar/sub-rail). A plain
  // scrollIntoView({block:'start'}) puts the element at the viewport
  // top edge, where the sticky chrome then covers it — reads as
  // "scrolled too far".
  function scrollUnderNav(el) {
    var offset = 12; // breathing room below the chrome
    var nav   = document.querySelector('nav.nav');
    var bar   = document.getElementById('nav-chapbar');
    var strip = document.getElementById('dc-testing-strip');
    if (nav)   offset += nav.getBoundingClientRect().height;
    if (bar)   offset += bar.getBoundingClientRect().height;
    if (strip) offset += strip.getBoundingClientRect().height;
    var y = el.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }

  // Read ?year=YYYY from URL into state.year on boot. Lets the user share
  // an Analyzer URL pinned to a specific season snapshot.
  function readYearFromUrl() {
    try {
      var y = new URLSearchParams(window.location.search).get('year');
      var n = y ? Number(y) : null;
      return Number.isFinite(n) ? n : null;
    } catch (e) { return null; }
  }
  function writeYearToUrl(year) {
    try {
      var url = new URL(window.location.href);
      if (year) url.searchParams.set('year', String(year));
      else url.searchParams.delete('year');
      window.history.replaceState({}, '', url.toString());
    } catch (e) { /* ignore */ }
  }

  // ── Cross-room handoff ──────────────────────────────────────────────
  // The Rumor Mill and Finder link in with a deal already on the table:
  //   ?teamA=<ownerId>&teamB=<ownerId>&sends=<id,id>&receives=<id,id>
  // Applied once after rosters load; ids that don't survive validation
  // (team gone, player traded away since) are silently dropped, and the
  // analysis auto-runs when both sides still hold at least one player.
  // The params stay in the URL so a prefilled link is shareable.
  var prefillDone = false;
  function readPrefillFromUrl() {
    try {
      var q = new URLSearchParams(window.location.search);
      if (!q.get('teamA') || !q.get('teamB')) return null;
      var ids = function (s) { return (s || '').split(',').filter(Boolean); };
      return {
        teamA: q.get('teamA'),
        teamB: q.get('teamB'),
        sends: ids(q.get('sends')),
        receives: ids(q.get('receives')),
      };
    } catch (e) { return null; }
  }
  function applyPrefill() {
    if (prefillDone) return false;
    prefillDone = true;
    var pf = readPrefillFromUrl();
    if (!pf || !state.data) return false;
    var rosterA = rosterByOwnerId(pf.teamA);
    var rosterB = rosterByOwnerId(pf.teamB);
    if (!rosterA || !rosterB) return false;
    state.teamA = pf.teamA;
    state.teamB = pf.teamB;
    pf.sends.forEach(function (id) {
      if (rosterA.playerIds.indexOf(id) !== -1) state.sends.add(id);
    });
    pf.receives.forEach(function (id) {
      if (rosterB.playerIds.indexOf(id) !== -1) state.receives.add(id);
    });
    return state.sends.size > 0 && state.receives.size > 0;
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }
  function fail(msg) {
    hide(loadingEl);
    show(errorEl);
    errorMsg.textContent = msg;
  }

  // Group rosters' players by position for the chip picker. Returns an
  // array of [positionLabel, players[]] in canonical order so the same
  // position lists appear in the same order on both sides.
  // K + DEF are hidden — neither FantasyCalc nor most other value sources
  // price them, so they always render as `—` and clutter the panel
  // without contributing to trade analysis.
  var POS_ORDER = ['QB', 'RB', 'WR', 'TE'];
  var HIDDEN_POSITIONS = { K: true, DEF: true, DST: true };
  function groupByPosition(playerIds) {
    var map = {};
    playerIds.forEach(function (id) {
      var p = state.data.players[id];
      if (!p) return;
      var pos = (p.position || 'FLEX').toUpperCase();
      if (HIDDEN_POSITIONS[pos]) return;
      if (!map[pos]) map[pos] = [];
      map[pos].push(p);
    });
    // Sort each group by value desc — biggest names at the top of each
    // position group. Ties (or 0-value entries) fall back to name.
    Object.keys(map).forEach(function (k) {
      map[k].sort(function (a, b) {
        var va = Number(a.value || 0);
        var vb = Number(b.value || 0);
        if (vb !== va) return vb - va;
        return a.name.localeCompare(b.name);
      });
    });
    var out = [];
    POS_ORDER.forEach(function (pos) {
      if (map[pos]) out.push([pos, map[pos]]);
    });
    // Append any unrecognized positions at the end (DL/LB/DB etc. for IDP).
    Object.keys(map).sort().forEach(function (pos) {
      if (POS_ORDER.indexOf(pos) === -1) out.push([pos, map[pos]]);
    });
    return out;
  }

  // For a given roster, decide which player ids are starters / flex / SF.
  // Returns Map<playerId, 'starter'|'flex'|'sf'|'bench'>.
  // Algorithm mirrors depth.ts slotTeam():
  //   1. Top N at each pure position (QB/RB/WR/TE) → starter
  //   2. Top FLEX-count remaining RB/WR/TE       → flex
  //   3. Top SF-count remaining QB/RB/WR/TE      → sf
  //   4. Everyone else                           → bench
  function computeStarterStatuses(playerIds) {
    var statuses = {};
    var slots = (state.data && state.data.slots) || {};
    var byPos = { QB: [], RB: [], WR: [], TE: [] };
    playerIds.forEach(function (id) {
      var p = state.data.players[id];
      if (!p) return;
      var pos = (p.position || '').toUpperCase();
      if (!byPos[pos]) return;
      byPos[pos].push({ id: id, value: Number(p.value || 0) });
    });
    Object.keys(byPos).forEach(function (pos) {
      byPos[pos].sort(function (a, b) { return b.value - a.value; });
    });

    var taken = {};
    ['QB','RB','WR','TE'].forEach(function (pos) {
      var n = Number(slots[pos] || 0);
      byPos[pos].slice(0, n).forEach(function (e) {
        statuses[e.id] = 'starter'; taken[e.id] = true;
      });
    });

    function takeFromPool(positions, n, label) {
      if (!n) return;
      var pool = [];
      positions.forEach(function (pos) {
        byPos[pos].forEach(function (e) { if (!taken[e.id]) pool.push(e); });
      });
      pool.sort(function (a, b) { return b.value - a.value; });
      pool.slice(0, n).forEach(function (e) {
        statuses[e.id] = label; taken[e.id] = true;
      });
    }
    takeFromPool(['RB','WR','TE'], Number(slots.FLEX || 0), 'flex');
    takeFromPool(['QB','RB','WR','TE'], Number(slots.SF || 0), 'sf');

    return statuses;
  }

  // ── Rendering ───────────────────────────────────────────────────────
  function renderModePill() {
    if (!state.data) return;
    var eff = state.data.effective;
    var parts = [
      (eff.mode || 'redraft').toUpperCase(),
      eff.lineupType === 'SUPERFLEX' ? 'Superflex' : '1QB',
      eff.scoringProfile === 'STANDARD' ? 'Standard' :
        eff.scoringProfile === 'HALF' ? 'Half-PPR' : 'Full PPR',
      eff.teamCount + '-team',
    ];
    if (eff.tePremium && eff.tePremium !== 'NONE') {
      parts.push('TE Prem: ' + (eff.tePremium === 'MILD' ? '+0.5' : '+1.0'));
    }
    modePill.textContent = parts.join(' · ');
    show(modePill);
  }

  function fillTeamPickers() {
    var options = ['<option value="">Select a team…</option>'];
    state.data.rosters.forEach(function (r) {
      options.push(
        '<option value="' + escapeHtml(r.ownerId) + '">' +
          escapeHtml(r.teamName || r.ownerName) +
        '</option>'
      );
    });
    teamASel.innerHTML = options.join('');
    teamBSel.innerHTML = options.join('');
  }

  function rosterByOwnerId(ownerId) {
    return state.data.rosters.find(function (r) { return r.ownerId === ownerId; });
  }

  // Sleeper hosts player face crops at this URL pattern. ~100x100 jpg.
  // Players Sleeper doesn't have a photo for return 404; we hide the
  // <img> on error and reveal a sibling fallback span instead.
  function playerImageUrl(pid) {
    return 'https://sleepercdn.com/content/nfl/players/thumb/' + encodeURIComponent(pid) + '.jpg';
  }

  // Render the avatar HTML. DEF/DST players go straight to a team-abbr
  // bubble — Sleeper doesn't host headshots for team defenses. Everyone
  // else tries the image first and falls back to a position-letter
  // bubble on 404 via a sibling span (no HTML in onerror = no quote
  // escaping landmines).
  function renderAvatar(p) {
    var isDef = (p.position || '').toUpperCase() === 'DEF';
    if (isDef) {
      var abbr = (p.team || p.id || 'DEF').toString().slice(0, 3).toUpperCase();
      return '<span class="an-row-avatar-fallback an-row-avatar-def">' +
        escapeHtml(abbr) + '</span>';
    }
    var letter = (p.position || '?').slice(0, 2).toUpperCase();
    return '<img class="an-row-avatar" src="' + escapeHtml(playerImageUrl(p.id)) +
      '" alt="" loading="lazy" ' +
      'onerror="this.style.display=\'none\';' +
        'var s=this.nextElementSibling;if(s){s.style.display=\'inline-flex\';}">' +
      '<span class="an-row-avatar-fallback" style="display:none">' +
        escapeHtml(letter) + '</span>';
  }

  // Friendlier abbreviations than slicing the raw status. Sleeper sends
  // full words like "Questionable" / "Doubtful" / "Out" — letters
  // beloved by fantasy folks are Q / D / OUT / IR / PUP / SUS.
  function injuryAbbr(s) {
    if (!s) return null;
    var l = s.toLowerCase();
    if (l === 'questionable') return 'Q';
    if (l === 'doubtful')     return 'D';
    if (l === 'out')          return 'OUT';
    if (l === 'ir')           return 'IR';
    if (l === 'pup')          return 'PUP';
    if (l === 'sus')          return 'SUS';
    return s.toUpperCase().slice(0, 3);
  }

  function renderSide(which) {
    var ownerId   = which === 'A' ? state.teamA : state.teamB;
    var nameEl    = which === 'A' ? sideAName : sideBName;
    var groupsEl  = which === 'A' ? sideAGroups : sideBGroups;
    var footEl    = $('an-side-' + which.toLowerCase() + '-foot');
    var totalEl   = $('an-side-' + which.toLowerCase() + '-total');
    var chipsSet  = which === 'A' ? state.sends : state.receives;

    var tagEl = $('an-side-' + which.toLowerCase() + '-tag');
    if (!ownerId) {
      nameEl.textContent = '';
      if (tagEl) tagEl.textContent = which === 'A' ? 'Sends' : 'Receives';
      groupsEl.innerHTML = '<div style="color:var(--td-mute);font-size:.85rem;padding:1rem 0;">Pick a team above to see their roster.</div>';
      if (footEl) hide(footEl);
      return;
    }
    var roster = rosterByOwnerId(ownerId);
    if (!roster) return;
    // Tag = manager name (since the team name already displays on the
    // right side of the header). Friendlier than "Team A sends".
    nameEl.textContent = roster.teamName || roster.ownerName;
    if (tagEl) {
      tagEl.textContent = (roster.ownerName || 'Manager') + (which === 'A' ? ' sends' : ' receives');
    }

    var groups = groupByPosition(roster.playerIds);
    if (groups.length === 0) {
      groupsEl.innerHTML = '<div style="color:var(--td-mute);font-size:.85rem;padding:1rem 0;">No players on this roster.</div>';
      if (footEl) hide(footEl);
      return;
    }
    var totalRosterValue = 0;
    var statuses = computeStarterStatuses(roster.playerIds);
    groupsEl.innerHTML = groups.map(function (entry) {
      var pos = entry[0];
      var players = entry[1];
      var groupValue = 0;
      var rowsHtml = players.map(function (p) {
        var on = chipsSet.has(p.id);
        var val = Math.max(0, Number(p.value || 0));
        groupValue += val;
        var valDisplay = val > 0 ? Math.round(val) : '—';
        var valClass = val > 0 ? '' : ' an-row-value-zero';
        var teamTxt = p.team ? '<span class="an-row-team">' + escapeHtml(p.team) + '</span>' : '';
        var inj = injuryAbbr(p.injuryStatus);
        var injTxt = inj ? '<span class="an-row-injury">' + escapeHtml(inj) + '</span>' : '';
        var status = statuses[p.id] || 'bench';
        return '<button type="button" class="an-row" data-side="' + which + '" data-pid="' +
          escapeHtml(p.id) + '" data-slot="' + status + '" aria-pressed="' + on + '">' +
          renderAvatar(p) +
          '<span class="an-row-body">' +
            '<span class="an-row-name">' + escapeHtml(p.name) + '</span>' +
            '<span class="an-row-meta">' +
              '<span>' + escapeHtml(p.position || '—') + '</span>' +
              teamTxt + injTxt +
            '</span>' +
          '</span>' +
          '<span class="an-row-value' + valClass + '">' + valDisplay + '</span>' +
        '</button>';
      }).join('');
      totalRosterValue += groupValue;
      return '<div class="an-pos-group">' +
        '<div class="an-pos-label">' +
          '<span>' + escapeHtml(pos) + '</span>' +
          '<span class="an-pos-count">' + players.length + ' · ' + Math.round(groupValue) + '</span>' +
        '</div>' +
        '<div class="an-rows">' + rowsHtml + '</div>' +
      '</div>';
    }).join('');
    if (footEl) {
      show(footEl);
      totalEl.textContent = Math.round(totalRosterValue).toString();
    }
  }

  function renderActionRow() {
    var nSends = state.sends.size;
    var nRecvs = state.receives.size;
    if (nSends === 0 && nRecvs === 0) {
      hide(actionEl);
      return;
    }
    show(actionEl);
    actionSummary.innerHTML =
      '<strong>' + nSends + '</strong> sent · <strong>' + nRecvs + '</strong> received';
    analyzeBtn.disabled = nSends === 0 || nRecvs === 0 || state.busy;
    analyzeBtn.textContent = state.busy ? 'Analyzing…' : 'Analyze Trade';
  }

  function renderBuilder() {
    show(builderEl);
    fillTeamPickers();
    teamASel.value = state.teamA || '';
    teamBSel.value = state.teamB || '';
    // Reveal the side panels as soon as EITHER team is picked. The
    // empty side keeps its "Pick a team above" placeholder until its
    // own dropdown is set — lets the user inspect roster A while still
    // deciding on team B.
    if (state.teamA || state.teamB) {
      show(sidesEl);
      renderSide('A');
      renderSide('B');
    } else {
      hide(sidesEl);
    }
    renderActionRow();
  }

  // ── Event handlers ──────────────────────────────────────────────────
  function onTeamChange(which, val) {
    if (which === 'A') {
      // Clearing sends to keep the chip set consistent with the team
      // (sends come FROM team A; switching teams invalidates them).
      if (state.teamA !== val) state.sends.clear();
      state.teamA = val || null;
    } else {
      if (state.teamB !== val) state.receives.clear();
      state.teamB = val || null;
    }
    renderBuilder();
  }
  function onChipClick(e) {
    var btn = e.target.closest('.an-row');
    if (!btn) return;
    var side = btn.getAttribute('data-side');
    var pid  = btn.getAttribute('data-pid');
    var set  = side === 'A' ? state.sends : state.receives;
    if (set.has(pid)) set.delete(pid);
    else set.add(pid);
    btn.setAttribute('aria-pressed', set.has(pid) ? 'true' : 'false');
    renderActionRow();
  }
  function onAnalyze() {
    if (state.busy) return;
    state.busy = true;
    renderActionRow();
    var url = '/api/leagues/' + state.leagueId + '/analyze-trade';
    if (state.year) url += '?year=' + encodeURIComponent(state.year);
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        teamA:     state.teamA,
        teamB:     state.teamB,
        sends:     Array.from(state.sends),
        receives:  Array.from(state.receives),
      }),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
        return data;
      });
    }).then(function (data) {
      state.result = data;
      state.busy = false;
      renderResult();
      // Smooth scroll the result into view.
      scrollUnderNav(resultEl);
    }).catch(function (err) {
      state.busy = false;
      renderActionRow();
      alert('Analyze failed: ' + (err.message || String(err)));
    });
  }
  function onReset() {
    state.result = null;
    state.sends.clear();
    state.receives.clear();
    hide(resultEl);
    renderBuilder();
    scrollUnderNav(builderEl);
  }

  // Crude consensus-value → projected-points-per-game converter.
  //
  // Two adjustments vs the original single-source calibration:
  //   1. Multiplier bumped (0.0025 → 0.0036) — the new weighted consensus
  //      (FC+KTC+DP+FP with outlier guard) produces lower absolute starter
  //      sums than the old FC-only path, so the prior multiplier read low.
  //   2. Flat DEF/K offset (+14 ppg) — neither position is in the value
  //      engine but both contribute to real PPR lineups (DEF ~7, K ~7).
  //      Without this the projection systematically under-counts a full
  //      starting lineup by ~14 points.
  // A ~32k starter-sum strong team now translates to ~129 ppg. Still a
  // proxy, not real projection data — wire Sleeper /projections or
  // FantasyPros ROS for true accuracy.
  var PPG_PER_VALUE = 0.0036;
  var DEF_K_PPG = 14;
  function projPoints(starterValue) {
    var v = (Number(starterValue) || 0) * PPG_PER_VALUE;
    if (v <= 0) return 0;
    return v + DEF_K_PPG;
  }

  // Render one row in the depth block. 3 cells (label | value | arrow)
  // so the grid layout in analyzer.css lines everything up cleanly.
  function depthRow(label, before, after, opts) {
    opts = opts || {};
    var fmt = opts.fmt || function (n) { return n; };
    var beforeDisplay = fmt(before);
    var afterDisplay  = fmt(after);
    var delta = (Number(after) || 0) - (Number(before) || 0);
    var arrow = '';
    // Treat exact 0 OR sub-epsilon as flat — render a dash like the
    // composite row does, not "↑0" / "↓0".
    if (delta === 0 || Math.abs(delta) < (opts.eps || 0)) {
      arrow = '<span class="an-depth-overall-arrow" data-tone="flat">—</span>';
    } else if (opts.lowerIsBetter) {
      // For rank: lower number = better. Negative delta = improvement.
      arrow = delta < 0
        ? '<span class="an-depth-overall-arrow" data-tone="up">↑' + Math.abs(delta) + '</span>'
        : '<span class="an-depth-overall-arrow" data-tone="down">↓' + delta + '</span>';
    } else {
      // For values: higher = better.
      var abs = opts.fmtDelta ? opts.fmtDelta(Math.abs(delta)) : Math.abs(delta);
      arrow = delta > 0
        ? '<span class="an-depth-overall-arrow" data-tone="up">↑' + abs + '</span>'
        : '<span class="an-depth-overall-arrow" data-tone="down">↓' + abs + '</span>';
    }
    return '<div class="an-depth-overall">' +
      '<span>' + escapeHtml(label) + '</span>' +
      '<strong>' + beforeDisplay + ' → ' + afterDisplay + '</strong>' +
      arrow +
    '</div>';
  }

  // ── Depth block helper ──────────────────────────────────────────────
  function renderDepthBlock(depth, side) {
    if (!depth || !depth.before || !depth.after) return '';
    var movements = (depth.rankMovements || []).slice(0, 4);
    var movementsHtml = movements.length === 0
      ? '<div class="an-depth-empty">No positional rank movement</div>'
      : '<div class="an-depth-mvmnt-list">' + movements.map(function (m) {
          var tone = m.delta < 0 ? 'up' : 'down';
          var arrow = m.delta < 0 ? '↑' : '↓';
          return '<div class="an-depth-mvmnt">' +
            '<span class="an-depth-mvmnt-pos">' + escapeHtml(m.position) + ' ' + m.before + '→' + m.after + '</span>' +
            '<span class="an-depth-mvmnt-val" data-tone="' + tone + '">' + arrow + Math.abs(m.delta) + '</span>' +
          '</div>';
        }).join('') + '</div>';

    // Projected starting-lineup points: prefer the REAL projection sum
    // (side.projPpgBefore / projPpgAfter) computed server-side from
    // Sleeper's RotoWire-backed projections feed. Fall back to the
    // crude value→ppg multiplier only when the projections endpoint
    // failed (server returns null).
    var projBefore, projAfter;
    if (side && typeof side.projPpgBefore === 'number' && typeof side.projPpgAfter === 'number') {
      projBefore = side.projPpgBefore;
      projAfter  = side.projPpgAfter;
    } else if (side) {
      projBefore = projPoints(side.starterBefore);
      projAfter  = projPoints(side.starterAfter);
    } else {
      projBefore = null;
      projAfter  = null;
    }

    var html = '';
    if (projBefore != null && projAfter != null) {
      html += depthRow('Proj PPG', projBefore, projAfter, {
        fmt: function (n) { return n.toFixed(1); },
        fmtDelta: function (n) { return n.toFixed(1); },
        eps: 0.05,
      });
    }
    html += depthRow('League Rank', depth.before.overallLeagueRank, depth.after.overallLeagueRank, {
      lowerIsBetter: true,
    });
    html += depthRow('Composite', depth.before.compositeStrength, depth.after.compositeStrength, {
      fmt: function (n) { return Number(n).toFixed(1); },
      fmtDelta: function (n) { return n.toFixed(1); },
      eps: 0.05,
    });
    html += movementsHtml;
    return html;
  }

  // ── Result render ───────────────────────────────────────────────────
  function renderResult() {
    if (!state.result) return;
    var r = state.result;
    var teamA = rosterByOwnerId(state.teamA);
    var teamB = rosterByOwnerId(state.teamB);

    $('an-result-a-name').textContent = teamA ? (teamA.teamName || teamA.ownerName) : 'Team A';
    $('an-result-b-name').textContent = teamB ? (teamB.teamName || teamB.ownerName) : 'Team B';
    // Tag chip = manager name (the actual team name renders on the
    // right side of the same header). Mirror of the roster-panel tags.
    $('an-result-a-tag').textContent = teamA ? (teamA.ownerName || 'Manager A') : 'Team A';
    $('an-result-b-tag').textContent = teamB ? (teamB.ownerName || 'Manager B') : 'Team B';

    var gradeA = $('an-result-a-grade');
    gradeA.textContent = r.teamA.grade;
    gradeA.setAttribute('data-grade', r.teamA.grade);
    var gradeB = $('an-result-b-grade');
    gradeB.textContent = r.teamB.grade;
    gradeB.setAttribute('data-grade', r.teamB.grade);

    // Marginal starter-impact line above the verdict. This is the
    // metric that actually drives the grade (raw value totals shown
    // further down are informational).
    function renderImpact(side, slotId) {
      var el = $(slotId);
      var gain = Math.round(side.marginalGain || 0);
      var pct = (side.marginalGainPct || 0) * 100;
      var sign = gain > 0 ? '+' : gain < 0 ? '−' : '±';
      var tone = gain > 5 ? 'up' : gain < -5 ? 'down' : 'flat';
      el.setAttribute('data-tone', tone);
      el.innerHTML = 'Starting lineup impact · <strong>' + sign +
        Math.abs(gain) + ' (' + (pct >= 0 ? '+' : '−') +
        Math.abs(pct).toFixed(1) + '%)</strong>';
    }
    renderImpact(r.teamA, 'an-result-a-impact');
    renderImpact(r.teamB, 'an-result-b-impact');

    $('an-result-a-verdict').textContent = r.teamA.verdict || '';
    $('an-result-b-verdict').textContent = r.teamB.verdict || '';

    function renderList(rowEl, items) {
      rowEl.innerHTML = items.map(function (it) {
        // Positional percentile badge — shows where the player ranks at
        // their position across the consensus blend (P92 = top 8% at WR).
        // Hidden when value is 0 (player not graded by any source).
        var badge = '';
        if (typeof it.percentilePosition === 'number' && it.value > 0) {
          badge = '<span class="an-result-list-pct" title="Positional percentile across blended sources">P' + it.percentilePosition + '</span>';
        }
        return '<li class="an-result-list-item">' +
          '<span class="an-result-list-pos">' + escapeHtml(it.position || '—') + '</span>' +
          '<span class="an-result-list-name">' + escapeHtml(it.name) + '</span>' +
          badge +
          '<span class="an-result-list-val">' + Math.round(it.value) + '</span>' +
        '</li>';
      }).join('');
    }
    renderList($('an-result-a-list'), r.teamA.received);
    renderList($('an-result-b-list'), r.teamB.received);

    $('an-result-a-total').innerHTML = 'Raw asset value received · <strong>' + Math.round(r.teamA.total) + '</strong>';
    $('an-result-b-total').innerHTML = 'Raw asset value received · <strong>' + Math.round(r.teamB.total) + '</strong>';

    // Depth blocks per team (pass full side so the block can derive
    // projected lineup points from starterBefore/starterAfter).
    $('an-result-a-depth').innerHTML = renderDepthBlock(r.teamA.depth, r.teamA);
    $('an-result-b-depth').innerHTML = renderDepthBlock(r.teamB.depth, r.teamB);

    // Narrative
    var narrEl = $('an-narrative');
    var narrBody = $('an-narrative-body');
    var narrMeta = $('an-narrative-meta');
    if (r.narrative) {
      narrBody.textContent = r.narrative;
      narrBody.setAttribute('data-tone', 'real');
      narrMeta.textContent = 'Desk verdict · ' + (r.mode || '').toUpperCase();
    } else {
      narrBody.textContent = r.narrativeError
        ? 'Narrative unavailable (' + r.narrativeError.slice(0, 80) + ').'
        : 'Narrative unavailable.';
      narrBody.setAttribute('data-tone', 'fallback');
      narrMeta.textContent = 'Fallback verdicts shown above';
    }
    show(narrEl);

    // Value bar — 50/50 baseline shifted by the marginal-delta percent
    // so the bar reads as "the win margin." A 9.1% Team A win shifts to
    // 59.1 / 40.9; a tie sits at 50/50; a one-sided +50%+ trade pegs
    // the bar at the extreme. Clamped 0–100 so the meter never overruns.
    var totA = Math.max(0, r.teamA.total);
    var totB = Math.max(0, r.teamB.total);
    var shiftPct = (Number(r.deltaPct) || 0) * 100;   // +ve = A wins
    var pctA = Math.max(0, Math.min(100, 50 + shiftPct));
    var pctB = 100 - pctA;
    $('an-result-bar-a').style.width = pctA.toFixed(1) + '%';
    $('an-result-bar-b').style.width = pctB.toFixed(1) + '%';
    // Winner takes the accent, loser the down-red (colors live in CSS,
    // keyed off data-tone) — so the meter follows the verdict instead
    // of painting the same side the same color every time.
    $('an-result-bar-a').setAttribute('data-tone', r.delta > 0 ? 'win' : r.delta < 0 ? 'lose' : 'even');
    $('an-result-bar-b').setAttribute('data-tone', r.delta < 0 ? 'win' : r.delta > 0 ? 'lose' : 'even');
    // Meter bar legend uses manager names (mirrors the result-card tag).
    // Compute these before the delta text so the "X wins by Y" line
    // can drop in the actual manager name instead of "Team A/B".
    var legendA = teamA ? (teamA.ownerName || teamA.teamName || 'Team A') : 'Team A';
    var legendB = teamB ? (teamB.ownerName || teamB.teamName || 'Team B') : 'Team B';
    var deltaTxt = '';
    if (r.delta > 0) {
      deltaTxt = legendA + ' wins by ' + Math.round(r.delta) +
        ' (' + (r.deltaPct * 100).toFixed(1) + '%)';
    } else if (r.delta < 0) {
      deltaTxt = legendB + ' wins by ' + Math.round(-r.delta) +
        ' (' + (Math.abs(r.deltaPct) * 100).toFixed(1) + '%)';
    } else {
      deltaTxt = 'Even';
    }
    $('an-result-bar-legend').innerHTML =
      '<span><strong>' + escapeHtml(legendA) + '</strong> · ' + Math.round(totA) + '</span>' +
      '<span>' + escapeHtml(deltaTxt) + '</span>' +
      '<span>' + Math.round(totB) + ' · <strong>' + escapeHtml(legendB) + '</strong> </span>';

    show(resultEl);
  }

  // ── Year picker ─────────────────────────────────────────────────────
  // Changing the year mirrors into the URL (so it's shareable) and
  // re-runs boot() so rosters + settings reload for that snapshot.
  // Selections, results, and team pickers all reset.
  function onYearChange() {
    var sel = $('an-year-select');
    var raw = sel.value;
    var n = raw ? Number(raw) : null;
    state.year = Number.isFinite(n) ? n : null;
    writeYearToUrl(state.year);
    // Hard reset state so a stale team/chip set doesn't survive the
    // season swap (Sleeper roster might differ entirely year-to-year).
    state.teamA = null;
    state.teamB = null;
    state.sends.clear();
    state.receives.clear();
    state.result = null;
    state.data = null;
    hide(resultEl);
    hide(builderEl);
    hide(errorEl);
    show(loadingEl);
    boot();
  }

  // ── Wire events ─────────────────────────────────────────────────────
  teamASel.addEventListener('change', function () { onTeamChange('A', teamASel.value); });
  teamBSel.addEventListener('change', function () { onTeamChange('B', teamBSel.value); });
  sidesEl.addEventListener('click', onChipClick);
  analyzeBtn.addEventListener('click', onAnalyze);
  resetBtn.addEventListener('click', onReset);
  $('an-year-select').addEventListener('change', onYearChange);

  // ── Boot ────────────────────────────────────────────────────────────
  function boot() {
    var dc = window.__DC || {};
    if (!dc.id) {
      fail('No league context. Open this page through a league URL.');
      return;
    }
    state.leagueId = dc.id;
    // Sync the picker UI to whatever ?year= is in the URL on first boot.
    if (state.year === null) state.year = readYearFromUrl();
    var sel = $('an-year-select');
    if (sel) sel.value = state.year ? String(state.year) : '';
    var rostersUrl = '/api/leagues/' + dc.id + '/analyze-trade/rosters';
    if (state.year) rostersUrl += '?year=' + encodeURIComponent(state.year);
    fetch(rostersUrl, {
      cache: 'no-store',
      credentials: 'same-origin',
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.message || data.error || ('HTTP ' + res.status));
        return data;
      });
    }).then(function (data) {
      state.data = data;
      hide(loadingEl);
      renderModePill();
      var ready = applyPrefill();
      renderBuilder();
      if (ready) onAnalyze();
    }).catch(function (err) {
      fail(err.message || String(err));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
