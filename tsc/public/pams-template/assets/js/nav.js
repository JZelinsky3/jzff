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

    // ── Demo "Add to Home Screen" tile ──
    // The static /demo and /demo-m pages aren't served by the almanac route,
    // so they never get the apple-touch-icon + manifest tags that real
    // leagues do — iOS falls back to a screenshot tile with a default letter.
    // Inject the same head tags here, pointing at the icon/manifest API,
    // which special-cases slug=demo so the tile renders the bookplate design
    // with a "DEMO." monogram instead of a generic black square.
    (function installDemoHomeScreenTile() {
        var dc = window.__DC || {};
        if (dc.slug !== 'demo') return;
        if (window.__DC_DEMO_TILE_INSTALLED) return;
        window.__DC_DEMO_TILE_INSTALLED = true;
        var head = document.head;
        function add(tag, attrs) {
            if (attrs.rel && head.querySelector('link[rel="' + attrs.rel + '"]')) return;
            if (attrs.name && head.querySelector('meta[name="' + attrs.name + '"]')) return;
            var el = document.createElement(tag);
            for (var k in attrs) el.setAttribute(k, attrs[k]);
            head.appendChild(el);
        }
        add('link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/api/og/icon/demo?s=180&v=3' });
        add('link', { rel: 'manifest', href: '/api/og/manifest/demo' });
        add('meta', { name: 'apple-mobile-web-app-title', content: 'Demo' });
        add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
        add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
        add('meta', { name: 'theme-color', content: '#0e1620' });
    })();

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
                { key: 'trades',        label: 'The Trade Desk',  path: 'live/trades/' },
                { key: 'manager-dna',   label: 'Manager DNA',     path: 'live/manager-dna/' },
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
    // limited to the top-level chapters readers care about. Any
    // live sub-page lights up the single 'Live' tab as active,
    // and pages in that subtree also get the slimmer sub-rail below
    // (LIVE_SUBRAIL_ITEMS) for lateral moves within the section.
    var LIVE_SEASON_KEYS = ['live', 'matchup-preview', 'pickems', 'powerrank', 'best-coach', 'records-watch', 'milestones', 'trades', 'manager-dna'];

    // Live Season sub-rail — second, slimmer row rendered under the
    // chapbar on every page in the live subtree, so readers can
    // move laterally between live pages without round-tripping through
    // the section hub. Pick'ems + Power Rankings ship their own custom
    // mastheads (pe-nav / pr-nav) so the rail doesn't render THERE, but
    // they're still reachable FROM it. Sunday Live is intentionally
    // absent — it lives outside the Live Season section.
    // Order mirrors the hub's three groups: Weekly Slate (matchups,
    // powerrank, pick'ems), Watch Desk (records, coach, milestones),
    // Front Office (trades, DNA) — with Overview leading.
    var LIVE_SUBRAIL_ITEMS = [
        { key: 'live',     label: 'Overview',      path: 'live/' },
        { key: 'matchup-preview', label: 'Matchups',      path: 'live/matchup-preview/' },
        { key: 'powerrank',       label: 'Power Rank',    path: 'live/powerrank/' },
        { key: 'pickems',         label: "Pick'ems",      path: 'live/pickems/' },
        { key: 'records-watch',   label: 'Records Watch', path: 'live/records-watch/' },
        { key: 'best-coach',      label: 'Best Coach',    path: 'live/best-coach/' },
        { key: 'milestones',      label: 'Milestones',    path: 'live/milestones/' },
        { key: 'trades',          label: 'Trade Desk',    path: 'live/trades/' },
        { key: 'manager-dna',     label: 'DNA',           path: 'live/manager-dna/' },
    ];
    // History-mode chapbar (default). Shown on every non-live page. The
    // 'live' tab links to /live/ (the new Live Home dashboard) and picks up
    // a pulsing dot when window.__DC.liveWeek is between 1 and 18 — the
    // server resolves that from the league's current live season settings.
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

    // Live-mode chapbar. Replaces the history chapbar entirely when the
    // user is on any page in LIVE_SEASON_KEYS. First item is a "← History"
    // back link to the league hub (the history landing page); the rest are
    // the live-season pages, flat — no second rail needed because they
    // ARE the chapbar in this mode. Exception: the Trade Desk page renders
    // its own subrail underneath (see TRADE_DESK_SUBRAIL_ITEMS).
    var LIVE_CHAPBAR_ITEMS = [
        { key: '__history',       label: 'History',      path: './',                   back: true },
        { key: 'live',            label: 'Live',         path: 'live/' },
        { key: 'matchup-preview', label: 'Matchups',     path: 'live/matchup-preview/' },
        { key: 'powerrank',       label: 'Power Rank',   path: 'live/powerrank/' },
        { key: 'pickems',         label: "Pick'ems",     path: 'live/pickems/' },
        { key: 'records-watch',   label: 'Records',      path: 'live/records-watch/' },
        { key: 'best-coach',      label: 'Coach',        path: 'live/best-coach/' },
        { key: 'milestones',      label: 'Milestones',   path: 'live/milestones/' },
        { key: 'trades',          label: 'Trades',       path: 'live/trades/' },
        { key: 'manager-dna',     label: 'DNA',          path: 'live/manager-dna/' }
    ];

    // Trade Desk subrail. Every trades subpage shares data-page="trades"
    // so we match by URL pathname instead of currentPage. Shown only in
    // live mode while on a /live/trades/... path. Order mirrors the four
    // top-level tools plus the desk root.
    var TRADE_DESK_SUBRAIL_ITEMS = [
        { match: /\/live\/trades\/?$/,         label: 'Desk',     path: 'live/trades/' },
        { match: /\/live\/trades\/analyzer\//, label: 'Analyzer', path: 'live/trades/analyzer/' },
        { match: /\/live\/trades\/finder\//,   label: 'Finder',   path: 'live/trades/finder/' },
        { match: /\/live\/trades\/grader\//,   label: 'Grader',   path: 'live/trades/grader/' },
        { match: /\/live\/trades\/mocks\//,    label: 'Mocks',    path: 'live/trades/mocks/' }
    ];

    // Chapter keys that the UDFA gate locks at the page level. Mirrors
    // UDFA_LOCKED_PAGE_PATTERNS in src/lib/leagueTier.ts — keep them in
    // sync. Tabs in this list get an 'is-locked' class on UDFA leagues
    // so visitors see at a glance which chapters need an upgrade.
    var UDFA_LOCKED_CHAPTER_KEYS = ['live', 'draft', 'records'];

    function buildChapBar(currentPage, root) {
        // Remove any prior render so multiple buildNav() calls don't stack bars.
        var existing = document.getElementById('nav-chapbar');
        if (existing) existing.remove();

        var bar = document.createElement('nav');
        bar.id = 'nav-chapbar';
        bar.className = 'nav-chapbar';
        bar.setAttribute('aria-label', 'Chapters');

        var dc = window.__DC || {};
        var udfa = dc.leagueTier === 'udfa';
        // Mode split: history (default) vs live. Any live-subtree page swaps
        // the chapbar contents instead of stacking a subrail underneath, so
        // the live section reads as its own dedicated mode.
        var isLiveMode = LIVE_SEASON_KEYS.indexOf(currentPage) !== -1;
        var items = isLiveMode ? LIVE_CHAPBAR_ITEMS : CHAPBAR_ITEMS;
        // Glow trigger: server resolves the league's current NFL week from
        // its live season settings (1–18 during the regular season, null
        // otherwise). Only relevant in history mode — once you're in live
        // mode the indicator is redundant.
        var liveWeek = typeof dc.liveWeek === 'number' ? dc.liveWeek : null;
        var liveGlow = !isLiveMode && liveWeek !== null && liveWeek >= 1 && liveWeek <= 18;
        bar.className = 'nav-chapbar' + (isLiveMode ? ' is-live-mode' : '');

        var html = '<div class="nav-chapbar-track' + (isLiveMode ? ' is-live-mode' : '') + '">';
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            // Live-mode active match is exact (currentPage === item.key).
            // History-mode 'live' tab lights for the whole live subtree —
            // though in practice that branch never fires here because we
            // render LIVE_CHAPBAR_ITEMS when in live mode.
            var isActive = !isLiveMode && item.key === 'live'
                ? LIVE_SEASON_KEYS.indexOf(currentPage) !== -1
                : item.key === currentPage;
            var isLocked = udfa && UDFA_LOCKED_CHAPTER_KEYS.indexOf(item.key) !== -1;
            var isBack = !!item.back;
            // Live tab pulses its own label gold (instead of carrying a
            // separate dot) when the league is in regular-season weeks.
            var hasLivePulse = item.key === 'live' && liveGlow;
            var cls = 'nav-chapbar-link'
                    + (isActive ? ' is-active' : '')
                    + (isLocked ? ' is-locked' : '')
                    + (isBack ? ' is-back' : '')
                    + (hasLivePulse ? ' has-livepulse' : '');
            var lockGlyph = isLocked ? ' <span class="nav-chapbar-lock" aria-hidden>✦</span>' : '';
            html += '<a href="' + root + item.path + '"'
                  + ' class="' + cls + '"'
                  + (isActive ? ' aria-current="page"' : '')
                  + (isLocked ? ' title="Locked — upgrade to unlock"' : '')
                  + (hasLivePulse ? ' title="Week ' + liveWeek + ' is live"' : '')
                  + '>' + item.label + lockGlyph
                  + '</a>';
        }
        html += '</div>';

        // Trade Desk subrail — only rendered when the current URL is under
        // /live/trades/... Every trades page shares data-page="trades", so
        // the active match has to come from window.location.pathname.
        if (isLiveMode && currentPage === 'trades') {
            var pathname = (window.location && window.location.pathname) || '';
            html += '<div class="nav-subrail"><div class="nav-subrail-track">';
            for (var j = 0; j < TRADE_DESK_SUBRAIL_ITEMS.length; j++) {
                var sub = TRADE_DESK_SUBRAIL_ITEMS[j];
                var subActive = sub.match.test(pathname);
                html += '<a href="' + root + sub.path + '"'
                      + ' class="nav-subrail-link' + (subActive ? ' is-active' : '') + '"'
                      + (subActive ? ' aria-current="page"' : '')
                      + '>' + sub.label + '</a>';
            }
            html += '</div></div>';
        }
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
            viewerTier: dc.viewerTier || null,
            leagueTheme: dc.leagueTheme || null,
        };
    }

    var THEMES = [
        { id: null,              label: 'Default',        minTier: null },
        { id: 'broadsheet',      label: 'Broadsheet',     minTier: 'tier2' },
        { id: 'midnight-press',  label: 'Midnight Press', minTier: 'tier3' },
    ];
    var TIER_RANK = { tier1: 1, tier2: 2, tier3: 3, comp: 99 };

    function canUseTier(viewerTier, requiredTier) {
        if (!requiredTier) return true;
        if (!viewerTier) return false;
        return (TIER_RANK[viewerTier] || 0) >= (TIER_RANK[requiredTier] || 0);
    }

    function applyTheme(themeId) {
        if (themeId) {
            document.body.setAttribute('data-theme', themeId);
        } else {
            document.body.removeAttribute('data-theme');
        }
    }

    function saveTheme(leagueId, themeId) {
        fetch('/api/leagues/' + leagueId + '/theme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme: themeId }),
        });
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

        // Theme picker: commish-only, on theme-eligible pages
        var themePicker = '';
        var themePage = document.body.getAttribute('data-page');
        if (themePage && ctx.isCommish && ctx.viewerTier) {
            var activeTheme = ctx.leagueTheme || null;
            var tierLabels = { tier2: 'Veteran', tier3: 'All-Pro' };
            themePicker = '<span class="nav-drop-label">Theme</span><div class="theme-picker"><div class="theme-picker-options">';
            for (var ti = 0; ti < THEMES.length; ti++) {
                var t = THEMES[ti];
                var unlocked = canUseTier(ctx.viewerTier, t.minTier);
                var active = (t.id === activeTheme);
                var cls = 'theme-option' + (active ? ' is-active' : '') + (!unlocked ? ' is-locked' : '');
                var tierTag = t.minTier && tierLabels[t.minTier]
                    ? '<span class="theme-option-tier">' + tierLabels[t.minTier] + '</span>'
                    : '';
                themePicker += '<button class="' + cls + '"'
                    + ' data-theme-id="' + (t.id || '') + '"'
                    + (unlocked ? '' : ' disabled')
                    + '><span class="theme-option-dot"></span>'
                    + '<span class="theme-option-name">' + t.label + '</span>'
                    + tierTag + '</button>';
            }
            themePicker += '</div></div>';
        }

        var sectionBodies = [dcFooter, visitorCta, themePicker].filter(function (s) { return !!s; });
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
        // Hub viewers (signed-in OR out) who aren't the commissioner get the
        // bookmark star in the left slot. For signed-out viewers, the click
        // opens a "Sign in to bookmark" modal instead of hitting the API.
        var showBookmark =
            currentPage === 'hub' && !ctx.isCommish && ctx.slug && !dataBackHref;

        if (showBookmark) {
            var isOn = ctx.isBookmarked && ctx.isSignedIn;
            var bmLabel = !ctx.isSignedIn
                ? 'Sign in to bookmark'
                : (isOn ? 'Remove bookmark' : 'Bookmark this league');
            // Use <a> instead of <button> — even with appearance:none, Safari
            // and some Android browsers leak default button chrome (white
            // bg, focus rings, system gradients). An anchor has none of that.
            // Explicit hex stroke/fill (not currentColor) so it can't pick
            // up an inherited color anywhere up the tree.
            leftSlot =
                '<a href="#" class="nav-back" id="nav-bookmark-btn" role="button"' +
                ' data-slug="' + ctx.slug + '" data-on="' + (isOn ? '1' : '0') + '"' +
                ' data-signed-in="' + (ctx.isSignedIn ? '1' : '0') + '"' +
                ' aria-label="' + bmLabel + '"' +
                ' title="' + bmLabel + '">' +
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
        '  background: var(--chapbar-bg, rgb(14, 22, 32));',
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
        // Live Season sub-rail — slimmer second row under the chapbar.
        // Same track mechanics (centered, scrollable on overflow) but
        // smaller type, tighter padding, and a recessed background.
        // Colors route through --subrail-* vars so each page can key
        // the rail to its SECONDARY accent (the chapbar keeps the
        // primary); fallbacks chain to the chapbar vars so unthemed
        // pages still render coherently. The bg/border live on the
        // full-width .nav-subrail wrapper, not the centered track.
        '.nav-subrail {',
        '  background: var(--subrail-bg, rgba(0,0,0,.22));',
        '  border-top: 1px solid var(--subrail-line, var(--chapbar-line, var(--ink-line, #2a3645)));',
        '}',
        '.nav-subrail-track {',
        '  display: flex; align-items: stretch;',
        '  justify-content: center;',
        '  overflow-x: auto; overscroll-behavior-x: contain;',
        '  scrollbar-width: none;',
        '  max-width: 1370px; margin: 0 auto;',
        '  padding: 0 1rem;',
        '}',
        '.nav-subrail-track::-webkit-scrollbar { display: none; }',
        '.nav-subrail-link {',
        '  flex-shrink: 0; position: relative;',
        '  color: var(--subrail-text, var(--chapbar-text, var(--cream-mute, #8b8676)));',
        '  opacity: .8;',
        '  text-decoration: none;',
        '  font-family: var(--mono, "JetBrains Mono", monospace);',
        '  font-weight: 700;',
        '  font-size: .62rem; letter-spacing: .16em; text-transform: uppercase;',
        '  padding: .42rem .85rem .5rem;',
        '  transition: color .15s, opacity .15s;',
        '  white-space: nowrap;',
        '}',
        '.nav-subrail-link:hover { color: var(--subrail-active, var(--chapbar-active, var(--gold, #e8c889))); opacity: 1; }',
        '.nav-subrail-link.is-active { color: var(--subrail-active, var(--chapbar-active, var(--gold, #e8c889))); opacity: 1; }',
        '.nav-subrail-link.is-active::after {',
        '  content: ""; position: absolute;',
        '  left: .85rem; right: .85rem; bottom: 0;',
        '  height: 2px; background: var(--subrail-active, var(--chapbar-active, var(--gold, #e8c889)));',
        '}',
        '.nav-subrail-link + .nav-subrail-link::before {',
        '  content: ""; position: absolute; left: 0;',
        '  top: 30%; bottom: 30%; width: 1px;',
        '  background: var(--subrail-line, var(--chapbar-line, var(--ink-line, #2a3645)));',
        '}',
        '@media (max-width: 640px) {',
        '  .nav-subrail-track { justify-content: flex-start; padding: 0 .15rem; }',
        '  .nav-subrail-link { padding: .38rem .55rem .46rem; font-size: .52rem; letter-spacing: .12em; }',
        '  .nav-subrail-link.is-active::after { left: .55rem; right: .55rem; }',
        '  .nav-subrail-link + .nav-subrail-link::before { top: 25%; bottom: 25%; }',
        '}',
        // UDFA-locked chapter tab: muted color + lock glyph after the
        // label so the user can see at a glance which chapters need an
        // upgrade. Stays clickable — clicking lands on the lock overlay.
        // When such a tab is ALSO the active page (you're standing on it)
        // we override the gold active color with the locked muted color
        // so the active indicator reads as "active and locked" rather
        // than just "active". The underline stays so the user still has
        // a hint of which tab they're on.
        '.nav-chapbar-link.is-locked {',
        '  color: var(--gold);',
        '}',
        '.nav-chapbar-link.is-locked:hover { color: var(--gold-bright, #f4d9a4); }',
        '.nav-chapbar-link.is-locked.is-active { color: var(--gold, #e8c889); }',
        '.nav-chapbar-link.is-locked.is-active::after {',
        '  background: var(--gold, #e8c889);',
        '}',
        '.nav-chapbar-lock {',
        '  display: inline-block;',
        '  margin-left: .35em;',
        '  font-family: var(--serif, "Cormorant Garamond", serif);',
        '  font-size: .85em;',
        '  color: var(--gold, #e8c889);',
        '  vertical-align: -0.05em;',
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
        '}',
        // Live mode: a faint warm tint on the chapbar background so the
        // section reads as its own "mode" without screaming. The mode is
        // also signaled by the contents themselves (different tabs, the
        // "‹ History" back link) — the tint is just a soft confirmation.
        '.nav-chapbar.is-live-mode {',
        '  background: linear-gradient(180deg, rgba(232,200,137,.06), rgba(14,22,32,1));',
        '}',
        // "History" back-link tab in live mode. Visually quieter than the
        // other tabs (muted color) so the live chapters read as the active
        // block while still keeping the way back one click away.
        '.nav-chapbar-link.is-back {',
        '  color: var(--cream-mute, #8b8676);',
        '  opacity: .85;',
        '}',
        '.nav-chapbar-link.is-back:hover { color: var(--gold, #e8c889); opacity: 1; }',
        // Right-edge separator on the back tab uses the gold accent so
        // "History" reads as grouped on the left, live chapters as a
        // block to the right.
        '.nav-chapbar-link.is-back + .nav-chapbar-link::before {',
        '  background: var(--chapbar-active, var(--gold, #e8c889));',
        '  opacity: .35;',
        '  top: 25%; bottom: 25%;',
        '}',
        // Live-pulse — the Live tab\'s own label fades between gold and a
        // brighter gold whenever window.__DC.liveWeek is between 1 and 18.
        // No dot, no underline — the color itself signals "season is on".
        // Hover and active states win over the pulse animation so the tab
        // still reads as interactive.
        '.nav-chapbar-link.has-livepulse {',
        '  color: var(--gold, #e8c889);',
        '  animation: navLivePulse 2.2s ease-in-out infinite;',
        '}',
        '.nav-chapbar-link.has-livepulse:hover,',
        '.nav-chapbar-link.has-livepulse.is-active {',
        '  animation: none;',
        '  color: var(--chapbar-active, var(--gold, #e8c889));',
        '}',
        '@keyframes navLivePulse {',
        '  0%, 100% { color: var(--gold, #e8c889); }',
        '  50%      { color: var(--gold-bright, #f4d9a4); }',
        '}',
        '@media (prefers-reduced-motion: reduce) {',
        '  .nav-chapbar-link.has-livepulse { animation: none; color: var(--gold, #e8c889); }',
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
            // Left-slot star is the only entry point we render for signed-out
            // viewers. Route them through the sign-in modal instead of the API.
            if (navBtn && navBtn.getAttribute('data-signed-in') === '0') {
                openSigninBookmarkModal(slug);
                return;
            }
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

    // ── Bookmark sign-in prompt + post-signin modal ─────────────────────
    // Signed-out viewers can't add a bookmark directly; clicking the star
    // pops a small centered modal explaining they need an account, with two
    // CTAs (Sign in / Create one) pointed at /login. The login URL bundles
    // `?bm_post=1` onto the return path so when they land back here we know
    // to auto-bookmark and confirm with the post-signin modal (return-to-
    // league vs. go-to-library).

    function ensureBookmarkModalStyles() {
        if (document.getElementById('dc-bm-modal-style')) return;
        var css = document.createElement('style');
        css.id = 'dc-bm-modal-style';
        // Styles are scoped to .dc-bm-* so they can't bleed into pams pages.
        // The backdrop sits on top of nav (z-index 200) and the lock overlay
        // (150); 9500 keeps it above the dropdown panels (9000-ish) too.
        css.textContent = [
            '.dc-bm-backdrop {',
            '  position: fixed; inset: 0; z-index: 9500;',
            '  background: rgba(6, 10, 16, .72);',
            '  display: flex; align-items: center; justify-content: center;',
            '  padding: 2rem;',
            '  opacity: 0; transition: opacity .18s ease;',
            '}',
            '.dc-bm-backdrop.is-open { opacity: 1; }',
            '.dc-bm-modal {',
            '  width: 100%; max-width: 26rem;',
            '  background: var(--ink-card, #0f1620);',
            '  color: var(--cream, #ecdfc7);',
            '  border: 1px solid var(--ink-line, #21303f);',
            '  border-radius: 14px;',
            '  box-shadow: 0 30px 80px rgba(0,0,0,.7);',
            '  padding: 1.4rem 1.4rem 1.2rem;',
            '  transform: translateY(8px); transition: transform .18s ease;',
            '}',
            '.dc-bm-backdrop.is-open .dc-bm-modal { transform: translateY(0); }',
            '.dc-bm-title {',
            '  font-family: var(--serif, Georgia, serif);',
            '  font-size: 1.45rem; line-height: 1.15;',
            '  margin: 0 0 .35rem;',
            '  text-align: center;',
            '}',
            '.dc-bm-title em { font-style: italic; color: var(--gold, #e8c889); }',
            '.dc-bm-body {',
            '  font-family: var(--serif, Georgia, serif);',
            '  font-size: 1rem; line-height: 1.5;',
            '  color: var(--cream-soft, #d6c8ac);',
            '  text-align: center;',
            '  margin: 0 0 1.1rem;',
            '}',
            '.dc-bm-btns { display: flex; flex-direction: column; gap: .55rem; }',
            '.dc-bm-btn {',
            '  display: block; width: 100%;',
            '  padding: .85rem 1rem;',
            '  border-radius: 999px;',
            '  font-family: var(--mono, ui-monospace, monospace); font-weight: 700;',
            '  font-size: .68rem; letter-spacing: .22em; text-transform: uppercase;',
            '  text-align: center; text-decoration: none;',
            '  cursor: pointer;',
            '  border: 1px solid var(--gold-deep, #b58a3c);',
            '  background: var(--gold, #e8c889); color: var(--ink, #06090e);',
            '}',
            '.dc-bm-btn.ghost {',
            '  background: rgba(232, 200, 137, .08);',
            '  color: var(--gold, #e8c889);',
            '  border-color: var(--gold-deep, #b58a3c);',
            '}',
            '.dc-bm-btn.ghost:hover { background: rgba(232, 200, 137, .14); }',
            '.dc-bm-link {',
            '  display: block;',
            '  margin: .85rem auto 0;',
            '  background: transparent; border: none;',
            '  color: var(--cream-soft, #d6c8ac);',
            '  font-family: var(--mono, ui-monospace, monospace);',
            '  font-size: .68rem; letter-spacing: .14em; text-transform: uppercase;',
            '  text-decoration: underline; text-underline-offset: 3px;',
            '  cursor: pointer; padding: .25rem;',
            '  text-align: center;',
            '}',
            '.dc-bm-link:hover { color: var(--gold, #e8c889); }',
            '.dc-bm-close {',
            '  position: absolute; top: .5rem; right: .8rem;',
            '  background: transparent; border: none;',
            '  color: var(--cream-mute, #968976);',
            '  font-size: 1.4rem; line-height: 1;',
            '  cursor: pointer; padding: .2rem .4rem;',
            '}',
        ].join('\n');
        document.head.appendChild(css);
    }

    function openBookmarkModal(innerHTML) {
        ensureBookmarkModalStyles();
        // Tear down any prior modal so successive opens don't stack.
        var prior = document.querySelector('.dc-bm-backdrop');
        if (prior && prior.parentNode) prior.parentNode.removeChild(prior);

        var backdrop = document.createElement('div');
        backdrop.className = 'dc-bm-backdrop';
        backdrop.setAttribute('role', 'dialog');
        backdrop.setAttribute('aria-modal', 'true');
        backdrop.innerHTML =
            '<div class="dc-bm-modal" style="position:relative;">' +
              '<button type="button" class="dc-bm-close" aria-label="Close">×</button>' +
              innerHTML +
            '</div>';
        document.body.appendChild(backdrop);
        // Next frame so the transition runs.
        requestAnimationFrame(function () { backdrop.classList.add('is-open'); });

        function close() {
            backdrop.classList.remove('is-open');
            setTimeout(function () { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); }, 200);
        }
        backdrop.addEventListener('click', function (e) {
            if (e.target === backdrop) close();
            if (e.target.closest && e.target.closest('.dc-bm-close')) close();
            if (e.target.closest && e.target.closest('[data-bm-close]')) close();
        });
        document.addEventListener('keydown', function onKey(ev) {
            if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
        });
        return { close: close, root: backdrop };
    }

    function openSigninBookmarkModal(_slug) {
        var here = window.location.pathname;
        var returnTo = here + (here.indexOf('?') === -1 ? '?' : '&') + 'bm_post=1';
        var encoded = encodeURIComponent(returnTo);
        var fromEnc = encodeURIComponent(here);
        var signinHref = '/login?next=' + encoded + '&from=' + fromEnc;
        var signupHref = '/login?mode=signup&next=' + encoded + '&from=' + fromEnc;
        openBookmarkModal(
            '<h2 class="dc-bm-title">Sign in to <em>bookmark.</em></h2>' +
            '<p class="dc-bm-body">Save this league to your library so you can find it again from anywhere. Free, takes a few seconds.</p>' +
            '<div class="dc-bm-btns">' +
              '<a class="dc-bm-btn" href="' + signupHref + '">Create a free account</a>' +
            '</div>' +
            '<a class="dc-bm-link" href="' + signinHref + '">Already have an account? Sign in</a>'
        );
    }

    function openPostBookmarkModal() {
        openBookmarkModal(
            '<h2 class="dc-bm-title">Bookmarked <em>★</em></h2>' +
            '<p class="dc-bm-body">This league is saved to your library. Where to next?</p>' +
            '<div class="dc-bm-btns">' +
              '<button type="button" class="dc-bm-btn" data-bm-close>Return to this league</button>' +
              '<a class="dc-bm-btn ghost" href="/dashboard">Go to my library</a>' +
            '</div>'
        );
    }

    // Runs once per pageload: if we landed here with ?bm_post=1 AND the
    // viewer is now signed in (and not the commish, and not already
    // bookmarked), POST the bookmark and show the post-signin modal.
    function wirePostSigninBookmark() {
        try {
            var url = new URL(window.location.href);
            if (url.searchParams.get('bm_post') !== '1') return;
        } catch (_) { return; }
        var dc = window.__DC || {};
        if (!dc.slug || !dc.isSignedIn || dc.isCommish) {
            stripBmPostParam();
            return;
        }
        var done = function () { openPostBookmarkModal(); stripBmPostParam(); };
        if (dc.isBookmarked) { done(); return; }
        fetch('/api/bookmarks/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: dc.slug, action: 'add' }),
        }).then(function (r) {
            if (r.ok) {
                // Reflect the new state on the left-slot star without a reload.
                var navMate = document.getElementById('nav-bookmark-btn');
                if (navMate) {
                    navMate.setAttribute('data-on', '1');
                    navMate.setAttribute('aria-label', 'Remove bookmark');
                    navMate.setAttribute('title', 'Remove bookmark');
                    var svg = document.getElementById('nav-bookmark-svg');
                    if (svg) svg.setAttribute('fill', '#e8c889');
                }
            }
            done();
        }).catch(done);
    }

    function stripBmPostParam() {
        try {
            var url = new URL(window.location.href);
            url.searchParams.delete('bm_post');
            history.replaceState({}, '', url.toString());
        } catch (_) { /* noop */ }
    }

    function wireThemePicker() {
        document.addEventListener('click', function (e) {
            if (!e.target || !e.target.closest) return;
            var btn = e.target.closest('.theme-option:not(.is-locked)');
            if (!btn) return;
            e.preventDefault();
            var themeId = btn.getAttribute('data-theme-id') || null;
            applyTheme(themeId);
            var dc = window.__DC || {};
            if (dc.id) saveTheme(dc.id, themeId);
            var all = document.querySelectorAll('.theme-option');
            for (var i = 0; i < all.length; i++) {
                all[i].classList.toggle('is-active', (all[i].getAttribute('data-theme-id') || null) === themeId);
            }
        });
    }

    // Onboarding tour. Loaded lazily after nav builds so first-time visitors
    // see a guided walkthrough; one-line shim so every templated page picks
    // it up without each template having to add a <script> tag. The tour
    // itself handles per-user dismissal (server-side for signed-in users,
    // localStorage for everyone else), so re-injecting it is cheap.
    function loadTutorial() {
        if (document.getElementById('dc-tour-script')) return;
        var s = document.createElement('script');
        s.id = 'dc-tour-script';
        s.src = '/pams-template/assets/js/tutorial.js';
        s.async = true;
        document.head.appendChild(s);
    }

    // Top-of-page progress bar — shown while any data/*.json fetch is in
    // flight. We wrap window.fetch and watch for URLs that look like a
    // data file under the current league bundle. Counter-based so the bar
    // stays visible across the hub's 5 parallel fetches and disappears
    // once they all settle. The bar itself is a fixed gold sliver that
    // animates an indeterminate "marching" gradient — no need to know
    // total work upfront, which we don't.
    //
    // We install the wrapper as early as possible (before nav builds) so
    // a template's fetches that fire on DOMContentLoaded are captured.
    function installProgressBar() {
        if (window.__DC_PROGRESS_INSTALLED) return;
        window.__DC_PROGRESS_INSTALLED = true;

        // Inject the style sheet once.
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

        // The bar element. We need it in the DOM before the first fetch
        // resolves so the transition has somewhere to apply.
        var bar = document.createElement('div');
        bar.id = 'dc-progress';
        bar.setAttribute('role', 'progressbar');
        bar.setAttribute('aria-label', 'Loading league data');
        // <head> already exists by the time nav.js runs; the bar still
        // needs to live in <body> to render. If body isn't here yet (it
        // always is — nav.js runs from a body-end <script> — but be safe),
        // queue insertion for DOMContentLoaded.
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
            // Tiny grace period so several back-to-back fetches don't
            // flicker the bar on/off between them — wait 80ms and only
            // hide if the count is still zero.
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(function () {
                hideTimer = 0;
                if (inflight === 0) bar.classList.remove('is-active');
            }, 80);
        }

        var origFetch = window.fetch;
        if (typeof origFetch !== 'function') return;

        // Match data/*.json under the current league. We accept both the
        // relative form ("data/league.json", what templates write) and the
        // absolute form ("/leagues/<slug>/data/league.json") in case any
        // page hand-rolls the URL. Skip everything else — API calls,
        // bookmarks, tutorial dismissals, etc.
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

    // Light-blue advisory strip for every public almanac during the
    // pre-launch build phase. Wording varies by the league's tier so
    // the message lines up with what the visitor's seeing:
    //   - 'test' → owner's first/free trial league
    //   - 'udfa' → owner's free-tier (non-trial) league
    //   - 'paid' → comp or paid plan
    // The route handler resolves the tier server-side and injects it as
    // __DC.leagueTier.
    function buildTestingStrip() {
        var dc = window.__DC || {};
        var tier = dc.leagueTier;
        if (tier !== 'test' && tier !== 'udfa' && tier !== 'paid' && tier !== 'comp') return;
        if (document.getElementById('dc-testing-strip')) return;

        var pillLabel, text;
        if (tier === 'test') {
            // First league for any non-comp owner — their free trial slot.
            pillLabel = '★ Trial League';
            text = 'Your free trial league. The Sunday Chronicle is still under construction; some features may be incomplete. When the trial ends you can roll this league into your paid plan.';
        } else if (tier === 'udfa') {
            pillLabel = '★ UDFA · Limited';
            text = 'Free-tier league — upgrade to unlock the full chronicle.';
        } else {
            // 'paid' and 'comp' both surface the beta message — the only
            // distinction is the badge color in the hub.
            pillLabel = '★ Beta';
            text = 'The Sunday Chronicle is still being polished — thanks for the early support. Expect rough edges while we ship.';
        }

        var strip = document.createElement('div');
        strip.id = 'dc-testing-strip';
        strip.className = 'dc-demo-strip dc-testing-strip dc-testing-strip--' + tier;
        strip.innerHTML =
            '<span class="dc-demo-strip-pill">' + pillLabel + '</span>' +
            '<span class="dc-demo-strip-text">' + text + '</span>';
        document.body.insertBefore(strip, document.body.firstChild);

        var style = document.createElement('style');
        style.setAttribute('data-testing-strip', '1');
        style.textContent = [
            ':root { --demo-strip-h: 44px; }',
            '.dc-demo-strip {',
            '  position: fixed; top: 0; left: 0; right: 0; z-index: 100;',
            '  height: var(--demo-strip-h);',
            '  display: flex; align-items: center; justify-content: center;',
            '  gap: .8rem; padding: 0 1rem;',
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
            '@media (max-width: 480px) {',
            '  :root { --demo-strip-h: 38px; }',
            '  .dc-demo-strip { font-size: .6rem; letter-spacing: .1em; gap: .55rem; padding: 0 .6rem; }',
            '  .dc-demo-strip-pill { font-size: .55rem; padding: 3px 7px; }',
            '  .dc-demo-strip-text { letter-spacing: .06em; white-space: normal; line-height: 1.25; }',
            '}',
            'body { padding-top: var(--demo-strip-h) !important; }',
            'nav.nav { top: var(--demo-strip-h) !important; }',
            '.nav-chapbar { top: calc(var(--nav-h, 4.5rem) + var(--demo-strip-h)) !important; }'
        ].join('\n');
        document.head.appendChild(style);
    }

    // Locked-page overlay. Route handler sets __DC.pageLocked = true for
    // UDFA-locked pages. We mount a full-viewport overlay with the same
    // centered "Locked" card the deprecated _locked.html used, lock body
    // scroll so the page content underneath can't be browsed, and let
    // the masthead nav sit above the overlay so the back arrow + the
    // dropdown menu stay interactive. Everything else on the page is
    // unreachable until the user upgrades or navigates away.
    function buildLockOverlay() {
        var dc = window.__DC || {};
        if (!dc.pageLocked) return;
        if (document.getElementById('dc-lock-overlay')) return;

        var leagueName = dc.name || 'This league';

        // Pricing CTA carries ?back=<current-url> so /pricing's back arrow
        // can return the user to the locked page they came from instead of
        // dumping them on the dashboard.
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
                    escapeHtmlLock(leagueName) + ' is on the free UDFA tier. The full almanac' +
                    ' — live season, draft history, the record book, individual season archives' +
                    ' — opens up on a paid plan.' +
                '</p>' +
                '<a class="dc-locked-cta" href="' + backHref + '" target="_top">' +
                    'See plans &amp; upgrade <span aria-hidden>→</span>' +
                '</a>' +
                '<div>' +
                    '<a class="dc-locked-ghost" href="./" target="_top">← Back to the hub</a>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        // Match the overlay backdrop to the page's own body background so
        // each locked chapter (records green, draft black, default navy)
        // reads as a continuation of its palette rather than a generic
        // dark navy wash. Falls back to the dark navy if computed bg is
        // transparent or unreadable.
        var pageBg = '';
        try {
            pageBg = window.getComputedStyle(document.body).backgroundColor || '';
        } catch (e) { /* keep default */ }
        if (!pageBg || pageBg === 'rgba(0, 0, 0, 0)' || pageBg === 'transparent') {
            pageBg = 'rgb(14, 22, 32)';
        }
        overlay.style.background = pageBg;

        var style = document.createElement('style');
        style.setAttribute('data-lock-overlay', '1');
        style.textContent = [
            // Hard scroll lock + freeze the height so the underlying
            // content can't be panned via touch on mobile either.
            'html.dc-lock-active, body.dc-lock-active {',
            '  overflow: hidden !important;',
            '  height: 100% !important;',
            '  overscroll-behavior: none !important;',
            '}',
            // Hide the underlying page content while the overlay is up.
            // Locked pages still render the full template + run inline
            // scripts (data fetches, charts), and the resulting paint /
            // animation churn under a translucent overlay was hammering
            // the GPU and making the lock card visibly laggy. With the
            // overlay now opaque we can safely freeze the layer below:
            // `content-visibility: hidden` short-circuits layout +
            // paint for everything inside <main>, and `animation-play-
            // state: paused` halts any keyframe animations the template
            // had running. The ticker / nav / chapbar / demo strip get
            // bumped above the overlay so they stay readable.
            'html.dc-lock-active main {',
            '  content-visibility: hidden !important;',
            '  contain: strict !important;',
            '  animation-play-state: paused !important;',
            '}',
            'html.dc-lock-active .site-glow,',
            'html.dc-lock-active .site-grain {',
            '  display: none !important;',
            '}',
            'html.dc-lock-active *,',
            'html.dc-lock-active *::before,',
            'html.dc-lock-active *::after {',
            '  animation-play-state: running;',
            '}',
            // The nav has its own positioning. Bump it above the overlay
            // so the back arrow + dropdown stay clickable. Same treatment
            // for the chapbar (so locked-tab styling is visible and
            // unlocked chapters remain reachable), the ticker (we want
            // visitors to keep reading the page's marquee even on locked
            // pages), and the demo/testing strip when one is present.
            'html.dc-lock-active nav.nav { z-index: 200 !important; }',
            'html.dc-lock-active .nav-chapbar { z-index: 200 !important; position: sticky; }',
            'html.dc-lock-active .ticker { z-index: 200 !important; position: sticky; top: 0; }',
            'html.dc-lock-active .dc-demo-strip { z-index: 200 !important; }',

            // Opaque background, page-matched at runtime (see the
            // overlay.style.background assignment in buildLockOverlay).
            // No backdrop-filter — blur over animated underlying content
            // (ticker, charts, marquee) was the dominant cause of the
            // sluggish lock card on lower-end devices.
            '.dc-lock-overlay {',
            '  position: fixed; inset: 0;',
            '  z-index: 150;',
            '  display: flex; align-items: center; justify-content: center;',
            // Top padding clears the ticker + masthead + chapbar stack so
            // the locked card never tucks behind them. Bottom padding
            // gives the card a little breathing room above the viewport
            // edge when its content forces a scroll.
            '  padding: 9.5rem 1.25rem 1.5rem;',
            '  overflow-y: auto;',
            '}',
            '.dc-locked-card {',
            '  position: relative;',
            '  width: min(720px, 100%);',
            '  padding: 3rem 2.5rem;',
            '  background: linear-gradient(160deg, var(--ink-card), var(--ink-soft));',
            '  border: 1px solid var(--ink-line);',
            '  text-align: center;',
            '  box-shadow: 0 20px 60px rgba(0,0,0,.7);',
            '}',
            '.dc-locked-card::before {',
            "  content: '';",
            '  position: absolute; top: 0; left: 50%;',
            '  width: 60%; max-width: 360px;',
            '  height: 2px;',
            '  transform: translateX(-50%);',
            '  background: linear-gradient(90deg, transparent, var(--gold), transparent);',
            '}',
            '.dc-locked-kicker {',
            '  font-family: var(--mono); font-weight: 700;',
            '  font-size: .65rem; letter-spacing: .35em; text-transform: uppercase;',
            '  color: var(--gold);',
            '  margin-bottom: 1.5rem;',
            '}',
            '.dc-locked-icon {',
            '  font-family: var(--serif);',
            '  font-size: 3rem; line-height: 1;',
            '  color: var(--cream-soft);',
            '  opacity: .35;',
            '  margin-bottom: 1.25rem;',
            '}',
            '.dc-locked-title {',
            '  font-family: var(--serif);',
            '  font-size: clamp(2rem, 5vw, 3rem);',
            '  line-height: 1.05; letter-spacing: -.02em;',
            '  color: var(--cream);',
            '  margin: 0 0 1rem;',
            '}',
            '.dc-locked-title em { font-style: italic; color: var(--gold); }',
            '.dc-locked-sub {',
            '  font-family: var(--serif); font-style: italic;',
            '  font-size: 1.05rem; line-height: 1.55;',
            '  color: var(--cream-soft);',
            '  max-width: 36rem;',
            '  margin: 0 auto 2rem;',
            '}',
            '.dc-locked-cta {',
            '  display: inline-flex; align-items: center; gap: .55rem;',
            '  padding: .9rem 1.6rem;',
            '  background: var(--gold); color: var(--ink);',
            '  border: 1px solid var(--gold);',
            '  font-family: var(--mono); font-weight: 700;',
            '  font-size: .7rem; letter-spacing: .22em; text-transform: uppercase;',
            '  text-decoration: none;',
            '  transition: background .15s, border-color .15s;',
            '}',
            '.dc-locked-cta:hover {',
            '  background: var(--gold-bright);',
            '  border-color: var(--gold-bright);',
            '}',
            '.dc-locked-ghost {',
            '  display: inline-block;',
            '  margin-top: 1.15rem;',
            '  color: var(--cream-mute);',
            '  font-family: var(--mono);',
            '  font-size: .62rem; letter-spacing: .2em; text-transform: uppercase;',
            '  text-decoration: none;',
            '}',
            '.dc-locked-ghost:hover { color: var(--gold); }',
            '@media (max-width: 560px) {',
            '  .dc-lock-overlay { padding: 8rem .9rem 1rem; }',
            '  .dc-locked-card { padding: 2rem 1.25rem; }',
            '  .dc-locked-sub { font-size: .95rem; }',
            '}',
        ].join('\n');
        document.head.appendChild(style);

        // Apply scroll lock to html + body. Removed automatically if the
        // user navigates to an unlocked page (full-page load drops the
        // overlay along with the class).
        document.documentElement.classList.add('dc-lock-active');
        document.body.classList.add('dc-lock-active');

        // Rewrite the ticker so the marquee describes the lock state
        // instead of the original page's title — gives visitors a
        // moving banner of "what this chapter is and how to unlock it"
        // even while the rest of the page is overlayed.
        rewriteTickerForLock(leagueName);

        // Belt + suspenders for touch: block keyboard scroll keys + wheel
        // events that would scroll the underlying page through gaps not
        // caught by overflow:hidden (some iOS Safari versions still let
        // the body pan).
        var blockKeys = { ArrowUp: 1, ArrowDown: 1, PageUp: 1, PageDown: 1, Home: 1, End: 1, ' ': 1 };
        function maybeBlockKey(e) {
            if (e.target && e.target.closest && e.target.closest('nav.nav')) return;
            if (blockKeys[e.key]) e.preventDefault();
        }
        document.addEventListener('keydown', maybeBlockKey, { passive: false });
    }

    // Local helper — escape user-provided strings before dropping them
    // into the locked-card innerHTML. The league name comes from the
    // route handler so it should already be safe, but this keeps the
    // surface defensive.
    function escapeHtmlLock(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // Replace the ticker marquee on locked pages with a lock-specific
    // message loop: chapter name, league name, subscription nudge. The
    // ticker DOM is identical across every template page (.ticker >
    // .ticker-track > .ticker-group × 2 for the seamless loop), so we
    // just rewrite both groups in place.
    function rewriteTickerForLock(leagueName) {
        var track = document.querySelector('.ticker .ticker-track');
        if (!track) return;
        var nav = document.getElementById('site-nav');
        var chapter = (nav && nav.dataset.chapter) || 'Locked Chapter';

        var items = [
            chapter + ' · LOCKED',
            String(leagueName || 'This league').toUpperCase() + ' · NEEDS A SUBSCRIPTION',
            'FREE TIER · UDFA',
            'UPGRADE TO UNLOCK',
        ];
        var groupHTML = '';
        for (var i = 0; i < items.length; i++) {
            groupHTML += '<span class="ticker-item"><span class="ticker-star">★</span> '
                       + escapeHtmlLock(items[i]) + '</span>';
        }
        // Two groups so the marquee loop stays seamless.
        track.innerHTML =
            '<div class="ticker-group">' + groupHTML + '</div>' +
            '<div class="ticker-group">' + groupHTML + '</div>';
    }

    // Live-season hub stays unlocked for UDFA *and* Rookie so both
    // tiers can preview the chapter index, but the cards inside lock
    // differently:
    //   • UDFA  → every card locks (the entire chapter is paid).
    //   • Rookie → only the Veteran-ribbon cards lock (Best Coach,
    //              Manager DNA, Trade Grader); pickems, power rank,
    //              matchup preview etc. work normally.
    // Intercepted clicks bounce to /pricing with ?back=<current> so the
    // pricing back arrow returns the user to the hub.
    function lockLiveSeasonHub() {
        var dc = window.__DC || {};
        var isUdfa = dc.leagueTier === 'udfa';
        var isRookie = dc.leagueTier === 'paid' && dc.paidTier === 'tier1';
        if (!isUdfa && !isRookie) return;
        var nav = document.getElementById('site-nav');
        if (!nav || nav.dataset.page !== 'live') return;

        var backHref = '/pricing';
        try {
            backHref = '/pricing?back=' + encodeURIComponent(
                window.location.pathname + window.location.search,
            );
        } catch (e) { /* fall back to /pricing */ }

        var cards = document.querySelectorAll('a.ls-card');
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            var hasTierRibbon = !!card.querySelector('.ls-card-tier');
            // Rookie only locks Veteran-ribbon cards; everything else
            // on the hub stays clickable for them.
            if (isRookie && !hasTierRibbon) continue;
            card.setAttribute('data-locked', '1');
            card.setAttribute('aria-disabled', 'true');
            card.setAttribute('title', 'Locked — upgrade to unlock');
            // Cards that already carry a tier ribbon get the click
            // block but skip the "✦ Locked" chip — the ribbon is
            // enough signal and stacking two chips reads as clutter.
            if (!hasTierRibbon) {
                card.setAttribute('data-locked-badge', '1');
            }
        }
        // Single delegated listener so dynamically-added cards still
        // get caught. Capture phase so the template's own click
        // handlers don't fire first.
        document.addEventListener('click', function (e) {
            var t = e.target;
            if (!t || !t.closest) return;
            var card = t.closest('a.ls-card[data-locked="1"]');
            if (!card) return;
            e.preventDefault();
            e.stopPropagation();
            window.location.assign(backHref);
        }, true);

        var style = document.createElement('style');
        style.textContent = [
            'a.ls-card[data-locked="1"] {',
            '  cursor: not-allowed;',
            '  opacity: .55;',
            '  position: relative;',
            '}',
            'a.ls-card[data-locked="1"]:hover {',
            '  opacity: .75;',
            '}',
            // Position + sizing mirror the .ls-card-tier "Veteran"
            // ribbon (top:1rem right:1rem, .58rem mono, 2px 6px pad)
            // so the locked chip lines up with the tier ribbon on the
            // adjacent veteran cards rather than floating higher.
            'a.ls-card[data-locked-badge="1"]::after {',
            "  content: '✦ Locked';",
            '  position: absolute; top: 1rem; right: 1rem;',
            '  font-family: var(--mono, monospace);',
            '  font-size: .58rem; letter-spacing: .2em; text-transform: uppercase;',
            '  color: var(--gold, #e8c889);',
            '  border: 1px solid var(--gold, #e8c889);',
            '  padding: 2px 6px; border-radius: 2px;',
            '  opacity: .85;',
            '}',
        ].join('\n');
        document.head.appendChild(style);
    }

    function init() {
        buildTestingStrip();
        buildNav();
        enhanceAuthLinks();
        wireBookmarkToggle();
        wirePostSigninBookmark();
        // wireThemePicker(); // vaulted — themes not ready yet
        loadTutorial();
        buildLockOverlay();
        lockLiveSeasonHub();
    }

    // Install the fetch wrapper SYNCHRONOUSLY, before any template inline
    // scripts run. Templates fire their data fetches from inline body
    // scripts that execute during HTML parsing — earlier than
    // DOMContentLoaded — so if we waited for init() we'd patch fetch
    // after the first 5 hub requests had already started, and the bar
    // would never show.
    installProgressBar();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
