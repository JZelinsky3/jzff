import type { Metadata } from 'next'
import Link from 'next/link'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'

export const metadata: Metadata = {
  title: 'ESPN cookie grabber — The Sunday Chronicle',
  description:
    "One-click bookmarklet that reads your SWID and espn_s2 cookies from a logged-in fantasy.espn.com tab — no DevTools required.",
  alternates: { canonical: 'https://jzff.online/tools/espn-cookies/' },
  robots: { index: true, follow: true },
}

// The bookmarklet itself. Reads document.cookie on fantasy.espn.com, picks
// out SWID + espn_s2, copies them to the clipboard, and shows them in an
// alert so the user can verify before pasting. Wrapped in an IIFE so it
// runs without polluting the host page.
//
// Hard rules driving the shape of this code:
//   1. Single line — bookmarklets fail in some browsers if multi-line.
//   2. No external network calls. We don't want to look like a tracker.
//   3. Defensive about whether either cookie is present (user might not be
//      signed in, or might be on the wrong domain).
const BOOKMARKLET = `javascript:(function(){var c={};document.cookie.split('; ').forEach(function(p){var i=p.indexOf('=');if(i>0)c[p.slice(0,i)]=p.slice(i+1)});var s=c.SWID||'',e=c.espn_s2||'';if(!s||!e){alert('No ESPN cookies on this page.\\n\\nMake sure you are:\\n  1. On fantasy.espn.com\\n  2. Signed in to your league\\n\\nThen click the bookmarklet again.');return}var t='SWID: '+s+'\\n\\nespn_s2: '+decodeURIComponent(e);if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){alert(t+'\\n\\n✓ Copied to clipboard. Paste into The Sunday Chronicle.')},function(){prompt('Copy both lines:',t)})}else{prompt('Copy both lines:',t)}})();`

// The pretty version we show for transparency. Functionally equivalent.
const SOURCE = `(function () {
  var c = {};
  document.cookie.split('; ').forEach(function (p) {
    var i = p.indexOf('=');
    if (i > 0) c[p.slice(0, i)] = p.slice(i + 1);
  });
  var swid = c.SWID || '';
  var s2 = c.espn_s2 || '';
  if (!swid || !s2) {
    alert('No ESPN cookies on this page. Sign in to fantasy.espn.com first.');
    return;
  }
  var text = 'SWID: ' + swid + '\\n\\nespn_s2: ' + decodeURIComponent(s2);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(
      function () { alert(text + '\\n\\n✓ Copied to clipboard'); },
      function () { prompt('Copy both lines:', text); }
    );
  } else {
    prompt('Copy both lines:', text);
  }
})();`

export default function Page() {
  // React strips href="javascript:..." in production. We render the drag-link
  // via dangerouslySetInnerHTML to keep the URL intact. The bookmarklet only
  // executes when the user clicks it on a fantasy.espn.com tab, not on this
  // page (clicking here would try to read cookies for jzff.online — empty,
  // and the alert tells them so).
  const anchorStyle = [
    'display:inline-block',
    'padding:.85rem 1.4rem',
    'font-family:var(--serif)',
    'font-size:1.05rem',
    'color:var(--ink-deep,#1c1814)',
    'background:var(--gold)',
    'border:1px solid var(--gold)',
    'border-radius:2px',
    'text-decoration:none',
    'cursor:grab',
    'letter-spacing:.02em',
  ].join(';')
  const dragAnchor = `<a style="${anchorStyle}" href="${BOOKMARKLET.replace(/"/g, '&quot;')}" onclick="event.preventDefault(); alert('Drag this link onto your bookmarks bar — don\\'t click it here. It only works when run on fantasy.espn.com.'); return false;">★ Get ESPN cookies</a>`

  return (
    <main>
      <nav className="nav">
        <BackButton fallbackHref="/dashboard/" ariaLabel="Back" />
        <div className="nav-center">
          <div className="nav-kicker">Tool · ESPN private leagues</div>
          <div className="nav-title">The <em>Cookie Jar.</em></div>
        </div>
        <span className="dc-nav-icon" aria-hidden style={{ visibility: 'hidden' }} />
      </nav>

      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1.5rem' }}>
        <div className="hero-sup">★ One-click cookie grabber ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
          No DevTools. No <em>extensions.</em>
        </h1>
        <p className="hero-sub" style={{ maxWidth: '62ch', margin: '0 auto' }}>
          Drag the link below onto your bookmarks bar. When you&apos;re signed in
          to fantasy.espn.com, one click copies your <code>SWID</code> and
          <code> espn_s2</code> to the clipboard — ready to paste into a new
          league setup.
        </p>
      </section>

      <section className="section" style={{ maxWidth: '780px', margin: '0 auto' }}>
        <div className="dc-card-static" style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '1rem' }}>
            ★ Step 1 · Install
          </div>
          <p style={{ marginBottom: '1.25rem', opacity: 0.75 }}>
            <strong>Drag this link to your bookmarks bar:</strong>
          </p>
          <div
            style={{ display: 'inline-block', margin: '.5rem 0 1rem' }}
            dangerouslySetInnerHTML={{ __html: dragAnchor }}
          />
          <p style={{ opacity: 0.55, fontSize: '.78rem', marginTop: '1rem' }}>
            Don&apos;t see your bookmarks bar? Press <kbd>Cmd/Ctrl + Shift + B</kbd> to show it.
          </p>
        </div>

        <div className="dc-card-static" style={{ marginTop: '1.5rem' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '.5rem' }}>
            ★ Step 2 · Use
          </div>
          <ol style={{ paddingLeft: '1.4rem', lineHeight: 1.7, opacity: 0.85 }}>
            <li>Open <a href="https://fantasy.espn.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)' }}>fantasy.espn.com</a> in a desktop browser, signed in to your league.</li>
            <li>Click <strong>★ Get ESPN cookies</strong> in your bookmarks bar.</li>
            <li>Both values copy to your clipboard. Paste into The Sunday Chronicle when you add an ESPN league.</li>
          </ol>
        </div>

        <div className="dc-card-static" style={{ marginTop: '1.5rem' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '.5rem' }}>
            ★ On mobile
          </div>
          <p style={{ lineHeight: 1.7, opacity: 0.85, marginBottom: '.75rem' }}>
            Mobile browsers don&apos;t make it easy to install a bookmarklet from a
            drag gesture. The fastest path on mobile is still a desktop browser
            for the one-time setup. If you must do it on mobile:
          </p>
          <ul style={{ paddingLeft: '1.4rem', lineHeight: 1.7, opacity: 0.8, fontSize: '.92rem' }}>
            <li><strong>iOS Safari:</strong> bookmark any page, then edit the bookmark and replace its URL with the code below.</li>
            <li><strong>Android Chrome:</strong> same idea — create a bookmark, edit it, paste the code as the URL.</li>
          </ul>
          <p style={{ lineHeight: 1.7, opacity: 0.65, marginTop: '.75rem', fontSize: '.85rem' }}>
            After installing, visit <code>fantasy.espn.com</code> in the mobile browser
            (not the app), sign in, and tap the saved bookmark from your bookmarks list.
          </p>
        </div>

        <div className="dc-card-static" style={{ marginTop: '1.5rem' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '.5rem' }}>
            ★ What it does, in plain code
          </div>
          <p style={{ lineHeight: 1.7, opacity: 0.85, marginBottom: '.75rem' }}>
            We want you to trust this. No network calls, no third-party extension,
            no data leaves your browser. Here&apos;s the entire source — it reads
            two cookies and copies them:
          </p>
          <pre style={{
            background: 'var(--ink-soft, rgba(0,0,0,.25))',
            padding: '1rem',
            borderRadius: '2px',
            overflowX: 'auto',
            fontSize: '.78rem',
            lineHeight: 1.5,
            fontFamily: 'var(--mono)',
            color: 'var(--cream)',
            border: '1px solid var(--ink-line)',
          }}>
{SOURCE}
          </pre>
          <p style={{ lineHeight: 1.7, opacity: 0.65, marginTop: '.75rem', fontSize: '.85rem' }}>
            Browser cookies are domain-scoped — this can only ever read cookies for whichever
            site you&apos;re currently on. Running it anywhere except fantasy.espn.com gets
            nothing useful.
          </p>
        </div>

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <Link href="/dashboard/new/" className="dc-btn">
            Add an ESPN league →
          </Link>
          <div style={{ marginTop: '.6rem', opacity: 0.55, fontSize: '.8rem' }}>
            Already have one? Refresh cookies from the{' '}
            <Link href="/dashboard/" style={{ color: 'var(--gold)' }}>league&apos;s sources page</Link>.
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
