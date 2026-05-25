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
      <span>The Sunday Chronicle · <em>An almanac, kept faithfully.</em></span>
      <span style={{ opacity: 0.55, fontSize: '.55rem', letterSpacing: '.3em' }}>
        Built by <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>jzFF</em> · MMXXVI
      </span>
    </footer>
  )
}
