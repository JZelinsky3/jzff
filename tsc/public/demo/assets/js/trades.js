// trades.js — Trade Grader page renderer.
//
// Tabs: Current / Past / Verdicts.
//   • Current  — trades from the last 7 days + verdicts that landed this week
//   • Past     — every trade older than 7 days
//   • Verdicts — every revisited trade ever, newest revisit first
// Tier-locked leagues see the Veteran upgrade CTA in place of the data.

(function () {
  'use strict';

  var content = document.getElementById('content');

  // ── Commissioner-only theme picker ─────────────────────────────────────
  // Renders only for the league owner (__DC.isCommish). Writes to
  // /api/leagues/<id>/trades-theme and reloads so the server can re-render
  // with the new body data-attribute. Theme list mirrors the four demos
  // at /demo/trade-themes/ and the four blocks in trades.css.
  var THEMES = [
    { id: 'cards',    label: 'Card Show' },
    { id: 'tribunal', label: 'The Tribunal' },
    { id: 'wire',     label: 'Wire Service' },
    { id: 'floor',    label: 'Trading Floor' },
  ];

  function renderThemePicker() {
    var slot = document.getElementById('theme-picker');
    if (!slot) return;
    var dc = window.__DC || {};
    if (!dc.isCommish || !dc.id) return;
    var current = dc.tradesTheme || 'cards';
    var buttons = THEMES.map(function (t) {
      return '<button type="button" class="tr-theme-btn' + (t.id === current ? ' active' : '') +
        '" data-theme="' + t.id + '">' + escapeHtml(t.label) + '</button>';
    }).join('');
    slot.innerHTML =
      '<div class="tr-theme-picker">' +
        '<span class="tr-theme-label">Theme</span>' +
        '<div class="tr-theme-options">' + buttons + '</div>' +
        '<span id="tr-theme-status" class="tr-theme-status"></span>' +
      '</div>';
    var status = document.getElementById('tr-theme-status');
    var btns = slot.querySelectorAll('.tr-theme-btn');
    btns.forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var theme = btn.getAttribute('data-theme');
        if (!theme || btn.classList.contains('active')) return;
        // Optimistic UI: mark this button active and apply theme locally.
        btns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        document.body.setAttribute('data-trades-theme', theme);
        status.textContent = 'Saving…';
        btns.forEach(function (b) { b.disabled = true; });
        try {
          var res = await fetch('/api/leagues/' + dc.id + '/trades-theme/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme: theme }),
          });
          if (!res.ok) {
            var body = await res.json().catch(function () { return {}; });
            status.textContent = body.error || ('Error ' + res.status);
            btns.forEach(function (b) { b.disabled = false; });
            return;
          }
          status.textContent = 'Saved · reloading…';
          setTimeout(function () { window.location.reload(); }, 350);
        } catch (e) {
          status.textContent = (e && e.message) || 'failed';
          btns.forEach(function (b) { b.disabled = false; });
        }
      });
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'];
    var v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function gradeClass(g) {
    if (!g) return '';
    var first = g[0];
    if (first === 'A') return 'g-a';
    if (first === 'B') return 'g-b';
    if (first === 'C') return 'g-c';
    if (first === 'D' || first === 'F') return 'g-d';
    return '';
  }

  // ── Special-state screens ──────────────────────────────────────────────
  function showEmpty(title, sub) {
    content.innerHTML =
      '<div class="tr-empty">' +
        '<h2>' + escapeHtml(title) + '</h2>' +
        '<p>' + escapeHtml(sub) + '</p>' +
      '</div>';
  }
  function showTierLocked() {
    content.innerHTML =
      '<div class="tr-lock">' +
        '<div class="tr-lock-icon">★</div>' +
        '<h2>Trade Grader is a <em>Veteran</em> feature.</h2>' +
        '<p>Auto-graded trades and 4-week verdicts unlock when this league\'s commissioner is on the Veteran plan.</p>' +
        '<a class="tr-lock-cta" href="/pricing">See Veteran plan →</a>' +
      '</div>';
  }

  // ── Card rendering ─────────────────────────────────────────────────────
  function renderAsset(a) {
    if (a.kind === 'player') {
      var pos = a.position || '—';
      var team = a.team ? ' · ' + escapeHtml(a.team) : '';
      var name = a.name || ('Player ' + (a.player_id || ''));
      return '<div class="tr-asset kind-player">' +
        '<span class="tr-asset-pos">' + escapeHtml(pos) + '</span>' +
        '<span class="tr-asset-name">' + escapeHtml(name) + '</span>' +
        '<span class="tr-asset-team">' + team + '</span>' +
      '</div>';
    }
    if (a.kind === 'pick') {
      return '<div class="tr-asset kind-pick">' +
        '<span class="tr-asset-pos">PICK</span>' +
        '<span class="tr-asset-name">' + escapeHtml(a.season_year + ' ' + ordinal(a.round) + ' rd') + '</span>' +
      '</div>';
    }
    if (a.kind === 'faab') {
      return '<div class="tr-asset kind-faab">' +
        '<span class="tr-asset-pos">FAAB</span>' +
        '<span class="tr-asset-name">$' + escapeHtml(a.amount) + '</span>' +
      '</div>';
    }
    return '';
  }

  function renderGradeBadge(s, opts) {
    if (opts && opts.showRevisit && s.revisit_grade) {
      return '<div class="tr-grade tr-grade-revisit">' +
        '<div class="tr-grade-row">' +
          '<span class="tr-grade-letter tr-grade-then ' + gradeClass(s.grade) + '">' + escapeHtml(s.grade || '—') + '</span>' +
          '<span class="tr-grade-arrow">→</span>' +
          '<span class="tr-grade-letter ' + gradeClass(s.revisit_grade) + '">' + escapeHtml(s.revisit_grade) + '</span>' +
        '</div>' +
      '</div>';
    }
    if (s.grade) {
      return '<div class="tr-grade">' +
        '<span class="tr-grade-letter ' + gradeClass(s.grade) + '">' + escapeHtml(s.grade) + '</span>' +
      '</div>';
    }
    return '<div class="tr-grade tr-grade-pending">Grade pending</div>';
  }

  function renderSide(s, opts) {
    var assets = (s.assets || []).map(renderAsset).join('');
    if (!assets) {
      assets = '<div class="tr-asset"><span class="tr-asset-name" style="color:var(--cream-mute);font-style:italic;">Nothing received</span></div>';
    }
    var avatar = s.manager.avatar_url
      ? '<img class="tr-side-avatar" src="' + escapeHtml(s.manager.avatar_url) + '" alt="">'
      : '<span class="tr-side-avatar" aria-hidden="true"></span>';
    var team = s.manager.team_name && s.manager.team_name !== s.manager.display_name
      ? '<div class="tr-side-team">' + escapeHtml(s.manager.team_name) + '</div>'
      : '';
    return '<div class="tr-side">' +
      '<div class="tr-side-head">' +
        avatar +
        '<div>' +
          '<div class="tr-side-name">' + escapeHtml(s.manager.display_name) + '</div>' +
          team +
        '</div>' +
      '</div>' +
      '<div class="tr-side-label">Received</div>' +
      '<div class="tr-assets">' + assets + '</div>' +
      renderGradeBadge(s, opts) +
    '</div>';
  }

  function renderTrade(t, opts) {
    var weekLabel = (t.week != null) ? 'Week ' + t.week : 'Pre-season';
    var sides = (t.sides || []).map(function (s) { return renderSide(s, opts); }).join('');
    var n = (t.sides || []).length;
    var summaryText = (opts && opts.showRevisit && t.revisit_summary) || t.ai_summary || '';
    var summaryHtml = summaryText
      ? '<div class="tr-summary">' + escapeHtml(summaryText) + '</div>'
      : '';
    return '<div class="tr-card">' +
      '<div class="tr-card-head">' +
        '<span class="tr-date">' + escapeHtml(fmtDate(t.executed_at)) + '</span>' +
        '<span class="tr-week">' + escapeHtml(weekLabel) + '</span>' +
        '<span>' + escapeHtml(t.season_year || '') + '</span>' +
        '<span class="tr-plat">' + escapeHtml(t.platform || '') + '</span>' +
      '</div>' +
      summaryHtml +
      '<div class="tr-sides" data-count="' + n + '">' + sides + '</div>' +
    '</div>';
  }

  function renderSection(opts) {
    var trades = opts.trades || [];
    if (trades.length === 0 && !opts.alwaysRender) return '';
    var body = trades.length > 0
      ? '<div class="tr-list">' + trades.map(function (t) { return renderTrade(t, opts.cardOpts || {}); }).join('') + '</div>'
      : '<div class="tr-section-empty">' + escapeHtml(opts.emptyText || '') + '</div>';
    var meta = opts.meta ? '<span class="tr-section-meta">' + escapeHtml(opts.meta) + '</span>' : '';
    return '<section class="tr-section">' +
      '<div class="tr-section-head">' +
        '<span class="tr-section-num">' + escapeHtml(opts.num) + '</span>' +
        '<span class="tr-section-title">' + opts.title + '</span>' +
        meta +
      '</div>' +
      body +
    '</section>';
  }

  // ── Tab content ────────────────────────────────────────────────────────
  function renderCurrentTab(data) {
    var trades = data.current_trades || [];
    var verdicts = data.current_verdicts || [];
    if (trades.length === 0 && verdicts.length === 0) {
      return '<div class="tr-empty">' +
        '<h2>Nothing this week</h2>' +
        '<p>No trades executed or verdicts revisited in the last 7 days. Check the Past tab for the archive.</p>' +
      '</div>';
    }
    return (
      renderSection({
        num: '§ 01 · This Week',
        title: 'Just <em>landed —</em>',
        meta: trades.length > 0 ? trades.length + ' trade' + (trades.length === 1 ? '' : 's') : 'Last 7 days',
        trades: trades,
        alwaysRender: true,
        emptyText: 'Nothing new this week.',
      }) +
      renderSection({
        num: '§ 02 · The Verdict',
        title: 'Four weeks <em>later —</em>',
        meta: verdicts.length > 0 ? 'How they actually played out' : 'Revisits land 4 weeks after each trade',
        trades: verdicts,
        cardOpts: { showRevisit: true },
        alwaysRender: true,
        emptyText: 'No revisits this week.',
      })
    );
  }

  function renderPastTab(data) {
    var trades = data.past_trades || [];
    if (trades.length === 0) {
      return '<div class="tr-empty">' +
        '<h2>No archive yet</h2>' +
        '<p>Past trades will appear here once they\'re more than 7 days old.</p>' +
      '</div>';
    }
    return renderSection({
      num: '§ 01 · Archive',
      title: 'Older <em>trades —</em>',
      meta: trades.length + ' trade' + (trades.length === 1 ? '' : 's'),
      trades: trades,
      alwaysRender: true,
    });
  }

  function renderVerdictsTab(data) {
    var verdicts = data.all_verdicts || [];
    if (verdicts.length === 0) {
      return '<div class="tr-empty">' +
        '<h2>No verdicts yet</h2>' +
        '<p>Verdicts land 4 weeks after each trade. Once we revisit some, they all show up here — newest first.</p>' +
      '</div>';
    }
    return renderSection({
      num: '§ 01 · Retrospectives',
      title: 'Every <em>verdict —</em>',
      meta: verdicts.length + ' revisited',
      trades: verdicts,
      cardOpts: { showRevisit: true },
      alwaysRender: true,
    });
  }

  var TABS = [
    { id: 'current',  label: 'Current',  render: renderCurrentTab },
    { id: 'past',     label: 'Past',     render: renderPastTab },
    { id: 'verdicts', label: 'Verdicts', render: renderVerdictsTab },
  ];

  function setTab(tabId, data) {
    document.querySelectorAll('.tr-tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });
    var pane = document.getElementById('tab-pane');
    if (!pane) return;
    var tab = TABS.find(function (t) { return t.id === tabId; });
    pane.innerHTML = tab ? tab.render(data) : '';
  }
  // Exposed for inline onclick handlers in the tab bar.
  window.__trTabClick = function (id) {
    if (window.__trData) setTab(id, window.__trData);
  };

  function defaultTabFor(data) {
    if ((data.current_trades && data.current_trades.length) ||
        (data.current_verdicts && data.current_verdicts.length)) return 'current';
    if (data.past_trades && data.past_trades.length) return 'past';
    if (data.all_verdicts && data.all_verdicts.length) return 'verdicts';
    return 'current';
  }

  // ── Boot ───────────────────────────────────────────────────────────────
  async function boot() {
    // Render the picker BEFORE the data fetch so commissioners see it even on
    // a tier-locked / no-trades response.
    renderThemePicker();
    try {
      var res = await fetch('live/trades/data.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();

      if (data.status === 'no-league')   return showEmpty('League not found', 'Check the URL and try again.');
      if (data.status === 'tier-locked') return showTierLocked();
      if (data.status === 'no-trades')   return showEmpty('No trades yet', 'Once a trade is completed on your platform, it will show up here.');

      window.__trData = data;
      var initialTab = defaultTabFor(data);

      var tabBar = TABS.map(function (t) {
        return '<button class="tr-tab' + (t.id === initialTab ? ' active' : '') + '" data-tab="' + t.id + '" onclick="__trTabClick(\'' + t.id + '\')">' + escapeHtml(t.label) + '</button>';
      }).join('');

      content.innerHTML =
        '<nav class="tr-tabs" aria-label="Trade Grader sections">' + tabBar + '</nav>' +
        '<div id="tab-pane"></div>';
      setTab(initialTab, data);
    } catch (e) {
      console.error(e);
      showEmpty('Couldn’t load trades', String(e));
    }
  }

  boot();
})();
