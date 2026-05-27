// trades.js — renders the public trades list for a league.
// Reads JSON from /leagues/<slug>/live-season/trades/data.
//
// Buckets: This Week / Earlier / The Verdict. Each trade card shows per-side
// grades + blurbs when graded. Sides without a grade render a quiet placeholder.
// A tier-locked response shows the Veteran upgrade CTA.

(function () {
  'use strict';

  var content = document.getElementById('content');

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

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

  // ── Grade color classes ─────────────────────────────────────────────────
  // Map letter grade to a CSS modifier (defined in trades/index.html).
  function gradeClass(g) {
    if (!g) return '';
    var first = g[0];
    if (first === 'A') return 'g-a';
    if (first === 'B') return 'g-b';
    if (first === 'C') return 'g-c';
    if (first === 'D' || first === 'F') return 'g-d';
    return '';
  }

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
      var label = a.season_year + ' ' + ordinal(a.round) + ' rd';
      return '<div class="tr-asset kind-pick">' +
        '<span class="tr-asset-pos">PICK</span>' +
        '<span class="tr-asset-name">' + escapeHtml(label) + '</span>' +
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
    // Initial grade: the big letter + blurb.
    // If `opts.showRevisit` and side has revisit_grade, render BOTH the
    // original grade (smaller, struck-style) and the new grade (large).
    if (opts && opts.showRevisit && s.revisit_grade) {
      return '<div class="tr-grade tr-grade-revisit">' +
        '<div class="tr-grade-row">' +
          '<span class="tr-grade-letter tr-grade-then ' + gradeClass(s.grade) + '">' + escapeHtml(s.grade || '—') + '</span>' +
          '<span class="tr-grade-arrow">→</span>' +
          '<span class="tr-grade-letter ' + gradeClass(s.revisit_grade) + '">' + escapeHtml(s.revisit_grade) + '</span>' +
        '</div>' +
        (s.revisit_blurb
          ? '<p class="tr-grade-blurb">' + escapeHtml(s.revisit_blurb) + '</p>'
          : '') +
      '</div>';
    }
    if (s.grade) {
      return '<div class="tr-grade">' +
        '<span class="tr-grade-letter ' + gradeClass(s.grade) + '">' + escapeHtml(s.grade) + '</span>' +
        (s.blurb
          ? '<p class="tr-grade-blurb">' + escapeHtml(s.blurb) + '</p>'
          : '') +
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
    return '<div class="tr-card">' +
      '<div class="tr-card-head">' +
        '<span class="tr-date">' + escapeHtml(fmtDate(t.executed_at)) + '</span>' +
        '<span class="tr-week">' + escapeHtml(weekLabel) + '</span>' +
        '<span>' + escapeHtml(t.season_year || '') + '</span>' +
        '<span class="tr-plat">' + escapeHtml(t.platform || '') + '</span>' +
      '</div>' +
      '<div class="tr-sides" data-count="' + n + '">' + sides + '</div>' +
    '</div>';
  }

  function renderSection(opts) {
    var trades = opts.trades || [];
    if (trades.length === 0 && !opts.showEmpty) return '';
    var body = trades.length > 0
      ? '<div class="tr-list">' + trades.map(function (t) { return renderTrade(t, opts.cardOpts || {}); }).join('') + '</div>'
      : '<div class="tr-section-empty">' + escapeHtml(opts.emptyText || '') + '</div>';
    return '<section class="tr-section">' +
      '<div class="tr-section-head">' +
        '<span class="tr-section-num">' + escapeHtml(opts.num) + '</span>' +
        '<span class="tr-section-title">' + opts.title + '</span>' +
        (opts.meta ? '<span class="tr-section-meta">' + escapeHtml(opts.meta) + '</span>' : '') +
      '</div>' +
      body +
    '</section>';
  }

  async function boot() {
    try {
      var res = await fetch('live-season/trades/data', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();

      if (data.status === 'no-league') {
        return showEmpty('League not found', 'Check the URL and try again.');
      }
      if (data.status === 'tier-locked') {
        return showTierLocked();
      }
      if (data.status === 'no-trades') {
        return showEmpty('No trades yet', 'Once a trade is completed on your platform, it will show up here.');
      }

      var html = '';

      // § 01 · This Week
      if (data.this_week && data.this_week.length > 0) {
        html += renderSection({
          num: '§ 01 · This Week',
          title: 'Just <em>landed —</em>',
          meta: data.this_week.length + ' trade' + (data.this_week.length === 1 ? '' : 's'),
          trades: data.this_week,
        });
      }

      // § 02 · The Verdict (revisits)
      if (data.verdict && data.verdict.length > 0) {
        html += renderSection({
          num: '§ 02 · The Verdict',
          title: 'Four weeks <em>later —</em>',
          meta: 'How they actually played out',
          trades: data.verdict,
          cardOpts: { showRevisit: true },
        });
      }

      // § 03 · Earlier (everything else)
      if (data.earlier && data.earlier.length > 0) {
        html += renderSection({
          num: data.this_week && data.this_week.length > 0 ? '§ 03 · Earlier' : '§ 01 · Trades',
          title: 'The <em>archive —</em>',
          meta: data.earlier.length + ' trade' + (data.earlier.length === 1 ? '' : 's'),
          trades: data.earlier,
        });
      }

      if (!html) {
        return showEmpty('No trades yet', 'Once a trade is completed on your platform, it will show up here.');
      }

      content.innerHTML = html;
    } catch (e) {
      console.error(e);
      showEmpty('Couldn’t load trades', String(e));
    }
  }

  boot();
})();
