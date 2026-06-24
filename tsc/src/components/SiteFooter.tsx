// Shared footer used across every page. Holds the small jzFF credit.

export function SiteFooter() {
  return (
    <footer
      className="site-footer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '.4rem',
      }}
    >
      <span>
        <span className="site-footer-brand">The Sunday Chronicle · </span>
        <em>An almanac, kept faithfully.</em>
      </span>
      <span style={{ opacity: 0.55, fontSize: '.65rem', letterSpacing: '.18em' }}>
        <a href="/privacy" style={{ color: 'inherit', textDecoration: 'none' }}>Privacy</a>
        {' · '}
        <a href="/terms" style={{ color: 'inherit', textDecoration: 'none' }}>Terms</a>
      </span>
      <span style={{ opacity: 0.55, fontSize: '.55rem', letterSpacing: '.3em' }}>
        Built by <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>jzFF</em> · MMXXVI
      </span>
    </footer>
  )
}
