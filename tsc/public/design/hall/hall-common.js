// ============================================================
// HALL OF FAME - bits every prototype shares.
//
// Formatting, the monogram fallback for managers with no avatar, the
// trophy glyph set, and the auto-written induction citation. Design is
// deliberately NOT in here: each prototype owns all of its own styling,
// which is the whole point of running three of them.
// ============================================================
(function (root) {
'use strict';

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function params() {
    var p = new URLSearchParams(root.location.search);
    return { league: p.get('league') || null };
}

function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Avatar with a letter-monogram fallback. Managers on NFL.com imports
// routinely have no image, and a broken tile ruins a wall of plaques.
function portrait(m, cls) {
    var c = cls || 'hof-portrait';
    if (m.avatar) {
        return '<span class="' + c + '"><img src="' + esc(m.avatar) + '" alt="" '
             + 'onerror="this.parentNode.classList.add(\'is-mono\');this.remove()">'
             + '<i>' + esc(initials(m.name)) + '</i></span>';
    }
    return '<span class="' + c + ' is-mono"><i>' + esc(initials(m.name)) + '</i></span>';
}

function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function fmt(v, p) {
    if (v == null || !isFinite(v)) return '--';
    return v.toFixed(p == null ? 1 : p);
}

// Win percentage without the leading zero, the way a record is read.
function pct(v) {
    if (v == null || !isFinite(v)) return '--';
    return v.toFixed(3).replace(/^0/, '');
}

// ── Trophy glyphs ────────────────────────────────────────────
// Stroke-drawn, no fills that fight the page background, sized by the
// caller through currentColor and a width attribute.
//
// EVERY piece bottoms out at y=21 in the 24-unit viewBox. That shared
// baseline is what lets the trophy room stand them all on one shelf board
// without each object needing its own nudge — if you add a glyph here, land
// it on 21 or it will float or sink on the shelf.
var GLYPH = {
    cup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">'
       + '<path d="M7 3h10v5a5 5 0 0 1-10 0V3Z"/><path d="M17 4h3v2a3 3 0 0 1-3 3"/>'
       + '<path d="M7 4H4v2a3 3 0 0 0 3 3"/><path d="M12 13v4"/><path d="M8.5 21h7"/>'
       + '<path d="M9.5 17h5l1 4h-7l1-4Z"/></svg>',
    medal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">'
       + '<circle cx="12" cy="15" r="6"/><path d="M12 12.5 13 15h2.2l-1.8 1.4.7 2.3-2.1-1.4-2.1 1.4.7-2.3L8.8 15H11l1-2.5Z"/>'
       + '<path d="M8.5 9 6 3h4l2 4"/><path d="M15.5 9 18 3h-4"/></svg>',
    // Best regular-season record. The league calls this the crown, so it is
    // drawn as one: the old laurel wreath read as a football at 14px.
    // Jewel-less, with a heavy band — the jewelled version had three floating
    // dots that turned to mush at chip size.
    crown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">'
       + '<path d="M3.8 10.6 7.4 13.8 12 7.2l4.6 6.6 3.6-3.2-1.6 7.6H5.4L3.8 10.6Z"/>'
       + '<path d="M5 18.2h14V21H5z"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">'
       + '<path d="M4 20h16"/><path d="m14.5 4.5 5 5L9 20H4v-5L14.5 4.5Z"/></svg>',
    // Manager of the Year: a globe on a plinth. Base, something rounded on
    // top, nothing pointed anywhere — the brief, on the sixth attempt.
    // See design/hall/icons.html for the alternates.
    orb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">'
       + '<circle cx="12" cy="8.4" r="5.1"/><path d="M6.9 8.4h10.2"/>'
       + '<path d="M12 3.3c2.6 2.9 2.6 7.3 0 10.2c-2.6-2.9-2.6-7.3 0-10.2Z"/>'
       + '<path d="M8.6 15.2h6.8v2.3H8.6z"/><path d="M6.4 17.5h11.2V21H6.4z"/></svg>',
    // League scoring title: a football set at an angle. Deliberately a flat
    // mark and not an object on a plinth — this one is a measurement, not a
    // trophy the league hands out. Drawn level and rotated as a group, so the
    // laces stay square to the ball; the rotation is what lands the bottom of
    // the lens on the y=21 baseline. Lens is 16 long by 10.6 deep: the old
    // 13.2-deep ball read as an egg at chip size. Thinning the lens shrinks
    // the rotated footprint, so the centre drops to 14.7 to keep the feet
    // on 21 — re-derive it if the depth changes again.
    football: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">'
       + '<g transform="rotate(-35 12 14.7)">'
       + '<path d="M4 14.7c2.13-3.5 4.89-5.3 8-5.3s5.87 1.8 8 5.3c-2.13 3.5-4.89 5.3-8 5.3s-5.87-1.8-8-5.3Z"/>'
       + '<path d="M8.8 14.7h6.4"/><path d="M10.2 13.3v2.8M12 13.3v2.8M13.8 13.3v2.8"/>'
       + '</g></svg>',
};

// ── Citation ─────────────────────────────────────────────────
// The paragraph under a plaque. Built from whatever the career actually
// contains, strongest fact first, so nobody gets a generic sentence.
function citation(m) {
    var t = m.trophies;
    var bits = [];

    if (t.title === 1) bits.push('Champion in ' + m.title_years[0] + '.');
    else if (t.title > 1) bits.push(t.title + ' titles (' + m.title_years.join(', ') + ').');

    if (t.moty === 1) bits.push('Manager of the Year in ' + m.moty_years[0] + '.');
    else if (t.moty > 1) bits.push(t.moty + ' Manager of the Year awards (' + m.moty_years.join(', ') + ').');

    if (t.runner_up === 1) bits.push('Lost a final in ' + m.runner_years[0] + '.');
    else if (t.runner_up > 1) bits.push(t.runner_up + ' runner-up finishes.');

    if (t.reg_crown) {
        bits.push(t.reg_crown === 1
            ? 'Owned the best record in the league once.'
            : 'Best record in the league ' + t.reg_crown + ' times.');
    }
    if (t.points_title) {
        bits.push(t.points_title === 1
            ? 'Led the league in scoring once.'
            : 'Led the league in scoring ' + t.points_title + ' times.');
    }

    // The durability line: how rarely the floor fell out.
    var missed = m.seasons_played - t.berth;
    if (t.berth && missed <= 1 && m.seasons_played >= 4) {
        bits.push('Made the playoffs ' + (missed === 0 ? 'every season' : 'in all but one season') + '.');
    } else if (t.berth >= 4) {
        bits.push(t.berth + ' playoff appearances in ' + m.seasons_played + ' seasons.');
    }

    if (m.best_season) {
        bits.push('Peak year ' + m.best_season.year + ': '
            + (m.best_season.record || '')
            + (m.best_season.ppg ? ', ' + fmt(m.best_season.ppg) + ' a game' : '')
            + ', finished ' + ordinal(m.best_season.final_rank) + '.');
    }

    return bits.slice(0, 5).join(' ');
}

// A one-line read of what carried the case, for the plaque subhead.
function caseLine(m) {
    var p = m.parts;
    var best = [['hardware', p.trophy], ['consistency', p.rate], ['peak', p.peak]]
        .sort(function (a, b) { return b[1] - a[1]; })[0][0];
    return { key: best, label: { hardware: 'Built on hardware', consistency: 'Built on consistency', peak: 'Built on a peak' }[best] };
}

// ── Prototype chrome ─────────────────────────────────────────
// A thin bar naming the designs and the data source. Scaffolding only;
// it comes off when a page moves into src/templates.
var PROTOS = [
    ['Trophy Room', 'trophy-room.html'],
    ['Grand Stage', 'stage.html'],
    ['The Rafters', 'rafters.html'],
];
function switcher(active) {
    var q = root.location.search || '';
    return '<div class="proto-switch">'
        + '<span class="proto-switch-tag">Prototype</span>'
        + PROTOS.map(function (p) {
              return p[0] === active
                  ? '<span class="proto-switch-a on">' + esc(p[0]) + '</span>'
                  : '<a class="proto-switch-a" href="' + p[1] + q + '">' + esc(p[0]) + '</a>';
          }).join('<span class="proto-switch-sep">&middot;</span>')
        + '<span class="proto-switch-src" id="protoSrc"></span>'
        + '</div>';
}

function sourceLabel(model, p) {
    return (p.league ? 'Live data: ' + p.league : 'Demo league')
         + ' · ' + model.years.length + ' seasons';
}

root.HallCommon = {
    esc: esc, params: params, initials: initials, portrait: portrait,
    ordinal: ordinal, fmt: fmt, pct: pct, GLYPH: GLYPH,
    citation: citation, caseLine: caseLine,
    switcher: switcher, sourceLabel: sourceLabel,
};

})(window);
