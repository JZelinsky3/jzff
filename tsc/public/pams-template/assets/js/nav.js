/**
 * Shared nav component for the Dynasty Codex public almanac.
 *
 * Layout (every page, including the hub):
 *   ┌──────────────────┬─────────────────────┬──────────────────┐
 *   │ ← Library         │ Chapter · Title    │ ▦  Dropdown menu │
 *   └──────────────────┴─────────────────────┴──────────────────┘
 *
 * The left arrow always links to /dashboard (the Dynasty Codex library).
 * The dropdown contains in-archive navigation + a footer group with
 * Library and Manage links scoped to the current league.
 *
 * Per-page wiring:
 *   <nav id="site-nav" data-page="standings" data-chapter="CH. I · STANDINGS"></nav>
 *   <script src="/pams-template/assets/js/nav.js"></script>
 *
 * The route handler injects `window.__DC = { slug, name }` so the dropdown
 * knows how to link back to /league/<slug>.
 */
(function () {
    'use strict';

    // ── In-archive page registry (relative paths within /leagues/<slug>/) ──
    var PAGES = [
        { key: 'hub',       label: 'Hub',         path: 'index.html' },
        { key: 'standings', label: 'Standings',   path: 'standings.html' },
        {
            isGroup: true, label: 'Season Odds',
            items: [
                { key: 'pickems',   label: "Pick'ems",       path: 'pickems/index.html' },
                { key: 'powerrank', label: 'Power Rankings', path: 'powerrank/index.html' },
            ]
        },
        {
            isGroup: true, label: 'The Society',
            items: [
                { key: 'managers',  label: 'Managers',  path: 'managers/index.html' },
                { key: 'rivalries', label: 'Rivalries', path: 'rivalries/index.html' },
            ]
        },
        {
            isGroup: true, label: 'League History',
            items: [
                { key: 'seasons', label: 'Season Archives', path: 'seasons/index.html' },
                { key: 'records', label: 'Record Book',     path: 'records.html' },
                { key: 'draft',   label: 'Draft History',   path: 'draft/index.html' },
            ]
        },
    ];

    // All in-archive paths are slug-rooted because the route handler injects
    // <base href="/leagues/<slug>/">. Returning '' here keeps links simple:
    // "standings.html", "managers/index.html", etc. all resolve correctly
    // regardless of which subdirectory the user is currently viewing.
    function archiveRoot() {
        return '';
    }

    function dcContext() {
        var dc = window.__DC || {};
        return {
            slug: dc.slug || '',
            name: dc.name || '',
            isCommish: !!dc.isCommish,
            isSignedIn: !!dc.isSignedIn,
            isBookmarked: !!dc.isBookmarked,
            managePath: dc.slug ? '/league/' + dc.slug : null,
            libraryPath: '/dashboard',
        };
    }

    function buildNav() {
        var nav = document.getElementById('site-nav');
        if (!nav) return;

        var root        = archiveRoot();
        var ctx         = dcContext();
        var currentPage = nav.dataset.page    || '';
        var chapter     = nav.dataset.chapter || '';
        var titleId     = nav.dataset.titleId || 'nav-title';

        // Title cell: prefer page override via data-title-html; otherwise show
        // the league name (split head/tail) and link to the hub on sub-pages.
        var titleHTML;
        if (nav.dataset.titleHtml) {
            titleHTML = nav.dataset.titleHtml;
        } else {
            var parts = (ctx.name || 'Archive').trim().split(/\s+/);
            var head = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
            var tail = parts[parts.length - 1];
            var nameHTML = (head ? head + ' ' : '') + '<em>' + tail + '.</em>';
            titleHTML = currentPage === 'hub'
                ? '<div class="nav-title" id="' + titleId + '">' + nameHTML + '</div>'
                : '<a class="nav-title" id="' + titleId + '" href="' + root + 'index.html">' + nameHTML + '</a>';
        }

        // ── Dropdown contents ─────────────────────────────────────────────
        var inArchiveLinks = PAGES.map(function (p) {
            if (p.isGroup) {
                var visible = p.items.filter(function (i) { return i.key !== currentPage; });
                if (visible.length === 0) return '';
                var sub = visible.map(function (i) {
                    return '<a href="' + root + i.path + '">' + i.label + '</a>';
                }).join('');
                return '<div class="nav-drop-group">'
                    + '<span class="nav-drop-group-lbl">' + p.label
                    + ' <span class="nav-group-arr">›</span></span>'
                    + '<div class="nav-drop-sub">' + sub + '</div>'
                    + '</div>';
            }
            if (p.key === currentPage) return '';
            return '<a href="' + root + p.path + '">' + p.label + '</a>';
        }).join('');

        // Admin footer group: only rendered for the commissioner who owns this
        // league. The route handler injects __DC.isCommish based on the
        // request's auth cookie. Non-signed-in visitors and signed-in users
        // who don't own this league skip this group entirely.
        var dcFooter = '';
        if (ctx.slug && ctx.isCommish) {
            dcFooter =
                '<div class="nav-drop-divider"></div>' +
                '<span class="nav-drop-label">Admin</span>' +
                '<a href="' + ctx.managePath + '">Manage league</a>' +
                '<a href="' + ctx.libraryPath + '">Library</a>';
        }

        // Visitor / signed-in CTA group. Hidden for the commissioner of this
        // league. For non-signed-in visitors → "Join Today" with Home + Sign
        // Up. For signed-in non-commish viewers → "Your account" with
        // bookmark + Library (their dashboard) + Profile.
        var visitorCta = '';
        if (!ctx.isCommish) {
            var groupLabel = ctx.isSignedIn ? 'Your account' : 'Join Today';
            var bookmarkRow = '';
            if (ctx.isSignedIn && ctx.slug) {
                var bmLabel = ctx.isBookmarked ? '★ Bookmarked' : '☆ Bookmark';
                bookmarkRow =
                    '<a href="#" id="dc-bookmark-toggle" data-slug="' + ctx.slug + '" data-on="' + (ctx.isBookmarked ? '1' : '0') + '">' +
                    bmLabel + '</a>';
            }
            var navLinks = ctx.isSignedIn
                ? '<a href="/dashboard">Library</a><a href="/account">Profile</a>'
                : '<a href="/">Home</a><a href="/login?mode=signup">Sign Up</a>';
            visitorCta =
                '<div class="nav-drop-divider"></div>' +
                '<span class="nav-drop-label">' + groupLabel + '</span>' +
                bookmarkRow +
                navLinks;
        }

        var dropMenu = '<div class="nav-drop nav-drop-right" id="nav-drop" style="justify-self:end;margin-left:auto;">'
            + '<button class="nav-drop-btn" onclick="toggleDrop()" aria-label="Navigate"><svg class="nav-icon" viewBox="0 0 20 14" width="20" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><line x1="0" y1="1" x2="20" y2="1"/><line x1="0" y1="7" x2="20" y2="7"/><line x1="0" y1="13" x2="20" y2="13"/></svg></button>'
            + '<div class="nav-drop-menu">'
            + '<span class="nav-drop-label">Archive</span>'
            + inArchiveLinks
            + dcFooter
            + visitorCta
            + '</div></div>';

        // ── Left slot: back arrow OR bookmark star ───────────────────────
        // On the league's hub page, signed-in viewers who don't own this
        // league get a bookmark toggle in the left slot (instead of a back
        // arrow that doesn't really go anywhere useful for them). The
        // commissioner gets a "Manage this league" arrow that jumps to the
        // admin UI. Non-signed-in visitors and sub-pages keep the normal
        // back-arrow behavior, falling through to history.back() when there
        // was a same-origin referrer.
        var leftSlot = '';
        var dataBackHref = nav.dataset.backHref;
        var dataBackLabel = nav.dataset.backLabel;
        var showBookmark =
            currentPage === 'hub' && ctx.isSignedIn && !ctx.isCommish && ctx.slug && !dataBackHref;

        if (showBookmark) {
            var isOn = ctx.isBookmarked;
            // Use <a> instead of <button> — even with appearance:none, Safari
            // and some Android browsers leak default button chrome (white
            // bg, focus rings, system gradients). An anchor has none of that.
            // Explicit hex stroke/fill (not currentColor) so it can't pick
            // up an inherited color anywhere up the tree.
            leftSlot =
                '<a href="#" class="nav-back" id="nav-bookmark-btn" role="button"' +
                ' data-slug="' + ctx.slug + '" data-on="' + (isOn ? '1' : '0') + '"' +
                ' aria-label="' + (isOn ? 'Remove bookmark' : 'Bookmark this league') + '"' +
                ' title="' + (isOn ? 'Remove bookmark' : 'Bookmark this league') + '">' +
                  '<svg id="nav-bookmark-svg" viewBox="0 0 24 24" width="22" height="22"' +
                  ' fill="' + (isOn ? '#e8c889' : 'none') + '"' +
                  ' stroke="#e8c889" stroke-width="1.8" stroke-linejoin="round">' +
                    '<polygon points="12 2 14.9 8.5 22 9.3 16.7 14 18.2 21 12 17.5 5.8 21 7.3 14 2 9.3 9.1 8.5"/>' +
                  '</svg>' +
                '</a>';
        } else {
            var backHref, backLabel;
            if (dataBackHref) {
                backHref = dataBackHref;
                backLabel = dataBackLabel || 'Back';
            } else if (currentPage === 'hub' && ctx.isCommish) {
                backHref = ctx.managePath;
                backLabel = 'Manage this league';
            } else if (currentPage === 'hub') {
                // Visitor on hub — no useful destination by default. The
                // click handler below upgrades to history.back() when there's
                // a same-origin referrer; href falls back to site home.
                backHref = '/';
                backLabel = 'Back';
            } else {
                backHref = 'index.html';
                backLabel = 'Back to hub';
            }
            leftSlot =
                '<a class="nav-back" id="nav-back-link" href="' + backHref + '" aria-label="' + backLabel + '">' +
                  '<svg viewBox="0 0 8 14" width="9" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
                    '<polyline points="7 1 1 7 7 13"/>' +
                  '</svg>' +
                '</a>';
        }

        nav.className = 'nav';
        nav.innerHTML =
            leftSlot
            + '<div class="nav-center">'
              + (chapter ? '<div class="nav-kicker">' + chapter + '</div>' : '')
              + titleHTML
            + '</div>'
            + dropMenu;

        // ── Back arrow: prefer history.back() when we have a same-origin
        // referrer, so the user returns to the page they actually came from.
        // Falls through to the declared href on direct loads / external refs,
        // and middle-click/cmd-click still work (we only intercept plain clicks).
        var backLink = document.getElementById('nav-back-link');
        if (backLink) {
            backLink.addEventListener('click', function (e) {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                if (!document.referrer) return;
                try {
                    var ref = new URL(document.referrer);
                    if (ref.origin !== location.origin) return;
                    // Don't loop back to the same page (some browsers leave the
                    // current URL as referrer after a reload).
                    if (ref.pathname === location.pathname && ref.search === location.search) return;
                    e.preventDefault();
                    history.back();
                } catch (err) {
                    // malformed referrer — let the link navigate normally
                }
            });
        }

        // ── Dropdown toggle wiring ───────────────────────────────────────
        function closeAllGroups(drop) {
            if (!drop) return;
            drop.querySelectorAll('.nav-drop-group.open').forEach(function (g) {
                g.classList.remove('open');
            });
        }
        window.toggleDrop = function () {
            var drop = document.getElementById('nav-drop');
            if (!drop) return;
            drop.classList.toggle('open');
            if (!drop.classList.contains('open')) closeAllGroups(drop);
        };
        document.addEventListener('click', function (e) {
            var drop = document.getElementById('nav-drop');
            if (drop && !drop.contains(e.target)) {
                drop.classList.remove('open');
                closeAllGroups(drop);
            }
        });
        // Touch: tap-to-toggle expanded groups.
        nav.querySelectorAll('.nav-drop-group-lbl').forEach(function (lbl) {
            lbl.addEventListener('click', function (e) {
                if (!window.matchMedia('(hover: none)').matches) return;
                e.stopPropagation();
                var group = lbl.parentElement;
                var wasOpen = group.classList.contains('open');
                closeAllGroups(document.getElementById('nav-drop'));
                if (!wasOpen) group.classList.add('open');
            });
        });
    }

    // Small style addendum so we don't have to touch main.css for the new
    // footer divider in the dropdown.
    var style = document.createElement('style');
    style.textContent =
        '.nav-drop-divider { height: 1px; margin: .55rem .25rem; background: rgba(232,200,137,.15); }' +
        '.nav-drop-menu .nav-drop-label:not(:first-child) { margin-top: .15rem; }';
    document.head.appendChild(style);

    // Enhance any signup link (in the dropdown's "Join Today" group + the
    // footer CTA on every almanac page) to carry a `from` query param. The
    // /login page reads `from` and uses it for the back arrow, so visitors
    // who arrive from /leagues/<slug>/whatever get sent back to that page
    // instead of /.
    function enhanceSignupLinks() {
        var here = window.location.pathname + window.location.search;
        var encoded = encodeURIComponent(here);
        document.querySelectorAll('a[href="/login?mode=signup"], a[href="/login"]').forEach(function (a) {
            var sep = a.getAttribute('href').indexOf('?') === -1 ? '?' : '&';
            a.href = a.getAttribute('href') + sep + 'from=' + encoded;
        });
    }

    function wireBookmarkToggle() {
        document.addEventListener('click', function (e) {
            if (!e.target || !e.target.closest) return;
            var dropLink = e.target.closest('#dc-bookmark-toggle');
            var navBtn = e.target.closest('#nav-bookmark-btn');
            var el = dropLink || navBtn;
            if (!el) return;
            e.preventDefault();
            var slug = el.getAttribute('data-slug');
            var on = el.getAttribute('data-on') === '1';
            var action = on ? 'remove' : 'add';
            var origDropText = dropLink ? dropLink.textContent : null;
            if (dropLink) dropLink.textContent = '…';
            fetch('/api/bookmarks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug: slug, action: action }),
            }).then(function (r) {
                if (!r.ok) throw new Error('bookmark failed');
                var nowOn = !on;
                // Update BOTH controls (dropdown link + left-slot button) so they
                // stay in sync regardless of which one was clicked.
                var dropMate = document.getElementById('dc-bookmark-toggle');
                if (dropMate) {
                    dropMate.setAttribute('data-on', nowOn ? '1' : '0');
                    dropMate.textContent = nowOn ? '★ Bookmarked' : '☆ Bookmark';
                }
                var navMate = document.getElementById('nav-bookmark-btn');
                if (navMate) {
                    navMate.setAttribute('data-on', nowOn ? '1' : '0');
                    navMate.setAttribute('aria-label', nowOn ? 'Remove bookmark' : 'Bookmark this league');
                    navMate.setAttribute('title', nowOn ? 'Remove bookmark' : 'Bookmark this league');
                    var svg = document.getElementById('nav-bookmark-svg');
                    if (svg) svg.setAttribute('fill', nowOn ? '#e8c889' : 'none');
                }
            }).catch(function () {
                if (dropLink && origDropText) dropLink.textContent = origDropText;
            });
        });
    }

    function init() {
        buildNav();
        enhanceSignupLinks();
        wireBookmarkToggle();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
