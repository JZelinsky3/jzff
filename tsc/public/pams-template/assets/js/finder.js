// finder.js — Trade Desk · The Finder.
//
// Two-mode trade search. Boots from the same rosters endpoint the
// Analyzer uses, then:
//   shop   — user toggles players on their own roster they'd move;
//            POST /trade-desk/find sweeps every other roster for
//            packages that improve the user's starting lineup.
//   target — user browses other rosters and tags players they want;
//            the sweep builds offers from the user's own roster.
//
// Same vanilla-JS shape as analyzer.js: one state object, render
// functions read it, event handlers mutate it.

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var loadingEl  = $('fd-loading');
  var errorEl    = $('fd-error');
  var errorMsg   = $('fd-error-msg');
  var controlsEl = $('fd-controls');
  var teamSel    = $('fd-team');
  var modeShopBtn   = $('fd-mode-shop');
  var modeTargetBtn = $('fd-mode-target');
  var posChipsEl = $('fd-pos-chips');
  var maxSideSel = $('fd-max-side');
  var shopEl     = $('fd-shop');
  var shopName   = $('fd-shop-name');
  var shopGroups = $('fd-shop-groups');
  var targetEl   = $('fd-target');
  var trayEl     = $('fd-target-tray');
  var trayChips  = $('fd-target-tray-chips');
  var browseSel  = $('fd-browse');
  var browseGroups = $('fd-browse-groups');
  var actionEl   = $('fd-action');
  var actionSummary = $('fd-action-summary');
  var findBtn    = $('fd-find-btn');
  var resultsEl  = $('fd-results');
  var resultsEmpty = $('fd-results-empty');
  var dealsEl    = $('fd-deals');
  var clearBtn   = $('fd-clear-btn');
  var modePill   = $('fd-mode-pill');

  var state = {
    leagueId: null,
    data:     null,          // rosters payload (players carry .value)
    team:     null,          // ownerId of the user's team
    mode:     'shop',
    shopSet:   new Set(),    // my players I'd move
    targetSet: new Set(),    // their players I want
    browse:   null,          // ownerId currently browsed in target mode
    improve:  new Set(),     // PositionKey filter
    maxPerSide: 2,
    busy:     false,
    results:  null,          // FinderDeal[] (base + add-on variants)
    variantSel: {},          // deal index → active variant index (-1/missing = base)
    year:     null,
  };

  var MAX_SELECTED = 8;

  // ── Generic helpers (mirrors analyzer.js) ──────────────────────────
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }
  function fail(msg) { hide(loadingEl); show(errorEl); errorMsg.textContent = msg; }

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

  var POS_ORDER = ['QB', 'RB', 'WR', 'TE'];
  function groupByPosition(playerIds) {
    var map = {};
    playerIds.forEach(function (id) {
      var p = state.data.players[id];
      if (!p) return;
      var pos = (p.position || '').toUpperCase();
      if (POS_ORDER.indexOf(pos) === -1) return;   // tradeable positions only
      if (!map[pos]) map[pos] = [];
      map[pos].push(p);
    });
    Object.keys(map).forEach(function (k) {
      map[k].sort(function (a, b) {
        var d = Number(b.value || 0) - Number(a.value || 0);
        return d !== 0 ? d : a.name.localeCompare(b.name);
      });
    });
    var out = [];
    POS_ORDER.forEach(function (pos) { if (map[pos]) out.push([pos, map[pos]]); });
    return out;
  }

  function playerImageUrl(pid) {
    return 'https://sleepercdn.com/content/nfl/players/thumb/' + encodeURIComponent(pid) + '.jpg';
  }
  function renderAvatar(p) {
    var letter = (p.position || '?').slice(0, 2).toUpperCase();
    return '<img class="an-row-avatar" src="' + escapeHtml(playerImageUrl(p.id)) +
      '" alt="" loading="lazy" ' +
      'onerror="this.style.display=\'none\';' +
        'var s=this.nextElementSibling;if(s){s.style.display=\'inline-flex\';}">' +
      '<span class="an-row-avatar-fallback" style="display:none">' +
        escapeHtml(letter) + '</span>';
  }
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

  function rosterByOwnerId(ownerId) {
    return state.data.rosters.find(function (r) { return r.ownerId === ownerId; });
  }

  // Starter / FLEX / SF markers — same slotting walk as analyzer.js.
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
    POS_ORDER.forEach(function (pos) {
      byPos[pos].slice(0, Number(slots[pos] || 0)).forEach(function (e) {
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
      pool.slice(0, n).forEach(function (e) { statuses[e.id] = label; taken[e.id] = true; });
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
    modePill.textContent = parts.join(' · ');
    show(modePill);
  }

  function fillTeamPicker() {
    var options = ['<option value="">Select your team…</option>'];
    state.data.rosters.forEach(function (r) {
      options.push('<option value="' + escapeHtml(r.ownerId) + '">' +
        escapeHtml(r.teamName || r.ownerName) + '</option>');
    });
    teamSel.innerHTML = options.join('');
    teamSel.value = state.team || '';
  }

  function fillBrowsePicker() {
    var options = ['<option value="">Pick a roster to browse…</option>'];
    state.data.rosters.forEach(function (r) {
      if (r.ownerId === state.team) return;
      options.push('<option value="' + escapeHtml(r.ownerId) + '">' +
        escapeHtml(r.teamName || r.ownerName) + '</option>');
    });
    browseSel.innerHTML = options.join('');
    browseSel.value = state.browse || '';
  }

  // One roster's rows into a groups container. `set` is the toggle set
  // this board mutates (shopSet or targetSet).
  function renderRosterGroups(containerEl, roster, set) {
    var groups = groupByPosition(roster.playerIds);
    if (groups.length === 0) {
      containerEl.innerHTML = '<div style="color:var(--td-mute);font-size:.85rem;padding:1rem 0;">No tradeable players on this roster.</div>';
      return;
    }
    var statuses = computeStarterStatuses(roster.playerIds);
    containerEl.innerHTML = groups.map(function (entry) {
      var pos = entry[0];
      var players = entry[1];
      var rowsHtml = players.map(function (p) {
        var on = set.has(p.id);
        var val = Math.max(0, Number(p.value || 0));
        var valDisplay = val > 0 ? Math.round(val) : '—';
        var valClass = val > 0 ? '' : ' an-row-value-zero';
        var teamTxt = p.team ? '<span class="an-row-team">' + escapeHtml(p.team) + '</span>' : '';
        var inj = injuryAbbr(p.injuryStatus);
        var injTxt = inj ? '<span class="an-row-injury">' + escapeHtml(inj) + '</span>' : '';
        var status = statuses[p.id] || 'bench';
        return '<button type="button" class="an-row" data-pid="' + escapeHtml(p.id) +
          '" data-slot="' + status + '" aria-pressed="' + on + '">' +
          renderAvatar(p) +
          '<span class="an-row-body">' +
            '<span class="an-row-name">' + escapeHtml(p.name) + '</span>' +
            '<span class="an-row-meta">' +
              '<span>' + escapeHtml(p.position || '—') + '</span>' + teamTxt + injTxt +
            '</span>' +
          '</span>' +
          '<span class="an-row-value' + valClass + '">' + valDisplay + '</span>' +
        '</button>';
      }).join('');
      return '<div class="an-pos-group">' +
        '<div class="an-pos-label"><span>' + escapeHtml(pos) + '</span>' +
          '<span class="an-pos-count">' + players.length + '</span></div>' +
        '<div class="an-rows">' + rowsHtml + '</div>' +
      '</div>';
    }).join('');
  }

  function renderShopBoard() {
    if (!state.team) { hide(shopEl); return; }
    var roster = rosterByOwnerId(state.team);
    if (!roster) { hide(shopEl); return; }
    shopName.textContent = roster.teamName || roster.ownerName;
    renderRosterGroups(shopGroups, roster, state.shopSet);
    show(shopEl);
  }

  function renderTargetTray() {
    if (state.targetSet.size === 0) { hide(trayEl); return; }
    var chips = [];
    state.targetSet.forEach(function (pid) {
      var p = state.data.players[pid];
      if (!p) return;
      chips.push('<button type="button" class="fd-target-chip" data-pid="' + escapeHtml(pid) + '" title="Remove target">' +
        escapeHtml(p.name) +
        '<span class="fd-target-chip-x">✕</span>' +
      '</button>');
    });
    trayChips.innerHTML = chips.join('');
    show(trayEl);
  }

  function renderTargetBoard() {
    if (!state.team) { hide(targetEl); return; }
    fillBrowsePicker();
    renderTargetTray();
    if (state.browse) {
      var roster = rosterByOwnerId(state.browse);
      if (roster) renderRosterGroups(browseGroups, roster, state.targetSet);
    } else {
      browseGroups.innerHTML = '<div style="color:var(--td-mute);font-size:.85rem;padding:1rem 0;">Pick a roster above, then tap the players you want.</div>';
    }
    show(targetEl);
  }

  function selectedSet() { return state.mode === 'shop' ? state.shopSet : state.targetSet; }

  function renderAction() {
    var n = selectedSet().size;
    if (!state.team || n === 0) { hide(actionEl); return; }
    show(actionEl);
    actionSummary.innerHTML = state.mode === 'shop'
      ? '<strong>' + n + '</strong> player' + (n === 1 ? '' : 's') + ' on the block'
      : '<strong>' + n + '</strong> target' + (n === 1 ? '' : 's') + ' tagged';
    findBtn.disabled = state.busy || n === 0;
    // Mini tumbling football while the sweep runs (markup matches the
    // .tsc-spinner block in main.css; data-size="sm" rides in-button).
    findBtn.innerHTML = state.busy
      ? '<svg class="tsc-spinner" data-size="sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">' +
          '<g transform="rotate(-45 12 12)">' +
            '<ellipse cx="12" cy="12" rx="8.5" ry="5.2"/>' +
            '<path d="M9.7 12h4.6M10.8 10.8v2.4M12 10.8v2.4M13.2 10.8v2.4"/>' +
          '</g></svg>Sweeping rosters…'
      : 'Find Trades';
  }

  function renderBoards() {
    modeShopBtn.setAttribute('aria-selected', state.mode === 'shop' ? 'true' : 'false');
    modeTargetBtn.setAttribute('aria-selected', state.mode === 'target' ? 'true' : 'false');
    // The position chips mean different things per mode: shop = where
    // you want help; target = where you have surplus to deal from.
    var posLabel = $('fd-pos-label');
    var posHint = $('fd-pos-hint');
    if (posLabel) {
      posLabel.textContent = state.mode === 'shop' ? 'Improve at' : 'Surplus at';
    }
    if (posHint) {
      posHint.textContent = state.mode === 'shop'
        ? 'Optional — leave empty to consider every position.'
        : 'Optional — positions you have extra of; offers lead with these players.';
    }
    if (state.mode === 'shop') { hide(targetEl); renderShopBoard(); }
    else { hide(shopEl); renderTargetBoard(); }
    renderAction();
  }

  // ── Results ─────────────────────────────────────────────────────────
  var TIER_LABEL = { 'win-win': 'Likely yes', 'fair': 'Worth asking', 'longshot': 'Longshot' };

  function playerLine(p, addedSet) {
    var added = addedSet && addedSet[p.id] ? ' fd-added' : '';
    return '<li class="an-result-list-item' + added + '">' +
      '<span class="an-result-list-pos">' + escapeHtml(p.position || '—') + '</span>' +
      '<span class="an-result-list-name">' + escapeHtml(p.name) + '</span>' +
      '<span class="an-result-list-val">' + Math.round(p.value) + '</span>' +
    '</li>';
  }
  function impactLine(label, gain, gainPct, movements) {
    var g = Math.round(gain || 0);
    var pct = (gainPct || 0) * 100;
    var sign = g > 0 ? '+' : g < 0 ? '−' : '±';
    var tone = g > 5 ? 'up' : g < -5 ? 'down' : 'flat';
    var moves = (movements || []).map(function (m) {
      return m.position + ' ' + m.before + '→' + m.after;
    }).join(' · ');
    return '<div class="fd-impact" data-tone="' + tone + '">' +
      '<span>' + escapeHtml(label) + '</span>' +
      '<strong>' + sign + Math.abs(g) + ' (' + (pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(1) + '%)</strong>' +
      (moves ? '<span class="fd-impact-moves">' + escapeHtml(moves) + '</span>' : '') +
    '</div>';
  }

  // Which variant is active per deal index; -1 (or missing) = base deal.
  function activeCandidate(deal, i) {
    var sel = state.variantSel[i];
    if (typeof sel === 'number' && sel >= 0 && deal.variants && deal.variants[sel]) {
      return deal.variants[sel];
    }
    return deal.base;
  }

  function variantLabel(v) {
    var names = (v.addedReceives || []).concat(v.addedSends || [])
      .map(function (p) { return p.name; });
    return '+ ' + names.join(' + ');
  }

  // Cross-room handoff — opens the Analyzer with this deal (including any
  // expanded variant) on the table. Relative href rides the league <base>.
  function analyzerHref(deal, c) {
    var ids = function (arr) {
      return (arr || []).map(function (p) { return p.id; }).join(',');
    };
    var href = 'live-season/trades/analyzer/' +
      '?teamA=' + encodeURIComponent(state.team) +
      '&teamB=' + encodeURIComponent(deal.partnerOwnerId) +
      '&sends=' + encodeURIComponent(ids(c.sends)) +
      '&receives=' + encodeURIComponent(ids(c.receives));
    if (state.year) href += '&year=' + encodeURIComponent(state.year);
    return href;
  }

  function renderDeals() {
    var res = state.results || [];
    dealsEl.innerHTML = res.map(function (deal, i) {
      var c = activeCandidate(deal, i);
      var sel = state.variantSel[i];
      // Mark the pieces a variant pulled in so they glow in the lists.
      var addedSet = {};
      if (c !== deal.base) {
        (c.addedSends || []).concat(c.addedReceives || []).forEach(function (p) {
          addedSet[p.id] = true;
        });
      }
      var pills = '';
      if (deal.variants && deal.variants.length > 0) {
        pills = '<div class="fd-variants">' +
          '<span class="fd-variants-label">Expand</span>' +
          deal.variants.map(function (v, vi) {
            var on = sel === vi;
            return '<button type="button" class="fd-variant-pill" data-deal="' + i +
              '" data-variant="' + vi + '" aria-pressed="' + on + '">' +
              escapeHtml(variantLabel(v)) + '</button>';
          }).join('') +
        '</div>';
      }
      return '<article class="fd-deal">' +
        '<header class="fd-deal-head">' +
          '<span class="fd-deal-rank">' + (i + 1) + '.</span>' +
          '<span class="fd-deal-partner">Deal with <em>' + escapeHtml(deal.partnerName) + '</em></span>' +
          '<span class="fd-badge" data-tier="' + escapeHtml(c.fairness) + '">' +
            escapeHtml(TIER_LABEL[c.fairness] || c.fairness) + '</span>' +
        '</header>' +
        '<div class="fd-deal-cols">' +
          '<div class="fd-deal-col">' +
            '<div class="fd-deal-col-label">Send</div>' +
            '<ul class="an-result-list">' + c.sends.map(function (p) { return playerLine(p, addedSet); }).join('') + '</ul>' +
            '<div class="fd-deal-col-total">Raw value · <strong>' + Math.round(c.rawSendValue) + '</strong></div>' +
          '</div>' +
          '<div class="fd-deal-col">' +
            '<div class="fd-deal-col-label"><strong>Receive</strong></div>' +
            '<ul class="an-result-list">' + c.receives.map(function (p) { return playerLine(p, addedSet); }).join('') + '</ul>' +
            '<div class="fd-deal-col-total">Raw value · <strong>' + Math.round(c.rawReceiveValue) + '</strong></div>' +
          '</div>' +
        '</div>' +
        pills +
        '<div class="fd-deal-impacts">' +
          impactLine('Your lineup', c.userGain, c.userGainPct, c.userMovements) +
          impactLine('Their lineup', c.partnerGain, c.partnerGainPct, c.partnerMovements) +
        '</div>' +
        '<div class="fd-deal-foot">' +
          '<a class="fd-run" href="' + analyzerHref(deal, c) + '">Run it in the Analyzer →</a>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function renderResults() {
    var res = state.results || [];
    if (res.length === 0) { show(resultsEmpty); dealsEl.innerHTML = ''; }
    else { hide(resultsEmpty); renderDeals(); }
    show(resultsEl);
    scrollUnderNav(resultsEl);
  }

  // ── Events ──────────────────────────────────────────────────────────
  teamSel.addEventListener('change', function () {
    var val = teamSel.value || null;
    if (val !== state.team) {
      state.shopSet.clear();
      state.targetSet.clear();
      state.browse = null;
      state.results = null;
      state.variantSel = {};
      hide(resultsEl);
    }
    state.team = val;
    renderBoards();
  });

  modeShopBtn.addEventListener('click', function () {
    if (state.mode === 'shop') return;
    state.mode = 'shop';
    renderBoards();
  });
  modeTargetBtn.addEventListener('click', function () {
    if (state.mode === 'target') return;
    state.mode = 'target';
    renderBoards();
  });

  posChipsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.fd-pos-chip');
    if (!btn) return;
    var pos = btn.getAttribute('data-pos');
    if (state.improve.has(pos)) state.improve.delete(pos);
    else state.improve.add(pos);
    btn.setAttribute('aria-pressed', state.improve.has(pos) ? 'true' : 'false');
  });

  maxSideSel.addEventListener('change', function () {
    var n = Number(maxSideSel.value);
    state.maxPerSide = (n >= 1 && n <= 3) ? n : 2;
  });

  browseSel.addEventListener('change', function () {
    state.browse = browseSel.value || null;
    renderTargetBoard();
  });

  function onRowToggle(e, set) {
    var btn = e.target.closest('.an-row');
    if (!btn) return;
    var pid = btn.getAttribute('data-pid');
    if (set.has(pid)) set.delete(pid);
    else {
      if (set.size >= MAX_SELECTED) {
        alert('Up to ' + MAX_SELECTED + ' players per search.');
        return;
      }
      set.add(pid);
    }
    btn.setAttribute('aria-pressed', set.has(pid) ? 'true' : 'false');
    if (state.mode === 'target') renderTargetTray();
    renderAction();
  }
  shopGroups.addEventListener('click', function (e) { onRowToggle(e, state.shopSet); });
  browseGroups.addEventListener('click', function (e) { onRowToggle(e, state.targetSet); });

  trayChips.addEventListener('click', function (e) {
    var chip = e.target.closest('.fd-target-chip');
    if (!chip) return;
    state.targetSet.delete(chip.getAttribute('data-pid'));
    renderTargetBoard();
    renderAction();
  });

  // Sticky-state tracker: the action bar only earns its backdrop while
  // actually pinned to the viewport bottom. A zero-height sentinel right
  // after the bar tells us which state we're in — sentinel off-screen
  // below the fold means the bar is floating over content.
  (function () {
    if (!('IntersectionObserver' in window) || !actionEl) return;
    var sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    actionEl.insertAdjacentElement('afterend', sentinel);
    new IntersectionObserver(function (entries) {
      actionEl.setAttribute('data-stuck', entries[0].isIntersecting ? 'false' : 'true');
    }).observe(sentinel);
  })();

  // Variant pills — toggle an add-on expansion of a deal. Clicking the
  // active pill drops back to the base trade. Re-renders the board in
  // place (no scroll) so the swap feels instant.
  dealsEl.addEventListener('click', function (e) {
    var pill = e.target.closest('.fd-variant-pill');
    if (!pill) return;
    var di = Number(pill.getAttribute('data-deal'));
    var vi = Number(pill.getAttribute('data-variant'));
    state.variantSel[di] = state.variantSel[di] === vi ? -1 : vi;
    renderDeals();
  });

  findBtn.addEventListener('click', function () {
    if (state.busy) return;
    state.busy = true;
    renderAction();
    var url = '/api/leagues/' + state.leagueId + '/trade-desk/find';
    if (state.year) url += '?year=' + encodeURIComponent(state.year);
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        team: state.team,
        mode: state.mode,
        players: Array.from(selectedSet()),
        improvePositions: Array.from(state.improve),
        maxPerSide: state.maxPerSide,
      }),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.message || data.error || ('HTTP ' + res.status));
        return data;
      });
    }).then(function (data) {
      state.busy = false;
      state.results = data.results || [];
      state.variantSel = {};
      renderAction();
      renderResults();
    }).catch(function (err) {
      state.busy = false;
      renderAction();
      alert('Search failed: ' + (err.message || String(err)));
    });
  });

  clearBtn.addEventListener('click', function () {
    state.results = null;
    state.variantSel = {};
    hide(resultsEl);
    scrollUnderNav(controlsEl);
  });

  $('fd-year-select').addEventListener('change', function () {
    var raw = $('fd-year-select').value;
    var n = raw ? Number(raw) : null;
    state.year = Number.isFinite(n) ? n : null;
    writeYearToUrl(state.year);
    state.team = null;
    state.browse = null;
    state.shopSet.clear();
    state.targetSet.clear();
    state.results = null;
    state.variantSel = {};
    state.data = null;
    hide(resultsEl); hide(shopEl); hide(targetEl); hide(actionEl);
    hide(controlsEl); hide(errorEl);
    show(loadingEl);
    boot();
  });

  // ── Boot ────────────────────────────────────────────────────────────
  function boot() {
    var dc = window.__DC || {};
    if (!dc.id) {
      fail('No league context. Open this page through a league URL.');
      return;
    }
    state.leagueId = dc.id;
    if (state.year === null) state.year = readYearFromUrl();
    var sel = $('fd-year-select');
    if (sel) sel.value = state.year ? String(state.year) : '';
    var url = '/api/leagues/' + dc.id + '/analyze-trade/rosters';
    if (state.year) url += '?year=' + encodeURIComponent(state.year);
    fetch(url, { cache: 'no-store', credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.message || data.error || ('HTTP ' + res.status));
          return data;
        });
      })
      .then(function (data) {
        state.data = data;
        hide(loadingEl);
        renderModePill();
        fillTeamPicker();
        show(controlsEl);
        renderBoards();
      })
      .catch(function (err) { fail(err.message || String(err)); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
