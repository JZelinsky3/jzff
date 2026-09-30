// powerrank.js — Dynasty Codex power rankings.
//
// Ported from the PA Milk Society demo: podium / table / factor-bar /
// projections rendering kept verbatim so the page looks identical. The data
// layer is swapped — one fetch of /leagues/<slug>/live/powerrank/data returns every
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

  // board: whose order the podium + table show, the model's or the
  // commissioner's (when one is published for the week).
  var state = { data: null, weeks: [], activeWk: null, view: 'overall', board: 'model' }

  boot().catch(function (e) { console.error(e); showMessage('Couldn’t load power rankings.', String(e)) })
  // Wired regardless of data state — the page URL is shareable even before
  // Week 1. Mirrors Pick'ems' masthead share (native sheet + clipboard).
  initShareBtn()

  // ── Boot ────────────────────────────────────────────────────────────────
  async function boot() {
    bindFormulaPopup()
    var res = await fetch('live/powerrank/data', { cache: 'no-store' })
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
    var cm = commishOf(week)
    renderBoardTabs(cm, isOverall)
    var commishView = !!(cm && isOverall && state.board === 'commish')
    if (commishView) teams = commishTeams(week, cm)

    var titleEl = byId('rankingsTitle')
    if (titleEl) {
      var when = week.week === 0 ? 'Pre-Season' : 'Week ' + week.week
      titleEl.textContent = commishView ? 'The Commish’s ' + when + ' Board' : when + ' Rankings'
    }

    renderPodium(teams.slice(0, 3))
    renderTable(teams, !isOverall)
    renderCommish(week, cm)
    renderProjections()
    renderConfGrid()
    var projNum = byId('projNum')
    if (projNum) projNum.textContent = (cm ? '§ 03' : '§ 02') + ' · Projections'
  }

  // ── The commissioner's board ────────────────────────────────────────────
  function commishOf(week) {
    return week && week.commish && week.commish.order && week.commish.order.length ? week.commish : null
  }
  // The model's team rows, reordered to the commissioner's ranking. Each
  // carries the model's rank so the table can show the disagreement.
  function commishTeams(week, cm) {
    var byTeam = {}
    week.overall.forEach(function (t) { byTeam[t.team_id] = t })
    return cm.order.map(function (o) {
      var t = byTeam[o.team_id]
      if (!t) return null
      return Object.assign({}, t, { rank: o.rank, delta: 0, _model: o.model_rank, _gap: o.gap })
    }).filter(Boolean)
  }
  function renderBoardTabs(cm, isOverall) {
    var bt = byId('boardTabs')
    if (!bt) return
    if (!cm || !isOverall) { bt.hidden = true; return }
    bt.hidden = false
    bt.innerHTML =
      '<button type="button" class="pr-board-tab' + (state.board === 'model' ? ' active' : '') + '" data-board="model">The Model</button>' +
      '<button type="button" class="pr-board-tab' + (state.board === 'commish' ? ' active' : '') + '" data-board="commish">The Commish</button>'
    if (!bt._wired) {
      bt._wired = true
      bt.addEventListener('click', function (e) {
        var b = e.target.closest('.pr-board-tab')
        if (!b || b.dataset.board === state.board) return
        state.board = b.dataset.board
        render()
      })
    }
  }
  function gapHTML(gap) {
    if (!gap) return '<span class="cm-gap even">=</span>'
    return '<span class="cm-gap ' + (gap > 0 ? 'up' : 'down') + '">' + (gap > 0 ? '↑' : '↓') + Math.abs(gap) + '</span>'
  }
  function renderCommish(week, cm) {
    var sec = byId('commishSection')
    if (!sec) return
    if (!cm) { sec.hidden = true; sec.innerHTML = ''; return }
    sec.hidden = false
    var byTeam = {}
    week.overall.forEach(function (t) { byTeam[t.team_id] = t })
    var rows = cm.order.filter(function (o) { return byTeam[o.team_id] })
    var same = rows.filter(function (o) { return o.gap === 0 }).length
    var avg = rows.length ? rows.reduce(function (s, o) { return s + Math.abs(o.gap) }, 0) / rows.length : 0
    // The two loudest disagreements, one each way when there are both.
    var high = rows.filter(function (o) { return o.gap > 0 }).sort(function (a, b) { return b.gap - a.gap })[0]
    var low = rows.filter(function (o) { return o.gap < 0 }).sort(function (a, b) { return a.gap - b.gap })[0]
    var call = function (o, word) {
      var t = byTeam[o.team_id]
      return '<div class="cm-call"><span class="cm-call-k">' + word + '</span><b>' + esc(t.manager) + '</b>' +
        '<span>Commish ' + ordinal(o.rank) + ' · model ' + ordinal(o.model_rank) + '</span></div>'
    }
    var updated = cm.updated_at ? new Date(cm.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
    var maxGap = Math.max(1, rows.reduce(function (m, o) { return Math.max(m, Math.abs(o.gap)) }, 0))
    sec.innerHTML =
      '<div class="pr-section-header">' +
        '<span class="pr-section-num">§ 02 · The Commish</span>' +
        '<span class="pr-section-title">The commish vs. <em>the model ·</em></span>' +
        '<span class="pr-section-meta">' + same + ' of ' + rows.length + ' in the same spot · off by ' + avg.toFixed(1) + ' on average' + (updated ? ' · ' + esc(updated) : '') + '</span>' +
      '</div>' +
      (cm.note ? '<blockquote class="cm-note">' + esc(cm.note) + '<cite>The Commissioner</cite></blockquote>' : '') +
      ((high || low) ? '<div class="cm-calls">' + (high ? call(high, 'Higher on') : '') + (low ? call(low, 'Lower on') : '') + '</div>' : '') +
      '<div class="pr-table-wrap"><table class="pr-table cm-table"><thead><tr>' +
        '<th class="col-rank">Commish</th><th class="col-team">Team</th><th class="cm-model-head">Model</th><th class="cm-bar-head">The gap</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (o) {
        var t = byTeam[o.team_id]
        var w = (Math.abs(o.gap) / maxGap) * 50
        return '<tr>' +
          '<td class="col-rank"><span class="rank-num">' + o.rank + '</span></td>' +
          '<td class="col-team">' + teamCell(t) + '</td>' +
          '<td class="cm-model">' + o.model_rank + '</td>' +
          '<td class="cm-bar-cell"><div class="cm-bar"><span class="cm-bar-mid"></span>' +
            (o.gap ? '<span class="cm-bar-fill ' + (o.gap > 0 ? 'up' : 'down') + '" style="width:' + w.toFixed(1) + '%"></span>' : '') +
          '</div>' + gapHTML(o.gap) + '</td>' +
        '</tr>'
      }).join('') +
      '</tbody></table></div>'
  }
  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }

  // ── Shared team cell ────────────────────────────────────────────────────
  function logoImg(t, cls) {
    return '<img class="' + cls + '" src="' + esc(t.logo || '') + '" alt="' + esc(t.team_name) + '"'
      + ' onerror="this.style.opacity=0" />'
  }
  // Each division gets its own ink, keyed off its place in the league's
  // division list (t.division is 1-indexed); powerrank.css holds eight.
  function confBadge(t) {
    if (!t.division_name) return ''
    var tone = t.division ? ' conf-c' + ((t.division - 1) % 8) : ''
    return '<span class="conf-badge' + tone + '">' + esc(t.division_name) + '</span>'
  }
  function teamCell(t) {
    return '<div class="team-cell">'
      + logoImg(t, 'team-logo')
      + '<div class="team-info">'
      +   '<div class="team-name-main">' + esc(t.team_name) + '</div>'
      +   '<div class="team-mgr">' + esc(t.manager) + confBadge(t) + '</div>'
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
      // On the commish's board the small mark beside the rank is where the
      // model has the team, not last week's move.
      var mark = t._model != null
        ? '<span class="rank-model" title="The model has them ' + t._model + '">M' + t._model + '</span>'
        : deltaHTML(t.delta)
      return '<tr class="' + (rank <= 3 ? 'top-row' : '') + '">'
        + '<td class="col-rank"><div class="rank-cell"><span class="rank-num">' + rank + '</span>' + mark + '</div></td>'
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
      : [['record', 'Rec·SOS'], ['pf', 'PF'], ['form', 'Frm'], ['top_half', 'Top½'], ['conf', 'Conf'], ['lore', 'Lore']]
    // In-season maxes vary by week (form/conf phase in across W1–3). Read
    // them off the active snapshot; fall back to canonical W4+ for older
    // payloads that didn't ship per-week weights.
    var activeWeek = state.weeks.find(function (w) { return w.id === state.activeWk })
    var maxes = isPre
      ? state.data.weights.preseason
      : (activeWeek && activeWeek.inseasonWeights) || state.data.weights.inseason
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

  // ── Outlook (§ 02): standings now, finish projected ─────────────────────
  // Always the latest week, whichever week tab is open: this is where the
  // league stands today and where the sims say it ends up. Rows run in
  // today's seed order (division winners first, then record, ties broken
  // head-to-head, conference record, points for) with a rule at the
  // playoff line.
  function latestWeek() { return state.weeks[state.weeks.length - 1] }
  var TB_WORDS = { h2h: ['H2H', 'Tiebreaker: head-to-head'], div: ['Conf', 'Tiebreaker: conference record'], pf: ['PF', 'Tiebreaker: points for'] }
  function tbTag(t) {
    var w = t.tb && TB_WORDS[t.tb]
    return w ? '<span class="tb-tag" title="' + w[1] + '">' + w[0] + '</span>' : ''
  }
  function recStr(w, l, t) { return w + '-' + l + (t ? '-' + t : '') }
  // The league's own playoff rule (Sources > Season by season), in words.
  function formatNote() {
    var d = state.data
    var divs = (latestWeek().divisions || []).length
    var who = d.playoffFormat === 'per_division' && divs
      ? 'The top ' + Math.floor(d.playoffTeams / divs) + ' in each conference make the playoffs' + (d.byeTeams ? ', and the conference winners take the byes.' : '.')
      : d.playoffFormat === 'division_winners'
        ? 'Conference winners are in and take the top seeds, then the best records fill the field.'
        : 'The best ' + d.playoffTeams + ' records make the playoffs.'
    var tb = d.hasDivisions ? 'head-to-head, then conference record, then points for' : 'head-to-head, then points for'
    return who + ' Ties go to ' + tb + '.'
  }
  function pctStr(p) { return p == null ? '·' : p + '%' }
  function renderProjections() {
    var section = byId('projSection')
    if (!state.data.hasProjections) { if (section) section.hidden = true; return }
    if (section) section.hidden = false
    var latest = latestWeek()
    var live = latest.week > 0
    var cut = state.data.playoffTeams || 0
    var byes = state.data.byeTeams || 0
    var teams = latest.overall.slice().sort(function (a, b) {
      return live ? (a.seed || 99) - (b.seed || 99) : (b.playoff_pct || 0) - (a.playoff_pct || 0)
    })
    var note = byId('projNote')
    if (note) note.textContent = formatNote() + ' The odds play every remaining game 8,000 times. Early on, a team\'s scoring so far counts for less, so a hot start doesn\'t read as a sure thing.'
    var meta = byId('projMeta')
    if (meta) meta.textContent = (live ? 'Through week ' + latest.week + ' · ' : '') + '8,000 simulated seasons'
    byId('projBody').innerHTML = teams.map(function (t, i) {
      var projWL = t.proj_wins != null && t.proj_losses != null ? t.proj_wins + '–' + t.proj_losses : '·'
      var pp = t.playoff_pct
      var barW = pp != null ? Math.min(100, pp) : 0
      var barCls = pp >= 60 ? 'bar-elite' : pp >= 50 ? 'bar-good' : pp >= 38 ? 'bar-mid' : 'bar-low'
      var status = t.clinched ? '<span class="proj-status in">Clinched</span>' : t.eliminated ? '<span class="proj-status out">Out</span>' : ''
      var seed = live
        ? '<span class="seed-num">' + t.seed + '</span>' + (t.seed <= byes ? '<span class="seed-tag">Bye</span>' : '')
        : '<span class="seed-num">·</span>'
      return '<tr class="' + (live && cut && i === cut ? 'pr-cut' : '') + '">'
        + '<td class="col-rank">' + seed + '</td>'
        + '<td class="col-team">' + teamCell(t) + '</td>'
        + '<td class="proj-now-cell">' + recStr(t.wins, t.losses, t.ties) + '</td>'
        + '<td class="proj-wl-cell">' + projWL + '</td>'
        + '<td class="proj-pct-cell"><div class="proj-bar-wrap"><div class="proj-bar ' + barCls + '" style="width:' + barW + '%"></div></div><span class="proj-pct-val">' + pctStr(pp) + '</span>' + status + '</td>'
        + '<td class="proj-bye-cell">' + pctStr(t.bye_pct) + '</td>'
        + '</tr>'
    }).join('')
  }

  // ── Conferences (§ 03): standings + title odds ──────────────────────────
  function renderConfGrid() {
    var grid = byId('confGrid')
    if (!grid) return
    var latest = latestWeek()
    var divisions = latest.divisions || []
    if (!state.data.hasDivisions || !state.data.hasProjections || !divisions.length) {
      grid.hidden = true
      return
    }
    var live = latest.week > 0
    grid.hidden = false
    grid.innerHTML = divisions.map(function (d, idx) {
      var sorted = d.teams.slice().sort(function (a, b) {
        return live ? (a.div_place || 99) - (b.div_place || 99) : (b.conf_win_pct || 0) - (a.conf_win_pct || 0)
      })
      var rows = sorted.map(function (t, i) {
        var cp = t.conf_win_pct != null ? t.conf_win_pct : 0
        var barCls = cp >= 30 ? 'bar-elite' : cp >= 16 ? 'bar-good' : 'bar-low'
        return '<tr>'
          + '<td class="col-rank"><span class="rank-num conf-rank-num">' + (live ? t.div_place : i + 1) + '</span></td>'
          + '<td class="col-team">' + teamCell(t) + '</td>'
          + '<td class="rec-cell">' + recStr(t.wins, t.losses, t.ties) + tbTag(t) + '</td>'
          + '<td class="rec-cell conf-rec-cell">' + recStr(t.div_w || 0, t.div_l || 0, t.div_t || 0) + '</td>'
          + '<td class="proj-pct-cell"><div class="proj-bar-wrap"><div class="proj-bar ' + barCls + '" style="width:' + Math.min(100, cp) + '%"></div></div><span class="proj-pct-val">' + cp + '%</span></td>'
          + '</tr>'
      }).join('')
      return '<section class="pr-section">'
        + '<div class="pr-section-header">'
        +   '<span class="pr-section-num">§ 03' + String.fromCharCode(97 + idx) + ' · ' + esc(d.name) + '</span>'
        +   '<span class="pr-section-title">' + esc(d.name) + ' <em>·</em></span>'
        +   '<span class="pr-section-meta">standings + title odds</span>'
        + '</div>'
        + '<div class="pr-table-wrap"><table class="pr-table"><thead><tr>'
        +   '<th class="col-rank">#</th><th class="col-team">Team</th><th class="col-record">Record</th><th class="col-record">Conf</th>'
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

  // ── Share button ──────────────────────────────────────────────────────────
  // Pops the native share sheet when available, otherwise copies the link to
  // the clipboard. Surfaces a toast so the click registers. Same behaviour as
  // Pick'ems' masthead share.
  function initShareBtn() {
    var btn = byId('shareBtn')
    if (!btn) return
    btn.addEventListener('click', function () {
      var leagueName = (window.__DC && window.__DC.name) || 'Power Rankings'
      var wk = state.activeWk || (state.weeks.length ? state.weeks[state.weeks.length - 1].id : '')
      var title = leagueName + ' · Power Rankings' + (wk ? ' · Wk ' + wk : '')
      var text  = 'This week’s power rankings — see where every team lands.'
      var url   = window.location.href
      if (navigator.share) {
        navigator.share({ title: title, text: text, url: url })
          .catch(function () { copyShareLink(url, title) })
        return
      }
      copyShareLink(url, title)
    })
  }
  function copyShareLink(url, title) {
    var payload = title ? title + ' — ' + url : url
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload).then(
        function () { showPrToast('Link copied') },
        function () { showPrToast('Couldn’t copy') }
      )
      return
    }
    try {
      var ta = document.createElement('textarea')
      ta.value = payload
      ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      showPrToast('Link copied')
    } catch (e) { showPrToast('Couldn’t copy') }
  }
  function showPrToast(msg) {
    var t = byId('prToast')
    if (!t) return
    if (msg) t.textContent = msg
    t.classList.add('is-on')
    clearTimeout(showPrToast._t)
    showPrToast._t = setTimeout(function () { t.classList.remove('is-on') }, 2200)
  }
})()
