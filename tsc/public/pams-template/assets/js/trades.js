// trades.js — renders the public trades list for a league.
// Reads JSON from /leagues/<slug>/live-season/trades/data and paints cards.
// Phase 1: no grades — every side renders a "Grade pending" placeholder.

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

  function renderSide(s) {
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
      '<div class="tr-grade-placeholder">Grade pending</div>' +
    '</div>';
  }

  function renderTrade(t) {
    var weekLabel = (t.week != null) ? 'Week ' + t.week : 'Pre-season';
    var sides = (t.sides || []).map(renderSide).join('');
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

  async function boot() {
    try {
      var res = await fetch('live-season/trades/data', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();

      if (data.status === 'no-league') {
        return showEmpty('League not found', 'Check the URL and try again.');
      }
      if (data.status === 'no-trades') {
        return showEmpty('No trades yet', 'Once a trade is completed on your platform, it will show up here.');
      }

      var html = '<div class="tr-list">' +
        (data.trades || []).map(renderTrade).join('') +
      '</div>';
      content.innerHTML = html;
    } catch (e) {
      console.error(e);
      showEmpty('Couldn’t load trades', String(e));
    }
  }

  boot();
})();
