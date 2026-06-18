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
        { key: 'hub',       label: 'Hub',         path: './' },
        { key: 'standings', label: 'Standings',   path: 'standings.html' },
        {
            isGroup: true, label: 'Live Season',
            items: [
                { key: 'live',     label: 'Overview',         path: 'live/' },
                { key: 'matchup-preview', label: 'Matchup Preview',  path: 'live/matchup-preview/' },
                { key: 'pickems',         label: "Pick'ems",         path: 'live/pickems/' },
                { key: 'powerrank',     label: 'Power Rankings',  path: 'live/powerrank/' },
                { key: 'records-watch', label: 'Records Watch',   path: 'live/records-watch/' },
                { key: 'milestones',    label: 'Milestone Alerts',path: 'live/milestones/' },
                { key: 'trades',        label: 'Trade Grader',    path: 'live/trades/' },
            ]
        },
        {
            isGroup: true, label: 'The Society',
            items: [
                { key: 'managers',  label: 'Managers',  path: 'managers/' },
                { key: 'rivalries', label: 'Rivalries', path: 'rivalries/' },
            ]
        },
        {
            isGroup: true, label: 'League History',
            items: [
                { key: 'seasons', label: 'Season Archives', path: 'seasons/' },
                { key: 'records', label: 'Record Book',     path: 'records.html' },
                { key: 'draft',   label: 'Draft History',   path: 'draft/' },
            ]
        },
    ];

    // All in-archive paths are slug-rooted because the route handler injects
    // <base href="/leagues/<slug>/">. Returning '' here keeps links simple:
    // "standings.html", "managers/", etc. all resolve correctly
    // regardless of which subdirectory the user is currently viewing.
    function archiveRoot() {
        return '';
    }

    // Chapter section bar — newspaper-style sub-nav rendered below the
    // masthead. Mirrors the choices in PAGES but FLAT (no sub-groups) and
    // limited to the top-level chapters readers care about. Live Season
    // sub-pages (overview, trades) stay in the dropdown.
    // Pickems + power rankings now collapse into a single 'Live' link that
    // points at the live hub. Any live sub-page (overview,
    // pickems, powerrank, trades) lights up the Live tab as active.
    var LIVE_SEASON_KEYS = ['live', 'matchup-preview', 'pickems', 'powerrank', 'records-watch', 'milestones', 'trades'];
    var CHAPBAR_ITEMS = [
        { key: 'hub',         label: 'Home',      path: './' },
        { key: 'standings',   label: 'Standings', path: 'standings.html' },
        { key: 'managers',    label: 'Managers',  path: 'managers/' },
        { key: 'seasons',     label: 'Seasons',   path: 'seasons/' },
        { key: 'draft',       label: 'Drafts',    path: 'draft/' },
        { key: 'records',     label: 'Records',   path: 'records.html' },
        { key: 'rivalries',   label: 'Rivalries', path: 'rivalries/' },
        { key: 'live', label: 'Live',      path: 'live/' }
    ];

    function buildChapBar(currentPage, root) {
        // Remove any prior render so multiple buildNav() calls don't stack bars.
        var existing = document.getElementById('nav-chapbar');
        if (existing) existing.remove();

        var bar = document.createElement('nav');
        bar.id = 'nav-chapbar';
        bar.className = 'nav-chapbar';
        bar.setAttribute('aria-label', 'Chapters');

        var html = '<div class="nav-chapbar-track">';
        for (var i = 0; i < CHAPBAR_ITEMS.length; i++) {
            var item = CHAPBAR_ITEMS[i];
            // Live tab lights up for the entire live subtree
            // (overview, pickems, powerrank, trades); every other tab
            // matches its own key exactly.
            var isActive = item.key === 'live'
                ? LIVE_SEASON_KEYS.indexOf(currentPage) !== -1
                : item.key === currentPage;
            html += '<a href="' + root + item.path + '"'
                  + ' class="nav-chapbar-link' + (isActive ? ' is-active' : '') + '"'
                  + (isActive ? ' aria-current="page"' : '')
                  + '>' + item.label + '</a>';
        }
        html += '</div>';
        bar.innerHTML = html;

        var nav = document.getElementById('site-nav');
        if (nav && nav.parentNode) {
            nav.parentNode.insertBefore(bar, nav.nextSibling);
        }
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
                : '<a class="nav-title" id="' + titleId + '" href="' + root + '">' + nameHTML + '</a>';
        }

        // ── Dropdown contents ─────────────────────────────────────────────
        // In-archive chapter links live in the new chapter section bar
        // below the masthead, so they're intentionally NOT duplicated in
        // the dropdown. The dropdown now carries only:
        //   • the visitor CTA group (Sign in / New chronicle / Home)
        //   • the signed-in account group (Library / Profile / Bookmark)
        //   • the commissioner-only Admin group
        // Empty string preserved so existing concatenation below still
        // reads — saves restructuring the rest of the function.
        var inArchiveLinks = '';

        // Admin footer group: only rendered for the commissioner who owns this
        // league. The route handler injects __DC.isCommish based on the
        // request's auth cookie. Non-signed-in visitors and signed-in users
        // who don't own this league skip this group entirely.
        var dcFooter = '';
        if (ctx.slug && ctx.isCommish) {
            dcFooter =
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
                var bmLabel = ctx.isBookmarked ? 'Bookmarked ★' : 'Bookmark ☆';
                bookmarkRow =
                    '<a href="#" id="dc-bookmark-toggle" data-slug="' + ctx.slug + '" data-on="' + (ctx.isBookmarked ? '1' : '0') + '">' +
                    bmLabel + '</a>';
            }
            // Visitors get two distinct affordances instead of one each labeled
            // Sign In / Sign Up:
            //   • Sign in            → /login?next=&from=<here>. After auth they
            //                          land back on the league they were on.
            //   • Start an archive   → /login?mode=signup&from=<here>. No
            //                          `next`, so after auth they land on
            //                          /dashboard to build their own.
            // enhanceAuthLinks() below stamps the params on at runtime.
            var navLinks = ctx.isSignedIn
                ? '<a href="/dashboard">Library</a><a href="/account">Profile</a>'
                : '<a href="/">Home</a>'
                + '<a href="/login" data-dc-signin>Sign in</a>'
                + '<a href="/login?mode=signup">New chronicle</a>';
            visitorCta =
                '<span class="nav-drop-label">' + groupLabel + '</span>' +
                bookmarkRow +
                navLinks;
        }

        // Join the section bodies with dividers only BETWEEN them, never
        // before the first non-empty section. (Previously each section
        // shipped its own leading divider, which painted a blank gap at
        // the top of the dropdown whenever the in-archive list was empty.)
        var sectionBodies = [dcFooter, visitorCta].filter(function (s) { return !!s; });
        var dropBody = sectionBodies.join('<div class="nav-drop-divider"></div>');

        var dropMenu = '<div class="nav-drop nav-drop-right" id="nav-drop" style="justify-self:end;margin-left:auto;">'
            + '<button class="nav-drop-btn" onclick="toggleDrop()" aria-label="Navigate"><svg class="nav-icon" viewBox="0 0 20 14" width="20" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><line x1="0" y1="1" x2="20" y2="1"/><line x1="0" y1="7" x2="20" y2="7"/><line x1="0" y1="13" x2="20" y2="13"/></svg></button>'
            + '<div class="nav-drop-menu">'
            + dropBody
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
                backHref = './';
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

        // Render the chapter section bar right below the masthead. Active
        // chapter gets a gold underline; everything else is one click away
        // without opening the dropdown.
        buildChapBar(currentPage, root);

        // Publish the masthead's actual rendered height as a CSS variable
        // so the chapter bar's sticky `top` can match it exactly. Without
        // this, the masthead would overlap the chapter bar by a few pixels
        // on scroll (we'd guessed 4.5rem ≈ 72px, but the real height is
        // ~76px and varies by viewport).
        var publishNavHeight = function () {
            var h = nav.getBoundingClientRect().height;
            if (h > 0) {
                document.documentElement.style.setProperty('--nav-h', h + 'px');
            }
        };
        publishNavHeight();
        window.addEventListener('resize', publishNavHeight);

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

    // Style addendum. Each league template ships its own inline <style>
    // block (no external main.css link), so any new CSS class we need
    // gets injected here at runtime. Covers the footer divider in the
    // dropdown AND the chapter section bar this script renders.
    var style = document.createElement('style');
    style.textContent = [
        // Demo bookmark star: lives with the back arrow in the left grid
        // cell, spaced a beat apart so the two controls read separately.
        '.nav-left-group { display: flex; align-items: center; gap: 1.5rem; justify-self: start; }',
        '#demo-bookmark-star { display: inline-flex; align-items: center; line-height: 0; opacity: .85; transition: opacity .15s, transform .15s; }',
        '#demo-bookmark-star:hover { opacity: 1; transform: scale(1.12); }',

        '.nav-drop-divider { height: 1px; margin: .55rem .25rem; background: rgba(232,200,137,.15); }',
        '.nav-drop-menu .nav-drop-label:not(:first-child) { margin-top: .15rem; }',

        // Chapter section bar — sticks at exactly the masthead's bottom
        // edge so the two read as one continuous header on scroll. The
        // --nav-h custom property is set by JS to the masthead's real
        // height (fallback to 4.5rem if the script hasn't run yet).
        // Chapbar styles use CSS variables so per-page themes can override
        // them by setting :root { --chapbar-bg: ... } in their own <style>
        // blocks (records.html, standings.html, etc.). Fallbacks default
        // to the navy/gold palette so untouched pages render fine.
        '.nav-chapbar {',
        '  position: sticky; top: var(--nav-h, 4.5rem); z-index: 29;',
        '  background: var(--chapbar-bg, rgba(14, 22, 32, .9));',
        '  -webkit-backdrop-filter: blur(12px);',
        '  backdrop-filter: blur(12px);',
        '  border-bottom: 1px solid var(--chapbar-border, var(--ink-line, #2a3645));',
        '}',
        '.nav-chapbar-track {',
        '  display: flex; align-items: stretch;',
        '  justify-content: center;',
        '  overflow-x: auto; overscroll-behavior-x: contain;',
        '  scrollbar-width: none;',
        '  max-width: 1370px; margin: 0 auto;',
        '  padding: 0 1rem;',
        '}',
        '.nav-chapbar-track::-webkit-scrollbar { display: none; }',
        '.nav-chapbar-link {',
        '  flex-shrink: 0; position: relative;',
        '  color: var(--chapbar-text, var(--cream-soft, #c9c0ad));',
        '  text-decoration: none;',
        '  font-family: var(--mono, "JetBrains Mono", monospace);',
        '  font-weight: 700;',
        '  font-size: .78rem; letter-spacing: .2em; text-transform: uppercase;',
        '  padding: .65rem 1.3rem .75rem;',
        '  transition: color .15s;',
        '  white-space: nowrap;',
        '}',
        '.nav-chapbar-link:hover { color: var(--chapbar-active, var(--gold, #e8c889)); }',
        '.nav-chapbar-link.is-active { color: var(--chapbar-active, var(--gold, #e8c889)); }',
        '.nav-chapbar-link.is-active::after {',
        '  content: ""; position: absolute;',
        '  left: 1.3rem; right: 1.3rem; bottom: 0;',
        '  height: 2px; background: var(--chapbar-active, var(--gold, #e8c889));',
        '}',
        '.nav-chapbar-link + .nav-chapbar-link::before {',
        '  content: ""; position: absolute; left: 0;',
        '  top: 35%; bottom: 35%; width: 1px;',
        '  background: var(--chapbar-line, var(--ink-line, #2a3645));',
        '}',
        '@media (max-width: 640px) {',
        '  .nav-chapbar-track { justify-content: flex-start; padding: 0 .15rem; }',
        '  .nav-chapbar-link { padding: .55rem .75rem; font-size: .58rem; letter-spacing: .15em; }',
        '  .nav-chapbar-link.is-active::after { left: .75rem; right: .75rem; }',
        '  .nav-chapbar-link + .nav-chapbar-link::before { top: 28%; bottom: 28%; }',
        '}',
        '@media (max-width: 380px) {',
        '  .nav-chapbar-link { padding: .4rem .45rem .5rem; font-size: .48rem; letter-spacing: .11em; }',
        '  .nav-chapbar-link.is-active::after { left: .45rem; right: .45rem; }',
        '}'
    ].join('\n');
    document.head.appendChild(style);

    // Stamp the current league URL onto auth links so visitors land somewhere
    // sensible. Two distinct behaviors:
    //   • [data-dc-signin]              → next + from = current page. Returns
    //                                      them to the league they were reading
    //                                      after signing in, AND the /login
    //                                      back-arrow points there too.
    //   • a[href^="/login?mode=signup"] → from only. Sign-up flow always lands
    //                                      on /dashboard after auth (no
    //                                      `next`), but the back-arrow still
    //                                      returns to the league they were on.
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
            // Idempotent: don't double-stamp if init runs twice.
            if (base.indexOf('from=') !== -1) return;
            a.href = base + '&from=' + encoded;
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
            fetch('/api/bookmarks/', {
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
                    dropMate.textContent = nowOn ? 'Bookmarked ★' : 'Bookmark ☆';
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

    // Demo-only: pin a slim sticky strip above the masthead announcing
    // that live testing is open. Persists through every scroll so visitors
    // don't lose the call-to-action once they've scrolled past the
    // homepage banner. Guarded on URL so this never renders on the real
    // /leagues/<slug>/ deployments — only inside /demo/.
    function buildDemoStrip() {
        if (!/^\/demo(\/|$)/.test(window.location.pathname)) return;
        if (document.getElementById('dc-demo-strip')) return;

        var strip = document.createElement('div');
        strip.id = 'dc-demo-strip';
        strip.className = 'dc-demo-strip';
        strip.innerHTML =
            '<span class="dc-demo-strip-pill">★ Demo</span>' +
            '<span class="dc-demo-strip-text">' +
                'Live testing is open — spin up your own almanac at ' +
                '<a href="/" target="_top">jzff.online</a>.' +
            '</span>';
        document.body.insertBefore(strip, document.body.firstChild);

        // Push the existing sticky stack (masthead + chapbar) down by the
        // strip's height so nothing overlaps. Uses !important so per-page
        // theme styles can't push the nav back to top:0 and bury the strip.
        var style = document.createElement('style');
        style.setAttribute('data-demo-strip', '1');
        style.textContent = [
            ':root { --demo-strip-h: 44px; }',
            '.dc-demo-strip {',
            '  position: fixed; top: 0; left: 0; right: 0; z-index: 100;',
            '  height: var(--demo-strip-h);',
            '  display: flex; align-items: center; justify-content: center;',
            '  gap: .8rem; padding: 0 1rem;',
            // Light steel-blue wash, distinct from the gold/cream chapbar
            // so the strip reads as a separate "alert" surface, not nav.
            '  background: linear-gradient(90deg, #8fb4cf 0%, #b8d4e6 50%, #8fb4cf 100%);',
            '  color: #0e1620;',
            '  border-bottom: 1px solid #2a3645;',
            '  font-family: "JetBrains Mono", "SF Mono", monospace;',
            '  font-size: .76rem; font-weight: 700;',
            '  letter-spacing: .18em; text-transform: uppercase;',
            '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
            '}',
            '.dc-demo-strip-pill {',
            '  background: #0e1620; color: #b8d4e6;',
            '  padding: 4px 9px; border-radius: 2px;',
            '  font-size: .72rem;',
            '  letter-spacing: .22em;',
            '}',
            '.dc-demo-strip-text { color: #0e1620; }',
            '.dc-demo-strip-text a {',
            '  color: #0e1620; text-decoration: none;',
            '  border-bottom: 1px solid currentColor;',
            '  transition: color .15s, border-color .15s;',
            '}',
            '.dc-demo-strip-text a:hover { color: #a04830; border-bottom-color: #a04830; }',
            '@media (max-width: 480px) {',
            '  :root { --demo-strip-h: 38px; }',
            '  .dc-demo-strip { font-size: .64rem; letter-spacing: .12em; gap: .55rem; }',
            '  .dc-demo-strip-pill { font-size: .6rem; padding: 3px 7px; }',
            '  .dc-demo-strip-text { letter-spacing: .08em; }',
            '}',
            // Reserve space at the top of the page so the body content',
            // doesn\'t slide under the fixed strip.',
            'body { padding-top: var(--demo-strip-h) !important; }',
            // Offset the sticky masthead + chapbar so they ride below the',
            // strip instead of stacking on top of it.',
            'nav.nav { top: var(--demo-strip-h) !important; }',
            '.nav-chapbar { top: calc(var(--nav-h, 4.5rem) + var(--demo-strip-h)) !important; }'
        ].join('\n');
        document.head.appendChild(style);
    }

    // Demo-only: bookmark star in the masthead, a beat to the right of the
    // back arrow. The demo has no league row in the DB, so the toggle
    // persists to localStorage ('tsc-demo-bookmark') and the Clubhouse
    // Newsstand reads the same key to show a Demo card on Your Shelf.
    // Replaces the old corner ribbon, which read as page chrome rather
    // than a control. Hub page only, mirroring the real-league left-slot
    // bookmark.
    function buildDemoBookmark() {
        if (!/^\/demo(\/|$)/.test(window.location.pathname)) return;
        var nav = document.getElementById('site-nav');
        if (!nav || nav.dataset.page !== 'hub') return;
        var back = document.getElementById('nav-back-link');
        if (!back || document.getElementById('demo-bookmark-star')) return;

        var on = false;
        try { on = localStorage.getItem('tsc-demo-bookmark') === '1'; } catch (e) {}

        var star = document.createElement('a');
        star.href = '#';
        star.id = 'demo-bookmark-star';
        star.setAttribute('role', 'button');

        function paint() {
            star.setAttribute('aria-pressed', on ? 'true' : 'false');
            star.setAttribute('aria-label', on ? 'Remove bookmark' : 'Bookmark this league');
            star.setAttribute('title', on ? 'Remove bookmark' : 'Bookmark this league');
            star.innerHTML =
                '<svg viewBox="0 0 24 24" width="20" height="20"' +
                ' fill="' + (on ? '#e8c889' : 'none') + '"' +
                ' stroke="#e8c889" stroke-width="1.8" stroke-linejoin="round">' +
                  '<polygon points="12 2 14.9 8.5 22 9.3 16.7 14 18.2 21 12 17.5 5.8 21 7.3 14 2 9.3 9.1 8.5"/>' +
                '</svg>';
        }
        paint();

        star.addEventListener('click', function (e) {
            e.preventDefault();
            on = !on;
            try {
                if (on) localStorage.setItem('tsc-demo-bookmark', '1');
                else localStorage.removeItem('tsc-demo-bookmark');
            } catch (err) {}
            paint();
        });

        // Group the back arrow + star inside the nav's left grid cell so
        // the masthead keeps its 3-column layout.
        var wrap = document.createElement('div');
        wrap.className = 'nav-left-group';
        back.parentNode.insertBefore(wrap, back);
        wrap.appendChild(back);
        wrap.appendChild(star);
    }

    function init() {
        buildDemoStrip();
        buildNav();
        buildDemoBookmark();
        enhanceAuthLinks();
        wireBookmarkToggle();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
