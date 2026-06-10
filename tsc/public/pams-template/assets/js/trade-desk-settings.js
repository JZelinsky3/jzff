// trade-desk-settings.js — shared drawer for every Trade Desk page.
//
// What it does:
//   1. Mounts a gear button at the top-right of the page (fixed position).
//   2. On first click, fetches the league's settings + viewer's commish
//      status from /api/leagues/<id>/trade-desk/settings.
//   3. Renders the drawer: read-only summary for non-commish viewers,
//      editable form for the league's owner/editor.
//   4. On Save (commish), POSTs the new settings back and updates the
//      drawer in place. No page reload — the drawer is self-contained.
//
// Mounting requirement:
//   Each Trade Desk page (hub, grader, analyzer placeholder) must:
//     - Include this script: <script src="/pams-template/assets/js/trade-desk-settings.js"></script>
//     - Include the CSS:     <link rel="stylesheet" href="/pams-template/assets/css/trade-desk.css">
//     - Have <body> attribute data-trade-desk-room set to one of:
//       "hub", "grader", "analyzer" (used for analytics + future UX
//       branching — drawer doesn't behave differently per room today).
//   The script reads window.__DC.id for the league UUID, set by the
//   server-side route handler. If __DC.id is missing, the gear button
//   does not render (defensive — drawer would have no league to query).

(function () {
  'use strict';

  // ── Booted gate ─────────────────────────────────────────────────────
  // Belt-and-suspenders: a page that accidentally includes this script
  // twice still gets one gear button, one drawer.
  if (window.__tdSettingsBooted) return;
  window.__tdSettingsBooted = true;

  // ── Constants ───────────────────────────────────────────────────────
  var MODE_OPTIONS = [
    { value: '',         label: 'Auto-detect from platform' },
    { value: 'dynasty',  label: 'Dynasty' },
    { value: 'redraft',  label: 'Redraft' },
    { value: 'keeper',   label: 'Keeper' },
  ];
  var LINEUP_OPTIONS = [
    { value: '',          label: 'Auto-detect from platform' },
    { value: '1QB',       label: '1QB' },
    { value: 'SUPERFLEX', label: 'Superflex' },
  ];
  var SCORING_OPTIONS = [
    { value: '',         label: 'Auto-detect / default to PPR' },
    { value: 'STANDARD', label: 'Standard (0 PPR)' },
    { value: 'HALF',     label: 'Half-PPR (0.5)' },
    { value: 'PPR',      label: 'Full PPR (1.0)' },
  ];
  var TE_OPTIONS = [
    { value: '',     label: 'None' },
    { value: 'NONE', label: 'None' },
    { value: 'MILD', label: 'Mild (+0.5)' },
    { value: 'FULL', label: 'Full (+1.0)' },
  ];
  var SOURCE_OPTIONS = [
    { value: 'EQUAL',        label: 'Equal' },
    { value: 'FC_WEIGHTED',  label: 'FantasyCalc' },
    { value: 'DP_WEIGHTED',  label: 'DynastyProcess' },
  ];
  var DEADLINE_OPTIONS = (function () {
    var opts = [
      { value: '',  label: 'Auto-detect from platform' },
      { value: '0', label: 'No deadline — trades all season' },
    ];
    for (var w = 4; w <= 16; w++) {
      opts.push({ value: String(w), label: 'Week ' + w });
    }
    return opts;
  })();
  var SLOT_KEYS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SF', 'K', 'DEF', 'BENCH', 'IR', 'TAXI'];

  // ── DOM helpers ─────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function el(tag, opts) {
    var node = document.createElement(tag);
    if (!opts) return node;
    if (opts.cls)   node.className = opts.cls;
    if (opts.html != null) node.innerHTML = opts.html;
    if (opts.text != null) node.textContent = opts.text;
    if (opts.attrs) {
      Object.keys(opts.attrs).forEach(function (k) {
        node.setAttribute(k, opts.attrs[k]);
      });
    }
    return node;
  }
  function fmtConfirmedAt(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return date;
  }

  // ── State ───────────────────────────────────────────────────────────
  // Loaded once on first drawer open. Re-rendered after a successful
  // save so the "Last confirmed" line reflects the new timestamp.
  var state = {
    leagueId: null,
    settings: null,      // TradeDeskSettings shape (from API)
    isCommish: false,
    loaded: false,
    saving: false,
  };

  // ── API calls ───────────────────────────────────────────────────────
  function fetchSettings(leagueId) {
    return fetch('/api/leagues/' + leagueId + '/trade-desk/settings', {
      cache: 'no-store',
      credentials: 'same-origin',
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }
  function saveSettings(leagueId, body) {
    return fetch('/api/leagues/' + leagueId + '/trade-desk/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
        return data;
      });
    });
  }

  // ── Drawer rendering ────────────────────────────────────────────────
  function renderSelect(opts, current, name, disabled) {
    var options = opts.map(function (o) {
      var selected = (current || '') === o.value ? ' selected' : '';
      return '<option value="' + escapeHtml(o.value) + '"' + selected + '>' +
        escapeHtml(o.label) + '</option>';
    }).join('');
    return '<select class="td-select" name="' + name + '"' +
      (disabled ? ' disabled' : '') + '>' + options + '</select>';
  }
  function renderRadioGroup(opts, current, name, disabled) {
    return '<div class="td-radio-group" role="radiogroup">' +
      opts.map(function (o) {
        var checked = current === o.value;
        return '<label class="td-radio" data-checked="' + checked +
          '"' + (disabled ? ' aria-disabled="true"' : '') + '>' +
          '<input type="radio" name="' + name + '" value="' +
          escapeHtml(o.value) + '"' + (checked ? ' checked' : '') +
          (disabled ? ' disabled' : '') + '>' +
          '<span>' + escapeHtml(o.label) + '</span>' +
          '</label>';
      }).join('') + '</div>';
  }
  function renderSlotGrid(slots, disabled) {
    var rows = SLOT_KEYS.map(function (k) {
      var v = (slots && slots[k] != null) ? slots[k] : '';
      return '<label class="td-slot">' +
        '<span class="td-slot-name">' + k + '</span>' +
        '<input type="number" inputmode="numeric" min="0" max="40"' +
        ' data-slot="' + k + '" value="' + escapeHtml(v) + '"' +
        ' placeholder="—"' + (disabled ? ' disabled' : '') + '>' +
        '</label>';
    }).join('');
    return '<div class="td-slot-grid">' + rows + '</div>';
  }

  function renderBody() {
    var s = state.settings || {};
    var disabled = !state.isCommish;
    var html = '';

    if (!state.isCommish) {
      html += '<div class="td-banner" data-tone="muted">' +
        'You are viewing as a league member. Only the commissioner can edit these settings.' +
        '</div>';
    } else if (!s.confirmedAt) {
      html += '<div class="td-banner" data-tone="warn">' +
        'Settings haven\'t been confirmed yet for this league. ' +
        'Anything left on auto-detect will use the platform sync. ' +
        'Confirm below to lock in your preferences.' +
        '</div>';
    }

    // Mode
    html += '<div class="td-section">' +
      '<span class="td-section-label">League Mode</span>' +
      '<p class="td-section-hint">Dynasty / Redraft / Keeper. Override the platform auto-detect when it gets it wrong.</p>' +
      renderSelect(MODE_OPTIONS, s.modeOverride, 'modeOverride', disabled) +
      '</div>';

    // Lineup
    html += '<div class="td-section">' +
      '<span class="td-section-label">Lineup Type</span>' +
      '<p class="td-section-hint">Superflex doubles QB scarcity in the value engine. Auto-detected from Sleeper roster positions.</p>' +
      renderSelect(LINEUP_OPTIONS, s.lineupType, 'lineupType', disabled) +
      '</div>';

    // Team count
    html += '<div class="td-section">' +
      '<span class="td-section-label">Number of Teams</span>' +
      '<p class="td-section-hint">Leave blank to use the platform total. Override only if the count is mid-flux this season.</p>' +
      '<input type="number" class="td-input" name="teamCount" min="4" max="32"' +
      ' placeholder="Auto-detect" value="' + escapeHtml(s.teamCount != null ? s.teamCount : '') + '"' +
      (disabled ? ' disabled' : '') + '>' +
      '</div>';

    // Scoring profile
    html += '<div class="td-section">' +
      '<span class="td-section-label">Scoring Profile</span>' +
      '<p class="td-section-hint">Drives the FantasyCalc PPR parameter and the Analyzer\'s player adjustments.</p>' +
      renderSelect(SCORING_OPTIONS, s.scoringProfile, 'scoringProfile', disabled) +
      '</div>';

    // TE Premium
    html += '<div class="td-section">' +
      '<span class="td-section-label">TE Premium</span>' +
      '<p class="td-section-hint">Mild = +0.5, Full = +1.0 bonus to TE values in the Analyzer.</p>' +
      renderSelect(TE_OPTIONS, s.tePremium, 'tePremium', disabled) +
      '</div>';

    // Roster slots
    html += '<div class="td-section">' +
      '<span class="td-section-label">Starting Slots</span>' +
      '<p class="td-section-hint">Override per-position starter counts. Leave blank to inherit from the platform.</p>' +
      renderSlotGrid(s.rosterSlots || {}, disabled) +
      '</div>';

    // Value source preference
    html += '<div class="td-section">' +
      '<span class="td-section-label">Value Source Preference</span>' +
      '<p class="td-section-hint">The Analyzer blends FantasyCalc and DynastyProcess. Equal is the default 50/50; weighted shifts to 75/25.</p>' +
      renderRadioGroup(SOURCE_OPTIONS, s.valueSourcePreference || 'EQUAL', 'valueSourcePreference', disabled) +
      '</div>';

    // Trade deadline
    html += '<div class="td-section">' +
      '<span class="td-section-label">Trade Deadline</span>' +
      '<p class="td-section-hint">When trades lock for the season. Auto-detect works on Sleeper; ESPN, NFL.com, and Yahoo leagues should set it here. After the deadline the desk shows closed and the Rumor Mill stops printing.</p>' +
      renderSelect(DEADLINE_OPTIONS, s.tradeDeadlineWeek != null ? String(s.tradeDeadlineWeek) : '', 'tradeDeadlineWeek', disabled) +
      '</div>';

    return html;
  }
  function renderFoot() {
    var s = state.settings || {};
    var confirmedLine = '';
    if (s.confirmedAt) {
      confirmedLine = '<div class="td-foot-confirmed">Last confirmed <strong>' +
        escapeHtml(fmtConfirmedAt(s.confirmedAt)) + '</strong></div>';
    } else {
      confirmedLine = '<div class="td-foot-confirmed">Not yet confirmed.</div>';
    }
    if (!state.isCommish) {
      return confirmedLine;
    }
    return confirmedLine +
      '<div class="td-foot-row">' +
        '<button type="button" class="td-btn" data-action="close">Cancel</button>' +
        '<button type="button" class="td-btn" data-variant="primary" data-action="save">Save</button>' +
        '<span class="td-foot-status" id="td-foot-status"></span>' +
      '</div>';
  }

  // ── Drawer mount ────────────────────────────────────────────────────
  var overlay, drawer, drawerBody, drawerFoot;

  function ensureDrawer() {
    if (drawer) return;
    overlay = el('div', { cls: 'td-drawer-overlay', attrs: { 'data-open': 'false' } });
    drawer = el('aside', {
      cls: 'td-drawer',
      attrs: { 'data-open': 'false', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Trade Desk settings' },
    });
    drawer.innerHTML =
      '<div class="td-drawer-head">' +
        '<div>' +
          '<div class="td-drawer-sup">The Trade Desk</div>' +
          '<h2 class="td-drawer-title">Settings.</h2>' +
        '</div>' +
        '<button type="button" class="td-drawer-close" data-action="close" aria-label="Close settings">×</button>' +
      '</div>' +
      '<div class="td-drawer-body" id="td-drawer-body">' +
        '<div class="td-banner">Loading settings…</div>' +
      '</div>' +
      '<div class="td-drawer-foot" id="td-drawer-foot"></div>';
    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
    drawerBody = drawer.querySelector('#td-drawer-body');
    drawerFoot = drawer.querySelector('#td-drawer-foot');

    overlay.addEventListener('click', closeDrawer);
    drawer.addEventListener('click', handleDrawerClick);
    drawer.addEventListener('change', handleDrawerChange);
    drawer.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });
  }
  function repaintDrawer() {
    if (!drawerBody) return;
    drawerBody.innerHTML = renderBody();
    drawerFoot.innerHTML = renderFoot();
  }
  function openDrawer() {
    ensureDrawer();
    overlay.setAttribute('data-open', 'true');
    drawer.setAttribute('data-open', 'true');
    document.body.style.overflow = 'hidden';

    if (!state.loaded) {
      drawerBody.innerHTML = '<div class="td-banner">Loading settings…</div>';
      drawerFoot.innerHTML = '';
      fetchSettings(state.leagueId).then(function (data) {
        state.settings = data.settings;
        state.isCommish = !!data.isCommish;
        state.loaded = true;
        repaintDrawer();
      }).catch(function (err) {
        drawerBody.innerHTML = '<div class="td-banner" data-tone="warn">' +
          'Couldn\'t load settings: ' + escapeHtml(err.message || String(err)) + '</div>';
      });
    }
  }
  function closeDrawer() {
    if (!drawer) return;
    overlay.setAttribute('data-open', 'false');
    drawer.setAttribute('data-open', 'false');
    document.body.style.overflow = '';
  }

  // ── Drawer interactions ─────────────────────────────────────────────
  function handleDrawerClick(e) {
    var t = e.target.closest('[data-action]');
    if (!t) {
      // Custom radio behavior — clicking a .td-radio toggles the underlying input
      var radio = e.target.closest('.td-radio');
      if (radio && !radio.getAttribute('aria-disabled')) {
        var input = radio.querySelector('input[type="radio"]');
        if (input) {
          input.checked = true;
          // Reset siblings' data-checked
          radio.parentElement.querySelectorAll('.td-radio').forEach(function (n) {
            n.setAttribute('data-checked', 'false');
          });
          radio.setAttribute('data-checked', 'true');
        }
      }
      return;
    }
    var action = t.getAttribute('data-action');
    if (action === 'close') {
      closeDrawer();
    } else if (action === 'save') {
      doSave();
    }
  }
  function handleDrawerChange() {
    // No-op for now; the form is read on Save rather than per-field
    // so we don't trigger a redraw on every keystroke. Hook lives here
    // in case we want a "dirty" indicator later.
  }
  function collectForm() {
    // Reads the form back into the TradeDeskSettings shape. Empty values
    // become null (matching the schema's "leave blank to auto-detect").
    var get = function (name) {
      var n = drawerBody.querySelector('[name="' + name + '"]');
      return n ? n.value : '';
    };
    var slots = {};
    drawerBody.querySelectorAll('[data-slot]').forEach(function (n) {
      var k = n.getAttribute('data-slot');
      var v = n.value.trim();
      if (v !== '' && !isNaN(Number(v))) slots[k] = Number(v);
    });
    var radioChecked = drawerBody.querySelector('input[name="valueSourcePreference"]:checked');
    var teamCountRaw = get('teamCount').trim();
    var deadlineRaw = get('tradeDeadlineWeek');

    return {
      modeOverride:           get('modeOverride')   || null,
      lineupType:             get('lineupType')     || null,
      scoringProfile:         get('scoringProfile') || null,
      tePremium:              get('tePremium')      || null,
      teamCount:              teamCountRaw === '' ? null : Number(teamCountRaw),
      rosterSlots:            Object.keys(slots).length > 0 ? slots : null,
      valueSourcePreference:  radioChecked ? radioChecked.value : 'EQUAL',
      // '' = auto-detect (null), '0' = no deadline, '4'..'16' = that week.
      tradeDeadlineWeek:      deadlineRaw === '' ? null : Number(deadlineRaw),
    };
  }
  function doSave() {
    if (state.saving) return;
    state.saving = true;
    var status = document.getElementById('td-foot-status');
    if (status) status.textContent = 'Saving…';
    drawerBody.querySelectorAll('input, select, button').forEach(function (n) {
      n.disabled = true;
    });
    var body = collectForm();
    saveSettings(state.leagueId, body).then(function (data) {
      state.settings = data.settings;
      state.isCommish = !!data.isCommish;
      state.saving = false;
      repaintDrawer();
      var s = document.getElementById('td-foot-status');
      if (s) s.textContent = 'Saved';
      setTimeout(function () {
        var s2 = document.getElementById('td-foot-status');
        if (s2 && s2.textContent === 'Saved') s2.textContent = '';
      }, 1800);
    }).catch(function (err) {
      state.saving = false;
      var s = document.getElementById('td-foot-status');
      if (s) s.textContent = (err.message || 'failed').slice(0, 60);
      drawerBody.querySelectorAll('input, select, button').forEach(function (n) {
        n.disabled = false;
      });
    });
  }

  // ── Inline trigger mount ────────────────────────────────────────────
  // The hub page renders one or more elements with [data-td-settings-open]
  // (typically the §02 Settings card). This wires every match to
  // openDrawer(). No floating gear — the trigger lives where users are
  // already scanning.
  function mountTriggers() {
    var dc = window.__DC || {};
    if (!dc.id) return;
    state.leagueId = dc.id;
    var triggers = document.querySelectorAll('[data-td-settings-open]');
    triggers.forEach(function (t) {
      t.addEventListener('click', function (e) {
        e.preventDefault();
        openDrawer();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountTriggers);
  } else {
    mountTriggers();
  }
})();
