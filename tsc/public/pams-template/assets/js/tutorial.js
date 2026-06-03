/**
 * Onboarding tour for the public almanac (/leagues/<slug>/...).
 *
 * What it does:
 *   • Walks a first-time visitor through every chapter of the almanac with
 *     a popover that points at landmark elements (nav, chapter bar, hall of
 *     champions, season archive, etc.).
 *   • The tour is a single linear sequence; some steps live on different
 *     pages, so clicking "Next" can navigate to another page and the tour
 *     resumes on the new page from sessionStorage.
 *   • Clicking the backdrop OR the next-arrow advances. The × button closes
 *     the tour and suppresses it forever for this user/device.
 *   • Signed-in users: dismissal persists via POST /api/me/tutorial so a
 *     second device/browser doesn't re-trigger the tour.
 *   • Anonymous viewers: dismissal persists in localStorage. Same key, so
 *     a tour completed on one league never reappears on another.
 *
 * Loaded by nav.js (which appends a <script> tag here after the masthead
 * is wired up). That way every templated page gets the tour automatically
 * without each template having to opt in.
 *
 * To force-replay during development:  localStorage.removeItem('dc-tour-leagues')
 * or just call  window.__DC_TUTORIAL.start()  from devtools.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'dc-tour-leagues';
    var PROGRESS_KEY = 'dc-tour-leagues-progress';  // sessionStorage: current step index across navigations

    // ── Step library ────────────────────────────────────────────────────
    // Each step:
    //   page      : data-page value the step belongs to (the masthead's
    //               <nav id="site-nav" data-page="..."> tells us which page
    //               we're on). 'hub' = league home; pages without a matching
    //               step are silently skipped.
    //   target    : CSS selector to point at. Optional — if omitted (or no
    //               match), the popover renders centered as a modal card.
    //   path      : URL path to navigate to BEFORE rendering this step (only
    //               used when crossing pages). Relative to /leagues/<slug>/.
    //   title     : short header line.
    //   body      : 1–2 sentences. Keep tight.
    //   placement : 'top' | 'bottom' | 'left' | 'right' | 'center'. Auto if omitted.
    //   align     : 'start' | 'center' | 'end' along the placement axis. Default center.
    var STEPS = [
        // ─────────── HUB / index.html ───────────
        {
            page: 'hub', path: '',
            placement: 'center',
            title: 'Welcome to your league chronicle.',
            body: "This is your league's public almanac — every champion, record, and rivalry, kept in the books. Take 60 seconds and we'll show you around.",
        },
        {
            page: 'hub', target: '#site-nav',
            placement: 'bottom',
            title: 'The masthead.',
            body: "Every page has it. The title takes you home; the ▦ icon (top-right) opens the menu for your account, bookmarks, and admin links.",
        },
        {
            page: 'hub', target: '#nav-chapbar',
            placement: 'bottom',
            title: 'Chapter bar — your main navigation.',
            body: "Standings, Managers, Seasons, Drafts, Records, Rivalries, Live. Click any chapter to jump there. It sticks to the top as you scroll.",
        },
        {
            page: 'hub', target: '#nav-drop',
            placement: 'bottom', align: 'end',
            title: 'Menu (▦).',
            body: "Sign in, bookmark this league, jump back to your library, or — if you're the commissioner — manage the league. Always here, top-right.",
        },
        {
            page: 'hub', target: '.hero',
            placement: 'bottom',
            title: "Hero — your league's headline.",
            body: "Name, the years it's been running, the editorial subtitle. Sets the tone for the rest of the volume.",
        },
        {
            page: 'hub', target: '#hero-stat',
            placement: 'top',
            title: 'Benchmarks (§ 01).',
            body: "The biggest single-game scores in league history and the records that own them. The trio below it shows other record-holders to know.",
        },
        {
            page: 'hub', target: '#dc-hall-row',
            placement: 'top',
            title: 'Hall of Champions (§ 03).',
            body: "Every champion this league has crowned. Scroll horizontally — each banner links to that season's writeup.",
        },
        {
            page: 'hub', target: '#dc-leaders-section',
            placement: 'top',
            title: 'Career leaders (§ 04).',
            body: "Top-3 per category — points, wins, playoff appearances. Use the arrows to flip through the leaderboards.",
        },
        {
            page: 'hub', target: '#dc-reel-row',
            placement: 'top',
            title: 'Spotlight + Clippings (§ 05).',
            body: "A featured manager each week, plus a fresh clipping from the press room. Spotlight links straight to that manager's profile.",
        },
        {
            page: 'hub', target: '#dc-trackboard',
            placement: 'left',
            title: 'Trackboard (right rail).',
            body: "Live updates during the season — news, players on watch, risers, odds. Click the rail to expand it, or the ✕ to collapse.",
        },

        // ─────────── STANDINGS ───────────
        {
            page: 'standings', path: 'standings.html',
            target: '#standings-container',
            placement: 'top',
            title: 'Standings.',
            body: "The current season's record, points for/against, streak, and playoff seed. Sortable; column headers tell you what's what.",
        },

        // ─────────── MANAGERS ───────────
        {
            page: 'managers', path: 'managers/',
            target: '#managers-grid',
            placement: 'top',
            title: 'The society.',
            body: "Every manager who has ever played in this league. Click any card to open their full profile — career record, championships, head-to-heads.",
        },

        // ─────────── SEASONS ───────────
        {
            page: 'seasons', path: 'seasons/',
            target: '#chronicle-container',
            placement: 'top',
            title: 'Season archives.',
            body: "Every volume of the chronicle, newest first. Each card opens that year's full recap — schedule, standings, playoffs, the champion's run.",
        },

        // ─────────── DRAFTS ───────────
        {
            page: 'draft', path: 'draft/',
            target: '#sec-board',
            placement: 'top',
            title: 'Drafts.',
            body: "Every draft board your league has run — picks, positions, who reached and who waited. Scroll for analytics: round-1 trends, draft DNA, value calls.",
        },

        // ─────────── RECORDS ───────────
        {
            page: 'records', path: 'records.html',
            placement: 'top',
            title: 'The record book.',
            body: "Every record worth holding: highest score, biggest blowout, longest streak, most points in a season. Records held this season are flagged.",
        },

        // ─────────── RIVALRIES ───────────
        {
            page: 'rivalries', path: 'rivalries/',
            target: '#rv-grid',
            placement: 'top',
            title: 'Rivalries.',
            body: "Head-to-head histories between every pair of managers. Open one to see the full series — every matchup, every margin, every grudge.",
        },

        // ─────────── LIVE-SEASON HUB ───────────
        {
            page: 'live-season', path: 'live-season/',
            target: '#site-nav',
            placement: 'bottom',
            title: 'Live season.',
            body: "In-season tools — matchup previews, pick'ems, power rankings, records watch, milestone alerts, the trade grader. Open the menu (▦) to jump between them.",
        },

        // ─────────── DONE ───────────
        {
            page: '*',
            placement: 'center',
            title: "You're set.",
            body: "That's the whole almanac. You can re-open this tour any time from the menu (▦) → 'Replay tour'. Enjoy the chronicle.",
            isFinal: true,
        },
    ];

    // ── Persistence ─────────────────────────────────────────────────────
    function dcCtx() { return window.__DC || {}; }

    function isDismissed() {
        if (dcCtx().isSignedIn) {
            // For signed-in users the server-injected flag is authoritative
            // (works across devices). Anonymous users fall back to localStorage.
            return !!dcCtx().tutorialDismissed;
        }
        try { return localStorage.getItem(STORAGE_KEY) === 'dismissed'; }
        catch (_) { return false; }
    }

    function persistDismiss() {
        // Anonymous → localStorage. Signed-in → POST to the user_metadata API
        // (and ALSO write localStorage so a multi-tab session doesn't bounce
        // the popover back open before the fetch returns).
        try { localStorage.setItem(STORAGE_KEY, 'dismissed'); } catch (_) {}
        if (dcCtx().isSignedIn) {
            fetch('/api/me/tutorial/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'dismiss', key: 'leagues' }),
                credentials: 'same-origin',
            }).catch(function () { /* offline / aborted — localStorage carries us */ });
        }
    }

    function persistReset() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
        try { sessionStorage.removeItem(PROGRESS_KEY); } catch (_) {}
        if (dcCtx().isSignedIn) {
            fetch('/api/me/tutorial/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reset', key: 'leagues' }),
                credentials: 'same-origin',
            }).catch(function () {});
        }
    }

    function readProgress() {
        try {
            var raw = sessionStorage.getItem(PROGRESS_KEY);
            if (!raw) return null;
            var n = parseInt(raw, 10);
            return Number.isFinite(n) ? n : null;
        } catch (_) { return null; }
    }
    function writeProgress(i) {
        try { sessionStorage.setItem(PROGRESS_KEY, String(i)); } catch (_) {}
    }
    function clearProgress() {
        try { sessionStorage.removeItem(PROGRESS_KEY); } catch (_) {}
    }

    // ── DOM helpers ─────────────────────────────────────────────────────
    function currentPageKey() {
        var nav = document.getElementById('site-nav');
        return (nav && nav.dataset && nav.dataset.page) || '';
    }

    function findStepForCurrentPage(startIdx) {
        // From startIdx, walk forward until we find a step whose page matches
        // the current page (or the wildcard '*'). Returns the step's index,
        // or -1 if no match before the end of the tour.
        var page = currentPageKey();
        for (var i = startIdx; i < STEPS.length; i++) {
            if (STEPS[i].page === '*' || STEPS[i].page === page) return i;
        }
        return -1;
    }

    function ensureStyles() {
        if (document.getElementById('dc-tour-style')) return;
        var s = document.createElement('style');
        s.id = 'dc-tour-style';
        s.textContent = [
            // Full-screen backdrop used only for centered (no-target) steps.
            // Steps with a target use four .dc-tour-pane rects instead so the
            // spotlighted element stays sharp.
            '.dc-tour-backdrop {',
            '  position: fixed; inset: 0; z-index: 9000;',
            '  background: rgba(8, 14, 22, .55);',
            '  -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);',
            '  cursor: pointer;',
            '  animation: dc-tour-fade .18s ease-out;',
            '}',
            '@keyframes dc-tour-fade { from { opacity: 0 } to { opacity: 1 } }',
            // Four-pane backdrop: top/bottom/left/right strips that surround
            // the target rect. Each pane carries the dim + blur; the target
            // sits in the uncovered window between them, fully crisp. Click
            // any pane to advance the tour.
            '.dc-tour-pane {',
            '  position: fixed; z-index: 9000;',
            '  background: rgba(8, 14, 22, .55);',
            '  -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);',
            '  cursor: pointer;',
            '  transition: top .22s ease, left .22s ease, width .22s ease, height .22s ease;',
            '  animation: dc-tour-fade .18s ease-out;',
            '}',
            // Gold halo around the spotlighted element. Sits ABOVE the panes
            // but below the popover; pointer-events:none so the user can
            // still interact with the highlighted element through it
            // (e.g. read a tooltip, scroll a carousel).
            '.dc-tour-spot {',
            '  position: fixed; z-index: 9001; pointer-events: none;',
            '  border-radius: 10px;',
            '  box-shadow: 0 0 0 2px rgba(232, 200, 137, .95), 0 0 18px rgba(232, 200, 137, .35);',
            '  transition: top .22s ease, left .22s ease, width .22s ease, height .22s ease;',
            '}',
            '.dc-tour-pop {',
            '  position: fixed; z-index: 9002;',
            '  max-width: 340px; min-width: 280px;',
            '  background: #16202c; color: #f4ebd8;',
            '  border: 1px solid rgba(232,200,137,.35);',
            '  border-radius: 12px;',
            '  box-shadow: 0 18px 40px rgba(0,0,0,.55), 0 0 0 1px rgba(0,0,0,.3);',
            '  font-family: Inter, system-ui, sans-serif;',
            '  padding: 1rem 1.1rem 1rem;',
            '  transition: top .22s ease, left .22s ease;',
            '}',
            '.dc-tour-pop.is-center {',
            '  top: 50%; left: 50%; transform: translate(-50%, -50%);',
            '  max-width: 420px;',
            '}',
            '.dc-tour-kicker {',
            '  font-family: "JetBrains Mono", monospace;',
            '  font-size: .58rem; letter-spacing: .22em; text-transform: uppercase;',
            '  color: #e8c889; margin-bottom: .5rem; display: flex; justify-content: space-between; align-items: center;',
            '}',
            '.dc-tour-title {',
            '  font-family: "DM Serif Display", Georgia, serif;',
            '  font-size: 1.15rem; line-height: 1.2; margin: 0 0 .45rem;',
            '  color: #f4ebd8;',
            '}',
            '.dc-tour-body {',
            '  font-size: .85rem; line-height: 1.5; color: #c9c0ad; margin: 0 0 .9rem;',
            '}',
            '.dc-tour-actions {',
            '  display: flex; align-items: center; justify-content: space-between;',
            '  gap: .6rem; margin-top: .4rem;',
            '}',
            '.dc-tour-skip {',
            '  background: transparent; border: 0; color: #837b6a;',
            '  font-family: inherit; font-size: .72rem; letter-spacing: .12em;',
            '  text-transform: uppercase; cursor: pointer; padding: .35rem 0;',
            '}',
            '.dc-tour-skip:hover { color: #c9c0ad; }',
            // Back + Next sit side-by-side; back is a small ghost circle, next
            // is the gold pill. Stop event propagation on this row so clicks
            // never bubble up to the backdrop's advance handler.
            '.dc-tour-nav { display: inline-flex; align-items: center; gap: .45rem; }',
            '.dc-tour-back {',
            '  background: transparent; color: #c9c0ad;',
            '  border: 1px solid rgba(232,200,137,.4); border-radius: 999px;',
            '  width: 2rem; height: 2rem; padding: 0;',
            '  display: inline-flex; align-items: center; justify-content: center;',
            '  cursor: pointer; font-family: inherit;',
            '}',
            '.dc-tour-back:hover:not(:disabled) { border-color: #e8c889; color: #f4ebd8; }',
            '.dc-tour-back:disabled { opacity: .35; cursor: not-allowed; }',
            '.dc-tour-back svg { display: block; }',
            '.dc-tour-next {',
            '  background: #e8c889; color: #0e1620;',
            '  border: 0; border-radius: 999px;',
            '  padding: .55rem 1rem .55rem 1.1rem;',
            '  font-family: inherit; font-weight: 600; font-size: .78rem;',
            '  letter-spacing: .08em; text-transform: uppercase;',
            '  cursor: pointer; display: inline-flex; align-items: center; gap: .4rem;',
            '  box-shadow: 0 2px 0 #a88a4a;',
            '}',
            '.dc-tour-next:hover { background: #f4d9a4; }',
            '.dc-tour-next svg { display: block; }',
            '.dc-tour-close {',
            '  background: transparent; border: 0; color: #837b6a;',
            '  cursor: pointer; padding: 0; line-height: 1;',
            '  font-size: 1.1rem;',
            '}',
            '.dc-tour-close:hover { color: #f4ebd8; }',
            // Triangle arrow on the popover. Color is hard-coded to the card bg.
            '.dc-tour-pop::after {',
            '  content: ""; position: absolute; width: 12px; height: 12px;',
            '  background: #16202c;',
            '  border-right: 1px solid rgba(232,200,137,.35);',
            '  border-bottom: 1px solid rgba(232,200,137,.35);',
            '  display: none;',
            '}',
            '.dc-tour-pop[data-place="top"]::after    { display:block; bottom: -7px; left: 50%; margin-left: -6px; transform: rotate( 45deg); }',
            '.dc-tour-pop[data-place="bottom"]::after { display:block; top: -7px;    left: 50%; margin-left: -6px; transform: rotate(225deg); }',
            '.dc-tour-pop[data-place="left"]::after   { display:block; right: -7px;  top: 50%;  margin-top: -6px;  transform: rotate(-45deg); }',
            '.dc-tour-pop[data-place="right"]::after  { display:block; left: -7px;   top: 50%;  margin-top: -6px;  transform: rotate(135deg); }',
            // Mobile: lock the popover to the bottom of the screen and drop the
            // arrow so it never overflows the viewport on a small phone.
            '@media (max-width: 560px) {',
            '  .dc-tour-pop { left: 12px !important; right: 12px !important; top: auto !important; bottom: 12px !important; max-width: none; }',
            '  .dc-tour-pop::after { display: none !important; }',
            '  .dc-tour-pop.is-center { top: 50% !important; bottom: auto !important; transform: translate(-50%, -50%); left: 50% !important; right: auto !important; }',
            '}',
            // A subtle "replay" link in the dropdown for users who finished/closed.
            '.nav-drop-menu a.dc-tour-replay { color: #c9c0ad; }',
            '.nav-drop-menu a.dc-tour-replay:hover { color: #e8c889; }',
        ].join('\n');
        document.head.appendChild(s);
    }

    // ── Step engine ─────────────────────────────────────────────────────
    var state = {
        idx: -1,
        popoverEl: null,
        backdropEl: null,
        panesEl: null,
        spotEl: null,
        repositionRaf: 0,
        keyHandler: null,
        resizeHandler: null,
    };

    function destroyTour() {
        if (state.popoverEl) { state.popoverEl.remove(); state.popoverEl = null; }
        if (state.backdropEl) { state.backdropEl.remove(); state.backdropEl = null; }
        if (state.panesEl) { state.panesEl.remove(); state.panesEl = null; }
        if (state.spotEl) { state.spotEl.remove(); state.spotEl = null; }
        if (state.keyHandler) { document.removeEventListener('keydown', state.keyHandler); state.keyHandler = null; }
        if (state.resizeHandler) {
            window.removeEventListener('resize', state.resizeHandler);
            window.removeEventListener('scroll', state.resizeHandler, true);
            state.resizeHandler = null;
        }
        state.idx = -1;
    }

    function close(opts) {
        var dismissed = !opts || opts.dismissed !== false;
        destroyTour();
        if (dismissed) {
            clearProgress();
            persistDismiss();
        }
    }

    function advance() {
        var next = state.idx + 1;
        if (next >= STEPS.length) { close({ dismissed: true }); return; }
        var step = STEPS[next];
        // Cross-page navigation: stash the next step index and navigate.
        // The page that loads next will read PROGRESS_KEY and resume.
        var page = currentPageKey();
        if (step.page !== '*' && step.page !== page) {
            writeProgress(next);
            var path = step.path || '';
            // `<base href="/leagues/<slug>/">` makes relative paths resolve
            // against the league root, so we can navigate with the same
            // relative paths the nav uses (no slug threading needed).
            location.href = path;
            return;
        }
        renderStep(next);
    }

    function goBack() {
        var prev = state.idx - 1;
        if (prev < 0) return;
        var step = STEPS[prev];
        var page = currentPageKey();
        if (step.page !== '*' && step.page !== page) {
            // Previous step lives on another page — write its index as the
            // resume marker so the destination page picks it up. Same shape
            // as advance() so the same resume code handles both directions.
            writeProgress(prev);
            var path = step.path || '';
            location.href = path;
            return;
        }
        renderStep(prev);
    }

    function renderStep(idx) {
        var step = STEPS[idx];
        if (!step) { close({ dismissed: true }); return; }
        state.idx = idx;

        // Target lookup. If a step declares a target but the element isn't
        // on this page (e.g. the trackboard is hidden until live data lands),
        // we skip forward rather than render a popover stranded in space.
        // `hidden` attribute, display:none, and 0×0 boxes all count as
        // "not really on screen yet" — JS-populated sections like the
        // leaders carousel start that way and only flip visible once their
        // data lands.
        var targetEl = null;
        if (step.target) {
            targetEl = document.querySelector(step.target);
            var renderable = !!targetEl;
            if (targetEl) {
                if (targetEl.hasAttribute('hidden')) renderable = false;
                else {
                    var cs = window.getComputedStyle(targetEl);
                    if (cs.display === 'none' || cs.visibility === 'hidden') renderable = false;
                    else {
                        var r = targetEl.getBoundingClientRect();
                        if (r.width === 0 && r.height === 0) renderable = false;
                    }
                }
            }
            if (!renderable && !step.isFinal) { advance(); return; }
        }

        ensureStyles();

        // Build (or clear) the right kind of backdrop for this step. Targeted
        // steps use 4 panes around the target so the highlighted element
        // stays unblurred; centered/no-target steps use a single full-screen
        // backdrop. Swap between modes if the previous step used the other.
        var needsPanes = !!step.target && step.placement !== 'center';
        if (needsPanes) {
            if (state.backdropEl) { state.backdropEl.remove(); state.backdropEl = null; }
            if (!state.panesEl) {
                state.panesEl = document.createElement('div');
                state.panesEl.setAttribute('data-dc-tour-panes', '');
                ['top','bottom','left','right'].forEach(function (k) {
                    var pane = document.createElement('div');
                    pane.className = 'dc-tour-pane';
                    pane.dataset.pane = k;
                    pane.addEventListener('click', function () { advance(); });
                    state.panesEl.appendChild(pane);
                });
                document.body.appendChild(state.panesEl);
            }
        } else {
            if (state.panesEl) { state.panesEl.remove(); state.panesEl = null; }
            if (!state.backdropEl) {
                state.backdropEl = document.createElement('div');
                state.backdropEl.className = 'dc-tour-backdrop';
                state.backdropEl.addEventListener('click', function () { advance(); });
                document.body.appendChild(state.backdropEl);
            }
        }

        // Tear down the prior popover/spotlight so transitions don't fight us.
        if (state.popoverEl) state.popoverEl.remove();
        if (state.spotEl) { state.spotEl.remove(); state.spotEl = null; }

        var pop = document.createElement('div');
        pop.className = 'dc-tour-pop';
        var totalCount = STEPS.length;
        var stepNum = idx + 1;
        var canGoBack = idx > 0;
        pop.innerHTML =
            '<div class="dc-tour-kicker">' +
              '<span>★ Tour · ' + stepNum + ' / ' + totalCount + '</span>' +
              '<button type="button" class="dc-tour-close" aria-label="Close tour">✕</button>' +
            '</div>' +
            '<h3 class="dc-tour-title"></h3>' +
            '<p class="dc-tour-body"></p>' +
            '<div class="dc-tour-actions">' +
              '<button type="button" class="dc-tour-skip">Skip tour</button>' +
              '<div class="dc-tour-nav">' +
                '<button type="button" class="dc-tour-back" aria-label="Previous"' + (canGoBack ? '' : ' disabled') + '>' +
                  '<svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 1 3 7 9 13"/></svg>' +
                '</button>' +
                '<button type="button" class="dc-tour-next">' +
                  (step.isFinal ? 'Finish' : 'Next') +
                  ' <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 1 9 7 3 13"/></svg>' +
                '</button>' +
              '</div>' +
            '</div>';
        // .textContent avoids any chance of HTML in step copy escaping.
        pop.querySelector('.dc-tour-title').textContent = step.title || '';
        pop.querySelector('.dc-tour-body').textContent = step.body || '';
        // Stop backdrop-click-to-advance from firing when the user clicks
        // inside the popover card itself.
        pop.addEventListener('click', function (e) { e.stopPropagation(); });
        pop.querySelector('.dc-tour-next').addEventListener('click', function () { advance(); });
        pop.querySelector('.dc-tour-back').addEventListener('click', function () { if (canGoBack) goBack(); });
        pop.querySelector('.dc-tour-skip').addEventListener('click', function () { close({ dismissed: true }); });
        pop.querySelector('.dc-tour-close').addEventListener('click', function () { close({ dismissed: true }); });
        document.body.appendChild(pop);
        state.popoverEl = pop;

        if (!targetEl || step.placement === 'center') {
            pop.classList.add('is-center');
            // No spotlight halo, just the backdrop. Nothing more to position.
        } else {
            // Make sure the target is visible before measuring. Scroll
            // smoothly when possible — the popover position transitions
            // will catch up via the resizeHandler below.
            try { targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); }
            catch (_) { targetEl.scrollIntoView(); }

            // Build the highlight halo.
            var spot = document.createElement('div');
            spot.className = 'dc-tour-spot';
            document.body.appendChild(spot);
            state.spotEl = spot;

            positionPopover(pop, spot, targetEl, step);
        }

        // Reposition on scroll/resize so the popover tracks elements that
        // move as the page settles (lazy images, async data fills, etc.).
        var reposition = function () {
            if (!state.popoverEl) return;
            if (state.repositionRaf) cancelAnimationFrame(state.repositionRaf);
            state.repositionRaf = requestAnimationFrame(function () {
                if (!targetEl || step.placement === 'center') return;
                var el = step.target ? document.querySelector(step.target) : null;
                if (!el || !state.spotEl) return;
                positionPopover(state.popoverEl, state.spotEl, el, step);
            });
        };
        if (state.resizeHandler) {
            window.removeEventListener('resize', state.resizeHandler);
            window.removeEventListener('scroll', state.resizeHandler, true);
        }
        state.resizeHandler = reposition;
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);

        if (!state.keyHandler) {
            state.keyHandler = function (e) {
                if (e.key === 'Escape') { close({ dismissed: true }); }
                else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    if (state.idx > 0) goBack();
                }
                else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    advance();
                }
            };
            document.addEventListener('keydown', state.keyHandler);
        }
    }

    function positionPanes(rect, pad) {
        // Lay out the four blur panes so they surround the target rect,
        // leaving an unblurred window over the target itself. Clamp to
        // viewport edges so an off-screen target doesn't produce negative
        // widths/heights. We slightly UNDER-cover by `pad` so the gold
        // halo bleeds into the unblurred window — it reads sharper.
        if (!state.panesEl) return;
        var vw = window.innerWidth, vh = window.innerHeight;
        var top    = Math.max(0, rect.top    - pad);
        var bottom = Math.min(vh, rect.bottom + pad);
        var left   = Math.max(0, rect.left   - pad);
        var right  = Math.min(vw, rect.right  + pad);

        var paneTop    = state.panesEl.querySelector('.dc-tour-pane[data-pane="top"]');
        var paneBottom = state.panesEl.querySelector('.dc-tour-pane[data-pane="bottom"]');
        var paneLeft   = state.panesEl.querySelector('.dc-tour-pane[data-pane="left"]');
        var paneRight  = state.panesEl.querySelector('.dc-tour-pane[data-pane="right"]');
        if (!paneTop) return;

        paneTop.style.top = '0px';
        paneTop.style.left = '0px';
        paneTop.style.width = vw + 'px';
        paneTop.style.height = top + 'px';

        paneBottom.style.top = bottom + 'px';
        paneBottom.style.left = '0px';
        paneBottom.style.width = vw + 'px';
        paneBottom.style.height = Math.max(0, vh - bottom) + 'px';

        paneLeft.style.top = top + 'px';
        paneLeft.style.left = '0px';
        paneLeft.style.width = left + 'px';
        paneLeft.style.height = Math.max(0, bottom - top) + 'px';

        paneRight.style.top = top + 'px';
        paneRight.style.left = right + 'px';
        paneRight.style.width = Math.max(0, vw - right) + 'px';
        paneRight.style.height = Math.max(0, bottom - top) + 'px';
    }

    function positionPopover(pop, spot, targetEl, step) {
        var rect = targetEl.getBoundingClientRect();
        // Halo: hug the target with a little padding so the gold ring reads.
        var pad = 6;
        spot.style.top    = (rect.top    - pad) + 'px';
        spot.style.left   = (rect.left   - pad) + 'px';
        spot.style.width  = (rect.width  + pad * 2) + 'px';
        spot.style.height = (rect.height + pad * 2) + 'px';
        positionPanes(rect, pad);

        // Decide placement. If the caller specified one and it fits, honor it;
        // otherwise pick the side with the most room. The popover is measured
        // after we attach it so we know its real height/width.
        var popRect = pop.getBoundingClientRect();
        var vw = window.innerWidth, vh = window.innerHeight;
        var gutter = 14;

        var placement = step.placement;
        var fits = {
            top:    rect.top > popRect.height + gutter + 8,
            bottom: vh - rect.bottom > popRect.height + gutter + 8,
            left:   rect.left > popRect.width  + gutter + 8,
            right:  vw - rect.right > popRect.width  + gutter + 8,
        };
        if (!placement || !fits[placement]) {
            if (fits.bottom) placement = 'bottom';
            else if (fits.top) placement = 'top';
            else if (fits.right) placement = 'right';
            else if (fits.left) placement = 'left';
            else placement = 'bottom';
        }
        pop.dataset.place = placement;
        pop.classList.remove('is-center');

        var top, left;
        if (placement === 'top') {
            top  = rect.top - popRect.height - gutter;
            left = rect.left + rect.width / 2 - popRect.width / 2;
        } else if (placement === 'bottom') {
            top  = rect.bottom + gutter;
            left = rect.left + rect.width / 2 - popRect.width / 2;
        } else if (placement === 'left') {
            top  = rect.top + rect.height / 2 - popRect.height / 2;
            left = rect.left - popRect.width - gutter;
        } else { // right
            top  = rect.top + rect.height / 2 - popRect.height / 2;
            left = rect.right + gutter;
        }

        // Clamp into the viewport so the popover never overhangs an edge.
        var minMargin = 8;
        if (left < minMargin) left = minMargin;
        if (left + popRect.width > vw - minMargin) left = vw - popRect.width - minMargin;
        if (top  < minMargin) top  = minMargin;
        if (top + popRect.height > vh - minMargin) top  = vh - popRect.height - minMargin;

        pop.style.top  = top + 'px';
        pop.style.left = left + 'px';
    }

    // ── Entrypoints ─────────────────────────────────────────────────────
    function start(opts) {
        // From the very beginning, unless we're resuming from a prior step
        // saved in sessionStorage (set when a step navigated us to a new
        // page). `opts.replay` skips the dismissal check (used by the
        // "Replay tour" menu link).
        if (!opts || !opts.replay) {
            if (isDismissed()) return;
        }
        var resumeIdx = readProgress();
        var startIdx;
        if (resumeIdx !== null) {
            startIdx = findStepForCurrentPage(resumeIdx);
        } else {
            startIdx = findStepForCurrentPage(0);
        }
        if (startIdx === -1) {
            // We saved progress while on hub heading to (say) standings, then
            // the user typed a URL for a page that has no step. Just clear
            // the resume marker and let the tour fire next time naturally.
            clearProgress();
            return;
        }
        // Clear the resume marker once we've consumed it — fresh page loads
        // shouldn't keep snapping back to the saved step if the user closes
        // and reopens the browser tab.
        clearProgress();
        renderStep(startIdx);
    }

    function replay() {
        // Reset dismissal so anonymous + signed-in viewers can re-watch.
        persistReset();
        // Optimistically clear the in-memory window.__DC flag too, otherwise
        // start() would early-return on signed-in users before the fetch lands.
        if (window.__DC) window.__DC.tutorialDismissed = false;
        start({ replay: true });
    }

    // Expose so devtools / nav.js can drive it manually.
    window.__DC_TUTORIAL = { start: start, replay: replay, close: function () { close({ dismissed: true }); } };

    // ── Replay link in the nav dropdown ────────────────────────────────
    // We add it after the dropdown is built by nav.js. nav.js runs
    // synchronously on DOMContentLoaded, so by the time this script
    // executes the menu already exists (we're injected after nav.js).
    function injectReplayLink() {
        var menu = document.querySelector('.nav-drop-menu');
        if (!menu) return;
        if (menu.querySelector('.dc-tour-replay')) return;
        var a = document.createElement('a');
        a.href = '#';
        a.className = 'dc-tour-replay';
        a.textContent = 'Replay tour';
        a.addEventListener('click', function (e) {
            e.preventDefault();
            // Close the dropdown if it's open.
            var drop = document.getElementById('nav-drop');
            if (drop) drop.classList.remove('open');
            replay();
        });
        menu.appendChild(a);
    }

    // Auto-boot. nav.js loads us only after the masthead exists, so we can
    // start immediately. If the document isn't ready yet (defensive), wait.
    function boot() {
        injectReplayLink();
        start();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
