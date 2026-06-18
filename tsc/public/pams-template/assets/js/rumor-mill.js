// rumor-mill.js — Trade Desk · The Rumor Mill.
//
// GET /api/leagues/<id>/trade-desk/mocks returns this week's slate
// (generating it on the spot if this is the first visit of the week —
// hence the patient loading copy in the template).
//
// Sign it / Shred it: anonymous tallies per mock. The server keeps the
// totals; which way THIS device voted lives in localStorage, so a refresh
// remembers but nobody signs in and a different device starts clean.

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var loadingEl = $('rm-loading');
  var errorEl   = $('rm-error');
  var errorMsg  = $('rm-error-msg');
  var emptyEl   = $('rm-empty');
  var closedEl  = $('rm-closed');
  var closedMsg = $('rm-closed-msg');
  var columnEl  = $('rm-column');
  var stampEl   = $('rm-stamp');
  var footerEl  = $('rm-footer');
  var devSimBtn = $('rm-dev-sim'); // DEV ONLY — remove before release

  var leagueId = null;
  var current  = null; // last rendered payload (weekKey + hashes for voting)

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }
  function fail(msg) { hide(loadingEl); show(errorEl); errorMsg.textContent = msg; }

  var TAG_LABEL = {
    'blockbuster': 'Blockbuster',
    'win-win':     'Both sides win',
    'depth-swap':  'Depth swap',
  };

  // ── Device vote memory ──────────────────────────────────────────────
  function voteStoreKey() { return 'tsc-rm-votes:' + leagueId; }
  function readVotes() {
    try { return JSON.parse(localStorage.getItem(voteStoreKey())) || {}; }
    catch (e) { return {}; }
  }
  function writeVotes(map) {
    try { localStorage.setItem(voteStoreKey(), JSON.stringify(map)); }
    catch (e) { /* private mode etc. — votes just won't persist */ }
  }
  function myVote(weekKey, hash) {
    return readVotes()[weekKey + '|' + hash] || null;
  }
  function setMyVote(weekKey, hash, vote) {
    var map = readVotes();
    if (vote) map[weekKey + '|' + hash] = vote;
    else delete map[weekKey + '|' + hash];
    writeVotes(map);
  }

  // ── Render ──────────────────────────────────────────────────────────
  // Each side's lineup impact renders INSIDE its deal column, so team B's
  // number starts where team B's sends start. Side B is mirrored (name far
  // right, rows reversed) so the ledger reads as two parties facing each
  // other across the swap glyph.
  function impactHtml(side) {
    var g = Math.round(side.gain || 0);
    var pct = (side.gainPct || 0) * 100;
    var sign = g > 0 ? '+' : g < 0 ? '−' : '±';
    var tone = g > 5 ? 'up' : g < -5 ? 'down' : 'flat';
    return '<div class="rm-side-impact" data-tone="' + tone + '">' +
      'Lineup · <strong>' + sign + Math.abs(g) +
      ' (' + (pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(1) + '%)</strong>' +
    '</div>';
  }

  function sideHtml(side, mirror) {
    var avatar = side.avatarUrl
      ? '<img class="rm-side-avatar" src="' + escapeHtml(side.avatarUrl) + '" alt="" loading="lazy">'
      : '';
    var rows = (side.sends || []).map(function (p) {
      return '<li>' +
        '<span class="pos">' + escapeHtml(p.position || '—') + '</span>' +
        '<span class="name">' + escapeHtml(p.name) + '</span>' +
        '<span class="val">' + Math.round(p.value) + '</span>' +
      '</li>';
    }).join('');
    var name = mirror
      ? escapeHtml(side.name) + avatar
      : avatar + escapeHtml(side.name);
    return '<div class="rm-side"' + (mirror ? ' data-mirror="true"' : '') + '>' +
      '<div class="rm-side-name">' + name + '</div>' +
      '<div class="rm-side-label">Sends</div>' +
      '<ul class="rm-side-sends">' + rows + '</ul>' +
      impactHtml(side) +
    '</div>';
  }

  // Cross-room handoff — opens the Analyzer with this deal on the table.
  // Relative href rides the league <base href>, same as the nav links.
  // When the column was built from a past season's rosters (offseason
  // fallback), pin the Analyzer to that season too — otherwise it loads
  // the current (empty) rosters and the player chips can't fill in.
  function analyzerHref(t, payload) {
    var ids = function (side) {
      return (side.sends || []).map(function (p) { return p.id; }).join(',');
    };
    var href = 'live/trades/analyzer/' +
      '?teamA=' + encodeURIComponent(t.teamA.ownerId) +
      '&teamB=' + encodeURIComponent(t.teamB.ownerId) +
      '&sends=' + encodeURIComponent(ids(t.teamA)) +
      '&receives=' + encodeURIComponent(ids(t.teamB));
    var nowYear = String(new Date().getFullYear());
    if (payload.season && payload.season !== nowYear) {
      href += '&year=' + encodeURIComponent(payload.season);
    }
    return href;
  }

  // The ballot — one switch-shaped control with two ends: sign the deal
  // into the paper (signature, green) or cut it (scissors, red). Icon
  // only, no words; each end carries its own tally. Stroke SVGs from
  // Lucide, tinted via currentColor.
  var VOTE_ICONS = {
    sign: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="m21 17-2.156-1.868A.5.5 0 0 0 18 15.5v.5a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1c0-2.545-3.991-3.97-8.5-4a1 1 0 0 0 0 5c4.153 0 4.745-11.295 5.708-13.5a2.5 2.5 0 1 1 3.31 3.284"/>' +
      '<path d="M3 21h18"/></svg>',
    shred: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>' +
      '<line x1="20" y1="4" x2="8.12" y2="15.88"/>' +
      '<line x1="14.47" y1="14.48" x2="20" y2="20"/>' +
      '<line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
  };
  var VOTE_TITLE = {
    sign: 'Sign it — you’d do this deal',
    shred: 'Shred it — into the bin',
  };

  function ballotSideHtml(hash, kind, count, active) {
    return '<button type="button" class="rm-ballot-side" data-hash="' + escapeHtml(hash) +
      '" data-vote="' + kind + '" aria-pressed="' + (active ? 'true' : 'false') +
      '" aria-label="' + escapeHtml(VOTE_TITLE[kind]) +
      '" title="' + escapeHtml(VOTE_TITLE[kind]) + '">' +
      VOTE_ICONS[kind] +
      '<span class="rm-vote-n">' + count + '</span></button>';
  }

  function votesHtml(t, payload) {
    var counts = (payload.votes || {})[t.hash] || { sign: 0, shred: 0 };
    var mine = myVote(payload.weekKey, t.hash);
    return '<div class="rm-ballot">' +
      ballotSideHtml(t.hash, 'sign', counts.sign, mine === 'sign') +
      '<span class="rm-ballot-divider" aria-hidden="true"></span>' +
      ballotSideHtml(t.hash, 'shred', counts.shred, mine === 'shred') +
    '</div>';
  }

  function render(payload) {
    hide(loadingEl);
    current = payload;

    if (payload.deskClosed) {
      $('rm-stamp-week').textContent = payload.weekKey || '';
      $('rm-stamp-src').textContent = 'Desk closed';
      show(stampEl);
      closedMsg.textContent = payload.deadlineWeek
        ? 'The trade deadline passed in Week ' + payload.deadlineWeek +
          ' — the desk is closed for the season. The Mill resumes when trades reopen.'
        : 'The desk is closed for the season. The Mill resumes when trades reopen.';
      show(closedEl);
      return;
    }

    $('rm-stamp-week').textContent = payload.weekKey || '';
    // 'Desk column' = full write-up landed; 'Desk notes' = deterministic
    // fallback copy. Reads the same to members, tells us which path ran.
    $('rm-stamp-src').textContent =
      payload.narrativeSource === 'ai' ? 'Desk column' : 'Desk notes';
    show(stampEl);

    var trades = payload.trades || [];
    if (trades.length === 0) { show(emptyEl); return; }

    columnEl.innerHTML = trades.map(function (t, i) {
      return '<article class="rm-item">' +
        '<header class="rm-item-head">' +
          '<span class="rm-item-num">No. ' + ['I','II','III','IV','V'][i] + '</span>' +
          '<span class="rm-item-lead" aria-hidden="true"></span>' +
          '<span class="rm-tag" data-tag="' + escapeHtml(t.tag) + '">' +
            escapeHtml(TAG_LABEL[t.tag] || t.tag) + '</span>' +
        '</header>' +
        '<h2 class="rm-item-headline">' + escapeHtml(t.headline) + '</h2>' +
        '<p class="rm-item-blurb">' + escapeHtml(t.blurb) + '</p>' +
        '<div class="rm-deal">' +
          sideHtml(t.teamA, false) +
          '<div class="rm-deal-swap" aria-hidden="true">⇄</div>' +
          sideHtml(t.teamB, true) +
        '</div>' +
        '<div class="rm-item-actions">' +
          '<a class="rm-run" href="' + analyzerHref(t, payload) + '">Run it in the Analyzer →</a>' +
          votesHtml(t, payload) +
        '</div>' +
      '</article>';
    }).join('');
    show(columnEl);
    show(footerEl);
  }

  // ── Voting ──────────────────────────────────────────────────────────
  // Click semantics: vote → counted; click the same button again →
  // un-vote; click the other → switch. Optimistic UI, then the server's
  // counts (which include everyone else) overwrite ours.
  function onVoteClick(btn) {
    if (!current || !current.weekKey) return;
    var hash = btn.getAttribute('data-hash');
    var kind = btn.getAttribute('data-vote');
    var prev = myVote(current.weekKey, hash);
    var next = prev === kind ? null : kind;
    setMyVote(current.weekKey, hash, next);

    // Optimistic counter + pressed-state update within this ballot.
    var wrap = btn.closest('.rm-ballot');
    wrap.querySelectorAll('.rm-ballot-side').forEach(function (b) {
      var k = b.getAttribute('data-vote');
      var n = b.querySelector('.rm-vote-n');
      var c = parseInt(n.textContent, 10) || 0;
      if (k === prev) c -= 1;
      if (k === next) c += 1;
      n.textContent = String(Math.max(0, c));
      b.setAttribute('aria-pressed', k === next ? 'true' : 'false');
    });

    fetch('/api/leagues/' + leagueId + '/trade-desk/mocks/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        weekKey: current.weekKey,
        hash: hash,
        vote: next,
        prev: prev,
      }),
    }).then(function (res) {
      if (!res.ok) throw new Error('vote failed');
      return res.json();
    }).then(function (counts) {
      wrap.querySelectorAll('.rm-ballot-side').forEach(function (b) {
        var k = b.getAttribute('data-vote');
        b.querySelector('.rm-vote-n').textContent =
          String(k === 'sign' ? counts.sign : counts.shred);
      });
    }).catch(function () {
      // Server didn't take it — roll the device memory back so the
      // next click sends an honest `prev`.
      setMyVote(current.weekKey, hash, prev);
    });
  }

  // ── Fetch + boot ────────────────────────────────────────────────────
  function load(url, done) {
    hide(errorEl); hide(emptyEl); hide(closedEl); hide(columnEl); hide(footerEl); hide(stampEl);
    show(loadingEl);
    fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.message || data.error || ('HTTP ' + res.status));
        return data;
      });
    }).then(function (payload) {
      render(payload);
      if (done) done();
    }).catch(function (err) {
      fail(err.message || String(err));
      if (done) done();
    });
  }

  function boot() {
    var dc = window.__DC || {};
    if (!dc.id) {
      fail('No league context. Open this page through a league URL.');
      return;
    }
    leagueId = dc.id;
    var baseUrl = '/api/leagues/' + dc.id + '/trade-desk/mocks';
    load(baseUrl);

    columnEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.rm-ballot-side');
      if (btn) onVoteClick(btn);
    });

    // ── DEV ONLY — remove before release ─────────────────────────────
    // Rerolls THIS week's column with a fresh seed. The new slate is
    // stored server-side (and the week's tallies wiped), so refresh
    // keeps it and the Sign/Shred ballots work on the new trades.
    if (devSimBtn) {
      devSimBtn.addEventListener('click', function () {
        devSimBtn.disabled = true;
        load(baseUrl + '?reroll=1', function () {
          devSimBtn.disabled = false;
        });
      });
    }
    // ── end DEV ONLY ─────────────────────────────────────────────────
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
