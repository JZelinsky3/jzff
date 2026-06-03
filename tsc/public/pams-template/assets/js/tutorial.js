/**
 * Onboarding tour for the public almanac (/leagues/<slug>/...).
 *
 * Behavior:
 *   • Each chapter page (hub, standings, managers, seasons, drafts, records,
 *     rivalries, live-season) has its own self-contained mini-tour that runs
 *     ONCE per user, the first time they land on that page. The tour never
 *     navigates the user — they explore at their own pace, and the next
 *     page's tour fires the next time they land there.
 *   • Per-page completion is tracked in `seenPages`. Hitting "✕" or
 *     "Skip tour" sets a global `dismissed` flag that suppresses every page
 *     from then on. Finishing a page's tour just marks that page seen.
 *   • Targeted steps blur EVERYTHING except the spotlighted element (4-pane
 *     backdrop). Centered intro/outro steps use a single full-screen blur.
 *   • Click backdrop / Next arrow / → / Enter / Space → advance.
 *   • Back arrow / ← → previous step within the current page's tour.
 *
 * Persistence:
 *   • Signed-in users:    user_metadata.tutorials.{leagues, leagues_seen}.
 *                         Set via POST /api/me/tutorial/ and read back via
 *                         window.__DC.tutorialDismissed / tutorialSeenPages.
 *   • Anonymous viewers:  localStorage 'dc-tour-leagues' = 'dismissed' and
 *                         'dc-tour-leagues-seen' = JSON page array.
 *
 * Loaded by nav.js (which appends a <script> tag after the masthead is
 * built). Every templated page picks the tour up automatically.
 *
 * Devtools shortcuts:  __DC_TUTORIAL.replay()  / __DC_TUTORIAL.start()
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'dc-tour-leagues';            // 'dismissed' | absent
    var SEEN_KEY    = 'dc-tour-leagues-seen';       // JSON array of page keys

    // ── Step library — keyed by data-page value ─────────────────────────
    // Each entry is an array of steps that play in order. The engine plays
    // exactly one page's array per visit; reaching the end of an array
    // marks that page as seen and closes the tour. No cross-page navigation.
    //
    // Step fields:
    //   target    : CSS selector to point at. Omit for a centered modal step.
    //   title     : short header line.
    //   body      : 1–2 sentences. Keep tight.
    //   placement : 'top' | 'bottom' | 'left' | 'right' | 'center'.
    //               Auto-picks the side with the most room if omitted.
    var STEPS_BY_PAGE = {
        // ─────────── HUB / index.html ───────────
        hub: [
            {
                placement: 'center',
                title: 'Welcome to your league chronicle.',
                body: "This is your league's public almanac — every champion, record, and rivalry, kept in the books. Quick tour of the hub: tap Next or click anywhere.",
            },
            {
                target: '#site-nav', placement: 'bottom',
                title: 'The masthead.',
                body: "Every page has it. The title takes you home; the ▦ icon (top-right) opens the menu for your account, bookmarks, and admin links.",
            },
            {
                target: '#nav-chapbar', placement: 'bottom',
                title: 'Chapter bar — your main navigation.',
                body: "Standings, Managers, Seasons, Drafts, Records, Rivalries, Live. Click any chapter to jump there — a quick guide will pop up the first time you land on each.",
            },
            {
                target: '#nav-drop', placement: 'bottom', align: 'end',
                title: 'Menu (▦).',
                body: "Sign in, bookmark this league, jump back to your library, or — if you're the commissioner — manage the league. Always here, top-right.",
            },
            {
                target: '.hero', placement: 'bottom',
                title: "Hero — your league's headline.",
                body: "Name, the years it's been running, the editorial subtitle. Sets the tone for the rest of the volume.",
            },
            {
                target: '#hero-stat', placement: 'top',
                title: 'Benchmarks (§ 01).',
                body: "The biggest single-game scores in league history and the records that own them. The trio below it shows other record-holders to know.",
            },
            {
                target: '#dc-hall-row', placement: 'top',
                title: 'Hall of Champions (§ 03).',
                body: "Every champion this league has crowned. Scroll horizontally — each banner links to that season's writeup.",
            },
            {
                target: '#dc-leaders-section', placement: 'top',
                title: 'Career leaders (§ 04).',
                body: "Top-3 per category — points, wins, playoff appearances. Use the arrows to flip through the leaderboards.",
            },
            {
                target: '#dc-reel-row', placement: 'top',
                title: 'Spotlight + Clippings (§ 05).',
                body: "A featured manager each week, plus a fresh clipping from the press room. Spotlight links straight to that manager's profile.",
            },
            {
                target: '#dc-trackboard', placement: 'left',
                title: 'Trackboard (right rail).',
                body: "Live updates during the season — news, players on watch, risers, odds. Click the rail to expand it, or the ✕ to collapse.",
            },
            {
                placement: 'center',
                title: 'Hub tour complete.',
                body: "Click around — when you open Standings, Managers, or any other chapter for the first time, a quick guide will pop up there too. Re-open this tour anytime from the menu → Replay tour.",
                isFinal: true,
            },
        ],

        // ─────────── STANDINGS ───────────
        standings: [
            {
                placement: 'center',
                title: 'Chapter I · Standings.',
                body: "Where the current season lives — who's ahead, who's chasing, and who's on the bubble.",
            },
            {
                target: '#standings-container', placement: 'top',
                title: 'The table.',
                body: "Record, points for/against, streak, and playoff seed. Column headers tell you what's what; the league average row anchors the field.",
            },
            {
                target: '#nav-chapbar', placement: 'bottom',
                title: 'Jump anywhere.',
                body: "Use the chapter bar to keep exploring — Managers, Seasons, Records, the works.",
                isFinal: true,
            },
        ],

        // ─────────── MANAGERS ───────────
        managers: [
            {
                placement: 'center',
                title: 'Chapter II · The society.',
                body: "Every manager who has ever played in this league — past and present.",
            },
            {
                target: '#managers-grid', placement: 'top',
                title: 'The roster of owners.',
                body: "Click any card to open that manager's full profile — career record, championships, signature seasons, head-to-head ledger.",
                isFinal: true,
            },
        ],

        // ─────────── SEASONS ───────────
        seasons: [
            {
                placement: 'center',
                title: 'Chapter III · Season archives.',
                body: "The chronicle, volume by volume — every season your league has logged.",
            },
            {
                target: '#chronicle-container', placement: 'top',
                title: 'Pick a volume.',
                body: "Newest first. Each card opens that year's full recap — schedule, standings, playoffs, the champion's run, the bracket.",
                isFinal: true,
            },
        ],

        // ─────────── DRAFTS ───────────
        draft: [
            {
                placement: 'center',
                title: 'Chapter IV · Drafts.',
                body: "Every draft board your league has run — and the analytics behind them.",
            },
            {
                target: '#sec-board', placement: 'top',
                title: 'The board.',
                body: "Round by round — picks, positions, who reached, who waited. Use the year tabs to flip drafts.",
            },
            {
                target: '#sec-dna', placement: 'top',
                title: 'Draft DNA.',
                body: "Each manager's drafting personality: positional tendencies, favored archetypes, value calls vs. reaches. Scroll for the rest of the analytics.",
                isFinal: true,
            },
        ],

        // ─────────── RECORDS ───────────
        records: [
            {
                placement: 'center',
                title: 'Chapter V · The record book.',
                body: "Every record worth holding — and who currently owns it.",
            },
            {
                target: 'main', placement: 'top',
                title: 'The book.',
                body: "Highest score, biggest blowout, longest streak, most points in a season. Records held by the current season are flagged so you know who's chasing what.",
                isFinal: true,
            },
        ],

        // ─────────── RIVALRIES ───────────
        rivalries: [
            {
                placement: 'center',
                title: 'Chapter VI · Rivalries.',
                body: "Head-to-head histories between every pair of managers — the grudge matches and the lopsided series.",
            },
            {
                target: '#rv-grid', placement: 'top',
                title: 'Pick a feud.',
                body: "Open one to see the full series — every matchup, every margin, the running scoreline, the playoff knockouts.",
                isFinal: true,
            },
        ],

        // ─────────── LIVE-SEASON HUB ───────────
        'live-season': [
            {
                placement: 'center',
                title: 'Chapter VII · In season.',
                body: "Tools that run while the season is live — previews, picks, rankings, watch lists, trade grades.",
            },
            {
                target: '#site-nav', placement: 'bottom',
                title: 'Live tools menu.',
                body: "Open the menu (▦) to jump between Matchup Preview, Pick'ems, Power Rankings, Records Watch, Milestones, and the Trade Grader.",
                isFinal: true,
            },
        ],
    };

    // ── Persistence ─────────────────────────────────────────────────────
    function dcCtx() { return window.__DC || {}; }

    // Global dismissal: kills every page tour from now on. Signed-in users'
    // value comes from window.__DC.tutorialDismissed (injected server-side
    // from user_metadata); everyone else falls back to localStorage.
    function isDismissed() {
        if (dcCtx().isSignedIn) return !!dcCtx().tutorialDismissed;
        try { return localStorage.getItem(STORAGE_KEY) === 'dismissed'; }
        catch (_) { return false; }
    }

    // Per-page completion list. Same dual-source pattern as isDismissed.
    function readSeenPages() {
        var fromServer = dcCtx().tutorialSeenPages;
        if (Array.isArray(fromServer)) return fromServer.slice();
        try {
            var raw = localStorage.getItem(SEEN_KEY);
            if (!raw) return [];
            var parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) { return []; }
    }
    function isPageSeen(page) { return readSeenPages().indexOf(page) !== -1; }

    function markPageSeen(page) {
        // Local cache first so a second tab doesn't bounce the popover back
        // open while the server round-trips.
        var seen = readSeenPages();
        if (seen.indexOf(page) === -1) seen.push(page);
        try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (_) {}
        if (dcCtx().isSignedIn) {
            // Mirror to user_metadata so the next device sees the same state.
            // Also update the in-memory copy so a same-session replay sees it.
            if (window.__DC) window.__DC.tutorialSeenPages = seen;
            fetch('/api/me/tutorial/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'seen', key: 'leagues', page: page }),
                credentials: 'same-origin',
            }).catch(function () {});
        }
    }

    function persistDismiss() {
        try { localStorage.setItem(STORAGE_KEY, 'dismissed'); } catch (_) {}
        if (dcCtx().isSignedIn) {
            if (window.__DC) window.__DC.tutorialDismissed = true;
            fetch('/api/me/tutorial/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'dismiss', key: 'leagues' }),
                credentials: 'same-origin',
            }).catch(function () {});
        }
    }

    function persistReset() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
        try { localStorage.removeItem(SEEN_KEY); } catch (_) {}
        if (window.__DC) {
            window.__DC.tutorialDismissed = false;
            window.__DC.tutorialSeenPages = [];
        }
        if (dcCtx().isSignedIn) {
            fetch('/api/me/tutorial/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reset', key: 'leagues' }),
                credentials: 'same-origin',
            }).catch(function () {});
        }
    }

    // ── DOM helpers ─────────────────────────────────────────────────────
    function currentPageKey() {
        var nav = document.getElementById('site-nav');
        return (nav && nav.dataset && nav.dataset.page) || '';
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
            // Gold halo around the spotlighted element.
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
            '.dc-tour-nav { display: inline-flex; align-items: stretch; gap: .45rem; }',
            // Back matches Next's vertical metrics by sharing its padding +
            // line-height, plus `align-items: stretch` on .dc-tour-nav lets
            // both buttons grow to the same height. The aspect-ratio keeps
            // the circle shape regardless of the resulting size — no more
            // back-button-sits-slightly-higher-than-next look.
            '.dc-tour-back {',
            '  background: transparent; color: #c9c0ad;',
            '  border: 1px solid rgba(232,200,137,.4); border-radius: 999px;',
            '  padding: .55rem; aspect-ratio: 1 / 1;',
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
            '@media (max-width: 560px) {',
            '  .dc-tour-pop { left: 12px !important; right: 12px !important; top: auto !important; bottom: 12px !important; max-width: none; }',
            '  .dc-tour-pop::after { display: none !important; }',
            '  .dc-tour-pop.is-center { top: 50% !important; bottom: auto !important; transform: translate(-50%, -50%); left: 50% !important; right: auto !important; }',
            '}',
            '.nav-drop-menu a.dc-tour-replay { color: #c9c0ad; }',
            '.nav-drop-menu a.dc-tour-replay:hover { color: #e8c889; }',
        ].join('\n');
        document.head.appendChild(s);
    }

    // ── Step engine ─────────────────────────────────────────────────────
    var state = {
        steps: [],          // current page's array of steps
        page: '',           // data-page value the steps belong to
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
        state.steps = [];
        state.idx = -1;
    }

    function close(opts) {
        // `dismissed: true` → user explicitly closed (Skip/×/Esc) → set the
        // global dismiss flag so no future page tour fires.
        // `dismissed: false` (or omitted) → user finished this page's tour
        // → just mark this page as seen and tear down.
        var dismissed = !!(opts && opts.dismissed);
        var page = state.page;
        destroyTour();
        if (dismissed) {
            persistDismiss();
        } else if (page) {
            markPageSeen(page);
        }
    }

    function advance() {
        var next = state.idx + 1;
        if (next >= state.steps.length) { close({ dismissed: false }); return; }
        renderStep(next);
    }

    function goBack() {
        if (state.idx <= 0) return;
        renderStep(state.idx - 1);
    }

    function renderStep(idx) {
        var step = state.steps[idx];
        if (!step) { close({ dismissed: false }); return; }
        state.idx = idx;

        // Skip targeted steps whose target isn't actually visible right now —
        // e.g. JS-populated sections that haven't filled in yet, or the
        // trackboard that stays hidden until live data lands.
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

        // Targeted steps use 4 surrounding panes (target stays crisp).
        // Centered steps use a single full-screen backdrop.
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

        if (state.popoverEl) state.popoverEl.remove();
        if (state.spotEl) { state.spotEl.remove(); state.spotEl = null; }

        var pop = document.createElement('div');
        pop.className = 'dc-tour-pop';
        var totalCount = state.steps.length;
        var stepNum = idx + 1;
        var canGoBack = idx > 0;
        pop.innerHTML =
            '<div class="dc-tour-kicker">' +
              '<span>★ ' + stepNum + ' / ' + totalCount + '</span>' +
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
                  (step.isFinal ? 'Got it' : 'Next') +
                  ' <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 1 9 7 3 13"/></svg>' +
                '</button>' +
              '</div>' +
            '</div>';
        pop.querySelector('.dc-tour-title').textContent = step.title || '';
        pop.querySelector('.dc-tour-body').textContent = step.body || '';
        pop.addEventListener('click', function (e) { e.stopPropagation(); });
        pop.querySelector('.dc-tour-next').addEventListener('click', function () { advance(); });
        pop.querySelector('.dc-tour-back').addEventListener('click', function () { if (canGoBack) goBack(); });
        // Skip and Close BOTH dismiss globally — that matches the user's
        // expectation that "closing the tour" means "don't show me this on
        // any other page either."
        pop.querySelector('.dc-tour-skip').addEventListener('click', function () { close({ dismissed: true }); });
        pop.querySelector('.dc-tour-close').addEventListener('click', function () { close({ dismissed: true }); });
        document.body.appendChild(pop);
        state.popoverEl = pop;

        if (!targetEl || step.placement === 'center') {
            pop.classList.add('is-center');
        } else {
            try { targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); }
            catch (_) { targetEl.scrollIntoView(); }

            var spot = document.createElement('div');
            spot.className = 'dc-tour-spot';
            document.body.appendChild(spot);
            state.spotEl = spot;

            positionPopover(pop, spot, targetEl, step);
        }

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
        var pad = 6;
        spot.style.top    = (rect.top    - pad) + 'px';
        spot.style.left   = (rect.left   - pad) + 'px';
        spot.style.width  = (rect.width  + pad * 2) + 'px';
        spot.style.height = (rect.height + pad * 2) + 'px';
        positionPanes(rect, pad);

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
        } else {
            top  = rect.top + rect.height / 2 - popRect.height / 2;
            left = rect.right + gutter;
        }

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
        // Bail unless we have a tour for this page, the user hasn't globally
        // dismissed, and they haven't already finished this page's tour.
        // `opts.replay` overrides all three gates.
        var replay = !!(opts && opts.replay);
        var page = currentPageKey();
        var steps = STEPS_BY_PAGE[page];
        if (!steps || !steps.length) return;
        if (!replay && isDismissed()) return;
        if (!replay && isPageSeen(page)) return;

        state.steps = steps;
        state.page = page;
        renderStep(0);
    }

    function replay() {
        // Reset everything (dismissal + per-page seen list) and start the
        // current page's tour. The next time the user lands on another
        // chapter, that page's tour will fire too — same as a fresh user.
        persistReset();
        start({ replay: true });
    }

    window.__DC_TUTORIAL = { start: start, replay: replay, close: function () { close({ dismissed: true }); } };

    // ── Replay link in the nav dropdown ────────────────────────────────
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
            var drop = document.getElementById('nav-drop');
            if (drop) drop.classList.remove('open');
            replay();
        });
        menu.appendChild(a);
    }

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
