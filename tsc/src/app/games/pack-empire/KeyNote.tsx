// A key to what's on screen (what a bar means, what's gold, what a ring is),
// shut until asked for. The how-to-play and the what-you-do-next stay out in the
// open; this is only for the reading of a table, which a phone doesn't need
// spelled out every visit.

export function KeyNote({
  label = 'Key',
  className,
  children,
}: {
  label?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <details className={`pe-keynote${className ? ` ${className}` : ''}`}>
      <summary>{label}</summary>
      <div className="pe-keynote-body">{children}</div>
    </details>
  )
}
