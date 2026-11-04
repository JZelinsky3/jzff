'use client'

// One row of a setup (Versus, Mega Draft): a label, the switch, and optionally
// a line on the one picked (MatchSetup's card says it now, so it goes without).
// The format is a round pill; the cards under it are square tabs, so the two
// rows don't read as the same control twice.

export function SetupSwitch<T extends string>({
  label,
  options,
  value,
  onChange,
  line,
  square = false,
}: {
  label: string
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
  line?: string
  square?: boolean
}) {
  return (
    <div className="pe-setup-row">
      <span className="pe-setup-label">{label}</span>
      <div
        className={`pe-setup-seg${square ? ' pe-setup-seg--square' : ''}`}
        role="radiogroup"
        aria-label={label}
        style={{ '--n': options.length } as React.CSSProperties}
      >
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={o.id === value} onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      {line && <p className="pe-setup-line">{line}</p>}
    </div>
  )
}
