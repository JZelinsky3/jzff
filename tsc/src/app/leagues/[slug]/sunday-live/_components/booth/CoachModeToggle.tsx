'use client'

// Toggle button + label. Parent owns the boolean. Style mimics the SwearPill
// shape so it reads as a control, not a checkbox.

export function CoachModeToggle({
  on,
  onChange,
}: {
  on: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={`sl-ff-mono inline-flex items-center gap-2 rounded-sm border px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.22em] transition-colors ${
        on
          ? 'border-sl-ember bg-sl-ember/10 text-sl-ember'
          : 'border-sl-edge text-sl-mute hover:text-sl-cream'
      }`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${on ? 'bg-sl-ember' : 'border border-sl-edge'}`}
        aria-hidden
      />
      Coach mode
    </button>
  )
}
