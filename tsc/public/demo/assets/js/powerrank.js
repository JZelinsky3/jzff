// powerrank.js — Dynasty Codex power rankings.
//
// Ported from the PA Milk Society demo: podium / table / factor-bar /
// projections rendering kept verbatim so the page looks identical. The data
// layer is swapped — one fetch of /leagues/<slug>/live-season/powerrank/data returns every
// week's ranking plus Monte Carlo projections. Division views are dynamic;
// a league with no divisions hides the view tabs + conference grid.

(function () {
  'use strict'

  function byId(id) { return document.getElementById(id) }
  function esc(s) {
    return String(s == null ? '' : s)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#39;')
  }

  var state = { data: null, weeks: [], activeWk: null, view: 'overall' }

  boot().catch(function (e) { console.error(e); showMessage('Couldn’t load power rankings.', String(e)) })

  // ── Boot ────────────────────────────────────────────────────────────────
  async function boot() {
    bindFormulaPopup()
    var res = await fetch('live-season/powerrank/data.json', { cache: 'no-store' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    var data = await res.json()

    if (data.status === 'no-live') {
      return showMessage('No live season', 'Power rankings run during the season. Check back when the commissioner sets a live week.')
    }
    if (data.status === 'no-week' || !data.weeks || !data.weeks.length) {
      return showMessage('Rankings coming Week 1', 'Power rankings appear once the season is live and the roster is set.')
    }

    state.data = data
    state.weeks = data.weeks
    byId('prMessage').hidden = true
    byId('mainContent').hidden = false

    renderWeekTabs()
    renderViewTabs()
    state.activeWk = state.weeks[state.weeks.length - 1].id
    setActiveWeekTab(state.activeWk)
    render()
  }

  function showMessage(title, body) {
    var m = byId('prMessage')
    if (m) {
      m.hidden = false
      m.innerHTML = '<h2>' + esc(title) + '</h2><p>' + esc(body) + '</p>'
    }
    var main = byId('mainContent')
    if (main) main.hidden = true
  }

  // ── Formula popup ───────────────────────────────────────────────────────
  function bindFormulaPopup() {
    var popup = byId('formulaPopup')
    if (!popup) return
    var open = byId('formulaBtn')
    var close = byId('formulaClose')
    var backdrop = popup.querySelector('.formula-popup-backdrop')
    if (open) open.addEventListener('click', function () { popup.hidden = false })
    if (close) close.addEventListener('click', function () { popup.hidden = true })
    if (backdrop) backdrop.addEventListener('click', function () { popup.hidden = true })
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') popup.hidden = true })
  }

  // ── Week tabs ───────────────────────────────────────────────────────────
  function renderWeekTabs() {
    var c = byId('weekTabs')
    c.innerHTML = state.weeks.map(function (w) {
      return '<button class="pr-week-tab" data-id="' + esc(w.id) + '">' + esc(w.label) + '</button>'
    }).join('')
    c.addEventListener('click', function (e) {
      var btn = e.target.closest('.pr-week-tab')
      if (btn) loadWeek(btn.dataset.id)
    })
  }
  function setActiveWeekTab(id) {
    document.querySelectorAll('.pr-week-tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.id === id)
    })
  }
  function loadWeek(id) {
    state.activeWk = id
    setActiveWeekTab(id)
    render()
  }

  // ── View tabs (Overall + one per division) ──────────────────────────────
  function renderViewTabs() {
    var vt = byId('viewTabs')
    if (!vt) return
    if (!state.data.hasDivisions) { vt.hidden = true; return }
    var divs = state.weeks[0].divisions || []
    var btns = ['<button class="pr-view-tab active" data-view="overall">Overall</button>']
    divs.forEach(function (d) {
      btns.push('<button class="pr-view-tab" data-view="' + esc(d.key) + '">' + esc(d.name) + '</button>')
    })
    vt.innerHTML = btns.join('')
    vt.addEventListener('click', function (e) {
      var btn = e.target.closest('.pr-view-tab')
      if (!btn) return
      state.view = btn.dataset.view
      vt.querySelectorAll('.pr-view-tab').forEach(function (b) { b.classList.toggle('active', b === btn) })
      render()
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────
  function render() {
    var week = state.weeks.find(function (w) { return w.id === state.activeWk }) || state.weeks[state.weeks.length - 1]
    var isOverall = state.view === 'overall'
    var viewDiv = isOverall ? null : (week.divisions || []).find(function (d) { return d.key === state.view })
    var teams = isOverall ? week.overall : (viewDiv ? viewDiv.teams : [])

    var titleEl = byId('rankingsTitle')
    if (titleEl) titleEl.textContent = week.week === 0 ? 'Pre-Season Rankings' : 'Week ' + week.week + ' Rankings'

    renderPodium(teams.slice(0, 3))
    renderTable(teams, !isOverall)
    renderProjections(week.overall)
    renderConfGrid(week.divisions || [])
  }

  // ── Shared team cell ────────────────────────────────────────────────────
  function logoImg(t, cls) {
    return '<img class="' + cls + '" src="' + esc(t.logo || '') + '" alt="' + esc(t.team_name) + '"'
      + ' onerror="this.style.opacity=0" />'
  }
  function confBadge(name) {
    if (!name) return ''
    return '<span class="conf-badge">' + esc(name) + '</span>'
  }
  function teamCell(t) {
    return '<div class="team-cell">'
      + logoImg(t, 'team-logo')
      + '<div class="team-info">'
      +   '<div class="team-name-main">' + esc(t.team_name) + '</div>'
      +   '<div class="team-mgr">' + esc(t.manager) + confBadge(t.division_name) + '</div>'
      + '</div></div>'
  }

  // ── Podium ──────────────────────────────────────────────────────────────
  function renderPodium(top3) {
    var first = top3[0], second = top3[1], third = top3[2]
    function hero(t) {
      return '<div class="podium-hero">'
        + '<div class="podium-hero-left">'
        +   '<div class="podium-rank-label">1st Place</div>'
        +   '<div class="podium-rank-num">I.</div>'
        +   '<div class="podium-hero-name">' + esc(t.team_name) + '</div>'
        +   '<div class="podium-hero-mgr">' + esc(t.manager) + '</div>'
        +   '<div class="podium-hero-rec">' + t.wins + '–' + t.losses + '</div>'
        + '</div>'
        + '<div class="podium-hero-right">'
        +   logoImg(t, 'podium-hero-logo')
        +   '<div class="podium-hero-score">' + t.score.toFixed(1) + '</div>'
        +   '<div class="podium-hero-delta">' + deltaHTML(t.delta) + '</div>'
        + '</div></div>'
    }
    function runner(t, label, cls) {
      if (!t) return ''
      return '<div class="podium-runner ' + cls + '">'
        + '<div class="podium-runner-top">'
        +   logoImg(t, 'podium-runner-logo')
        +   '<div class="podium-runner-info">'
        +     '<div class="podium-runner-label">' + label + '</div>'
        +     '<div class="podium-runner-name">' + esc(t.team_name) + '</div>'
        +     '<div class="podium-runner-mgr">' + esc(t.manager) + '</div>'
        +   '</div></div>'
        + '<div class="podium-runner-bottom">'
        +   '<span class="podium-runner-rec">' + t.wins + '–' + t.losses + '</span>'
        +   '<span class="podium-runner-score">' + t.score.toFixed(1) + ' ' + deltaHTML(t.delta) + '</span>'
        + '</div></div>'
    }
    byId('podium').innerHTML =
      (first ? hero(first) : '')
      + '<div class="podium-runners">'
      +   runner(second, '2nd Place', 'p2')
      +   runner(third, '3rd Place', 'p3')
      + '</div>'
  }

  // ── Rankings table ──────────────────────────────────────────────────────
  function renderTable(teams, confView) {
    var body = byId('rankBody')
    body.innerHTML = teams.map(function (t, i) {
      var rank = confView ? (t.conf_rank != null ? t.conf_rank : i + 1) : t.rank
      return '<tr class="' + (rank <= 3 ? 'top-row' : '') + '">'
        + '<td class="col-rank"><div class="rank-cell"><span class="rank-num">' + rank + '</span>' + deltaHTML(t.delta) + '</div></td>'
        + '<td class="col-team">' + teamCell(t) + '</td>'
        + '<td class="col-record rec-cell">' + t.wins + '-' + t.losses + '</td>'
        + '<td class="col-pf pf-cell">' + t.pf.toFixed(1) + '</td>'
        + '<td class="col-score score-cell">' + t.score.toFixed(1) + '</td>'
        + '<td class="col-bars">' + buildFactorBars(t.factors) + '</td>'
        + '</tr>'
    }).join('')
  }

  function buildFactorBars(factors) {
    if (!factors) return ''
    var isPre = 'win_pct' in factors
    var defs = isPre
      ? [['win_pct', 'Win%'], ['pf_avg', 'PF'], ['recent', 'Rec3'], ['pedigree', 'Ped']]
      : [['record', 'Rec'], ['pf', 'PF'], ['form', 'Frm'], ['conf', 'Conf']]
    var maxes = isPre ? state.data.weights.preseason : state.data.weights.inseason
    return '<div class="factor-bars">' + defs.map(function (d) {
      var key = d[0], label = d[1]
      var max = maxes[key] || 0
      if (max <= 0) return '' // factor not in play (e.g. Conf in a no-division league)
      var val = factors[key] || 0
      var pct = Math.min(100, (val / max) * 100)
      return '<div class="fbar-row">'
        + '<span class="fbar-label">' + label + '</span>'
        + '<div class="fbar-track"><div class="fbar-fill" style="width:' + pct + '%"></div></div>'
        + '<span class="fbar-val">' + val.toFixed(1) + '</span>'
        + '</div>'
    }).join('') + '</div>'
  }

  // ── Projections (§ 02) ──────────────────────────────────────────────────
  function renderProjections(teams) {
    var section = byId('projSection')
    if (!state.data.hasProjections) { if (section) section.hidden = true; return }
    if (section) section.hidden = false
    byId('projBody').innerHTML = teams.map(function (t) {
      var projWL = t.proj_wins != null && t.proj_losses != null ? t.proj_wins + '–' + t.proj_losses : '—'
      var pp = t.playoff_pct
      var playStr = pp != null ? pp + '%' : '—'
      var byeStr = t.bye_pct != null ? t.bye_pct + '%' : '—'
      var barW = pp != null ? Math.min(100, pp) : 0
      var barCls = pp >= 60 ? 'bar-elite' : pp >= 50 ? 'bar-good' : pp >= 38 ? 'bar-mid' : 'bar-low'
      return '<tr>'
        + '<td class="col-team">' + teamCell(t) + '</td>'
        + '<td class="proj-wl-cell">' + projWL + '</td>'
        + '<td class="proj-pct-cell"><div class="proj-bar-wrap"><div class="proj-bar ' + barCls + '" style="width:' + barW + '%"></div></div><span class="proj-pct-val">' + playStr + '</span></td>'
        + '<td class="proj-bye-cell">' + byeStr + '</td>'
        + '</tr>'
    }).join('')
  }

  // ── Conference odds (§ 03) ──────────────────────────────────────────────
  function renderConfGrid(divisions) {
    var grid = byId('confGrid')
    if (!grid) return
    if (!state.data.hasDivisions || !state.data.hasProjections || !divisions.length) {
      grid.hidden = true
      return
    }
    grid.hidden = false
    grid.innerHTML = divisions.map(function (d, idx) {
      var sorted = d.teams.slice().sort(function (a, b) { return (b.conf_win_pct || 0) - (a.conf_win_pct || 0) })
      var rows = sorted.map(function (t, i) {
        var cp = t.conf_win_pct != null ? t.conf_win_pct : 0
        var barCls = cp >= 30 ? 'bar-elite' : cp >= 16 ? 'bar-good' : 'bar-low'
        return '<tr>'
          + '<td class="col-rank"><span class="rank-num conf-rank-num">' + (i + 1) + '</span></td>'
          + '<td class="col-team">' + teamCell(t) + '</td>'
          + '<td class="score-cell">' + t.score.toFixed(1) + '</td>'
          + '<td class="proj-pct-cell"><div class="proj-bar-wrap"><div class="proj-bar ' + barCls + '" style="width:' + Math.min(100, cp) + '%"></div></div><span class="proj-pct-val">' + cp + '%</span></td>'
          + '</tr>'
      }).join('')
      return '<section class="pr-section">'
        + '<div class="pr-section-header">'
        +   '<span class="pr-section-num">§ 03' + String.fromCharCode(97 + idx) + ' · ' + esc(d.name) + '</span>'
        +   '<span class="pr-section-title">' + esc(d.name) + ' <em> —</em></span>'
        +   '<span class="pr-section-meta">title odds</span>'
        + '</div>'
        + '<div class="pr-table-wrap"><table class="pr-table"><thead><tr>'
        +   '<th class="col-rank">#</th><th class="col-team">Team</th><th class="col-score">Score</th>'
        +   '<th class="proj-pct-head">Win ' + esc(d.name) + ' %</th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
        + '</section>'
    }).join('')
  }

  // ── Delta badge ─────────────────────────────────────────────────────────
  function deltaHTML(delta) {
    if (!delta || delta === 0) return '<span class="rank-delta delta-same">—</span>'
    var abs = Math.abs(delta)
    var cls = delta > 0 ? 'delta-up' : 'delta-down'
    var sym = delta > 0 ? '↑' : '↓'
    return '<span class="rank-delta ' + cls + '">' + sym + abs + '</span>'
  }
})()
