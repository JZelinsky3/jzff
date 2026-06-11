/**
 * Mobile app shell for the public almanac — counterpart of nav.js, loaded
 * ONLY by the templates in src/templates/pams-mobile/. Desktop templates keep
 * nav.js; the two scripts are never loaded together (both guard the fetch
 * wrapper with __DC_PROGRESS_INSTALLED just in case).
 *
 * Builds, from a per-page hook:
 *   <nav id="site-nav" data-page="standings" data-chapter="CH. I · STANDINGS"
 *        data-back-href="./" data-back-label="Hub"></nav>
 *   <script src="/pams-template/assets/js/mobile-app.js"></script>
 *
 *   • top app bar    — back button (history-aware), league title, kicker
 *   • bottom tab bar — Home · Standings · History · More · Live
 *   • History sheet  — Season Archives / Record Book / Draft History
 *   • More sheet     — Managers / Rivalries + account group + view toggle
 *   • lock overlay   — UDFA-locked pages (__DC.pageLocked), styles in
 *                      mobile-app.css
 *   • tier strip     — slim variant of nav.js's testing strip
 *
 * IMPORTANT: every almanac page carries <base href="/leagues/<slug>/">, so
 * relative hrefs ("standings.html", "managers/") work from any subdirectory —
 * but "#" and "?view=..." would ALSO resolve against the base and silently
 * navigate to the league root. Actions are <button>s; the view toggle builds
 * its href from location.pathname + search.
 *
 * Load this synchronously (no defer) BEFORE the template's inline data
 * script so the fetch progress wrapper is installed first.
 */
(function () {
    'use strict';

    // ── Tab registry ────────────────────────────────────────────────────
    // data-page → which tab lights up. Pages without an entry light nothing.
    var TAB_OF_PAGE = {
        hub: 'home',
        standings: 'standings',
        seasons: 'history', season: 'history',
        records: 'history', draft: 'history',
        managers: 'more', manager: 'more',
        rivalries: 'more', rivalry: 'more',
        // Live pages are desktop-served for now, but keep the mapping so any
        // future mobile build lights the right tab automatically.
        'live-season': 'live', 'matchup-preview': 'live', pickems: 'live',
        powerrank: 'live', 'best-coach': 'live', 'records-watch': 'live',
        milestones: 'live', trades: 'live', 'manager-dna': 'live',
    };

    // Chapters that lock on the free tier. KEEP IN SYNC with
    // UDFA_LOCKED_PAGE_PATTERNS in src/lib/leagueTier.ts (and nav.js's
    // UDFA_LOCKED_CHAPTER_KEYS) — this is the badge-only mirror of that list.
    var UDFA_LOCKED = { records: 1, draft: 1, live: 1 };

    function dcContext() {
        var dc = window.__DC || {};
        return {
            slug: dc.slug || '',
            name: dc.name || '',
            isCommish: !!dc.isCommish,
            isSignedIn: !!dc.isSignedIn,
            isBookmarked: !!dc.isBookmarked,
            leagueTier: dc.leagueTier || '',
            pageLocked: !!dc.pageLocked,
            managePath: dc.slug ? '/league/' + dc.slug : null,
            libraryPath: '/dashboard',
        };
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // ── SVG tab icons (stroke = currentColor) ───────────────────────────
    var ICONS = {
        home: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/></svg>',
        standings: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="20" x2="4" y2="10"/><line x1="10" y1="20" x2="10" y2="4"/><line x1="16" y1="20" x2="16" y2="13"/><line x1="22" y1="20" x2="22" y2="7"/></svg>',
        history: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
        more: '<svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>',
        live: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4.9 19.1a10 10 0 0 1 0-14.2"/><path d="M8.5 15.5a5 5 0 0 1 0-7"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M15.5 15.5a5 5 0 0 0 0-7"/><path d="M19.1 19.1a10 10 0 0 0 0-14.2"/></svg>',
        back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14 5 7 12 14 19"/></svg>',
        star: function (on) {
            return '<svg id="nav-bookmark-svg" width="20" height="20" viewBox="0 0 24 24" fill="' + (on ? '#e8c889' : 'none') + '" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6L12 16.8 6.6 19.7l1.1-6L3.2 9.4l6.1-.8z"/></svg>';
        },
    };

    // ── Fetch progress bar — ported verbatim from nav.js ────────────────
    function installProgressBar() {
        if (window.__DC_PROGRESS_INSTALLED) return;
        window.__DC_PROGRESS_INSTALLED = true;

        var css = document.createElement('style');
        css.textContent = [
            '#dc-progress {',
            '  position: fixed; top: 0; left: 0; right: 0;',
            '  height: 2px; z-index: 8999;',
            '  background: linear-gradient(90deg,',
            '    rgba(232,200,137,0) 0%,',
            '    rgba(232,200,137,.95) 50%,',
            '    rgba(232,200,137,0) 100%);',
            '  background-size: 40% 100%;',
            '  background-repeat: no-repeat;',
            '  background-position: -40% 0;',
            '  opacity: 0;',
            '  pointer-events: none;',
            '  transition: opacity .25s ease;',
            '}',
            '#dc-progress.is-active {',
            '  opacity: 1;',
            '  animation: dc-progress-march 1.1s linear infinite;',
            '}',
            '@keyframes dc-progress-march {',
            '  from { background-position: -40% 0; }',
            '  to   { background-position: 140% 0; }',
            '}',
        ].join('\n');
        document.head.appendChild(css);

        var bar = document.createElement('div');
        bar.id = 'dc-progress';
        bar.setAttribute('role', 'progressbar');
        bar.setAttribute('aria-label', 'Loading league data');
        var insert = function () { if (document.body) document.body.appendChild(bar); };
        if (document.body) insert();
        else document.addEventListener('DOMContentLoaded', insert, { once: true });

        var inflight = 0;
        var hideTimer = 0;
        function show() {
            if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0; }
            bar.classList.add('is-active');
        }
        function hide() {
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(function () {
                hideTimer = 0;
                if (inflight === 0) bar.classList.remove('is-active');
            }, 80);
        }

        var origFetch = window.fetch;
        if (typeof origFetch !== 'function') return;

        function isLeagueDataUrl(input) {
            try {
                var s = typeof input === 'string'
                    ? input
                    : (input && input.url) || String(input);
                if (!s) return false;
                if (s.indexOf('data/') === 0) return true;
                if (s.indexOf('/leagues/') !== -1 && s.indexOf('/data/') !== -1) return true;
                return false;
            } catch (_) { return false; }
        }

        window.fetch = function (input, init) {
            if (!isLeagueDataUrl(input)) return origFetch.apply(this, arguments);
            inflight++;
            show();
            var p;
            try { p = origFetch.apply(this, arguments); }
            catch (e) { inflight--; hide(); throw e; }
            return p.then(function (r) { inflight--; hide(); return r; },
                          function (e) { inflight--; hide(); throw e; });
        };
    }

    // ── Auth link stamping — ported from nav.js ─────────────────────────
    function enhanceAuthLinks() {
        var here = window.location.pathname + window.location.search;
        var encoded = encodeURIComponent(here);

        document.querySelectorAll('a[data-dc-signin]').forEach(function (a) {
            var base = a.getAttribute('href') || '/login';
            var sep = base.indexOf('?') === -1 ? '?' : '&';
            a.href = base + sep + 'next=' + encoded + '&from=' + encoded;
        });

        document.querySelectorAll('a[href^="/login?mode=signup"]').forEach(function (a) {
            var base = a.getAttribute('href');
            if (base.indexOf('from=') !== -1) return;
            a.href = base + '&from=' + encoded;
        });
    }

    // ── Bookmark toggle — ported from nav.js (sheet row + app bar star) ──
    function wireBookmarkToggle() {
        document.addEventListener('click', function (e) {
            if (!e.target || !e.target.closest) return;
            var sheetBtn = e.target.closest('#dc-bookmark-toggle');
            var navBtn = e.target.closest('#nav-bookmark-btn');
            var el = sheetBtn || navBtn;
            if (!el) return;
            e.preventDefault();
            var slug = el.getAttribute('data-slug');
            var on = el.getAttribute('data-on') === '1';
            var action = on ? 'remove' : 'add';
            var origText = sheetBtn ? sheetBtn.textContent : null;
            if (sheetBtn) sheetBtn.textContent = '…';
            fetch('/api/bookmarks/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug: slug, action: action }),
            }).then(function (r) {
                if (!r.ok) throw new Error('bookmark failed');
                var nowOn = !on;
                var sheetMate = document.getElementById('dc-bookmark-toggle');
                if (sheetMate) {
                    sheetMate.setAttribute('data-on', nowOn ? '1' : '0');
                    sheetMate.textContent = nowOn ? 'Bookmarked ★' : 'Bookmark ☆';
                }
                var navMate = document.getElementById('nav-bookmark-btn');
                if (navMate) {
                    navMate.setAttribute('data-on', nowOn ? '1' : '0');
                    navMate.setAttribute('aria-label', nowOn ? 'Remove bookmark' : 'Bookmark this league');
                    var svg = document.getElementById('nav-bookmark-svg');
                    if (svg) svg.setAttribute('fill', nowOn ? '#e8c889' : 'none');
                }
            }).catch(function () {
                if (sheetBtn && origText) sheetBtn.textContent = origText;
            });
        });
    }

    // ── Sheets ──────────────────────────────────────────────────────────
    function sheetRow(href, label, opts) {
        opts = opts || {};
        var extra = '';
        if (opts.locked) extra = '<span class="m-row-lock" aria-hidden>✦</span>';
        else if (opts.sub) extra = '<span class="m-sheet-sub">' + escapeHtml(opts.sub) + '</span>';
        var attrs = opts.attrs || '';
        return '<a class="m-sheet-row" href="' + href + '" ' + attrs + '>'
            + escapeHtml(label) + extra + '</a>';
    }

    function buildSheets(ctx) {
        var udfa = ctx.leagueTier === 'udfa';

        // History sheet — the History tab's targets.
        var history = document.createElement('dialog');
        history.className = 'm-sheet';
        history.id = 'm-sheet-history';
        history.innerHTML =
            '<div class="m-sheet-handle" aria-hidden></div>' +
            '<div class="m-sheet-title">League History</div>' +
            sheetRow('seasons/', 'Season Archives') +
            sheetRow('records.html', 'Record Book', { locked: udfa }) +
            sheetRow('draft/', 'Draft History', { locked: udfa });

        // More sheet — Society + account group + view toggle.
        var account = '';
        if (ctx.slug && ctx.isCommish) {
            account =
                '<span class="m-sheet-label">Admin</span>' +
                sheetRow(ctx.managePath, 'Manage league') +
                sheetRow(ctx.libraryPath, 'Library');
        } else if (ctx.isSignedIn) {
            var bmLabel = ctx.isBookmarked ? 'Bookmarked ★' : 'Bookmark ☆';
            account =
                '<span class="m-sheet-label">Your account</span>' +
                (ctx.slug
                    ? '<button class="m-sheet-row" id="dc-bookmark-toggle" data-slug="' + escapeHtml(ctx.slug) + '" data-on="' + (ctx.isBookmarked ? '1' : '0') + '">' + bmLabel + '</button>'
                    : '') +
                sheetRow('/dashboard', 'Library') +
                sheetRow('/account', 'Profile');
        } else {
            account =
                '<span class="m-sheet-label">Join today</span>' +
                sheetRow('/login', 'Sign in', { attrs: 'data-dc-signin' }) +
                sheetRow('/login?mode=signup', 'New chronicle') +
                sheetRow('/', 'TSC home');
        }

        // <base> would hijack a relative "?view=desktop" — build from location.
        var desktopHref = window.location.pathname
            + (window.location.search ? window.location.search + '&' : '?')
            + 'view=desktop';

        var more = document.createElement('dialog');
        more.className = 'm-sheet';
        more.id = 'm-sheet-more';
        more.innerHTML =
            '<div class="m-sheet-handle" aria-hidden></div>' +
            '<div class="m-sheet-title">' + escapeHtml(ctx.name || 'The Almanac') + '</div>' +
            '<span class="m-sheet-label">The Society</span>' +
            sheetRow('managers/', 'Managers') +
            sheetRow('rivalries/', 'Rivalries') +
            '<div class="m-sheet-divider"></div>' +
            account +
            '<div class="m-sheet-divider"></div>' +
            sheetRow(desktopHref, 'View desktop site');

        document.body.appendChild(history);
        document.body.appendChild(more);

        [history, more].forEach(function (sheet) {
            // Backdrop tap closes (clicks inside the sheet hit children, not
            // the dialog itself). Link taps close too — navigation is a full
            // page load, but closing first avoids a flash on slow loads.
            sheet.addEventListener('click', function (e) {
                if (e.target === sheet) closeSheet(sheet);
                else if (e.target.closest && e.target.closest('a')) closeSheet(sheet);
            });
            sheet.addEventListener('cancel', function (e) {
                e.preventDefault();
                closeSheet(sheet);
            });
        });

        return { history: history, more: more };
    }

    function openSheet(sheet) {
        if (sheet.open) return;
        sheet.showModal();
        // Next frame so the transform transition actually runs.
        requestAnimationFrame(function () { sheet.classList.add('is-open'); });
    }
    function closeSheet(sheet) {
        sheet.classList.remove('is-open');
        setTimeout(function () { if (sheet.open) sheet.close(); }, 220);
    }

    // ── App bar + tab bar ───────────────────────────────────────────────
    function buildShell() {
        var nav = document.getElementById('site-nav');
        if (!nav) return;
        var ctx = dcContext();
        var page = nav.dataset.page || '';
        var chapter = nav.dataset.chapter || '';
        var backHref = nav.dataset.backHref || '';
        var activeTab = TAB_OF_PAGE[page] || '';

        // Title: league name, tail italicized gold (same split as desktop).
        var parts = (ctx.name || 'Archive').trim().split(/\s+/);
        var head = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
        var tail = parts[parts.length - 1];
        var nameHTML = (head ? escapeHtml(head) + ' ' : '') + '<em>' + escapeHtml(tail) + '.</em>';

        // Left slot: back button on every page that declares a target.
        var left = backHref
            ? '<a class="m-appbar-back" id="m-appbar-back" href="' + escapeHtml(backHref) + '" aria-label="Back">' + ICONS.back + '</a>'
            : '<span></span>';

        // Right slot: bookmark star on the hub for signed-in non-commish
        // viewers (same rule as desktop's left-slot star).
        var right = '<span></span>';
        if (page === 'hub' && ctx.isSignedIn && !ctx.isCommish && ctx.slug) {
            right = '<button class="m-appbar-action" id="nav-bookmark-btn" data-slug="' + escapeHtml(ctx.slug) + '" data-on="' + (ctx.isBookmarked ? '1' : '0') + '" aria-label="' + (ctx.isBookmarked ? 'Remove bookmark' : 'Bookmark this league') + '">' + ICONS.star(ctx.isBookmarked) + '</button>';
        }

        var center = (page === 'hub' ? '<div' : '<a href="./"') + ' class="m-appbar-center">'
            + (chapter ? '<div class="m-appbar-kicker">' + escapeHtml(chapter) + '</div>' : '')
            + '<div class="m-appbar-title">' + nameHTML + '</div>'
            + (page === 'hub' ? '</div>' : '</a>');

        var bar = document.createElement('header');
        bar.className = 'm-appbar';
        bar.innerHTML = left + center + right;
        nav.parentNode.replaceChild(bar, nav);

        // Back behavior (ported heuristic from nav.js): plain tap with a
        // same-origin, different-URL referrer → history.back(); otherwise
        // follow the declared href.
        var backLink = document.getElementById('m-appbar-back');
        if (backLink) {
            backLink.addEventListener('click', function (e) {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                var ref = document.referrer;
                if (!ref) return;
                try {
                    var refUrl = new URL(ref);
                    if (refUrl.origin !== window.location.origin) return;
                    if (refUrl.href === window.location.href) return;
                    e.preventDefault();
                    history.back();
                } catch (_) { /* follow href */ }
            });
        }

        // Tab bar.
        var udfa = ctx.leagueTier === 'udfa';
        function tab(key, label, href, isSheet) {
            var active = activeTab === key ? ' is-active' : '';
            var lock = udfa && UDFA_LOCKED[key]
                ? '<span class="m-tab-lock" aria-hidden>✦</span>' : '';
            var inner = ICONS[key] + '<span>' + label + '</span>' + lock;
            if (isSheet) {
                return '<button class="m-tab' + active + '" data-sheet="' + key + '" aria-haspopup="dialog">' + inner + '</button>';
            }
            return '<a class="m-tab' + active + '" href="' + href + '"' +
                (active ? ' aria-current="page"' : '') + '>' + inner + '</a>';
        }

        var tabbar = document.createElement('nav');
        tabbar.className = 'm-tabbar';
        tabbar.setAttribute('aria-label', 'Almanac sections');
        tabbar.innerHTML =
            tab('home', 'Home', './') +
            tab('standings', 'Standings', 'standings.html') +
            tab('history', 'History', '', true) +
            tab('more', 'More', '', true) +
            tab('live', 'Live', 'live-season/');
        document.body.appendChild(tabbar);

        var sheets = buildSheets(ctx);
        tabbar.querySelectorAll('button[data-sheet]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                openSheet(btn.dataset.sheet === 'history' ? sheets.history : sheets.more);
            });
        });
    }

    // ── Lock overlay (UDFA-locked pages) — styles live in mobile-app.css ─
    function buildLockOverlay() {
        var ctx = dcContext();
        if (!ctx.pageLocked) return;
        if (document.getElementById('dc-lock-overlay')) return;

        var backHref = '/pricing';
        try {
            backHref = '/pricing?back=' + encodeURIComponent(
                window.location.pathname + window.location.search,
            );
        } catch (e) { /* fall back to /pricing */ }

        var overlay = document.createElement('div');
        overlay.id = 'dc-lock-overlay';
        overlay.className = 'dc-lock-overlay';
        overlay.innerHTML =
            '<div class="dc-locked-card" role="alertdialog" aria-labelledby="dc-locked-title">' +
                '<div class="dc-locked-kicker">★ Free Tier · UDFA ★</div>' +
                '<div class="dc-locked-icon" aria-hidden>✦</div>' +
                '<h2 class="dc-locked-title" id="dc-locked-title">' +
                    'This chapter is <em>locked.</em>' +
                '</h2>' +
                '<p class="dc-locked-sub">' +
                    escapeHtml(ctx.name || 'This league') + ' is on the free UDFA tier.' +
                    ' The full almanac opens up on a paid plan.' +
                '</p>' +
                '<a class="dc-locked-cta" href="' + backHref + '" target="_top">' +
                    'See plans &amp; upgrade' +
                '</a>' +
                '<div>' +
                    '<a class="dc-locked-ghost" href="./" target="_top">← Back to the hub</a>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        // Match the page's own background (records is green, draft near-black)
        // so the lock reads as part of the chapter.
        var pageBg = '';
        try {
            pageBg = window.getComputedStyle(document.body).backgroundColor || '';
        } catch (e) { /* keep default */ }
        if (pageBg && pageBg !== 'rgba(0, 0, 0, 0)' && pageBg !== 'transparent') {
            overlay.style.background = pageBg;
        }

        document.documentElement.classList.add('dc-lock-active');
        document.body.classList.add('dc-lock-active');
    }

    // ── Tier strip — slim mobile variant of nav.js's testing strip ──────
    function buildTierStrip() {
        var dc = window.__DC || {};
        var tier = dc.leagueTier;
        if (tier !== 'test' && tier !== 'udfa' && tier !== 'paid' && tier !== 'comp') return;
        if (document.getElementById('dc-testing-strip')) return;

        var pillLabel, text;
        if (tier === 'test') {
            pillLabel = '★ Trial';
            text = 'Your free trial league — some features may be incomplete.';
        } else if (tier === 'udfa') {
            pillLabel = '★ UDFA';
            text = 'Free tier — upgrade to unlock the full chronicle.';
        } else {
            pillLabel = '★ Beta';
            text = 'Still being polished — expect rough edges.';
        }

        var strip = document.createElement('div');
        strip.id = 'dc-testing-strip';
        strip.className = 'm-tier-strip';
        strip.innerHTML =
            '<span class="m-tier-strip-pill">' + pillLabel + '</span>' +
            '<span>' + text + '</span>';
        // In flow as the first body child: body's padding-top already clears
        // the fixed app bar, so the strip renders directly beneath it.
        document.body.insertBefore(strip, document.body.firstChild);
    }

    // ── Init ────────────────────────────────────────────────────────────
    // Progress bar first — synchronously, before any template fetch fires.
    installProgressBar();

    function init() {
        buildShell();
        buildTierStrip();
        buildLockOverlay();
        enhanceAuthLinks();
        wireBookmarkToggle();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
