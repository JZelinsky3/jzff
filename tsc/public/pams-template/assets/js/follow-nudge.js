/* ───────────────────────────────────────────────────────────────────
   "Save this league" card, for people reading a league that isn't theirs.

   The almanac already has a bookmark star (left of the nav on the front
   page) and a sign-in round trip for guests (?bm_post=1, handled by
   wirePostSigninBookmark in nav.js and mobile-app.js). Almost nobody finds
   the star, so this card asks once, after the reader has shown interest:
   their third page in this league, or a second visit on another day.

   Rules:
     - never the commissioner, never someone who already bookmarked it,
       never the demo, never a locked page
     - once per league per browser: shown, dismissed or saved, it's done
     - waits for the tour, a sheet or a modal to close before it appears
     - guests go through the same /login round trip as the star, with
       bm_src=nudge added so the return can be counted

   Every step is logged to /api/bookmarks/nudge (migration 0077) for the
   funnel on /admin. Loaded by nav.js (desktop) and mobile-app.js (phone).
   ─────────────────────────────────────────────────────────────────── */
(function () {
    if (window.__DC_FOLLOW_NUDGE) return;
    window.__DC_FOLLOW_NUDGE = true;

    var dc = window.__DC || {};
    var slug = dc.slug;
    if (!slug || slug === 'demo' || dc.leagueTier === 'demo') return;
    if (dc.isCommish) return;

    var KEY = 'tsc-follow:' + slug;
    var VID_KEY = 'tsc_vid';

    function load() {
        try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return null; }
    }
    function save(st) {
        try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
    }
    function vid() {
        try {
            var v = localStorage.getItem(VID_KEY);
            if (!v) {
                v = window.crypto && crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2));
                localStorage.setItem(VID_KEY, v);
            }
            return v;
        } catch (e) { return null; }
    }
    function log(event) {
        var v = vid();
        if (!v) return;
        try {
            fetch('/api/bookmarks/nudge/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug: slug, vid: v, event: event }),
                keepalive: true,
            }).catch(function () {});
        } catch (e) {}
    }
    function today() {
        var d = new Date();
        return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    }
    function esc(s) {
        return String(s || '').replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    var st = load();
    // No storage (private mode, blocked): we couldn't keep the "once" promise,
    // so don't show it at all.
    if (!st) return;

    // ── Back from sign-in through the card ──
    // wirePostSigninBookmark has already added the bookmark (or is adding it);
    // record the conversion once the row exists, then retire the card.
    var url;
    try { url = new URL(window.location.href); } catch (e) { url = null; }
    if (url && url.searchParams.get('bm_src') === 'nudge') {
        url.searchParams.delete('bm_src');
        try { history.replaceState(history.state, '', url.toString()); } catch (e) {}
        st.x = 1;
        save(st);
        if (dc.isSignedIn) setTimeout(function () { log('bookmarked'); }, 2500);
        return;
    }

    if (dc.isBookmarked || dc.pageLocked) return;

    // Count this page, and the day, toward "interested".
    st.p = (st.p || 0) + 1;
    st.d = st.d || [];
    var t = today();
    if (st.d.indexOf(t) === -1) st.d = st.d.concat(t).slice(-2);
    save(st);
    if (st.s || st.x) return;
    if (st.p < 3 && st.d.length < 2) return;

    // ── Show it, once nothing else is on screen ──
    var BUSY = '.dc-tour-backdrop, .dc-tour-pop, .dc-bm-backdrop, dialog[open], .m-sheet[open]';
    var tries = 0;
    function attempt() {
        tries++;
        if (document.querySelector(BUSY)) {
            if (tries < 6) setTimeout(attempt, 5000);
            return;
        }
        show();
    }
    setTimeout(attempt, 6000);

    function show() {
        var cur = load();
        if (!cur || cur.s || cur.x) return;
        cur.s = 1;
        save(cur);

        var phone = !!document.querySelector('.m-tabbar');
        injectStyles();

        var here = window.location.pathname;
        var back = encodeURIComponent(here + '?bm_post=1&bm_src=nudge');
        var from = encodeURIComponent(here);
        var name = esc(dc.name || 'this league');

        var el = document.createElement('aside');
        el.className = 'dc-follow' + (phone ? ' dc-follow--phone' : '');
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'Save this league');
        el.innerHTML =
            '<button type="button" class="dc-follow-x" aria-label="No thanks">✕</button>' +
            '<div class="dc-follow-kicker"><span aria-hidden="true">★</span> Reading along?</div>' +
            '<div class="dc-follow-title">Save <em>' + name + '</em></div>' +
            '<p class="dc-follow-body">' +
                (dc.isSignedIn
                    ? 'Keep it in your library, one tap away every week.'
                    : 'Keep it in your library, one tap away every week. Free account, takes a few seconds.') +
            '</p>' +
            (dc.isSignedIn
                ? '<button type="button" class="dc-follow-cta" data-follow="save">Save this league</button>'
                : '<a class="dc-follow-cta" data-follow="go" href="/login?mode=signup&next=' + back + '&from=' + from + '">Create a free account</a>' +
                  '<a class="dc-follow-link" data-follow="go" href="/login?next=' + back + '&from=' + from + '">Have an account? Sign in</a>');
        document.body.appendChild(el);
        requestAnimationFrame(function () { el.classList.add('is-in'); });
        log('shown');

        function close() {
            el.classList.remove('is-in');
            setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 250);
        }
        function retire() {
            var s2 = load() || {};
            s2.x = 1;
            save(s2);
        }

        el.querySelector('.dc-follow-x').addEventListener('click', function () {
            retire();
            log('dismissed');
            close();
        });
        el.querySelectorAll('[data-follow="go"]').forEach(function (a) {
            a.addEventListener('click', function () { log('tapped'); });
        });
        var saveBtn = el.querySelector('[data-follow="save"]');
        if (saveBtn) {
            saveBtn.addEventListener('click', function () {
                if (saveBtn.disabled) return;
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving';
                log('tapped');
                fetch('/api/bookmarks/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slug: slug, action: 'add' }),
                }).then(function (r) {
                    if (!r.ok) throw new Error('bookmark failed');
                    retire();
                    log('bookmarked');
                    syncStar();
                    el.querySelector('.dc-follow-body').innerHTML =
                        'Saved. Find it any time in <a href="/dashboard">your library</a>.';
                    saveBtn.remove();
                    setTimeout(close, 4000);
                }).catch(function () {
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Try again';
                });
            });
        }
    }

    // Light the nav star and the menu row the same way their own toggles do.
    function syncStar() {
        var nav = document.getElementById('nav-bookmark-btn');
        if (nav) {
            nav.setAttribute('data-on', '1');
            nav.setAttribute('aria-label', 'Remove bookmark');
            nav.setAttribute('title', 'Remove bookmark');
        }
        var svg = document.getElementById('nav-bookmark-svg');
        if (svg) svg.setAttribute('fill', '#e8c889');
        var row = document.getElementById('dc-bookmark-toggle');
        if (row) {
            row.setAttribute('data-on', '1');
            row.textContent = 'Bookmarked ★';
        }
    }

    function injectStyles() {
        if (document.getElementById('dc-follow-style')) return;
        var css = document.createElement('style');
        css.id = 'dc-follow-style';
        css.textContent = [
            '.dc-follow {',
            '  position: fixed; z-index: 230;',
            '  right: calc(1.1rem + env(safe-area-inset-right));',
            '  bottom: calc(1.1rem + env(safe-area-inset-bottom));',
            '  width: 20rem; max-width: calc(100vw - 2.2rem);',
            '  padding: 1rem 1.1rem 1.05rem;',
            '  background: var(--ink-card, #0f1620);',
            '  color: var(--cream, #ecdfc7);',
            '  border: 1px solid var(--gold-deep, #b58a3c);',
            '  border-radius: 12px;',
            '  box-shadow: 0 18px 50px rgba(0,0,0,.55);',
            '  opacity: 0; transform: translateY(14px);',
            '  transition: opacity .22s ease, transform .22s ease;',
            '}',
            '.dc-follow.is-in { opacity: 1; transform: translateY(0); }',
            '.dc-follow--phone {',
            '  left: 12px; right: 12px; width: auto; max-width: none;',
            '  bottom: calc(var(--m-tab-h, 58px) + env(safe-area-inset-bottom) + 12px);',
            '}',
            '.dc-follow-x {',
            '  position: absolute; top: .45rem; right: .5rem;',
            '  width: 32px; height: 32px;',
            '  background: transparent; border: 0; border-radius: 8px;',
            '  color: var(--cream-mute, #968976); font-size: .85rem; cursor: pointer;',
            '}',
            '.dc-follow-x:hover { color: var(--cream, #ecdfc7); }',
            '.dc-follow-kicker {',
            '  font-family: var(--mono, "JetBrains Mono", monospace);',
            '  font-size: .58rem; letter-spacing: .2em; text-transform: uppercase;',
            '  color: var(--gold, #e8c889);',
            '}',
            '.dc-follow-title {',
            '  margin: .3rem 2rem .3rem 0;',
            '  font-family: var(--serif, "DM Serif Display", Georgia, serif);',
            '  font-size: 1.3rem; line-height: 1.15;',
            '}',
            '.dc-follow-title em { font-style: italic; color: var(--gold, #e8c889); }',
            '.dc-follow-body {',
            '  margin: 0 0 .85rem;',
            '  font-size: .84rem; line-height: 1.45;',
            '  color: var(--cream-soft, #d6c8ac);',
            '}',
            '.dc-follow-body a { color: var(--gold, #e8c889); }',
            '.dc-follow-cta {',
            '  display: block; width: 100%; box-sizing: border-box;',
            '  padding: .75rem 1rem;',
            '  border: 1px solid var(--gold, #e8c889); border-radius: 999px;',
            '  background: var(--gold, #e8c889); color: var(--ink, #06090e);',
            '  font-family: var(--mono, "JetBrains Mono", monospace); font-weight: 700;',
            '  font-size: .64rem; letter-spacing: .18em; text-transform: uppercase;',
            '  text-align: center; text-decoration: none; cursor: pointer;',
            '}',
            '.dc-follow-cta:disabled { opacity: .6; cursor: default; }',
            '.dc-follow-link {',
            '  display: block; margin-top: .6rem; text-align: center;',
            '  font-family: var(--mono, "JetBrains Mono", monospace);',
            '  font-size: .6rem; letter-spacing: .14em; text-transform: uppercase;',
            '  color: var(--cream-soft, #d6c8ac);',
            '  text-decoration: underline; text-underline-offset: 3px;',
            '}',
            '.dc-follow-link:hover { color: var(--gold, #e8c889); }',
            '@media (prefers-reduced-motion: reduce) { .dc-follow { transition: none; transform: none; } }',
        ].join('\n');
        document.head.appendChild(css);
    }
})();
